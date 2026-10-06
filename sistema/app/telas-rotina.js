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
const ABAS_ROTINA = [['passivo', '🏛 Passivo e cadastro'], ['processos', '⚖ Processos'], ['planilha', '📋 Planilha de parcelamentos'], ['guias', '📨 Enviar guias do mês'], ['acs', '🤝 Acordos'], ['tarefas', '✓ Minhas tarefas']];
const TIPOS_MOV = [['sem_novidade', '✓ Sem novidade'], ['movimentacao', 'Movimentação'], ['decisao', 'Decisão relevante'], ['valor', 'Mudança de valor'], ['procuracao', 'Procuração juntada']];
const PARES_PASSIVO = [['rfb', 'RFB'], ['pgfn', 'PGFN'], ['age_mg', 'AGE/MG']];
const COLS_PASSIVO = [['rfb', 'RFB'], ['rfb_negociada', 'RFB negociada'], ['pgfn', 'PGFN'], ['pgfn_negociada', 'PGFN negociada'], ['age_mg', 'AGE/MG'], ['age_mg_negociada', 'AGE/MG negociada']];
const CAPAG_OPCOES = ['', 'A', 'B', 'C', 'D', 'Omisso'];

TELAS.rotina = async function () {
  E.rt = Object.assign({ aba: 'passivo', busca: '', grupo: '', filtro: '' }, E.rt || {});
  if (E.rt.aba === 'parcs' || E.rt.aba === 'acs' || E.rt.aba === 'financeiro') E.rt.aba = 'planilha';   // Backup 42: o Controle saiu
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
  try { await ({ passivo: rotinaPassivo, processos: rotinaProcessos, planilha: rotinaPlanilha, guias: rotinaEnviarGuias, tarefas: rotinaTarefas })[E.rt.aba](el); }
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
    '<div class="tabela-wrap rt-grade rt-pas rt-sem-altura" data-sem-pagina><table><colgroup><col class="rt-w-emp"><col class="rt-w-org"><col class="rt-w-org"><col class="rt-w-org"><col class="rt-w-ceat"><col class="rt-w-sn"><col class="rt-w-sn"><col class="rt-w-capag"><col class="rt-w-conf"></colgroup><thead><tr><th>Empresa</th>' + PARES_PASSIVO.map(([k, r]) => '<th class="rt-num">' + r + '<small>em aberto · negociada</small></th>').join('') +
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
  // Backup 45: preencher como numa planilha — Enter (ou ↓) desce para a mesma coluna da empresa de baixo, ↑ sobe; ao entrar no campo o valor fica selecionado
  $('rt-pas-corpo').addEventListener('keydown', (ev) => {
    const i = ev.target.closest('input.rt-in'); if (!i || !['Enter', 'ArrowDown', 'ArrowUp'].includes(ev.key)) return;
    const linhas = [...$('rt-pas-corpo').querySelectorAll('tr[data-id]')], tr = i.closest('tr'), k = linhas.indexOf(tr), td = i.closest('td');
    const col = [...tr.children].indexOf(td), neg = i.classList.contains('rt-neg');
    const alvo = linhas[k + (ev.key === 'ArrowUp' ? -1 : 1)]; if (!alvo) return;
    ev.preventDefault();
    const cel = alvo.children[col], prox = cel && (cel.querySelector(neg ? 'input.rt-neg' : 'input.rt-in:not(.rt-neg)') || cel.querySelector('.rt-in'));
    if (prox) { prox.focus(); if (prox.select) prox.select(); }
  });
  $('rt-pas-corpo').addEventListener('focusin', (ev) => { const i = ev.target.closest('input.rt-in'); if (i && i.select) setTimeout(() => { try { i.select(); } catch (e) { /* campo saiu */ } }, 0); });
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
const dCurta = (ts) => { const x = dataLocal(ts); return x.slice(0, 6) + x.slice(8); };   // 03/10/26
const diasDesde = (ts) => ts ? Math.floor((Date.now() - new Date(ts).getTime()) / 864e5) : null;
function celulaConferencia(x, id) {
  x = x || {};
  // Backup 33: mais de 15 dias sem conferir = amarelo; mais de 30 (ou nunca) = vermelho. Datas no fuso de quem olha (Brasília)
  const d = diasDesde(x.conferido_em), cls = d == null || d > 30 ? 'rt-cf-nunca' : d > 15 ? 'rt-cf-velho' : 'rt-cf-ok';
  const alt = x.alterado_em ? 'Última alteração: ' + dataHoraBR(x.alterado_em) + (x.alterado_por ? ' por ' + x.alterado_por : '') : 'Sem alteração registrada';
  // Backup 45: uma linha só para o que aconteceu ("✓ conferido" ou "✎ alterado") e, embaixo, quem · há quanto tempo · alteração de outro dia (sem repetir "alterado")
  const altOutra = x.alterado_em && !(x.conferido_alterou && dataLocal(x.alterado_em) === dataLocal(x.conferido_em));
  const sub = [x.conferido_em ? String(x.conferido_por || '').split(' ')[0] : '', d != null && d > 15 ? 'há ' + d + ' d' : '', altOutra ? 'alt. ' + dCurta(x.alterado_em) : ''].filter(Boolean).join(' · ');
  return '<div class="rt-cf ' + cls + '" title="' + esc(alt) + '"><span class="rt-cf-txt">' +
      (x.conferido_em ? (x.conferido_alterou ? '✎ alterado ' : '✓ conferido ') + dCurta(x.conferido_em) : 'nunca conferido') + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>' +
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

// ── 2) Processos: acompanhamento — Backup 45: conferência na última coluna (como no Passivo), filtros em azul (procuração, conferência, tribunal)
// e o tribunal tirado do número CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO). "Sem novidade" deixou de ser botão solto: é uma opção da janela de conferência.
const UF_TR = ['', 'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SE', 'SP', 'TO'];
function tribunalProcesso(p) {
  const c = String(p.competencia || '').trim().toUpperCase(); if (/^(TJ|TRF|TRT|TRE|STJ|STF|TST|TJM|CARF|JF)/.test(c)) return c.split(/[\s—–-]/)[0];
  const m = String(p.numero || '').replace(/\s/g, '').match(/\d{7}-?\d{2}\.?\d{4}\.?(\d)\.?(\d{2})\.?\d{4}/); if (!m) return '';
  const j = m[1], tr = Number(m[2]);
  return j === '8' ? 'TJ' + (UF_TR[tr] || tr) : j === '4' ? 'TRF' + tr : j === '5' ? 'TRT' + tr : j === '6' ? 'TRE-' + (UF_TR[tr] || tr) : j === '9' ? 'TJM-' + (UF_TR[tr] || tr)
    : j === '3' ? 'STJ' : j === '1' ? 'STF' : j === '7' ? 'STM' : '';
}
async function rotinaProcessos(el) {
  const P = await buscarTodos(() => sb.from('processos').select('id, numero, grupo_id, natureza, competencia, autor, reu, valor, procuracao, obs, atualizacao, ultima_movimentacao, ultima_movimentacao_em, grupos(nome)').order('id'));
  const ULT = {}; (await buscarTodos(() => sb.from('processo_movimentacoes').select('processo_id, tipo, quem, criado_em').order('criado_em', { ascending: false }).order('id')).catch(() => []))
    .forEach((m) => { if (!ULT[m.processo_id]) ULT[m.processo_id] = m; });
  P.forEach((p) => { p._trib = tribunalProcesso(p); p._dias = p.ultima_movimentacao_em ? Math.floor((new Date(hojeISO() + 'T12:00:00') - new Date(p.ultima_movimentacao_em + 'T12:00:00')) / 864e5) : null; });
  // Backup 46: dá para marcar vários filtros ao mesmo tempo (dentro do mesmo grupo vale "ou"; entre grupos, "e"); tribunal em lista suspensa
  const F = E.rt.fp = Object.assign({ proc: [], conf: [], trib: '' }, E.rt.fp || {});
  if (!Array.isArray(F.proc)) F.proc = F.proc ? [F.proc] : [];
  if (!Array.isArray(F.conf)) F.conf = [];
  const tribs = [...new Set(P.map((p) => p._trib).filter(Boolean))].sort();
  el.innerHTML = '<div class="card"><div class="card-hd">⚖ Acompanhamento dos processos<span class="sub">confira no tribunal e clique em ✓ na linha: marque “sem novidade” ou registre o que mudou</span>' +
      '<button type="button" class="btn btn-p btn-mini" id="rt-novo-proc" style="margin-left:auto">+ Processo</button></div>' +
    '<div class="card-bd">' + filtroRotina('') +
    '<div class="rt-segs" id="rt-proc-segs"></div>' +
    '<div class="tabela-wrap rt-proc" data-sem-pagina><table><colgroup><col class="rt-w-pnum"><col class="rt-w-trib"><col class="rt-w-nat"><col><col class="rt-w-sn"><col class="rt-w-val"><col class="rt-w-conf"></colgroup>' +
      '<thead><tr><th>Processo</th><th>Tribunal</th><th>Natureza</th><th>Última movimentação</th><th>Procuração</th><th class="rt-num">Valor</th><th class="rt-c-conf">Conferência</th></tr></thead><tbody id="rt-proc-corpo"></tbody></table></div></div></div>';
  const base = () => { const b = normalizar(E.rt.busca);
    return P.filter((p) => (!E.rt.grupo || p.grupo_id === E.rt.grupo) && (!b || normalizar([p.numero, p.autor, p.reu, p.natureza, p._trib, p.grupos ? p.grupos.nome : ''].join(' ')).includes(b))); };
  const faixa = (p) => p._dias == null ? 'nunca' : p._dias <= 7 ? 'ate7' : p._dias <= 15 ? 'ate15' : p._dias <= 30 ? 'ate30' : 'mais30';
  const passa = (p, f) => (!f.proc.length || f.proc.includes(p.procuracao === true ? 'com' : 'sem')) && (!f.conf.length || f.conf.includes(faixa(p))) && (!f.trib || p._trib === f.trib);
  const seg = (chave, ops) => { const B = base();
    return '<div class="segmento rt-seg" data-seg="' + chave + '"><button type="button" data-v=""' + (F[chave].length ? '' : ' class="ativo"') + '>Todos</button>' +
      ops.map(([v, r]) => { const n = B.filter((p) => passa(p, Object.assign({}, F, { [chave]: [v] }))).length;
        return '<button type="button" data-v="' + esc(v) + '"' + (F[chave].includes(v) ? ' class="ativo"' : '') + '>' + esc(r) + ' <span class="seg-n">' + n + '</span></button>'; }).join('') + '</div>'; };
  const pintar = () => {
    $('rt-proc-segs').innerHTML = seg('proc', [['com', 'Com procuração'], ['sem', 'Sem procuração']]) +
      seg('conf', [['ate7', 'Conferidos ≤ 7 dias'], ['ate15', '8–15 dias'], ['ate30', '16–30 dias'], ['mais30', '+30 dias'], ['nunca', 'Nunca']]) +
      (tribs.length ? '<select class="busca rt-trib" id="rt-trib" aria-label="Tribunal"><option value="">Todos os tribunais</option>' +
        tribs.map((t) => '<option value="' + esc(t) + '"' + (F.trib === t ? ' selected' : '') + '>' + esc(t) + ' (' + base().filter((p) => p._trib === t).length + ')</option>').join('') + '</select>' : '');
    const L = base().filter((p) => passa(p, F))
      .sort((x, y) => String(x.grupos ? x.grupos.nome : '￿').localeCompare(String(y.grupos ? y.grupos.nome : '￿'), 'pt-BR') || String(x.ultima_movimentacao_em || '').localeCompare(String(y.ultima_movimentacao_em || '')));
    let grp = null;
    $('rt-proc-corpo').innerHTML = L.length ? L.map((p) => { const g = p.grupos ? p.grupos.nome : 'Sem grupo';
      return (g !== grp ? (grp = g, '<tr class="rt-grp"><td colspan="7">' + esc(g) + ' <span class="sub">' + plural(L.filter((z) => (z.grupos ? z.grupos.nome : 'Sem grupo') === g).length, 'processo', 'processos') + '</span></td></tr>') : '') +
      '<tr><td><b class="mono">' + esc(p.numero) + '</b><div class="sub">' + esc(p.reu || p.autor || '') + '</div></td>' +
      '<td>' + (p._trib ? '<span class="pill neutro">' + esc(p._trib) + '</span>' : '<span class="sub">—</span>') + '</td>' +
      '<td>' + esc(p.natureza || '—') + '</td><td class="rt-mov">' + (p.ultima_movimentacao ? esc(p.ultima_movimentacao) : '<span class="sub">nada registrado</span>') + '</td>' +
      '<td><span class="pill ' + (p.procuracao ? 'pago' : 'vencido') + '">' + (p.procuracao ? 'Sim' : 'Não') + '</span></td>' +
      '<td class="rt-num">' + (p.valor ? brl(p.valor) : '—') + '</td>' +
      '<td class="rt-c-conf">' + celulaConfProc(p, ULT[p.id]) + '</td></tr>'; }).join('')
      : '<tr><td colspan="7">' + vazio('Nenhum processo com esses filtros.') + '</td></tr>';
  };
  $('rt-proc-segs').onclick = (ev) => { const b = ev.target.closest('[data-v]'); if (!b) return; const k = b.closest('[data-seg]').dataset.seg, v = b.dataset.v;
    F[k] = !v ? [] : F[k].includes(v) ? F[k].filter((x) => x !== v) : F[k].concat([v]); pintar(); };
  $('rt-proc-segs').onchange = (ev) => { if (ev.target.id !== 'rt-trib') return; F.trib = ev.target.value; pintar(); };
  $('rt-proc-corpo').onclick = (ev) => { const b = ev.target.closest('[data-mov]'); if (b) janelaMovimentacao(b.dataset.mov, () => rotinaProcessos(el), { conferir: true }); };
  $('rt-novo-proc').onclick = () => { if (window.ERP_EDITOR && window.ERP_EDITOR.abrirFormulario) window.ERP_EDITOR.abrirFormulario('processos', null, { carteira: 'Ativo', status: 'Em andamento' }); else aviso('Use + Lançar → Processo.', true); };
  ligarFiltroRotina(el, pintar); pintar();
}
function celulaConfProc(p, m) {
  const d = p._dias != null ? p._dias : p.ultima_movimentacao_em ? Math.floor((new Date(hojeISO() + 'T12:00:00') - new Date(p.ultima_movimentacao_em + 'T12:00:00')) / 864e5) : null;
  const sub = [m ? String(m.quem || '').split(' ')[0] : '', m ? (m.tipo === 'sem_novidade' ? 'sem novidade' : 'com alteração') : '', d != null && d > 15 ? 'há ' + d + ' d' : ''].filter(Boolean).join(' · ');
  return '<div class="rt-cf ' + (d == null || d > 30 ? 'rt-cf-nunca' : d > 15 ? 'rt-cf-velho' : 'rt-cf-ok') + '"><span class="rt-cf-txt">' +
    (d == null ? 'nunca conferido' : (m && m.tipo !== 'sem_novidade' ? '✎ alterado ' : '✓ conferido ') + dataBR(p.ultima_movimentacao_em).replace(/\/(\d\d)(\d\d)$/, '/$2')) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>' +
    '<button type="button" class="btn btn-o btn-mini" data-mov="' + p.id + '" title="Conferi no tribunal: marcar “sem novidade” ou registrar o que mudou">✓</button></div>';
}
// janela "Registrar movimentação" (também no detalhe do processo, em Jurídico → Processos)
async function janelaMovimentacao(processoId, depois, opc) {
  const [p] = await q(sb.from('processos').select('id, numero, valor, obs, grupos(nome)').eq('id', processoId));
  if (!p) return aviso('Processo não encontrado.', true);
  const H = await q(sb.from('processo_movimentacoes').select('*').eq('processo_id', processoId).order('data', { ascending: false }).order('criado_em', { ascending: false }).limit(30)).catch(() => []);
  const rot = Object.fromEntries(TIPOS_MOV);
  const j = abrirJanela({ titulo: (opc && opc.conferir ? 'Conferir processo ' : 'Processo ') + p.numero, larga: true,
    corpo: '<form class="form-grid" id="mov-form">' +
      campo('Data', '<input name="data" value="' + dataBR(hojeISO()) + '" placeholder="dd/mm/aaaa">') +
      // Backup 45: escolha em botões; "Sem novidade" é a primeira opção (a conferência sem alteração)
      '<div class="campo inteiro"><span>O que aconteceu</span><input type="hidden" name="tipo" value="' + (opc && opc.conferir ? 'sem_novidade' : 'movimentacao') + '"><div class="segmento mov-tipos">' +
        TIPOS_MOV.map(([v, r]) => '<button type="button" data-tipo="' + v + '"' + ((opc && opc.conferir ? 'sem_novidade' : 'movimentacao') === v ? ' class="ativo"' : '') + '>' + r + '</button>').join('') + '</div></div>' +
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
  j.querySelector('.mov-tipos').onclick = (ev) => { const b = ev.target.closest('[data-tipo]'); if (!b) return; f.tipo.value = b.dataset.tipo;
    j.querySelectorAll('.mov-tipos button').forEach((x) => x.classList.toggle('ativo', x === b)); mostrarValor(); };
  mostrarValor();
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

// ── 3) Backup 45: ENVIAR GUIAS DO MÊS — o meio oficial de mandar as guias, IDÊNTICO às antigas "Notificações → Parcelamento" do ERP antigo:
// seleção por empresa (marcar a empresa marca todas as guias), "📨 Gerar Notificação", um cartão por empresa com o texto (valor editável no
// próprio texto), ✏️ Editar · 📋 Copiar · ✉ Enviar e-mail · 💬 Enviar WhatsApp · ✉ Marcar enviado. "Enviar e-mail" salva um RASCUNHO no Gmail
// (como o Apps Script fazia), já com o e-mail do cliente — e os PDFs das guias são anexados aqui no cartão (vão junto no rascunho).
const _epSel = new Set();
function textoNotifParcelas(empresa, itens) {   // _epTexto('parc') do ERP antigo, palavra por palavra ([VALOR] vira o campo do valor)
  let t = 'Prezados,\n\nSeguem as guias dos parcelamentos da ' + empresa + ' com vencimento neste mês. Antes de pagar, confirme se a guia já não foi paga, para evitar duplicidade.';
  itens.forEach((g) => { t += '\n\n' + (g.vencida ? '⚠︎ GUIA VENCIDA\n' : '') + 'Parcelamento ' + (g.p.local || g.p.natureza || '') + ' — Natureza: ' + (g.p.natureza || '—') +
    '\nNº do Parcelamento: ' + (g.p.numero || '—') + '\nParcela: ' + (g.numero || '?') + ' de ' + (g.p.total_parcelas || '?') + ' | Vencimento: ' + (g.vencimento ? dataBR(g.vencimento) : '—') +
    '\nNº da Guia: ' + (g.numero || '—') + '\n' + (g._valor ? '[VALOR:' + valorParaCampo(g._valor) + ']' : '[VALOR]'); });
  return t;
}
// o texto com os campos de valor dentro (como no ERP antigo: "Valor: R$ ____")
function epHtml(txt) {
  return txt.split('\n').map((linha) => {
    const l = esc(linha), mv = l.match(/\[VALOR(?::([^\]]*))?\]/);
    if (mv) return l.replace(mv[0], () => '<span class="ep-val-wrap"><strong>Valor:</strong> R$&nbsp;<input class="ep-val" data-mascara="nenhuma" inputmode="decimal" placeholder="0,00" title="Preencha antes de copiar" value="' + (mv[1] || '') + '"></span>');
    return l.replace(/^(⚠.+)$/, '<strong class="ep-alerta">$1</strong>').replace(/^(Prezados,)$/, '<strong>$1</strong>').replace(/(Parcelamento [^—\n]+—)/g, '<strong>$1</strong>')
      .replace(/(Parcela:|Vencimento:|Nº da Guia:|Nº do Parcelamento:)/g, '<strong>$1</strong>');
  }).join('\n');
}
function epTextoAtual(card) {   // o texto como vai para o e-mail/WhatsApp (o valor digitado no lugar do campo)
  const ed = card.querySelector('.ep-card-edit');
  if (!ed.hidden) return ed.value.replace(/\[VALOR(?::([^\]]*))?\]/g, (_, v) => 'R$ ' + (v && v.trim() ? v.trim() : '_____'));
  const c = card.querySelector('.ep-card-body').cloneNode(true);
  c.querySelectorAll('.ep-val-wrap').forEach((w) => { const v = w.querySelector('input').value.trim(); w.replaceWith(document.createTextNode('Valor: R$ ' + (v || '_____'))); });
  return c.textContent;
}
function epParaEdicao(card) {
  const c = card.querySelector('.ep-card-body').cloneNode(true);
  c.querySelectorAll('.ep-val-wrap').forEach((w) => { const v = w.querySelector('input').value.trim(); w.replaceWith(document.createTextNode(v ? '[VALOR:' + v + ']' : '[VALOR]')); });
  return c.textContent;
}
async function rotinaEnviarGuias(el) {
  if (!E.clientes.length) await carregarCadastros();
  const h = hojeISO(), fimMes = fimDoMesGuia(h);
  const [PA, P2] = await Promise.all([
    buscarTodos(() => sb.from('parcelamentos').select('id, empresa, cnpj, local, natureza, numero, total_parcelas, valor_ultima_parcela, grupo_id, emitimos_guia').order('id')),
    buscarTodos(() => sb.from('parcelas').select('id, parcelamento_id, numero, vencimento, pago, emitida_em, emissao, valor').order('vencimento').order('id'))]);
  const porId = {}; PA.forEach((p) => { porId[p.id] = p; });
  const ult = {}, G = [];
  P2.forEach((x) => { const p = porId[x.parcelamento_id]; if (!p) return;
    if (x.valor != null && Number(x.valor) > 0) ult[p.id] = Number(x.valor);
    if (x.pago || !x.vencimento || x.vencimento > fimMes) return;
    G.push(Object.assign(x, { p, clienteEmite: p.emitimos_guia === false, vencida: x.vencimento < h, enviada: !!x.emitida_em || /sim|emitid/i.test(x.emissao || ''),
      _valor: x.valor != null && Number(x.valor) > 0 ? Number(x.valor) : ult[p.id] != null ? ult[p.id] : Number(p.valor_ultima_parcela) || 0,
      cliente_id: (E.clientes.find((c) => (soDigitos(p.cnpj) && soDigitos(c.cpf_cnpj) === soDigitos(p.cnpj)) || c.nome === p.empresa) || {}).id || null })); });
  const empK = (g) => g.p.empresa || '—';
  el.innerHTML = '<div class="card ep-tela"><div class="card-bd">' +
    filtroRotina('') +
    // Backup 46: o normal é só quem o escritório emite; a exceção (cliente muito atrasado etc.) mostra também quem emite as próprias guias
    '<div class="ep-topo"><div id="ep-cnt" class="ep-cnt">Nenhum item selecionado.</div>' +
      '<label class="check ep-excecao" title="Mostra também os parcelamentos em que o próprio cliente emite as guias"><input type="checkbox" id="ep-todos"' + (E.rt.epTodos ? ' checked' : '') + '> Incluir clientes que emitem as próprias guias</label>' +
      '' +
      '<button type="button" class="ep-gen-btn" id="ep-gerar" disabled>📨 Gerar Notificação</button><button type="button" class="ep-atu-btn" id="ep-atu">↻ Atualizar</button></div>' +
    '<div class="ep-legenda"><span class="ep-leg"><span class="ep-dot ep-dot-v"></span>Vencida</span><span class="ep-leg"><span class="ep-dot ep-dot-m"></span>Vence este mês</span><span class="ep-leg"><span class="ep-dot ep-dot-e"></span>Enviada</span></div>' +
    '<div id="ep-sel"></div><div id="ep-out" hidden></div></div></div>';
  const visiveis = () => { const b = normalizar(E.rt.busca), dig = soDigitos(E.rt.busca);
    return G.filter((g) => (E.rt.epTodos || !g.clienteEmite) && (!E.rt.grupo || g.p.grupo_id === E.rt.grupo) &&
      (!b || normalizar([g.p.empresa, g.p.natureza, g.p.local, g.p.numero].join(' ')).includes(b) || (dig.length >= 3 && soDigitos(g.p.cnpj).includes(dig)))); };
  const contar = () => { const its = G.filter((g) => _epSel.has(g.id)), n = its.length, e = new Set(its.map(empK)).size;
    $('ep-cnt').innerHTML = n ? '<strong>' + plural(e, 'empresa', 'empresas') + '</strong> · <strong>' + plural(n, 'item selecionado', 'itens selecionados') + '.</strong>' : 'Nenhum item selecionado.';
    $('ep-gerar').disabled = !n; };
  const fechadas = new Set();
  const pintar = () => {
    const emps = {}; visiveis().forEach((g) => { (emps[empK(g)] = emps[empK(g)] || []).push(g); });
    const nomes = Object.keys(emps).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    $('ep-sel').innerHTML = nomes.length ? nomes.map((emp) => { const its = emps[emp];
      return '<div class="ep-emp"><div class="ep-emp-hd" data-ep-emp-hd="' + esc(emp) + '"><label><input type="checkbox" class="ep-emp-chk" data-ep-emp="' + esc(emp) + '"' + (its.every((g) => _epSel.has(g.id)) ? ' checked' : '') + '>' +
        '<span class="ep-emp-nome">' + esc(emp) + '</span><span class="ep-emp-meta">' + its.length + ' item' + (its.length !== 1 ? 's' : '') + '</span></label>' +
        '<span class="ep-emp-arrow" data-ep-seta="' + esc(emp) + '" title="Mostrar/ocultar itens">▾</span></div>' +
        '<div class="ep-emp-body"' + (fechadas.has(emp) ? ' hidden' : '') + '>' + its.map((g) => '<div class="ep-row' + (g.enviada ? ' ep-re' : g.vencida ? ' ep-rv' : '') + '" data-ep-row="' + g.id + '"><label>' +
          '<input type="checkbox" class="ep-chk" data-ep="' + g.id + '"' + (_epSel.has(g.id) ? ' checked' : '') + '>' +
          (g.enviada ? '<span class="ep-tag ep-te">✓ Enviada</span>' : g.vencida ? '<span class="ep-tag ep-tv">⚠︎ Vencida</span>' : '<span class="ep-tag ep-tm">📅 Este mês</span>') +
          '<span class="ep-row-lbl">' + esc((g.p.natureza || '') + (g.p.local && g.p.local !== g.p.natureza ? ' — ' + g.p.local : '')) + '</span>' + (g.clienteEmite ? '<span class="ep-tag ep-tc" title="Normalmente o próprio cliente emite esta guia">cliente emite</span>' : '') + '</label>' +
          '<span class="ep-row-venc">Venc. ' + dataBR(g.vencimento) + '</span></div>').join('') + '</div></div>'; }).join('')
      : '<div class="ep-vazio">✅ Nenhum item vencido ou vencendo neste mês' + (E.rt.grupo || E.rt.busca ? ' com esses filtros' : '') + '.</div>';
    contar();
  };
  $('ep-sel').onclick = (ev) => {
    const seta = ev.target.closest('[data-ep-seta]'); if (seta) { const k = seta.dataset.epSeta; if (fechadas.has(k)) fechadas.delete(k); else fechadas.add(k); return pintar(); }
    if (ev.target.closest('input,label')) return;
    // clicar na linha (fora da caixinha) também marca/desmarca, como no ERP antigo
    const hd = ev.target.closest('[data-ep-emp-hd]'); if (hd) { const c = hd.querySelector('.ep-emp-chk'); c.checked = !c.checked; c.dispatchEvent(new Event('change', { bubbles: true })); return; }
    const row = ev.target.closest('[data-ep-row]'); if (row) { const c = row.querySelector('.ep-chk'); c.checked = !c.checked; c.dispatchEvent(new Event('change', { bubbles: true })); }
  };
  $('ep-sel').onchange = (ev) => {
    const c = ev.target.closest('[data-ep]'); if (c) { if (c.checked) _epSel.add(c.dataset.ep); else _epSel.delete(c.dataset.ep); return pintar(); }
    const ce = ev.target.closest('[data-ep-emp]'); if (ce) { visiveis().filter((g) => empK(g) === ce.dataset.epEmp).forEach((g) => { if (ce.checked) _epSel.add(g.id); else _epSel.delete(g.id); }); pintar(); }
  };
  $('ep-atu').onclick = () => rotinaEnviarGuias(el);
  $('ep-todos').onchange = (ev) => { E.rt.epTodos = ev.target.checked; if (!ev.target.checked) G.filter((g) => g.clienteEmite).forEach((g) => _epSel.delete(g.id)); pintar(); };
  // ── mensagens geradas: um cartão por empresa ──
  const gerar = () => {
    const porEmp = {}; G.filter((g) => _epSel.has(g.id)).forEach((g) => { (porEmp[empK(g)] = porEmp[empK(g)] || []).push(g); });
    const lista = Object.keys(porEmp).sort((a, b) => a.localeCompare(b, 'pt-BR')).map((emp) => { const its = porEmp[emp], g0 = its[0], c = E.clientes.find((y) => y.id === g0.cliente_id) || {};
      return { emp, its, cli: g0.cliente_id, grupo: g0.p.grupo_id, tel: c.telefone || '', arquivos: [] }; });
    const out = $('ep-out'); out.hidden = false; $('ep-sel').hidden = true;
    el.querySelector('.ep-topo').hidden = true; el.querySelector('.ep-legenda').hidden = true; el.querySelector('.rt-filtros').hidden = true;
    out.innerHTML = '<div class="ep-out-hd"><div class="ep-out-tit">📨 Mensagens geradas</div><span class="ep-out-ac">' +
        (lista.length > 1 ? '<button type="button" class="btn btn-p btn-mini" id="ep-todos-rasc" title="Salva o rascunho no Gmail de todas as mensagens abaixo, uma por uma">✉ Salvar todos os rascunhos (' + lista.length + ')</button>' : '') +
        '<button type="button" class="btn btn-o btn-mini ep-voltar" id="ep-voltar">← Voltar à seleção</button></span></div>' +
      '<div class="ep-grid">' + lista.map((e, k) => { const tit = 'Guias de Parcelamento — ' + e.emp, wnum = soDigitos(e.tel), env = e.its.every((g) => g.enviada);
        return '<div class="ep-card" data-k="' + k + '"><div class="ep-card-hd2">' +
          '<div class="ep-card-hcol"><div class="ep-card-ch">📧 E-mail</div><div class="ep-card-emp">' + esc(e.emp) + '</div>' +
            '<div class="ep-card-assunto">Assunto: <em>' + esc(tit) + '</em></div>' +
            '<div class="ep-card-sub">Para: <input class="ep-para" placeholder="não cadastrado" aria-label="E-mail do cliente"></div></div>' +
          '<div class="ep-card-hcol"><div class="ep-card-ch ep-ch-zap">💬 WhatsApp</div><div class="ep-card-emp">' + esc(e.emp) + '</div>' +
            '<div class="ep-card-sub">' + (wnum ? '<a href="https://wa.me/55' + wnum + '" target="_blank" rel="noopener" class="ep-zap-l">' + esc(e.tel) + '</a>' : '<em class="ep-nada">número não cadastrado</em>') + '</div></div></div>' +
          '<div class="ep-card-body">' + epHtml(textoNotifParcelas(e.emp, e.its)) + '</div><textarea class="ep-card-edit" hidden></textarea>' +
          '<div class="ep-anexos"><label class="ep-anexar"><input type="file" class="ep-arqs" accept=".pdf,image/*" multiple hidden>📎 Anexar guias (PDF)</label><span class="ep-chips"></span>' +
            '<span class="ep-anx-dica">vão anexadas no rascunho do Gmail</span></div>' +
          '<div class="ep-card-acts2">' +
            '<button type="button" class="ep-act ep-a-edit" data-ep-a="edit">✏️ Editar</button>' +
            '<button type="button" class="ep-act ep-a-copy" data-ep-a="copy">📋 Copiar</button>' +
            '<button type="button" class="ep-act ep-a-mail" data-ep-a="mail" title="Salva um rascunho no seu Gmail, já com o e-mail do cliente e as guias anexadas — confira no Gmail e clique em Enviar">✉ Enviar e-mail</button>' +
            '<button type="button" class="ep-act ep-a-wpp2" data-ep-a="zap"' + (wnum ? '' : ' disabled') + '>💬 Enviar WhatsApp</button>' +
            '<button type="button" class="ep-act ep-a-sent" data-ep-a="sent"' + (env ? ' disabled' : '') + '>' + (env ? '✓ Enviado' : '✉ Marcar enviado') + '</button></div></div>'; }).join('') + '</div>';
    out.querySelectorAll('.ep-card').forEach((card) => { const e = lista[+card.dataset.k]; preencherDestino(card.querySelector('.ep-para'), e.cli, e.grupo, 'parcelas'); });
    aviso('✓ ' + plural(lista.length, 'mensagem gerada', 'mensagens geradas') + '.');
    const chips = (card, e) => { card.querySelector('.ep-chips').innerHTML = e.arquivos.map((f, i) => '<span class="ge-chip">📄 ' + esc(f.name) + ' <small>' + Math.max(1, Math.round(f.size / 1024)) + ' KB</small><button type="button" data-ep-tira="' + i + '" aria-label="Tirar">×</button></span>').join(''); };
    // os valores digitados no texto voltam para cada guia (na ordem do texto)
    // Backup 46: salva o rascunho e, assim que o Gmail confirma, a guia fica "emitida" com a data de hoje (e o valor digitado vira o valor lançado)
    const salvarCard = async (card, e) => {
      const b = card.querySelector('[data-ep-a=mail]'), para = card.querySelector('.ep-para').value.trim();
      if (e.arquivos.reduce((s2, f) => s2 + f.size, 0) > LIMITE_ANEXOS) return { ok: false, msg: e.emp + ': os PDFs somam mais de 15 MB — divida em dois e-mails.' };
      const arqs = []; for (const f of e.arquivos) arqs.push(await lerArquivoB64(f));
      b.textContent = '⏳ Salvando rascunho…'; b.disabled = true;
      try {
        const r = await q(sb.rpc('rascunho_email_texto', { p_cliente: e.cli || null, p_para: para, p_assunto: 'Guias de Parcelamento — ' + e.emp, p_texto: epTextoAtual(card), p_arquivos: arqs }));
        const s2 = await salvarRascunhoAgora(r.ref);
        if (!s2.ok) return { ok: false, msg: e.emp + ': ' + s2.msg };
        valores(card, e);
        for (const g of e.its) { await q(sb.rpc('registrar_emissao', { p_tabela: 'parcelas', p_id: g.id, p_emitida: true, p_doc: null, p_enviar: false }));
          if (g._valor > 0) await q(sb.rpc('lancar_valor_parcela', { p_id: g.id, p_valor: g._valor })).catch(() => null);
          g.enviada = true; _epSel.delete(g.id); }
        card.classList.add('ep-feito'); const sb2 = card.querySelector('[data-ep-a=sent]'); if (sb2) { sb2.disabled = true; sb2.textContent = '✓ Enviado'; }
        return { ok: true, msg: '✓ Rascunho criado no Gmail' + (para ? ' para ' + para : ' (sem destinatário cadastrado)') + (arqs.length ? ' com ' + plural(arqs.length, 'anexo', 'anexos') : '') + ' — guia marcada como emitida. Abra o Gmail → Rascunhos, confira e envie.' };
      } catch (err) { return { ok: false, msg: e.emp + ': ' + erroAmigavel(err) }; }
      finally { b.textContent = card.classList.contains('ep-feito') ? '✓ Rascunho salvo' : '✉ Enviar e-mail'; b.disabled = card.classList.contains('ep-feito'); }
    };
    const valores = (card, e) => { const ins = [...card.querySelectorAll('.ep-card-body .ep-val')];
      if (ins.length === e.its.length) ins.forEach((i, n) => { const v = lerValor(i.value); e.its[n]._valor = isNaN(v) ? 0 : v; }); };
    out.onchange = (ev) => { const a = ev.target.closest('.ep-arqs'); if (!a) return; const card = a.closest('.ep-card'), e = lista[+card.dataset.k];
      e.arquivos = e.arquivos.concat([...a.files]); a.value = ''; chips(card, e); };
    out.addEventListener('focusout', (ev) => { const i = ev.target.closest('.ep-val'); if (!i || !i.value.trim()) return; const v = lerValor(i.value); i.value = isNaN(v) ? '' : valorParaCampo(v); });
    out.onclick = (ev) => {
      if (ev.target.closest('#ep-todos-rasc')) return comBotao(ev.target.closest('#ep-todos-rasc'), async () => {
        let ok = 0; const falhas = [];
        for (const card of out.querySelectorAll('.ep-card:not(.ep-feito)')) { const r = await salvarCard(card, lista[+card.dataset.k]); if (r.ok) ok++; else falhas.push(r.msg); }
        if (falhas.length) aviso('⚠ ' + plural(ok, 'rascunho salvo', 'rascunhos salvos') + '; ' + plural(falhas.length, 'falhou', 'falharam') + ': ' + falhas.join(' · '), true);
        else aviso('✓ ' + plural(ok, 'rascunho salvo', 'rascunhos salvos') + ' no Gmail e as guias marcadas como emitidas. Abra o Gmail → Rascunhos.'); });
      if (ev.target.closest('#ep-voltar')) { out.hidden = true; $('ep-sel').hidden = false; el.querySelector('.ep-topo').hidden = false; el.querySelector('.ep-legenda').hidden = false; el.querySelector('.rt-filtros').hidden = false; return pintar(); }
      const card = ev.target.closest('.ep-card'); if (!card) return; const e = lista[+card.dataset.k];
      const tira = ev.target.closest('[data-ep-tira]'); if (tira) { e.arquivos.splice(+tira.dataset.epTira, 1); return chips(card, e); }
      const b = ev.target.closest('[data-ep-a]'); if (!b) return; const a = b.dataset.epA;
      if (a === 'edit') { const v = card.querySelector('.ep-card-body'), t = card.querySelector('.ep-card-edit');
        if (!t.hidden) { v.innerHTML = epHtml(t.value); v.hidden = false; t.hidden = true; b.textContent = '✏️ Editar'; }
        else { t.value = epParaEdicao(card); v.hidden = true; t.hidden = false; t.focus(); b.textContent = '✔ Concluir'; } return; }
      if (a === 'copy') return copiarTexto(epTextoAtual(card)).then(() => { const o = b.textContent; b.textContent = '✓ Copiado!'; setTimeout(() => { b.textContent = o; }, 2000); });
      if (a === 'zap') { window.open('https://wa.me/55' + soDigitos(e.tel) + '?text=' + encodeURIComponent(epTextoAtual(card)), '_blank', 'noopener'); return; }
      if (a === 'sent') { if (!confirm('Confirmar envio para "' + e.emp + '"?')) return;
        return comBotao(b, async () => { valores(card, e);
          for (const g of e.its) { await q(sb.rpc('registrar_emissao', { p_tabela: 'parcelas', p_id: g.id, p_emitida: true, p_doc: null, p_enviar: false }));
            if (g._valor > 0) await q(sb.rpc('lancar_valor_parcela', { p_id: g.id, p_valor: g._valor })).catch(() => null);
            g.enviada = true; _epSel.delete(g.id); }
          b.disabled = true; b.textContent = '✓ Enviado'; card.classList.add('ep-feito'); aviso('✓ Marcado como enviado para "' + e.emp + '".'); }); }
      if (a === 'mail') return comBotao(b, async () => { const r = await salvarCard(card, e); if (!r.ok) throw new Error(r.msg); aviso(r.msg); });
    };
  };
  $('ep-gerar').onclick = gerar;
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
    buscarTodos(() => sb.from('parcelas').select('id, parcelamento_id, numero, vencimento, pago, data_pagamento, emitida_em, emissao, valor').order('vencimento').order('id'))]);
  const porPa = {}; P2.forEach((x) => { (porPa[x.parcelamento_id] = porPa[x.parcelamento_id] || []).push(x); });
  const gnome = (id) => nomeGrupo(id) || 'Sem grupo';
  const grupos = [...new Set(PA.map((p) => gnome(p.grupo_id)))].sort((a, b) => (a === 'Sem grupo') - (b === 'Sem grupo') || a.localeCompare(b, 'pt-BR'));
  E.rt.plGrupo = grupos.includes(E.rt.plGrupo) ? E.rt.plGrupo : grupos[0];
  const emit = (x) => !!x.emitida_em || /sim|emitid/i.test(x.emissao || '');
  // "a emitir agora" = não paga, nós emitimos, sem emissão e vencendo até o fim do mês (vencidas entram de novo: reemissão) — só informação (o envio é na aba "Enviar guias do mês")
  const aEmitir = (p) => p.emitimos_guia === false ? [] : (porPa[p.id] || []).filter((x) => !x.pago && x.vencimento && x.vencimento <= fimMes && (!emit(x) || x.vencimento < h));
  // parcelas que ainda não foram lançadas: completa a lista até a última (mês a mês, a partir da última lançada)
  const prevista = (ps, tot) => { const u = ps[ps.length - 1], n0 = u ? Number(u.numero) : 0; if (!u || !n0 || !u.vencimento || !(tot > n0)) return [];
    const out = []; for (let n = n0 + 1; n <= Math.min(tot, n0 + 240); n++) { const d = new Date(u.vencimento + 'T12:00:00'), dia = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + (n - n0));
      d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); out.push({ n, v: d.toISOString().slice(0, 10) }); } return out; };
  const nGrupo = (g) => PA.filter((p) => gnome(p.grupo_id) === g).reduce((s2, p) => s2 + aEmitir(p).length, 0);
  // Backup 45: mais leve — as pagas antigas e as previstas ficam resumidas numa linha (clique para abrir); só o bloco que mudou é redesenhado
  const abertos = new Set();
  const curta = (d) => { const s = dataBR(d); return s.slice(0, 6) + s.slice(8); };
  const linhaParcela = (x, cli) => { const at = !x.pago && x.vencimento < h, mes = x.vencimento && x.vencimento.slice(0, 7) === h.slice(0, 7), em = emit(x);
    const dEm = x.emitida_em ? curta(x.emitida_em) : em ? 'emitida' : '';
    return '<tr class="' + (x.pago ? 'pl-pago' : at ? 'pl-atr' : mes ? 'pl-mes' : '') + '"><td>' + esc(x.numero || '') + '</td><td>' + dataBR(x.vencimento) + '</td>' +
      '<td>' + (cli ? '<span class="pl-dt pl-dt-cli" title="O cliente emite">cliente</span>'
        : em ? '<button type="button" class="pl-dt pl-dt-ok" data-pl-e="' + x.id + '" title="Emitida' + (x.emitida_em ? ' em ' + dataBR(x.emitida_em) : '') + ' · clique para desmarcar">✓ ' + esc(dEm) + '</button>'
        : x.pago ? '<span class="pl-dt">—</span>'
        : '<button type="button" class="pl-dt pl-dt-mk2" data-pl-e="' + x.id + '" title="Marcar como emitida">○ marcar</button>') + '</td>' +
      '<td>' + (x.pago ? '<span class="pl-dt pl-dt-ok" title="Paga">✓ ' + (x.data_pagamento ? curta(x.data_pagamento) : 'paga') + '</span>'
        : '<button type="button" class="pl-dt ' + (at ? 'pl-dt-atr' : 'pl-dt-ab') + '" data-pl-p="' + x.id + '" title="Clique para lançar o pagamento">' + (at ? 'em atraso' : 'a vencer') + '</button>') + '</td></tr>'; };
  const bloco = (p) => {
    const ps = (porPa[p.id] || []).slice().sort((x, y) => String(x.vencimento).localeCompare(String(y.vencimento))), pagas = ps.filter((x) => x.pago).length, tot = Number(p.total_parcelas) || ps.length, v = Number(p.valor_ultima_parcela) || 0;
    const resid = v * Math.max(0, tot - pagas), cli = p.emitimos_guia === false, atr = ps.filter((x) => !x.pago && x.vencimento < h).length, nAe = aEmitir(p).length;
    const pct = tot ? Math.round(100 * pagas / tot) : 0, ab = abertos.has(p.id);
    // Backup 46: todas as parcelas lançadas aparecem; só as PREVISTAS (ainda não lançadas) ficam resumidas numa linha
    const corte = 0, escondidas = 0, prev = prevista(ps, tot), prevVis = ab ? prev : prev.slice(0, 3);
    return '<section class="pl-bloco" data-pl-pa="' + p.id + '">' +
      '<div class="pl-cab"><div class="pl-cab-nome">' + esc(p.empresa || '—') + '</div>' +
        '<div class="pl-cab-doc">' + esc(mascaraDoc(p.cnpj) || 'sem CPF/CNPJ') + '</div>' +
        '<div class="pl-cab-tags">' + [p.local, p.natureza].filter(Boolean).map((z) => '<span class="pl-tag">' + esc(z) + '</span>').join('') + (p.numero ? '<span class="pl-tag pl-tag-n">nº ' + esc(p.numero) + '</span>' : '') + '</div>' +
        '<div class="pl-prog"><div class="pl-prog-bar"><span style="width:' + pct + '%"></span></div><span><b>' + pagas + '</b> de ' + (tot || '—') + ' pagas' + (atr ? ' · <b class="pl-atr-t">' + atr + ' em atraso</b>' : '') + '</span></div>' +
        '<div class="pl-kpis"><div><small>Última parcela</small><span class="rt-vbox"><span>R$</span><input data-pl-v="' + p.id + '" data-mascara="nenhuma" inputmode="decimal" value="' + (v ? valorParaCampo(v) : '') + '" aria-label="Valor da última parcela"></span></div>' +
          '<div><small>Valor residual</small><b>' + brl(resid) + '</b></div></div>' +
        '<div class="pl-cab-pe"><label class="rt-chave rt-chave-mini"><input type="checkbox" data-pl-emit="' + p.id + '"' + (cli ? '' : ' checked') + '><span></span><small>' + (cli ? 'O cliente emite as guias' : 'Nós emitimos as guias') + '</small></label>' +
          (nAe ? '<span class="pill hoje" title="Envie na aba “Enviar guias do mês”">' + plural(nAe, 'a emitir', 'a emitir') + '</span>' : '') + '</div>' +
        '<input class="pl-obs" data-pl-obs="' + p.id + '" value="' + esc(p.obs || '') + '" placeholder="Observação" aria-label="Observação"></div>' +
      (ps.length ? '<table class="pl-tab"><colgroup><col style="width:12%"><col style="width:28%"><col style="width:30%"><col style="width:30%"></colgroup><thead><tr><th title="Parcela">Nº</th><th>Vencimento</th><th>Emissão</th><th>Pagamento</th></tr></thead><tbody>' +
        (escondidas ? '<tr class="pl-resumo"><td colspan="4"><button type="button" class="pl-mais" data-pl-abre="' + p.id + '">✓ ' + plural(escondidas, 'parcela paga', 'parcelas pagas') + ' (' + esc(ps[0].numero || '') + ' a ' + esc(ps[escondidas - 1].numero || '') + ') · ver</button></td></tr>' : '') +
        ps.slice(escondidas).map((x) => linhaParcela(x, cli)).join('') +
        prevVis.map((r) => '<tr class="pl-prev" title="Parcela ainda não lançada no sistema (data prevista)"><td>' + r.n + '</td><td>' + dataBR(r.v) + '</td><td>—</td><td>prevista</td></tr>').join('') +
        (prev.length > prevVis.length ? '<tr class="pl-resumo"><td colspan="4"><button type="button" class="pl-mais" data-pl-abre="' + p.id + '">+ ' + plural(prev.length - prevVis.length, 'parcela prevista', 'parcelas previstas') + ' até ' + dataBR(prev[prev.length - 1].v) + ' · ver</button></td></tr>' : '') +
        (ab && (corte || prev.length > 3) ? '<tr class="pl-resumo"><td colspan="4"><button type="button" class="pl-mais" data-pl-fecha="' + p.id + '">▴ resumir</button></td></tr>' : '') +
        '</tbody></table>' : '<div class="pl-sem">Nenhuma parcela lançada neste parcelamento.</div>') + '</section>'; };
  const redesenharBloco = (id) => { const sec = el.querySelector('[data-pl-pa="' + id + '"]'), p = PA.find((y) => y.id === id); if (sec && p) sec.outerHTML = bloco(p);
    const r = $('pl-rolo'), bx = $('pl-barra-x'); if (r && bx) { bx.firstElementChild.style.width = r.scrollWidth + 'px'; bx.hidden = r.scrollWidth <= r.clientWidth + 2; }
    const ab = el.querySelector('.pl-aba.ativo'), n = nGrupo(E.rt.plGrupo); if (ab) ab.innerHTML = esc(E.rt.plGrupo) + (n ? ' <span class="pl-n" title="Guias a emitir">' + n + '</span>' : ''); };
  // Backup 46: cada empresa numa linha, com os parcelamentos dela lado a lado; a tela rola para o lado (barra fixa no rodapé)
  const ligarRolo = () => {
    const rolo = $('pl-rolo'), bx = $('pl-barra-x'); if (!rolo || !bx) return;
    const ajustar = () => { bx.firstElementChild.style.width = rolo.scrollWidth + 'px'; bx.hidden = rolo.scrollWidth <= rolo.clientWidth + 2; };
    ajustar(); let lock = false;
    rolo.onscroll = () => { if (lock) return; lock = true; bx.scrollLeft = rolo.scrollLeft; lock = false; };
    bx.onscroll = () => { if (lock) return; lock = true; rolo.scrollLeft = bx.scrollLeft; lock = false; };
    if (!window._plResize) { window._plResize = true; window.addEventListener('resize', () => { const r = $('pl-rolo'); if (r) { const b = $('pl-barra-x'); if (b) { b.firstElementChild.style.width = r.scrollWidth + 'px'; b.hidden = r.scrollWidth <= r.clientWidth + 2; } } }); }
  };
  const pintar = () => {
    const L = PA.filter((p) => gnome(p.grupo_id) === E.rt.plGrupo).sort((a, b) => String(a.empresa).localeCompare(String(b.empresa), 'pt-BR') || String(a.natureza).localeCompare(String(b.natureza), 'pt-BR'));
    const porEmp = []; L.forEach((p) => { const u = porEmp[porEmp.length - 1]; if (u && u.nome === (p.empresa || '—')) u.ps.push(p); else porEmp.push({ nome: p.empresa || '—', ps: [p] }); });
    const nE = L.reduce((s2, p) => s2 + aEmitir(p).length, 0);
    el.innerHTML = '<div class="card pl-card"><div class="card-hd">📋 Planilha de parcelamentos<span class="sub">para conferência · uma aba por grupo, um bloco por parcelamento · clique em EMISSÃO ou PAGAMENTO para marcar · o envio das guias é na aba “Enviar guias do mês”</span></div>' +
      '<div class="card-bd"><div class="pl-abas" role="tablist">' + grupos.map((g) => { const n = nGrupo(g);
        return '<button type="button" role="tab" class="pl-aba' + (g === E.rt.plGrupo ? ' ativo' : '') + '" data-pl-g="' + esc(g) + '">' + esc(g) + (n ? ' <span class="pl-n" title="Guias a emitir">' + n + '</span>' : '') + '</button>'; }).join('') + '</div>' +
      '<div class="pl-barra"><span class="sub">' + plural(L.length, 'parcelamento', 'parcelamentos') + ' em <b>' + esc(E.rt.plGrupo || '—') + '</b> · ' + (nE ? plural(nE, 'guia a emitir', 'guias a emitir') + ' (em atraso + vencem neste mês)' : 'nenhuma guia a emitir agora') + '</span></div>' +
      (L.length ? '<div class="pl-rolo" id="pl-rolo"><div class="pl-linhas">' + porEmp.map((e) => '<div class="pl-linha">' + e.ps.map(bloco).join('') + '</div>').join('') + '</div></div>' +
        '<div class="pl-barra-x" id="pl-barra-x" aria-label="Rolar para o lado"><div></div></div>' : vazio('Nenhum parcelamento neste grupo.')) + '</div></div>';
    ligarRolo();
  };
  const recarregar = () => rotinaPlanilha(el);
  el.onclick = (ev) => {
    const ab = ev.target.closest('[data-pl-g]'); if (ab) { E.rt.plGrupo = ab.dataset.plG; return pintar(); }
    const ma = ev.target.closest('[data-pl-abre]'); if (ma) { abertos.add(ma.dataset.plAbre); return redesenharBloco(ma.dataset.plAbre); }
    const mf = ev.target.closest('[data-pl-fecha]'); if (mf) { abertos.delete(mf.dataset.plFecha); return redesenharBloco(mf.dataset.plFecha); }
    const be = ev.target.closest('[data-pl-e]');
    if (be) return comBotao(be, async () => { const x = P2.find((y) => y.id === be.dataset.plE), novo = !emit(x);
      await q(sb.rpc('registrar_emissao', { p_tabela: 'parcelas', p_id: x.id, p_emitida: novo, p_doc: null, p_enviar: false }));
      x.emitida_em = novo ? h : null; x.emissao = novo ? 'SIM' : ''; redesenharBloco(x.parcelamento_id); });
    // Backup 46: pagamento marca na hora, como a emissão (só o bloco é redesenhado; o resto do sistema atualiza depois)
    const bp = ev.target.closest('[data-pl-p]');
    if (bp && !confirm('Lançar o pagamento desta parcela?')) return;
    if (bp && window.ERP_EDITOR && window.ERP_EDITOR.baixaRapida) return comBotao(bp, async () => {
      const d = await window.ERP_EDITOR.baixaRapida('parcelas', bp.dataset.plP, { semRecarregar: true }); if (!d || !d.id) return;
      const x = P2.find((y) => y.id === bp.dataset.plP); x.pago = true; x.data_pagamento = d.data_pagamento || h; redesenharBloco(x.parcelamento_id); });
  };
  el.onchange = (ev) => {
    const c = ev.target.closest('[data-pl-emit]');
    if (c) q(sb.rpc('parcelamentos_emitimos', { p_ids: [c.dataset.plEmit], p_emitimos: c.checked })).then(() => { PA.find((p) => p.id === c.dataset.plEmit).emitimos_guia = c.checked; redesenharBloco(c.dataset.plEmit); }, (e) => aviso(erroAmigavel(e), true));
  };
  el.addEventListener('focusout', (ev) => {
    const iv = ev.target.closest('[data-pl-v]'), io = ev.target.closest('[data-pl-obs]');
    if (iv) { const v = iv.value.trim() ? lerValor(iv.value) : null; const p = PA.find((y) => y.id === iv.dataset.plV);
      if (v != null && isNaN(v)) return aviso('Valor inválido.', true);
      if ((v || null) === (Number(p.valor_ultima_parcela) || null)) return;
      q(sb.from('parcelamentos').update({ valor_ultima_parcela: v }).eq('id', p.id)).then(() => { p.valor_ultima_parcela = v; aviso('✓ Valor da última parcela gravado.'); redesenharBloco(p.id); }, (e) => aviso(erroAmigavel(e), true)); }
    if (io) { const p = PA.find((y) => y.id === io.dataset.plObs); if ((p.obs || '') === io.value) return;
      q(sb.from('parcelamentos').update({ obs: io.value }).eq('id', p.id)).then(() => { p.obs = io.value; aviso('✓ Observação gravada.'); }, (e) => aviso(erroAmigavel(e), true)); }
  });
  pintar();
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
