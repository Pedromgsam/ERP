'use strict';
// ═══════════════════════════════════════════════════════════════════
// CRM — do primeiro contato ao contrato assinado, sem serviço pago.
// Funil (arrastar muda a etapa) · Lista com total ponderado · Painel ·
// Ficha da oportunidade (atividades, propostas, documentos) ·
// "Ganhou" cria cliente, contrato, parcelas e o fluxo de onboarding.
// ═══════════════════════════════════════════════════════════════════
const ORIGENS_CRM = ['Indicação de cliente', 'Contador parceiro', 'Site / Google', 'Instagram / redes', 'Evento / palestra', 'Cliente atual (novo serviço)', 'Outro'];
const TIPOS_HON = [['', '—'], ['fixo', 'Fixo'], ['mensal', 'Mensal'], ['exito', 'Êxito'], ['misto', 'Fixo + êxito']];
const TIPOS_ATIV = [['ligacao', 'Ligação'], ['reuniao', 'Reunião'], ['whatsapp', 'WhatsApp'], ['email', 'E-mail'], ['anotacao', 'Anotação']];

function nomeOp(o) { return (o.cliente_id && nomeCliente(o.cliente_id)) || o.prospecto_empresa || o.prospecto_nome || '—'; }
function diasParado(o) { return Math.max(0, Math.floor((Date.now() - new Date(o.etapa_desde)) / 86400000)); }
function etapaDe(id) { return (E._crmEtapas || []).find((e) => e.id === id) || {}; }
function opAberta(o) { return !etapaDe(o.etapa_id).final; }

TELAS.crm = async function () {
  E.crm = E.crm || { vista: 'funil', resp: '', origem: '', busca: '', aba: 'andamento' };
  E.crm.aba = E.crm.aba || 'andamento';
  const F = E.crm;
  await carregarCadastros();
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>CRM</h1><p>Oportunidades, propostas e o caminho até o contrato assinado</p></div>' +
    '<div class="acoes"><button class="btn btn-o" id="cr-etapas" title="Prazo de cada etapa (depois dele vira tarefa) e o que cada uma significa">⚙ Etapas</button><button class="btn btn-o" id="cr-modelos">Modelos de proposta</button>' +
    '<button class="btn btn-o" id="cr-rapido" title="Só nome, telefone e interesse">⚡ Cadastro rápido</button><button class="btn btn-p" id="cr-nova">+ Nova oportunidade</button></div></div>' +
    // abas: no painel ficam só as oportunidades em andamento; ganhas (contrato assinado) e perdidas (cancelado) têm aba própria
    '<div class="abas" id="cr-abas">' + [['andamento', 'Em andamento'], ['ganho', '✍ Contratos assinados'], ['perdido', '✗ Leads perdidos']]
      .map(([v, r]) => '<button data-aba="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<div class="filtros"><div class="segmento" id="cr-vista">' + [['funil', 'Funil'], ['lista', 'Lista'], ['painel', 'Painel']].map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<select class="busca sel" id="cr-resp"><option value="">Todos os responsáveis</option>' + Object.keys(PESSOA).map((p) => '<option>' + p + '</option>').join('') + '</select>' +
    '<select class="busca sel" id="cr-origem"><option value="">Todas as origens</option>' + ORIGENS_CRM.map((o) => '<option>' + esc(o) + '</option>').join('') + '</select>' +
    '<input class="busca" id="cr-busca" placeholder="Buscar nome, empresa, CNPJ ou telefone" autocomplete="off"></div>' +
    '<div id="cr-corpo"><div class="carregando">Carregando…</div></div>';
  $('cr-nova').onclick = () => formOportunidade({}, recarregarCrm);
  $('cr-modelos').onclick = () => janelaModelosProposta();
  $('cr-rapido').onclick = () => cadastroRapido();
  $('cr-etapas').onclick = () => janelaEtapasCrm();
  $('cr-vista').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.vista = b.dataset.v; pintarCrm(); } };
  $('cr-abas').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.aba = b.dataset.aba; pintarCrm(); } };
  [['cr-resp', 'resp'], ['cr-origem', 'origem']].forEach(([id, k]) => { $(id).value = F[k]; $(id).onchange = (ev) => { F[k] = ev.target.value; pintarCrm(); }; });
  $('cr-busca').value = F.busca;
  let t; $('cr-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarCrm(); }, 250); };
  await recarregarCrm(true);
};
async function recarregarCrm(soDados) {
  const [et, ops] = await Promise.all([q(sb.from('crm_etapas').select('*').order('ordem')), buscarTodos(() => sb.from('crm_oportunidades').select('*').order('criado_em', { ascending: false }))]);
  E._crmEtapas = et; E._crmOps = ops;
  if (soDados !== false) pintarCrm();
}
function filtrarOps() {
  const F = E.crm, b = normalizar(F.busca);
  return (E._crmOps || []).filter((o) => (!F.resp || o.responsavel === F.resp) && (!F.origem || o.origem === F.origem) &&
    (!b || normalizar([o.titulo, nomeOp(o), o.prospecto_nome, o.prospecto_empresa, o.prospecto_email, o.indicado_por].join(' ')).includes(b) ||
      (soDigitos(F.busca).length >= 4 && (soDigitos(o.prospecto_doc).includes(soDigitos(F.busca)) || soDigitos(o.prospecto_telefone).includes(soDigitos(F.busca))))));
}
function pintarCrm() {
  if (!$('cr-corpo')) return;
  const F = E.crm;
  document.querySelectorAll('#cr-abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === F.aba));
  document.querySelectorAll('#cr-vista button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === F.vista));
  if ($('cr-vista')) $('cr-vista').hidden = F.aba !== 'andamento';
  if (F.aba !== 'andamento') return crmFinalizadas($('cr-corpo'), F.aba);
  ({ funil: crmFunil, lista: crmLista, painel: crmPainel })[F.vista]($('cr-corpo'));
}
// Ganhos (contrato assinado) e Perdidos (não fechou): lista própria, fora do painel do dia a dia
function crmFinalizadas(alvo, tipo) {
  const ops = filtrarOps().filter((o) => etapaDe(o.etapa_id).final === tipo)
    .sort((a, b) => String(b.assinado_em || b.ganho_em || b.perdido_em || b.atualizado_em).localeCompare(String(a.assinado_em || a.ganho_em || a.perdido_em || a.atualizado_em)));
  alvo.innerHTML = '<div class="dica" style="margin-bottom:12px">' + (tipo === 'ganho'
      ? '<b>Contrato assinado</b> = o cliente assinou. Antes disso ele passa por <b>Contrato fechado</b> (disse sim: o sistema já criou cadastro, contrato e onboarding) e <b>Aguardando assinatura</b>.'
      : '<b>Lead perdido</b> = não fechou (preço, prazo, foi para concorrente, desistiu, sem retorno…). O motivo alimenta o relatório de perdas no Painel.') + '</div>' +
    '<div class="card">' + (ops.length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Oportunidade</th><th data-tipo="num">Valor</th><th>Responsável</th><th data-tipo="data">' +
      (tipo === 'ganho' ? 'Assinado em' : 'Perdido em') + '</th>' + (tipo === 'perdido' ? '<th>Motivo</th>' : '<th>Área do serviço</th>') + '</tr></thead><tbody>' +
      ops.map((o) => { const d = o.assinado_em || o.ganho_em || o.perdido_em || o.atualizado_em; return '<tr class="clicavel" data-op="' + o.id + '"><td><b>' + esc(o.titulo) + '</b><div class="sub">' + esc(nomeOp(o)) + '</div></td>' +
        '<td class="num mono" data-ord="' + (o.valor_estimado || 0) + '">' + brl(o.valor_estimado) + '</td><td>' + pillPessoa(o.responsavel) + '</td>' +
        '<td class="mono" data-ord="' + esc(d || '') + '">' + dataBR(d) + '</td><td>' + esc((tipo === 'perdido' ? o.motivo_perda : o.servico) || '—') + '</td></tr>'; }).join('') +
      '</tbody></table></div>' : vazio(tipo === 'ganho' ? 'Nenhum contrato assinado ainda.' : 'Nenhum lead perdido.')) + '</div>';
  alvo.querySelectorAll('[data-op]').forEach((tr) => tr.onclick = () => fichaOportunidade(tr.dataset.op));
}

// ── Funil (kanban) em duas linhas: prospecção em cima; negociação, contrato e o fim embaixo ──
function telOp(o) { return soDigitos(o.prospecto_telefone || (o.cliente_id && (E.clientes.find((c) => c.id === o.cliente_id) || {}).telefone) || ''); }
function mailOp(o) { return o.prospecto_email || (o.cliente_id && (E.clientes.find((c) => c.id === o.cliente_id) || {}).email) || ''; }
function linkWa(tel, texto) { return 'https://wa.me/' + (tel.length <= 11 ? '55' : '') + tel + (texto ? '?text=' + encodeURIComponent(texto) : ''); }
function cartaoOp(o, e, h) {
  const atr = o.proxima_acao_em && o.proxima_acao_em < h, tel = telOp(o), mail = mailOp(o);
  const parado = e.dias_alerta != null && diasParado(o) > e.dias_alerta;
  return '<div class="cr-card' + (atr ? ' cr-atrasada' : '') + '" draggable="true" data-op="' + o.id + '"><b>' + esc(o.titulo) + '</b><div class="sub">' + esc(nomeOp(o)) + (o.servico ? ' · ' + esc(o.servico) : '') + '</div>' +
    '<div class="cr-card-rod"><span class="mono">' + brl(o.valor_estimado) + '</span><span class="sub' + (parado ? ' texto-vermelho' : '') + '" title="dias nesta etapa' + (e.dias_alerta != null ? ' (prazo: ' + e.dias_alerta + ')' : '') + '">' + diasParado(o) + 'd na etapa</span></div>' +
    (o.proxima_acao ? '<div class="cr-prox' + (atr ? ' atrasada' : '') + '">→ ' + esc(o.proxima_acao) + (o.proxima_acao_em ? ' · ' + dataBR(o.proxima_acao_em) : '') + '</div>' : '<div class="cr-prox cr-sem-prox">sem próximo passo</div>') +
    '<div class="cr-card-at">' + (o.responsavel ? pillPessoa(o.responsavel) : '<span></span>') + '<span class="cr-atalhos">' +
      (tel ? '<a class="cr-at" href="' + linkWa(tel) + '" target="_blank" rel="noopener" title="WhatsApp" aria-label="WhatsApp">💬</a>' : '') +
      (mail ? '<a class="cr-at" href="mailto:' + esc(mail) + '" title="E-mail" aria-label="E-mail">✉</a>' : '') +
      '<button type="button" class="cr-at" data-ligacao="' + o.id + '" title="Registrar ligação (1 clique)" aria-label="Registrar ligação">📞</button>' +
      '<button type="button" class="cr-at cr-avancar" data-avancar="' + o.id + '" title="Avançar para a próxima etapa" aria-label="Avançar etapa">▸</button></span></div></div>';
}
function colunaCrm(e, ops, h) {
  const cs = e.final ? [] : ops.filter((o) => o.etapa_id === e.id);
  return '<div class="cr-col' + (e.final ? ' cr-final-' + e.final : '') + '" data-etapa="' + e.id + '" title="' + esc(e.descricao || '') + '"><div class="cr-col-tit"><span>' + esc(e.nome) + '</span><span class="sub">' +
    (e.final ? '' : cs.length + (cs.length ? ' · ' + esc(brlCurto(soma(cs, (o) => o.valor_estimado))) : '')) + '</span></div>' +
    (e.final ? '<div class="cr-solte">' + (e.final === 'ganho' ? 'Solte aqui quando o cliente <b>assinar</b> o contrato.<br><span class="sub">Vai para a aba "Contratos assinados".</span>' : 'Solte aqui quando <b>não fechar</b>.<br><span class="sub">Vai para a aba "Leads perdidos".</span>') + '</div>' : '') +
    cs.map((o) => cartaoOp(o, e, h)).join('') + (!e.final && !cs.length ? '<div class="cr-vazia">—</div>' : '') + '</div>';
}
function crmFunil(alvo) {
  const ops = filtrarOps(), h = hojeISO(), et = E._crmEtapas || [];
  const cima = et.filter((e) => !e.final && e.ordem <= 4), baixo = et.filter((e) => e.final || e.ordem > 4);
  alvo.innerHTML = '<div class="cr-linha" style="--n:' + cima.length + '">' + cima.map((e) => colunaCrm(e, ops, h)).join('') + '</div>' +
    '<div class="cr-linha" style="--n:' + baixo.length + '">' + baixo.map((e) => colunaCrm(e, ops, h)).join('') + '</div>' +
    '<p class="sub" style="margin-top:8px">Arraste o cartão para mudar a etapa (no celular, use ▸). <b>Contrato fechado</b> = o cliente disse sim (o sistema cria cadastro, contrato e onboarding); ' +
    '<b>Contrato assinado</b> e <b>Lead perdido</b> saem do painel e ficam nas abas. Passe o mouse no nome da etapa para ver o que ela significa.</p>';
  let arrastando = null;
  alvo.querySelectorAll('.cr-card').forEach((c) => {
    c.addEventListener('dragstart', (ev) => { arrastando = c.dataset.op; ev.dataTransfer.setData('text/plain', c.dataset.op); c.classList.add('arrastando'); });
    c.addEventListener('dragend', () => c.classList.remove('arrastando'));
    c.onclick = (ev) => { if (ev.target.closest('a, button')) return; fichaOportunidade(c.dataset.op); };
  });
  alvo.querySelectorAll('[data-ligacao]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const o = E._crmOps.find((x) => x.id === b.dataset.ligacao);
    await q(sb.from('crm_atividades').insert({ oportunidade_id: o.id, tipo: 'ligacao', resumo: 'Ligação registrada' }));
    if (o.cliente_id) await q(sb.from('interacoes').insert({ cliente_id: o.cliente_id, tipo: 'ligacao', resumo: '[CRM] Ligação registrada — ' + o.titulo })).catch(() => {});
    aviso('✓ Ligação registrada em "' + o.titulo + '". Para detalhar, abra o cartão → Atividades.');
  }));
  alvo.querySelectorAll('[data-avancar]').forEach((b) => b.onclick = () => {
    const o = E._crmOps.find((x) => x.id === b.dataset.avancar), abertas = (E._crmEtapas || []).filter((e) => !e.final);
    const i = abertas.findIndex((e) => e.id === o.etapa_id), prox = abertas[i + 1] || (E._crmEtapas || []).find((e) => e.final === 'ganho');
    if (prox) moverOp(o.id, prox.id);
  });
  alvo.querySelectorAll('.cr-col').forEach((col) => {
    col.addEventListener('dragover', (ev) => { ev.preventDefault(); col.classList.add('sobre'); });
    col.addEventListener('dragleave', () => col.classList.remove('sobre'));
    col.addEventListener('drop', (ev) => { ev.preventDefault(); col.classList.remove('sobre'); moverOp(ev.dataTransfer.getData('text/plain') || arrastando, col.dataset.etapa); });
  });
}
async function moverOp(opId, etapaId) {
  const o = E._crmOps.find((x) => x.id === opId), e = etapaDe(etapaId);
  if (!o || o.etapa_id === etapaId) return;
  if (e.final === 'perdido') return janelaPerder(o);
  // "Contrato fechado" (ou pular direto para assinado) sem ter fechado ainda: primeiro cria cadastro e contrato
  if (!o.ganho_em && (e.nome === 'Contrato fechado' || e.final === 'ganho' || e.ordem > etapaFechado().ordem)) return janelaGanhar(o, null, e.final === 'ganho' || e.nome !== 'Contrato fechado' ? etapaId : null);
  comBotao(null, async () => {
    const d = { etapa_id: etapaId, probabilidade: e.probabilidade, perdido_em: null };
    if (!e.final && e.ordem < etapaFechado().ordem) d.ganho_em = null;
    await q(sb.from('crm_oportunidades').update(d).eq('id', opId));
    aviso(e.final === 'ganho' ? '✍ Contrato assinado! "' + o.titulo + '" foi para a aba Contratos assinados.' : '✓ ' + o.titulo + ' → ' + e.nome + '.'); await recarregarCrm();
  });
}
function etapaFechado() { return (E._crmEtapas || []).find((e) => e.nome === 'Contrato fechado') || { ordem: 99 }; }

// ── Lista ──
function crmLista(alvo) {
  const ops = filtrarOps().filter(opAberta), abertas = ops, h = hojeISO();
  const pond = (o) => (Number(o.valor_estimado) || 0) * (o.probabilidade || 0) / 100;
  alvo.innerHTML = '<div class="kpis">' + kpi('Oportunidades abertas', String(abertas.length), '', 'assinados e perdidos ficam nas abas acima') +
    kpi('Valor em aberto', brl(soma(abertas, (o) => o.valor_estimado)), '', 'soma dos valores estimados') +
    kpi('Total ponderado', brl(soma(abertas, pond)), 'verde', 'valor × probabilidade') + '</div>' +
    '<div class="card">' + (ops.length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Oportunidade</th><th>Etapa</th><th data-tipo="num">Valor</th><th data-tipo="num">Prob.</th>' +
      '<th data-tipo="num">Ponderado</th><th>Responsável</th><th data-tipo="data">Próxima ação</th><th data-tipo="data">Previsão</th><th>Origem</th></tr></thead><tbody>' +
      ops.map((o) => '<tr class="clicavel" data-op="' + o.id + '"><td><b>' + esc(o.titulo) + '</b><div class="sub">' + esc(nomeOp(o)) + '</div></td>' +
        '<td><span class="pill ' + (etapaDe(o.etapa_id).final === 'ganho' ? 'pago' : etapaDe(o.etapa_id).final === 'perdido' ? 'neutro' : 'aberto') + '">' + esc(etapaDe(o.etapa_id).nome || '—') + '</span></td>' +
        '<td class="num mono" data-ord="' + (o.valor_estimado || 0) + '">' + brl(o.valor_estimado) + '</td><td class="mono" data-ord="' + o.probabilidade + '">' + o.probabilidade + '%</td>' +
        '<td class="num mono" data-ord="' + pond(o) + '">' + brl(pond(o)) + '</td><td>' + pillPessoa(o.responsavel) + '</td>' +
        '<td data-ord="' + esc(o.proxima_acao_em || '') + '">' + esc(o.proxima_acao || '—') + (o.proxima_acao_em ? '<div class="sub' + (o.proxima_acao_em < h && opAberta(o) ? ' texto-vermelho' : '') + '">' + dataBR(o.proxima_acao_em) + '</div>' : '') + '</td>' +
        '<td class="mono" data-ord="' + esc(o.previsao_fechamento || '') + '">' + (o.previsao_fechamento ? dataBR(o.previsao_fechamento) : '—') + '</td><td>' + esc(o.origem || '—') + '</td></tr>').join('') +
      '</tbody></table></div>' : vazio('Nenhuma oportunidade ainda — registre o primeiro contato de um cliente em potencial.', '+ Nova oportunidade', '#cr-nova')) + '</div>';
  alvo.querySelectorAll('[data-op]').forEach((tr) => tr.onclick = () => fichaOportunidade(tr.dataset.op));
}

// ── Painel ──
function crmPainel(alvo) {
  const ops = filtrarOps(), abertas = ops.filter(opAberta), mes = hojeISO().slice(0, 7);
  const ganhos = ops.filter((o) => o.ganho_em), perdas = ops.filter((o) => o.perdido_em);
  const noMes = (l, k) => l.filter((o) => String(o[k]).slice(0, 7) === mes);
  const d90 = Date.now() - 90 * 86400000, g90 = ganhos.filter((o) => new Date(o.ganho_em) > d90).length, p90 = perdas.filter((o) => new Date(o.perdido_em) > d90).length;
  const tempo = ganhos.length ? soma(ganhos, (o) => (new Date(o.ganho_em) - new Date(o.criado_em)) / 86400000) / ganhos.length : null;
  const novasMes = ops.filter((o) => String(o.criado_em).slice(0, 7) === mes).length;
  const assinados = ops.filter((o) => o.assinado_em), ano = Date.now() - 365 * 86400000;
  const porArea = {}; ganhos.filter((o) => new Date(o.ganho_em) > ano).forEach((o) => { const k = o.servico || 'Não informada'; porArea[k] = (porArea[k] || 0) + (Number(o.valor_estimado) || 0); });
  const indic = {}; ops.filter((o) => (o.indicado_por || '').trim()).forEach((o) => { const k = o.indicado_por.trim(); indic[k] = indic[k] || { total: 0, ganhos: 0, valor: 0 }; indic[k].total++; if (o.ganho_em) { indic[k].ganhos++; indic[k].valor += Number(o.valor_estimado) || 0; } });
  const pond = (o) => (Number(o.valor_estimado) || 0) * (o.probabilidade || 0) / 100;
  const funil = (E._crmEtapas || []).filter((e) => !e.final).map((e) => ({ rotulo: e.nome, valor: abertas.filter((o) => o.etapa_id === e.id).length }));
  const motivos = {}; perdas.forEach((o) => { const m = o.motivo_perda || 'sem motivo'; motivos[m] = (motivos[m] || 0) + 1; });
  const origens = {}; ops.forEach((o) => { const k = o.origem || 'Não informada'; origens[k] = origens[k] || { total: 0, ganhos: 0, valor: 0 }; origens[k].total++; if (o.ganho_em) { origens[k].ganhos++; origens[k].valor += Number(o.valor_estimado) || 0; } });
  const meses = [0, 1, 2].map((i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + i); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); });
  const previsao = meses.map((m) => ({ rotulo: nomeMes(new Date(m + '-01T12:00:00')), valor: soma(abertas.filter((o) => String(o.previsao_fechamento || '').slice(0, 7) === m), pond) }));
  const fmtN = (n) => String(n);
  const ranking = (itens, opc, vazio) => itens.some((i) => i.valor) ? graficoRanking(itens, opc) : '<div class="vazio">' + vazio + '</div>';
  alvo.innerHTML = '<div class="kpis">' +
    kpi('Novas no mês', String(novasMes), '', 'oportunidades criadas em ' + nomeMes(new Date()).split(' ')[0].toLowerCase()) +
    kpi('Em aberto', brl(soma(abertas, (o) => o.valor_estimado)), '', abertas.length + ' oportunidade(s) · ponderado ' + brl(soma(abertas, pond))) +
    kpi('Fechados no mês', brl(soma(noMes(ganhos, 'ganho_em'), (o) => o.valor_estimado)), 'verde', noMes(ganhos, 'ganho_em').length + ' contrato(s) · ' + noMes(assinados, 'assinado_em').length + ' assinado(s)') +
    kpi('Perdidas no mês', String(noMes(perdas, 'perdido_em').length), noMes(perdas, 'perdido_em').length ? 'vermelho' : '', '') +
    kpi('Conversão (90 dias)', g90 + p90 ? Math.round(g90 / (g90 + p90) * 100) + '%' : '—', '', g90 + ' ganha(s) de ' + (g90 + p90) + ' decidida(s)') +
    kpi('Tempo médio até fechar', tempo == null ? '—' : Math.round(tempo) + ' dia(s)', '', 'do primeiro contato ao "Contrato fechado"') + '</div>' +
    '<div class="duas-col"><div class="card"><div class="card-hd">Funil — oportunidades abertas por etapa</div><div class="card-bd">' + ranking(funil, { fmt: fmtN, titulo: 'Funil' }, 'Nenhuma oportunidade aberta.') + '</div></div>' +
    '<div class="card"><div class="card-hd">Previsão ponderada — próximos 3 meses</div><div class="card-bd">' + ranking(previsao, { titulo: 'Previsão' }, 'Sem previsão de fechamento nos próximos 3 meses.') +
      '<p class="sub">Pela data de previsão de fechamento de cada oportunidade × probabilidade.</p></div></div></div>' +
    '<div class="duas-col"><div class="card"><div class="card-hd">Valor fechado por área do serviço <span class="sub">últimos 12 meses</span></div><div class="card-bd">' +
      ranking(Object.entries(porArea).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ rotulo: k, valor: v })), { titulo: 'Por área' }, 'Nenhum contrato fechado nos últimos 12 meses.') + '</div></div>' +
    '<div class="card"><div class="card-hd">🤝 Quem mais indica</div>' + (Object.keys(indic).length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Quem indicou</th><th data-tipo="num">Indicações</th><th data-tipo="num">Fechadas</th><th data-tipo="num">Valor fechado</th></tr></thead><tbody>' +
      Object.entries(indic).sort((a, b) => b[1].total - a[1].total || b[1].valor - a[1].valor).map(([k, v]) => '<tr><td><b>' + esc(k) + '</b></td><td class="mono">' + v.total + '</td><td class="mono">' + v.ganhos + '</td><td class="num mono" data-ord="' + v.valor + '">' + brl(v.valor) + '</td></tr>').join('') +
      '</tbody></table></div>' : '<div class="card-bd"><div class="vazio">Nenhuma indicação registrada (campo "Indicado por").</div></div>') + '</div></div>' +
    '<div class="duas-col"><div class="card"><div class="card-hd">Motivos de perda</div><div class="card-bd">' +
      ranking(Object.entries(motivos).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ rotulo: k, valor: v })), { fmt: fmtN, titulo: 'Motivos' }, 'Nenhuma perda registrada.') + '</div></div>' +
    '<div class="card"><div class="card-hd">Origem que mais converte</div><div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Origem</th><th data-tipo="num">Oportunidades</th><th data-tipo="num">Ganhas</th><th data-tipo="num">Conversão</th><th data-tipo="num">Valor ganho</th></tr></thead><tbody>' +
      Object.entries(origens).sort((a, b) => b[1].ganhos - a[1].ganhos).map(([k, v]) => '<tr><td>' + esc(k) + '</td><td class="mono">' + v.total + '</td><td class="mono">' + v.ganhos + '</td><td class="mono" data-ord="' + (v.ganhos / v.total) + '">' + Math.round(v.ganhos / v.total * 100) + '%</td><td class="num mono" data-ord="' + v.valor + '">' + brl(v.valor) + '</td></tr>').join('') +
      '</tbody></table></div></div></div>';
}

// ── Formulário da oportunidade ──
function formOportunidade(o, depois) {
  const novo = !o.id, et = E._crmEtapas || [];
  const abertas = et.filter((e) => !e.final && (e.ordem < etapaFechado().ordem || e.id === o.etapa_id));
  const j = abrirJanela({ titulo: novo ? 'Nova oportunidade' : 'Editar oportunidade', larga: true,
    corpo: '<form id="f-op" class="grade">' +
      campo('Oportunidade <span class="obrig">*</span>', '<input name="titulo" maxlength="200" placeholder="Ex.: Defesa em execução fiscal — Empresa X" value="' + esc(o.titulo || '') + '">', 'inteiro') +
      campo('Já é cliente?', '<select name="cliente_id">' + opcoesClientes(o.cliente_id || '').replace('— sem cliente —', 'Não — é um contato novo') + '</select>', 'inteiro') +
      '<div class="grade inteiro" id="op-prospecto">' +
      campo('Nome do contato', '<input name="prospecto_nome" value="' + esc(o.prospecto_nome || '') + '">') + campo('Empresa', '<input name="prospecto_empresa" value="' + esc(o.prospecto_empresa || '') + '">') +
      campo('CPF/CNPJ', '<input name="prospecto_doc" value="' + esc(o.prospecto_doc || '') + '">') + campo('E-mail', '<input name="prospecto_email" type="email" value="' + esc(o.prospecto_email || '') + '">') +
      campo('Telefone / WhatsApp', '<input name="prospecto_telefone" value="' + esc(o.prospecto_telefone || '') + '">') + '</div>' +
      campo('Origem', '<input name="origem" list="op-origens" value="' + esc(o.origem || '') + '"><datalist id="op-origens">' + ORIGENS_CRM.map((x) => '<option value="' + esc(x) + '">').join('') + '</datalist>') +
      campo('Indicado por', '<input name="indicado_por" value="' + esc(o.indicado_por || '') + '">') +
      campo('Etapa', '<select name="etapa_id">' + abertas.map((e) => '<option value="' + e.id + '" data-prob="' + e.probabilidade + '"' + ((o.etapa_id || abertas[0].id) === e.id ? ' selected' : '') + '>' + esc(e.nome) + '</option>').join('') + '</select>') +
      campo('Probabilidade (%)', '<input name="probabilidade" type="number" min="0" max="100" value="' + (o.probabilidade != null ? o.probabilidade : (abertas[0] || {}).probabilidade || 10) + '">') +
      campo('Valor estimado (R$)', '<input name="valor_estimado" inputmode="decimal" value="' + (o.valor_estimado ? valorParaCampo(o.valor_estimado) : '') + '">') +
      campo('Tipo de honorário', selectPares('honorario_tipo', TIPOS_HON, o.honorario_tipo || '')) +
      campo('Área do serviço', selectServico(o.servico || '')) +
      campo('Previsão de fechamento', '<input name="previsao_fechamento" type="date" value="' + esc(o.previsao_fechamento || '') + '">') +
      campo('Responsável', '<input name="responsavel" list="op-pessoas" value="' + esc(o.responsavel || (E.perfil && (E.perfil.nome || '').split(' ')[0]) || '') + '">' + datalistPessoas('op-pessoas')) +
      campo('Próxima ação', '<input name="proxima_acao" placeholder="Ex.: ligar para agendar diagnóstico" value="' + esc(o.proxima_acao || '') + '">') +
      campo('Data da próxima ação', '<input name="proxima_acao_em" type="date" value="' + esc(o.proxima_acao_em || '') + '">') +
      '<label class="check inteiro"><input type="checkbox" name="agendar"' + (novo ? ' checked' : '') + '> Criar tarefa para a próxima ação (aparece na fila do responsável)</label>' +
      campo('Observação', '<textarea name="obs" maxlength="3000">' + esc(o.obs || '') + '</textarea>', 'inteiro') + '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-salvar-op">Salvar</button></div>' });
  const f = j.querySelector('#f-op');
  const mostrarProspecto = () => j.querySelector('#op-prospecto').classList.toggle('escondido', !!f.cliente_id.value);
  f.cliente_id.onchange = mostrarProspecto; mostrarProspecto();
  f.etapa_id.onchange = () => { f.probabilidade.value = f.etapa_id.selectedOptions[0].dataset.prob; };
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-salvar-op').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.titulo.value.trim()) throw new Error('Dê um nome à oportunidade.');
    if (!f.cliente_id.value && !f.prospecto_nome.value.trim() && !f.prospecto_empresa.value.trim()) throw new Error('Escolha o cliente ou informe o contato/empresa.');
    const valor = f.valor_estimado.value.trim() ? lerValor(f.valor_estimado.value) : 0;
    if (Number.isNaN(valor)) throw new Error('Valor estimado inválido.');
    const d = { titulo: f.titulo.value.trim(), cliente_id: f.cliente_id.value || null, origem: f.origem.value.trim(), indicado_por: f.indicado_por.value.trim(),
      etapa_id: f.etapa_id.value, probabilidade: Math.min(100, Math.max(0, parseInt(f.probabilidade.value, 10) || 0)), valor_estimado: valor,
      honorario_tipo: f.honorario_tipo.value, servico: f.servico.value, previsao_fechamento: f.previsao_fechamento.value || null, responsavel: f.responsavel.value.trim(),
      proxima_acao: f.proxima_acao.value.trim(), proxima_acao_em: f.proxima_acao_em.value || null, obs: f.obs.value.trim() };
    ['prospecto_nome', 'prospecto_empresa', 'prospecto_doc', 'prospecto_email', 'prospecto_telefone'].forEach((k) => { d[k] = f[k].value.trim(); });
    const salvo = novo ? await q(sb.from('crm_oportunidades').insert(d).select().single()) : (await q(sb.from('crm_oportunidades').update(d).eq('id', o.id).select()))[0];
    if (f.agendar.checked && d.proxima_acao && d.proxima_acao_em && (novo || d.proxima_acao_em !== o.proxima_acao_em || d.proxima_acao !== o.proxima_acao)) {
      await q(sb.from('tarefas').insert({ titulo: 'CRM: ' + d.proxima_acao + ' — ' + d.titulo, responsavel: d.responsavel, prazo: d.proxima_acao_em, inicio: hojeISO(),
        cliente_id: d.cliente_id, prioridade: 'media', status: 'pendente', descricao: 'Oportunidade do CRM' })).catch((e) => console.warn('[CRM] tarefa:', e));
    }
    aviso(novo ? '✓ Oportunidade criada.' : '✓ Oportunidade atualizada.'); fecharJanela(j);
    if (depois) await depois(salvo);
  });
}

// ── Ficha da oportunidade ──
async function fichaOportunidade(id, aba) {
  const o = await q(sb.from('crm_oportunidades').select('*').eq('id', id).single());
  if (!E._crmEtapas) E._crmEtapas = await q(sb.from('crm_etapas').select('*').order('ordem'));
  const e = etapaDe(o.etapa_id), aberta = !e.final;
  const tel = soDigitos(o.prospecto_telefone || (o.cliente_id && (E.clientes.find((c) => c.id === o.cliente_id) || {}).telefone) || '');
  const j = abrirJanela({ titulo: o.titulo, larga: true,
    corpo: '<div class="ficha-topo"><div><div class="ficha-sub">' + esc(nomeOp(o)) + (o.prospecto_email ? ' · ' + esc(o.prospecto_email) : '') + '</div>' +
      '<div class="ficha-selos"><span class="pill ' + (e.final === 'ganho' ? 'pago' : e.final === 'perdido' ? 'neutro' : 'aberto') + '">' + esc(e.nome || '—') + '</span> ' +
      '<span class="mono">' + brl(o.valor_estimado) + '</span> <span class="sub">' + o.probabilidade + '%</span> ' + pillPessoa(o.responsavel) + '</div></div>' +
      '<div class="ficha-atalhos">' + (aberta && !o.ganho_em ? '<button class="btn btn-v btn-mini" id="op-ganhou" title="O cliente disse SIM: cria cadastro, contrato e onboarding">✓ Contrato fechado</button>' : '') +
      (aberta && o.ganho_em ? '<button class="btn btn-v btn-mini" id="op-assinado" title="O cliente assinou o contrato: sai do painel">✍ Contrato assinado</button>' : '') +
      (aberta ? '<button class="btn btn-x btn-mini" id="op-perdeu" title="Não fechou (preço, prazo, concorrente, desistiu, sem retorno)">✗ Lead perdido</button>' : '') +
      (aberta && mailOp(o) ? '<button class="btn btn-o btn-mini" id="op-follow" title="E-mail pronto de acompanhamento da proposta">✉ Follow-up</button>' : '') +
      (tel ? '<a class="btn btn-o btn-mini" target="_blank" rel="noopener" href="' + linkWa(tel) + '">WhatsApp</a>' : '') +
      (mailOp(o) ? '<a class="btn btn-o btn-mini" href="mailto:' + esc(mailOp(o)) + '">E-mail</a>' : '') +
      '<button class="btn btn-p btn-mini" id="op-editar">Editar</button></div></div>' +
      (e.final === 'perdido' && o.motivo_perda ? '<div class="dica" style="margin-bottom:10px">Perdida: ' + esc(o.motivo_perda) + '</div>' : '') +
      (o.contrato_id ? '<div class="dica" style="margin-bottom:10px">Contrato criado. <a href="#" id="op-ver-cli">Abrir a ficha do cliente</a></div>' : '') +
      '<div class="abas" id="op-abas">' + [['dados', 'Resumo'], ['atividades', 'Atividades'], ['propostas', 'Propostas'], ['documentos', 'Documentos']].map(([k, r]) => '<button data-aba="' + k + '">' + r + '</button>').join('') + '</div>' +
      '<div id="op-corpo" class="ficha-corpo"></div>' });
  j.querySelector('.janela').classList.add('ficha');
  const corpo = j.querySelector('#op-corpo');
  const reabrir = async (k) => { fecharJanela(j); await recarregarCrm(); await fichaOportunidade(id, k); };
  const mostrar = async (k) => {
    j.querySelectorAll('#op-abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === k));
    corpo.innerHTML = '<div class="carregando">Carregando…</div>';
    try { await ({ atividades: opAtividades, propostas: opPropostas, documentos: opDocumentos, dados: opDados })[k](corpo, o, () => mostrar(k)); }
    catch (er) { console.error(er); corpo.innerHTML = '<div class="vazio">' + esc(erroAmigavel(er)) + '</div>'; }
  };
  j.querySelector('#op-abas').onclick = (ev) => { const b = ev.target.closest('button'); if (b) mostrar(b.dataset.aba); };
  j.querySelector('#op-editar').onclick = () => formOportunidade(o, () => reabrir('dados'));
  const g = j.querySelector('#op-ganhou'); if (g) g.onclick = () => janelaGanhar(o, () => { fecharJanela(j); });
  const as = j.querySelector('#op-assinado'); if (as) as.onclick = () => comBotao(as, async () => {
    const fim = (E._crmEtapas || []).find((x) => x.final === 'ganho'); if (!fim) return;
    await q(sb.from('crm_oportunidades').update({ etapa_id: fim.id }).eq('id', o.id));
    aviso('✍ Contrato assinado! A oportunidade foi para a aba "Contratos assinados".'); fecharJanela(j); await recarregarCrm();
  });
  const fu = j.querySelector('#op-follow'); if (fu) fu.onclick = () => janelaFollowup(o);
  const p = j.querySelector('#op-perdeu'); if (p) p.onclick = () => janelaPerder(o, () => { fecharJanela(j); });
  const vc = j.querySelector('#op-ver-cli'); if (vc) vc.onclick = (ev) => { ev.preventDefault(); abrirFicha(o.cliente_id); };
  await mostrar(aba || 'dados');
  return j;
}
async function opAtividades(alvo, o, repinta) {
  const at = await q(sb.from('crm_atividades').select('*').eq('oportunidade_id', o.id).order('quando', { ascending: false }));
  const agora = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  alvo.innerHTML = '<form id="f-at" class="grade" style="margin-bottom:12px">' + campo('Tipo', selectPares('tipo', TIPOS_ATIV, 'ligacao')) +
    campo('Quando', '<input type="datetime-local" name="quando" value="' + agora + '">') +
    campo('O que foi tratado / o que fazer', '<textarea name="resumo" maxlength="3000" placeholder="Ex.: enviou o relatório da PGFN; retornar na sexta"></textarea>', 'inteiro') +
    '<div class="inteiro acoes"><button type="button" class="btn btn-p btn-mini" id="at-salvar">Registrar</button><span class="sub">Data futura vira tarefa na fila do responsável.</span></div></form>' +
    (at.length ? '<div class="linha-tempo">' + at.map((a) => '<div class="lt-item"><span class="lt-ic">' + ({ ligacao: '📞', reuniao: '🤝', whatsapp: '💬', email: '✉', anotacao: '📝' }[a.tipo] || '•') + '</span><div><b>' +
      esc(rotuloPar(TIPOS_ATIV, a.tipo)) + '</b> <span class="sub">' + quandoBR(a.quando) + (a.feita ? '' : ' · agendada') + '</span><div>' + esc(a.resumo) + '</div></div></div>').join('') + '</div>'
      : '<div class="vazio">Nenhuma atividade ainda.</div>');
  const f = alvo.querySelector('#f-at');
  alvo.querySelector('#at-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.resumo.value.trim()) throw new Error('Escreva o que foi tratado.');
    const quando = f.quando.value ? new Date(f.quando.value) : new Date(), futura = quando > new Date(Date.now() + 60000);
    await q(sb.from('crm_atividades').insert({ oportunidade_id: o.id, tipo: f.tipo.value, quando: quando.toISOString(), resumo: f.resumo.value.trim(), feita: !futura }));
    if (futura) await q(sb.from('tarefas').insert({ titulo: 'CRM: ' + rotuloPar(TIPOS_ATIV, f.tipo.value) + ' — ' + o.titulo, descricao: f.resumo.value.trim(), responsavel: o.responsavel,
      prazo: iso(quando), inicio: hojeISO(), cliente_id: o.cliente_id, status: 'pendente', prioridade: 'media' }));
    if (o.cliente_id) await q(sb.from('interacoes').insert({ cliente_id: o.cliente_id, tipo: f.tipo.value, quando: quando.toISOString(), resumo: '[CRM] ' + f.resumo.value.trim() })).catch(() => {});
    aviso(futura ? '✓ Atividade agendada (tarefa criada).' : '✓ Atividade registrada.'); await repinta();
  });
}
function opDocumentos(alvo, o) {
  return blocoDocumentos(alvo, { oportunidade_id: o.id, cliente_id: o.cliente_id, tipo: 'proposta' }, { titulo: 'Documentos da oportunidade', vazio: 'Nenhum documento. Propostas guardadas e arquivos recebidos aparecem aqui.' });
}
function opDados(alvo, o) {
  const lin = (r, v) => v ? '<div class="dado"><span>' + r + '</span><b>' + v + '</b></div>' : '';
  alvo.innerHTML = '<div class="duas-col"><div class="dados">' + lin('Contato', esc(o.prospecto_nome)) + lin('Empresa', esc(o.prospecto_empresa)) + lin('CPF/CNPJ', esc(mascaraDoc(o.prospecto_doc))) +
    lin('E-mail', esc(o.prospecto_email)) + lin('Telefone', esc(o.prospecto_telefone)) + lin('Cliente', o.cliente_id ? esc(nomeCliente(o.cliente_id)) : '') + '</div>' +
    '<div class="dados">' + lin('Origem', esc(o.origem)) + lin('Indicado por', esc(o.indicado_por)) + lin('Tipo de honorário', esc(rotuloPar(TIPOS_HON, o.honorario_tipo))) +
    lin('Previsão de fechamento', o.previsao_fechamento ? dataBR(o.previsao_fechamento) : '') + lin('Próxima ação', esc(o.proxima_acao) + (o.proxima_acao_em ? ' · ' + dataBR(o.proxima_acao_em) : '')) +
    lin('Na etapa há', diasParado(o) + ' dia(s)') + lin('Criada em', dataBR(o.criado_em)) + lin('Observação', esc(o.obs)) + '</div></div>';
}

// ── Propostas ──
async function opPropostas(alvo, o, repinta) {
  const ps = await q(sb.from('crm_propostas').select('*').eq('oportunidade_id', o.id).order('versao', { ascending: false }));
  const total = (p) => soma(p.itens || [], (i) => i.valor);
  alvo.innerHTML = '<div class="titulo-pag" style="margin-bottom:8px"><div><b>Propostas</b> <span class="sub">' + ps.length + '</span></div>' +
    '<div class="acoes"><button class="btn btn-o btn-mini" id="pr-nova">+ Nova proposta</button></div></div>' +
    (ps.length ? '<div class="lista-ficha">' + ps.map((p) => '<div class="item-ficha"><div><b>v' + p.versao + ' — ' + esc(p.titulo || 'Proposta') + '</b> <span class="pill ' +
      ({ rascunho: 'neutro', enviada: 'aberto', aceita: 'pago', recusada: 'vencido' }[p.status]) + '">' + p.status + '</span><div class="sub">' + brl(total(p)) +
      (p.validade ? ' · válida até ' + dataBR(p.validade) : '') + (p.enviada_em ? ' · enviada em ' + dataBR(p.enviada_em) : '') + '</div></div>' +
      '<button class="btn btn-o btn-mini" data-pr="' + p.id + '">Abrir</button></div>').join('') + '</div>' : vazio('Nenhuma proposta ainda — comece por um modelo pronto.', '+ Nova proposta', '#pr-nova'));
  alvo.querySelector('#pr-nova').onclick = () => novaProposta(o, ps, repinta);
  alvo.querySelectorAll('[data-pr]').forEach((b) => b.onclick = () => editorProposta(o, ps.find((p) => p.id === b.dataset.pr), repinta));
}
async function novaProposta(o, ps, repinta) {
  const ms = await q(sb.from('crm_modelos_proposta').select('*').order('nome'));
  const j = abrirJanela({ titulo: 'Nova proposta — escolha o modelo',
    corpo: '<div class="lista-ficha">' + ms.map((m) => '<div class="item-ficha clicavel" data-mod="' + m.id + '"><b>' + esc(m.nome) + '</b><span class="sub">' + (m.itens || []).length + ' item(ns)</span></div>').join('') +
      (ps.length ? '<div class="item-ficha clicavel" data-mod="copia"><b>Copiar a última versão (v' + ps[0].versao + ')</b></div>' : '') +
      '<div class="item-ficha clicavel" data-mod=""><b>Em branco</b></div></div>' });
  j.querySelectorAll('[data-mod]').forEach((d) => d.onclick = () => {
    fecharJanela(j);
    const m = ms.find((x) => x.id === d.dataset.mod), ult = ps[0];
    const base = d.dataset.mod === 'copia' ? { titulo: ult.titulo, texto: ult.texto, itens: ult.itens } : m ? { titulo: m.nome, texto: m.texto, itens: m.itens } : { titulo: 'Proposta de honorários', texto: '<p>Prezado(a) {cliente},</p><p></p>', itens: [] };
    editorProposta(o, Object.assign({ versao: (ult ? ult.versao : 0) + 1, validade: somarDias(hojeISO(), 15), status: 'rascunho' }, base), repinta);
  });
}
// Proposta com a marca do escritório (serve para PDF e e-mail: estilos embutidos e layout em tabelas)
function htmlProposta(o, p) {
  const cli = nomeOp(o), total = soma(p.itens || [], (i) => i.valor), N = '#1B2A4A', D = '#C9A84C', T = '#374151', C = '#6B7280';
  const texto = String(p.texto || '').split('{cliente}').join(esc(cli)).split('{validade}').join(p.validade ? dataBR(p.validade) : '—')
    .split('{valor}').join(brl(total)).split('{parcelas}').join('')
    .replace(/<h3>/g, '<h3 style="color:' + N + ';font-size:15px;margin:20px 0 6px;letter-spacing:.01em">').replace(/<ul>/g, '<ul style="margin:6px 0 12px;padding-left:20px">').replace(/<li>/g, '<li style="margin:3px 0">');
  const meta = (r, v) => '<td style="padding:10px 14px;border-right:1px solid #E5E7EB"><div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:' + C + '">' + r + '</div>' +
    '<div style="font-size:13.5px;font-weight:bold;color:' + N + ';margin-top:2px">' + v + '</div></td>';
  const passo = (n, t, d) => '<td style="width:33%;vertical-align:top;padding:0 8px"><div style="width:26px;height:26px;border-radius:50%;background:' + D + ';color:' + N + ';font-weight:bold;text-align:center;line-height:26px;font-size:13px">' + n + '</div>' +
    '<div style="font-weight:bold;color:' + N + ';margin-top:6px;font-size:13px">' + t + '</div><div style="color:' + C + ';font-size:12px;margin-top:2px">' + d + '</div></td>';
  return '<div style="font-family:Arial,Helvetica,sans-serif;color:' + T + ';max-width:760px;margin:0 auto;font-size:14px;line-height:1.65;background:#fff">' +
    '<table role="presentation" style="width:100%;border-collapse:collapse;background:' + N + '"><tr><td style="padding:26px 30px">' +
      '<div style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:.06em">ARAÚJO &amp; CASTRO</div>' +
      '<div style="color:' + D + ';font-size:10.5px;letter-spacing:.3em;text-transform:uppercase;margin-top:2px">Advocacia e Consultoria</div></td>' +
      '<td style="padding:26px 30px;text-align:right;color:#CBD5E1;font-size:11px;letter-spacing:.18em;text-transform:uppercase;vertical-align:bottom">Proposta de honorários</td></tr></table>' +
    '<div style="height:4px;background:' + D + '"></div>' +
    '<div style="padding:28px 30px 8px">' +
      '<div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:' + D + ';font-weight:bold">Proposta nº ' + p.versao + '</div>' +
      '<h1 style="color:' + N + ';font-size:24px;line-height:1.25;margin:6px 0 18px">' + esc(p.titulo || 'Proposta de honorários') + '</h1>' +
      '<table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #E5E7EB;border-radius:8px;background:#F8FAFC"><tr>' +
        meta('Preparada para', esc(cli)) + meta('Data', dataBR(hojeISO())) + meta('Válida até', p.validade ? dataBR(p.validade) : '—') +
        '<td style="padding:10px 14px"><div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:' + C + '">Investimento</div><div style="font-size:13.5px;font-weight:bold;color:' + N + ';margin-top:2px">' + brl(total) + '</div></td></tr></table>' +
      '<div style="margin-top:22px">' + texto + '</div>' +
      ((p.itens || []).length ? '<h3 style="color:' + N + ';font-size:15px;margin:24px 0 8px">Investimento</h3>' +
        '<table style="width:100%;border-collapse:collapse;font-size:13.5px"><thead><tr>' +
        '<th style="text-align:left;padding:10px 12px;background:' + N + ';color:#fff;font-weight:bold">Serviço</th><th style="text-align:left;padding:10px 12px;background:' + N + ';color:#fff;font-weight:bold">Forma de pagamento</th>' +
        '<th style="text-align:right;padding:10px 12px;background:' + N + ';color:#fff;font-weight:bold">Valor</th></tr></thead><tbody>' +
        p.itens.map((i, k) => '<tr style="background:' + (k % 2 ? '#F8FAFC' : '#fff') + '"><td style="padding:10px 12px;border-bottom:1px solid #E5E7EB">' + esc(i.servico) + '</td><td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;color:' + C + '">' + esc(i.forma || '') +
          '</td><td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;text-align:right;white-space:nowrap">' + brl(i.valor) + '</td></tr>').join('') +
        '<tr><td colspan="2" style="padding:12px;font-weight:bold;color:' + N + ';border-top:2px solid ' + D + '">Total</td><td style="padding:12px;text-align:right;font-weight:bold;color:' + N + ';white-space:nowrap;border-top:2px solid ' + D + '">' + brl(total) + '</td></tr></tbody></table>' : '') +
      '<h3 style="color:' + N + ';font-size:15px;margin:26px 0 12px">Como seguimos</h3>' +
      '<table role="presentation" style="width:100%;border-collapse:collapse"><tr>' + passo(1, 'Aceite', 'Você confirma a proposta por e-mail, WhatsApp ou assinando abaixo.') +
        passo(2, 'Contrato', 'Enviamos o contrato de prestação de serviços para assinatura.') + passo(3, 'Início', 'Reunião de abertura e lista dos documentos necessários.') + '</tr></table>' +
      (p.validade ? '<p style="color:' + C + ';font-size:12px;margin-top:20px">Esta proposta é válida até ' + dataBR(p.validade) + '. Valores sem custas processuais, taxas e emolumentos, quando houver.</p>' : '') +
      '<table role="presentation" style="width:100%;border-collapse:collapse;margin-top:46px"><tr>' +
        '<td style="width:48%;border-top:1px solid #9CA3AF;padding-top:8px;font-size:12px;color:' + C + '">Araújo &amp; Castro Advocacia e Consultoria</td><td style="width:4%"></td>' +
        '<td style="width:48%;border-top:1px solid #9CA3AF;padding-top:8px;font-size:12px;color:' + C + '">De acordo — ' + esc(cli) + '</td></tr></table></div>' +
    '<div style="margin-top:26px;padding:12px 30px;border-top:1px solid #E5E7EB;color:#9CA3AF;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase">Araújo &amp; Castro · Advocacia e Consultoria</div></div>';
}
function limparHtml(h) {   // o texto da proposta vai por e-mail: nada de script nem atributos de evento
  const d = document.createElement('div'); d.innerHTML = h;
  d.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach((x) => x.remove());
  d.querySelectorAll('*').forEach((x) => [...x.attributes].forEach((a) => { if (/^on/i.test(a.name) || /javascript:/i.test(a.value)) x.removeAttribute(a.name); }));
  return d.innerHTML;
}
function editorProposta(o, p, repinta) {
  let itens = (p.itens || []).map((i) => Object.assign({}, i));
  const j = abrirJanela({ titulo: 'Proposta v' + p.versao + ' — ' + nomeOp(o), larga: true,
    corpo: '<form id="f-pr" class="grade">' + campo('Título', '<input name="titulo" value="' + esc(p.titulo || '') + '">') +
      campo('Válida até', '<input name="validade" type="date" value="' + esc(p.validade || '') + '">') +
      '<div class="inteiro"><div class="secao">Texto <span class="sub">— clique e edite; {cliente} e {validade} são trocados sozinhos</span></div>' +
      '<div class="pr-texto" id="pr-texto" contenteditable="true">' + (p.texto || '') + '</div></div>' +
      '<div class="inteiro"><div class="secao">Valores</div><div id="pr-itens"></div><button type="button" class="btn btn-o btn-mini" id="pr-add">+ Item</button></div></form>',
    rodape: '<div class="acoes"><button class="btn btn-o" type="button" id="pr-pdf">Ver / salvar PDF</button><button class="btn btn-o" type="button" id="pr-guardar">Guardar nos Documentos</button>' +
      '<button class="btn btn-o" type="button" id="pr-email">Enviar por e-mail</button>' + (o.prospecto_telefone ? '<button class="btn btn-o" type="button" id="pr-zap">WhatsApp</button>' : '') + '</div>' +
      '<div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Fechar</button><button class="btn btn-p" type="button" id="pr-salvar">Salvar</button></div>' });
  const f = j.querySelector('#f-pr');
  const pintarItens = () => {
    j.querySelector('#pr-itens').innerHTML = itens.map((i, k) => '<div class="pr-item"><input data-k="' + k + '" data-c="servico" placeholder="Serviço" value="' + esc(i.servico || '') + '">' +
      '<input data-k="' + k + '" data-c="forma" placeholder="Forma de pagamento" value="' + esc(i.forma || '') + '">' +
      '<input data-k="' + k + '" data-c="valor" inputmode="decimal" placeholder="0,00" value="' + (i.valor ? valorParaCampo(i.valor) : '') + '"><button type="button" class="btn-etq" data-x="' + k + '">×</button></div>').join('') +
      '<div class="sub" style="margin:6px 0">Total: <b>' + brl(soma(itens, (i) => i.valor)) + '</b></div>';
    j.querySelectorAll('#pr-itens input').forEach((inp) => inp.onchange = () => { const v = inp.dataset.c === 'valor' ? (lerValor(inp.value) || 0) : inp.value; itens[+inp.dataset.k][inp.dataset.c] = v; pintarItens(); });
    j.querySelectorAll('#pr-itens [data-x]').forEach((b) => b.onclick = () => { itens.splice(+b.dataset.x, 1); pintarItens(); });
  };
  pintarItens();
  j.querySelector('#pr-add').onclick = () => { itens.push({ servico: '', forma: '', valor: 0 }); pintarItens(); };
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  const atual = () => Object.assign({}, p, { titulo: f.titulo.value.trim(), validade: f.validade.value || null, texto: limparHtml(j.querySelector('#pr-texto').innerHTML), itens });
  const salvar = async () => {
    const d = atual(), dados = { oportunidade_id: o.id, versao: d.versao, titulo: d.titulo, validade: d.validade, texto: d.texto, itens: d.itens };
    if (p.id) await q(sb.from('crm_propostas').update(dados).eq('id', p.id)); else { const n = await q(sb.from('crm_propostas').insert(dados).select().single()); p.id = n.id; p.status = n.status; }
    return d;
  };
  j.querySelector('#pr-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => { await salvar(); aviso('✓ Proposta salva.'); fecharJanela(j); await repinta(); });
  j.querySelector('#pr-pdf').onclick = () => {
    const d = atual(), w = window.open('', '_blank');
    if (!w) return aviso('O navegador bloqueou a janela da proposta. Libere pop-ups para este site.', true);
    const nome = ('Proposta ' + nomeOp(o) + ' v' + d.versao).replace(/[\\/:*?"<>|]/g, '-');
    w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + esc(nome) + '</title><style>@page{size:A4;margin:16mm}@media print{.no-print{display:none}}</style></head><body>' +
      '<div class="no-print" style="position:sticky;top:0;background:#1B2A4A;padding:10px;text-align:center"><button id="imprimir" style="background:#C9A84C;border:0;border-radius:8px;padding:8px 16px;font-weight:bold;cursor:pointer">Salvar em PDF / Imprimir</button></div>' +
      htmlProposta(o, d) + '</body></html>');
    w.document.close();
    const b = w.document.getElementById('imprimir'); if (b) b.onclick = () => w.print();
  };
  j.querySelector('#pr-guardar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const d = await salvar();
    const html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Proposta</title></head><body>' + htmlProposta(o, d) + '</body></html>';
    const arq = new File([html], ('Proposta ' + nomeOp(o) + ' v' + d.versao).replace(/[\\/:*?"<>|]/g, '-') + '.html', { type: 'text/html' });
    const doc = await enviarDocumento(arq, { oportunidade_id: o.id, cliente_id: o.cliente_id || undefined, tipo: 'proposta' }, { validade: d.validade || null });
    await q(sb.from('crm_propostas').update({ documento_id: doc.id }).eq('id', p.id));
    aviso('✓ Proposta guardada nos Documentos da oportunidade.');
  });
  j.querySelector('#pr-email').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const d = await salvar();
    const para = prompt('Enviar a proposta para qual e-mail?', o.prospecto_email || (o.cliente_id && (E.clientes.find((c) => c.id === o.cliente_id) || {}).email) || '');
    if (!para) return;
    await q(sb.rpc('crm_enviar_proposta', { p_proposta: p.id, p_para: para.trim(), p_html: htmlProposta(o, d) }));
    aviso('✓ Proposta na fila de e-mails para ' + para.trim() + ' (sai em até 5 minutos).'); fecharJanela(j); await repinta();
  });
  const zap = j.querySelector('#pr-zap');
  if (zap) zap.onclick = () => {
    const d = atual(), tel = soDigitos(o.prospecto_telefone);
    const msg = 'Olá, ' + (o.prospecto_nome || nomeOp(o)).split(' ')[0] + '! Segue a proposta "' + (d.titulo || 'Proposta') + '": total de ' + brl(soma(d.itens, (i) => i.valor)) +
      (d.validade ? ', válida até ' + dataBR(d.validade) : '') + '. Envio o documento completo por e-mail. — Araújo & Castro';
    window.open('https://wa.me/' + (tel.length <= 11 ? '55' : '') + tel + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
  };
}

// ── Contrato fechado / Lead perdido ──
// Fechar: herda os dados do prospecto e a proposta aceita (valor, parcelas ou mensalidade, área do serviço).
async function janelaGanhar(o, depois, etapaDestino) {
  const cli = o.cliente_id ? E.clientes.find((c) => c.id === o.cliente_id) : null;
  const pr = (await q(sb.from('crm_propostas').select('*').eq('oportunidade_id', o.id).order('versao', { ascending: false }).limit(1)).catch(() => []))[0];
  const itens = (pr && pr.itens) || [], mensais = itens.filter((i) => /mens/i.test(i.forma || '') || /mensal/i.test(i.servico || ''));
  const consult = o.honorario_tipo === 'mensal' || mensais.length > 0;
  const totalPr = soma(itens.filter((i) => !mensais.includes(i)), (i) => i.valor), mensal = soma(mensais, (i) => i.valor);
  const parcelas = (() => { const m = itens.map((i) => /(\d+)\s*(x|parcelas?)/i.exec(i.forma || '')).find(Boolean); return m ? +m[1] : 1; })();
  const j = abrirJanela({ titulo: '✓ Contrato fechado — ' + o.titulo, larga: true,
    corpo: '<div class="dica" style="margin-bottom:10px">O cliente disse <b>sim</b>. Confira os dados: ao confirmar, o sistema cria ' + (cli ? '' : 'o <b>cliente</b> (com os dados do contato' + (o.prospecto_doc ? ' e consulta o cartão CNPJ' : '') + '), ') +
        'o <b>contrato</b> ' + (pr ? '(a partir da proposta v' + pr.versao + ')' : '') + ', o <b>onboarding</b> e a tarefa <b>"Enviar contrato para assinatura"</b>. A oportunidade vai para "Contrato fechado"' + (etapaDestino ? ' e depois para a etapa escolhida' : '') + '.</div>' +
      '<form id="f-gan" class="grade">' +
      (cli ? '<div class="inteiro dica">Cliente: <b>' + esc(cli.nome) + '</b></div>' :
        campo('Nome do cliente <span class="obrig">*</span>', '<input name="cliente_nome" value="' + esc(o.prospecto_empresa || o.prospecto_nome || '') + '">') +
        campo('CPF/CNPJ', '<input name="cpf_cnpj" value="' + esc(o.prospecto_doc || '') + '">') + campo('E-mail', '<input name="email" value="' + esc(o.prospecto_email || '') + '">') +
        campo('Telefone', '<input name="telefone" value="' + esc(o.prospecto_telefone || '') + '">') +
        campo('Grupo', '<input name="grupo" list="gan-grupos" value="' + esc(o.prospecto_empresa || o.prospecto_nome || '') + '">' + datalistGrupos('gan-grupos'))) +
      '<div class="inteiro secao">Contrato</div>' +
      campo('Descrição do serviço', '<input name="descricao" value="' + esc(o.titulo) + '">', 'inteiro') +
      campo('Área do serviço', selectServico(o.servico || '')) +
      campo('Tipo', '<select name="modalidade"><option value="pontual"' + (consult ? '' : ' selected') + '>Serviço pontual (parcelas)</option><option value="consultoria"' + (consult ? ' selected' : '') + '>Consultoria (mensalidade)</option></select>') +
      '<div class="grade inteiro" id="gan-pontual">' +
        campo('Valor total (R$)', '<input name="valor_total" inputmode="decimal" value="' + valorParaCampo(totalPr || (!consult ? o.valor_estimado : 0) || 0) + '">') +
        campo('Número de parcelas', '<input name="num_parcelas" type="number" min="1" max="120" value="' + parcelas + '">') +
        campo('1º vencimento', '<input name="primeiro_vencimento" type="date" value="' + somarDias(hojeISO(), 10) + '">') +
        campo('% de êxito (se houver)', '<input name="percentual_exito" inputmode="decimal">') + '</div>' +
      '<div class="grade inteiro" id="gan-consult">' +
        campo('Mensalidade (R$)', '<input name="valor_mensal" inputmode="decimal" value="' + valorParaCampo(mensal || (consult ? o.valor_estimado : 0) || 0) + '">') +
        campo('Dia do vencimento', '<input name="dia_vencimento" type="number" min="1" max="28" value="10">') +
        campo('1ª competência', '<input name="inicio_competencia" type="month" value="' + hojeISO().slice(0, 7) + '">') + '</div>' +
      campo('Responsável', '<input name="responsavel" list="gan-pessoas" value="' + esc(o.responsavel || '') + '">' + datalistPessoas('gan-pessoas')) +
      '<label class="check inteiro"><input type="checkbox" name="criar_fluxo" checked> Criar o fluxo "Onboarding de cliente" (tarefas com prazos em dias úteis)</label></form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-v" type="button" id="btn-ganhar">Confirmar — Contrato fechado</button></div>' });
  const f = j.querySelector('#f-gan');
  const modo = () => { const c = f.modalidade.value === 'consultoria'; j.querySelector('#gan-pontual').classList.toggle('escondido', c); j.querySelector('#gan-consult').classList.toggle('escondido', !c); };
  f.modalidade.onchange = modo; modo();
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-ganhar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const consultoria = f.modalidade.value === 'consultoria';
    const valor = !consultoria && f.valor_total.value.trim() ? lerValor(f.valor_total.value) : 0, mens = consultoria ? lerValor(f.valor_mensal.value || '') : null;
    if (Number.isNaN(valor)) throw new Error('Valor inválido.');
    if (consultoria && !(mens > 0)) throw new Error('Informe a mensalidade da consultoria.');
    const p = { cliente_id: o.cliente_id || '', descricao: f.descricao.value.trim(), servico: f.servico.value, modalidade: f.modalidade.value, valor_total: valor,
      num_parcelas: parseInt(f.num_parcelas.value, 10) || 1, primeiro_vencimento: f.primeiro_vencimento.value || '',
      percentual_exito: f.percentual_exito.value ? String(lerValor(f.percentual_exito.value)) : '',
      valor_mensal: consultoria ? String(mens) : '', dia_vencimento: f.dia_vencimento.value || '10', inicio_competencia: f.inicio_competencia.value ? f.inicio_competencia.value + '-01' : '',
      responsavel: f.responsavel.value.trim(), criar_fluxo: f.criar_fluxo.checked };
    if (!cli) Object.assign(p, { cliente_nome: f.cliente_nome.value.trim(), cpf_cnpj: soDigitos(f.cpf_cnpj.value), email: f.email.value.trim(), telefone: f.telefone.value.trim(), grupo: f.grupo.value.trim() });
    if (!cli && !p.cliente_nome) throw new Error('Informe o nome do cliente.');
    const r = await q(sb.rpc('crm_ganhar', { p_op: o.id, p }));
    if (etapaDestino) await q(sb.from('crm_oportunidades').update({ etapa_id: etapaDestino }).eq('id', o.id));
    // cliente novo com CNPJ: busca o cartão CNPJ na hora (se a função estiver publicada)
    if (!cli && soDigitos(p.cpf_cnpj).length === 14 && r && r.cliente_id) chamarFuncao('erp-cnpj', { cliente_id: r.cliente_id, auto: true }).catch(() => {});
    aviso('✓ Contrato fechado! Cliente, contrato' + (p.criar_fluxo ? ', onboarding' : '') + ' e a tarefa "Enviar contrato para assinatura" criados.');
    fecharJanela(j); if (depois) depois(r);
    await carregarCadastros(true); await recarregarCrm();
  });
}
const MOTIVOS_PERDA = ['Preço', 'Prazo', 'Foi para concorrente', 'Desistiu', 'Sem retorno', 'Outro'];
function janelaPerder(o, depois) {
  const j = abrirJanela({ titulo: '✗ Lead perdido — ' + o.titulo,
    corpo: '<form id="f-per" class="grade">' + campo('Motivo <span class="obrig">*</span>', '<select name="motivo"><option value="">— escolha —</option>' + MOTIVOS_PERDA.map((m) => '<option>' + m + '</option>').join('') + '</select>', 'inteiro') +
      campo('Detalhe (opcional)', '<input name="detalhe" maxlength="200" placeholder="Ex.: achou caro; fechou com o escritório X">', 'inteiro') +
      '<label class="check inteiro"><input type="checkbox" name="reativar"> Criar tarefa para retomar o contato daqui a 6 meses</label></form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-x" type="button" id="btn-perder">Confirmar — Lead perdido</button></div>' });
  const f = j.querySelector('#f-per');
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-perder').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.motivo.value) throw new Error('Escolha o motivo.');
    const motivo = f.motivo.value + (f.detalhe.value.trim() ? ' — ' + f.detalhe.value.trim() : '');
    await q(sb.rpc('crm_perder', { p_op: o.id, p_motivo: motivo, p_reativar: f.reativar.checked }));
    aviso('✓ Lead perdido registrado (aba "Leads perdidos").'); fecharJanela(j); if (depois) depois(); await recarregarCrm();
  });
}
// Follow-up da proposta: e-mail pronto, 1 clique
async function janelaFollowup(o) {
  const pr = (await q(sb.from('crm_propostas').select('titulo, versao, enviada_em').eq('oportunidade_id', o.id).order('versao', { ascending: false }).limit(1)).catch(() => []))[0];
  const nome = (o.prospecto_nome || nomeOp(o)).split(' ')[0];
  const texto = 'Olá, ' + nome + '! Tudo bem?\n\nPassando para saber se conseguiu analisar a nossa proposta' + (pr ? ' "' + (pr.titulo || 'de honorários') + '"' : '') + (pr && pr.enviada_em ? ', enviada em ' + dataBR(pr.enviada_em) : '') + '.\n\n' +
    'Se tiver qualquer dúvida sobre o escopo, os valores ou a forma de pagamento, fico à disposição para uma conversa rápida — posso ligar no horário que for melhor para você.\n\nUm abraço.';
  const j = abrirJanela({ titulo: '✉ Follow-up — ' + o.titulo, larga: true,
    corpo: '<form id="f-fu" class="grade">' + campo('Para', '<input name="para" value="' + esc(mailOp(o)) + '">') + campo('Assunto', '<input name="assunto" value="' + esc('Nossa proposta' + (pr && pr.titulo ? ' — ' + pr.titulo : '')) + '">') +
      campo('Mensagem', '<textarea name="texto" rows="9">' + esc(texto) + '</textarea>', 'inteiro') + '</form><p class="sub">Vai com a marca do escritório e fica registrado nas atividades da oportunidade.</p>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="fu-enviar">Enviar</button></div>' });
  const f = j.querySelector('#f-fu');
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#fu-enviar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    await q(sb.rpc('crm_followup_email', { p_op: o.id, p_para: f.para.value.trim(), p_assunto: f.assunto.value.trim(), p_texto: f.texto.value }));
    aviso('✓ Follow-up na fila de e-mails (sai em até 5 minutos).'); fecharJanela(j);
  });
}
// Cadastro rápido: só nome, telefone e interesse
function cadastroRapido() {
  const j = abrirJanela({ titulo: '⚡ Cadastro rápido',
    corpo: '<form id="f-rap" class="grade">' + campo('Nome <span class="obrig">*</span>', '<input name="nome" placeholder="Pessoa ou empresa">', 'inteiro') +
      campo('Telefone / WhatsApp', '<input name="tel" inputmode="tel">') + campo('Interesse', '<input name="interesse" placeholder="Ex.: parcelamento, holding, defesa">') + '</form>' +
      '<p class="sub">Entra em "Novo contato" com você como responsável. O resto dá para completar depois (Editar).</p>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-p" type="button" id="rap-salvar">Salvar</button></div>' });
  const f = j.querySelector('#f-rap');
  j.querySelector('#rap-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const nome = f.nome.value.trim(); if (!nome) throw new Error('Informe o nome.');
    const et = (E._crmEtapas || []).filter((e) => !e.final)[0];
    await q(sb.from('crm_oportunidades').insert({ titulo: (f.interesse.value.trim() || 'Contato') + ' — ' + nome, prospecto_nome: nome, prospecto_telefone: f.tel.value.trim(),
      etapa_id: et ? et.id : null, probabilidade: et ? et.probabilidade : 10, responsavel: (E.perfil && (E.perfil.nome || '').split(' ')[0]) || '' }));
    aviso('✓ Contato cadastrado em "Novo contato".'); fecharJanela(j); await recarregarCrm();
  });
}
// Etapas: o que significa cada uma e o prazo (em dias) antes de virar tarefa "parada"
async function janelaEtapasCrm() {
  const et = await q(sb.from('crm_etapas').select('*').order('ordem'));
  const admin = E.perfil && E.perfil.papel === 'admin';
  const j = abrirJanela({ titulo: '⚙ Etapas do CRM', larga: true,
    corpo: '<div class="dica" style="margin-bottom:10px">Se a oportunidade ficar na etapa mais dias do que o prazo, o sistema cria uma tarefa para o responsável (Central de automações → "CRM: oportunidade parada").</div>' +
      '<div class="tabela-wrap"><table><thead><tr><th>Etapa</th><th>O que significa</th><th class="num">Prazo (dias)</th></tr></thead><tbody>' +
      et.map((e) => '<tr><td><b>' + esc(e.nome) + '</b>' + (e.final ? '<div class="sub">fim — sai do painel</div>' : '') + '</td><td><input data-desc="' + e.id + '" value="' + esc(e.descricao || '') + '"' + (admin ? '' : ' disabled') + ' style="width:100%"></td>' +
        '<td class="num">' + (e.final ? '—' : '<input data-dias="' + e.id + '" type="number" min="0" max="90" value="' + (e.dias_alerta == null ? '' : e.dias_alerta) + '"' + (admin ? '' : ' disabled') + ' style="width:70px">') + '</td></tr>').join('') + '</tbody></table></div>',
    rodape: '<span class="sub">' + (admin ? 'Vazio = sem prazo.' : 'Só o administrador altera.') + '</span>' + (admin ? '<button class="btn btn-p" type="button" id="et-salvar">Salvar</button>' : '') });
  const b = j.querySelector('#et-salvar');
  if (b) b.onclick = () => comBotao(b, async () => {
    for (const e of et) {
      const d = { descricao: j.querySelector('[data-desc="' + e.id + '"]').value.trim() }, x = j.querySelector('[data-dias="' + e.id + '"]');
      if (x) d.dias_alerta = x.value === '' ? null : Math.max(0, parseInt(x.value, 10) || 0);
      await q(sb.from('crm_etapas').update(d).eq('id', e.id));
    }
    aviso('✓ Etapas salvas.'); fecharJanela(j); await recarregarCrm();
  });
}

// ── Modelos de proposta ──
async function janelaModelosProposta() {
  const ms = await q(sb.from('crm_modelos_proposta').select('*').order('nome'));
  const j = abrirJanela({ titulo: 'Modelos de proposta', larga: true,
    corpo: '<div class="lista-ficha">' + ms.map((m) => '<div class="item-ficha"><div><b>' + esc(m.nome) + '</b><div class="sub">' + (m.itens || []).map((i) => esc(i.servico)).join(' · ') + '</div></div>' +
      '<span><button class="btn btn-o btn-mini" data-mp-ver="' + m.id + '">👁 Ver como fica</button> <button class="btn btn-o btn-mini" data-mp="' + m.id + '">Editar</button></span></div>').join('') + '</div>',
    rodape: '<span></span><button class="btn btn-p" type="button" id="mp-novo">+ Novo modelo</button>' });
  const editar = (m) => {
    m = m || { nome: '', texto: '<p>Prezado(a) {cliente},</p><p></p><p>Esta proposta vale até {validade}.</p>', itens: [] };
    const k = abrirJanela({ titulo: m.id ? 'Editar modelo' : 'Novo modelo', larga: true,
      corpo: '<form class="grade" id="f-mp">' + campo('Nome', '<input name="nome" value="' + esc(m.nome) + '">', 'inteiro') +
        '<div class="inteiro"><div class="secao">Texto</div><div class="pr-texto" id="mp-texto" contenteditable="true">' + m.texto + '</div></div>' +
        campo('Itens (um por linha: serviço ; forma de pagamento ; valor)', '<textarea name="itens" rows="5">' + esc((m.itens || []).map((i) => [i.servico, i.forma || '', i.valor ? valorParaCampo(i.valor) : ''].join(' ; ')).join('\n')) + '</textarea>', 'inteiro') + '</form>',
      rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="mp-salvar">Salvar</button></div>' });
    const f = k.querySelector('#f-mp');
    k.querySelector('[data-cancelar]').onclick = () => fecharJanela(k);
    k.querySelector('#mp-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
      if (!f.nome.value.trim()) throw new Error('Dê um nome ao modelo.');
      const itens = f.itens.value.split('\n').map((l) => l.split(';').map((x) => x.trim())).filter((x) => x[0]).map(([servico, forma, valor]) => ({ servico, forma: forma || '', valor: lerValor(valor || '') || 0 }));
      const d = { nome: f.nome.value.trim(), texto: limparHtml(k.querySelector('#mp-texto').innerHTML), itens };
      if (m.id) await q(sb.from('crm_modelos_proposta').update(d).eq('id', m.id)); else await q(sb.from('crm_modelos_proposta').insert(d));
      aviso('✓ Modelo salvo.'); fecharJanela(k); fecharJanela(j); janelaModelosProposta();
    });
  };
  j.querySelector('#mp-novo').onclick = () => editar();
  j.querySelectorAll('[data-mp]').forEach((b) => b.onclick = () => editar(ms.find((m) => m.id === b.dataset.mp)));
  j.querySelectorAll('[data-mp-ver]').forEach((b) => b.onclick = () => {
    const m = ms.find((x) => x.id === b.dataset.mpVer), w = window.open('', '_blank');
    if (!w) return aviso('O navegador bloqueou a janela. Libere pop-ups para este site.', true);
    w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Modelo — ' + esc(m.nome) + '</title></head><body style="background:#EEF1F6;padding:20px">' +
      htmlProposta({ prospecto_empresa: 'Empresa Exemplo Ltda' }, { versao: 1, titulo: m.nome, texto: m.texto, itens: (m.itens || []).map((i) => Object.assign({}, i, { valor: i.valor || 1000 })), validade: somarDias(hojeISO(), 15) }) + '</body></html>');
    w.document.close();
  });
}
