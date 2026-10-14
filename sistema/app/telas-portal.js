// ═══════════════════════════════════════════════════════════════════
// Backup 81 — PORTAL DO CLIENTE NOVO (aprovado no ambiente de teste: A3, F4, M10)
// O cliente entra e vê só o grupo dele: Início, Processos, Parcelamentos, Acordos, Execuções, Contratos,
// Financeiro (Jurídico | Contabilidade) e Documentos. Só para consultar; guias e documentos para baixar.
// Os dados vêm de portal_cliente(p_grupo) (security definer, sem campos internos). O escritório escolhe por grupo
// o que aparece (grupos.portal_ve → salvar_portal_ve). A equipe abre a mesma tela como prévia ("Ver como o cliente vê").
// ═══════════════════════════════════════════════════════════════════
const ABAS_PORTAL = [['inicio', 'Início'], ['processos', 'Processos'], ['parcelamentos', 'Parcelamentos'], ['acordos', 'Acordos'], ['execucoes', 'Execuções'],
  ['contratos', 'Contratos'], ['financeiro', 'Financeiro'], ['documentos', 'Documentos']];
const TILES_PORTAL = { processos: 'Os processos das suas empresas e a última movimentação', parcelamentos: 'Cada parcelamento, o que vence e as guias',
  acordos: 'Os acordos com terceiros e as parcelas', execucoes: 'Cobranças na Justiça e o que já entrou', contratos: 'Os contratos com o escritório',
  financeiro: 'Honorários do jurídico e da contabilidade', documentos: 'Guias, recibos e arquivos para baixar' };
const ehClientePortal = () => !window.AC_SESSION || window.AC_SESSION.nivel === 'cliente';
// abre o portal na prévia da equipe, já no grupo pedido (ficha do cliente, Ctrl+K)
function verComoCliente(grupoId) { E.pt = Object.assign(E.pt || {}, { grupo: grupoId || (E.pt && E.pt.grupo) || '', aba: 'inicio', dados: null }); irParaTela('portal'); }

TELAS.portal = async function () {
  const el = $('conteudo'), cli = ehClientePortal();
  E.pt = E.pt || { grupo: '', aba: 'inicio', fin: 'escritorio', aberto: {} };
  E.pt.aberto = E.pt.aberto || {};
  if (!cli && !E.pt.grupos) {
    const { data, error } = await sb.from('grupos').select('id,nome').order('nome');
    if (error) { el.innerHTML = vazioB({ icone: 'alerta', titulo: 'Não deu para abrir a prévia', frase: erroAmigavel(error) }); return; }
    E.pt.grupos = data || [];
  }
  if (!cli && !E.pt.grupo && E.pt.grupos.length) E.pt.grupo = E.pt.grupos[0].id;
  el.innerHTML = '<div class="carregando">Carregando…</div>';
  const { data, error } = await sb.rpc('portal_cliente', { p_grupo: E.pt.grupo || null });
  if (!el.isConnected) return;
  if (error) { el.innerHTML = vazioB({ icone: 'alerta', titulo: 'Não deu para abrir o portal', frase: erroAmigavel(error) }); return; }
  E.pt.dados = data || {};
  pintarPortal();
};
TELAS.portal.semCadastros = true;

function vePortal() {   // o que o grupo vê (se o cliente tem mais de um grupo, junta)
  const G = (E.pt.dados && E.pt.dados.grupos) || [];
  return new Set(['inicio'].concat(...G.map((g) => g.ve || [])));
}
function pintarPortal() {
  const el = $('conteudo'); if (!el) return;
  const D = E.pt.dados || {}, cli = ehClientePortal(), ve = vePortal(), G = D.grupos || [], emp = D.clientes || [];
  if (!ve.has(E.pt.aba)) E.pt.aba = 'inicio';
  const nome = G.length === 1 ? G[0].nome : (cli ? ((window.AC_SESSION || {}).nome || 'cliente') : '—');
  let topo = '';
  if (!cli) {
    const g0 = (E.pt.grupos || []).find((g) => g.id === E.pt.grupo), podeEd = pode('clientes', 'editar');
    topo = '<div class="pt-previa" id="pt-previa">' + iconeB('olho') + '<span>Prévia do portal. Grupo:</span><select class="ctl" id="pt-grupo">' +
      (E.pt.grupos || []).map((g) => '<option value="' + esc(g.id) + '"' + (g.id === E.pt.grupo ? ' selected' : '') + '>' + esc(g.nome) + '</option>').join('') + '</select>' +
      '<span class="pt-vis-rot">O que este grupo vê:</span><span class="b-chips" id="pt-vis">' + ABAS_PORTAL.slice(1).map((a) => '<button type="button" class="b-chip" data-pt-ve="' + a[0] + '" aria-pressed="' + ve.has(a[0]) + '"' + (podeEd ? '' : ' disabled title="Só quem edita clientes muda"') + '>' + esc(a[1]) + '</button>').join('') + '</span>' +
      (g0 ? '' : '') + '</div>';
  }
  el.innerHTML = topo + '<div class="pt-portal" id="pt-portal"><div class="pt-topo"><div><b>Araújo &amp; Castro</b><small>Portal do cliente</small></div>' +
    '<div class="pt-eu"><b>' + esc(nome) + '</b><small>' + plural(emp.length, 'empresa', 'empresas') + '</small></div></div>' +
    '<div class="b-seg pt-abas" id="pt-abas" role="tablist">' + ABAS_PORTAL.filter((a) => ve.has(a[0])).map((a) => '<button type="button" role="tab" class="b-seg-bt" data-pt="' + a[0] + '" aria-selected="' + (a[0] === E.pt.aba) + '">' + esc(a[1]) + '</button>').join('') + '</div>' +
    '<div id="pt-corpo" class="pt-corpo"></div></div>';
  if (!cli) {
    $('pt-grupo').onchange = (ev) => { E.pt.grupo = ev.target.value; E.pt.aba = 'inicio'; E.pt.aberto = {}; TELAS.portal(); };
    $('pt-vis').onclick = async (ev) => {
      const b = ev.target.closest('[data-pt-ve]'); if (!b || b.disabled) return;
      const g = (E.pt.dados.grupos || [])[0]; if (!g) return;
      const L = new Set(g.ve || []); if (L.has(b.dataset.ptVe)) L.delete(b.dataset.ptVe); else L.add(b.dataset.ptVe);
      const { error } = await sb.rpc('salvar_portal_ve', { p_grupo: g.id, p_ve: [...L] });
      if (error) { aviso(erroAmigavel(error), true); return; }
      aviso('Pronto: o portal deste grupo foi atualizado.'); TELAS.portal();
    };
  }
  $('pt-abas').onclick = (ev) => { const b = ev.target.closest('[data-pt]'); if (b) { E.pt.aba = b.dataset.pt; pintarPortal(); } };
  pintarAbaPortal($('pt-corpo'));
}

const isoPt = (d) => String(d || '').slice(0, 10);
const diasPt = (iso) => (iso ? Math.round((new Date(iso + 'T00:00:00') - new Date(hojeISO() + 'T00:00:00')) / 864e5) : null);
function prazoPt(venc, pago, pagoEm) {
  if (pago) return '<span class="b-ok-txt">✓ ' + (pagoEm ? 'Pago em ' + dataBR(pagoEm).slice(0, 5) : 'Pago') + '</span>';
  const d = diasPt(isoPt(venc)); if (d === null) return '—';
  return '<span class="' + (d <= 0 ? 'b-pz-r' : d < 3 ? 'b-pz-a' : d < 10 ? 'b-pz-b' : 'b-pz-g') + '">' + (d < 0 ? Math.abs(d) + ' d atraso' : d === 0 ? 'vence hoje' : d + (d === 1 ? ' dia' : ' dias')) + '</span>';
}
const vencidaPt = (x) => !x.pago && x.vencimento && isoPt(x.vencimento) <= hojeISO();
const baixarPt = (caminho, rot) => '<button type="button" class="b-bt-emitir pt-baixar" data-pt-baixar="' + esc(caminho) + '">' + esc(rot || 'Baixar') + '</button>';
const pillPt = (atr, conc) => conc ? '<span class="b-pill b-g">Concluído</span>' : atr ? '<span class="b-pill b-r">' + plural(atr, 'parcela', 'parcelas') + ' em atraso</span>' : '<span class="b-pill b-g">Em dia</span>';

function pintarAbaPortal(el) {
  const D = E.pt.dados || {}, aba = E.pt.aba, ve = vePortal();
  if (aba === 'inicio') {
    const atr = (D.parcelamentos || []).reduce((s, pa) => s + (pa.parcelas || []).filter(vencidaPt).length, 0) + (D.acordos || []).filter(vencidaPt).length;
    el.innerHTML = '<div class="pt-intro"><h2>Bem-vindo ao seu portal</h2><p>Aqui você acompanha, a qualquer hora, tudo o que o escritório cuida para as suas empresas. É só para consultar: nada do que você clicar muda os seus dados.</p></div>' +
      '<div class="pt-situacao ' + (atr ? 'pt-sit-atr' : 'pt-sit-ok') + '">' + (atr ? plural(atr, 'parcela em atraso', 'parcelas em atraso') + '. Fale com o escritório.' : 'Tudo em dia: nenhuma parcela em atraso.') + '</div>' +
      '<div class="pt-tiles">' + ABAS_PORTAL.slice(1).filter((a) => ve.has(a[0])).map((a) => '<button type="button" class="pt-tile" data-pt-ir="' + a[0] + '"><b>' + esc(a[1]) + '</b><span>' + esc(TILES_PORTAL[a[0]]) + '</span></button>').join('') + '</div>' +
      '<p class="pt-contato">Alguma dúvida? Fale com o escritório pelo seu contato de sempre (WhatsApp ou e-mail) — nossa equipe responde.</p>';
  } else if (aba === 'processos') {
    const P = D.processos || [];
    el.innerHTML = '<div id="pt-proc"></div>';
    tabelaB($('pt-proc'), { id: 'pt-proc', linhas: P, chave: (p) => p.id, unidade: ['processo', 'processos'], dicaBusca: 'Número, autor ou réu',
      busca: (p) => [p.numero, p.autor, p.reu, p.natureza, p.competencia].join(' '), ord: { k: 'mov', dir: -1 },
      colunas: [{ k: 'n', rot: 'Processo', html: (p) => '<span class="b-num">' + esc(p.numero) + '</span>' + (p.competencia ? '<small class="b-sub">' + esc(p.competencia) + '</small>' : ''), ord: (p) => p.numero },
        { k: 'nat', rot: 'Natureza', html: (p) => esc(p.natureza || '—'), ord: (p) => p.natureza },
        { k: 'partes', rot: 'Autor × Réu', html: (p) => esc(p.autor || '—') + '<small class="b-sub">' + esc(p.reu || '') + '</small>', ord: (p) => p.autor },
        { k: 'mov', rot: 'Última movimentação', html: (p) => (p.ultima_movimentacao ? esc(p.ultima_movimentacao) : '—') + (p.ultima_movimentacao_em ? '<small class="b-sub">' + dataBR(p.ultima_movimentacao_em) + '</small>' : ''), ord: (p) => p.ultima_movimentacao_em || '' },
        { k: 'st', rot: 'Situação', cls: 'b-cen', html: (p) => esc(p.status || '—'), ord: (p) => p.status }],
      vazio: { titulo: 'Nenhum processo', frase: 'Quando o escritório cadastrar um processo das suas empresas, ele aparece aqui.' } });
  } else if (aba === 'parcelamentos') {
    cartoesPortal(el, 'pa', (D.parcelamentos || []).map((pa) => {
      // parcela sem valor lançado herda o último lançado (ou o valor da última parcela) — igual ao ERP (erp-dados)
      let ult = null; const ps = (pa.parcelas || []).map((x) => { if (+x.valor > 0) ult = +x.valor; return Object.assign({}, x, { valor: ult != null ? ult : +pa.valor_ultima_parcela || 0 }); });
      const pagas = ps.filter((x) => x.pago).length, tot = pa.total_parcelas || ps.length, atr = ps.filter(vencidaPt).length;
      const falta = ps.filter((x) => !x.pago).reduce((s, x) => s + (+x.valor || 0), 0), mes = hojeISO().slice(0, 7), doMes = ps.filter((x) => !x.pago && isoPt(x.vencimento).slice(0, 7) <= mes);
      return { id: pa.id, nome: pa.natureza || 'Parcelamento', pill: pillPt(atr, tot && pagas >= tot), sub: [pa.local, pa.numero ? 'nº ' + pa.numero : '', pa.empresa].filter(Boolean).map(esc).join(' · '),
        pc: tot ? pagas / tot * 100 : 0, prog: pagas + ' de ' + tot + ' pagas', lin: [['Falta pagar', brl(falta)], ['A pagar este mês', doMes.length ? brl(doMes.reduce((s, x) => s + (+x.valor || 0), 0)) + ' (' + doMes.length + ')' : '—']],
        det: (det) => tabParcelasPortal(det, 'pt-pa-' + pa.id, ps.map((x) => Object.assign({ tot, cliEmite: pa.emitimos_guia === false }, x)), 'Guia') };
    }), 'Nenhum parcelamento');
  } else if (aba === 'acordos') {
    const G = {};
    (D.acordos || []).forEach((a) => { const k = (a.processo || '') + '|' + (a.credor || ''); (G[k] = G[k] || []).push(a); });
    cartoesPortal(el, 'ac', Object.entries(G).map(([k, L]) => {
      const pagas = L.filter((x) => x.pago).length, tot = Math.max(L.length, +L[0].total_parcelas || 0), atr = L.filter(vencidaPt).length, a = L[0];
      return { id: k, nome: 'Acordo com ' + (a.credor || '—'), pill: pillPt(atr, pagas >= tot), sub: [a.processo ? 'processo ' + a.processo : '', a.devedor].filter(Boolean).map(esc).join(' · '),
        pc: tot ? pagas / tot * 100 : 0, prog: pagas + ' de ' + tot + ' pagas', lin: [['Falta pagar', brl(L.filter((x) => !x.pago).reduce((s, x) => s + (+x.valor || 0), 0))], ['Forma de pagamento', a.forma === 'pix' ? 'PIX' : 'Boleto']],
        det: (det) => tabParcelasPortal(det, 'pt-ac-' + k, L.map((x) => Object.assign({ numero: x.parcela, tot }, x)), a.forma === 'pix' ? 'PIX' : 'Boleto') };
    }), 'Nenhum acordo');
  } else if (aba === 'execucoes') {
    cartoesPortal(el, 'ex', (D.execucoes || []).map((x) => {
      const R = x.recebimentos || [], r = R.reduce((s, y) => s + (+y.valor || 0), 0), v = +x.valor_execucao || 0;
      return { id: x.id, nome: x.executado || 'Execução', pill: '<span class="b-pill ' + (/andamento/i.test(x.situacao || '') ? 'b-b' : 'b-g') + '">' + esc(x.situacao || '—') + '</span>', sub: x.numero ? 'processo ' + esc(x.numero) : '',
        pc: v ? Math.min(100, r / v * 100) : 0, prog: (v ? Math.round(r / v * 100) : 0) + '% já recebido', lin: [['Valor cobrado', brl(v)], ['Já recebido', '<span class="b-ok-txt">' + brl(r) + '</span>']],
        det: (det) => { det.innerHTML = '<div id="pt-exr-' + esc(x.id) + '"></div>'; tabelaB(det.firstChild, { id: 'pt-exr-' + x.id, linhas: R, unidade: ['recebimento', 'recebimentos'], ord: { k: 'd', dir: -1 }, valor: (y) => +y.valor || 0,
          colunas: [{ k: 'd', rot: 'Data', cls: 'b-cen b-data', html: (y) => dataBR(y.data), ord: (y) => y.data }, { k: 'v', rot: 'Valor recebido', cls: 'b-dir b-val', soma: true, html: (y) => brl(+y.valor || 0), ord: (y) => +y.valor || 0 }],
          vazio: { titulo: 'Nada recebido ainda', frase: 'Assim que entrar algum valor, ele aparece aqui.' } }); } };
    }), 'Nenhuma execução');
  } else if (aba === 'contratos') {
    el.innerHTML = '<div id="pt-ct"></div>';
    tabelaB($('pt-ct'), { id: 'pt-ct', linhas: D.contratos || [], unidade: ['contrato', 'contratos'], ord: { k: 'ini', dir: -1 }, busca: (c) => c.descricao + ' ' + c.cliente,
      colunas: [{ k: 'd', rot: 'Contrato', html: (c) => esc(c.descricao || '—') + '<small class="b-sub">' + esc(c.cliente || '') + '</small>', ord: (c) => c.descricao },
        { k: 'mod', rot: 'Tipo', html: (c) => esc(c.modalidade || '—'), ord: (c) => c.modalidade },
        { k: 'ini', rot: 'Desde', cls: 'b-cen b-data', html: (c) => (c.inicio ? dataBR(c.inicio) : '—'), ord: (c) => c.inicio || '' },
        { k: 'v', rot: 'Valor', cls: 'b-dir b-val', html: (c) => (c.valor_mensal ? brl(+c.valor_mensal) + '<small class="b-sub">por mês</small>' : c.valor_total ? brl(+c.valor_total) : '—'), ord: (c) => +(c.valor_mensal || c.valor_total || 0) },
        { k: 'st', rot: 'Situação', cls: 'b-cen', html: (c) => '<span class="b-pill ' + (/ativo|vigente|assinado/i.test(c.status || '') ? 'b-g' : 'b-a') + '">' + esc(c.status || '—') + '</span>', ord: (c) => c.status }],
      vazio: { titulo: 'Nenhum contrato', frase: 'Os contratos com o escritório aparecem aqui.' } });
  } else if (aba === 'financeiro') {
    const emp = E.pt.fin || 'escritorio';
    el.innerHTML = '<div class="b-seg" id="pt-fin-emp" role="tablist">' + [['escritorio', 'Jurídico (advocacia)'], ['contabilidade', 'Contabilidade']].map((x) => '<button type="button" role="tab" class="b-seg-bt" data-emp="' + x[0] + '" aria-selected="' + (x[0] === emp) + '">' + x[1] + '</button>').join('') + '</div><div id="pt-fin"></div>';
    $('pt-fin-emp').onclick = (ev) => { const b = ev.target.closest('[data-emp]'); if (b) { E.pt.fin = b.dataset.emp; pintarAbaPortal(el); } };
    tabelaB($('pt-fin'), { id: 'pt-fin-' + emp, linhas: (D.financeiro || []).filter((l) => (l.empresa || 'escritorio') === emp), unidade: ['honorário', 'honorários'],
      abas: [{ id: 'ab', rot: 'A pagar', f: (l) => !l.pago }, { id: 'pg', rot: 'Pagos', f: (l) => !!l.pago }], ordAbas: { pg: { k: 'venc', dir: -1 } }, ord: { k: 'venc', dir: 1 },
      venc: (l) => isoPt(l.vencimento), valor: (l) => +l.valor || 0, linhaCls: (l) => (vencidaPt(l) ? ' b-tr-venc' : ''), busca: (l) => l.descricao,
      colunas: [{ k: 'd', rot: 'Descrição', html: (l) => esc(l.descricao || '—'), ord: (l) => l.descricao },
        { k: 'v', rot: 'Valor', cls: 'b-dir b-val', soma: true, html: (l) => brl(+l.valor || 0), ord: (l) => +l.valor || 0 },
        { k: 'venc', rot: 'Vencimento', cls: 'b-cen b-data', html: (l) => (l.vencimento ? dataBR(isoPt(l.vencimento)) : '—'), ord: (l) => isoPt(l.vencimento) || '9' },
        { k: 'pz', rot: 'Situação', cls: 'b-cen b-prazo', html: (l) => prazoPt(l.vencimento, l.pago, l.data_pagamento), ord: false }],
      vazio: { titulo: 'Nada aqui', frase: 'Não há honorários nesta aba.' } });
  } else if (aba === 'documentos') {
    el.innerHTML = '<div id="pt-docs"></div>';
    tabelaB($('pt-docs'), { id: 'pt-docs', linhas: D.documentos || [], unidade: ['documento', 'documentos'], ord: { k: 'em', dir: -1 }, busca: (d) => d.nome + ' ' + d.tipo, dicaBusca: 'Nome do documento',
      colunas: [{ k: 'n', rot: 'Documento', html: (d) => esc(d.nome || '—'), ord: (d) => d.nome }, { k: 't', rot: 'Tipo', html: (d) => esc(d.tipo || '—'), ord: (d) => d.tipo },
        { k: 'em', rot: 'Enviado em', cls: 'b-cen b-data', html: (d) => dataBR(isoPt(d.criado_em)), ord: (d) => d.criado_em },
        { k: 'val', rot: 'Vale até', cls: 'b-cen b-data', html: (d) => (d.validade ? dataBR(d.validade) : '—'), ord: (d) => d.validade || '' },
        { k: 'b', rot: '', cls: 'b-dir b-c-acoes', html: (d) => (d.caminho ? baixarPt(d.caminho) : ''), ord: false }],
      vazio: { titulo: 'Nenhum documento', frase: 'Guias, recibos e arquivos que o escritório liberar aparecem aqui.' } });
  }
  el.onclick = async (ev) => {
    const t = ev.target.closest('[data-pt-ir]'); if (t) { E.pt.aba = t.dataset.ptIr; pintarPortal(); return; }
    const b = ev.target.closest('[data-pt-baixar]'); if (!b) return;
    ev.stopPropagation();
    const { data, error } = await sb.storage.from('documentos').createSignedUrl(b.dataset.ptBaixar, 300);
    if (error || !data) { aviso('Não deu para baixar agora: ' + erroAmigavel(error || {}), true); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  };
}
// um cartão por parcelamento / acordo / execução — clicou, abre logo abaixo (como na tela do escritório)
function cartoesPortal(el, tipo, itens, vazio) {
  if (!itens.length) { el.innerHTML = '<div class="b-quadro b-cg-det">' + vazioB({ icone: 'ok', titulo: vazio, frase: 'Quando houver, aparece aqui.' }) + '</div>'; return; }
  if (itens.length === 1 && E.pt.aberto[tipo] === undefined) E.pt.aberto[tipo] = itens[0].id;
  let h = '';
  itens.forEach((g) => {
    const ab = E.pt.aberto[tipo] === g.id;
    h += '<button type="button" class="b-cg" data-pt-cg="' + esc(g.id) + '" aria-expanded="' + ab + '"><div class="b-cg-hd"><b>' + esc(g.nome) + '</b>' + g.pill + '</div>' +
      (g.sub ? '<div class="b-cg-sub">' + g.sub + '</div>' : '') + '<div class="b-barra"><span style="width:' + Math.round(g.pc) + '%"></span></div><small class="b-cg-prog">' + esc(g.prog) + '</small>' +
      g.lin.map((l) => '<div class="b-cg-lin"><span>' + esc(l[0]) + '</span><b>' + l[1] + '</b></div>').join('') + '</button>';
    if (ab) h += '<div class="b-cg-det" id="pt-det-' + tipo + '"></div>';
  });
  el.innerHTML = '<div class="b-cards" id="pt-cards-' + tipo + '">' + h + '</div>';
  const g = itens.find((x) => x.id === E.pt.aberto[tipo]); if (g) g.det($('pt-det-' + tipo));
  $('pt-cards-' + tipo).addEventListener('click', (ev) => { const c = ev.target.closest('[data-pt-cg]'); if (!c || ev.target.closest('.b-cg-det')) return; E.pt.aberto[tipo] = E.pt.aberto[tipo] === c.dataset.ptCg ? '' : c.dataset.ptCg; cartoesPortal(el, tipo, itens, vazio); });
}
function tabParcelasPortal(det, id, L, rotGuia) {
  tabelaB(det, { id, linhas: L, unidade: ['parcela', 'parcelas'], ord: { k: 'n', dir: 1 }, ordAbas: { pg: { k: 'n', dir: -1 } },
    abas: [{ id: 'ab', rot: 'A pagar', f: (x) => !x.pago }, { id: 'pg', rot: 'Pagas', f: (x) => !!x.pago }, { id: 'todas', rot: 'Todas', f: () => true }],
    valor: (x) => +x.valor || 0, linhaCls: (x) => (vencidaPt(x) ? ' b-tr-venc' : ''),
    colunas: [{ k: 'n', rot: 'Parcela', cls: 'b-cen', html: (x) => esc(x.numero || '—') + (x.tot ? ' de ' + x.tot : ''), ord: (x) => +x.numero || 0 },
      { k: 'v', rot: 'Valor', cls: 'b-dir b-val', soma: true, html: (x) => brl(+x.valor || 0), ord: (x) => +x.valor || 0 },
      { k: 'venc', rot: 'Vencimento', cls: 'b-cen b-data', html: (x) => (x.vencimento ? dataBR(isoPt(x.vencimento)) : '—'), ord: (x) => isoPt(x.vencimento) || '9' },
      { k: 'pz', rot: 'Prazo', cls: 'b-cen b-prazo', html: (x) => prazoPt(x.vencimento, x.pago, x.data_pagamento), ord: false },
      { k: 'g', rot: rotGuia, cls: 'b-dir b-c-acoes', ord: false, html: (x) => (x.pago ? '' : x.cliEmite ? '<span class="b-mudo">você emite</span>' : x.guia ? baixarPt(x.guia, 'Baixar') : x.emitida ? '<span class="b-mudo">enviada por e-mail</span>' : diasPt(isoPt(x.vencimento)) <= 30 ? '<span class="b-mudo">em preparo</span>' : '<span class="b-mudo">—</span>') }],
    vazio: { titulo: 'Nenhuma parcela aqui', frase: 'Troque a aba acima.' } });
}
