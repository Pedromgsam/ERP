'use strict';
// ═══════════════════════════════════════════════════════════════════
// Rotina do estagiário (Backup 28) — o lugar limpo que substitui as planilhas:
//  1) Passivo e cadastro: RFB, PGFN, AGE/MG (em aberto e negociada), CEAT, em operação,
//     procuração, certificado (validade e senha, guardada à parte) e CAPAG — edita na própria tabela.
//  2) Processos: última movimentação, procuração, mudança de valor e decisão relevante
//     (cada registro fica no histórico do processo).
//  3) Guias de parcelamentos e boletos de acordos (emitir → enviar → conferir o pagamento).
//  4) Financeiro do escritório (atalhos) e 5) Minhas tarefas.
// ═══════════════════════════════════════════════════════════════════
const ABAS_ROTINA = [['passivo', '🏛 Passivo e cadastro'], ['processos', '⚖ Processos'], ['guias', '🧾 Guias e boletos'], ['financeiro', '💰 Financeiro'], ['tarefas', '✓ Minhas tarefas']];
const TIPOS_MOV = [['movimentacao', 'Movimentação'], ['decisao', 'Decisão relevante'], ['valor', 'Mudança de valor'], ['procuracao', 'Procuração juntada'], ['sem_novidade', 'Conferido — sem novidade']];
const COLS_PASSIVO = [['rfb', 'RFB'], ['rfb_negociada', 'RFB negociada'], ['pgfn', 'PGFN'], ['pgfn_negociada', 'PGFN negociada'], ['age_mg', 'AGE/MG'], ['age_mg_negociada', 'AGE/MG negociada']];
const CAPAG_OPCOES = ['', 'A', 'B', 'C', 'D', 'Omisso'];

TELAS.rotina = async function () {
  E.rt = Object.assign({ aba: 'passivo', busca: '', grupo: '', filtro: '' }, E.rt || {});
  if (!E.clientes.length) await carregarCadastros();
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Rotina</h1><p>Tudo o que era atualizado nas planilhas, num lugar só — o que você grava aqui aparece no Painel, nos Processos e no Financeiro</p></div></div>' +
    '<div class="segmento rt-abas" id="rt-abas" style="margin-bottom:14px">' + ABAS_ROTINA.map(([k, r]) => '<button type="button" data-rt-aba="' + k + '">' + r + '</button>').join('') + '</div>' +
    '<div id="rt-corpo"></div>';
  $('rt-abas').onclick = (ev) => { const b = ev.target.closest('[data-rt-aba]'); if (b) { E.rt.aba = b.dataset.rtAba; pintarRotina(); } };
  await pintarRotina();
};
async function pintarRotina() {
  document.querySelectorAll('#rt-abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.rtAba === E.rt.aba));
  const el = $('rt-corpo'); if (!el) return;
  el.innerHTML = '<div class="sub" style="padding:10px">Carregando…</div>';
  try { await ({ passivo: rotinaPassivo, processos: rotinaProcessos, guias: rotinaGuias, financeiro: rotinaFinanceiro, tarefas: rotinaTarefas })[E.rt.aba](el); }
  catch (e) { console.error(e); el.innerHTML = '<div class="card"><div class="card-bd msg-erro">' + esc(erroAmigavel(e)) + '</div></div>'; }
}
function filtroRotina(extra) {
  return '<div class="rt-filtros"><input type="search" class="busca" id="rt-busca" placeholder="Buscar empresa, CNPJ ou nº do processo…" value="' + esc(E.rt.busca) + '" autocomplete="off">' +
    '<select class="busca" id="rt-grupo" autocomplete="off"><option value="">Todos os grupos</option>' + E.grupos.map((g) => '<option value="' + g.id + '"' + (g.id === E.rt.grupo ? ' selected' : '') + '>' + esc(g.nome) + '</option>').join('') + '</select>' +
    (extra || '') + '</div>';
}
function ligarFiltroRotina(el, repintar) {
  let t; el.querySelector('#rt-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { E.rt.busca = ev.target.value; repintar(); }, 250); };
  el.querySelector('#rt-grupo').onchange = (ev) => { E.rt.grupo = ev.target.value; repintar(); };
  const f = el.querySelector('#rt-filtro'); if (f) f.onchange = (ev) => { E.rt.filtro = ev.target.value; repintar(); };
}
const simNaoSel = (nome, v) => '<select class="rt-in" data-c="' + nome + '"><option value=""' + (v == null ? ' selected' : '') + '>—</option><option value="true"' + (v === true ? ' selected' : '') + '>Sim</option><option value="false"' + (v === false ? ' selected' : '') + '>Não</option></select>';

// ── 1) Passivo e cadastro (edita na tabela e grava tudo de uma vez) ──
async function rotinaPassivo(el) {
  const certs = await q(sb.from('cliente_certificado').select('cliente_id, validade, senha, atualizado_por, atualizado_em')).catch(() => null);
  const C = {}; (certs || []).forEach((c) => { C[c.cliente_id] = c; });
  const podeCert = certs !== null;
  el.innerHTML = '<div class="card"><div class="card-hd">🏛 Passivo e cadastro das empresas<span class="sub">edite direto na tabela · valores em R$ · as linhas alteradas ficam marcadas até você salvar</span></div>' +
    '<div class="card-bd">' + filtroRotina('<select class="busca" id="rt-filtro" autocomplete="off">' + [['', 'Todas as empresas'], ['cert', 'Certificado vencido ou vence em 30 dias'], ['proc', 'Sem procuração'], ['capag', 'Sem CAPAG']]
      .map(([v, r]) => '<option value="' + v + '"' + (v === E.rt.filtro ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>' +
      '<span class="rt-salvar-box"><span class="sub" id="rt-alt"></span><button type="button" class="btn btn-p" id="rt-salvar" disabled>Salvar alterações</button></span>') +
    '<div class="tabela-wrap rt-grade" data-sem-pagina><table><thead><tr><th>Empresa</th>' + COLS_PASSIVO.map((c) => '<th class="rt-num">' + c[1] + '</th>').join('') +
      '<th class="rt-num">CEAT</th><th>Em operação</th><th>Procuração</th><th>Certificado (validade)</th>' + (podeCert ? '<th>Senha do certificado</th>' : '') + '<th>CAPAG</th></tr></thead><tbody id="rt-pas-corpo"></tbody></table></div>' +
    (podeCert ? '<div class="dica" style="margin-top:10px">🔒 A senha do certificado fica numa tabela separada: só quem pode <b>editar clientes</b> vê. Não copie a senha para e-mail ou WhatsApp.</div>' : '') + '</div></div>';
  const alterados = new Map();
  const pintar = () => {
    const b = normalizar(E.rt.busca), dig = soDigitos(E.rt.busca), lim = somarDias(hojeISO(), 30);
    const L = E.clientes.filter((c) => (!E.rt.grupo || c.grupo_id === E.rt.grupo) &&
      (!b || normalizar(c.nome + ' ' + (c.grupos ? c.grupos.nome : '')).includes(b) || (dig.length >= 3 && soDigitos(c.cpf_cnpj).includes(dig))) &&
      (E.rt.filtro !== 'cert' || !C[c.id] || !C[c.id].validade || C[c.id].validade <= lim) &&
      (E.rt.filtro !== 'proc' || c.procuracao !== true) && (E.rt.filtro !== 'capag' || !c.capag))
      .sort((x, y) => String(x.grupos ? x.grupos.nome : '').localeCompare(String(y.grupos ? y.grupos.nome : ''), 'pt-BR') || x.nome.localeCompare(y.nome, 'pt-BR'));
    let grp = null;
    $('rt-pas-corpo').innerHTML = L.length ? L.map((c) => {
      const g = c.grupos ? c.grupos.nome : 'Sem grupo', ct = C[c.id] || {};
      const venc = ct.validade && ct.validade < hojeISO() ? ' rt-vencido' : ct.validade && ct.validade <= lim ? ' rt-vence' : '';
      const cab = g !== grp ? (grp = g, '<tr class="gx-grp"><td colspan="' + (COLS_PASSIVO.length + 7 + (podeCert ? 1 : 0)) + '">' + esc(g) + '</td></tr>') : '';
      return cab + '<tr data-id="' + c.id + '"' + (alterados.has(c.id) ? ' class="rt-alterado"' : '') + '><td class="rt-emp"><b>' + esc(c.nome) + '</b><div class="sub">' + esc(mascaraDoc(c.cpf_cnpj) || '') + '</div></td>' +
        COLS_PASSIVO.map(([k]) => '<td><input class="rt-in rt-valor" data-mascara="brl" data-c="' + k + '" inputmode="decimal" value="' + (c[k] != null && c[k] !== '' ? 'R$ ' + valorParaCampo(c[k]) : '') + '"></td>').join('') +
        '<td><input class="rt-in rt-int" data-c="ceat_trt3" inputmode="numeric" value="' + (c.ceat_trt3 == null ? '' : esc(c.ceat_trt3)) + '"></td>' +
        '<td>' + simNaoSel('em_operacao', c.em_operacao) + '</td><td>' + simNaoSel('procuracao', c.procuracao) + '</td>' +
        '<td><input class="rt-in rt-data' + venc + '" data-cert="validade" placeholder="dd/mm/aaaa" value="' + (ct.validade ? dataBR(ct.validade) : '') + '"' + (podeCert ? '' : ' disabled title="Sem acesso"') + '></td>' +
        (podeCert ? '<td><span class="rt-senha"><input class="rt-in" type="password" data-cert="senha" autocomplete="new-password" value="' + esc(ct.senha || '') + '"><button type="button" class="btn btn-o btn-mini" data-ver-senha title="Mostrar senha">👁</button></span></td>' : '') +
        '<td><select class="rt-in" data-c="capag">' + CAPAG_OPCOES.map((v) => '<option value="' + v + '"' + ((c.capag || '') === v ? ' selected' : '') + '>' + (v || '—') + '</option>').join('') + '</select></td></tr>';
    }).join('') : '<tr><td colspan="12">' + vazio('Nenhuma empresa com esses filtros.') + '</td></tr>';
    $('rt-pas-corpo').querySelectorAll('.rt-data').forEach(mascaraData);
  };
  const contar = () => { $('rt-alt').textContent = alterados.size ? plural(alterados.size, 'empresa alterada', 'empresas alteradas') : ''; $('rt-salvar').disabled = !alterados.size; };
  $('rt-pas-corpo').oninput = $('rt-pas-corpo').onchange = (ev) => {
    const tr = ev.target.closest('tr[data-id]'); if (!tr || !ev.target.classList.contains('rt-in')) return;
    const a = alterados.get(tr.dataset.id) || { cli: {}, cert: {} };
    if (ev.target.dataset.c) a.cli[ev.target.dataset.c] = ev.target.value; else a.cert[ev.target.dataset.cert] = ev.target.value;
    alterados.set(tr.dataset.id, a); tr.classList.add('rt-alterado'); contar();
  };
  $('rt-pas-corpo').onclick = (ev) => { const b = ev.target.closest('[data-ver-senha]'); if (!b) return; const i = b.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; };
  $('rt-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    let n = 0;
    for (const [id, a] of alterados) {
      const up = {};
      Object.entries(a.cli).forEach(([k, v]) => {
        if (k === 'em_operacao' || k === 'procuracao') up[k] = v === '' ? null : v === 'true';
        else if (k === 'capag') up[k] = v;
        else if (k === 'ceat_trt3') up[k] = v.trim() === '' ? null : parseInt(soDigitos(v), 10) || 0;
        else { const n2 = lerValor(v); if (isNaN(n2)) throw new Error('Valor inválido: ' + v); up[k] = v.trim() === '' ? null : n2; }
      });
      if (Object.keys(up).length) await q(sb.from('clientes').update(up).eq('id', id).select('id'));
      if (Object.keys(a.cert).length) {
        const atual = Object.assign({}, C[id] || {}), row = { cliente_id: id, validade: atual.validade || null, senha: atual.senha || '' };
        if ('validade' in a.cert) { const d = lerDataBR(a.cert.validade); if (a.cert.validade.trim() && !d) throw new Error('Data do certificado incompleta: ' + a.cert.validade); row.validade = d ? d.iso : null; }
        if ('senha' in a.cert) row.senha = a.cert.senha;
        await q(sb.from('cliente_certificado').upsert(row).select('cliente_id'));
      }
      n++;
    }
    alterados.clear(); aviso('✓ ' + plural(n, 'empresa atualizada', 'empresas atualizadas') + '.');
    await carregarCadastros(true); await rotinaPassivo(el);
  });
  ligarFiltroRotina(el, pintar); pintar(); contar();
}

// ── 2) Processos: acompanhamento (o que está há mais tempo sem conferir vem primeiro) ──
async function rotinaProcessos(el) {
  const P = await q(sb.from('processos').select('id, numero, grupo_id, natureza, competencia, autor, reu, valor, procuracao, obs, atualizacao, ultima_movimentacao, ultima_movimentacao_em, grupos(nome)').limit(5000));
  el.innerHTML = '<div class="card"><div class="card-hd">⚖ Acompanhamento dos processos<span class="sub">confira no tribunal e registre: movimentação, decisão relevante, mudança de valor ou procuração</span></div>' +
    '<div class="card-bd">' + filtroRotina('<select class="busca" id="rt-filtro" autocomplete="off">' + [['', 'Todos'], ['30', 'Sem conferir há 30 dias ou mais'], ['proc', 'Sem procuração']]
      .map(([v, r]) => '<option value="' + v + '"' + (v === E.rt.filtro ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') +
    '<div class="tabela-wrap" data-sem-pagina><table><thead><tr><th>Processo</th><th>Natureza</th><th>Última movimentação</th><th>Conferido em</th><th>Procuração</th><th class="rt-num">Valor</th><th></th></tr></thead><tbody id="rt-proc-corpo"></tbody></table></div></div></div>';
  const pintar = () => {
    const b = normalizar(E.rt.busca), lim = somarDias(hojeISO(), -30);
    const L = P.filter((p) => (!E.rt.grupo || p.grupo_id === E.rt.grupo) && (!b || normalizar([p.numero, p.autor, p.reu, p.natureza, p.grupos ? p.grupos.nome : ''].join(' ')).includes(b)) &&
      (E.rt.filtro !== '30' || !p.ultima_movimentacao_em || p.ultima_movimentacao_em <= lim) && (E.rt.filtro !== 'proc' || p.procuracao !== true))
      .sort((x, y) => String(x.ultima_movimentacao_em || '').localeCompare(String(y.ultima_movimentacao_em || '')));
    $('rt-proc-corpo').innerHTML = L.length ? L.map((p) => '<tr><td><b class="mono">' + esc(p.numero) + '</b><div class="sub">' + esc((p.grupos ? p.grupos.nome : '') + (p.reu ? ' · ' + p.reu : '')) + '</div></td>' +
      '<td>' + esc(p.natureza || '—') + '</td><td class="rt-mov">' + (p.ultima_movimentacao ? esc(p.ultima_movimentacao) : '<span class="sub">nada registrado</span>') + '</td>' +
      '<td>' + (p.ultima_movimentacao_em ? dataBR(p.ultima_movimentacao_em) : '<span class="pill vencido">nunca</span>') + '</td>' +
      '<td><span class="pill ' + (p.procuracao ? 'pago' : 'vencido') + '">' + (p.procuracao ? 'Sim' : 'Não') + '</span></td>' +
      '<td class="rt-num">' + (p.valor ? brl(p.valor) : '—') + '</td>' +
      '<td class="acoes-l"><button type="button" class="btn btn-p btn-mini" data-mov="' + p.id + '">+ Registrar</button></td></tr>').join('')
      : '<tr><td colspan="7">' + vazio('Nenhum processo com esses filtros.') + '</td></tr>';
  };
  $('rt-proc-corpo').onclick = (ev) => { const b = ev.target.closest('[data-mov]'); if (b) janelaMovimentacao(b.dataset.mov, () => rotinaProcessos(el)); };
  ligarFiltroRotina(el, pintar); pintar();
}
// janela "Registrar movimentação" (também no detalhe do processo, em Jurídico → Processos)
async function janelaMovimentacao(processoId, depois) {
  const [p] = await q(sb.from('processos').select('id, numero, valor, obs, grupos(nome)').eq('id', processoId));
  if (!p) return aviso('Processo não encontrado.', true);
  const H = await q(sb.from('processo_movimentacoes').select('*').eq('processo_id', processoId).order('data', { ascending: false }).order('criado_em', { ascending: false }).limit(30)).catch(() => []);
  const rot = Object.fromEntries(TIPOS_MOV);
  const j = abrirJanela({ titulo: 'Processo ' + p.numero, larga: true,
    corpo: '<form class="form-grid" id="mov-form">' +
      campo('Data', '<input name="data" value="' + dataBR(hojeISO()) + '" placeholder="dd/mm/aaaa">') +
      campo('O que aconteceu', '<select name="tipo">' + TIPOS_MOV.map(([v, r]) => '<option value="' + v + '">' + r + '</option>').join('') + '</select>') +
      campo('Descrição', '<textarea name="descricao" rows="3" placeholder="Ex.: Juntada de petição; sentença de procedência; valor atualizado pela contadoria…"></textarea>', 'inteiro') +
      campo('Valor novo', '<input name="valor" data-mascara="brl" inputmode="decimal" placeholder="' + (p.valor ? 'hoje: ' + brl(p.valor) : 'R$ 0,00') + '">', 'mov-valor') +
      '</form>' +
      '<div class="mov-hist"><div class="gx-det-tit">Histórico' + (p.grupos ? ' · ' + esc(p.grupos.nome) : '') + '</div>' +
      (H.length ? H.map((m) => '<div class="mov-it"><span class="mov-d">' + dataBR(m.data) + '</span><span class="pill neutro">' + esc(rot[m.tipo] || m.tipo) + '</span><span class="mov-t">' +
        esc(m.descricao || '') + (m.valor_novo != null ? ' <b>' + brl(m.valor_novo) + '</b>' : '') + '</span><span class="sub">' + esc(m.quem || '') + '</span></div>').join('')
        : '<div class="sub">Nada registrado ainda.</div>') + '</div>',
    rodape: '<span class="sub">A "última movimentação" do processo é atualizada ao salvar.</span><div class="acoes"><button type="button" class="btn btn-p" data-mov-ok>Salvar</button></div>' });
  const f = j.querySelector('#mov-form'); mascaraData(f.data);
  const mostrarValor = () => { j.querySelector('.mov-valor').hidden = f.tipo.value !== 'valor'; };
  f.tipo.onchange = mostrarValor; mostrarValor();
  j.querySelector('[data-mov-ok]').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const d = lerDataBR(f.data.value); if (!d) throw new Error('Preencha a data (dd/mm/aaaa).');
    const tipo = f.tipo.value, desc = f.descricao.value.trim();
    if (tipo !== 'sem_novidade' && tipo !== 'procuracao' && tipo !== 'valor' && !desc) throw new Error('Descreva o que aconteceu.');
    const row = { processo_id: processoId, data: d.iso, tipo, descricao: desc || rot[tipo] };
    if (tipo === 'valor') { const v = lerValor(f.valor.value); if (!v) throw new Error('Informe o valor novo.'); row.valor_novo = v; if (!desc) row.descricao = 'Valor alterado para ' + brl(v); }
    await q(sb.from('processo_movimentacoes').insert(row).select('id'));
    aviso('✓ Movimentação registrada.'); fecharJanela(j); if (depois) depois();
  });
  return j;
}

// ── 3) Guias ──
async function rotinaGuias(el) {
  el.innerHTML = '<div class="rt-duas"><div id="rt-guias-p" class="gs"></div><div id="rt-guias-a" class="gs"></div></div>';
  await Promise.all([cardGuias('parcelas', $('rt-guias-p')), cardGuias('acordos', $('rt-guias-a'))]);
}

// ── 4) Financeiro do escritório: atalhos ──
async function rotinaFinanceiro(el) {
  const h = hojeISO(), fim = somarDias(h, 7);
  const L = await q(sb.from('lancamentos').select('id, tipo, empresa, valor, vencimento, pago, descricao, redutor').eq('pago', false).lte('vencimento', fim).order('vencimento').limit(300)).catch(() => []);
  const cont = (emp, tipo, cond) => L.filter((x) => x.empresa === emp && x.tipo === tipo && cond(x));
  const atr = (x) => x.vencimento < h, sem = (x) => x.vencimento >= h;
  const bloco = (emp, rot, painel) => '<div class="card"><div class="card-hd">' + rot + '</div><div class="card-bd rt-fin">' +
    [['A receber em atraso', cont(emp, 'receita', atr), 'vencido'], ['A receber nos próximos 7 dias', cont(emp, 'receita', sem), 'hoje'], ['A pagar em atraso', cont(emp, 'despesa', atr), 'vencido'], ['A pagar nos próximos 7 dias', cont(emp, 'despesa', sem), 'hoje']]
      .map(([r, l, c]) => '<div class="rt-fin-l"><span>' + r + '</span><span class="pill ' + (l.length ? c : 'neutro') + '">' + l.length + '</span><b>' + brl(l.reduce((s, x) => s + vl(x), 0)) + '</b></div>').join('') +
    '<div class="acoes" style="margin-top:10px"><button type="button" class="btn btn-o" data-fin-ir="' + painel + '">Abrir ' + rot + '</button>' +
      '<button type="button" class="btn btn-p" data-fin-novo="' + emp + '|receita">+ Receita</button><button type="button" class="btn btn-o" data-fin-novo="' + emp + '|despesa">+ Despesa</button></div></div></div>';
  el.innerHTML = '<div class="rt-duas">' + (pode('financeiro_juridico') ? bloco('escritorio', 'Financeiro — Jurídico', 'financeiro') : '') + (pode('financeiro_contab') ? bloco('contabilidade', 'Financeiro — Contabilidade', 'financeiroContab') : '') + '</div>' +
    (!pode('financeiro_juridico') && !pode('financeiro_contab') ? vazio('Você não tem acesso ao Financeiro.') : '');
  el.onclick = (ev) => {
    const b = ev.target.closest('[data-fin-ir],[data-fin-novo]'); if (!b) return;
    if (b.dataset.finIr) return irParaTela(b.dataset.finIr);
    const [empresa, tipo] = b.dataset.finNovo.split('|'); formLancamento({ tipo, empresa }, () => rotinaFinanceiro(el));
  };
}

// ── 5) Minhas tarefas ──
async function rotinaTarefas(el) {
  const T = (await q(sb.from('tarefas').select('*, clientes(nome)').not('status', 'in', '(concluida,cancelada)').order('prazo', { nullsFirst: false }).limit(1000)).catch(() => []))
    .filter((t) => ehMinha(t) && !/^(cob|parc|aco):/.test(t.chave_regra || ''));
  const h = hojeISO();
  el.innerHTML = '<div class="card"><div class="card-hd">✓ Minhas tarefas<span class="sub">abertas, por prazo</span><button type="button" class="btn btn-p btn-mini" id="rt-nova-t" style="margin-left:auto">+ Tarefa</button></div><div class="card-bd">' +
    (T.length ? '<div class="tabela-wrap" data-sem-pagina><table><thead><tr><th>Tarefa</th><th>Cliente</th><th>Prazo</th><th>Status</th></tr></thead><tbody>' + T.map((t) =>
      '<tr class="clicavel" data-tarefa="' + t.id + '"><td>' + esc(t.titulo) + '</td><td>' + esc(t.clientes ? t.clientes.nome : '—') + '</td><td>' +
      (t.prazo ? '<span class="' + (t.prazo < h ? 'dias-r' : t.prazo === h ? 'dias-a' : '') + '">' + dataBR(t.prazo) + '</span>' : '—') + '</td><td>' + esc(STATUS_TAREFA[t.status] || t.status || '') + '</td></tr>').join('') + '</tbody></table></div>'
      : vazio('Nenhuma tarefa aberta com você. 🎉', '+ Tarefa', '#rt-nova-t')) + '</div></div>';
  $('rt-nova-t').onclick = () => formTarefa({}, () => rotinaTarefas(el));
  el.querySelectorAll('[data-tarefa]').forEach((tr) => tr.onclick = () => abrirTarefa(tr.dataset.tarefa, () => rotinaTarefas(el)));
}
