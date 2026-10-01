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
const ABAS_ROTINA = [['passivo', '🏛 Passivo e cadastro'], ['processos', '⚖ Processos'], ['parcs', '📋 Controle dos parcelamentos'], ['acs', '📋 Controle dos acordos'], ['planilha', '🧪 Planilha de parcelamentos (teste)'], ['financeiro', '💰 Financeiro'], ['tarefas', '✓ Minhas tarefas']];
const TIPOS_MOV = [['movimentacao', 'Movimentação'], ['decisao', 'Decisão relevante'], ['valor', 'Mudança de valor'], ['procuracao', 'Procuração juntada'], ['sem_novidade', 'Conferido — sem novidade']];
const PARES_PASSIVO = [['rfb', 'RFB'], ['pgfn', 'PGFN'], ['age_mg', 'AGE/MG']];
const COLS_PASSIVO = [['rfb', 'RFB'], ['rfb_negociada', 'RFB negociada'], ['pgfn', 'PGFN'], ['pgfn_negociada', 'PGFN negociada'], ['age_mg', 'AGE/MG'], ['age_mg_negociada', 'AGE/MG negociada']];
const CAPAG_OPCOES = ['', 'A', 'B', 'C', 'D', 'Omisso'];

TELAS.rotina = async function () {
  E.rt = Object.assign({ aba: 'passivo', busca: '', grupo: '', filtro: '' }, E.rt || {});
  if (E.rt.aba === 'guias') E.rt.aba = 'parcs';   // Backup 34: a aba "para emitir" saiu — a emissão é feita no Controle
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
  try { await ({ passivo: rotinaPassivo, processos: rotinaProcessos, parcs: rotinaParcelamentos, acs: rotinaAcordos, planilha: rotinaPlanilha, financeiro: rotinaFinanceiro, tarefas: rotinaTarefas })[E.rt.aba](el); }
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
// Backup 29: Sim verde / Não vermelho; CAPAG nas cores de sempre (A e B verde, C amarelo, D e Omisso vermelho)
const corSel = (sel) => { const v = sel.value, k = sel.dataset.c;
  sel.classList.remove('rt-verde', 'rt-vermelho', 'rt-amarelo');
  const c = k === 'capag' ? ({ A: 'rt-verde', B: 'rt-verde', C: 'rt-amarelo', D: 'rt-vermelho', Omisso: 'rt-vermelho' }[v] || '') : v === 'true' ? 'rt-verde' : v === 'false' ? 'rt-vermelho' : '';
  if (c) sel.classList.add(c); };
const simNaoSel = (nome, v) => '<select class="rt-in rt-sn" data-c="' + nome + '"><option value=""' + (v == null ? ' selected' : '') + '>—</option><option value="true"' + (v === true ? ' selected' : '') + '>Sim</option><option value="false"' + (v === false ? ' selected' : '') + '>Não</option></select>';

// ── 1) Passivo e cadastro (edita na tabela e grava tudo de uma vez) ──
async function rotinaPassivo(el) {
  const certs = await q(sb.from('cliente_certificado').select('cliente_id, validade, senha, atualizado_por, atualizado_em')).catch(() => null);
  const C = {}; (certs || []).forEach((c) => { C[c.cliente_id] = c; });
  const podeCert = certs !== null;
  const SIT = await situacaoRotina('passivo');
  el.innerHTML = '<div class="card"><div class="card-hd">🏛 Passivo e cadastro das empresas<span class="sub">edite direto na tabela · valores em R$ · as linhas alteradas ficam marcadas até você salvar</span></div>' +
    '<div class="card-bd">' + filtroRotina('<select class="busca" id="rt-filtro" autocomplete="off">' + [['', 'Todas as empresas'], ['cert', 'Sem certificado'], ['proc', 'Sem procuração'], ['capag', 'Sem CAPAG']]
      .map(([v, r]) => '<option value="' + v + '"' + (v === E.rt.filtro ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>' +
      '<span class="rt-salvar-box"><button type="button" class="btn btn-o" id="rt-hist">🕘 Histórico do passivo</button><span class="sub" id="rt-alt"></span><button type="button" class="btn btn-p" id="rt-salvar" disabled>Salvar alterações</button></span>') +
    // Backup 33: tabela cabe na tela — cada órgão numa coluna só (em aberto em cima, negociada embaixo); a senha GOV saiu da conferência (fica no 🔑)
    '<div class="tabela-wrap rt-grade rt-pas rt-sem-altura" data-sem-pagina><table><thead><tr><th>Empresa</th><th>Conferência</th>' + PARES_PASSIVO.map(([k, r]) => '<th class="rt-num">' + r + '<small>em aberto · negociada</small></th>').join('') +
      '<th class="rt-num">CEAT</th><th>Em operação</th><th>Procuração</th><th>Certificado</th><th>CAPAG</th></tr></thead><tbody id="rt-pas-corpo"></tbody></table></div>' + '</div></div>';
  const alterados = new Map();
  const pintar = () => {
    const b = normalizar(E.rt.busca), dig = soDigitos(E.rt.busca), lim = somarDias(hojeISO(), 30);
    const L = E.clientes.filter((c) => (!E.rt.grupo || c.grupo_id === E.rt.grupo) &&
      (!b || normalizar(c.nome + ' ' + (c.grupos ? c.grupos.nome : '')).includes(b) || (dig.length >= 3 && soDigitos(c.cpf_cnpj).includes(dig))) &&
      (E.rt.filtro !== 'cert' || c.certificado !== true) &&
      (E.rt.filtro !== 'proc' || c.procuracao !== true) && (E.rt.filtro !== 'capag' || !c.capag))
      .sort((x, y) => String(x.grupos ? x.grupos.nome : '').localeCompare(String(y.grupos ? y.grupos.nome : ''), 'pt-BR') || x.nome.localeCompare(y.nome, 'pt-BR'));
    let grp = null;
    $('rt-pas-corpo').innerHTML = L.length ? L.map((c) => {
      const g = c.grupos ? c.grupos.nome : 'Sem grupo', ct = C[c.id] || {};
      const cab = g !== grp ? (grp = g, '<tr class="gx-grp"><td colspan="' + (PARES_PASSIVO.length + 7) + '">' + esc(g) + '</td></tr>') : '';
      return cab + '<tr data-id="' + c.id + '"' + (alterados.has(c.id) ? ' class="rt-alterado"' : '') + '><td class="rt-emp"><b>' + esc(c.nome) + '</b><div class="sub">' + esc(mascaraDoc(c.cpf_cnpj) || '') + ' <button type="button" class="rt-hist-bt" data-hist="' + c.id + '" title="Histórico de alterações desta empresa">🕘</button>' + (podeCert ? '<button type="button" class="rt-hist-bt" data-senha="' + c.id + '" title="Senha GOV (só quem pode editar clientes vê)">🔑</button>' : '') + '</div></td>' +
        '<td>' + celulaConferencia(SIT[c.id], c.id) + '</td>' +
        PARES_PASSIVO.map(([k, r]) => '<td class="rt-par">' + [k, k + '_negociada'].map((kk, i) => '<input class="rt-in rt-valor' + (i ? ' rt-neg' : '') + '" data-mascara="brl" data-c="' + kk + '" inputmode="decimal" aria-label="' + r + (i ? ' negociada' : ' em aberto') + '" placeholder="' + (i ? 'negociada' : 'em aberto') + '" value="' + (c[kk] != null && c[kk] !== '' ? 'R$ ' + valorParaCampo(c[kk]) : '') + '">').join('') + '</td>').join('') +
        '<td><input class="rt-in rt-int" data-c="ceat_trt3" inputmode="numeric" value="' + (c.ceat_trt3 == null ? '' : esc(c.ceat_trt3)) + '"></td>' +
        '<td>' + simNaoSel('em_operacao', c.em_operacao) + '</td><td>' + simNaoSel('procuracao', c.procuracao) + '</td>' +
        '<td>' + simNaoSel('certificado', c.certificado) + '</td>' +
        '<td><select class="rt-in rt-sn" data-c="capag">' + CAPAG_OPCOES.map((v) => '<option value="' + v + '"' + ((c.capag || '') === v ? ' selected' : '') + '>' + (v || '—') + '</option>').join('') + '</select></td></tr>';
    }).join('') : '<tr><td colspan="12">' + vazio('Nenhuma empresa com esses filtros.') + '</td></tr>';
    $('rt-pas-corpo').querySelectorAll('select.rt-sn').forEach(corSel);
  };
  const contar = () => { $('rt-alt').textContent = alterados.size ? plural(alterados.size, 'empresa alterada', 'empresas alteradas') : ''; $('rt-salvar').disabled = !alterados.size; };
  $('rt-pas-corpo').oninput = $('rt-pas-corpo').onchange = (ev) => {
    const tr = ev.target.closest('tr[data-id]'); if (!tr || !ev.target.classList.contains('rt-in')) return;
    if (ev.target.classList.contains('rt-sn')) corSel(ev.target);
    const a = alterados.get(tr.dataset.id) || { cli: {}, cert: {} };
    if (ev.target.dataset.c) a.cli[ev.target.dataset.c] = ev.target.value; else a.cert[ev.target.dataset.cert] = ev.target.value;
    alterados.set(tr.dataset.id, a); tr.classList.add('rt-alterado'); contar();
  };
  $('rt-pas-corpo').onclick = (ev) => {
    const h2 = ev.target.closest('[data-hist]'); if (h2) return janelaHistoricoPassivo(h2.dataset.hist);
    const ks = ev.target.closest('[data-senha]'); if (ks) return janelaSenhaGov(ks.dataset.senha, C);
    const cf = ev.target.closest('[data-conferir]'); if (cf) return comBotao(cf, async () => {
      if (alterados.has(cf.dataset.conferir)) throw new Error('Esta linha tem alteração: clique em "Salvar alterações".');
      await q(sb.rpc('conferir_rotina', { p_area: 'passivo', p_ids: [cf.dataset.conferir], p_alterou: false }));
      SIT[cf.dataset.conferir] = Object.assign({}, SIT[cf.dataset.conferir], { conferido_em: new Date().toISOString(), conferido_por: E.perfil ? E.perfil.nome : '', conferido_alterou: false });
      cf.closest('td').innerHTML = celulaConferencia(SIT[cf.dataset.conferir], cf.dataset.conferir); });
    const b = ev.target.closest('[data-ver-senha]'); if (!b) return; const i = b.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; };
  $('rt-hist').onclick = () => janelaHistoricoPassivo(null);
  $('rt-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    let n = 0;
    for (const [id, a] of alterados) {
      const up = {};
      Object.entries(a.cli).forEach(([k, v]) => {
        if (k === 'em_operacao' || k === 'procuracao' || k === 'certificado') up[k] = v === '' ? null : v === 'true';
        else if (k === 'capag') up[k] = v;
        else if (k === 'ceat_trt3') up[k] = v.trim() === '' ? null : parseInt(soDigitos(v), 10) || 0;
        else { const n2 = lerValor(v); if (isNaN(n2)) throw new Error('Valor inválido: ' + v); up[k] = v.trim() === '' ? null : n2; }
      });
      if (Object.keys(up).length) await q(sb.from('clientes').update(up).eq('id', id).select('id'));
      if (Object.keys(a.cert).length) {
        const atual = Object.assign({}, C[id] || {}), row = { cliente_id: id, validade: atual.validade || null, senha: atual.senha || '' };
        if ('senha' in a.cert) row.senha = a.cert.senha;
        await q(sb.from('cliente_certificado').upsert(row).select('cliente_id'));
      }
      n++;
    }
    if (alterados.size) await q(sb.rpc('conferir_rotina', { p_area: 'passivo', p_ids: [...alterados.keys()], p_alterou: true })).catch(() => null);
    alterados.clear(); aviso('✓ ' + plural(n, 'empresa atualizada', 'empresas atualizadas') + '.');
    await carregarCadastros(true); await rotinaPassivo(el);
  });
  ligarFiltroRotina(el, pintar); pintar(); contar();
}

// Backup 33: senha GOV fora da tabela de conferência — numa janela só para quem pode editar clientes
function janelaSenhaGov(clienteId, C) {
  const c = E.clientes.find((x) => x.id === clienteId) || {}, ct = C[clienteId] || {};
  const j = abrirJanela({ titulo: '🔑 Senha GOV — ' + (c.nome || ''),
    corpo: '<p class="sub" style="margin-bottom:10px">Fica numa tabela separada: só quem pode <b>editar clientes</b> vê. Não copie a senha para e-mail ou WhatsApp.</p>' +
      '<label class="campo"><span>Senha GOV</span><span class="rt-senha"><input class="rt-in" type="password" id="sg-senha" autocomplete="new-password" value="' + esc(ct.senha || '') + '"><button type="button" class="btn btn-o btn-mini" id="sg-ver" title="Mostrar senha">👁</button></span></label>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="sg-ok">Salvar</button></div>' });
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#sg-ver').onclick = () => { const i = j.querySelector('#sg-senha'); i.type = i.type === 'password' ? 'text' : 'password'; };
  j.querySelector('#sg-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const senha = j.querySelector('#sg-senha').value;
    await q(sb.from('cliente_certificado').upsert({ cliente_id: clienteId, validade: ct.validade || null, senha }).select('cliente_id'));
    C[clienteId] = Object.assign({}, ct, { cliente_id: clienteId, senha }); aviso('✓ Senha GOV salva.'); fecharJanela(j);
  });
}
// Backup 31: conferência da linha — "✓ Conferido" mesmo quando nada mudou (mostra onde o estagiário parou e se esqueceu algo)
async function situacaoRotina(area) {
  const L = await q(sb.rpc('rotina_situacao', { p_area: area })).catch(() => []);
  const m = {}; (L || []).forEach((x) => { m[x.registro_id] = x; }); return m;
}
const diasDesde = (ts) => ts ? Math.floor((Date.now() - new Date(ts).getTime()) / 864e5) : null;
function celulaConferencia(x, id) {
  x = x || {};
  // Backup 33: mais de 15 dias sem conferir = amarelo; mais de 30 (ou nunca) = vermelho. Datas no fuso de quem olha (Brasília)
  const d = diasDesde(x.conferido_em), cls = d == null || d > 30 ? 'rt-cf-nunca' : d > 15 ? 'rt-cf-velho' : 'rt-cf-ok';
  const alt = x.alterado_em ? 'Última alteração: ' + dataHoraBR(x.alterado_em) + (x.alterado_por ? ' por ' + x.alterado_por : '') : 'Sem alteração registrada';
  return '<div class="rt-cf ' + cls + '" title="' + esc(alt) + '"><span class="rt-cf-txt">' +
      (x.conferido_em ? (x.conferido_alterou ? '✎ alterado ' : '✓ conferido ') + dataLocal(x.conferido_em) + '<small>' + esc(x.conferido_por || '') + (d > 15 ? ' · há ' + d + ' d' : '') + '</small>' : 'nunca conferido') +
      (x.alterado_em ? '<small class="rt-cf-alt">alt. ' + dataLocal(x.alterado_em) + '</small>' : '') + '</span>' +
    '<button type="button" class="btn btn-o btn-mini" data-conferir="' + id + '" title="Fui até esta linha e os dados continuam certos">✓</button></div>';
}

// Backup 29: histórico de alterações do passivo (quem mudou, quando, de quanto para quanto)
const CAMPOS_PASSIVO = { rfb: 'RFB', rfb_negociada: 'RFB negociada', pgfn: 'PGFN', pgfn_negociada: 'PGFN negociada', age_mg: 'AGE/MG', age_mg_negociada: 'AGE/MG negociada',
  sefaz_mg: 'SEFAZ/MG', ceat_trt3: 'CEAT', em_operacao: 'Em operação', procuracao: 'Procuração', certificado: 'Certificado', capag: 'CAPAG' };
async function janelaHistoricoPassivo(clienteId) {
  const L = await q(sb.rpc('historico_passivo', { p_cliente: clienteId || null, p_limite: 500 }));
  const cli = clienteId ? E.clientes.find((c) => c.id === clienteId) : null;
  const fmt = (k, v) => v == null || v === '' ? '—' : /^(em_operacao|procuracao|certificado)$/.test(k) ? (v === true || v === 'true' ? 'Sim' : 'Não') : k === 'capag' || k === 'ceat_trt3' ? String(v) : brl(v);
  return relatorioTabela({ titulo: 'Histórico do passivo' + (cli ? ' — ' + cli.nome : ''), colunas: ['Quando', 'Quem', 'Empresa', 'Campo', 'Antes', 'Depois'],
    linhas: (L || []).map((x) => [dataHoraBR(x.quando), x.quem || '—', x.cliente || '—', CAMPOS_PASSIVO[x.campo] || x.campo, fmt(x.campo, x.antes), fmt(x.campo, x.depois)]),
    ids: (L || []).map((x) => x.cliente_id) });
}

// ── 2) Processos: acompanhamento (o que está há mais tempo sem conferir vem primeiro) ──
async function rotinaProcessos(el) {
  const P = await q(sb.from('processos').select('id, numero, grupo_id, natureza, competencia, autor, reu, valor, procuracao, obs, atualizacao, ultima_movimentacao, ultima_movimentacao_em, grupos(nome)').limit(5000));
  // Backup 31: a última conferência de cada processo (quem, quando e se mudou algo ou foi "sem novidade")
  const ULT = {}; (await q(sb.from('processo_movimentacoes').select('processo_id, tipo, quem, criado_em').order('criado_em', { ascending: false }).limit(10000)).catch(() => []))
    .forEach((m) => { if (!ULT[m.processo_id]) ULT[m.processo_id] = m; });
  el.innerHTML = '<div class="card"><div class="card-hd">⚖ Acompanhamento dos processos<span class="sub">confira no tribunal e registre: movimentação, decisão relevante, mudança de valor ou procuração</span>' +
      '<button type="button" class="btn btn-p btn-mini" id="rt-novo-proc" style="margin-left:auto">+ Processo</button></div>' +
    '<div class="card-bd">' + filtroRotina('<select class="busca" id="rt-filtro" autocomplete="off">' + [['', 'Todos'], ['30', 'Sem conferir há 30 dias ou mais'], ['proc', 'Sem procuração']]
      .map(([v, r]) => '<option value="' + v + '"' + (v === E.rt.filtro ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') +
    '<div class="tabela-wrap" data-sem-pagina><table><thead><tr><th>Processo</th><th>Conferido em</th><th>Natureza</th><th>Última movimentação</th><th>Procuração</th><th class="rt-num">Valor</th><th></th></tr></thead><tbody id="rt-proc-corpo"></tbody></table></div></div></div>';
  const pintar = () => {
    const b = normalizar(E.rt.busca), lim = somarDias(hojeISO(), -30);
    const L = P.filter((p) => (!E.rt.grupo || p.grupo_id === E.rt.grupo) && (!b || normalizar([p.numero, p.autor, p.reu, p.natureza, p.grupos ? p.grupos.nome : ''].join(' ')).includes(b)) &&
      (E.rt.filtro !== '30' || !p.ultima_movimentacao_em || p.ultima_movimentacao_em <= lim) && (E.rt.filtro !== 'proc' || p.procuracao !== true))
      // Backup 29: separados por grupo (como no Passivo); dentro do grupo, o que está há mais tempo sem conferir vem primeiro
      .sort((x, y) => String(x.grupos ? x.grupos.nome : '\uffff').localeCompare(String(y.grupos ? y.grupos.nome : '\uffff'), 'pt-BR') || String(x.ultima_movimentacao_em || '').localeCompare(String(y.ultima_movimentacao_em || '')));
    let grp = null;
    $('rt-proc-corpo').innerHTML = L.length ? L.map((p) => { const g = p.grupos ? p.grupos.nome : 'Sem grupo';
      return (g !== grp ? (grp = g, '<tr class="gx-grp"><td colspan="7">' + esc(g) + ' <span class="sub">' + plural(L.filter((z) => (z.grupos ? z.grupos.nome : 'Sem grupo') === g).length, 'processo', 'processos') + '</span></td></tr>') : '') + '<tr><td><b class="mono">' + esc(p.numero) + '</b><div class="sub">' + esc((p.grupos ? p.grupos.nome : '') + (p.reu ? ' · ' + p.reu : '')) + '</div></td>' +
      '<td>' + celulaConfProc(p, ULT[p.id]) + '</td>' +
      '<td>' + esc(p.natureza || '—') + '</td><td class="rt-mov">' + (p.ultima_movimentacao ? esc(p.ultima_movimentacao) : '<span class="sub">nada registrado</span>') + '</td>' +
      '<td><span class="pill ' + (p.procuracao ? 'pago' : 'vencido') + '">' + (p.procuracao ? 'Sim' : 'Não') + '</span></td>' +
      '<td class="rt-num">' + (p.valor ? brl(p.valor) : '—') + '</td>' +
      '<td class="acoes-l"><button type="button" class="btn btn-o btn-mini" data-sem-nov="' + p.id + '" title="Conferi no tribunal e não há novidade">✓ Sem novidade</button><button type="button" class="btn btn-p btn-mini" data-mov="' + p.id + '">+ Registrar</button></td></tr>'; }).join('')
      : '<tr><td colspan="7">' + vazio('Nenhum processo com esses filtros.') + '</td></tr>';
  };
  $('rt-proc-corpo').onclick = (ev) => {
    const sn = ev.target.closest('[data-sem-nov]');
    if (sn) return comBotao(sn, async () => {
      await q(sb.from('processo_movimentacoes').insert({ processo_id: sn.dataset.semNov, data: hojeISO(), tipo: 'sem_novidade', descricao: 'Conferido — sem novidade' }).select('id'));
      aviso('✓ Conferência registrada (sem novidade).'); await rotinaProcessos(el); });
    const b = ev.target.closest('[data-mov]'); if (b) janelaMovimentacao(b.dataset.mov, () => rotinaProcessos(el)); };
  // processo novo: o mesmo formulário de Jurídico → Processos (+ Lançar → Processo)
  $('rt-novo-proc').onclick = () => { if (window.ERP_EDITOR && window.ERP_EDITOR.abrirFormulario) window.ERP_EDITOR.abrirFormulario('processos', null, { carteira: 'Ativo', status: 'Em andamento' }); else aviso('Use + Lançar → Processo.', true); };
  ligarFiltroRotina(el, pintar); pintar();
}
function celulaConfProc(p, m) {
  if (!p.ultima_movimentacao_em) return '<span class="pill vencido">nunca</span>';
  const d = Math.floor((new Date(hojeISO() + 'T12:00:00') - new Date(p.ultima_movimentacao_em + 'T12:00:00')) / 864e5);
  return '<div class="rt-cf ' + (d > 30 ? 'rt-cf-nunca' : d > 15 ? 'rt-cf-velho' : 'rt-cf-ok') + '"><span class="rt-cf-txt">' + (m && m.tipo !== 'sem_novidade' ? '✎ ' : '✓ ') + dataBR(p.ultima_movimentacao_em) +
    '<small>' + esc(m ? (m.quem || '') + (m.tipo === 'sem_novidade' ? ' · sem novidade' : ' · com alteração') : '') + (d > 15 ? ' · há ' + d + ' d' : '') + '</small></span></div>';
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
// ── 3) Backup 31/33/34: CONTROLE dos parcelamentos e dos acordos — planilha por mês (5 meses atrás, o atual e 2 à frente).
// Backup 34: cada mês tem EMISSÃO e PAGAMENTO. A emissão é feita AQUI: marque as parcelas (meses) e clique em "Enviar por empresa"
// (a mesma janela/e-mail de sempre); ao enviar, a parcela fica marcada como emitida. Vencida sem pagamento pode ser marcada de novo
// no mês seguinte (reemissão com valor atualizado). O valor de cada parcela é editável (o mês sem valor herda o último lançado).
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const _rtAberto = {};
const _rtSel = { parcelas: new Set(), acordos: new Set() };
const rotinaParcelamentos = (el) => rotinaControle(el, 'parcelas');
const rotinaAcordos = (el) => rotinaControle(el, 'acordos');
const emitidaRt = (x) => !!x.emitida_em || /sim|emitid/i.test(x.emissao || '');
async function rotinaControle(el, tipo) {
  const parc = tipo === 'parcelas', chaveMes = 'mesIni_' + tipo, SEL = _rtSel[tipo];
  E.rt[chaveMes] = E.rt[chaveMes] == null ? -5 : E.rt[chaveMes];
  const h = hojeISO(), base = new Date(h.slice(0, 7) + '-01T12:00:00');
  const mes = (k) => { const d = new Date(base); d.setMonth(d.getMonth() + k); return d.toISOString().slice(0, 7); };
  const MS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => mes(E.rt[chaveMes] + i));
  if (!E.clientes.length) await carregarCadastros();
  let IT, PC, SIT = {};
  if (parc) {
    const [PA, P2, S2] = await Promise.all([
      q(sb.from('parcelamentos').select('id, empresa, cnpj, local, natureza, numero, total_parcelas, valor_ultima_parcela, grupo_id, emitimos_guia').limit(5000)),
      q(sb.from('parcelas').select('id, parcelamento_id, numero, vencimento, pago, emitida_em, emissao, reenvio_em, reenvio_valor, valor, guia_doc').order('vencimento').limit(50000)),
      situacaoRotina('parcelamentos')]);
    SIT = S2;
    const porId = {}; PA.forEach((p) => { porId[p.id] = p; });
    // valor de cada parcela: o lançado; sem lançamento, o último lançado antes dela; sem nenhum, o "valor da última parcela"
    const ult = {};
    PC = P2.filter((x) => porId[x.parcelamento_id]).map((x) => { const p = porId[x.parcelamento_id];
      if (x.valor != null && Number(x.valor) > 0) ult[p.id] = Number(x.valor);
      return Object.assign(x, { item: p.id, rot: (x.numero || '?') + (p.total_parcelas ? '/' + p.total_parcelas : ''), valorEf: ult[p.id] != null ? ult[p.id] : Number(p.valor_ultima_parcela) || 0,
        lancado: x.valor != null && Number(x.valor) > 0, parcelamentos: p, quem: p.empresa, grupo_id: p.grupo_id,
        cliente_id: (E.clientes.find((c) => (soDigitos(p.cnpj) && soDigitos(c.cpf_cnpj) === soDigitos(p.cnpj)) || c.nome === p.empresa) || {}).id || null }); });
    // Backup 35: valor residual = valor da última parcela lançada × parcelas que faltam
    const residual = (p) => { const ps = P2.filter((x) => x.parcelamento_id === p.id), pagas = ps.filter((x) => x.pago).length, tot = Number(p.total_parcelas) || ps.length;
      return { falta: Math.max(0, tot - pagas), v: (Number(p.valor_ultima_parcela) || 0) * Math.max(0, tot - pagas) }; };
    IT = PA.map((p) => ({ id: p.id, grupo_id: p.grupo_id, titulo: p.empresa || '—', resid: residual(p), sub: [p.local, p.natureza, p.numero ? 'nº ' + p.numero : ''].filter(Boolean).join(' · '),
      busca: [p.empresa, p.natureza, p.local, p.numero, p.cnpj].join(' '), nos: p.emitimos_guia !== false, p }));
  } else {
    const A = await q(sb.from('acordos').select('id, parcela, total_parcelas, vencimento, valor, pago, emissao, emitida_em, reenvio_em, reenvio_valor, devedor, credor, processo, grupo_id, pix, banco, guia_doc').order('vencimento').limit(50000));
    const M = {};
    A.forEach((a) => { const k = [a.grupo_id || '', a.devedor || '', a.credor || '', a.processo || ''].join('|');
      (M[k] = M[k] || { id: k, grupo_id: a.grupo_id, titulo: a.devedor || '—', sub: 'deve a ' + (a.credor || '—') + (a.processo ? ' · ' + a.processo : ''), busca: [a.devedor, a.credor, a.processo].join(' '), nos: true, l: [] }).l.push(a);
      Object.assign(a, { item: k, rot: String(a.parcela || '?') + (a.total_parcelas ? '/' + a.total_parcelas : ''), valorEf: Number(a.valor) || 0, lancado: true, quem: a.devedor,
        cliente_id: (E.clientes.find((c) => c.grupo_id === a.grupo_id && primeiroNome(c.nome) === primeiroNome(a.devedor)) || {}).id || null }); });
    IT = Object.values(M); PC = A;
  }
  const atrasos = {}, porItem = {}, cel = {}, porId = {};
  PC.forEach((x) => { porId[x.id] = x; (porItem[x.item] = porItem[x.item] || []).push(x); if (!x.pago && x.vencimento < h) atrasos[x.item] = (atrasos[x.item] || 0) + 1;
    const m = String(x.vencimento || '').slice(0, 7); if (MS.includes(m)) (cel[x.item + '|' + m] = cel[x.item + '|' + m] || []).push(x); });
  [...SEL].forEach((id) => { if (!porId[id] || porId[id].pago) SEL.delete(id); });
  const gnome = (id) => nomeGrupo(id) || 'Sem grupo';
  const nomeItem = parc ? 'parcelamento' : 'acordo', ncol = MS.length + (parc ? 3 : 1), doc = parc ? 'guia' : 'boleto';
  const rotMes = (m) => MESES_CURTOS[+m.slice(5) - 1] + '/' + m.slice(2, 4);
  el.innerHTML = '<div class="card rt-ctl-card"><div class="card-hd">📋 Controle ' + (parc ? 'dos parcelamentos' : 'dos acordos') +
      '<span class="sub">marque as parcelas que vai emitir e clique em ✉ Enviar por empresa · ✓ no Pagamento dá baixa</span></div>' +
    '<div class="card-bd">' + filtroRotina('<select class="busca" id="rt-filtro" autocomplete="off">' + (parc ? [['', 'Todos os parcelamentos'], ['nos', 'Só os que nós emitimos'], ['cli', 'Só os que o cliente emite'], ['atr', 'Com parcela em atraso']] : [['', 'Todos os acordos'], ['atr', 'Com parcela em atraso']])
        .map(([v, r]) => '<option value="' + v + '"' + (v === E.rt.filtro ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>' +
        '<span class="rt-meses"><button type="button" class="btn btn-o btn-mini" data-mes="-1" aria-label="Meses anteriores">‹</button><b>' + rotMes(MS[0]) + ' – ' + rotMes(MS[7]) + '</b><button type="button" class="btn btn-o btn-mini" data-mes="1" aria-label="Próximos meses">›</button>' +
          (E.rt[chaveMes] !== -5 ? '<button type="button" class="btn btn-o btn-mini" data-mes="0">hoje</button>' : '') + '</span>') +
      '<ol class="rt-passos"><li>Em cada mês há 2 quadradinhos: <b>Emitiu</b> (esquerda) e <b>Pagou</b> (direita).</li><li>Clique no <b>○ laranja</b> de "Emitiu" das parcelas que vai emitir — ficam <b>azuis</b>.</li>' +
        '<li>Clique em <b>✉ Enviar por empresa</b> (barra que aparece embaixo): confira o valor, anexe as guias e envie. A parcela fica <b>✓ emitida</b> sozinha.</li></ol>' +
      '<div class="rt-leg"><b>Emissão:</b> <span class="rt-e rt-e-nao">○</span> a emitir <span class="rt-e rt-e-ok">✓</span> emitida <span class="rt-e rt-e-sel">✓</span> marcada para enviar' + (parc ? ' <span class="rt-e rt-e-cli">–</span> o cliente emite' : '') +
        ' &nbsp; <b>Pagamento:</b> <span class="rt-p rt-p-ok">✓</span> paga <span class="rt-p rt-p-atr">!</span> vencida <span class="rt-p rt-p-ab">○</span> a vencer</div>' +
      '<div class="rt-ctl-wrap" data-sem-pagina><table class="rt-ctl"><thead><tr>' + (parc ? '<th class="rt-c-emit" title="O escritório emite a guia deste parcelamento?">Emit.?</th>' : '') + '<th class="rt-c-item">' + (parc ? 'Parcelamento' : 'Acordo') + '</th>' +
        MS.map((m) => '<th class="rt-c-mes' + (m === h.slice(0, 7) ? ' rt-mes-atual' : '') + '"><div>' + rotMes(m) + '</div><div class="rt-ep-hd"><span>Emitiu</span><span>Pagou</span></div></th>').join('') + (parc ? '<th class="rt-c-conf">Conferência</th>' : '') + '</tr></thead><tbody id="rt-parc-corpo"></tbody></table></div>' +
      '<div class="rt-selbar" id="rt-selbar" hidden></div></div></div>';
  const corpo = $('rt-parc-corpo');
  const tip = (x) => 'Parcela ' + (x.rot || '') + ' · vence ' + dataBR(x.vencimento) + ' · ' + brl(x.valorEf) + (x.lancado ? '' : ' (último valor lançado)') + (emitidaRt(x) ? ' · emitida' + (x.emitida_em ? ' em ' + dataBR(x.emitida_em) : '') : '') + (x.reenvio_em ? ' · reenviada em ' + dataLocal(x.reenvio_em) : '');
  const btEmis = (x, it) => {
    if (!it.nos) return '<span class="rt-e rt-e-cli" title="O cliente emite esta guia">–</span>';
    const em = emitidaRt(x), sel = SEL.has(x.id);
    if (x.pago) return '<span class="rt-e ' + (em ? 'rt-e-ok' : 'rt-e-vazio') + '" title="' + esc(tip(x)) + '">' + (em ? '✓' : '·') + '</span>';
    return '<button type="button" class="rt-e ' + (sel ? 'rt-e-sel' : em ? 'rt-e-ok' : 'rt-e-nao') + (x.vencimento < h && em ? ' rt-e-reemit' : '') + '" data-sel="' + x.id + '" aria-pressed="' + sel + '" title="' + esc(tip(x)) + (sel ? ' · marcada para enviar' : ' · clique para marcar e enviar') + '">' + (sel || em ? '✓' : '○') + '</button>';
  };
  const btPag = (x) => x.pago ? '<span class="rt-p rt-p-ok" title="Paga">✓</span>'
    : '<button type="button" class="rt-p ' + (x.vencimento < h ? 'rt-p-atr' : 'rt-p-ab') + '" data-pag="' + x.id + '" title="' + (x.vencimento < h ? 'Vencida sem pagamento' : 'A vencer') + ' · clique para lançar o pagamento">' + (x.vencimento < h ? '!' : '○') + '</button>';
  const detalhe = (it) => '<tr class="rt-det"><td colspan="' + ncol + '"><table class="rt-det-tab"><thead><tr><th>Parcela</th><th>Vencimento</th><th>Valor</th><th>Emissão</th><th>Pagamento</th><th>Reenviada</th></tr></thead><tbody>' +
    (porItem[it.id] || []).slice().sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento))).map((x) =>
      '<tr><td>' + esc(x.rot || '—') + '</td><td>' + dataBR(x.vencimento) + '</td>' +
      '<td>' + (parc ? '<span class="rt-vbox"><span>R$</span><input class="rt-valor-p" data-valor="' + x.id + '" data-mascara="nenhuma" inputmode="decimal" value="' + (x.lancado ? valorParaCampo(x.valor) : '') + '" placeholder="' + valorParaCampo(x.valorEf) + '" aria-label="Valor da parcela ' + esc(x.rot) + '" title="Valor lançado nesta parcela (vazio = vale o último lançado)"></span>' : brl(x.valorEf)) + '</td>' +
      '<td>' + btEmis(x, it) + ' <small>' + (emitidaRt(x) ? (x.emitida_em ? dataBR(x.emitida_em) : 'emitida') : it.nos ? '' : 'cliente') + '</small></td>' +
      '<td>' + btPag(x) + '</td><td>' + (x.reenvio_em ? dataLocal(x.reenvio_em) + (x.reenvio_valor ? ' · ' + brl(x.reenvio_valor) : '') : '—') + '</td></tr>').join('') + '</tbody></table></td></tr>';
  const pintarSel = () => {
    const bar = $('rt-selbar'); if (!bar) return;
    const L = [...SEL].map((id) => porId[id]).filter(Boolean);
    bar.hidden = !L.length;
    if (L.length) bar.innerHTML = '<span><b>' + plural(L.length, 'parcela marcada', 'parcelas marcadas') + '</b> · ' + plural(new Set(L.map((x) => x.cliente_id || x.quem)).size, 'empresa', 'empresas') + ' · total ' + brl(L.reduce((s2, x) => s2 + (x.valorEf || 0), 0)) +
      (L.some((x) => x.vencimento < h) ? ' · <span class="rt-sel-atr">inclui vencida (reemissão com valor atualizado)</span>' : '') + '</span>' +
      '<span class="acoes"><button type="button" class="btn btn-o btn-mini" data-sel-limpar>Desmarcar</button><button type="button" class="btn btn-p" data-sel-enviar>✉ Enviar por empresa</button></span>';
  };
  const pintar = () => {
    const b = normalizar(E.rt.busca), dig = soDigitos(E.rt.busca);
    const L = IT.filter((p) => (!E.rt.grupo || p.grupo_id === E.rt.grupo) && (!b || normalizar(p.busca + ' ' + gnome(p.grupo_id)).includes(b) || (dig.length >= 3 && soDigitos(p.busca).includes(dig))) &&
        (E.rt.filtro !== 'nos' || p.nos) && (E.rt.filtro !== 'cli' || !p.nos) && (E.rt.filtro !== 'atr' || atrasos[p.id]))
      .sort((x, y) => (gnome(x.grupo_id) === 'Sem grupo') - (gnome(y.grupo_id) === 'Sem grupo') || gnome(x.grupo_id).localeCompare(gnome(y.grupo_id), 'pt-BR') || String(x.titulo).localeCompare(String(y.titulo), 'pt-BR'));
    let grp = null;
    corpo.innerHTML = L.length ? L.map((p) => {
      const g = gnome(p.grupo_id), doG = L.filter((z) => gnome(z.grupo_id) === g), atr = atrasos[p.id] || 0, ab = !!_rtAberto[tipo + p.id];
      const cab = g !== grp ? (grp = g, '<tr class="gx-grp"><td colspan="' + ncol + '"><span class="rt-g-nome">' + esc(g) + '</span> <span class="sub">' + plural(doG.length, nomeItem, nomeItem + 's') + '</span></td></tr>') : '';
      return cab + '<tr data-pc="' + esc(p.id) + '"' + (ab ? ' class="rt-aberto"' : '') + '>' +
        (parc ? '<td class="rt-c-emit"><label class="rt-chave rt-chave-mini" title="' + (p.nos ? 'O escritório emite a guia (desligue se o cliente emite)' : 'O cliente emite a guia (ligue se o escritório emite)') + '"><input type="checkbox" data-emit="' + p.id + '"' + (p.nos ? ' checked' : '') + ' aria-label="Nós emitimos a guia"><span></span></label></td>' : '') +
        '<td class="rt-emp rt-abre" data-abre="' + esc(p.id) + '" role="button" tabindex="0" title="Ver todas as parcelas (e editar o valor)"><b><span class="rt-seta">' + (ab ? '▾' : '▸') + '</span> ' + esc(p.titulo) + '</b><div class="sub">' + esc(p.sub) +
          (atr ? ' <span class="pill ' + (atr >= 2 ? 'vencido' : 'atr-leve') + '">' + atr + ' em atraso</span>' : '') + '</div>' +
          (p.resid ? '<div class="rt-resid" title="Valor da última parcela × ' + p.resid.falta + ' parcelas que faltam">Residual <b>' + brl(p.resid.v) + '</b> <span class="sub">(' + p.resid.falta + ' faltam)</span></div>' : '') + '</td>' +
        MS.map((m) => '<td class="rt-c-mes' + (m === h.slice(0, 7) ? ' rt-mes-atual' : '') + '">' + (cel[p.id + '|' + m] || []).map((x) => '<div class="rt-ep">' + btEmis(x, p) + btPag(x) + '</div>').join('') + '</td>').join('') +
        (parc ? '<td class="rt-c-conf">' + celulaConferencia(SIT[p.id], p.id) + '</td>' : '') + '</tr>' + (ab ? detalhe(p) : '');
    }).join('') : '<tr><td colspan="' + ncol + '">' + vazio('Nenhum ' + nomeItem + ' com esses filtros.') + '</td></tr>';
    pintarSel();
  };
  const emitimos = async (ids, v) => { await q(sb.rpc('parcelamentos_emitimos', { p_ids: ids, p_emitimos: v }));
    await q(sb.rpc('conferir_rotina', { p_area: 'parcelamentos', p_ids: ids, p_alterou: true })).catch(() => null);
    IT.forEach((p) => { if (ids.includes(p.id)) p.nos = v; });
    if (!v) PC.forEach((x) => { if (ids.includes(x.item)) SEL.delete(x.id); });
    ids.forEach((id) => { SIT[id] = Object.assign({}, SIT[id], { conferido_em: new Date().toISOString(), conferido_por: E.perfil ? E.perfil.nome : '', conferido_alterou: true }); });
    if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); pintar(); };
  corpo.onchange = (ev) => { const c = ev.target.closest('[data-emit]'); if (!c) return;
    emitimos([c.dataset.emit], c.checked).then(() => aviso(c.checked ? '✓ O escritório emite a guia deste parcelamento.' : '✓ Marcado: o cliente emite a guia.'), (e) => { aviso(erroAmigavel(e), true); pintar(); }); };
  // valor da parcela (só parcelamentos): grava ao sair do campo
  corpo.addEventListener('focusout', (ev) => { const i = ev.target.closest('[data-valor]'); if (!i) return;
    const x = porId[i.dataset.valor], v = i.value.trim() ? lerValor(i.value) : null;
    if (v != null && isNaN(v)) { aviso('Valor inválido.', true); return; }
    if ((v || null) === (x.lancado ? Number(x.valor) : null)) return;
    q(sb.rpc('lancar_valor_parcela', { p_id: x.id, p_valor: v })).then(() => { aviso('✓ Valor da parcela ' + x.rot + ' gravado.'); if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); rotinaControle(el, tipo); }, (e) => aviso(erroAmigavel(e), true)); });
  corpo.onclick = (ev) => {
    const cf = ev.target.closest('[data-conferir]');
    if (cf) return comBotao(cf, async () => { await q(sb.rpc('conferir_rotina', { p_area: 'parcelamentos', p_ids: [cf.dataset.conferir], p_alterou: false }));
      SIT[cf.dataset.conferir] = Object.assign({}, SIT[cf.dataset.conferir], { conferido_em: new Date().toISOString(), conferido_por: E.perfil ? E.perfil.nome : '', conferido_alterou: false });
      cf.closest('td').innerHTML = celulaConferencia(SIT[cf.dataset.conferir], cf.dataset.conferir); });
    const sl = ev.target.closest('[data-sel]');
    if (sl) { const id = sl.dataset.sel; if (SEL.has(id)) SEL.delete(id); else SEL.add(id); pintar(); return; }
    const pg = ev.target.closest('[data-pag]');
    if (pg) { if (window.ERP_EDITOR && window.ERP_EDITOR.baixaRapida) Promise.resolve(window.ERP_EDITOR.baixaRapida(tipo, pg.dataset.pag)).then(() => setTimeout(() => rotinaControle(el, tipo), 1500)); return; }
    const ab = ev.target.closest('[data-abre]'); if (ab && !ev.target.closest('input')) { _rtAberto[tipo + ab.dataset.abre] = !_rtAberto[tipo + ab.dataset.abre]; pintar(); }
  };
  corpo.onkeydown = (ev) => { if (ev.key === 'Enter' && ev.target.matches('[data-abre]')) ev.target.click(); if (ev.key === 'Enter' && ev.target.matches('[data-valor]')) ev.target.blur(); };
  $('rt-selbar').onclick = (ev) => {
    if (ev.target.closest('[data-sel-limpar]')) { SEL.clear(); pintar(); return; }
    if (!ev.target.closest('[data-sel-enviar]')) return;
    const L = [...SEL].map((id) => porId[id]).filter(Boolean).map((x) => Object.assign({}, x, { valor: x.valorEf, parcela: x.rot, email_em: null,
      detalhe: parc ? [x.parcelamentos.natureza, x.parcelamentos.local].filter(Boolean).join(' · ') : 'deve a ' + (x.credor || '—') }));
    if (!L.length) return;
    janelaGuiasEmpresa(tipo, L, null, async () => { L.forEach((x) => SEL.delete(x.id)); await rotinaControle(el, tipo); });
  };
  el.querySelectorAll('[data-mes]').forEach((b) => b.onclick = () => { E.rt[chaveMes] = Number(b.dataset.mes) === 0 ? -5 : E.rt[chaveMes] + 3 * Number(b.dataset.mes); rotinaControle(el, tipo); });
  ligarFiltroRotina(el, pintar); pintar();
}

// ── 3c) Backup 35 (TESTE): "Planilha de parcelamentos" — igual à planilha do escritório: uma aba por GRUPO e um bloco por
// parcelamento (Nome, CPF/CNPJ, Local, Natureza, Nº, Total, Pagas, Valor da última parcela, Valor residual, Emitimos, observação) com a
// lista PARCELA · VENCIMENTO · EMISSÃO · PAGAMENTO. Botão "Emitir guias": as em atraso + as que vencem neste mês (como no ERP antigo).
async function rotinaPlanilha(el) {
  if (!E.clientes.length) await carregarCadastros();
  const h = hojeISO(), fimMes = fimDoMesGuia(h);
  const [PA, P2] = await Promise.all([
    q(sb.from('parcelamentos').select('id, empresa, cnpj, local, natureza, numero, total_parcelas, valor_ultima_parcela, grupo_id, emitimos_guia, obs').limit(5000)),
    q(sb.from('parcelas').select('id, parcelamento_id, numero, vencimento, pago, emitida_em, emissao, valor, guia_doc').order('vencimento').limit(50000))]);
  const porPa = {}; P2.forEach((x) => { (porPa[x.parcelamento_id] = porPa[x.parcelamento_id] || []).push(x); });
  const gnome = (id) => nomeGrupo(id) || 'Sem grupo';
  const grupos = [...new Set(PA.map((p) => gnome(p.grupo_id)))].sort((a, b) => (a === 'Sem grupo') - (b === 'Sem grupo') || a.localeCompare(b, 'pt-BR'));
  E.rt.plGrupo = grupos.includes(E.rt.plGrupo) ? E.rt.plGrupo : grupos[0];
  const emit = (x) => !!x.emitida_em || /sim|emitid/i.test(x.emissao || '');
  // "a emitir agora" = não paga, nós emitimos, sem emissão e vencendo até o fim do mês (vencidas entram de novo: reemissão)
  const aEmitir = (p) => p.emitimos_guia === false ? [] : (porPa[p.id] || []).filter((x) => !x.pago && x.vencimento && x.vencimento <= fimMes && (!emit(x) || x.vencimento < h));
  const nGrupo = (g) => PA.filter((p) => gnome(p.grupo_id) === g).reduce((s2, p) => s2 + aEmitir(p).length, 0);
  const pintar = () => {
    const L = PA.filter((p) => gnome(p.grupo_id) === E.rt.plGrupo).sort((a, b) => String(a.empresa).localeCompare(String(b.empresa), 'pt-BR') || String(a.natureza).localeCompare(String(b.natureza), 'pt-BR'));
    const nE = L.reduce((s2, p) => s2 + aEmitir(p).length, 0);
    el.innerHTML = '<div class="card pl-card"><div class="card-hd">🧪 Planilha de parcelamentos <span class="pill hoje">teste</span><span class="sub">igual à planilha: uma aba por grupo, um bloco por parcelamento · clique em EMISSÃO ou PAGAMENTO para marcar</span></div>' +
      '<div class="card-bd"><div class="pl-abas" role="tablist">' + grupos.map((g) => { const n = nGrupo(g);
        return '<button type="button" role="tab" class="pl-aba' + (g === E.rt.plGrupo ? ' ativo' : '') + '" data-pl-g="' + esc(g) + '">' + esc(g) + (n ? ' <span class="pl-n">' + n + '</span>' : '') + '</button>'; }).join('') + '</div>' +
      '<div class="pl-barra"><span class="sub">' + plural(L.length, 'parcelamento', 'parcelamentos') + ' em ' + esc(E.rt.plGrupo || '—') + '</span>' +
        '<button type="button" class="btn btn-p" id="pl-emitir"' + (nE ? '' : ' disabled') + '>🧾 Emitir guias — em atraso + vencem neste mês' + (nE ? ' (' + nE + ')' : '') + '</button></div>' +
      '<div class="pl-blocos">' + L.map((p) => {
        const ps = porPa[p.id] || [], pagas = ps.filter((x) => x.pago).length, tot = Number(p.total_parcelas) || ps.length, v = Number(p.valor_ultima_parcela) || 0;
        const resid = v * Math.max(0, tot - pagas), cli = p.emitimos_guia === false;
        return '<section class="pl-bloco" data-pl-pa="' + p.id + '"><table class="pl-hd"><tbody>' +
          [['Nome', esc(p.empresa || '—')], ['CPF/CNPJ', esc(mascaraDoc(p.cnpj) || '—')], ['Local', esc(p.local || '—')], ['Natureza', esc(p.natureza || '—')], ['Nº', esc(p.numero || '—')],
           ['Total de parcelas', tot || '—'], ['Parcelas pagas', pagas],
           ['Valor última parcela', '<span class="rt-vbox"><span>R$</span><input data-pl-v="' + p.id + '" data-mascara="nenhuma" inputmode="decimal" value="' + (v ? valorParaCampo(v) : '') + '" aria-label="Valor da última parcela"></span>'],
           ['Valor residual', '<b>' + brl(resid) + '</b>']].map(([k, val]) => '<tr><th>' + k + '</th><td>' + val + '</td></tr>').join('') +
          '<tr><th>Guias</th><td><label class="rt-chave rt-chave-mini"><input type="checkbox" data-pl-emit="' + p.id + '"' + (cli ? '' : ' checked') + '><span></span><small>' + (cli ? 'Não emitimos' : 'Emitimos') + '</small></label></td></tr>' +
          '<tr><th>Obs.</th><td><input class="pl-obs" data-pl-obs="' + p.id + '" value="' + esc(p.obs || '') + '" placeholder="ex.: emitimos 3 de uma vez; enviar por WhatsApp"></td></tr></tbody></table>' +
          '<div class="pl-lista"><table class="pl-tab"><thead><tr><th>Parcela</th><th>Vencimento</th><th>Emissão</th><th>Pagamento</th></tr></thead><tbody>' +
          ps.map((x) => { const at = !x.pago && x.vencimento < h, mes = x.vencimento && x.vencimento.slice(0, 7) === h.slice(0, 7);
            return '<tr class="' + (x.pago ? 'pl-pago' : at ? 'pl-atr' : mes ? 'pl-mes' : '') + '"' + (mes ? ' data-pl-mes' : '') + '><td>' + esc(x.numero || '') + '</td><td>' + dataBR(x.vencimento) + '</td>' +
              '<td><button type="button" class="pl-sn' + (emit(x) ? ' sim' : '') + '" data-pl-e="' + x.id + '"' + (cli ? ' disabled title="O cliente emite"' : '') + '>' + (emit(x) ? 'SIM' : cli ? '–' : '') + '</button></td>' +
              '<td><button type="button" class="pl-sn' + (x.pago ? ' sim' : at ? ' nao' : '') + '" data-pl-p="' + x.id + '"' + (x.pago ? ' disabled' : '') + '>' + (x.pago ? 'SIM' : at ? 'NÃO' : '') + '</button></td></tr>'; }).join('') +
          '</tbody></table></div></section>'; }).join('') + (L.length ? '' : vazio('Nenhum parcelamento neste grupo.')) + '</div></div></div>';
    // a lista de cada bloco já abre no mês atual
    el.querySelectorAll('.pl-lista').forEach((d) => { const r = d.querySelector('[data-pl-mes]') || d.querySelector('tr.pl-atr'); if (r) d.scrollTop = Math.max(0, r.offsetTop - 70); });
  };
  const recarregar = () => rotinaPlanilha(el);
  el.onclick = (ev) => {
    const ab = ev.target.closest('[data-pl-g]'); if (ab) { E.rt.plGrupo = ab.dataset.plG; return pintar(); }
    const be = ev.target.closest('[data-pl-e]');
    if (be) return comBotao(be, async () => { const x = P2.find((y) => y.id === be.dataset.plE), novo = !emit(x);
      await q(sb.rpc('registrar_emissao', { p_tabela: 'parcelas', p_id: x.id, p_emitida: novo, p_doc: null, p_enviar: false }));
      x.emitida_em = novo ? h : null; x.emissao = novo ? 'SIM' : ''; pintar(); });
    const bp = ev.target.closest('[data-pl-p]');
    if (bp && window.ERP_EDITOR && window.ERP_EDITOR.baixaRapida) return Promise.resolve(window.ERP_EDITOR.baixaRapida('parcelas', bp.dataset.plP)).then(() => setTimeout(recarregar, 1500));
    if (ev.target.closest('#pl-emitir')) {
      const its = PA.filter((p) => gnome(p.grupo_id) === E.rt.plGrupo).flatMap((p) => aEmitir(p).map((x) => {
        const ult = (porPa[p.id] || []).filter((y) => y.valor != null && y.vencimento <= x.vencimento).slice(-1)[0];
        return Object.assign({}, x, { parcelamentos: p, quem: p.empresa, grupo_id: p.grupo_id, email_em: null, parcela: (x.numero || '?') + (p.total_parcelas ? '/' + p.total_parcelas : ''),
          valor: x.valor != null ? Number(x.valor) : ult ? Number(ult.valor) : Number(p.valor_ultima_parcela) || 0, detalhe: [p.natureza, p.local].filter(Boolean).join(' · '),
          cliente_id: (E.clientes.find((c) => (soDigitos(p.cnpj) && soDigitos(c.cpf_cnpj) === soDigitos(p.cnpj)) || c.nome === p.empresa) || {}).id || null }); }));
      if (its.length) janelaGuiasEmpresa('parcelas', its, null, recarregar);
    }
  };
  el.onchange = (ev) => {
    const c = ev.target.closest('[data-pl-emit]');
    if (c) q(sb.rpc('parcelamentos_emitimos', { p_ids: [c.dataset.plEmit], p_emitimos: c.checked })).then(() => { PA.find((p) => p.id === c.dataset.plEmit).emitimos_guia = c.checked; pintar(); }, (e) => aviso(erroAmigavel(e), true));
  };
  el.addEventListener('focusout', (ev) => {
    const iv = ev.target.closest('[data-pl-v]'), io = ev.target.closest('[data-pl-obs]');
    if (iv) { const v = iv.value.trim() ? lerValor(iv.value) : null; const p = PA.find((y) => y.id === iv.dataset.plV);
      if (v != null && isNaN(v)) return aviso('Valor inválido.', true);
      if ((v || null) === (Number(p.valor_ultima_parcela) || null)) return;
      q(sb.from('parcelamentos').update({ valor_ultima_parcela: v }).eq('id', p.id)).then(() => { p.valor_ultima_parcela = v; aviso('✓ Valor da última parcela gravado.'); pintar(); }, (e) => aviso(erroAmigavel(e), true)); }
    if (io) { const p = PA.find((y) => y.id === io.dataset.plObs); if ((p.obs || '') === io.value) return;
      q(sb.from('parcelamentos').update({ obs: io.value }).eq('id', p.id)).then(() => { p.obs = io.value; aviso('✓ Observação gravada.'); }, (e) => aviso(erroAmigavel(e), true)); }
  });
  pintar();
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

// ── 5) Minhas tarefas — Backup 29: separadas em Recorrentes (voltam no próximo período), Com validação e Únicas ──
const REPETE = { semanal: 'toda semana', mensal: 'todo mês', anual: 'todo ano' };
async function rotinaTarefas(el) {
  const T = (await q(sb.from('tarefas').select('*, clientes(nome)').not('status', 'in', '(concluida,cancelada)').order('prazo', { nullsFirst: false }).limit(1000)).catch(() => []));
  const eu = primeiroNome((E.perfil && E.perfil.nome) || '');
  const minhas = T.filter((t) => ehMinha(t) && !/^(cob|parc|aco):/.test(t.chave_regra || '') && t.status !== 'revisao');
  const validar = T.filter((t) => t.status === 'revisao' && t.revisor && primeiroNome(t.revisor) === eu);
  const h = hojeISO();
  const sec = [['🔁 Recorrentes', 'fazem e voltam sozinhas no próximo período (semana, mês ou ano)', minhas.filter((t) => t.recorrencia)],
    ['✔ Com validação', 'ao concluir, vão para quem valida; só fecham depois do "aprovado"', minhas.filter((t) => !t.recorrencia && t.exige_revisao)],
    ['📌 Únicas', 'fazem uma vez e acabou', minhas.filter((t) => !t.recorrencia && !t.exige_revisao)],
    ['🔎 Para eu validar', 'o que a equipe concluiu e espera o seu aprovado', validar]];
  const linha = (t, validando) => '<tr class="clicavel" data-tarefa="' + t.id + '"><td><b>' + esc(t.titulo) + '</b>' + (t.clientes ? '<div class="sub">' + esc(t.clientes.nome) + '</div>' : '') + '</td>' +
    '<td>' + (t.recorrencia ? '<span class="pill aberto">↻ ' + esc(REPETE[t.recorrencia] || t.recorrencia) + '</span>' : '<span class="sub">—</span>') + '</td>' +
    '<td>' + (t.exige_revisao || validando ? '<span class="pill hoje">valida: ' + esc(t.revisor || '—') + '</span>' : '<span class="sub">—</span>') + '</td>' +
    '<td>' + (t.prazo ? '<span class="' + (t.prazo < h ? 'dias-r' : t.prazo === h ? 'dias-a' : '') + '">' + dataBR(t.prazo) + '</span>' : '—') + '</td>' +
    '<td class="acoes-l">' + (validando ? '<button type="button" class="btn btn-v btn-mini" data-rt-ok="' + t.id + '">✓ Abrir e validar</button>'
      : '<button type="button" class="btn btn-v btn-mini" data-rt-concluir="' + t.id + '">' + (t.exige_revisao ? '✓ Concluir e enviar' : '✓ Concluir') + '</button>') + '</td></tr>';
  el.innerHTML = '<div class="card"><div class="card-hd">✓ Minhas tarefas<span class="sub">recorrentes voltam sozinhas; com validação vão para quem valida</span>' +
      '<span class="gd-hd-ac"><button type="button" class="btn btn-o btn-mini" id="rt-nova-rec">+ Tarefa recorrente</button><button type="button" class="btn btn-p btn-mini" id="rt-nova-t">+ Tarefa</button></span></div><div class="card-bd">' +
    sec.map(([tit, sub, L], k) => '<div class="rt-tsec"><div class="rt-tsec-tit">' + tit + ' <span class="pill neutro">' + L.length + '</span><span class="sub">' + sub + '</span></div>' +
      (L.length ? '<div class="tabela-wrap" data-sem-pagina><table class="rt-ttab"><thead><tr><th>Tarefa</th><th>Repete</th><th>Validação</th><th>Prazo</th><th></th></tr></thead><tbody>' + L.map((t) => linha(t, k === 3)).join('') + '</tbody></table></div>'
        : '<div class="sub" style="padding:4px 2px 10px">Nada aqui.</div>') + '</div>').join('') + '</div></div>';
  const rep = () => rotinaTarefas(el);
  $('rt-nova-t').onclick = () => formTarefa({}, rep);
  $('rt-nova-rec').onclick = () => formTarefa({ recorrencia: 'mensal', responsavel: (E.perfil && E.perfil.nome) || '' }, rep);
  el.querySelectorAll('[data-tarefa]').forEach((tr) => tr.onclick = (ev) => { if (ev.target.closest('button')) return; abrirTarefa(tr.dataset.tarefa, rep); });
  el.querySelectorAll('[data-rt-ok]').forEach((b) => b.onclick = () => abrirTarefa(b.dataset.rtOk, rep));
  el.querySelectorAll('[data-rt-concluir]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const t = T.find((x) => x.id === b.dataset.rtConcluir);
    if ((t.checklist || []).some((c) => !c.feito)) return abrirTarefa(t, rep);
    if (t.exige_revisao) { await q(sb.from('tarefas').update({ status: 'revisao' }).eq('id', t.id)); aviso('✓ Enviada para validação de ' + (t.revisor || 'quem valida') + '.'); }
    else { await concluirTarefa(t.id); aviso(t.recorrencia ? '✓ Concluída — ela volta sozinha ' + (REPETE[t.recorrencia] || '') + '.' : '✓ Tarefa concluída.'); }
    await rep();
  }));
}
