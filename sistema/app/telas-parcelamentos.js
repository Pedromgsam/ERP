// ═══════════════════════════════════════════════════════════════════════════
// PARCELAMENTOS — tela refeita (reforma, etapa 3 — Backup 68)
// Igual ao ambiente de teste aprovado (sistema/prototipos/ambiente-teste/telas-1.js):
// 1) cartões que abrem o detalhamento; 2) situação por cliente (um cartão por grupo → lista dos parcelamentos);
// 3) parcelas em abas Em atraso / A vencer / Pagas, com busca, listas, Filtros (vencimento e valor), ordenar, total e média,
//    marcar várias para dar baixa ou marcar guias como emitidas. Toda baixa pede confirmação e tem "Desfazer".
// Os dados vêm do próprio ERP (DB.parcelamentos, já carregado); no Gestão avulso (testes) são lidos direto do banco.
// Editar/criar parcelamento usa o formulário do ERP (gerar parcelas, excluir, histórico) — nenhuma função foi tirada.
// ═══════════════════════════════════════════════════════════════════════════

const ED_P = () => window.ERP_EDITOR || null;
const doMesP = (iso) => !!iso && iso.slice(0, 7) === hojeISO().slice(0, 7);
// E3: cada grupo com uma cor fixa (a mesma em todas as telas)
function corGrupo(nome) { let h = 0; String(nome || '').split('').forEach((c) => { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return 'var(--chart-' + (1 + (h % 8)) + ')'; }
function grupoTxtB(nome) { return '<span class="b-gtx"><span class="b-ponto" style="background:' + corGrupo(nome) + '"></span>' + esc(nome || 'Sem grupo') + '</span>'; }
function empresaB(nome, docx) { return '<span class="b-emp">' + esc(nome || '—') + '</span>' + (docx ? '<span class="b-doc">' + esc(docx) + '</span>' : ''); }
const brIso = (br) => { const m = String(br || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? m[3] + '-' + m[2] + '-' + m[1] : (/^\d{4}-\d{2}-\d{2}/.test(String(br || '')) ? String(br).slice(0, 10) : ''); };
const dbParc = () => { try { return (typeof DB !== 'undefined' && DB) || window.DB || null; } catch (e) { return window.DB || null; } }; // eslint-disable-line no-undef

// ── dados: o mesmo formato venha do ERP ou do banco ──
function paDoERP(p) {
  const pa = { id: p._id, grupo: p.grupoNome || p.aba || '', grupoId: p.grupoId || '', empresa: p.empresa || '', cnpj: p.cnpj || '', local: p.local || '', natureza: p.natureza || '', numero: p.numero || '',
    tot: Number(p.totalParcelas) || 0, pagas: Number(p.parcelasPagas) || 0, vparc: Number(p.valorUltimaParcela) || 0, emitimos: p.emitimosGuia !== false, obs: p.obs || '', _orig: p };
  pa.parcelas = (p.parcelas || []).map((x) => ({ id: x._id, pa, n: x.numero || '', venc: x.vencIso || brIso(x.vencimento), pago: x.pagamento === 'SIM', pagoEm: x.pagoEm || '',
    emitida: x.emitidaIso || brIso(x.emitidaEm), valor: Number(x.valor) || pa.vparc, lancado: !!x.valorLancado, _orig: x }));
  return pa;
}
async function paDoBanco() {
  const [pas, ps] = await Promise.all([buscarTodos(() => sb.from('parcelamentos').select('*, grupos(nome)')), buscarTodos(() => sb.from('parcelas').select('*'))]);
  const por = {}; ps.forEach((x) => { (por[x.parcelamento_id] = por[x.parcelamento_id] || []).push(x); });
  return pas.map((p) => {
    const L = (por[p.id] || []).sort((a, b) => String(a.vencimento || '').localeCompare(String(b.vencimento || '')));
    let ult = null;
    const pa = { id: p.id, grupo: (p.grupos && p.grupos.nome) || p.aba || '', grupoId: p.grupo_id || '', empresa: p.empresa || '', cnpj: mascaraDoc(p.cnpj || ''), local: p.local || '', natureza: p.natureza || '', numero: p.numero || '',
      tot: Number(p.total_parcelas) || L.length, pagas: L.filter((x) => x.pago).length, vparc: Number(p.valor_ultima_parcela) || 0, emitimos: p.emitimos_guia !== false, obs: p.obs || '' };
    pa.parcelas = L.map((x) => { if (x.valor != null && Number(x.valor) > 0) ult = Number(x.valor);
      return { id: x.id, pa, n: x.numero || '', venc: x.vencimento || '', pago: !!x.pago, pagoEm: x.data_pagamento || '', emitida: x.emitida_em || '', valor: ult != null ? ult : pa.vparc, lancado: x.valor != null && Number(x.valor) > 0 }; });
    return pa;
  });
}
async function dadosParcelamentos() {
  const D = dbParc();
  if (D && Array.isArray(D.parcelamentos)) return D.parcelamentos.map(paDoERP);
  return paDoBanco();
}
// números de um parcelamento
function resumoPa(pa) {
  const h = hojeISO(), L = pa.parcelas;
  const atr = L.filter((x) => !x.pago && x.venc && x.venc <= h);
  const abertas = L.filter((x) => !x.pago);
  const prox = abertas.filter((x) => x.venc > h).sort((a, b) => a.venc.localeCompare(b.venc))[0] || null;
  const vAtual = (L.length ? L[L.length - 1].valor : 0) || pa.vparc;
  const falta = Math.max(0, pa.tot - pa.pagas) * vAtual;
  return { atr: atr.length, valorAtr: atr.reduce((s, x) => s + x.valor, 0), prox, quitado: pa.pagas * vAtual, falta, concluido: pa.tot > 0 && pa.pagas >= pa.tot, pc: pa.tot ? Math.round(pa.pagas / pa.tot * 100) : 0,
    mes: abertas.filter((x) => x.venc && (x.venc <= h || doMesP(x.venc))) };
}
const estadoParc = (x) => (x.pago ? 'pagas' : x.venc && x.venc <= hojeISO() ? 'atraso' : 'avencer');
const paraEmitirP = (x) => x.pa.emitimos && !x.pago && !x.emitida && !!x.venc && (x.venc <= hojeISO() || doMesP(x.venc));

// ── células e colunas (as mesmas em todas as listas de parcelas) ──
function celEmissaoP(x, comBotao) {
  if (!x.pa.emitimos) return '<span class="b-em">Cliente emite</span>';
  if (x.emitida) return '<span class="b-em b-em-ok">✓ Emitida ' + dataBR(x.emitida).slice(0, 5) + '</span>';
  if (x.pago) return '<span class="b-em">—</span>';
  return comBotao && pode('juridico', 'editar') && x.venc && (x.venc <= hojeISO() || doMesP(x.venc)) ? '<button type="button" class="b-emitir" data-pc-emitir="' + esc(x.id) + '">' + iconeB('documento') + 'Emitir</button>' : '<span class="b-em">Não emitida</span>';
}
function celBaixaP(x) {
  if (x.pago) return '<span class="b-ok-txt">✓ ' + (x.pagoEm ? 'Pago em ' + dataBR(x.pagoEm).slice(0, 5) : 'Pago') + '</span>';
  return pode('juridico', 'editar') ? '<button type="button" class="b-baixa" data-pc-baixa="' + esc(x.id) + '">' + iconeB('check') + 'Baixa</button>' : '<span class="b-em">Em aberto</span>';
}
function colunasParcelas(o) {
  o = o || {};
  const C = [];
  if (!o.semGrupo) C.push({ k: 'g', rot: 'Grupo', html: (x) => grupoTxtB(x.pa.grupo), ord: (x) => normalizar(x.pa.grupo) });
  C.push({ k: 'emp', rot: 'Empresa', html: (x) => empresaB(x.pa.empresa, x.pa.cnpj), ord: (x) => normalizar(x.pa.empresa) });
  C.push({ k: 'plat', rot: 'Plataforma', html: (x) => '<span class="b-plat">' + esc(x.pa.local || '—') + '</span>', ord: (x) => x.pa.local });
  C.push({ k: 'nat', rot: 'Natureza', html: (x) => esc(x.pa.natureza || '—'), ord: (x) => x.pa.natureza });
  if (!o.semNum) C.push({ k: 'num', rot: 'Nº parcelamento', cls: 'b-num', html: (x) => esc(x.pa.numero || '—'), ord: (x) => x.pa.numero });
  C.push({ k: 'n', rot: 'Parcela', cls: 'b-data', html: (x) => esc(x.n) + (x.pa.tot ? ' de ' + x.pa.tot : ''), ord: (x) => Number(x.n) || 0 });
  C.push({ k: 'v', rot: 'Valor', cls: 'b-dir b-val', soma: true, html: (x) => brl(x.valor), ord: (x) => x.valor });
  C.push({ k: 'venc', rot: 'Vencimento', cls: 'b-cen b-data', clsL: (x) => vencB(x.venc, x.pago).cls, html: (x) => vencB(x.venc, x.pago).html, ord: (x) => x.venc || '9' });
  if (o.emissao) C.push({ k: 'em', rot: 'Guia', cls: 'b-cen', html: (x) => celEmissaoP(x, true), ord: (x) => x.emitida || '' });
  if (!o.semBaixa) C.push({ k: 'pago', rot: 'Baixa', cls: 'b-cen', html: celBaixaP, ord: (x) => x.pagoEm || (x.pago ? '1' : '') });
  return C;
}
function listasParcelas(T) {
  const uniq = (f) => [...new Set(T.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((v) => [v, v]);
  return [{ k: 'g', rot: 'Grupo', todos: 'Todos os grupos', opcoes: uniq((x) => x.pa.grupo), get: (x) => x.pa.grupo },
    { k: 'plat', rot: 'Plataforma', todos: 'Todas as plataformas', opcoes: uniq((x) => x.pa.local), get: (x) => x.pa.local },
    { k: 'nat', rot: 'Natureza', todos: 'Todas as naturezas', opcoes: uniq((x) => x.pa.natureza), get: (x) => x.pa.natureza }];
}
const buscaParc = (x) => x.pa.empresa + ' ' + x.pa.cnpj + ' ' + soDigitos(x.pa.cnpj) + ' ' + x.pa.numero + ' ' + x.pa.grupo + ' ' + x.pa.natureza;

// ═════════ TELA ═════════
TELAS.parcelamentos = async function () {
  E.pc = E.pc || { grupo: '', chip: 'todos' };
  const el0 = $('conteudo');
  // o que mudou em outra tela (baixa na Rotina, por exemplo): relê só esses parcelamentos antes de desenhar
  const sujo = window.ERP_SUJO && window.ERP_SUJO.parcelamentos;
  if (sujo && typeof window.ERP_RECARREGAR_PARCELAMENTOS === 'function') { window.ERP_SUJO = null; try { await window.ERP_RECARREGAR_PARCELAMENTOS(sujo); } catch (e) { console.warn('[Parcelamentos] recarregar:', e.message); } }
  const PA = await dadosParcelamentos();
  if (!el0.isConnected) return;
  E.pc.PA = PA;
  pintarParcelamentos();
};
TELAS.parcelamentos.semCadastros = true;   // os dados vêm do ERP (DB.parcelamentos); a lista de clientes não é usada aqui
function pintarParcelamentos() {
  const el = $('conteudo'); if (!el) return;
  const PA = E.pc.PA || [], T = [].concat(...PA.map((pa) => pa.parcelas)), h = hojeISO(), podeEd = pode('juridico', 'editar');
  const atr = T.filter((x) => estadoParc(x) === 'atraso'), hoje = atr.filter((x) => x.venc === h);
  const mes = T.filter((x) => !x.pago && doMesP(x.venc));
  const guiasMes = T.filter((x) => x.pa.emitimos && !x.pago && x.venc && (x.venc <= h || doMesP(x.venc))), emit = guiasMes.filter((x) => x.emitida);
  const R = PA.map((pa) => [pa, resumoPa(pa)]), ativos = R.filter(([, r]) => !r.concluido);
  const pago = ativos.reduce((s, [, r]) => s + r.quitado, 0), falta = ativos.reduce((s, [, r]) => s + r.falta, 0);
  const soma = (l) => l.reduce((s, x) => s + x.valor, 0);
  el.innerHTML = cabecalhoTela({ icone: 'camadas', titulo: 'Parcelamentos', frase: 'Parcelas dos clientes no e-CAC, Regularize e SIARE, por vencimento', atualizar: 'pc-atualizar', botao: podeEd ? { id: 'pc-novo', rotulo: 'Novo parcelamento' } : null }) +
    '<div id="pc-cartoes"></div>' +
    '<div class="b-sec"><div><h2>Situação dos parcelamentos por cliente</h2><p>Quanto cada grupo já pagou, quanto falta e o que vence este mês. Clique no cartão para ver cada parcelamento.</p></div><div class="b-chips" id="pc-chips">' +
    [['todos', 'Todos'], ['atraso', 'Com atraso'], ['risco', 'Risco de rescisão'], ['dia', 'Em dia'], ['concluidos', 'Concluídos']].map((c) => '<button type="button" class="b-chip" data-pc-chip="' + c[0] + '" aria-pressed="' + (E.pc.chip === c[0]) + '">' + c[1] + '</button>').join('') + '</div></div>' +
    '<div class="b-cards" id="pc-grupos"></div>' +
    '<div class="b-sec"><div><h2>Parcelas</h2></div></div><div id="pc-tabela"></div>';
  const bt = $('pc-novo'); if (bt) bt.onclick = () => { const ED = ED_P(); if (ED && ED.abrirParcelamento) ED.abrirParcelamento(null); else aviso('Abra pelo ERP: + Lançar → Parcelamento.', true); };
  $('pc-atualizar').onclick = () => { if (window.ERP_RECARREGAR_MODULOS) window.ERP_RECARREGAR_MODULOS('parcelamentos').then(() => TELAS.parcelamentos()); else TELAS.parcelamentos(); };
  const det = (id, titulo, linhas, o) => (c) => tabelaB(c, Object.assign({ id, titulo, linhas, colunas: colunasParcelas(o), unidade: ['parcela', 'parcelas'], busca: buscaParc, valor: (x) => x.valor, venc: (x) => x.venc,
    ord: { k: 'venc', dir: 1 }, clique: janelaParcela, lote: lotesParcelas(), altura: '440px' }, o && o.cfg));
  cartoesB($('pc-cartoes'), 'parcelamentos', [
    { id: 'atr', cor: 'r', icone: 'alerta', rotulo: 'Parcelas em atraso', valor: String(atr.length), sub: brl(soma(atr)) + ' somadas · ' + plural(hoje.length, 'vence', 'vencem') + ' hoje', det: det('pc-d-atr', 'Parcelas em atraso (inclui as que vencem hoje)', atr, { semNum: true }) },
    { id: 'mes', cor: 'b', icone: 'calendario', rotulo: 'Vencem este mês', valor: String(mes.length), comp: '· ' + brl(soma(mes)) + ' no mês', sub: 'Emitir as guias até <b>dia 12</b>', det: det('pc-d-mes', 'Vencem em ' + nomeMes(new Date()), mes, { semNum: true, emissao: true }) },
    { id: 'guias', cor: 'a', icone: 'documento', rotulo: 'Guias a emitir', valor: String(guiasMes.length - emit.length), comp: 'de ' + guiasMes.length, barra: guiasMes.length ? emit.length / guiasMes.length * 100 : 100,
      sub: emit.length + ' já emitidas · prazo <b>dia 12</b>', det: det('pc-d-guias', 'Guias a emitir (vencidas e do mês)', guiasMes.filter((x) => !x.emitida), { semNum: true, emissao: true, semBaixa: true }) },
    { id: 'quit', cor: 'g', icone: 'pizza', rotulo: 'Quitado / falta', linhas: [[brl(pago), 'já pago', true], [brl(falta), 'falta pagar']], barra: pago + falta ? pago / (pago + falta) * 100 : 0,
      sub: (pago + falta ? Math.round(pago / (pago + falta) * 100) : 0) + '% do total dos parcelamentos em andamento', det: (c) => {
        const G = {}; ativos.forEach(([pa, r]) => { const g = G[pa.grupo] = G[pa.grupo] || { id: pa.grupo, nome: pa.grupo, n: 0, pago: 0, falta: 0 }; g.n++; g.pago += r.quitado; g.falta += r.falta; });
        tabelaB(c, { id: 'pc-d-quit', titulo: 'Quitado e falta, por grupo', linhas: Object.values(G), unidade: ['grupo', 'grupos'], valor: (g) => g.falta, ord: { k: 'falta', dir: -1 }, chave: (g) => g.id,
          colunas: [{ k: 'g', rot: 'Grupo', html: (g) => grupoTxtB(g.nome), ord: (g) => normalizar(g.nome) }, { k: 'n', rot: 'Parcelamentos', cls: 'b-cen b-data', html: (g) => g.n, ord: (g) => g.n },
            { k: 'pago', rot: 'Já pago', cls: 'b-dir b-val', html: (g) => '<span class="b-verde">' + brl(g.pago) + '</span>', ord: (g) => g.pago }, { k: 'falta', rot: 'Falta pagar', cls: 'b-dir b-val', soma: true, html: (g) => brl(g.falta), ord: (g) => g.falta },
            { k: 'pc', rot: 'Quitado', html: (g) => { const p = g.pago + g.falta ? Math.round(g.pago / (g.pago + g.falta) * 100) : 0; return '<div class="b-prog"><div class="b-barra"><span style="width:' + p + '%"></span></div><span>' + p + '%</span></div>'; }, ord: (g) => g.pago / ((g.pago + g.falta) || 1) }],
          clique: (g) => { E.pc.grupo = g.id; desenharGruposPc(); const x = $('pc-grupos'); if (x) x.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
      } }
  ]);
  desenharGruposPc();
  $('pc-chips').onclick = (ev) => { const b = ev.target.closest('[data-pc-chip]'); if (!b) return; E.pc.chip = b.dataset.pcChip; $('pc-chips').querySelectorAll('.b-chip').forEach((x) => x.setAttribute('aria-pressed', x === b)); desenharGruposPc(); };
  tabelaB($('pc-tabela'), { id: 'parcelas', linhas: T, colunas: colunasParcelas(), unidade: ['parcela', 'parcelas'], dicaBusca: 'Empresa, CNPJ ou nº',
    titulo: (a) => ({ atraso: 'Parcelas em atraso (inclui as que vencem hoje)', avencer: 'Parcelas a vencer', pagas: 'Parcelas pagas' }[a]),
    abas: [{ id: 'atraso', rot: 'Em atraso', cor: 'r', f: (x) => estadoParc(x) === 'atraso' }, { id: 'avencer', rot: 'A vencer', f: (x) => estadoParc(x) === 'avencer' }, { id: 'pagas', rot: 'Pagas', f: (x) => x.pago }],
    ordAbas: { atraso: { k: 'venc', dir: 1 }, avencer: { k: 'venc', dir: 1 }, pagas: { k: 'pago', dir: -1 } }, ord: { k: 'venc', dir: 1 },
    busca: buscaParc, listas: listasParcelas(T), venc: (x) => x.venc, valor: (x) => x.valor, lote: lotesParcelas(), clique: janelaParcela,
    vazio: { titulo: 'Nenhuma parcela aqui', frase: 'Quando houver parcelas nesta situação, elas aparecem nesta lista.' } });
}

// ── situação por cliente: um cartão por grupo; clicou → a lista dos parcelamentos do grupo ──
function desenharGruposPc() {
  const el = $('pc-grupos'); if (!el) return;
  const PA = E.pc.PA || [], G = {};
  PA.forEach((pa) => { const r = resumoPa(pa), k = pa.grupo || pa.empresa; const g = G[k] = G[k] || { id: k, nome: k, itens: [] }; g.itens.push([pa, r]); });
  const chip = E.pc.chip, grupos = Object.values(G).map((g) => {
    const vivos = g.itens.filter(([, r]) => !r.concluido), conc = g.itens.filter(([, r]) => r.concluido);
    let pg = 0, tot = 0, falta = 0, atr = 0, risco = false, nMes = 0, somaMes = 0;
    vivos.forEach(([pa, r]) => { pg += pa.pagas; tot += pa.tot; falta += r.falta; atr += r.atr; if (r.atr >= 2) risco = true; nMes += r.mes.length; somaMes += r.mes.reduce((s, x) => s + x.valor, 0); });
    return Object.assign(g, { vivos, conc, pg, tot, falta, atr, risco, nMes, somaMes });
  }).filter((g) => chip === 'concluidos' ? g.conc.length : g.vivos.length && (chip === 'todos' || (chip === 'atraso' && g.atr) || (chip === 'risco' && g.risco) || (chip === 'dia' && !g.atr)))
    .sort((a, b) => (b.atr ? 1 : 0) - (a.atr ? 1 : 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
  if (grupos.length === 1 && !E.pc.grupo) E.pc.grupo = grupos[0].id;
  let html = '';
  grupos.forEach((g) => {
    const ab = E.pc.grupo === g.id, n = chip === 'concluidos' ? g.conc.length : g.vivos.length, pc = g.tot ? Math.round(g.pg / g.tot * 100) : 100;
    html += '<button type="button" class="b-cg" data-pc-g="' + esc(g.id) + '" aria-expanded="' + ab + '"><div class="b-cg-hd"><span class="b-ponto" style="background:' + corGrupo(g.nome) + '"></span><b>' + esc(g.nome) + '</b>' +
      (chip === 'concluidos' ? '<span class="b-pill b-g">Concluídos</span>' : g.atr ? '<span class="b-pill b-r">' + plural(g.atr, 'parcela', 'parcelas') + ' em atraso</span>' : '<span class="b-pill b-g">Em dia</span>') + '</div>' +
      '<div class="b-cg-sub">' + plural(n, 'parcelamento', 'parcelamentos') + (g.risco && chip !== 'concluidos' ? ' · <span class="b-n-atr">risco de rescisão</span>' : '') + '</div>' +
      (chip === 'concluidos' ? '' : '<div class="b-barra"><span style="width:' + pc + '%"></span></div><div class="b-cg-lin"><span>Pagas</span><b><span class="b-verde">' + g.pg + '</span> de ' + g.tot + '</b></div>' +
        '<div class="b-cg-lin"><span>Falta pagar</span><b>' + brl(g.falta) + '</b></div><div class="b-cg-lin"><span>A pagar este mês</span><b>' + (g.nMes ? brl(g.somaMes) + ' (' + g.nMes + ')' : '—') + '</b></div>') + '</button>';
    if (ab) html += '<div class="b-cg-det" id="pc-det-grupo"></div>';
  });
  el.innerHTML = html || '<div class="b-quadro b-cg-det">' + vazioB({ icone: 'ok', titulo: 'Nenhum grupo neste recorte', frase: 'Troque a escolha acima (Todos, Com atraso, Risco de rescisão, Em dia, Concluídos).' }) + '</div>';
  el.onclick = (ev) => { const c = ev.target.closest('[data-pc-g]'); if (!c) return; E.pc.grupo = E.pc.grupo === c.dataset.pcG ? '' : c.dataset.pcG; desenharGruposPc(); };
  const det = $('pc-det-grupo'), g = grupos.find((x) => x.id === E.pc.grupo);
  if (!det || !g) return;
  const lista = chip === 'concluidos' ? g.conc : g.vivos;
  tabelaB(det, { id: 'pc-grupo', titulo: g.nome + ' — clique no parcelamento para ver a ficha e todas as parcelas', linhas: lista, unidade: ['parcelamento', 'parcelamentos'], chave: ([pa]) => pa.id, ord: { k: 'emp', dir: 1 },
    busca: ([pa]) => pa.empresa + ' ' + pa.numero + ' ' + pa.natureza, valor: ([, r]) => r.falta,
    colunas: [{ k: 'emp', rot: 'Empresa', html: ([pa]) => empresaB(pa.empresa, pa.cnpj), ord: ([pa]) => normalizar(pa.empresa) }, { k: 'plat', rot: 'Plataforma', html: ([pa]) => '<span class="b-plat">' + esc(pa.local || '—') + '</span>', ord: ([pa]) => pa.local },
      { k: 'nat', rot: 'Natureza', html: ([pa]) => esc(pa.natureza || '—'), ord: ([pa]) => pa.natureza }, { k: 'num', rot: 'Nº parcelamento', cls: 'b-num', html: ([pa]) => esc(pa.numero || '—'), ord: ([pa]) => pa.numero },
      { k: 'pg', rot: 'Pagas', html: ([pa, r]) => '<div class="b-prog"><div class="b-barra"><span style="width:' + r.pc + '%"></span></div><span><b class="b-verde">' + pa.pagas + '</b> de ' + pa.tot + '</span></div>', ord: ([, r]) => r.pc },
      { k: 'falta', rot: 'Falta pagar', cls: 'b-dir b-val', soma: true, html: ([, r]) => brl(r.falta), ord: ([, r]) => r.falta },
      { k: 'prox', rot: 'Próxima', cls: 'b-cen b-data', html: ([, r]) => (r.prox ? dataBR(r.prox.venc) : '—'), ord: ([, r]) => (r.prox ? r.prox.venc : '9') },
      { k: 'atr', rot: 'Situação', cls: 'b-cen', html: ([, r]) => (r.concluido ? '<span class="b-pill b-g">Concluído</span>' : r.atr ? '<span class="b-n-atr">' + plural(r.atr, 'parcela', 'parcelas') + ' em atraso</span>' : '<span class="b-pill b-g">Em dia</span>'), ord: ([, r]) => r.atr }],
    clique: ([pa]) => janelaParcelamento(pa) });
}

// ── janela do parcelamento: ficha, 5 números, TODAS as parcelas (lidas do banco), Emitir e Baixa ──
async function janelaParcelamento(pa) {
  const r = resumoPa(pa);
  const j = abrirJanela({ larga: true, kick: 'Parcelamento nº ' + (pa.numero || '—'), titulo: pa.empresa, sub: esc(pa.grupo || '') + ' · ' + esc(pa.local || '') + ' · ' + esc(pa.natureza || ''),
    dir: r.concluido ? '<span class="b-pill b-g">Concluído</span>' : r.atr ? '<span class="b-pill b-r">' + plural(r.atr, 'parcela', 'parcelas') + ' em atraso</span>' : '<span class="b-pill b-g">Em dia</span>',
    corpo: '<div class="b-ficha"><div><span>CPF / CNPJ</span><b class="b-m">' + esc(pa.cnpj || '—') + '</b></div><div><span>Plataforma</span><b>' + esc(pa.local || '—') + '</b></div><div><span>Natureza</span><b>' + esc(pa.natureza || '—') + '</b></div><div><span>Nº do parcelamento</span><b class="b-m">' + esc(pa.numero || '—') + '</b></div>' +
      '<div><span>Total de parcelas</span><b>' + (pa.tot || '—') + '</b></div><div><span>Valor da parcela</span><b>' + brl((pa.parcelas.length ? pa.parcelas[pa.parcelas.length - 1].valor : 0) || pa.vparc) + '</b></div><div><span>Valor residual</span><b>' + brl(r.falta) + '</b></div><div><span>Guias</span><b>' + (pa.emitimos ? 'Nós emitimos' : 'O cliente emite') + '</b></div>' +
      (pa.obs ? '<div style="grid-column:1/-1"><span>Observação</span><b>' + esc(pa.obs) + '</b></div>' : '') + '</div>' +
      '<div class="b-nums">' + [['Parcelas pagas', pa.pagas + ' de ' + pa.tot + ' (' + r.pc + '%)', ''], ['Já quitado', brl(r.quitado), 'b-verde'], ['Falta pagar', brl(r.falta), ''], ['Próxima parcela', r.prox ? dataBR(r.prox.venc) : '—', ''], ['Em atraso', r.atr ? plural(r.atr, 'parcela', 'parcelas') : 'nenhuma', r.atr ? 'b-verm' : '']]
        .map((k) => '<div><span>' + k[0] + '</span><b class="' + k[2] + '">' + k[1] + '</b></div>').join('') + '</div><div id="pc-j-parcelas"><p class="b-kpi-s">Carregando todas as parcelas…</p></div>',
    rodape: (pode('juridico', 'editar') ? '<button type="button" class="btn btn-o" id="pc-j-editar" style="margin-right:auto">Editar dados do parcelamento</button>' : '') +
      (pa.emitimos && r.mes.some((x) => !x.emitida) && pode('juridico', 'editar') ? '<button type="button" class="btn btn-o" id="pc-j-guias">' + iconeB('documento') + ' Emitir guias (' + r.mes.filter((x) => !x.emitida).length + ')</button>' : '') +
      '<button type="button" class="btn btn-o" data-fechar>Fechar</button>' });
  j.classList.add('pc-janela');
  const ed = j.querySelector('#pc-j-editar'); if (ed) ed.onclick = () => { fecharJanela(j); const ED = ED_P(); if (ED && ED.abrirParcelamento) ED.abrirParcelamento(pa.id); };
  const gu = j.querySelector('#pc-j-guias'); if (gu) gu.onclick = () => { fecharJanela(j); if (typeof gerarGuias === 'function') gerarGuias('parcelas', { ids: r.mes.filter((x) => !x.emitida).map((x) => x.id) }); };
  // todas as parcelas, direto do banco (a tela principal mostra 12 meses para trás e 18 para frente)
  let todas = pa.parcelas;
  try {
    const L = await q(sb.from('parcelas').select('*').eq('parcelamento_id', pa.id).order('vencimento').order('id'));
    let ult = null;
    todas = L.map((x) => { if (x.valor != null && Number(x.valor) > 0) ult = Number(x.valor); const ja = pa.parcelas.find((y) => y.id === x.id);
      const y = { id: x.id, pa, n: x.numero || '', venc: x.vencimento || '', pago: !!x.pago, pagoEm: x.data_pagamento || '', emitida: x.emitida_em || '', valor: ult != null ? ult : pa.vparc, lancado: x.valor != null && Number(x.valor) > 0, _orig: ja && ja._orig };
      if (ja) Object.assign(ja, y); return ja || y; });
  } catch (e) { console.warn('[Parcelamentos] parcelas:', e.message); }
  const alvo = j.querySelector('#pc-j-parcelas'); if (!alvo || !alvo.isConnected) return;
  E.pc.janelaPa = { pa, todas, el: alvo };
  tabelaB(alvo, { id: 'pc-j-' + pa.id, titulo: 'Parcelas', linhas: todas, unidade: ['parcela', 'parcelas'], ord: { k: 'n', dir: 1 }, valor: (x) => x.valor, venc: (x) => x.venc, altura: '360px', abaPadrao: 'abertas',
    abas: [{ id: 'abertas', rot: 'Em aberto', f: (x) => !x.pago }, { id: 'pagas', rot: 'Pagas', f: (x) => x.pago }, { id: 'todas', rot: 'Todas', f: () => true }],
    colunas: [{ k: 'n', rot: 'Parcela', cls: 'b-data', html: (x) => esc(x.n) + (pa.tot ? '/' + pa.tot : ''), ord: (x) => Number(x.n) || 0 },
      { k: 'venc', rot: 'Vencimento', cls: 'b-data', clsL: (x) => vencB(x.venc, x.pago).cls, html: (x) => vencB(x.venc, x.pago).html, ord: (x) => x.venc || '9' },
      { k: 'v', rot: 'Valor', cls: 'b-dir b-val', soma: true, html: (x) => brl(x.valor) + (x.lancado ? '' : ' <small title="Valor ainda não lançado nesta parcela: vale o último lançado">*</small>'), ord: (x) => x.valor },
      { k: 'em', rot: 'Guia', html: (x) => celEmissaoP(x, true), ord: (x) => x.emitida || '' },
      { k: 'pago', rot: 'Baixa', cls: 'b-cen', html: celBaixaP, ord: (x) => x.pagoEm || (x.pago ? '1' : '') }],
    lote: lotesParcelas(), clique: janelaParcela });
}

// ── clique na parcela: ficha + guia + pagamento (com Desmarcar) + editar no formulário do ERP ──
function janelaParcela(x) {
  const pa = x.pa, podeEd = pode('juridico', 'editar');
  const j = abrirJanela({ kick: 'Parcela ' + x.n + (pa.tot ? ' de ' + pa.tot : ''), titulo: pa.empresa, sub: esc(pa.local || '') + ' · ' + esc(pa.natureza || '') + ' · nº ' + esc(pa.numero || '—'),
    corpo: '<div class="b-ficha" style="grid-template-columns:1fr 1fr"><div><span>Grupo</span><b>' + grupoTxtB(pa.grupo) + '</b></div><div><span>CPF / CNPJ</span><b class="b-m">' + esc(pa.cnpj || '—') + '</b></div>' +
      '<div><span>Vencimento</span><b>' + (x.venc ? dataBR(x.venc) : '—') + '</b></div><div><span>Valor</span><b>' + brl(x.valor) + (x.lancado ? '' : ' <small>(último lançado)</small>') + '</b></div></div>' +
      '<div class="b-conf"><b>Guia</b><span>' + celEmissaoP(x, true) + '</span></div>' +
      '<div class="b-conf"><b>Pagamento</b><span>' + (x.pago ? '<span class="b-ok-txt">✓ Pago' + (x.pagoEm ? ' em ' + dataBR(x.pagoEm) : '') + '</span>' + (podeEd ? ' <button type="button" class="b-link" id="pc-p-desmarcar">Desmarcar o pagamento</button>' : '') : celBaixaP(x)) + '</span></div>',
    rodape: '<button type="button" class="btn btn-o" id="pc-p-pa" style="margin-right:auto">Ver o parcelamento inteiro</button>' + (podeEd ? '<button type="button" class="btn btn-o" id="pc-p-editar">Editar</button>' : '') + '<button type="button" class="btn btn-o" data-fechar>Fechar</button>' });
  j.querySelector('#pc-p-pa').onclick = () => { fecharJanela(j); janelaParcelamento(pa); };
  const ed = j.querySelector('#pc-p-editar'); if (ed) ed.onclick = () => { fecharJanela(j); const ED = ED_P(); if (ED && ED.abrirParcelamento) ED.abrirParcelamento(pa.id, x.id); };
  const dm = j.querySelector('#pc-p-desmarcar'); if (dm) dm.onclick = async () => {
    if (!confirm('Tirar a baixa desta parcela? Ela volta a ficar em aberto.')) return;
    fecharJanela(j); const antes = { pago: x.pago, pagoEm: x.pagoEm };
    marcarParcela(x, false, '');
    try { await q(sb.from('parcelas').update({ pago: false, data_pagamento: null }).eq('id', x.id)); const ED = ED_P(); if (ED && ED.gravou) ED.gravou('Pagamento desmarcado'); else aviso('Pagamento desmarcado.'); if (ED && ED.marcarSujo) ED.marcarSujo('parcelas', pa.id); }
    catch (e) { marcarParcela(x, antes.pago, antes.pagoEm); aviso('⚠ ' + erroAmigavel(e), true); }
  };
}

// muda a parcela na tela (e no ERP, para o Painel e os outros números) e redesenha
function marcarParcela(x, pago, pagoEm) {
  const eraPago = x.pago;
  x.pago = pago; x.pagoEm = pagoEm || '';
  if (eraPago !== pago) x.pa.pagas = Math.max(0, x.pa.pagas + (pago ? 1 : -1));
  const o = x._orig; if (o) { o.pagamento = pago ? 'SIM' : ''; o.status = pago ? 'Pago' : (x.venc <= hojeISO() ? 'Inadimplente' : 'A Vencer'); o.pagoEm = x.pagoEm; }
  const op = x.pa._orig; if (op && eraPago !== pago) { op.parcelasPagas = x.pa.pagas; op.pagasReais = x.pa.pagas; if (x.venc < hojeISO()) op.vencidas = Math.max(0, (op.vencidas || 0) + (pago ? -1 : 1)); }
  redesenharParc();
}
function redesenharParc() {
  if ($('pc-tabela')) pintarParcelamentos();
  const jp = E.pc && E.pc.janelaPa; if (jp && jp.el.isConnected && jp.el._redesenharB) jp.el._redesenharB();
}

// ── baixa (uma) — pergunta antes; a tela muda na hora; "Desfazer" no rodapé; erro → volta ──
async function baixaParcela(x) {
  const bx = await perguntarBaixa({ despesa: true, titulo: 'Pagamento da parcela — confirme', valor: x.valor, descricao: 'Parcela ' + x.n + (x.pa.tot ? ' de ' + x.pa.tot : '') + ' — ' + x.pa.empresa + (x.venc ? ' · venc. ' + dataBR(x.venc) : '') });
  if (!bx) return false;
  return gravarBaixas([x], bx);
}
async function gravarBaixas(lista, bx) {
  const antes = lista.map((x) => ({ x, pago: x.pago, pagoEm: x.pagoEm }));
  lista.forEach((x) => marcarParcela(x, true, bx.data_pagamento));
  const ED = ED_P();
  const desfazer = async () => {
    const r = await sb.from('parcelas').update({ pago: false, data_pagamento: null }).in('id', lista.map((x) => x.id));
    if (r.error) return aviso('⚠ ' + erroAmigavel(r.error), true);
    antes.forEach((a) => marcarParcela(a.x, a.pago, a.pagoEm));
    if (ED && ED.gravou) ED.gravou('Baixa desfeita'); if (ED && ED.marcarSujo) lista.forEach((x) => ED.marcarSujo('parcelas', x.pa.id));
  };
  try {
    if (lista.length === 1 && ED && ED.baixaRapida) {
      const d = await ED.baixaRapida('parcelas', lista[0].id, { semRecarregar: true, desfazer, prazoDesfazer: 8000, dados: bx });
      if (!d || !d.id) throw new Error('não gravou');
      if (d.data_pagamento && d.data_pagamento !== lista[0].pagoEm) marcarParcela(lista[0], true, d.data_pagamento);
    } else {
      await q(sb.from('parcelas').update({ pago: true, data_pagamento: bx.data_pagamento }).in('id', lista.map((x) => x.id)));
      if (ED && ED.gravou) ED.gravou('Baixa de ' + plural(lista.length, 'parcela', 'parcelas'), desfazer, 8000); else aviso('✓ ' + plural(lista.length, 'baixa gravada', 'baixas gravadas') + '.');
      if (ED && ED.marcarSujo) lista.forEach((x) => ED.marcarSujo('parcelas', x.pa.id));
    }
    return true;
  } catch (e) { antes.forEach((a) => marcarParcela(a.x, a.pago, a.pagoEm)); if (e.message !== 'não gravou') aviso('⚠ ' + erroAmigavel(e), true); return false; }
}
// ── ações em lote (sempre com confirmação) ──
function lotesParcelas() {
  if (!pode('juridico', 'editar')) return null;
  return [{ rot: 'Dar baixa', icone: 'check', quando: (x) => !x.pago, fn: async (l) => {
      const soma = l.reduce((s, x) => s + x.valor, 0);
      const bx = await perguntarBaixa({ despesa: true, titulo: 'Pagamento de ' + plural(l.length, 'parcela', 'parcelas') + ' — confirme', valor: soma,
        descricao: l.slice(0, 6).map((x) => x.pa.empresa + ' · parcela ' + x.n + (x.pa.tot ? '/' + x.pa.tot : '')).join(' · ') + (l.length > 6 ? ' · … e mais ' + (l.length - 6) : '') });
      if (!bx) return false;
      return gravarBaixas(l, bx);
    } },
    { rot: 'Marcar guias como emitidas', icone: 'documento', quando: paraEmitirP, fn: async (l) => {
      if (!confirm('Marcar ' + plural(l.length, 'guia', 'guias') + ' como emitida(s)?\n\nUse quando os PDFs já foram gerados no e-CAC/Regularize/SIARE. Nenhum e-mail é enviado por aqui.')) return false;
      const h = hojeISO(); l.forEach((x) => { x.emitida = h; if (x._orig) { x._orig.emitidaIso = h; x._orig.emitidaEm = dataBR(h); x._orig.emissao = 'SIM'; } }); redesenharParc();
      try {
        for (const x of l) await q(sb.rpc('registrar_emissao', { p_tabela: 'parcelas', p_id: x.id, p_emitida: true, p_doc: null, p_enviar: false }));
        const ED = ED_P(); if (ED && ED.gravou) ED.gravou(plural(l.length, 'guia marcada', 'guias marcadas') + ' como emitida(s)'); else aviso('✓ Guias marcadas.');
        if (ED && ED.marcarSujo) l.forEach((x) => ED.marcarSujo('parcelas', x.pa.id));
        return true;
      } catch (e) { l.forEach((x) => { x.emitida = ''; if (x._orig) { x._orig.emitidaIso = ''; x._orig.emitidaEm = ''; } }); redesenharParc(); aviso('⚠ Não foi possível marcar: ' + erroAmigavel(e), true); return false; }
    } }];
}
// botões dentro das linhas (Baixa e Emitir) — um ouvinte para a tela e as janelas
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-pc-baixa]'), em = ev.target.closest('[data-pc-emitir]');
  if (!b && !em) return;
  ev.stopPropagation(); ev.preventDefault();
  const id = (b || em).dataset[b ? 'pcBaixa' : 'pcEmitir'];
  const jp = E.pc && E.pc.janelaPa, PA = (E.pc && E.pc.PA) || [];
  const x = (jp && jp.todas.find((y) => y.id === id)) || [].concat(...PA.map((pa) => pa.parcelas)).find((y) => y.id === id);
  if (!x) return;
  const janela = (b || em).closest('.fundo'); if (janela && !janela.classList.contains('pc-janela') && !janela.querySelector('#pc-j-parcelas')) fecharJanela(janela);
  if (b) return baixaParcela(x);
  // Emitir: a janela de emissão do sistema (valor da guia, PDF, enviar ao cliente)
  // (a janela de emissão grava, envia ou desfaz e depois recarrega o ERP — a tela se redesenha sozinha com o dado novo)
  if (typeof emitirParcela === 'function') emitirParcela('parcelas', x.id);
}, true);
