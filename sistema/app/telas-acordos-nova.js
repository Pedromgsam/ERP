// ═══════════════════════════════════════════════════════════════════════════
// ACORDOS — tela refeita (reforma, etapa 4 — Backup 70). Mesmas peças e o mesmo desenho de Parcelamentos:
// 1) cartões que abrem o detalhamento; 2) situação dos acordos por cliente (cartão por grupo → acordos → janela do acordo);
// 3) parcelas como a tabela de Acordos que o usuário preferiu (A pagar / Pago, atalhos de prazo, Prazo, Emitir + Baixa).
// Acordo = dívida do cliente com terceiros (não entra no Financeiro). Nada foi tirado: emitir (e-mail/WhatsApp/rascunho,
// PIX), baixa com comprovante no processo, editar só a parcela ou o acordo inteiro, detalhe completo (tarefa, WhatsApp),
// novo acordo, mostrar concluídos. Dados: DB.acordos do ERP (no Gestão avulso, lidos do banco).
// ═══════════════════════════════════════════════════════════════════════════

const chaveAcordo = (a) => [a.processo, a.devedor, a.credor].join('|');
function acDoERP(a) {
  return { id: a._id, grupo: a.grupo || '', grupoId: a.grupoId || '', processo: a.processo || '', devedor: a.devedor || '', credor: a.credor || '', responsavel: a.responsavel || '',
    n: a.parcela || '', tot: a.totalParc || '', valor: Number(a.valor) || 0, venc: a.vencIso || brIso(a.vencimento), pago: a.pagamento === 'SIM', pagoEm: a.pagoEm || brIso(a.dataPag),
    emitida: a.emitidaIso || brIso(a.emitidaEm) || (/sim|emitid/i.test(a.emissao || '') ? '1' : ''), forma: a.formaPag || 'boleto', pix: a.pix || '', banco: a.banco || '', obs: a.obs || '',
    comprovante: !!a.comprovante, comprovanteId: a.comprovanteId || '', _orig: a };
}
async function acDoBanco() {
  const L = await buscarTodos(() => sb.from('acordos').select('*, grupos(nome)'));
  return L.map((a) => ({ id: a.id, grupo: (a.grupos && a.grupos.nome) || a.aba || '', grupoId: a.grupo_id || '', processo: a.processo || '', devedor: a.devedor || '', credor: a.credor || '', responsavel: a.responsavel || '',
    n: a.parcela || '', tot: a.total_parcelas || '', valor: Number(a.valor) || 0, venc: a.vencimento || '', pago: !!a.pago, pagoEm: a.data_pagamento || '', emitida: a.emitida_em || '',
    forma: a.forma_pagamento || 'boleto', pix: a.pix || '', banco: a.banco || '', obs: a.obs || '', comprovante: !!a.comprovante_processo, comprovanteId: a.comprovante_id || '' }));
}
async function dadosAcordos() { const D = dbParc(); return D && Array.isArray(D.acordos) ? D.acordos.map(acDoERP) : acDoBanco(); }
// junta as parcelas em acordos (processo + devedor + credor) e calcula os números de cada um
function acordosDe(T) {
  const M = {};
  T.forEach((x) => { const k = chaveAcordo(x); const a = M[k] = M[k] || { k, grupo: x.grupo, processo: x.processo, devedor: x.devedor, credor: x.credor, responsavel: x.responsavel, forma: x.forma, pix: x.pix, banco: x.banco, parcelas: [] }; a.parcelas.push(x); x.ac = a; });
  const h = hojeISO();
  return Object.values(M).map((a) => {
    a.parcelas.sort((x, y) => String(x.venc).localeCompare(String(y.venc)));
    const ab = a.parcelas.filter((x) => !x.pago);
    a.pagas = a.parcelas.length - ab.length; a.tot = Math.max(a.parcelas.length, Number(a.parcelas[0].tot) || 0);
    a.pago = a.parcelas.filter((x) => x.pago).reduce((s, x) => s + x.valor, 0); a.falta = ab.reduce((s, x) => s + x.valor, 0);
    a.atr = ab.filter((x) => x.venc && x.venc <= h).length; a.concluido = !ab.length;
    a.prox = ab.find((x) => x.venc > h) || null; a.doMes = a.parcelas.filter((x) => doMesP(x.venc)); a.parcMes = a.doMes[0] || null;
    a.mes = ab.filter((x) => x.venc && (x.venc <= h || doMesP(x.venc))); a.pc = a.tot ? Math.round(a.pagas / a.tot * 100) : 0;
    return a;
  });
}

// ── colunas (as mesmas da tabela de Acordos que o usuário aprovou) ──
function celPrazoA(x) {
  if (x.pago) return '<span class="b-ok-txt">✓ ' + (x.pagoEm ? 'Pago em ' + dataBR(x.pagoEm).slice(0, 5) : 'Pago') + '</span>';
  const d = diasAteP(x.venc);
  return (d === null ? '—' : '<span class="' + corPrazo(d) + '">' + (d < 0 ? Math.abs(d) + ' d atraso' : d === 0 ? 'vence hoje' : d + (d === 1 ? ' dia' : ' dias')) + '</span>') +
    (x.emitida ? '<small class="b-pz-sub b-pz-emit">✓ emitido</small>' : '');
}
function celAcoesA(x) {
  if (x.pago || !pode('juridico', 'editar')) return '';
  return '<span class="b-acoes"><button type="button" class="b-bt-emitir' + (x.emitida ? ' b-emitido' : '') + '" data-ac-emitir="' + esc(x.id) + '" title="' + (x.emitida ? 'Já emitido — clique para emitir de novo' : 'Emitir o boleto (ou a cobrança por PIX) e enviar ao cliente') + '">Emitir</button>' +
    '<button type="button" class="b-bt-baixa" data-ac-baixa="' + esc(x.id) + '" title="Dar baixa (pago) — pede confirmação e o comprovante">Baixa</button></span>';
}
function colunasAcordos(o) {
  o = o || {};
  const C = [];
  if (!o.semGrupo) C.push({ k: 'g', rot: 'Grupo', html: (x) => esc(x.grupo || '—'), ord: (x) => normalizar(x.grupo) });
  C.push({ k: 'proc', rot: 'Processo', cls: 'b-num', html: (x) => esc(x.processo || '—'), ord: (x) => x.processo });
  C.push({ k: 'dev', rot: 'Devedor', html: (x) => esc(x.devedor || '—'), ord: (x) => normalizar(x.devedor) });
  C.push({ k: 'cred', rot: 'Credor', html: (x) => esc(x.credor || '—'), ord: (x) => normalizar(x.credor) });
  C.push({ k: 'n', rot: 'Parcela', cls: 'b-cen b-data', html: (x) => esc(x.n || '—') + (x.tot ? ' de ' + esc(x.tot) : ''), ord: (x) => Number(x.n) || 0 });
  C.push({ k: 'v', rot: 'Valor', cls: 'b-dir b-val', soma: true, html: (x) => brl(x.valor), ord: (x) => x.valor });
  C.push({ k: 'venc', rot: 'Vencimento', cls: 'b-cen b-data', html: (x) => (x.venc ? dataBR(x.venc) : '—'), ord: (x) => x.venc || '9' });
  C.push({ k: 'pz', rot: 'Prazo', cls: 'b-cen b-prazo', html: celPrazoA, ord: (x) => (x.pago ? x.pagoEm || '1' : x.venc || '9') });
  C.push({ k: 'ac', rot: '', cls: 'b-dir b-c-acoes', html: celAcoesA, ord: false });
  return C;
}
const buscaAc = (x) => [x.devedor, x.credor, x.processo, x.grupo, x.responsavel].join(' ');
const vencidaA = (x) => (!x.pago && x.venc && x.venc <= hojeISO() ? ' b-tr-venc' : '');

// ═════════ TELA ═════════
TELAS.acordos = async function () {
  E.ac = E.ac || { grupo: '', chip: 'todos' };
  const el0 = $('conteudo');
  const T = await dadosAcordos();
  if (!el0.isConnected) return;
  E.ac.T = T; E.ac.A = acordosDe(T);
  pintarAcordos();
};
TELAS.acordos.semCadastros = true;
function pintarAcordos() {
  const el = $('conteudo'); if (!el) return;
  const T = E.ac.T || [], A = E.ac.A || [], h = hojeISO(), podeEd = pode('juridico', 'editar');
  el.innerHTML = cabecalhoTela({ icone: 'documento', titulo: 'Acordos', frase: 'Dívidas dos clientes com terceiros (não entram no Financeiro)', atualizar: 'ac-atualizar', botao: podeEd ? { id: 'ac-novo', rotulo: 'Novo acordo' } : null }) +
    '<div class="b-sec"><div><h2>Situação dos acordos por cliente</h2><p>Quanto cada grupo já pagou, quanto falta e o que vence este mês. Clique no cartão para ver cada acordo.</p></div><div class="b-chips" id="ac-chips">' +
    [['todos', 'Todos'], ['atraso', 'Com atraso'], ['risco', 'Risco de rescisão'], ['dia', 'Em dia'], ['concluidos', 'Concluídos']].map((c) => '<button type="button" class="b-chip" data-ac-chip="' + c[0] + '" aria-pressed="' + (E.ac.chip === c[0]) + '">' + c[1] + '</button>').join('') + '</div></div>' +
    '<div class="b-cards" id="ac-grupos"></div><div class="b-sec"><div><h2>Parcelas</h2></div></div><div id="ac-tabela"></div>';
  const bt = $('ac-novo'); if (bt) bt.onclick = () => { if (typeof formAcordoNovo === 'function') formAcordoNovo(() => { if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); else TELAS.acordos(); }); };
  $('ac-atualizar').onclick = () => { if (window.ERP_RECARREGAR_MODULOS) window.ERP_RECARREGAR_MODULOS('acordos').then(() => TELAS.acordos()); else TELAS.acordos(); };
  // Backup 71: os 4 cartões do topo saíram a pedido (a tela começa na situação por cliente)
  desenharGruposAc();
  $('ac-chips').onclick = (ev) => { const b = ev.target.closest('[data-ac-chip]'); if (!b) return; E.ac.chip = b.dataset.acChip; $('ac-chips').querySelectorAll('.b-chip').forEach((x) => x.setAttribute('aria-pressed', x === b)); desenharGruposAc(); };
  const uniq = (f) => [...new Set(T.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((v) => [v, v]);
  tabelaB($('ac-tabela'), { id: 'acordos', tabCls: 'b-tab-ac', linhas: T, colunas: colunasAcordos(), unidade: ['parcela', 'parcelas'], dicaBusca: 'Devedor / processo…',
    abas: [{ id: 'apagar', rot: 'A pagar', f: (x) => !x.pago }, { id: 'pago', rot: 'Pago', f: (x) => x.pago }], semContagemAbas: true,
    prazos: true, prazosAbas: ['apagar'], conta: (n, aba) => plural(n, 'parcela', 'parcelas') + (aba === 'pago' ? ' paga' + (n === 1 ? '' : 's') : ' a pagar'),
    ordAbas: { apagar: { k: 'venc', dir: 1 }, pago: { k: 'pz', dir: -1 } }, ord: { k: 'venc', dir: 1 }, linhaCls: vencidaA, busca: buscaAc, venc: (x) => x.venc, valor: (x) => x.valor, clique: janelaParcelaAc,
    listas: [{ k: 'g', rot: 'Grupo', todos: 'Todos os grupos', opcoes: uniq((x) => x.grupo), get: (x) => x.grupo }, { k: 'cred', rot: 'Credor', todos: 'Todos os credores', opcoes: uniq((x) => x.credor), get: (x) => x.credor },
      { k: 'forma', rot: 'Forma de pagamento', todos: 'Boleto e PIX', opcoes: [['boleto', 'Boleto'], ['pix', 'PIX']], get: (x) => x.forma }],
    vazio: { titulo: 'Nenhuma parcela aqui', frase: 'Troque a escolha acima (Todas, Vencidas, 5/10/15/30 dias) ou limpe os filtros.' } });
}

// ── situação por cliente: um cartão por grupo; clicou → os acordos do grupo ──
function desenharGruposAc() {
  const el = $('ac-grupos'); if (!el) return;
  const G = {};
  (E.ac.A || []).forEach((a) => { const k = a.grupo || a.devedor; (G[k] = G[k] || { id: k, nome: k, itens: [] }).itens.push(a); });
  const chip = E.ac.chip, grupos = Object.values(G).map((g) => {
    const vivos = g.itens.filter((a) => !a.concluido), conc = g.itens.filter((a) => a.concluido);
    const s = (f) => vivos.reduce((t, a) => t + f(a), 0);
    return Object.assign(g, { vivos, conc, pg: s((a) => a.pagas), tot: s((a) => a.tot), falta: s((a) => a.falta), atr: s((a) => a.atr), risco: vivos.some((a) => a.atr >= 2),
      parcMes: s((a) => a.doMes.reduce((t, x) => t + x.valor, 0)), nParcMes: s((a) => a.doMes.length), nMes: s((a) => a.mes.length), somaMes: s((a) => a.mes.reduce((t, x) => t + x.valor, 0)) });
  }).filter((g) => chip === 'concluidos' ? g.conc.length : g.vivos.length && (chip === 'todos' || (chip === 'atraso' && g.atr) || (chip === 'risco' && g.risco) || (chip === 'dia' && !g.atr)))
    .sort((a, b) => (b.atr ? 1 : 0) - (a.atr ? 1 : 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
  if (grupos.length === 1 && !E.ac.grupo) E.ac.grupo = grupos[0].id;
  let html = '';
  grupos.forEach((g) => {
    const ab = E.ac.grupo === g.id, n = chip === 'concluidos' ? g.conc.length : g.vivos.length, pc = g.tot ? Math.round(g.pg / g.tot * 100) : 100;
    html += '<button type="button" class="b-cg" data-ac-g="' + esc(g.id) + '" aria-expanded="' + ab + '"><div class="b-cg-hd"><span class="b-ponto" style="background:' + corGrupo(g.nome) + '"></span><b>' + esc(g.nome) + '</b>' +
      (chip === 'concluidos' ? '<span class="b-pill b-g">Concluídos</span>' : g.atr ? '<span class="b-pill b-r">' + plural(g.atr, 'parcela', 'parcelas') + ' em atraso</span>' : '<span class="b-pill b-g">Em dia</span>') + '</div>' +
      '<div class="b-cg-sub">' + plural(n, 'acordo', 'acordos') + (g.risco && chip !== 'concluidos' ? ' · <span class="b-n-atr">risco de rescisão</span>' : '') + '</div>' +
      (chip === 'concluidos' ? '' : '<div class="b-barra"><span style="width:' + pc + '%"></span></div><div class="b-cg-lin"><span>Pagas</span><b><span class="b-verde">' + g.pg + '</span> de ' + g.tot + '</b></div>' +
        '<div class="b-cg-lin"><span>Falta pagar</span><b>' + brl(g.falta) + '</b></div><div class="b-cg-lin"><span>Parcela do mês</span><b>' + (g.nParcMes ? brl(g.parcMes) + (g.nParcMes > 1 ? ' (' + g.nParcMes + ')' : '') : '—') + '</b></div>' +
        '<div class="b-cg-lin"><span>A pagar este mês</span><b>' + (g.nMes ? brl(g.somaMes) + ' (' + g.nMes + ')' : '—') + '</b></div>') + '</button>';
    if (ab) html += '<div class="b-cg-det" id="ac-det-grupo"></div>';
  });
  el.innerHTML = html || '<div class="b-quadro b-cg-det">' + vazioB({ icone: 'ok', titulo: 'Nenhum grupo neste recorte', frase: 'Troque a escolha acima (Todos, Com atraso, Risco de rescisão, Em dia, Concluídos).' }) + '</div>';
  el.onclick = (ev) => { const c = ev.target.closest('[data-ac-g]'); if (!c) return; E.ac.grupo = E.ac.grupo === c.dataset.acG ? '' : c.dataset.acG; desenharGruposAc(); };
  const det = $('ac-det-grupo'), g = grupos.find((x) => x.id === E.ac.grupo);
  if (!det || !g) return;
  tabelaB(det, { id: 'ac-grupo', titulo: g.nome + ' — clique no acordo para ver a ficha e todas as parcelas', linhas: chip === 'concluidos' ? g.conc : g.vivos, unidade: ['acordo', 'acordos'], chave: (a) => a.k, ord: { k: 'dev', dir: 1 },
    busca: (a) => a.devedor + ' ' + a.credor + ' ' + a.processo, valor: (a) => a.falta,
    colunas: [{ k: 'dev', rot: 'Devedor', html: (a) => esc(a.devedor || '—') + '<span class="b-doc">deve a ' + esc(a.credor || '—') + '</span>', ord: (a) => normalizar(a.devedor) },
      { k: 'proc', rot: 'Processo', cls: 'b-num', html: (a) => esc(a.processo || '—'), ord: (a) => a.processo },
      { k: 'pg', rot: 'Pagas', html: (a) => '<div class="b-prog"><div class="b-barra"><span style="width:' + a.pc + '%"></span></div><span><b class="b-verde">' + a.pagas + '</b> de ' + a.tot + '</span></div>', ord: (a) => a.pc },
      { k: 'falta', rot: 'Falta pagar', cls: 'b-dir b-val', soma: true, html: (a) => brl(a.falta), ord: (a) => a.falta },
      { k: 'pmes', rot: 'Parcela do mês', cls: 'b-dir b-data', html: (a) => { const x = a.parcMes; if (!x) return '<span class="b-em">—</span>';
        return '<b class="b-val">' + brl(x.valor) + '</b><small' + (!x.pago && x.venc <= hojeISO() ? ' class="b-verm"' : '') + '>' + (x.pago ? '✓ paga' : 'vence ' + dataBR(x.venc).slice(0, 5)) + '</small>'; }, ord: (a) => (a.parcMes ? a.parcMes.valor : -1) },
      { k: 'atr', rot: 'Situação', cls: 'b-cen', html: (a) => (a.concluido ? '<span class="b-pill b-g">Concluído</span>' : a.atr ? '<span class="b-n-atr">' + plural(a.atr, 'parcela', 'parcelas') + ' em atraso</span>' : '<span class="b-pill b-g">Em dia</span>'), ord: (a) => a.atr }],
    clique: janelaAcordo });
}

// ── janela do acordo: ficha, 5 números, todas as parcelas; alterar o acordo inteiro; emitir as do mês ──
function janelaAcordo(a) {
  const podeEd = pode('juridico', 'editar'), ids = a.parcelas.map((x) => x.id), aEmitir = a.mes.filter((x) => !x.emitida);
  const j = abrirJanela({ larga: true, kick: 'Acordo · processo ' + (a.processo || '—'), titulo: a.devedor, sub: 'deve a ' + esc(a.credor || '—') + ' · ' + esc(a.grupo || ''),
    dir: a.concluido ? '<span class="b-pill b-g">Concluído</span>' : a.atr ? '<span class="b-pill b-r">' + plural(a.atr, 'parcela', 'parcelas') + ' em atraso</span>' : '<span class="b-pill b-g">Em dia</span>',
    corpo: '<div class="b-ficha"><div><span>Devedor (cliente)</span><b>' + esc(a.devedor || '—') + '</b></div><div><span>Credor</span><b>' + esc(a.credor || '—') + '</b></div><div><span>Processo</span><b class="b-m">' + esc(a.processo || '—') + '</b></div><div><span>Responsável</span><b>' + esc(a.responsavel || '—') + '</b></div>' +
      '<div><span>Forma de pagamento</span><b>' + (a.forma === 'pix' ? 'PIX' : 'Boleto') + '</b></div><div><span>Chave PIX</span><b>' + esc(a.pix || '—') + '</b></div><div><span>Banco</span><b>' + esc(a.banco || '—') + '</b></div><div><span>Grupo</span><b>' + esc(a.grupo || '—') + '</b></div></div>' +
      '<div class="b-nums">' + [['Parcelas pagas', a.pagas + ' de ' + a.tot + ' (' + a.pc + '%)', ''], ['Já pago', brl(a.pago), 'b-verde'], ['Falta pagar', brl(a.falta), ''],
        ['Parcela do mês', a.parcMes ? brl(a.parcMes.valor) + ' · ' + (a.parcMes.pago ? 'paga' : dataBR(a.parcMes.venc).slice(0, 5)) : (a.prox ? 'próxima ' + dataBR(a.prox.venc) : '—'), a.parcMes && !a.parcMes.pago && a.parcMes.venc <= hojeISO() ? 'b-verm' : ''],
        ['Em atraso', a.atr ? plural(a.atr, 'parcela', 'parcelas') : 'nenhuma', a.atr ? 'b-verm' : '']].map((k) => '<div><span>' + k[0] + '</span><b class="' + k[2] + '">' + k[1] + '</b></div>').join('') + '</div>' +
      '<div id="ac-j-parcelas"></div>',
    rodape: (podeEd ? '<button type="button" class="btn btn-o" id="ac-j-todo" style="margin-right:auto">✎ Alterar o acordo inteiro</button>' : '') +
      (podeEd && aEmitir.length ? '<button type="button" class="btn btn-o" id="ac-j-emitir">' + iconeB('documento') + ' Emitir (' + aEmitir.length + ')</button>' : '') + '<button type="button" class="btn btn-o" data-fechar>Fechar</button>' });
  j.classList.add('ac-janela');
  const td = j.querySelector('#ac-j-todo'); if (td) td.onclick = () => { fecharJanela(j); if (typeof editarAcordo === 'function') editarAcordo(ids, () => { if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); }); };
  const em = j.querySelector('#ac-j-emitir'); if (em) em.onclick = () => { fecharJanela(j); emitirAcordos(aEmitir.map((x) => x.id)); };
  E.ac.janela = { a, el: j.querySelector('#ac-j-parcelas') };
  tabelaB(E.ac.janela.el, { id: 'ac-j-' + a.k, titulo: 'Parcelas', linhas: a.parcelas, unidade: ['parcela', 'parcelas'], ord: { k: 'venc', dir: 1 }, valor: (x) => x.valor, venc: (x) => x.venc, altura: '360px', abaPadrao: 'abertas',
    abas: [{ id: 'abertas', rot: 'A pagar', f: (x) => !x.pago }, { id: 'pagas', rot: 'Pago', f: (x) => x.pago }, { id: 'todas', rot: 'Todas', f: () => true }], linhaCls: vencidaA,
    colunas: colunasAcordos({ semGrupo: true }).filter((c) => !['proc', 'dev', 'cred'].includes(c.k)), clique: janelaParcelaAc });
}
// ── clique na parcela: ficha + emitir + baixa (com comprovante) + editar só esta / o acordo inteiro + detalhe completo ──
function janelaParcelaAc(x) {
  const podeEd = pode('juridico', 'editar'), a = x.ac;
  const j = abrirJanela({ kick: 'Parcela ' + (x.n || '—') + (x.tot ? ' de ' + x.tot : ''), titulo: x.devedor, sub: 'deve a ' + esc(x.credor || '—') + ' · processo ' + esc(x.processo || '—'),
    corpo: '<div class="b-ficha" style="grid-template-columns:1fr 1fr"><div><span>Grupo</span><b>' + grupoTxtB(x.grupo) + '</b></div><div><span>Forma de pagamento</span><b>' + (x.forma === 'pix' ? 'PIX' : 'Boleto') + '</b></div>' +
      '<div><span>Vencimento</span><b>' + (x.venc ? dataBR(x.venc) : '—') + '</b></div><div><span>Valor</span><b>' + brl(x.valor) + '</b></div>' + (x.obs ? '<div style="grid-column:1/-1"><span>Observação</span><b>' + esc(x.obs) + '</b></div>' : '') + '</div>' +
      '<div class="b-conf"><b>Emissão</b><span>' + (x.emitida ? '<span class="b-ok-txt">✓ Emitido' + (x.emitida.length === 10 ? ' em ' + dataBR(x.emitida) : '') + '</span>' : 'Ainda não emitido') + (podeEd && !x.pago ? ' <button type="button" class="b-bt-emitir" data-ac-emitir="' + esc(x.id) + '">Emitir</button>' : '') + '</span></div>' +
      '<div class="b-conf"><b>Pagamento</b><span>' + (x.pago ? '<span class="b-ok-txt">✓ Pago' + (x.pagoEm ? ' em ' + dataBR(x.pagoEm) : '') + '</span>' + (x.comprovante ? ' · comprovante no processo' + (x.comprovanteId ? ' (ID ' + esc(x.comprovanteId) + ')' : '') : '') +
        (podeEd ? ' <button type="button" class="b-link" id="ac-p-desmarcar">Desmarcar o pagamento</button>' : '') : (podeEd ? '<button type="button" class="b-bt-baixa" data-ac-baixa="' + esc(x.id) + '">Baixa</button>' : 'Em aberto')) + '</span></div>',
    rodape: '<button type="button" class="btn btn-o" id="ac-p-acordo" style="margin-right:auto">Ver o acordo inteiro</button><button type="button" class="btn btn-o" id="ac-p-detalhe">Detalhe completo</button>' +
      (podeEd ? '<button type="button" class="btn btn-o" id="ac-p-editar">✎ Só esta parcela</button><button type="button" class="btn btn-o" id="ac-p-todo">✎ O acordo inteiro</button>' : '') + '<button type="button" class="btn btn-o" data-fechar>Fechar</button>' });
  j.querySelector('#ac-p-acordo').onclick = () => { fecharJanela(j); if (a) janelaAcordo(a); };
  j.querySelector('#ac-p-detalhe').onclick = () => { fecharJanela(j); if (typeof detalheAcordo === 'function') detalheAcordo(x.id); };
  const ed = j.querySelector('#ac-p-editar'); if (ed) ed.onclick = () => { fecharJanela(j); if (window.ERP_EDITAR) window.ERP_EDITAR('acordos:' + x.id); };
  const td = j.querySelector('#ac-p-todo'); if (td) td.onclick = () => { fecharJanela(j); if (typeof editarAcordo === 'function') editarAcordo(a ? a.parcelas.map((y) => y.id) : [x.id], () => { if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); }); };
  const dm = j.querySelector('#ac-p-desmarcar'); if (dm) dm.onclick = async () => {
    if (!confirm('Tirar a baixa desta parcela? Ela volta a ficar em aberto.')) return;
    fecharJanela(j); const antes = { pago: x.pago, pagoEm: x.pagoEm };
    marcarParcelaAc(x, false, '');
    try { await q(sb.from('acordos').update({ pago: false, data_pagamento: null }).eq('id', x.id)); const ED = ED_P(); if (ED && ED.gravou) ED.gravou('Pagamento desmarcado'); else aviso('Pagamento desmarcado.'); if (ED && ED.marcarSujo) ED.marcarSujo('acordos'); }
    catch (e) { marcarParcelaAc(x, antes.pago, antes.pagoEm); aviso('⚠ ' + erroAmigavel(e), true); }
  };
}
// muda a parcela na tela (e no ERP, para o Painel e os outros números) e redesenha
function marcarParcelaAc(x, pago, pagoEm) {
  x.pago = pago; x.pagoEm = pagoEm || '';
  const o = x._orig; if (o) { o.pagamento = pago ? 'SIM' : ''; o.situacao = pago ? 'Pago' : (x.venc < hojeISO() ? 'Vencido' : 'OK'); o.dataPag = pagoEm ? dataBR(pagoEm) : ''; o.pagoEm = x.pagoEm; }
  E.ac.A = acordosDe(E.ac.T || []);
  if ($('ac-tabela')) pintarAcordos();
  const jn = E.ac.janela; if (jn && jn.el.isConnected && jn.el._redesenharB) jn.el._redesenharB();
}
// ── baixa: pergunta a data e o comprovante no processo; a tela muda na hora; "Desfazer" no rodapé ──
async function baixaAcordo(x) {
  const bx = await perguntarBaixa({ acordo: true, valor: x.valor, descricao: 'Parcela ' + (x.n || '') + (x.tot ? '/' + x.tot : '') + ' — ' + (x.credor || x.processo || '') });
  if (!bx) return;
  const antes = { pago: x.pago, pagoEm: x.pagoEm };
  marcarParcelaAc(x, true, bx.data_pagamento);
  const ED = ED_P();
  const desfazer = async () => {
    const r = await sb.from('acordos').update({ pago: false, data_pagamento: null }).eq('id', x.id);
    if (r.error) return aviso('⚠ ' + erroAmigavel(r.error), true);
    marcarParcelaAc(x, antes.pago, antes.pagoEm); if (ED && ED.gravou) ED.gravou('Baixa desfeita'); if (ED && ED.marcarSujo) ED.marcarSujo('acordos');
  };
  try {
    const d = ED && ED.baixaRapida ? await ED.baixaRapida('acordos', x.id, { semRecarregar: true, desfazer, prazoDesfazer: 8000, dados: bx })
      : await q(sb.from('acordos').update(bx).eq('id', x.id).select().single());
    if (!d || !d.id) throw new Error('não gravou');
    x.comprovante = !!d.comprovante_processo; x.comprovanteId = d.comprovante_id || '';
  } catch (e) { marcarParcelaAc(x, antes.pago, antes.pagoEm); if (e.message !== 'não gravou') aviso('⚠ ' + erroAmigavel(e), true); }
}
// emitir = a janela de envio de sempre (e-mail/rascunho/WhatsApp, PIX); depois recarrega
function emitirAcordos(ids) { if (typeof enviarAcordosSelecionados === 'function') enviarAcordosSelecionados(ids, () => { if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); else TELAS.acordos(); }); }
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-ac-baixa]'), em = ev.target.closest('[data-ac-emitir]');
  if (!b && !em) return;
  ev.stopPropagation(); ev.preventDefault();
  const id = (b || em).dataset[b ? 'acBaixa' : 'acEmitir'];
  const x = ((E.ac && E.ac.T) || []).find((y) => y.id === id);
  const janela = (b || em).closest('.fundo'); if (janela && !janela.classList.contains('ac-janela')) fecharJanela(janela);
  if (b) { if (x) baixaAcordo(x); return; }
  emitirAcordos([id]);
}, true);
