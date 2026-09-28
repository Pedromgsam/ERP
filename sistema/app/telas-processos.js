'use strict';
// ═══════════════════════════════════════════════════════════════════
// Processos (tela nova — migração do ERP antigo, Backup 14).
// Mesmas informações da tela antiga: análise da carteira (processos, valor em
// disputa, passivo/ativo em disputas, por grupo/tribunal/natureza), filtros de
// situação (vários ao mesmo tempo, começa em "Ativos"), competência, natureza,
// grupo e busca; ações na própria linha. A tela antiga continua no sistema:
// ⋯ → "Processos: tela antiga" volta para ela neste computador.
// ═══════════════════════════════════════════════════════════════════
const SIT_PROC = [['ativo', 'Ativos', 'pago'], ['arquivado', 'Arq. provisoriamente', 'neutro'], ['extinto', 'Extintos / prescritos', 'vencido']];
function situacaoProcesso(p) {
  const st = String(p.status || '');
  return /arq/i.test(st) ? 'arquivado' : /extint|prescri|baixad|encerrad|transitad/i.test(st) || /prescrit/i.test(p.prescricao || '') ? 'extinto' : 'ativo';
}

TELAS.processos = async function () {
  E.proc = E.proc || { sit: ['ativo'], grupo: '', comp: '', nat: '', busca: '' };
  await carregarCadastros();
  const lista = await buscarTodos(() => sb.from('processos').select('*').order('criado_em'));
  E._procs = lista;
  const F = E.proc, uniq = (k) => [...new Set(lista.map((p) => p[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const podeEditar = pode('juridico', 'propor');
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>⚖ Processos</h1><p id="pr-conta"></p></div><div class="acoes">' +
      (podeEditar ? '<button class="btn btn-p" id="pr-novo">+ Processo</button>' : '') + '</div></div>' +
    '<div id="pr-analise"></div>' +
    '<div class="filtros" id="pr-barra">' +
      '<div class="segmento pr-sit" id="pr-sit" title="Pode marcar mais de uma">' + SIT_PROC.map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
      '<select class="busca sel" id="pr-grupo" autocomplete="off"><option value="">Todos os grupos</option>' + E.grupos.map((g) => '<option value="' + g.id + '">' + esc(g.nome) + '</option>').join('') + '</select>' +
      '<select class="busca sel" id="pr-comp" autocomplete="off"><option value="">Todas as competências</option>' + uniq('competencia').map((v) => '<option>' + esc(v) + '</option>').join('') + '</select>' +
      '<select class="busca sel" id="pr-nat" autocomplete="off"><option value="">Todas as naturezas</option>' + uniq('natureza').map((v) => '<option>' + esc(v) + '</option>').join('') + '</select>' +
      '<input class="busca" id="pr-busca" placeholder="Buscar nº do processo, autor ou réu…" autocomplete="off" style="min-width:240px;flex:1 1 240px">' +
      '<button class="btn btn-o" type="button" id="pr-limpar">Limpar</button></div>' +
    '<div id="pr-lista"></div>';
  const nb = $('pr-novo'); if (nb) nb.onclick = () => window.ERP_EDITOR && window.ERP_EDITOR.abrirFormulario('processos', null, { carteira: 'Ativo', status: 'Em andamento' });
  $('pr-sit').onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return; const i = F.sit.indexOf(b.dataset.v); if (i >= 0) F.sit.splice(i, 1); else F.sit.push(b.dataset.v); pintarProcessos(); };
  [['pr-grupo', 'grupo'], ['pr-comp', 'comp'], ['pr-nat', 'nat']].forEach(([id, k]) => { $(id).onchange = (ev) => { F[k] = ev.target.value; pintarProcessos(); }; });
  let t; $('pr-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarProcessos(); }, 250); };
  $('pr-limpar').onclick = () => { E.proc = { sit: ['ativo'], grupo: '', comp: '', nat: '', busca: '' }; TELAS.processos(); };
  pintarProcessos();
};

function filtrarProcessos(semSituacao) {
  const F = E.proc, b = normalizar(F.busca);
  return (E._procs || []).filter((p) => {
    if (!semSituacao && F.sit.length && !F.sit.includes(situacaoProcesso(p))) return false;
    if (F.grupo && p.grupo_id !== F.grupo) return false;
    if (F.comp && p.competencia !== F.comp) return false;
    if (F.nat && p.natureza !== F.nat) return false;
    if (b && !normalizar([p.numero, p.autor, p.reu, p.obs].join(' ')).includes(b) && !(soDigitos(F.busca) && soDigitos(p.numero).includes(soDigitos(F.busca)))) return false;
    return true;
  });
}

function pintarProcessos() {
  const F = E.proc;
  document.querySelectorAll('#pr-sit button').forEach((x) => x.classList.toggle('ativo', F.sit.includes(x.dataset.v)));
  [['pr-grupo', 'grupo'], ['pr-comp', 'comp'], ['pr-nat', 'nat'], ['pr-busca', 'busca']].forEach(([id, k]) => { if ($(id) && document.activeElement !== $(id)) $(id).value = F[k]; });
  const todos = filtrarProcessos(true), lista = filtrarProcessos(false);
  $('pr-conta').textContent = lista.length + ' processo(s) na lista · ' + (E._procs || []).length + ' cadastrado(s)';
  // análise: vale para os filtros de grupo/competência/natureza/busca (todas as situações)
  const val = (p) => Number(p.valor) || 0, comValor = todos.filter((p) => val(p) > 0), ativos = todos.filter((p) => situacaoProcesso(p) === 'ativo');
  const nomes = E.clientes.filter((c) => !F.grupo || c.grupo_id === F.grupo).map((c) => normalizar(c.nome)).filter((n) => n.length > 2);
  const tem = (x) => { x = normalizar(x); return nomes.some((n) => x.includes(n)); };
  const vP = soma(todos.filter((p) => tem(p.reu)), val), vA = soma(todos.filter((p) => tem(p.autor)), val);
  const agrupa = (rot, chave) => { const m = {};
    todos.forEach((p) => { const k = chave(p) || '—'; m[k] = m[k] || { n: 0, v: 0 }; m[k].n++; m[k].v += val(p); });
    return '<div><div class="secao">' + rot + '</div><div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>' + rot + '</th><th class="num">Processos</th><th class="num">Valor</th></tr></thead><tbody>' +
      Object.keys(m).sort((a, b) => m[b].v - m[a].v || m[b].n - m[a].n).slice(0, 10).map((k) => '<tr><td><b>' + esc(k) + '</b></td><td class="num">' + m[k].n + '</td><td class="num mono" data-ord="' + m[k].v + '">' + (m[k].v ? brl(m[k].v) : '—') + '</td></tr>').join('') +
      '</tbody></table></div></div>'; };
  $('pr-analise').innerHTML = todos.length ? blocoRecolhivel('pr-an', 'Análise da carteira judicial',
    '<div class="kpis">' + kpi('Processos', String(todos.length), '', '(' + ativos.length + ' em andamento · ' + (todos.length - ativos.length) + ' arquivados/extintos)') +
      kpi('Valor em disputa', brl(soma(comValor, val)), '', '(' + (todos.length - comValor.length) + ' sem valor)') +
      kpi('Passivo em disputas', brl(vP), '', 'cliente como réu') + kpi('Ativo em disputas', brl(vA), '', 'cliente como autor') + '</div>' +
    '<div class="tres-col">' + agrupa('Grupo', (p) => nomeGrupo(p.grupo_id)) + agrupa('Tribunal', (p) => p.competencia) + agrupa('Natureza', (p) => p.natureza) + '</div>') : '';
  const podeEditar = pode('juridico', 'propor');
  $('pr-lista').innerHTML = '<div class="card">' + (lista.length ? '<div class="tabela-wrap"><table class="ordenavel pr-tab"><thead><tr><th>Grupo</th><th>Nº do processo</th><th>Competência</th><th>Natureza</th><th>Autor</th><th>Réu</th><th class="num">Valor</th><th>Situação</th><th class="sem-ordem"></th></tr></thead><tbody>' +
    lista.map((p) => { const s = SIT_PROC.find((x) => x[0] === situacaoProcesso(p));
      return '<tr><td><span class="pill pill-grupo" title="' + esc(nomeGrupo(p.grupo_id)) + '">' + esc(nomeGrupo(p.grupo_id) || '—') + '</span></td><td class="mono">' + esc(p.numero) + '</td>' +
        '<td>' + esc(p.competencia || '—') + '</td><td>' + esc(p.natureza || '—') + '</td><td>' + esc(p.autor || '—') + '</td><td>' + esc(p.reu || '—') + '</td>' +
        '<td class="num mono" data-ord="' + val(p) + '">' + (val(p) ? brl(val(p)) : '<span class="sub">—</span>') + '</td>' +
        '<td><span class="pill ' + s[2] + '" title="' + esc(p.status || '') + '">' + (s[0] === 'ativo' ? 'Ativo' : s[0] === 'arquivado' ? 'Arquivado' : 'Extinto') + '</span></td>' +
        '<td class="acoes-l">' + (podeEditar ? '<button class="btn btn-o btn-mini" data-pr-ed="' + p.id + '" title="Editar">✎</button> ' : '') +
          '<button class="btn btn-o btn-mini" data-pr-tf="' + p.id + '" title="Criar tarefa para este processo">+ Tarefa</button></td></tr>'; }).join('') +
    '</tbody></table></div>' : vazio('Nenhum processo com esses filtros.', (E._procs || []).length ? '' : '+ Processo', '#pr-novo')) + '</div>';
  if (window.GX_ENCOLHER_SELOS) requestAnimationFrame(() => window.GX_ENCOLHER_SELOS($('pr-lista')));
  document.querySelectorAll('[data-pr-ed]').forEach((b) => b.onclick = () => window.ERP_EDITOR && window.ERP_EDITOR.abrirFormulario('processos', b.dataset.prEd));
  document.querySelectorAll('[data-pr-tf]').forEach((b) => b.onclick = () => { const p = E._procs.find((x) => x.id === b.dataset.prTf);
    formTarefa({ titulo: 'Processo ' + p.numero + ' — ', grupo_id: p.grupo_id, processos_vinculados: p.numero, responsavel: p.advogado || '' }, () => TELAS.processos()); });
}
