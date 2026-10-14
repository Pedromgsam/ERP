'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// BUSCA GERAL — Backup 76 (F1): Ctrl+K (⌘K no Mac) ou o botão "Buscar" no topo.
// Digite parte do nome, CPF/CNPJ, nº do processo ou do parcelamento: aparecem clientes, grupos, processos, parcelamentos,
// acordos e tarefas; Enter (ou clique) abre direto a ficha, a janela do processo/parcelamento/acordo ou a tarefa.
// ═══════════════════════════════════════════════════════════════════════════

async function indiceBusca() {
  await carregarCadastros().catch(() => {});
  const D = dbParc() || {}, I = [];
  const so = (s) => String(s || '').replace(/\D/g, '');
  (E.clientes || []).forEach((c) => I.push({ tipo: 'Cliente', tit: c.nome, sub: [nomeGrupo(c.grupo_id), c.cpf_cnpj ? mascaraDoc(c.cpf_cnpj) : ''].filter(Boolean).join(' · '),
    txt: [c.nome, c.cpf_cnpj, so(c.cpf_cnpj), nomeGrupo(c.grupo_id), c.socio_admin].join(' '), ir: () => abrirFicha(c.id) }));
  if (!ehClienteGS()) (E.grupos || []).forEach((g) => I.push({ tipo: 'Grupo', tit: g.nome, sub: 'abre o Painel executivo deste grupo', txt: g.nome,
    ir: () => { if (TELAS.painelExec) { const P = estadoPE(); P.grupo = g.nome; P.empresa = ''; } irParaTela('resumo'); } }));
  (D.processos || []).forEach((p) => I.push({ tipo: 'Processo', tit: p.numero || '(sem número)', sub: [p.grupo, p.natureza, [p.autor, p.reu].filter(Boolean).join(' × ')].filter(Boolean).join(' · '),
    txt: [p.numero, so(p.numero), p.autor, p.reu, p.grupo, p.natureza].join(' '), ir: () => (window.ERP_ABRIR_PROCESSO ? window.ERP_ABRIR_PROCESSO(p) : irParaTela('processos')) }));
  (D.parcelamentos || []).forEach((p) => I.push({ tipo: 'Parcelamento', tit: (p.empresa || '—') + ' — ' + (p.natureza || 'parcelamento'), sub: [p.local, p.numero ? 'nº ' + p.numero : '', p.grupoNome].filter(Boolean).join(' · '),
    txt: [p.empresa, p.natureza, p.local, p.numero, so(p.numero), p.grupoNome, p.cnpj, so(p.cnpj)].join(' '),
    ir: async () => { const PA = await dadosParcelamentos(); E.pc = E.pc || { grupo: '', chip: 'todos' }; E.pc.PA = PA; const pa = PA.find((x) => x.id === p._id); if (pa) janelaParcelamento(pa); else irParaTela('parcelamentos'); } }));
  const vistos = {};
  (D.acordos || []).forEach((a) => { const k = chaveAcordo({ processo: a.processo, devedor: a.devedor, credor: a.credor }); if (vistos[k]) return; vistos[k] = 1;
    I.push({ tipo: 'Acordo', tit: (a.devedor || '—') + ' → ' + (a.credor || '—'), sub: [a.grupo, a.processo ? 'processo ' + a.processo : ''].filter(Boolean).join(' · '),
      txt: [a.devedor, a.credor, a.processo, so(a.processo), a.grupo].join(' '),
      ir: async () => { const T = await dadosAcordos(); E.ac = E.ac || { grupo: '', chip: 'todos' }; E.ac.T = T; E.ac.A = acordosDe(T); const ac = E.ac.A.find((x) => x.k === k); if (ac) janelaAcordo(ac); else irParaTela('acordos'); } }); });
  if (!ehClienteGS()) (D.tarefas || []).filter((t) => !/conclu|cancel|exclu/i.test(t.status || '')).forEach((t) => I.push({ tipo: 'Tarefa', tit: t.titulo, sub: [t.responsavel, t.prazo ? 'prazo ' + dataBR(t.prazo) : '', t.grupo].filter(Boolean).join(' · '),
    txt: [t.titulo, t.responsavel, t.grupo].join(' '), ir: () => abrirTarefa(t.id) }));
  // Backup 80 (M15): ações — "Nova tarefa", "Emitir as guias do mês", "+ Lançar …" e "Ir para <tela>"
  if (!ehClienteGS()) {
    const ac = [{ rot: 'Emitir as guias do mês', fn: () => { E.rt = Object.assign(E.rt || {}, { aba: 'guias' }); irParaTela('rotina'); } },
      { rot: 'Nova tarefa', fn: async () => { await carregarCadastros(); formTarefa({}, () => {}); } }];
    (typeof window.ERP_ACOES_BUSCA === 'function' ? window.ERP_ACOES_BUSCA() : []).forEach((x) => ac.push({ rot: x.tela ? x.rot : 'Lançar ' + x.rot.charAt(0).toLowerCase() + x.rot.slice(1), fn: x.fn, tela: x.tela }));
    ac.forEach((x) => I.push({ tipo: x.tela ? 'Tela' : 'Ação', tit: x.rot, sub: '', txt: x.rot + (x.tela ? '' : ' novo nova criar lançar'), ir: x.fn, acao: 1 }));
  }
  I.forEach((x) => { x.n = normalizar(x.txt); x.nt = normalizar(x.tit); });
  return I;
}
const ehClienteGS = () => !!(window.AC_SESSION && window.AC_SESSION.nivel === 'cliente');

async function abrirBuscaGeral() {
  if (document.getElementById('bg-in')) { document.getElementById('bg-in').focus(); return; }
  const j = abrirJanela({ titulo: 'Buscar', kick: 'Busca geral', sub: 'Nome, CPF/CNPJ, nº do processo ou do parcelamento — ou uma ação ("nova tarefa", "guias") · Enter abre', larga: true,
    corpo: '<label class="b-busca b-bg-campo">' + iconeB('busca') + '<input id="bg-in" placeholder="Digite para buscar…" autocomplete="off" aria-label="Buscar"></label><div id="bg-res" class="bg-res" role="listbox"></div>' });
  const inp = j.querySelector('#bg-in'), res = j.querySelector('#bg-res');
  res.innerHTML = '<p class="b-barras-vazio">Carregando…</p>';
  const I = await indiceBusca();
  let lista = [], sel = 0;
  const pintar = () => {
    const q0 = normalizar(inp.value.trim()), qd = inp.value.replace(/\D/g, '');
    if (q0.length < 2 && qd.length < 3) { lista = []; res.innerHTML = '<p class="b-barras-vazio">Digite ao menos 2 letras (ou 3 números de um CPF/CNPJ/processo).</p>'; return; }
    const termos = q0.split(/\s+/).filter(Boolean);
    lista = I.filter((x) => termos.every((t) => x.n.includes(t)) || (qd.length >= 3 && x.n.includes(qd)))
      .map((x) => ({ x, p: (x.nt.startsWith(q0) ? 0 : x.nt.includes(q0) ? 1 : 2) + (x.acao && !x.nt.includes(q0) ? 1 : 0) }))
      .sort((a, b) => a.p - b.p || a.x.tit.localeCompare(b.x.tit, 'pt-BR')).slice(0, 40).map((y) => y.x);
    sel = Math.min(sel, Math.max(0, lista.length - 1));
    res.innerHTML = lista.length ? lista.map((x, i) => '<button type="button" class="bg-it' + (i === sel ? ' bg-sel' : '') + '" data-bg="' + i + '" role="option" aria-selected="' + (i === sel) + '"><span class="bg-tipo">' + esc(x.tipo) + '</span>' +
      '<span class="bg-tx"><b>' + esc(x.tit) + '</b>' + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + '</span></button>').join('')
      : '<p class="b-barras-vazio">Nada encontrado com "' + esc(inp.value.trim()) + '".</p>';
  };
  const abrir = (i) => { const x = lista[i]; if (!x) return; fecharJanela(j); Promise.resolve(x.ir()).catch((e) => aviso(erroAmigavel(e), true)); };
  let t; inp.oninput = () => { clearTimeout(t); sel = 0; t = setTimeout(pintar, 120); };
  inp.onkeydown = (ev) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); sel = Math.min(sel + 1, lista.length - 1); pintar(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); sel = Math.max(sel - 1, 0); pintar(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); abrir(sel); }
  };
  res.onclick = (ev) => { const b = ev.target.closest('[data-bg]'); if (b) abrir(+b.dataset.bg); };
  pintar(); inp.focus();
  return j;
}
document.addEventListener('keydown', (ev) => {
  if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey && (ev.key === 'k' || ev.key === 'K')) { ev.preventDefault(); abrirBuscaGeral(); }
});
