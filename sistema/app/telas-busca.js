'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// BUSCA GERAL — Backup 76 (F1): Ctrl+K (⌘K no Mac) ou o botão "Buscar" no topo.
// Digite parte do nome, CPF/CNPJ, nº do processo ou do parcelamento: aparecem clientes, grupos, processos, parcelamentos,
// (Backup 86: sem grupos, acordos e tarefas); Enter (ou clique) abre direto a ficha, a janela do processo/parcelamento/acordo ou a tarefa.
// ═══════════════════════════════════════════════════════════════════════════

async function indiceBusca() {
  await carregarCadastros().catch(() => {});
  const D = dbParc() || {}, I = [];
  const so = (s) => String(s || '').replace(/\D/g, '');
  (E.clientes || []).forEach((c) => I.push({ tipo: 'Cliente', tit: c.nome, sub: [nomeGrupo(c.grupo_id), c.cpf_cnpj ? mascaraDoc(c.cpf_cnpj) : ''].filter(Boolean).join(' · '),
    txt: [c.nome, c.cpf_cnpj, so(c.cpf_cnpj), nomeGrupo(c.grupo_id), c.socio_admin].join(' '), ir: () => abrirFicha(c.id) }));
  (D.processos || []).forEach((p) => I.push({ tipo: 'Processo', tit: p.numero || '(sem número)', sub: [p.grupo, p.natureza, [p.autor, p.reu].filter(Boolean).join(' × ')].filter(Boolean).join(' · '),
    txt: [p.numero, so(p.numero), p.autor, p.reu, p.grupo, p.natureza].join(' '), ir: () => (window.ERP_ABRIR_PROCESSO ? window.ERP_ABRIR_PROCESSO(p) : irParaTela('processos')) }));
  (D.parcelamentos || []).forEach((p) => I.push({ tipo: 'Parcelamento', tit: (p.empresa || '—') + ' — ' + (p.natureza || 'parcelamento'), sub: [p.local, p.numero ? 'nº ' + p.numero : '', p.grupoNome].filter(Boolean).join(' · '),
    txt: [p.empresa, p.natureza, p.local, p.numero, so(p.numero), p.grupoNome, p.cnpj, so(p.cnpj)].join(' '),
    ir: async () => { const PA = await dadosParcelamentos(); E.pc = E.pc || { grupo: '', chip: 'todos' }; E.pc.PA = PA; const pa = PA.find((x) => x.id === p._id); if (pa) janelaParcelamento(pa); else irParaTela('parcelamentos'); } }));
  // Backup 86 (M02): como no ambiente — clientes, processos e parcelamentos (grupos, acordos e tarefas saíram)
  // Backup 80 (M15): ações — "Nova tarefa", "Emitir as guias do mês", "+ Lançar …" e "Ir para <tela>"
  if (!ehClienteGS()) {
    const ac = [{ rot: 'Emitir as guias do mês', fn: () => { E.rt = Object.assign(E.rt || {}, { aba: 'guias' }); irParaTela('rotina'); } },
      { rot: 'Nova tarefa', fn: async () => { await carregarCadastros(); formTarefa({}, () => {}); } },
      { rot: 'Ver como o cliente vê (portal)', fn: () => verComoCliente('') }];   // Backup 81 (M10)
    (typeof window.ERP_ACOES_BUSCA === 'function' ? window.ERP_ACOES_BUSCA() : []).forEach((x) => ac.push({ rot: x.tela ? x.rot : 'Lançar ' + x.rot.charAt(0).toLowerCase() + x.rot.slice(1), fn: x.fn, tela: x.tela }));
    ac.forEach((x) => I.push({ tipo: x.tela ? 'Tela' : 'Ação', tit: x.rot, sub: '', txt: x.rot + (x.tela ? '' : ' novo nova criar lançar'), ir: x.fn, acao: 1 }));
  }
  I.forEach((x) => { x.n = normalizar(x.txt); x.nt = normalizar(x.tit); });
  return I;
}
const ehClienteGS = () => !!(window.AC_SESSION && window.AC_SESSION.nivel === 'cliente');

// Backup 85 (BG1): caixa de comandos do ambiente — abre já com as telas e as ações; os resultados vêm agrupados
// (Telas, Ações, Clientes, Grupos, Processos, Parcelamentos, Acordos, Tarefas). ↑ ↓ escolhe, Enter abre, Esc fecha.
const GRUPOS_BUSCA = [['Tela', 'Telas', 'camadas'], ['Ação', 'Ações', 'mais'], ['Cliente', 'Clientes', 'clientes'], ['Processo', 'Processos', 'documento'],
  ['Parcelamento', 'Parcelamentos', 'camadas']];
async function abrirBuscaGeral() {
  if (document.getElementById('bg-in')) { document.getElementById('bg-in').focus(); return; }
  const fundo = document.createElement('div');
  fundo.className = 'fundo b-paleta';
  fundo.innerHTML = '<div class="b-paleta-box" role="dialog" aria-modal="true" aria-label="Buscar"><div class="b-paleta-in">' + iconeB('busca') +
    '<input id="bg-in" placeholder="Cliente, CNPJ, processo, parcelamento, tela ou ação…" autocomplete="off" aria-label="Buscar"></div>' +
    '<div id="bg-res" class="b-paleta-res" role="listbox"><p class="b-barras-vazio">Carregando…</p></div><div class="b-paleta-pe"><span>↑ ↓ escolhe</span><span>Enter abre</span><span>Esc fecha</span></div></div>';
  $('janelas').appendChild(fundo);
  fundo.addEventListener('mousedown', (ev) => { if (ev.target === fundo) fecharJanela(fundo); });
  const inp = fundo.querySelector('#bg-in'), res = fundo.querySelector('#bg-res');
  inp.focus();
  const I = await indiceBusca();
  const ordem = (x) => { const i = GRUPOS_BUSCA.findIndex((g) => g[0] === x.tipo); return i < 0 ? 99 : i; };
  let lista = [], sel = 0;
  const pintar = () => {
    const q0 = normalizar(inp.value.trim()), qd = inp.value.replace(/\D/g, '');
    if (!q0 && !qd) lista = I.filter((x) => x.tipo === 'Tela' || x.tipo === 'Ação').sort((a, b) => ordem(a) - ordem(b));
    else {
      const termos = q0.split(/\s+/).filter(Boolean);
      lista = I.filter((x) => termos.every((t) => x.n.includes(t)) || (qd.length >= 3 && x.n.includes(qd)))
        .map((x) => ({ x, p: x.nt.startsWith(q0) ? 0 : x.nt.includes(q0) ? 1 : 2 }))
        .sort((a, b) => ordem(a.x) - ordem(b.x) || a.p - b.p || a.x.tit.localeCompare(b.x.tit, 'pt-BR')).slice(0, 60).map((y) => y.x);
    }
    sel = Math.min(sel, Math.max(0, lista.length - 1));
    let grp = '';
    res.innerHTML = lista.length ? lista.map((x, i) => { const g = GRUPOS_BUSCA.find((y) => y[0] === x.tipo) || [x.tipo, x.tipo, 'busca'];
      const cab = g[1] !== grp ? '<div class="b-paleta-grp">' + esc(g[1]) + '</div>' : ''; grp = g[1];
      return cab + '<button type="button" class="bg-it' + (i === sel ? ' bg-sel' : '') + '" data-bg="' + i + '" role="option" aria-selected="' + (i === sel) + '">' + iconeB(g[2]) +
        '<span class="bg-tx">' + esc(x.tit) + '</span>' + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + '</button>'; }).join('')
      : '<div class="b-vazio"><b>Nada encontrado</b><p>Tente o nome, o CNPJ (só números servem) ou o número do processo.</p></div>';
    const s = res.querySelector('.bg-sel'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' });
  };
  const abrir = (i) => { const x = lista[i]; if (!x) return; fecharJanela(fundo); Promise.resolve(x.ir()).catch((e) => aviso(erroAmigavel(e), true)); };
  let t; inp.oninput = () => { clearTimeout(t); sel = 0; t = setTimeout(pintar, 90); };
  inp.onkeydown = (ev) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); sel = Math.min(sel + 1, lista.length - 1); pintar(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); sel = Math.max(sel - 1, 0); pintar(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); abrir(sel); }
  };
  res.onclick = (ev) => { const b = ev.target.closest('[data-bg]'); if (b) abrir(+b.dataset.bg); };
  pintar(); inp.focus();
  return fundo;
}
document.addEventListener('keydown', (ev) => {
  if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey && (ev.key === 'k' || ev.key === 'K')) { ev.preventDefault(); abrirBuscaGeral(); }
});
