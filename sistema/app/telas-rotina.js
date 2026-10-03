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
const ABAS_ROTINA = [['passivo', '🏛 Passivo e cadastro'], ['processos', '⚖ Processos'], ['planilha', '📋 Planilha de parcelamentos'], ['guias', '📨 Enviar guias do mês'], ['acs', '🤝 Acordos'], ['financeiro', '💰 Financeiro'], ['tarefas', '✓ Minhas tarefas']];
const TIPOS_MOV = [['movimentacao', 'Movimentação'], ['decisao', 'Decisão relevante'], ['valor', 'Mudança de valor'], ['procuracao', 'Procuração juntada'], ['sem_novidade', 'Conferido — sem novidade']];
const PARES_PASSIVO = [['rfb', 'RFB'], ['pgfn', 'PGFN'], ['age_mg', 'AGE/MG']];
const COLS_PASSIVO = [['rfb', 'RFB'], ['rfb_negociada', 'RFB negociada'], ['pgfn', 'PGFN'], ['pgfn_negociada', 'PGFN negociada'], ['age_mg', 'AGE/MG'], ['age_mg_negociada', 'AGE/MG negociada']];
const CAPAG_OPCOES = ['', 'A', 'B', 'C', 'D', 'Omisso'];

TELAS.rotina = async function () {
  E.rt = Object.assign({ aba: 'passivo', busca: '', grupo: '', filtro: '' }, E.rt || {});
  if (E.rt.aba === 'parcs' || E.rt.aba === 'acs') E.rt.aba = 'planilha';   // Backup 42: o Controle saiu
  if (!E.clientes.length) await carregarCadastros();
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Rotina</h1><p>Tudo o que era atualizado nas planilhas, num lugar só — o que você grava aqui aparece no Painel, nos Processos e no Financeiro</p></div></div>' +
    '<div class="segmento rt-abas" id="rt-abas" style="margin-bottom:14px">' + ABAS_ROTINA.map(([k, r]) => '<button type="button" data-rt-aba="' + k + '">' + r + '</button>').join('') + '</div>' +
    '<div id="rt-corpo"></div>';
  // Backup 42: "Acordos" abre a própria tela de Acordos (idêntica, sem repetir código)
  $('rt-abas').onclick = (ev) => { const b = ev.target.closest('[data-rt-aba]'); if (!b) return;
    if (b.dataset.rtAba === 'acs') { if (typeof window.nav === 'function') window.nav(null, 'acordos'); return; }
    E.rt.aba = b.dataset.rtAba; pintarRotina(); };
  await pintarRotina();
};
async function pintarRotina() {
  document.querySelectorAll('#rt-abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.rtAba === E.rt.aba));
  const el = $('rt-corpo'); if (!el) return;
  el.innerHTML = '<div class="sub" style="padding:10px">Carregando…</div>';
  try { await ({ passivo: rotinaPassivo, processos: rotinaProcessos, planilha: rotinaPlanilha, guias: rotinaEnviarGuias, financeiro: rotinaFinanceiro, tarefas: rotinaTarefas })[E.rt.aba](el); }
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
    '<div class="tabela-wrap rt-grade rt-pas rt-sem-altura" data-sem-pagina><table><thead><tr><th>Empresa</th>' + PARES_PASSIVO.map(([k, r]) => '<th class="rt-num">' + r + '<small>em aberto · negociada</small></th>').join('') +
      '<th class="rt-num">CEAT</th><th title="Procuração">Procur.</th><th title="Certificado digital">Certif.</th><th>CAPAG</th><th class="rt-c-conf">Conferência</th></tr></thead><tbody id="rt-pas-corpo"></tbody></table></div>' + '</div></div>';
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
      // Backup 42: faixa do grupo simples (sem o contorno azul) e sem o relógio ao lado da empresa
      const cab = g !== grp ? (grp = g, '<tr class="rt-grp"><td colspan="' + (PARES_PASSIVO.length + 6) + '">' + esc(g) + '</td></tr>') : '';
      return cab + '<tr data-id="' + c.id + '"' + (alterados.has(c.id) ? ' class="rt-alterado"' : '') + '><td class="rt-emp"><b>' + esc(c.nome) + '</b><div class="sub">' + esc(mascaraDoc(c.cpf_cnpj) || '') + (podeCert ? ' <button type="button" class="rt-hist-bt" data-senha="' + c.id + '" title="Senha GOV (só quem pode editar clientes vê)">🔑</button>' : '') + '</div></td>' +
        PARES_PASSIVO.map(([k, r]) => '<td class="rt-par">' + [k, k + '_negociada'].map((kk, i) => '<input class="rt-in rt-valor' + (i ? ' rt-neg' : '') + '" data-mascara="brl" data-c="' + kk + '" inputmode="decimal" aria-label="' + r + (i ? ' negociada' : ' em aberto') + '" placeholder="' + (i ? 'negociada' : 'em aberto') + '" value="' + (c[kk] != null && c[kk] !== '' ? 'R$ ' + valorParaCampo(c[kk]) : '') + '">').join('') + '</td>').join('') +
        '<td><input class="rt-in rt-int" data-c="ceat_trt3" inputmode="numeric" value="' + (c.ceat_trt3 == null ? '' : esc(c.ceat_trt3)) + '"></td>' +
        '<td>' + simNaoSel('procuracao', c.procuracao) + '</td>' +
        '<td>' + simNaoSel('certificado', c.certificado) + '</td>' +
        '<td class="rt-c-capag"><select class="rt-in rt-sn rt-capag" data-c="capag">' + CAPAG_OPCOES.map((v) => '<option value="' + v + '"' + ((c.capag || '') === v ? ' selected' : '') + '>' + (v || '—') + '</option>').join('') + '</select></td>' +
        '<td class="rt-c-conf">' + celulaConferencia(SIT[c.id], c.id) + '</td></tr>';
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
    const ks = ev.target.closest('[data-senha]'); if (ks) return janelaSenhaGov(ks.dataset.senha, C);
    // Backup 42: o ✓ da linha salva AQUELA linha — com alteração grava e marca "alterado"; sem alteração marca "conferido"
    const cf = ev.target.closest('[data-conferir]'); if (cf) return comBotao(cf, async () => {
      const id = cf.dataset.conferir, a = alterados.get(id), mudou = !!a;
      if (a) await gravar([id, a]);
      await q(sb.rpc('conferir_rotina', { p_area: 'passivo', p_ids: [id], p_alterou: mudou }));
      SIT[id] = Object.assign({}, SIT[id], { conferido_em: new Date().toISOString(), conferido_por: E.perfil ? E.perfil.nome : '', conferido_alterou: mudou }, mudou ? { alterado_em: new Date().toISOString() } : {});
      if (mudou) { alterados.delete(id); cf.closest('tr').classList.remove('rt-alterado'); contar(); }
      cf.closest('td').innerHTML = celulaConferencia(SIT[id], id);
      aviso(mudou ? '✓ Linha salva.' : '✓ Conferido.'); });
    const b = ev.target.closest('[data-ver-senha]'); if (!b) return; const i = b.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; };
  $('rt-hist').onclick = () => janelaHistoricoPassivo(null);
  let n = 0;
  const gravar = async ([id, a]) => {
      const up = {};
      Object.entries(a.cli).forEach(([k, v]) => {
        if (k === 'em_operacao' || k === 'procuracao' || k === 'certificado') up[k] = v === '' ? null : v === 'true';
        else if (k === 'capag') up[k] = v;
        else if (k === 'ceat_trt3') up[k] = v.trim() === '' ? null : parseInt(soDigitos(v), 10) || 0;
        else { const n2 = lerValor(v); if (isNaN(n2)) throw new Error('Valor inválido: ' + v); up[k] = v.trim() === '' ? null : n2; }
      });
      if (Object.keys(up).length) await q(sb.from('clientes').update(up).eq('id', id).select('id'));
      const cl = E.clientes.find((x) => x.id === id); if (cl) Object.assign(cl, up);
      if (Object.keys(a.cert).length) {
        const atual = Object.assign({}, C[id] || {}), row = { cliente_id: id, validade: atual.validade || null, senha: atual.senha || '' };
        if ('senha' in a.cert) row.senha = a.cert.senha;
        await q(sb.from('cliente_certificado').upsert(row).select('cliente_id'));
      }
      n++;
    };
  $('rt-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    n = 0;
    // Backup 41: grava de 6 em 6 (antes, uma empresa por vez)
    const fila = [...alterados];
    for (let i = 0; i < fila.length; i += 6) await Promise.all(fila.slice(i, i + 6).map(gravar));
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
  const P = await buscarTodos(() => sb.from('processos').select('id, numero, grupo_id, natureza, competencia, autor, reu, valor, procuracao, obs, atualizacao, ultima_movimentacao, ultima_movimentacao_em, grupos(nome)').order('id'));
  // Backup 31: a última conferência de cada processo (quem, quando e se mudou algo ou foi "sem novidade")
  const ULT = {}; (await buscarTodos(() => sb.from('processo_movimentacoes').select('processo_id, tipo, quem, criado_em').order('criado_em', { ascending: false }).order('id')).catch(() => []))
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
      return (g !== grp ? (grp = g, '<tr class="rt-grp"><td colspan="7">' + esc(g) + ' <span class="sub">' + plural(L.filter((z) => (z.grupos ? z.grupos.nome : 'Sem grupo') === g).length, 'processo', 'processos') + '</span></td></tr>') : '') + '<tr><td><b class="mono">' + esc(p.numero) + '</b><div class="sub">' + esc((p.grupos ? p.grupos.nome : '') + (p.reu ? ' · ' + p.reu : '')) + '</div></td>' +
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
      // Backup 37: o valor atual fica ao lado, como referência
      '<div class="mov-valor mov-valores inteiro"><div class="mov-vatual"><span>Valor atual da causa</span><b>' + (p.valor ? brl(p.valor) : '—') + '</b></div>' +
        campo('Valor novo', '<input name="valor" data-mascara="brl" inputmode="decimal" placeholder="R$ 0,00">') + '</div>' +
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

// ── 3) Backup 42/43: ENVIAR GUIAS DO MÊS (aba própria desde o B43) — igual à antiga "Notificações → Parcelamento": guias vencidas ou que vencem neste mês,
// por empresa; marque, gere a mensagem (texto idêntico ao das Notificações), confira o valor e envie (copiar, WhatsApp ou e-mail).
// "Controle dos parcelamentos" saiu; "Acordos" abre a própria tela de Acordos (a mesma, sem repetir código).
const _plSel = new Set();
function textoNotifParcelas(empresa, itens) {   // o texto das antigas Notificações, palavra por palavra
  return 'Prezados,\n\nSeguem as guias dos parcelamentos da ' + empresa + ' com vencimento neste mês. Antes de pagar, confirme se a guia já não foi paga, para evitar duplicidade.' +
    itens.map((g) => '\n\n' + (g.vencida ? '⚠︎ GUIA VENCIDA\n' : '') + 'Parcelamento ' + (g.p.local || g.p.natureza || '') + ' — Natureza: ' + (g.p.natureza || '—') +
      '\nNº do Parcelamento: ' + (g.p.numero || '—') + '\nParcela: ' + (g.numero || '?') + ' de ' + (g.p.total_parcelas || '?') + ' | Vencimento: ' + (g.vencimento ? g.vencimento.slice(5, 7) + '/' + g.vencimento.slice(0, 4) : '—') +
      '\nNº da Guia: ' + (g.numero || '—') + '\nValor: ' + brl(g._valor || 0)).join('');
}
async function rotinaEnviarGuias(el) {
  if (!E.clientes.length) await carregarCadastros();
  const h = hojeISO(), fimMes = fimDoMesGuia(h);
  const [PA, P2] = await Promise.all([
    buscarTodos(() => sb.from('parcelamentos').select('id, empresa, cnpj, local, natureza, numero, total_parcelas, valor_ultima_parcela, grupo_id, emitimos_guia').order('id')),
    buscarTodos(() => sb.from('parcelas').select('id, parcelamento_id, numero, vencimento, pago, emitida_em, emissao, email_ref, valor, guia_doc').order('vencimento').order('id'))]);
  const porId = {}; PA.forEach((p) => { porId[p.id] = p; });
  const ult = {}, G = [];
  P2.forEach((x) => { const p = porId[x.parcelamento_id]; if (!p) return;
    if (x.valor != null && Number(x.valor) > 0) ult[p.id] = Number(x.valor);
    if (x.pago || p.emitimos_guia === false || !x.vencimento || x.vencimento > fimMes) return;
    G.push(Object.assign(x, { p, vencida: x.vencimento < h, enviada: !!x.emitida_em || /sim|emitid/i.test(x.emissao || ''),
      _valor: x.valor != null && Number(x.valor) > 0 ? Number(x.valor) : ult[p.id] != null ? ult[p.id] : Number(p.valor_ultima_parcela) || 0,
      cliente_id: (E.clientes.find((c) => (soDigitos(p.cnpj) && soDigitos(c.cpf_cnpj) === soDigitos(p.cnpj)) || c.nome === p.empresa) || {}).id || null })); });
  const empK = (g) => g.p.empresa || '—';
  el.innerHTML = '<div class="card nt-card"><div class="card-hd">📨 Enviar guias do mês<span class="sub">guias vencidas ou que vencem neste mês · marque, gere a mensagem e envie</span></div><div class="card-bd">' +
    filtroRotina('<span class="nt-acoes"><span class="sub" id="nt-cnt"></span><button type="button" class="btn btn-p" id="nt-gerar" disabled>📨 Gerar mensagem</button></span>') +
    '<div class="nt-legenda"><span><i class="nt-d nt-d-v"></i>Vencida</span><span><i class="nt-d nt-d-m"></i>Vence este mês</span><span><i class="nt-d nt-d-e"></i>Enviada</span></div>' +
    '<div id="nt-sel"></div><div id="nt-out" hidden></div></div></div>';
  const visiveis = () => { const b = normalizar(E.rt.busca), dig = soDigitos(E.rt.busca);
    return G.filter((g) => (!E.rt.grupo || g.p.grupo_id === E.rt.grupo) && (!b || normalizar([g.p.empresa, g.p.natureza, g.p.local, g.p.numero].join(' ')).includes(b) || (dig.length >= 3 && soDigitos(g.p.cnpj).includes(dig)))); };
  const contar = () => { const n = [..._plSel].filter((id) => G.some((g) => g.id === id)).length;
    $('nt-cnt').textContent = n ? plural(n, 'guia marcada', 'guias marcadas') : 'Nenhuma guia marcada.'; $('nt-gerar').disabled = !n; };
  const pintar = () => {
    const L = visiveis(), emps = {};
    L.forEach((g) => { (emps[empK(g)] = emps[empK(g)] || { nome: empK(g), gnome: nomeGrupo(g.p.grupo_id) || 'Sem grupo', itens: [] }).itens.push(g); });
    const lista = Object.values(emps).sort((a, b) => (a.gnome === 'Sem grupo') - (b.gnome === 'Sem grupo') || a.gnome.localeCompare(b.gnome, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));
    let grp = null;
    $('nt-sel').innerHTML = lista.length ? lista.map((e) => { const todas = e.itens.every((g) => _plSel.has(g.id));
      return (e.gnome !== grp ? (grp = e.gnome, '<div class="nt-grp">' + esc(e.gnome) + '</div>') : '') +
        '<section class="nt-emp"><label class="nt-emp-hd"><input type="checkbox" data-nt-emp="' + esc(e.nome) + '"' + (todas ? ' checked' : '') + '><b>' + esc(e.nome) + '</b><span class="sub">' + plural(e.itens.length, 'guia', 'guias') + '</span>' +
          (e.itens.some((g) => g.vencida && !g.enviada) ? '<span class="pill vencido">vencida</span>' : '') + '</label>' +
        e.itens.map((g) => '<label class="nt-it ' + (g.enviada ? 'nt-env' : g.vencida ? 'nt-venc' : 'nt-mes') + '"><input type="checkbox" data-nt="' + g.id + '"' + (_plSel.has(g.id) ? ' checked' : '') + '>' +
          '<span class="nt-pill">' + (g.enviada ? '✓ Enviada' : g.vencida ? '⚠ Vencida' : '📅 Este mês') + '</span>' +
          '<span class="nt-desc"><b>Parcelamento ' + esc(g.p.local || g.p.natureza || '') + '</b> — ' + esc(g.p.natureza || '—') + ' <span class="sub">· parcela ' + esc(g.numero || '?') + ' de ' + esc(g.p.total_parcelas || '?') + (g.p.numero ? ' · nº ' + esc(g.p.numero) : '') + '</span></span>' +
          '<span class="nt-venc-d">Venc. ' + dataBR(g.vencimento) + '</span></label>').join('') + '</section>'; }).join('')
      : vazio('Nenhuma guia vencida ou vencendo neste mês' + (E.rt.grupo || E.rt.busca ? ' com esses filtros' : '') + '. ✅');
    contar();
  };
  $('nt-sel').onchange = (ev) => {
    const c = ev.target.closest('[data-nt]'); if (c) { if (c.checked) _plSel.add(c.dataset.nt); else _plSel.delete(c.dataset.nt); return pintar(); }
    const ce = ev.target.closest('[data-nt-emp]'); if (ce) { visiveis().filter((g) => empK(g) === ce.dataset.ntEmp).forEach((g) => { if (ce.checked) _plSel.add(g.id); else _plSel.delete(g.id); }); pintar(); }
  };
  // mensagens geradas: uma por empresa, com o valor de cada guia editável, e os botões copiar / WhatsApp / e-mail / marcar como enviada
  const gerar = () => {
    const its = G.filter((g) => _plSel.has(g.id)), emps = {};
    its.forEach((g) => { (emps[empK(g)] = emps[empK(g)] || { nome: empK(g), cli: g.cliente_id, grupo: g.p.grupo_id, itens: [] }).itens.push(g); });
    const out = $('nt-out'); out.hidden = false; $('nt-sel').hidden = true; el.querySelector('.rt-filtros').hidden = true; el.querySelector('.nt-legenda').hidden = true;
    out.innerHTML = '<div class="nt-out-hd"><b>📨 Mensagens geradas</b><button type="button" class="btn btn-o" id="nt-voltar">← Voltar à seleção</button></div>' +
      Object.values(emps).map((e, k) => { const c = E.clientes.find((y) => y.id === e.cli) || {};
        return '<section class="nt-msg" data-k="' + k + '"><div class="nt-msg-hd"><b>' + esc(e.nome) + '</b><span class="sub">' + plural(e.itens.length, 'guia', 'guias') + '</span></div>' +
          '<div class="nt-vals">' + e.itens.map((g) => '<label><small>Parcela ' + esc(g.numero || '?') + ' · ' + esc(g.p.natureza || '') + '</small><span class="rt-vbox"><span>R$</span><input data-nt-v="' + g.id + '" data-mascara="nenhuma" inputmode="decimal" value="' + (g._valor ? valorParaCampo(g._valor) : '') + '" aria-label="Valor da guia"></span></label>').join('') + '</div>' +
          '<textarea class="nt-txt" rows="12">' + esc(textoNotifParcelas(e.nome, e.itens)) + '</textarea>' +
          '<div class="nt-env-l"><input class="nt-para" placeholder="e-mail do cliente" value="' + esc(c.email || '') + '">' +
            '<input class="nt-tel" data-mascara="tel" inputmode="tel" placeholder="WhatsApp" value="' + esc(c.telefone || '') + '"></div>' +
          '<div class="acoes nt-bts"><button type="button" class="btn btn-o" data-nt-copiar>📋 Copiar</button><button type="button" class="btn btn-v" data-nt-zap>💬 WhatsApp</button>' +
            '<button type="button" class="btn btn-o" data-nt-rasc title="Guarda o e-mail pronto na pasta Rascunhos do seu Gmail">📝 Rascunho no Gmail</button>' +
            '<button type="button" class="btn btn-p" data-nt-email>✉ Enviar e-mail</button><button type="button" class="btn btn-o" data-nt-marcar title="Use depois de copiar ou mandar pelo WhatsApp">✓ Marcar como enviada</button></div></section>'; }).join('');
    const E2 = Object.values(emps);
    out.querySelectorAll('.nt-msg').forEach((s) => { const e = E2[+s.dataset.k]; preencherDestino(s.querySelector('.nt-para'), e.cli, e.grupo, 'parcelas'); });
    out.oninput = (ev) => { const iv = ev.target.closest('[data-nt-v]'); if (!iv) return; const s = iv.closest('.nt-msg'), e = E2[+s.dataset.k];
      const g = e.itens.find((y) => y.id === iv.dataset.ntV), v = lerValor(iv.value); g._valor = isNaN(v) ? 0 : v;
      s.querySelector('.nt-txt').value = textoNotifParcelas(e.nome, e.itens); };
    out.onclick = (ev) => {
      if (ev.target.closest('#nt-voltar')) { out.hidden = true; $('nt-sel').hidden = false; el.querySelector('.rt-filtros').hidden = false; el.querySelector('.nt-legenda').hidden = false; return pintar(); }
      const s = ev.target.closest('.nt-msg'); if (!s) return; const e = E2[+s.dataset.k], txt = s.querySelector('.nt-txt').value;
      const marcar = async () => { for (const g of e.itens) await q(sb.rpc('registrar_emissao', { p_tabela: 'parcelas', p_id: g.id, p_emitida: true, p_doc: null, p_enviar: false }));
        e.itens.forEach((g) => { g.enviada = true; _plSel.delete(g.id); }); s.classList.add('nt-feita'); };
      const b = ev.target.closest('button'); if (!b) return;
      if (b.matches('[data-nt-copiar]')) return comBotao(b, async () => { await copiarTexto(txt); aviso('✓ Texto copiado — cole no WhatsApp ou no e-mail. Depois clique em "Marcar como enviada".'); });
      if (b.matches('[data-nt-zap]')) { const tel = soDigitos(s.querySelector('.nt-tel').value);
        window.open('https://wa.me/' + (tel ? (tel.length <= 11 ? '55' : '') + tel : '') + '?text=' + encodeURIComponent(txt), '_blank', 'noopener'); return; }
      if (b.matches('[data-nt-marcar]')) return comBotao(b, async () => { await marcar(); aviso('✓ ' + plural(e.itens.length, 'guia marcada', 'guias marcadas') + ' como enviada.'); });
      if (b.matches('[data-nt-email],[data-nt-rasc]')) return comBotao(b, async () => {
        const para = s.querySelector('.nt-para').value.trim(); if (!para) throw new Error('Escolha ou digite o e-mail.');
        if (e.itens.some((g) => !(g._valor > 0))) throw new Error('Confira o valor de todas as guias.');
        const r = await q(sb.rpc(b.matches('[data-nt-rasc]') ? 'salvar_guias_rascunho' : 'enviar_guias_email', { p_cliente: e.cli || null, p_grupo: e.grupo || null,
          p_itens: e.itens.map((g) => ({ tabela: 'parcelas', id: g.id, descricao: descricaoGuia('parcelas', Object.assign({}, g, { parcelamentos: g.p, parcela: (g.numero || '?') + '/' + (g.p.total_parcelas || '') })), vencimento: g.vencimento, valor: g._valor })),
          p_assunto: 'Guias de parcelamento — ' + e.nome, p_texto: txt, p_docs: [], p_para: para, p_arquivos: [] }));
        e.itens.forEach((g) => { g.enviada = true; _plSel.delete(g.id); }); s.classList.add('nt-feita');
        await avisoEnvio('', r); });
    };
  };
  $('nt-gerar').onclick = gerar;
  ligarFiltroRotina(el, pintar); pintar();
}


// ── 3c) Backup 35/43: "Planilha de parcelamentos" (voltou no Backup 43; deixou de ser teste) — igual à planilha do escritório: uma aba por GRUPO e um bloco por
// parcelamento (Nome, CPF/CNPJ, Local, Natureza, Nº, Total, Pagas, Valor da última parcela, Valor residual, Emitimos, observação) com a
// lista PARCELA · VENCIMENTO · EMISSÃO · PAGAMENTO. Botão "Emitir guias": as em atraso + as que vencem neste mês (como no ERP antigo).
async function rotinaPlanilha(el) {
  if (!E.clientes.length) await carregarCadastros();
  const h = hojeISO(), fimMes = fimDoMesGuia(h);
  const [PA, P2] = await Promise.all([
    buscarTodos(() => sb.from('parcelamentos').select('id, empresa, cnpj, local, natureza, numero, total_parcelas, valor_ultima_parcela, grupo_id, emitimos_guia, obs').order('id')),
    buscarTodos(() => sb.from('parcelas').select('id, parcelamento_id, numero, vencimento, pago, data_pagamento, emitida_em, emissao, valor, guia_doc').order('vencimento').order('id'))]);
  const porPa = {}; P2.forEach((x) => { (porPa[x.parcelamento_id] = porPa[x.parcelamento_id] || []).push(x); });
  const gnome = (id) => nomeGrupo(id) || 'Sem grupo';
  const grupos = [...new Set(PA.map((p) => gnome(p.grupo_id)))].sort((a, b) => (a === 'Sem grupo') - (b === 'Sem grupo') || a.localeCompare(b, 'pt-BR'));
  E.rt.plGrupo = grupos.includes(E.rt.plGrupo) ? E.rt.plGrupo : grupos[0];
  const emit = (x) => !!x.emitida_em || /sim|emitid/i.test(x.emissao || '');
  // "a emitir agora" = não paga, nós emitimos, sem emissão e vencendo até o fim do mês (vencidas entram de novo: reemissão)
  const aEmitir = (p) => p.emitimos_guia === false ? [] : (porPa[p.id] || []).filter((x) => !x.pago && x.vencimento && x.vencimento <= fimMes && (!emit(x) || x.vencimento < h));
  // parcelas que ainda não foram lançadas: completa a lista até a última (mês a mês, a partir da última lançada)
  const prevista = (ps, tot) => { const u = ps[ps.length - 1], n0 = u ? Number(u.numero) : 0; if (!u || !n0 || !u.vencimento || !(tot > n0)) return [];
    const out = []; for (let n = n0 + 1; n <= Math.min(tot, n0 + 240); n++) { const d = new Date(u.vencimento + 'T12:00:00'), dia = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + (n - n0));
      d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); out.push({ n, v: d.toISOString().slice(0, 10) }); } return out; };
  const nGrupo = (g) => PA.filter((p) => gnome(p.grupo_id) === g).reduce((s2, p) => s2 + aEmitir(p).length, 0);
  const pintar = () => {
    const L = PA.filter((p) => gnome(p.grupo_id) === E.rt.plGrupo).sort((a, b) => String(a.empresa).localeCompare(String(b.empresa), 'pt-BR') || String(a.natureza).localeCompare(String(b.natureza), 'pt-BR'));
    const nE = L.reduce((s2, p) => s2 + aEmitir(p).length, 0);
    el.innerHTML = '<div class="card pl-card"><div class="card-hd">📋 Planilha de parcelamentos<span class="sub">uma aba por grupo, um bloco por parcelamento · clique em EMISSÃO ou PAGAMENTO para marcar</span></div>' +
      '<div class="card-bd"><div class="pl-abas" role="tablist">' + grupos.map((g) => { const n = nGrupo(g);
        return '<button type="button" role="tab" class="pl-aba' + (g === E.rt.plGrupo ? ' ativo' : '') + '" data-pl-g="' + esc(g) + '">' + esc(g) + (n ? ' <span class="pl-n" title="Guias a emitir">' + n + '</span>' : '') + '</button>'; }).join('') + '</div>' +
      '<div class="pl-barra"><span class="sub">' + plural(L.length, 'parcelamento', 'parcelamentos') + ' em <b>' + esc(E.rt.plGrupo || '—') + '</b> · ' + (nE ? plural(nE, 'guia a emitir', 'guias a emitir') + ' (em atraso + vencem neste mês)' : 'nenhuma guia a emitir agora') + '</span>' +
        '<button type="button" class="btn btn-p" id="pl-emitir">🧾 Emitir guias — em atraso + vencem neste mês' + (nE ? ' (' + nE + ')' : '') + '</button></div>' +
      '<div class="pl-blocos">' + L.map((p) => {
        const ps = (porPa[p.id] || []).slice().sort((x, y) => String(x.vencimento).localeCompare(String(y.vencimento))), pagas = ps.filter((x) => x.pago).length, tot = Number(p.total_parcelas) || ps.length, v = Number(p.valor_ultima_parcela) || 0;
        const resid = v * Math.max(0, tot - pagas), cli = p.emitimos_guia === false, atr = ps.filter((x) => !x.pago && x.vencimento < h).length, nAe = aEmitir(p).length;
        const pct = tot ? Math.round(100 * pagas / tot) : 0;
        return '<section class="pl-bloco" data-pl-pa="' + p.id + '">' +
          '<div class="pl-cab"><div class="pl-cab-nome">' + esc(p.empresa || '—') + '</div>' +
            '<div class="pl-cab-doc">' + esc(mascaraDoc(p.cnpj) || 'sem CPF/CNPJ') + '</div>' +
            '<div class="pl-cab-tags">' + [p.local, p.natureza].filter(Boolean).map((z) => '<span class="pl-tag">' + esc(z) + '</span>').join('') + (p.numero ? '<span class="pl-tag pl-tag-n">nº ' + esc(p.numero) + '</span>' : '') + '</div>' +
            '<div class="pl-prog"><div class="pl-prog-bar"><span style="width:' + pct + '%"></span></div><span><b>' + pagas + '</b> de ' + (tot || '—') + ' pagas' + (atr ? ' · <b class="pl-atr-t">' + atr + ' em atraso</b>' : '') + '</span></div>' +
            '<div class="pl-kpis"><div><small>Última parcela</small><span class="rt-vbox"><span>R$</span><input data-pl-v="' + p.id + '" data-mascara="nenhuma" inputmode="decimal" value="' + (v ? valorParaCampo(v) : '') + '" aria-label="Valor da última parcela"></span></div>' +
              '<div><small>Valor residual</small><b>' + brl(resid) + '</b></div></div>' +
            '<div class="pl-cab-pe"><label class="rt-chave rt-chave-mini"><input type="checkbox" data-pl-emit="' + p.id + '"' + (cli ? '' : ' checked') + '><span></span><small>' + (cli ? 'O cliente emite as guias' : 'Nós emitimos as guias') + '</small></label>' +
              (nAe ? '<span class="pill hoje">' + plural(nAe, 'a emitir', 'a emitir') + '</span>' : '') + '</div>' +
            '<input class="pl-obs" data-pl-obs="' + p.id + '" value="' + esc(p.obs || '') + '" placeholder="Observação (ex.: enviar por WhatsApp)" aria-label="Observação">' +
            // Backup 37: emitir mesmo parcela futura — deste parcelamento ou de todos os parcelamentos da empresa
            (cli ? '' : '<div class="pl-cab-bts"><button type="button" class="btn btn-o btn-mini" data-pl-gpa="' + p.id + '" title="Em atraso + do mês; se não houver, a próxima parcela">🧾 Emitir deste parcelamento</button>' +
              '<button type="button" class="btn btn-o btn-mini" data-pl-gemp="' + esc(p.empresa || '') + '" title="Todos os parcelamentos desta empresa">🧾 Todos da empresa</button></div>') + '</div>' +
          (ps.length ? '<table class="pl-tab"><colgroup><col style="width:12%"><col style="width:28%"><col style="width:30%"><col style="width:30%"></colgroup><thead><tr><th title="Parcela">Nº</th><th>Vencimento</th><th>Emissão</th><th>Pagamento</th></tr></thead><tbody>' +
          ps.map((x) => { const at = !x.pago && x.vencimento < h, mes = x.vencimento && x.vencimento.slice(0, 7) === h.slice(0, 7), em = emit(x);
            const curta = (d) => { const s = dataBR(d); return s.slice(0, 6) + s.slice(8); }, dEm = x.emitida_em ? curta(x.emitida_em) : em ? 'emitida' : '';
            return '<tr class="' + (x.pago ? 'pl-pago' : at ? 'pl-atr' : mes ? 'pl-mes' : '') + '"><td>' + esc(x.numero || '') + '</td><td>' + dataBR(x.vencimento) + '</td>' +
              '<td>' + (cli ? '<span class="pl-dt pl-dt-cli" title="O cliente emite">cliente</span>'
                : em ? '<button type="button" class="pl-dt pl-dt-ok" data-pl-e="' + x.id + '" title="Emitida' + (x.emitida_em ? ' em ' + dataBR(x.emitida_em) : '') + ' · clique para desmarcar">✓ ' + esc(dEm) + '</button>'
                : x.pago ? '<span class="pl-dt">—</span>'
                : '<span class="pl-em2"><button type="button" class="pl-dt pl-dt-emitir" data-pl-gx="' + x.id + '" title="Abrir o envio com esta guia (vale parcela futura)">🧾 Emitir</button><button type="button" class="pl-dt-mk" data-pl-e="' + x.id + '" title="Só marcar como emitida (sem enviar)">✓</button></span>') + '</td>' +
              '<td>' + (x.pago ? '<span class="pl-dt pl-dt-ok" title="Paga">✓ ' + (x.data_pagamento ? curta(x.data_pagamento) : 'paga') + '</span>'
                : '<button type="button" class="pl-dt ' + (at ? 'pl-dt-atr' : 'pl-dt-ab') + '" data-pl-p="' + x.id + '" title="Clique para lançar o pagamento">' + (at ? 'em atraso' : 'a vencer') + '</button>') + '</td></tr>'; }).join('') +
          prevista(ps, tot).map((r) => '<tr class="pl-prev" title="Parcela ainda não lançada no sistema (data prevista)"><td>' + r.n + '</td><td>' + dataBR(r.v) + '</td><td>—</td><td>prevista</td></tr>').join('') +
          '</tbody></table>' : '<div class="pl-sem">Nenhuma parcela lançada neste parcelamento.</div>') + '</section>'; }).join('') + (L.length ? '' : vazio('Nenhum parcelamento neste grupo.')) + '</div></div></div>';
  };
  const recarregar = () => rotinaPlanilha(el);
  el.onclick = (ev) => {
    const ab = ev.target.closest('[data-pl-g]'); if (ab) { E.rt.plGrupo = ab.dataset.plG; return pintar(); }
    const be = ev.target.closest('[data-pl-e]');
    if (be) return comBotao(be, async () => { const x = P2.find((y) => y.id === be.dataset.plE), novo = !emit(x);
      await q(sb.rpc('registrar_emissao', { p_tabela: 'parcelas', p_id: x.id, p_emitida: novo, p_doc: null, p_enviar: false }));
      x.emitida_em = novo ? h : null; x.emissao = novo ? 'SIM' : ''; pintar(); });
    // Backup 37: emitir pelo mesmo envio dos outros módulos (vale parcela futura)
    const gx = ev.target.closest('[data-pl-gx]'); if (gx) return gerarGuias('parcelas', { ids: [gx.dataset.plGx] }, recarregar);
    const gpa = ev.target.closest('[data-pl-gpa]'); if (gpa) return gerarGuias('parcelas', { itens: [gpa.dataset.plGpa], proximas: true }, recarregar);
    const gemp = ev.target.closest('[data-pl-gemp]'); if (gemp) return gerarGuias('parcelas', { empresa: gemp.dataset.plGemp, proximas: true }, recarregar);
    const bp = ev.target.closest('[data-pl-p]');
    if (bp && !confirm('Lançar o pagamento desta parcela?')) return;
    if (bp && window.ERP_EDITOR && window.ERP_EDITOR.baixaRapida) return Promise.resolve(window.ERP_EDITOR.baixaRapida('parcelas', bp.dataset.plP)).then(() => setTimeout(recarregar, 1500));
    if (ev.target.closest('#pl-emitir')) {
      const gid = (PA.find((p) => gnome(p.grupo_id) === E.rt.plGrupo) || {}).grupo_id;
      if (gid) return gerarGuias('parcelas', { grupo_id: gid }, recarregar);
      const its = PA.filter((p) => gnome(p.grupo_id) === E.rt.plGrupo).flatMap((p) => aEmitir(p).map((x) => {
        const ult = (porPa[p.id] || []).filter((y) => y.valor != null && y.vencimento <= x.vencimento).slice(-1)[0];
        return Object.assign({}, x, { parcelamentos: p, quem: p.empresa, grupo_id: p.grupo_id, email_em: null, parcela: (x.numero || '?') + (p.total_parcelas ? '/' + p.total_parcelas : ''),
          valor: x.valor != null ? Number(x.valor) : ult ? Number(ult.valor) : Number(p.valor_ultima_parcela) || 0, detalhe: [p.natureza, p.local].filter(Boolean).join(' · '),
          cliente_id: (E.clientes.find((c) => (soDigitos(p.cnpj) && soDigitos(c.cpf_cnpj) === soDigitos(p.cnpj)) || c.nome === p.empresa) || {}).id || null }); }));
      if (its.length) janelaGuiasEmpresa('parcelas', its, null, recarregar);
      else aviso('Nenhuma guia a emitir em ' + (E.rt.plGrupo || 'este grupo') + ': não há parcela em atraso nem vencendo neste mês (que o escritório emita).');
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
