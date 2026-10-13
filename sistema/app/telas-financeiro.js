'use strict';
// ═══════════════════════════════════════════════════════════════════
// FINANCEIRO — Jurídico (empresa 'escritorio') e Contabilidade (empresa 'contabilidade').
// Backup 76 (S1 + L1): a tela inteira nas peças novas, lendo direto do banco (sem o ERP antigo):
//  · Análise: Quem fez · Período · Tipo · Grupo → faixa de números, mês a mês, comparativo por pessoa, serviço, grupos (e despesas por categoria);
//  · Lançamentos: UMA tabela com os botões A receber · Recebido · Perdas (+ A pagar · Pago quando há despesas), atalhos de prazo, busca e
//    "Filtros" num painel só (quem, grupo, tipo, área, referência, favorecido, vencimento/pagamento de-até, valor);
//  · Contabilidade também: Caixa (consolidado ou mês a mês) e Distribuição de lucros (Pedro × Éder, 50/50).
// Nada saiu do antigo: baixa (com confirmação), baixa de várias, Cobrar (WhatsApp/e-mail) uma ou várias, desfazer, detalhe com ✎ Editar,
// os avisos "vencidos" e "prejuízo", o Recibo e os mesmos números da Análise.
// ═══════════════════════════════════════════════════════════════════

const EMPRESAS = {
  escritorio:    { tela: 'juridico', titulo: 'Financeiro jurídico', frase: 'Honorários do escritório: receber, dar baixa e acompanhar.',
                   abas: [['analise', 'Análise'], ['lanc', 'Lançamentos']] },
  contabilidade: { tela: 'contabilidade', titulo: 'Financeiro da contabilidade', frase: 'A receber, a pagar, caixa e distribuição de lucros da contabilidade.',
                   abas: [['analise', 'Análise'], ['lanc', 'Lançamentos'], ['caixa', 'Caixa'], ['lucros', 'Distribuição de lucros']] }
};
const SOCIOS_LUCRO = ['Pedro', 'Éder'];
const PERIODOS_FIN = [['mes', 'Este mês'], ['mesant', 'Mês passado'], ['ano', 'Este ano'], ['anoant', 'Ano passado'], ['12m', '12 meses'], ['todos', 'Tudo']];

function estadoFin(empresa) {
  E.fin = E.fin || {};
  if (!E.fin[empresa]) E.fin[empresa] = { aba: 'analise', an: { quem: [], preset: 'ano', de: '', ate: '', tipo: '', grupo: '' }, caixa: 'consolidado', dados: null, lidoEm: 0 };
  return E.fin[empresa];
}

TELAS.juridico = () => telaHonorarios('escritorio');
TELAS.contabilidade = () => telaHonorarios('contabilidade');

// ── classe do lançamento (a mesma regra do ERP antigo): redutor/dedução = receita negativa; estorno = despesa negativa ──
function classeLanc(l) {
  const deducao = !!l.redutor || (l.tipo === 'despesa' && !l.favorecido && !!l.grupo_id);
  const estorno = l.tipo === 'receita' && !l.redutor && !!l.favorecido && !l.grupo_id;
  const rec = (l.tipo === 'receita' && !estorno) || deducao;
  return rec ? (l.perda ? 'perda' : l.pago ? 'recebido' : 'areceber') : (l.pago ? 'pago' : 'apagar');
}
const sinalLanc = (l) => { const deducao = !!l.redutor || (l.tipo === 'despesa' && !l.favorecido && !!l.grupo_id); const estorno = l.tipo === 'receita' && !l.redutor && !!l.favorecido && !l.grupo_id; return deducao || estorno ? -1 : 1; };
const valorLanc = (l) => sinalLanc(l) * (Number(l.valor) || 0);
const quemLanc = (l) => (l.responsavel || '').trim() || 'Sem pessoa';
const nomeLanc = (l) => (l.grupos && l.grupos.nome) || l.favorecido || (l.clientes && l.clientes.nome) || '';
const dataLanc = (l) => l.data_pagamento || l.vencimento || '';   // a mesma data do antigo: pagamento, ou vencimento quando não pago

// Dados: dentro do ERP, os lançamentos que o ERP já carregou (window.ERP_LANC — ficam sempre em dia quando algo é gravado em qualquer tela);
// no Gestão avulso, lidos do banco. "forcar" = gravou agora: no ERP relê só o financeiro; fora dele, relê do banco.
const MOD_FIN = { escritorio: 'financeiro', contabilidade: 'financeiroContab' };
async function dadosFin(empresa, forcar) {
  const F = estadoFin(empresa), D = dbParc(), noERP = D && window.ERP_LANC;
  if (noERP) {
    if (forcar && typeof window.ERP_RECARREGAR_MODULOS === 'function') { await window.ERP_RECARREGAR_MODULOS(MOD_FIN[empresa]); }
    const nomeCli = {}; (E.clientes || []).forEach((c) => { nomeCli[c.id] = c.nome; });
    F.dados = Object.values(window.ERP_LANC).filter((l) => l.empresa === empresa)
      .map((l) => Object.assign({}, l, { clientes: l.clientes || (l.cliente_id && nomeCli[l.cliente_id] ? { nome: nomeCli[l.cliente_id] } : null) }))
      .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)) || String(a.id).localeCompare(String(b.id)));
  } else if (forcar || !F.dados || Date.now() - F.lidoEm > 20000) {
    F.dados = await buscarTodos(() => sb.from('lancamentos').select('*, grupos(nome), clientes(nome), contratos(descricao)').eq('empresa', empresa).order('vencimento').order('id'));
    F.lidoEm = Date.now();
  }
  F.dados.forEach((l) => { l._c = classeLanc(l); });
  return F.dados;
}

async function telaHonorarios(empresa, forcar) {
  const F = estadoFin(empresa), info = EMPRESAS[empresa], c = $('conteudo');
  if (!c.querySelector('#fin-raiz[data-emp="' + empresa + '"]')) {
    c.innerHTML = '<div id="fin-raiz" data-emp="' + empresa + '">' +
      cabecalhoTela({ icone: 'financeiro', titulo: info.titulo, frase: info.frase }) +
      '<div class="b-fin-topo"><div class="b-seg" role="tablist" id="fin-abas">' + info.abas.map((a) => '<button type="button" role="tab" class="b-seg-bt" data-aba="' + a[0] + '">' + a[1] + '</button>').join('') + '</div>' +
      '<div class="b-fin-avisos" id="fin-avisos"></div><span class="b-barra-dir">' +
      '<button type="button" class="b-bt-f" id="fin-recibo" title="Gerar um recibo na Central de Documentos">' + iconeB('recibo') + 'Recibo</button>' +
      (pode(empresa === 'contabilidade' ? 'financeiro_contab' : 'financeiro_juridico', 'editar') ? '<button type="button" class="b-bt-f" data-novo-l="despesa">' + iconeB('mais') + 'Despesa</button>' +
        '<button type="button" class="btn btn-p b-bt" data-novo-l="receita">' + iconeB('mais') + 'Receita</button>' : '') + '</span></div>' +
      '<div id="fin-corpo"><div class="carregando">Carregando…</div></div></div>';
    c.querySelectorAll('[data-novo-l]').forEach((b) => b.onclick = () =>
      formLancamento({ tipo: b.dataset.novoL, empresa, grupo_id: F.an.grupo || null }, () => telaHonorarios(empresa, true)));
    c.querySelector('#fin-abas').onclick = (ev) => { const b = ev.target.closest('[data-aba]'); if (!b) return; F.aba = b.dataset.aba; pintarFin(empresa); };
    c.querySelector('#fin-recibo').onclick = () => abrirGerador('modelo=recibo');
    c.querySelector('#fin-avisos').onclick = (ev) => { const b = ev.target.closest('[data-fin-ir]'); if (!b) return;
      F.aba = 'lanc'; E.tabB = E.tabB || {}; const st = E.tabB['fin-' + empresa] = E.tabB['fin-' + empresa] || {};
      if (b.dataset.finIr === 'venc') { st.aba = 'areceber'; st.prazo = 'venc'; } else { st.aba = 'perda'; st.prazo = ''; }
      pintarFin(empresa); };
  }
  try { await dadosFin(empresa, forcar); } catch (e) { $('fin-corpo').innerHTML = '<div class="card"><div class="card-bd msg-erro">' + esc(erroAmigavel(e)) + '</div></div>'; return; }
  pintarFin(empresa);
}
// compatibilidade: quem chamava pintarFin/pintarLista depois de gravar
function recarregarFin(empresa) { return telaHonorarios(empresa, true); }

function pintarFin(empresa) {
  const F = estadoFin(empresa), L = F.dados || [], corpo = $('fin-corpo'); if (!corpo) return;
  if (!EMPRESAS[empresa].abas.some((a) => a[0] === F.aba)) F.aba = 'analise';
  document.querySelectorAll('#fin-abas [data-aba]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.aba === F.aba)));
  // avisos (os do topo do antigo): honorários vencidos e prejuízo — clicar leva à lista
  const h = hojeISO(), venc = L.filter((l) => l._c === 'areceber' && l.vencimento && l.vencimento < h), perdas = L.filter((l) => l._c === 'perda');
  $('fin-avisos').innerHTML = (venc.length ? '<button type="button" class="b-aviso b-aviso-r" data-fin-ir="venc">' + plural(venc.length, 'honorário vencido', 'honorários vencidos') + ' · ' + brl(soma(venc, valorLanc)) + '</button>' : '') +
    (perdas.length ? '<button type="button" class="b-aviso" data-fin-ir="perda">Prejuízo: ' + brl(soma(perdas, valorLanc)) + '</button>' : '');
  try {
    if (F.aba === 'analise') analiseFin(empresa, corpo);
    else if (F.aba === 'lanc') listaFin(empresa, corpo);
    else if (F.aba === 'caixa') caixaFin(empresa, corpo);
    else if (F.aba === 'lucros') lucrosFin(empresa, corpo);
  } catch (e) { console.error(e); corpo.innerHTML = '<div class="card"><div class="card-bd msg-erro">' + esc(erroAmigavel(e)) + '</div></div>'; }
}

// ───────────────────────────── Lançamentos (L1) ─────────────────────────────
function listaFin(empresa, corpo) {
  const F = estadoFin(empresa), L = F.dados || [], h = hojeISO();
  const temDesp = empresa === 'contabilidade' || L.some((l) => l._c === 'apagar' || l._c === 'pago');
  const abas = [{ id: 'areceber', rot: 'A receber', f: (l) => l._c === 'areceber' }, { id: 'recebido', rot: 'Recebido', f: (l) => l._c === 'recebido' }]
    .concat(temDesp ? [{ id: 'apagar', rot: 'A pagar', f: (l) => l._c === 'apagar' }, { id: 'pago', rot: 'Pago', f: (l) => l._c === 'pago' }] : [])
    .concat([{ id: 'perda', rot: 'Perdas', f: (l) => l._c === 'perda' }]);
  const porPag = (a) => a === 'recebido' || a === 'pago';
  const dataL = (l) => (l.pago ? l.data_pagamento : l.vencimento) || '';
  const opc = (f) => [...new Set(L.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((v) => [v, v]);
  const lista = (k, rot, todos, f) => { const o = opc(f); return o.length > 1 ? [{ k, rot, todos, opcoes: o, get: (l) => f(l) || '' }] : []; };
  const vS = (l) => (l._c === 'apagar' || l._c === 'pago' ? -valorLanc(l) : valorLanc(l));   // na tabela: despesa negativa
  const colunas = (aba) => {
    const C = [
      { k: 'resp', rot: 'Quem', html: (l) => pillPessoa(l.responsavel), ord: (l) => normalizar(l.responsavel || '') },
      { k: 'quem', rot: 'Grupo / Favorecido', html: (l) => esc(nomeLanc(l) || '—') + (l.clientes && l.grupos ? '<span class="b-sub">' + esc(l.clientes.nome) + '</span>' : ''), ord: (l) => normalizar(nomeLanc(l)) },
      { k: 'desc', rot: 'Descrição', html: (l) => { const lg = legendaLanc(l); return esc(l.descricao || '—') + (lg ? '<span class="b-sub">' + esc(lg) + '</span>' : ''); }, ord: (l) => normalizar(l.descricao || '') },
      { k: 'v', rot: 'Valor', cls: 'b-dir b-val', clsL: (l) => (vS(l) < 0 ? ' valor-desp' : ' valor-rec'), soma: true,
        html: (l) => (vS(l) < 0 ? '− ' : '') + brl(l.valor) + (l.redutor ? '<small>redutor</small>' : ''), ord: valorLanc },
      { k: 'venc', rot: porPag(aba) ? 'Pago em' : 'Vencimento', cls: 'b-cen b-data',
        html: (l) => { const d = dataL(l); return d ? dataBR(d) + (porPag(aba) && l.vencimento && l.vencimento !== d ? '<small>venc. ' + dataBR(l.vencimento) + '</small>' : '') : '—'; }, ord: (l) => dataL(l) || '9' }];
    if (!porPag(aba)) C.push({ k: 'pz', rot: aba === 'perda' ? 'Situação' : 'Prazo', cls: 'b-cen b-prazo', html: celPrazoL, ord: (l) => (l.pago || l.perda ? '9' : l.vencimento || '9') });
    C.push({ k: 'ac', rot: '', cls: 'b-dir b-c-acoes', html: celAcoesL, ord: false });
    return C;
  };
  const el = corpo.querySelector('#fin-tab') || (corpo.innerHTML = '<div id="fin-tab"></div>', corpo.querySelector('#fin-tab'));
  el._lancDepois = () => telaHonorarios(empresa, true);
  tabelaB(el, { id: 'fin-' + empresa, tabCls: 'b-tab-lanc', linhas: L, colunas: colunas('areceber'), colunasAba: colunas, abas, semContagemAbas: false,
    unidade: ['lançamento', 'lançamentos'], busca: (l) => [l.descricao, nomeLanc(l), l.clientes && l.clientes.nome, l.favorecido, l.categoria, l.obs, l.servico, l.referencia].join(' '),
    dicaBusca: 'Cliente, grupo, descrição…', prazos: true, prazosAbas: ['areceber', 'apagar'], venc: dataL, valor: vS,
    ord: { k: 'venc', dir: 1 }, ordAbas: { recebido: { k: 'venc', dir: -1 }, pago: { k: 'venc', dir: -1 } },
    conta: (n) => plural(n, 'lançamento', 'lançamentos'), linhaCls: (l) => (!l.pago && !l.perda && l.vencimento && l.vencimento <= h ? ' b-tr-venc' : ''),
    listas: [].concat(lista('resp', 'Quem', 'Todas as pessoas', (l) => l.responsavel), lista('grupo', 'Grupo', 'Todos os grupos', (l) => l.grupos && l.grupos.nome),
      lista('tipo', 'Tipo', 'Todos os tipos', (l) => l.categoria), lista('area', 'Área', 'Todas as áreas', (l) => l.servico),
      lista('ref', 'Referência', 'Todas as referências', (l) => l.referencia), lista('fav', 'Favorecido', 'Todos os favorecidos', (l) => l.favorecido)),
    lote: [{ rot: 'Dar baixa nas marcadas', icone: 'check', quando: (l) => !l.pago && !l.perda, fn: async (marc) => {
      const alvo = marc.filter((l) => !l.pago && !l.perda); if (!alvo.length) return false;
      const bx = await perguntarBaixa({ titulo: 'Baixa em lote — confirme a data', descricao: plural(alvo.length, 'lançamento', 'lançamentos'), valor: soma(alvo, valorLanc) });
      if (!bx) return false;
      await q(sb.from('lancamentos').update(Object.assign(bx, { cobranca: '', perda: false })).in('id', alvo.map((l) => l.id)));
      aviso('✓ Baixa de ' + plural(alvo.length, 'lançamento', 'lançamentos') + ' em ' + dataBR(bx.data_pagamento) + '.'); await el._lancDepois(); } },
    { rot: 'Cobrar as marcadas', icone: 'enviar', quando: (l) => l._c === 'areceber' && !l.redutor, fn: async (marc) => { cobrarVarios(marc.filter((l) => l._c === 'areceber' && !l.redutor)); return false; } }],
    loteBotao: true,
    clique: (l) => detalheLancamento(l.id).catch((e) => aviso(erroAmigavel(e), true)),
    vazio: { titulo: 'Nenhum lançamento aqui', frase: 'Troque o botão (A receber, Recebido…) ou limpe os filtros.' } });
  if (!el._lancLigado) {
    el._lancLigado = true;
    el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-pagar], [data-cobrar], [data-desfazer]'); if (!b || !el.contains(b)) return;
      ev.stopPropagation();
      if (b.dataset.cobrar) return cobrarWhatsApp(b.dataset.cobrar);
      if (b.dataset.desfazer) return comBotao(b, async () => { await q(sb.from('lancamentos').update({ pago: false }).eq('id', b.dataset.desfazer)); aviso('Lançamento voltou para "em aberto".'); await el._lancDepois(); });
      comBotao(b, async () => {
        const l = (F.dados || []).find((x) => x.id === b.dataset.pagar) || await q(sb.from('lancamentos').select('descricao, valor, tipo, redutor').eq('id', b.dataset.pagar).single());
        const bx = await perguntarBaixa({ descricao: l.descricao, valor: l.valor, despesa: l.tipo === 'despesa' && !l.redutor });
        if (!bx) return;
        await q(sb.from('lancamentos').update(Object.assign(bx, { cobranca: '', perda: false })).eq('id', b.dataset.pagar));
        aviso('✓ Baixa registrada em ' + dataBR(bx.data_pagamento) + '.'); await el._lancDepois();
      });
    }, true);
  }
}

// Cobrar várias de uma vez (o que a aba "Honorários" da tela antiga de Notificações fazia): um texto por cliente, com todas as parcelas dele
function cobrarVarios(lista) {
  if (!lista.length) return aviso('Nenhum honorário em aberto entre os marcados.', true);
  const porCli = {};
  lista.forEach((l) => { const k = nomeLanc(l) || 'Sem cliente'; (porCli[k] = porCli[k] || []).push(l); });
  const h = hojeISO();
  const texto = (nome, ls) => 'Olá! Tudo bem?\n\nSegue o resumo dos honorários' + (ls.some((l) => l.vencimento < h) ? ' em aberto' : ' deste período') + ' de ' + nome + ':\n\n' +
    ls.map((l) => '• ' + l.descricao + ' — ' + brl(l.valor) + ' — ' + (l.vencimento < h ? 'venceu em ' : 'vence em ') + dataBR(l.vencimento)).join('\n') +
    '\n\nTotal: ' + brl(soma(ls, valorLanc)) + '\n\nQualquer dúvida, estamos à disposição.';
  const blocos = Object.keys(porCli).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const j = abrirJanela({ titulo: 'Cobrar ' + plural(lista.length, 'honorário', 'honorários'), kick: 'Financeiro', sub: plural(blocos.length, 'cliente', 'clientes') + ' · um texto para cada', larga: true,
    corpo: blocos.map((n, i) => '<div class="b-cob-bloco"><div class="b-cob-hd"><b>' + esc(n) + '</b><span>' + plural(porCli[n].length, 'parcela', 'parcelas') + ' · ' + brl(soma(porCli[n], valorLanc)) + '</span></div>' +
      '<textarea rows="7" data-cob-txt="' + i + '">' + esc(texto(n, porCli[n])) + '</textarea>' +
      '<div class="b-cob-acoes"><button type="button" class="b-bt-emitir" data-cob-copiar="' + i + '">Copiar</button><button type="button" class="b-bt-emitir" data-cob-wa="' + i + '">WhatsApp</button>' +
      (porCli[n].length === 1 ? '<button type="button" class="b-bt-emitir" data-cob-um="' + esc(porCli[n][0].id) + '">E-mail…</button>' : '') + '</div></div>').join(''),
    rodape: '<span class="sub">O texto pode ser editado antes de enviar. Para e-mail, abra a cobrança de cada parcela (botão Cobrar da linha).</span><div class="acoes"><button type="button" class="btn btn-o" data-fechar>Fechar</button></div>' });
  j.addEventListener('click', (ev) => {
    const cp = ev.target.closest('[data-cob-copiar]'), wa = ev.target.closest('[data-cob-wa]'), um = ev.target.closest('[data-cob-um]');
    const txt = (i) => j.querySelector('[data-cob-txt="' + i + '"]').value;
    if (cp) copiarTexto(txt(cp.dataset.cobCopiar));
    if (wa) window.open('https://wa.me/?text=' + encodeURIComponent(txt(wa.dataset.cobWa)), '_blank', 'noopener');
    if (um) { fecharJanela(j); cobrarWhatsApp(um.dataset.cobUm); }
  });
  return j;
}

// ───────────────────────────── Análise ─────────────────────────────
function janelaFin(an) {
  if (an.de || an.ate) return [an.de || '1900-01-01', an.ate || '2999-12-31'];
  const d = new Date(), a = d.getFullYear(), m = d.getMonth(), f = (x) => iso(x);
  switch (an.preset) {
    case 'mes': return [f(new Date(a, m, 1)), f(new Date(a, m + 1, 0))];
    case 'mesant': return [f(new Date(a, m - 1, 1)), f(new Date(a, m, 0))];
    case 'ano': return [f(new Date(a, 0, 1)), f(new Date(a, 11, 31))];
    case 'anoant': return [f(new Date(a - 1, 0, 1)), f(new Date(a - 1, 11, 31))];
    case '12m': return [f(new Date(a, m - 11, 1)), f(new Date(a, m + 1, 0))];
    default: return null;
  }
}
function filtrarFin(empresa, classes, semPeriodo) {
  const F = estadoFin(empresa), an = F.an, jan = semPeriodo ? null : janelaFin(an);
  return (F.dados || []).filter((l) => {
    if (!classes.includes(l._c)) return false;
    if (an.quem.length && !an.quem.includes(quemLanc(l))) return false;
    if (an.tipo && (l.categoria || '') !== an.tipo) return false;
    if (an.grupo && (l.grupos && l.grupos.nome) !== an.grupo) return false;
    if (jan) { const d = dataLanc(l); if (!d || d < jan[0] || d > jan[1]) return false; }
    return true;
  });
}
const somaV = (ls) => soma(ls, valorLanc);
function misturaCor(a, b, t) {
  const h = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
  const A = h(a), B = h(b); return '#' + A.map((v, i) => ('0' + Math.round(v + (B[i] - v) * t).toString(16)).slice(-2)).join('');
}
function corBarraPessoa(n) { const c = corPessoa(n); return /^#[0-9a-f]{6}$/i.test(c.fundo) && /^#[0-9a-f]{6}$/i.test(c.marca) ? misturaCor(c.fundo, c.marca, 0.45) : 'var(--chart-7)'; }
function mesesEntre(a, b) { const out = []; let [y, m] = a.split('-').map(Number); const [y2, m2] = b.split('-').map(Number);
  while (y < y2 || (y === y2 && m <= m2)) { out.push(y + '-' + String(m).padStart(2, '0')); m++; if (m > 12) { m = 1; y++; } } return out; }
function cartaoFin(tit, sub, corpo, extra) { return '<section class="b-fin-cartao' + (extra ? ' ' + extra : '') + '"><div class="b-fin-hd"><h3>' + esc(tit) + '</h3>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' + corpo + '</section>'; }
function barrasFin(pares, max) {
  const lista = pares.filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, max || 10);
  if (!lista.length) return '<div class="b-barras-vazio">Nada no período.</div>';
  const topo = lista[0][1] || 1;
  return '<div class="b-barras">' + lista.map((x) => '<div class="b-barra-lin"><span class="b-barra-rot" title="' + esc(x[0]) + '">' + esc(x[0]) + '</span><span class="b-barra-trilho"><span style="width:' + Math.max(2, Math.round(x[1] / topo * 100)) + '%"></span></span><b class="b-barra-val">' + brl(x[1]) + '</b></div>').join('') + '</div>';
}
const somaPor = (ls, chave) => { const M = {}; ls.forEach((l) => { const k = chave(l) || 'Não informado'; M[k] = (M[k] || 0) + valorLanc(l); }); return Object.entries(M); };

function analiseFin(empresa, corpo) {
  const F = estadoFin(empresa), an = F.an, L = F.dados || [], contab = empresa === 'contabilidade', h = hojeISO();
  const pessoas = [...new Set(L.map(quemLanc))].filter((p) => p !== 'Sem pessoa').sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const tipos = [...new Set(L.map((l) => l.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const grupos = [...new Set(L.map((l) => l.grupos && l.grupos.nome).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const jan = janelaFin(an);
  const fil = '<section class="b-fin-filtros" id="fa-filtros">' +
    (pessoas.length > 1 ? '<div class="b-fin-lin"><span class="b-fin-rot">Quem fez</span><button type="button" class="b-chip" data-fa-quem="" aria-pressed="' + !an.quem.length + '">Todos</button>' +
      pessoas.map((p) => '<button type="button" class="b-chip" data-fa-quem="' + esc(p) + '" aria-pressed="' + an.quem.includes(p) + '">' + esc(p) + '</button>').join('') + '</div>' : '') +
    '<div class="b-fin-lin"><span class="b-fin-rot">Período</span>' + PERIODOS_FIN.map((p) => '<button type="button" class="b-chip" data-fa-per="' + p[0] + '" aria-pressed="' + (!an.de && !an.ate && an.preset === p[0]) + '">' + p[1] + '</button>').join('') +
      '<span class="b-fx"><input type="date" id="fa-de" value="' + esc(an.de) + '" aria-label="De"><span>até</span><input type="date" id="fa-ate" value="' + esc(an.ate) + '" aria-label="Até"><button type="button" class="b-bt-f" id="fa-aplicar">Aplicar</button></span></div>' +
    '<div class="b-fin-lin"><span class="b-fin-rot">Recorte</span><select id="fa-tipo" aria-label="Tipo"><option value="">Todos os tipos</option>' + tipos.map((t) => '<option' + (an.tipo === t ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select>' +
      (grupos.length > 1 ? '<select id="fa-grupo" aria-label="Grupo"><option value="">Todos os grupos</option>' + grupos.map((g) => '<option' + (an.grupo === g ? ' selected' : '') + '>' + esc(g) + '</option>').join('') + '</select>' : '') + '</div>' +
    '<p class="b-fin-mostra">Mostrando <b>' + esc(an.quem.length ? an.quem.join(', ') : 'todos') + '</b> · <b>' + (jan ? dataBR(jan[0]) + ' a ' + dataBR(jan[1]) : 'todo o período') + '</b>' + (an.tipo ? ' · <b>' + esc(an.tipo) + '</b>' : '') + (an.grupo ? ' · <b>' + esc(an.grupo) + '</b>' : '') +
      ' · data considerada: <b>pagamento</b>, ou vencimento quando não houver pagamento</p></section>';
  const receita = filtrarFin(empresa, ['recebido']), aRec = filtrarFin(empresa, ['areceber']), aPag = filtrarFin(empresa, ['apagar']), pagos = filtrarFin(empresa, ['pago']);
  const perdas = filtrarFin(empresa, ['perda'], true), vencidos = filtrarFin(empresa, ['areceber'], true).filter((l) => l.vencimento && l.vencimento < h);
  const aVencer = aRec.filter((l) => !(l.vencimento && l.vencimento < h));
  const vRec = somaV(receita);
  const nums = [['Recebido', brl(vRec), plural(receita.length, 'recebimento', 'recebimentos'), 'b-verde'], ['A receber', brl(somaV(aVencer)), aVencer.length + ' em aberto']]
    .concat(contab || aPag.length ? [['A pagar', brl(somaV(aPag)), plural(aPag.length, 'conta em aberto', 'contas em aberto')]] : [])
    .concat([['Em atraso', brl(somaV(vencidos)), 'todos os meses', vencidos.length ? 'b-verm' : ''], ['Prejuízo', brl(somaV(perdas)), plural(perdas.length, 'baixa', 'baixas') + ' · todos os meses']])
    .concat(contab ? [] : [['Ticket médio', brl(receita.length ? vRec / receita.length : 0), 'por recebimento']]);
  // mês a mês: do 1º mês com dado ao último (no período)
  const chaves = [...receita, ...pagos].map((l) => dataLanc(l).slice(0, 7)).filter(Boolean).sort();
  const meses = chaves.length ? mesesEntre(chaves[0], chaves[chaves.length - 1]) : [];
  let graf;
  if (contab) {
    graf = cartaoFin('Recebido × pago mês a mês', 'Verde = recebido · vermelho = pago (despesas). Passe o mouse na coluna para ver o mês.',
      '<div class="b-fin-graf">' + graficoColunasB(meses, [{ nome: 'Recebido', cor: 'var(--chart-2)', valores: meses.map((k) => somaV(receita.filter((l) => dataLanc(l).startsWith(k)))) },
        { nome: 'Pago (despesas)', cor: 'var(--chart-5)', valores: meses.map((k) => somaV(pagos.filter((l) => dataLanc(l).startsWith(k)))) }], { titulo: 'Recebido e pago por mês' }) + '</div>');
  } else {
    const quem = [...new Set(receita.map(quemLanc))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    graf = cartaoFin('Recebido mês a mês', 'Empilhado por pessoa. Passe o mouse na coluna para ver o valor.',
      '<div class="b-fin-graf">' + graficoColunasB(meses, quem.map((p) => ({ nome: p, cor: corBarraPessoa(p), valores: meses.map((k) => somaV(receita.filter((l) => quemLanc(l) === p && dataLanc(l).startsWith(k)))) })), { empilhado: true, titulo: 'Recebido por mês' }) + '</div>');
  }
  let comp = '';
  if (!contab) {
    const linhas = (pessoas.length ? pessoas : ['Sem pessoa']).filter((p) => !an.quem.length || an.quem.includes(p)).map((p) => {
      const r = receita.filter((l) => quemLanc(l) === p), a = aRec.filter((l) => quemLanc(l) === p), pj = perdas.filter((l) => quemLanc(l) === p);
      return { p, rec: somaV(r), n: r.length, ar: somaV(a), pj: somaV(pj) };
    }).sort((x, y) => y.rec - x.rec);
    const tot = linhas.reduce((s, l) => s + l.rec, 0), td = (v, c) => '<td class="b-dir' + (c ? ' ' + c : '') + '">' + v + '</td>';
    comp = cartaoFin('Comparativo por pessoa', '', linhas.length ? '<div class="b-rola b-rola-solta" data-sem-pagina><table class="b-tab b-tab-comp"><thead><tr><th>Pessoa</th><th class="b-dir">Recebido</th><th class="b-dir">%</th><th class="b-cen">Lançamentos</th><th class="b-dir">Ticket médio</th><th class="b-dir">A receber</th><th class="b-dir">Prejuízo</th></tr></thead><tbody>' +
      linhas.map((l) => '<tr><td>' + pillPessoa(l.p) + '</td>' + td(brl(l.rec), 'b-verde-v') + td((tot ? Math.round(l.rec / tot * 100) : 0) + '%') + '<td class="b-cen">' + l.n + '</td>' + td(l.n ? brl(l.rec / l.n) : '—') + td(l.ar ? brl(l.ar) : '—') + td(l.pj ? brl(l.pj) : '—') + '</tr>').join('') +
      '</tbody><tfoot><tr><td>Total</td>' + td(brl(tot)) + td(tot ? '100%' : '—') + '<td class="b-cen">' + linhas.reduce((s, l) => s + l.n, 0) + '</td><td></td>' + td(brl(linhas.reduce((s, l) => s + l.ar, 0))) + td(brl(linhas.reduce((s, l) => s + l.pj, 0))) + '</tr></tfoot></table></div>' : '<div class="b-barras-vazio">Nada no período.</div>');
  }
  corpo.innerHTML = fil + numsFaixa(nums) + graf + comp +
    '<div class="b-fin-dois">' + cartaoFin(contab ? 'Recebido por tipo de serviço' : 'Por tipo de serviço', '', barrasFin(somaPor(receita, (l) => l.servico))) +
      cartaoFin('Maiores grupos', '', barrasFin(somaPor(receita, (l) => l.grupos && l.grupos.nome))) + '</div>' +
    (contab ? cartaoFin('Despesas por categoria', 'Pago no período, por categoria.', barrasFin(somaPor(pagos, (l) => l.categoria))) : '');
  // controles
  const fl = corpo.querySelector('#fa-filtros');
  fl.onclick = (ev) => {
    const qb = ev.target.closest('[data-fa-quem]'), pb = ev.target.closest('[data-fa-per]');
    if (qb) { const p = qb.dataset.faQuem; if (!p) an.quem = []; else an.quem = an.quem.includes(p) ? an.quem.filter((x) => x !== p) : an.quem.concat(p); return analiseFin(empresa, corpo); }
    if (pb) { an.preset = pb.dataset.faPer; an.de = an.ate = ''; return analiseFin(empresa, corpo); }
    if (ev.target.id === 'fa-aplicar') { an.de = fl.querySelector('#fa-de').value; an.ate = fl.querySelector('#fa-ate').value; if (an.de && an.ate && an.de > an.ate) { const t = an.de; an.de = an.ate; an.ate = t; } return analiseFin(empresa, corpo); }
  };
  fl.onchange = (ev) => { if (ev.target.id === 'fa-tipo') { an.tipo = ev.target.value; analiseFin(empresa, corpo); } else if (ev.target.id === 'fa-grupo') { an.grupo = ev.target.value; analiseFin(empresa, corpo); } };
  fl.onkeydown = (ev) => { if (ev.key === 'Enter' && (ev.target.id === 'fa-de' || ev.target.id === 'fa-ate')) fl.querySelector('#fa-aplicar').click(); };
}

// ───────────────────────────── Caixa (Contabilidade) ─────────────────────────────
// Livro-caixa: só o que já foi pago mexe no caixa (recebido − pago, pela data de pagamento); saldo acumulado desde o 1º mês.
function mesesCaixa(L) {
  const mov = L.filter((l) => l._c === 'recebido' || l._c === 'pago');
  const ch = mov.map((l) => dataLanc(l).slice(0, 7)).filter(Boolean).sort();
  if (!ch.length) return [];
  const atual = hojeISO().slice(0, 7), fim = atual > ch[ch.length - 1] ? atual : ch[ch.length - 1];
  let saldo = 0;
  return mesesEntre(ch[0], fim).map((k) => {
    const r = somaV(mov.filter((l) => l._c === 'recebido' && dataLanc(l).startsWith(k))), d = somaV(mov.filter((l) => l._c === 'pago' && dataLanc(l).startsWith(k)));
    saldo += r - d; return { k, r, d, res: r - d, saldo, itens: mov.filter((l) => dataLanc(l).startsWith(k)).sort((a, b) => dataLanc(a).localeCompare(dataLanc(b))) };
  });
}
function caixaFin(empresa, corpo) {
  const F = estadoFin(empresa), meses = mesesCaixa(F.dados || []);
  if (!meses.length) { corpo.innerHTML = vazioB({ icone: 'financeiro', titulo: 'Nada pago ainda', frase: 'O caixa usa só os lançamentos já recebidos ou pagos — assim que houver um, ele aparece aqui.' }); return; }
  const hk = hojeISO().slice(0, 7), atual = meses.find((m) => m.k === hk) || meses[meses.length - 1], saldo = meses[meses.length - 1].saldo;
  const nums = numsFaixa([['Saldo em caixa', brl(saldo), 'acumulado desde o início', saldo < 0 ? 'b-verm' : ''], ['Receita do mês', brl(atual.r), rotMesB(atual.k), 'b-verde'],
    ['Despesas do mês', brl(atual.d), rotMesB(atual.k)], ['Resultado do mês', brl(atual.res), atual.res >= 0 ? 'superávit' : 'déficit', atual.res < 0 ? 'b-verm' : 'b-verde']]);
  const seg = '<div class="b-seg b-seg-mini" id="cx-vista"><button type="button" class="b-seg-bt" data-cx="consolidado" aria-selected="' + (F.caixa === 'consolidado') + '">Consolidado</button><button type="button" class="b-seg-bt" data-cx="detalhado" aria-selected="' + (F.caixa === 'detalhado') + '">Mês a mês</button></div>';
  let miolo;
  if (F.caixa === 'detalhado') {
    let ini = 0;
    miolo = meses.slice().map((m) => { const s0 = ini; ini = m.saldo; return [m, s0]; }).reverse().map(([m, s0]) => {
      let s = s0;
      const cats = somaPor(m.itens.filter((l) => l._c === 'pago'), (l) => l.categoria).sort((a, b) => b[1] - a[1]);
      return '<details class="b-cx-mes"' + (m.k === hk ? ' open' : '') + '><summary><b>' + esc(rotMesB(m.k)) + '</b><span class="b-verde-v">+ ' + brl(m.r) + '</span><span class="b-verm-v">− ' + brl(m.d) + '</span><span>saldo ' + brl(m.saldo) + '</span></summary>' +
        (m.itens.length ? '<div class="b-rola b-rola-solta" data-sem-pagina><table class="b-tab"><thead><tr><th class="b-cen">Data</th><th>Histórico</th><th>Categoria</th><th class="b-dir">Entrada</th><th class="b-dir">Saída</th><th class="b-dir">Saldo</th></tr></thead><tbody>' +
          m.itens.map((l) => { const v = valorLanc(l), ent = l._c === 'recebido' ? v : 0, sai = l._c === 'pago' ? v : 0; s += ent - sai;
            return '<tr class="b-cl" data-cx-l="' + esc(l.id) + '"><td class="b-cen b-data">' + dataBR(dataLanc(l)) + '</td><td>' + esc(l.descricao || nomeLanc(l) || '—') + '</td><td>' + esc(l._c === 'recebido' ? 'Honorários' : (l.categoria || '—')) + '</td>' +
              '<td class="b-dir b-verde-v">' + (ent ? brl(ent) : '—') + '</td><td class="b-dir b-verm-v">' + (sai ? brl(sai) : '—') + '</td><td class="b-dir"><b>' + brl(s) + '</b></td></tr>'; }).join('') +
          '</tbody></table></div>' : '<p class="b-barras-vazio">Nenhum movimento neste mês.</p>') +
        (cats.length ? '<div class="b-cx-cats">' + cats.map(([k, v]) => '<span>' + esc(k) + ' <b>' + brl(v) + '</b></span>').join('') + '</div>' : '') + '</details>';
    }).join('');
  } else {
    const ks = meses.map((m) => m.k);
    const despCat = somaPor((F.dados || []).filter((l) => l._c === 'pago'), (l) => l.categoria);
    miolo = cartaoFin('Saldo em caixa mês a mês', 'Acumulado — receita menos despesa, mês após mês.', '<div class="b-fin-graf">' + graficoColunasB(ks, [], { linha: { nome: 'Saldo', cor: 'var(--chart-1)', valores: meses.map((m) => m.saldo) }, titulo: 'Saldo mês a mês' }) + '</div>') +
      cartaoFin('Receita × despesa mês a mês', 'Recebido contra pago — passe o mouse no mês para ver os dois juntos.', '<div class="b-fin-graf">' + graficoColunasB(ks, [{ nome: 'Receita', cor: 'var(--chart-2)', valores: meses.map((m) => m.r) }, { nome: 'Despesa', cor: 'var(--chart-5)', valores: meses.map((m) => m.d) }], { titulo: 'Receita e despesa' }) + '</div>') +
      cartaoFin('Despesas por categoria', 'Acumulado de todo o período.', barrasFin(despCat)) +
      cartaoFin('Resumo mensal', 'Receita, despesa, resultado e saldo final de cada mês.', '<div class="b-rola b-rola-solta" data-sem-pagina><table class="b-tab"><thead><tr><th>Mês</th><th class="b-dir">Receita</th><th class="b-dir">Despesa</th><th class="b-dir">Resultado</th><th class="b-dir">Saldo final</th></tr></thead><tbody>' +
        meses.map((m) => '<tr' + (!m.r && !m.d ? ' class="b-apagada"' : '') + '><td>' + esc(rotMesB(m.k)) + '</td><td class="b-dir b-verde-v">' + (m.r ? brl(m.r) : '—') + '</td><td class="b-dir b-verm-v">' + (m.d ? brl(m.d) : '—') + '</td><td class="b-dir' + (m.res < 0 ? ' b-verm-v' : '') + '">' + brl(m.res) + '</td><td class="b-dir"><b>' + brl(m.saldo) + '</b></td></tr>').join('') +
        '</tbody><tfoot><tr><td>Total</td><td class="b-dir">' + brl(meses.reduce((s, m) => s + m.r, 0)) + '</td><td class="b-dir">' + brl(meses.reduce((s, m) => s + m.d, 0)) + '</td><td class="b-dir">' + brl(meses.reduce((s, m) => s + m.res, 0)) + '</td><td class="b-dir">' + brl(saldo) + '</td></tr></tfoot></table></div>');
  }
  corpo.innerHTML = seg + nums + miolo;
  corpo.querySelector('#cx-vista').onclick = (ev) => { const b = ev.target.closest('[data-cx]'); if (b) { F.caixa = b.dataset.cx; caixaFin(empresa, corpo); } };
  corpo.querySelectorAll('[data-cx-l]').forEach((tr) => tr.onclick = () => detalheLancamento(tr.dataset.cxL).catch((e) => aviso(erroAmigavel(e), true)));
}

// ───────────────────────────── Distribuição de lucros (Contabilidade) ─────────────────────────────
function lucrosFin(empresa, corpo) {
  const F = estadoFin(empresa);
  const linhas = (F.dados || []).filter((l) => /distribui[cç][aã]o de lucros/i.test(l.categoria || ''));
  if (!linhas.length) { corpo.innerHTML = vazioB({ icone: 'financeiro', titulo: 'Nenhuma distribuição lançada ainda', frase: 'Lance uma despesa com o tipo "Distribuição de lucros" e o favorecido Pedro ou Éder — o cálculo aparece aqui sozinho.' }); return; }
  const socio = (l) => (l.favorecido || (l.grupos && l.grupos.nome) || '—').trim() || '—';
  const ehSocio = (n) => SOCIOS_LUCRO.find((s) => normalizar(s) === normalizar(n));
  const por = {}; linhas.forEach((l) => { const k = ehSocio(socio(l)) || socio(l); por[k] = (por[k] || 0) + (Number(l.valor) || 0); });
  const [s1, s2] = SOCIOS_LUCRO, v1 = por[s1] || 0, v2 = por[s2] || 0, tot12 = v1 + v2, totGeral = Object.values(por).reduce((s, v) => s + v, 0);
  const outros = Object.keys(por).filter((n) => !ehSocio(n)), dif = v1 - v2, igual = Math.abs(dif) < 0.01;
  const pc = (v) => (tot12 ? Math.round(v / tot12 * 100) + '% do total (' + s1 + ' + ' + s2 + ')' : '—');
  corpo.innerHTML = (outros.length ? '<div class="b-alerta-a"><b>Favorecido fora de ' + s1 + '/' + s2 + '</b>' + outros.map((n) => '<div>• "' + esc(n) + '" — ' + brl(por[n]) + ' (não entra no equilíbrio 50/50)</div>').join('') + '</div>' : '') +
    numsFaixa([['Total distribuído', brl(totGeral), plural(linhas.length, 'lançamento', 'lançamentos')], [s1, brl(v1), pc(v1)], [s2, brl(v2), pc(v2)],
      ['Equilíbrio (50/50)', igual ? 'Igual' : brl(Math.abs(dif)), igual ? s1 + ' e ' + s2 + ' receberam o mesmo total' : (dif > 0 ? s1 : s2) + ' está à frente — ' + brl(Math.abs(dif) / 2) + ' equilibraria', igual ? 'b-verde' : 'b-verm']]) +
    '<div id="fin-lucros"></div>';
  tabelaB(corpo.querySelector('#fin-lucros'), { id: 'fin-lucros-' + empresa, linhas, titulo: 'Lançamentos de distribuição de lucros', unidade: ['lançamento', 'lançamentos'],
    colunas: [{ k: 'd', rot: 'Data', cls: 'b-cen b-data', html: (l) => dataBR(dataLanc(l)), ord: dataLanc }, { k: 's', rot: 'Sócio', html: (l) => esc(socio(l)), ord: (l) => normalizar(socio(l)) },
      { k: 'v', rot: 'Valor', cls: 'b-dir b-val', soma: true, html: (l) => brl(l.valor), ord: (l) => Number(l.valor) || 0 },
      { k: 'st', rot: 'Situação', cls: 'b-cen', html: (l) => (l.pago ? '<span class="b-ok-txt">✓ Pago</span>' : '<span class="b-pz-a">Pendente</span>'), ord: (l) => (l.pago ? 1 : 0) },
      { k: 'o', rot: 'Observação', html: (l) => '<span class="b-sub">' + esc(l.obs || l.descricao || l.referencia || '—') + '</span>', ord: false }],
    ord: { k: 'd', dir: -1 }, valor: (l) => Number(l.valor) || 0, clique: (l) => detalheLancamento(l.id).catch((e) => aviso(erroAmigavel(e), true)) });
}

// Legenda do lançamento (vale no sistema todo): 2ª linha = "Área do serviço — contrato"; sem contrato, só a área;
// sem área, o tipo (categoria). Ex.: 1ª linha "Consultoria", 2ª linha "Tributário — Contrato Alfa 2026".
function legendaLanc(l) {
  const ct = (l.contratos && l.contratos.descricao) || l.contrato || '';
  const partes = [l.servico, ct].filter(Boolean);
  if (partes.length) return partes.join(' — ');
  return l.categoria && normalizar(l.categoria) !== normalizar(l.descricao) ? l.categoria : '';
}
// Backup 20 — TABELA PADRÃO de pagamento/recebimento (vale para o sistema todo; modelo: vencidos de Acordos):
// [lote] · Quem (advogado que recebe/paga) · Grupo / favorecido (legenda: área do serviço — contrato) · Descrição · Valor ·
// Vencimento (ou "Pago em") · Atraso (dias, vermelho) · ações (✓ Baixa, ✎). Marcar várias linhas = baixa em lote.
function celulaAtraso(venc, l) {
  if (!venc) return '<span class="sub">—</span>';
  const n = diasAte(venc);
  const extra = l && l.cobranca ? '<div class="sub">' + esc(l.cobranca) + '</div>' : '';
  // Backup 21: o dia do vencimento já conta como vencido; até vencer, a régua única: <3 amarelo · <10 azul · ≥10 verde
  if (n < 0) return '<span class="atraso-d">' + (-n) + ' d atraso</span>' + extra;
  if (n === 0) return '<span class="atraso-d">vence hoje</span>' + extra;
  return '<span class="' + (n < 3 ? 'dias-a' : n < 10 ? 'dias-b' : 'dias-g') + '">em ' + n + ' d</span>' + extra;
}
function tabelaLancamentos(lista, opc) {
  opc = opc || {};
  if (!lista.length) return '<div class="vazio">Nenhum lançamento aqui.</div>';
  const porPagamento = opc.aba === 'recebidos' || opc.aba === 'despesas';
  const compacta = !!opc.compacta;
  const comDesc = !opc.semDescricao, comAtraso = !opc.semSituacao && !porPagamento && opc.aba !== 'prejuizo';
  const lote = !compacta && !opc.semLote && lista.some((l) => !l.pago && !l.perda);
  const h = hojeISO();
  const nCols = (lote ? 1 : 0) + (compacta ? 0 : 2) + (comDesc ? 1 : 0) + 2 + (comAtraso ? 1 : 0) + 1;
  return '<div class="lote-wrap">' + (lote ? '<div class="lote-barra" hidden><span class="lote-txt"></span><button type="button" class="btn btn-v btn-mini" data-lote-baixa>✓ Dar baixa nos marcados</button><button type="button" class="btn btn-o btn-mini" data-lote-limpar>Desmarcar</button></div>' : '') +
    '<div class="tabela-wrap"><table class="ordenavel tab-pag' + (opc.semDescricao ? ' tab-rel' : '') + '"><thead><tr>' +
    (lote ? '<th class="sem-ordem th-lote"><input type="checkbox" data-lote-todos aria-label="Marcar todos" title="Marcar todos para dar baixa de uma vez"></th>' : '') +
    (compacta ? '' : '<th>Quem</th><th>Grupo / Favorecido</th>') + (comDesc ? '<th>Descrição</th>' : '') +
    '<th class="num">Valor</th><th data-tipo="data">' + (porPagamento ? 'Pago em' : 'Vencimento') + '</th>' + (comAtraso ? '<th>Atraso</th>' : '') + '<th class="sem-ordem"></th></tr></thead><tbody>' +
    lista.map((l) => {
      const data = porPagamento ? l.data_pagamento : l.vencimento;
      const quem = (l.grupos && l.grupos.nome) || l.favorecido || (l.clientes && l.clientes.nome) || '';
      const venceu = !l.pago && !l.perda && l.vencimento && l.vencimento <= h;
      const leg = legendaLanc(l);
      return '<tr class="clicavel' + (l.vencimento === h && !l.pago ? ' linha-hoje' : '') + '" data-lanc="' + l.id + '" title="Clique para ver o detalhe">' +
        (lote ? '<td class="td-lote">' + (!l.pago && !l.perda ? '<input type="checkbox" data-lote="' + l.id + '" data-valor="' + (l.tipo === 'despesa' ? -l.valor : vl(l)) + '" aria-label="Marcar para dar baixa">' : '') + '</td>' : '') +
        (compacta ? '' : '<td>' + pillPessoa(l.responsavel) + '</td><td title="' + esc(quem) + '">' + esc(quem || '—') +
          (l.clientes && l.grupos ? '<div class="sub">' + esc(l.clientes.nome) + '</div>' : !comDesc && leg ? '<div class="sub">' + esc(leg) + '</div>' : '') + '</td>') +
        (comDesc ? '<td>' + esc(l.descricao) + (leg ? '<div class="sub">' + esc(leg) + '</div>' : '') + '</td>' : '') +
        '<td class="num mono ' + (l.tipo === 'receita' && !l.redutor ? 'valor-rec' : 'valor-desp') + '" data-ord="' + (l.tipo === 'despesa' ? -l.valor : vl(l)) + '">' + (l.tipo === 'despesa' || l.redutor ? '− ' : '') + brl(l.valor) + (l.redutor ? '<div class="sub">redutor</div>' : '') + '</td>' +
        '<td class="mono' + (venceu ? ' venc-atraso' : '') + '" data-ord="' + esc(data || '') + '">' + dataBR(data) + (porPagamento && l.vencimento !== data ? '<div class="sub">venc. ' + dataBR(l.vencimento) + '</div>' : '') + '</td>' +
        (comAtraso ? '<td data-ord="' + (l.pago || l.perda || !l.vencimento ? 99999 : diasAte(l.vencimento)) + '">' + (l.pago ? '<span class="pill pago" data-sit="pago">pago</span>' : l.perda ? pillSit(l) : celulaAtraso(l.vencimento, l)) + '</td>' : '') +
        '<td class="acoes-l">' +
        (l.pago ? '<button class="btn btn-o btn-mini" data-desfazer="' + l.id + '" title="Voltar para em aberto">↺</button> '
                : l.perda ? '' : (l.tipo === 'receita' && !l.redutor ? '<button class="btn btn-o btn-mini gx-cobrar" data-cobrar="' + l.id + '" title="Cobrar pelo WhatsApp (texto pronto)">💬 Cobrar</button> ' : '') +
                  '<button class="btn btn-v btn-mini" data-pagar="' + l.id + '" title="Dar baixa — ' + (l.tipo === 'despesa' && !l.redutor ? 'pago' : 'recebido') + ' (pergunta a data)">✓ Baixa</button>') +
        '</td></tr>';   // Backup 58: sem a caneta — clicar na linha abre o detalhe, com "✎ Editar"
    }).join('') +
    '</tbody><tfoot><tr><td colspan="' + ((lote ? 1 : 0) + (compacta ? 0 : 2) + (comDesc ? 1 : 0)) + '">Total (' + lista.length + ')</td><td class="num mono">' +
    brl(soma(lista, (l) => l.tipo === 'despesa' ? -l.valor : vl(l))) + '</td><td colspan="' + (nCols - (lote ? 1 : 0) - (compacta ? 0 : 2) - (comDesc ? 1 : 0) - 1) + '"></td></tr></tfoot></table></div></div>';
}

// ═══ Backup 71 (reforma, etapa 5): a lista de lançamentos no desenho da tabela de Acordos (peça tabelaB) ═══
// Quem · Grupo / Favorecido · Descrição · Valor · Vencimento (ou Pago em) · Prazo colorido · Cobrar + Baixa (verde) · linha vencida rosada.
// Nada saiu: clique na linha = detalhe (✎ Editar, recibo…), Cobrar pelo WhatsApp, Baixa (pergunta a data), ↺ voltar para em aberto,
// baixa de várias de uma vez (botão "Marcar várias" — as caixinhas só aparecem quando pedidas), busca, filtros e ordenar pelo título.
function celPrazoL(l) {
  if (l.perda) return pillSit(l);
  if (l.pago) return '<span class="b-ok-txt">✓ ' + (l.data_pagamento ? 'Pago em ' + dataBR(l.data_pagamento).slice(0, 5) : 'Pago') + '</span>';
  const d = l.vencimento ? diasAte(l.vencimento) : null;
  return (d === null ? '—' : '<span class="' + corPrazo(d) + '">' + (d < 0 ? Math.abs(d) + ' d atraso' : d === 0 ? 'vence hoje' : d + (d === 1 ? ' dia' : ' dias')) + '</span>') +
    (l.cobranca ? '<small class="b-pz-sub">' + esc(l.cobranca) + '</small>' : '');
}
function celAcoesL(l) {
  if (l.perda) return '';
  if (l.pago) return '<span class="b-acoes"><button type="button" class="b-bt-emitir" data-desfazer="' + l.id + '" title="Voltar para em aberto">↺ Desfazer</button></span>';
  return '<span class="b-acoes">' + (l.tipo === 'receita' && !l.redutor ? '<button type="button" class="b-bt-emitir gx-cobrar" data-cobrar="' + l.id + '" title="Cobrar pelo WhatsApp (texto pronto)">Cobrar</button>' : '') +
    '<button type="button" class="b-bt-baixa" data-pagar="' + l.id + '" title="Dar baixa — ' + (l.tipo === 'despesa' && !l.redutor ? 'pago' : 'recebido') + ' (pergunta a data)">Baixa</button></span>';
}
function tabelaLancB(el, lista, opc, depois) {
  opc = opc || {};
  const aba = opc.aba || 'areceber', porPag = aba === 'recebidos' || aba === 'despesas', aberto = !porPag && aba !== 'prejuizo';
  const h = hojeISO(), quemL = (l) => (l.grupos && l.grupos.nome) || l.favorecido || (l.clientes && l.clientes.nome) || '';
  const vS = (l) => (l.tipo === 'despesa' ? -l.valor : vl(l));
  const dataL = (l) => (porPag ? l.data_pagamento : l.vencimento) || '';
  const C = [
    { k: 'resp', rot: 'Quem', html: (l) => pillPessoa(l.responsavel), ord: (l) => normalizar(l.responsavel || '') },
    { k: 'quem', rot: 'Grupo / Favorecido', html: (l) => esc(quemL(l) || '—') + (l.clientes && l.grupos ? '<span class="b-sub">' + esc(l.clientes.nome) + '</span>' : ''), ord: (l) => normalizar(quemL(l)) },
    { k: 'desc', rot: 'Descrição', html: (l) => { const lg = legendaLanc(l); return esc(l.descricao || '—') + (lg ? '<span class="b-sub">' + esc(lg) + '</span>' : ''); }, ord: (l) => normalizar(l.descricao || '') },
    { k: 'v', rot: 'Valor', cls: 'b-dir b-val', clsL: (l) => (l.tipo === 'receita' && !l.redutor ? ' valor-rec' : ' valor-desp'), soma: true,
      html: (l) => (l.tipo === 'despesa' || l.redutor ? '− ' : '') + brl(l.valor) + (l.redutor ? '<small>redutor</small>' : ''), ord: vS },
    { k: 'venc', rot: porPag ? 'Pago em' : 'Vencimento', cls: 'b-cen b-data', html: (l) => { const d = dataL(l); return d ? dataBR(d) + (porPag && l.vencimento && l.vencimento !== d ? '<small>venc. ' + dataBR(l.vencimento) + '</small>' : '') : '—'; }, ord: (l) => dataL(l) || '9' }];
  if (!porPag) C.push({ k: 'pz', rot: 'Prazo', cls: 'b-cen b-prazo', html: celPrazoL, ord: (l) => (l.pago || l.perda ? '9' : l.vencimento || '9') });
  C.push({ k: 'ac', rot: '', cls: 'b-dir b-c-acoes', html: celAcoesL, ord: false });
  const resp = [...new Set(lista.map((l) => l.responsavel).filter(Boolean))].sort();
  const temAberto = lista.some((l) => !l.pago && !l.perda);
  el._lancDepois = depois || recarregar;
  tabelaB(el, { id: opc.id || 'fin-' + aba, tabCls: 'b-tab-lanc' + (porPag ? ' b-sem-prazo' : ''), linhas: lista, colunas: C, unidade: ['lançamento', 'lançamentos'],
    titulo: opc.titulo, busca: (l) => [l.descricao, quemL(l), l.clientes && l.clientes.nome, l.favorecido, l.categoria, l.obs, l.servico].join(' '), dicaBusca: 'Cliente, grupo, descrição…',
    prazos: aberto && !opc.semPrazos, venc: (l) => dataL(l), valor: vS, ord: porPag ? { k: 'venc', dir: -1 } : { k: 'venc', dir: 1 },
    conta: (n) => plural(n, 'lançamento', 'lançamentos'), linhaCls: (l) => (!l.pago && !l.perda && l.vencimento && l.vencimento <= h ? ' b-tr-venc' : ''),
    listas: resp.length > 1 ? [{ k: 'resp', rot: 'Quem', todos: 'Todas as pessoas', opcoes: resp.map((r) => [r, r]), get: (l) => l.responsavel }] : [],
    lote: temAberto ? [{ rot: 'Dar baixa nas marcadas', icone: 'check', quando: (l) => !l.pago && !l.perda, fn: async (marc) => {
      const ids = marc.map((l) => l.id); if (!ids.length) return false;
      const bx = await perguntarBaixa({ titulo: 'Baixa em lote — confirme a data', descricao: plural(ids.length, 'lançamento', 'lançamentos'), valor: soma(marc, vS) });
      if (!bx) return false;
      await q(sb.from('lancamentos').update(Object.assign(bx, { cobranca: '', perda: false })).in('id', ids));
      aviso('✓ Baixa de ' + plural(ids.length, 'lançamento', 'lançamentos') + ' em ' + dataBR(bx.data_pagamento) + '.'); await el._lancDepois(); } }] : null, loteBotao: true,
    clique: (l) => detalheLancamento(l.id).catch((e) => aviso(erroAmigavel(e), true)),
    vazio: { titulo: 'Nenhum lançamento aqui', frase: 'Troque o mês, a aba ou os filtros.' } });
  if (!el._lancLigado) {
    el._lancLigado = true;
    el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-pagar], [data-cobrar], [data-desfazer]'); if (!b || !el.contains(b)) return;
      ev.stopPropagation();
      if (b.dataset.cobrar) return cobrarWhatsApp(b.dataset.cobrar);
      if (b.dataset.desfazer) return comBotao(b, async () => { await q(sb.from('lancamentos').update({ pago: false }).eq('id', b.dataset.desfazer)); aviso('Lançamento voltou para "em aberto".'); await el._lancDepois(); });
      comBotao(b, async () => {
        const l = await q(sb.from('lancamentos').select('descricao, valor, tipo, redutor').eq('id', b.dataset.pagar).single());
        const bx = await perguntarBaixa({ descricao: l.descricao, valor: l.valor, despesa: l.tipo === 'despesa' && !l.redutor });
        if (!bx) return;
        await q(sb.from('lancamentos').update(Object.assign(bx, { cobranca: '', perda: false })).eq('id', b.dataset.pagar));
        aviso('✓ Baixa registrada em ' + dataBR(bx.data_pagamento) + '.'); await el._lancDepois();
      });
    }, true);
  }
}

function ligarAcoesLancamentos(raiz, depois) {
  const apos = depois || recarregar;
  // baixa em lote: marcar várias linhas → uma data só para todas
  raiz.querySelectorAll('.lote-wrap').forEach((w) => {
    const bar = w.querySelector('.lote-barra'); if (!bar) return;
    const marcados = () => [...w.querySelectorAll('[data-lote]:checked')];
    const atualiza = () => { const m = marcados(); bar.hidden = !m.length; bar.querySelector('.lote-txt').innerHTML = '<b>' + plural(m.length, 'lançamento marcado', 'lançamentos marcados') + '</b> · ' + brl(soma(m, (c) => Number(c.dataset.valor) || 0)); };
    w.querySelectorAll('[data-lote]').forEach((c) => c.onchange = atualiza);
    const todos = w.querySelector('[data-lote-todos]'); if (todos) todos.onchange = () => { w.querySelectorAll('[data-lote]').forEach((c) => { if (!c.closest('tr').classList.contains('pag-oculta')) c.checked = todos.checked; }); atualiza(); };
    bar.querySelector('[data-lote-limpar]').onclick = () => { w.querySelectorAll('[data-lote]').forEach((c) => { c.checked = false; }); if (todos) todos.checked = false; atualiza(); };
    bar.querySelector('[data-lote-baixa]').onclick = (ev) => comBotao(ev.currentTarget, async () => {
      const ids = marcados().map((c) => c.dataset.lote); if (!ids.length) return;
      const bx = await perguntarBaixa({ titulo: 'Baixa em lote — confirme a data', descricao: plural(ids.length, 'lançamento', 'lançamentos'), valor: soma(marcados(), (c) => Number(c.dataset.valor) || 0) });
      if (!bx) return;
      await q(sb.from('lancamentos').update(Object.assign(bx, { cobranca: '', perda: false })).in('id', ids));
      aviso('✓ Baixa de ' + plural(ids.length, 'lançamento', 'lançamentos') + ' em ' + dataBR(bx.data_pagamento) + '.'); await apos();
    });
  });
  raiz.querySelectorAll('tr[data-lanc]').forEach((tr) => tr.addEventListener('click', (ev) => {
    if (ev.target.closest('button, a, input, select, label')) return;
    detalheLancamento(tr.dataset.lanc).catch((e) => aviso(erroAmigavel(e), true));
  }));
  raiz.querySelectorAll('[data-cobrar]').forEach((b) => b.onclick = () => cobrarWhatsApp(b.dataset.cobrar));
  raiz.querySelectorAll('[data-pagar]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const l = await q(sb.from('lancamentos').select('descricao, valor, tipo, redutor').eq('id', b.dataset.pagar).single());
    const bx = await perguntarBaixa({ descricao: l.descricao, valor: l.valor, despesa: l.tipo === 'despesa' && !l.redutor });
    if (!bx) return;
    await q(sb.from('lancamentos').update(Object.assign(bx, { cobranca: '', perda: false })).eq('id', b.dataset.pagar));
    aviso('✓ Baixa registrada em ' + dataBR(bx.data_pagamento) + '.'); await apos();
  }));
  raiz.querySelectorAll('[data-desfazer]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    await q(sb.from('lancamentos').update({ pago: false }).eq('id', b.dataset.desfazer));
    aviso('Lançamento voltou para "em aberto".'); await apos();
  }));
  raiz.querySelectorAll('[data-editar]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const l = await q(sb.from('lancamentos').select('*').eq('id', b.dataset.editar).single());
    formLancamento(l, apos);
  }));
}

// ───────────────────────────── formulário ──────────────────────────
const CATEGORIAS = {
  receita: ['Consultoria', 'Fixo', 'Êxito', 'Execução', 'Comissão', 'Contabilidade', 'Honorários', 'Reembolso'],
  despesa: ['Distribuição de lucros', 'Pró-labore', 'Folha de Pagamento', 'Aluguel', 'Água / luz / internet', 'Sistema/Software', 'Impostos', 'Comissão', 'Custas processuais', 'Marketing', 'Material de escritório', 'Outros']
};

function formLancamento(l, depois) {
  const novo = !l.id;
  const tipo = l.tipo || 'receita';
  const empresa = l.empresa || 'escritorio';
  const j = abrirJanela({
    titulo: (novo ? 'Nov' + (l.redutor ? 'o ' : 'a ') : 'Editar ') + (l.redutor ? 'redutor de receita (comissão/desconto)' : tipo === 'receita' ? 'receita' : 'despesa'), larga: true,
    corpo:
      '<form id="f-lanc" class="grade">' +
      campo('Descrição <span class="obrig">*</span>', '<input name="descricao" required maxlength="200" value="' + esc(l.descricao || '') + '">', 'inteiro') +
      campo('Valor (R$) <span class="obrig">*</span>', '<input name="valor" required inputmode="decimal" placeholder="0,00" value="' + (l.valor ? valorParaCampo(l.valor) : '') + '">') +
      campo('Vencimento <span class="obrig">*</span>', '<input name="vencimento" type="date" required value="' + esc(l.vencimento || hojeISO()) + '">') +
      campo('Empresa', '<select name="empresa"><option value="escritorio"' + (empresa === 'escritorio' ? ' selected' : '') + '>Escritório (Jurídico)</option>' +
        '<option value="contabilidade"' + (empresa === 'contabilidade' ? ' selected' : '') + '>Contabilidade</option></select>') +
      campo('Grupo', '<input name="grupo" list="lanc-grupos" placeholder="Digite ou escolha" value="' + esc(nomeGrupo(l.grupo_id)) + '">' + datalistGrupos('lanc-grupos')) +
      campo('Cliente (empresa do grupo)', '<select name="cliente_id">' + opcoesClientes(l.cliente_id) + '</select>') +
      (tipo === 'despesa' ? campo('Fornecedor / favorecido', '<input name="favorecido" value="' + esc(l.favorecido || '') + '">') : '') +
      campo('Pessoa responsável', '<input name="responsavel" list="lanc-pessoas" value="' + esc(l.responsavel || '') + '">' + datalistPessoas('lanc-pessoas')) +
      // Backup 29: na despesa, a categoria é uma lista; "Distribuição de lucros" pede só o sócio (os campos que não se aplicam somem)
      (tipo === 'despesa'
        ? campo('Tipo de despesa', '<select name="categoria">' + ['', ...CATEGORIAS.despesa, ...(l.categoria && !CATEGORIAS.despesa.includes(l.categoria) ? [l.categoria] : [])]
            .map((c) => '<option value="' + esc(c) + '"' + ((l.categoria || '') === c ? ' selected' : '') + '>' + (c ? esc(c) : '— escolha —') + '</option>').join('') + '</select>') +
          campo('Sócio que recebeu', selectPessoa('socio', /^distribui/i.test(l.categoria || '') ? l.favorecido : '', '— escolha o sócio —'), 'lanc-socio')
        : campo('Categoria / tipo', '<input name="categoria" list="lanc-cat" value="' + esc(l.categoria || '') + '"><datalist id="lanc-cat">' +
          CATEGORIAS[tipo].map((c) => '<option value="' + esc(c) + '">').join('') + '</datalist>')) +
      (tipo === 'receita' ? campo('Área do serviço', selectServico(l.servico || '')) : '') +
      campo('Referência', '<input name="referencia" placeholder="Ex.: 0,7 salário" value="' + esc(l.referencia || '') + '">') +
      campo('Situação da cobrança', '<input name="cobranca" list="lanc-cob" placeholder="Ex.: Cobrado, Emitir guia" value="' + esc(l.cobranca || '') + '"><datalist id="lanc-cob">' +
        ['Cobrado', 'Emitir guia', 'Guia enviada', 'Negociando'].map((c) => '<option value="' + c + '">').join('') + '</datalist>') +
      '<label class="check inteiro"><input type="checkbox" name="pago"' + (l.pago ? ' checked' : '') + '> Já foi ' + (tipo === 'receita' ? 'recebido' : 'pago') + '</label>' +
      '<div id="bloco-pag" class="grade inteiro' + (l.pago ? '' : ' escondido') + '">' +
      campo('Data do pagamento', '<input name="data_pagamento" type="date" value="' + esc(l.data_pagamento || hojeISO()) + '">') +
      campo('Forma de pagamento', '<input name="forma_pagamento" list="lanc-forma" value="' + esc(l.forma_pagamento || '') + '"><datalist id="lanc-forma">' +
        ['PIX', 'Boleto', 'Transferência', 'Cheque', 'Cartão', 'Dinheiro'].map((c) => '<option value="' + c + '">').join('') + '</datalist>') +
      campo('Conta / banco', '<input name="conta" value="' + esc(l.conta || '') + '">') +
      '</div>' +
      campo('Chave PIX', '<input name="chave_pix" value="' + esc(l.chave_pix || '') + '">') +
      (novo ? campo('Repetir todo mês por', '<select name="repetir">' + [1, 2, 3, 6, 12, 24].map((n) =>
        '<option value="' + n + '">' + (n === 1 ? 'Não repetir' : n + ' meses') + '</option>').join('') + '</select>') : '') +
      (tipo === 'receita' ? '<label class="check inteiro"><input type="checkbox" name="redutor"' + (l.redutor ? ' checked' : '') + '> É redutor da receita (comissão, desconto) — diminui o valor recebido, não é despesa</label>' : '') +
      (tipo === 'receita' ? '<label class="check inteiro"><input type="checkbox" name="perda"' + (l.perda ? ' checked' : '') + '> Dar como prejuízo (crédito perdido)</label>' : '') +
      (l.contrato_id && l.parcela ? '<div class="dica inteiro">Parcela ' + esc(l.parcela) + '/' + esc(l.total_parcelas) + ' de um contrato.</div>' : '') +
      campo('Observação', '<textarea name="obs" maxlength="2000">' + esc(l.obs || '') + '</textarea>', 'inteiro') +
      '</form>',
    rodape:
      (novo ? '<span></span>' : '<button class="btn btn-x" id="btn-excluir-lanc" type="button">Excluir</button>') +
      '<div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button>' +
      '<button class="btn btn-p" id="btn-salvar-lanc" type="button">Salvar</button></div>'
  });
  const f = j.querySelector('#f-lanc');
  if (!novo && typeof blocoDocumentos === 'function') {
    const d = document.createElement('div'); d.className = 'secao-docs';
    j.querySelector('.janela-bd').appendChild(d);
    blocoDocumentos(d, { lancamento_id: l.id, cliente_id: l.cliente_id, grupo_id: l.grupo_id, tipo: l.pago ? 'comprovante' : 'guia' },
      { titulo: 'Comprovantes e guias', vazio: 'Nenhum arquivo. Envie o comprovante de pagamento ou a guia.' }).catch((e) => console.error(e));
  }
  f.pago.onchange = () => j.querySelector('#bloco-pag').classList.toggle('escondido', !f.pago.checked);
  const ehLucro = () => tipo === 'despesa' && /^distribui/i.test(f.categoria.value);
  const ajustarLucro = () => {
    const sim = ehLucro();
    j.querySelectorAll('.lanc-socio').forEach((x) => x.classList.toggle('escondido', !sim));
    ['grupo', 'cliente_id', 'favorecido', 'referencia', 'cobranca', 'chave_pix'].forEach((n) => { const c = f[n] && f[n].closest('.campo'); if (c) c.classList.toggle('escondido', sim); });
    if (sim && !f.descricao.value.trim()) f.descricao.value = 'Distribuição de lucros' + (f.socio.value ? ' — ' + f.socio.value : '');
  };
  if (tipo === 'despesa') { f.categoria.onchange = ajustarLucro; f.socio.onchange = () => { if (/^Distribuição de lucros/.test(f.descricao.value) || !f.descricao.value.trim()) f.descricao.value = 'Distribuição de lucros' + (f.socio.value ? ' — ' + f.socio.value : ''); }; ajustarLucro(); }
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  f.onsubmit = (ev) => { ev.preventDefault(); j.querySelector('#btn-salvar-lanc').click(); };
  const apos = depois || recarregar;

  j.querySelector('#btn-salvar-lanc').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const valor = lerValor(f.valor.value);
    if (!f.descricao.value.trim()) throw new Error('Preencha a descrição.');
    if (!(valor > 0)) throw new Error('Informe um valor maior que zero (ex.: 1.500,00).');
    if (!f.vencimento.value) throw new Error('Informe o vencimento.');
    if (tipo === 'despesa' && /^distribui/i.test(f.categoria.value) && !f.socio.value) throw new Error('Escolha o sócio que recebeu a distribuição de lucros.');
    const lucro = tipo === 'despesa' && /^distribui/i.test(f.categoria.value);
    const grupo_id = lucro ? null : await grupoPorNome(f.grupo.value);
    const dados = {
      tipo, empresa: f.empresa.value, descricao: f.descricao.value.trim(), valor, vencimento: f.vencimento.value,
      grupo_id, cliente_id: lucro ? null : (f.cliente_id.value || null), categoria: f.categoria.value.trim(), servico: f.servico ? f.servico.value : (l.servico || ''),
      favorecido: lucro ? f.socio.value : f.favorecido ? f.favorecido.value.trim() : (l.favorecido || ''),
      responsavel: f.responsavel.value.trim(), referencia: f.referencia.value.trim(),
      cobranca: f.pago.checked ? '' : f.cobranca.value.trim(), chave_pix: f.chave_pix.value.trim(),
      pago: f.pago.checked,
      data_pagamento: f.pago.checked ? (f.data_pagamento.value || hojeISO()) : null,
      forma_pagamento: f.pago.checked ? f.forma_pagamento.value.trim() : '',
      conta: f.pago.checked ? f.conta.value.trim() : (l.conta || ''),
      perda: f.perda ? f.perda.checked && !f.pago.checked : false,
      redutor: f.redutor ? f.redutor.checked : false,
      obs: f.obs.value.trim()
    };
    if (novo) {
      if (l.contrato_id) dados.contrato_id = l.contrato_id;
      const n = Number(f.repetir.value) || 1;
      const linhas = [];
      for (let i = 0; i < n; i++) {
        linhas.push(Object.assign({}, dados, {
          vencimento: somarMeses(dados.vencimento, i),
          descricao: n > 1 ? dados.descricao + ' (' + (i + 1) + '/' + n + ')' : dados.descricao,
          pago: i === 0 ? dados.pago : false,
          data_pagamento: i === 0 ? dados.data_pagamento : null,
          forma_pagamento: i === 0 ? dados.forma_pagamento : ''
        }));
      }
      await q(sb.from('lancamentos').insert(linhas));
      aviso(n > 1 ? '✓ ' + n + ' lançamentos criados.' : '✓ Lançamento salvo.');
    } else {
      await q(sb.from('lancamentos').update(dados).eq('id', l.id));
      aviso('✓ Alterações salvas.');
    }
    fecharJanela(j); await apos();
  });
  const bx = j.querySelector('#btn-excluir-lanc');
  if (bx) bx.onclick = () => comBotao(bx, async () => {
    if (!confirm('Excluir este lançamento? Esta ação não pode ser desfeita.')) return;
    await excluir('lancamentos', l.id);
    aviso('Lançamento excluído.'); fecharJanela(j); await apos();
  });
}


// Detalhe de um honorário/lançamento (clique na linha do Financeiro): o que é, de quem, contrato e ações
// Backup 42: cobrança simples pelo WhatsApp — "Bom dia! Passando para lembrar dos honorários do mês tal, referente ao serviço tal."
const MESES_EXT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function textoCobranca(l) {
  const ref = String(l.competencia || l.vencimento || '').slice(0, 7), mes = ref ? MESES_EXT[+ref.slice(5, 7) - 1] + (ref.slice(0, 4) !== hojeISO().slice(0, 4) ? ' de ' + ref.slice(0, 4) : '') : '';
  const oQue = (l.servico || l.descricao || 'honorários').replace(/^honor[aá]rios?\s*[—-]?\s*/i, '').trim();
  const venc = l.vencimento ? (l.vencimento < hojeISO() ? ', que venceram em ' : ', com vencimento em ') + dataBR(l.vencimento) : '';
  return saudacaoGuia() + ' Passando para lembrar dos honorários' + (mes ? ' do mês de ' + mes : '') + (oQue ? ', referente ' + (/^(a|à|ao|aos|às)\s/i.test(oQue) ? '' : 'a ') + oQue : '') +
    ', no valor de ' + brl(l.valor || 0) + venc + '.\n\nQualquer dúvida, estou à disposição.';
}
async function cobrarWhatsApp(id) {
  if (!E.clientes.length) await carregarCadastros();
  const l = (await q(sb.from('lancamentos').select('id, descricao, servico, valor, vencimento, competencia, cliente_id, grupo_id, cobranca').eq('id', id)))[0];
  if (!l) return aviso('Lançamento não encontrado.', true);
  const c = E.clientes.find((x) => x.id === l.cliente_id) || {};
  // Backup 49 (24): o mesmo botão cobra por WhatsApp OU por e-mail (modelo bonito; respeita a chave "Recebe e-mails" do cliente)
  const naoRecebe = c.recebe_email === false;
  const j = abrirJanela({ titulo: '💬 Cobrar' + (c.nome ? ' — ' + c.nome : ''),
    corpo: '<div class="fila-chips cb-canal" role="group" aria-label="Como cobrar"><span class="fila-chips-rot">Por</span>' +
        '<button type="button" class="fila-chip ativo" data-cb-canal="zap">WhatsApp</button><button type="button" class="fila-chip" data-cb-canal="email">E-mail</button></div>' +
      '<div class="grade">' + campo('WhatsApp', '<input id="cb-tel" data-mascara="tel" inputmode="tel" value="' + esc(c.telefone || '') + '" placeholder="(37) 9 9999-9999">', 'cb-so-zap') +
      campo('E-mail', '<input id="cb-para" type="email" placeholder="email@cliente.com.br"' + (naoRecebe ? ' disabled' : '') + '>', 'cb-so-email escondido') +
      (naoRecebe ? '<div class="dica aviso-amarelo inteiro cb-so-email escondido">Este cliente está marcado para <b>não receber e-mails</b>. Para mandar, mude em Clientes → ✉ Recebe e-mails.</div>' : '') +
      campo('Mensagem', '<textarea id="cb-txt" rows="6">' + esc(textoCobranca(l)) + '</textarea>', 'inteiro') +
      '<p class="sub inteiro">Ao copiar, abrir o WhatsApp ou enviar o e-mail, o lançamento fica marcado como <b>COBRADO</b>.</p></div>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Fechar</button>' +
      '<button class="btn btn-o cb-so-zap" type="button" id="cb-copiar">📋 Copiar</button><button class="btn btn-v cb-so-zap" type="button" id="cb-zap">💬 Abrir WhatsApp</button>' +
      '<button class="btn btn-o cb-so-email escondido" type="button" id="cb-previa">👁 Prévia</button><button class="btn btn-p cb-so-email escondido" type="button" id="cb-email"' + (naoRecebe ? ' disabled' : '') + '>✉ Enviar e-mail</button></div>' });
  let paraCarregado = false;
  j.querySelector('.cb-canal').onclick = async (ev) => {
    const b = ev.target.closest('[data-cb-canal]'); if (!b) return;
    j.querySelectorAll('[data-cb-canal]').forEach((x) => x.classList.toggle('ativo', x === b));
    const email = b.dataset.cbCanal === 'email';
    j.querySelectorAll('.cb-so-zap').forEach((x) => x.classList.toggle('escondido', email));
    j.querySelectorAll('.cb-so-email').forEach((x) => x.classList.toggle('escondido', !email));
    if (email && !paraCarregado) { paraCarregado = true;
      const m = await q(sb.rpc('cobranca_email_html', { p_lanc: id, p_texto: '' })).catch(() => null);
      if (m && !j.querySelector('#cb-para').value) j.querySelector('#cb-para').value = m.para || ''; }
  };
  j.querySelector('#cb-previa').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const m = await q(sb.rpc('cobranca_email_html', { p_lanc: id, p_texto: j.querySelector('#cb-txt').value }));
    verEmailHtml(m.assunto, m.html);
  });
  // Backup 43: marca "Cobrado" só nesta linha (antes recarregava todos os dados do sistema — era isso que demorava)
  const marcar = () => q(sb.from('lancamentos').update({ cobranca: 'Cobrado' }).eq('id', id).select('id')).then(() => {
    document.querySelectorAll('[data-cobrar="' + id + '"]').forEach((b) => { b.textContent = '✓ Cobrado'; b.classList.add('gx-cobrado'); });
  }).catch((e) => aviso(erroAmigavel(e), true));
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#cb-copiar').onclick = (ev) => comBotao(ev.currentTarget, async () => { await copiarTexto(j.querySelector('#cb-txt').value); aviso('✓ Texto copiado — cole no WhatsApp.'); marcar(); });
  j.querySelector('#cb-zap').onclick = () => { const tel = soDigitos(j.querySelector('#cb-tel').value);
    window.open('https://wa.me/' + (tel ? (tel.length <= 11 ? '55' : '') + tel : '') + '?text=' + encodeURIComponent(j.querySelector('#cb-txt').value), '_blank', 'noopener'); marcar(); };
  j.querySelector('#cb-email').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const r = await q(sb.rpc('cobrar_por_email', { p_lanc: id, p_para: j.querySelector('#cb-para').value.trim(), p_texto: j.querySelector('#cb-txt').value }));
    document.querySelectorAll('[data-cobrar="' + id + '"]').forEach((b) => { b.textContent = '✓ Cobrado'; b.classList.add('gx-cobrado'); });
    fecharJanela(j); const s2 = await enviarEmailAgora(r.ref, r.para); aviso('Cobrança: ' + (s2.ok ? '✓ ' : '⚠ ') + s2.msg, !s2.ok);
  });
  return j;
}
async function detalheLancamento(id) {
  const l = (await q(sb.from('lancamentos').select('*, grupos(nome), clientes(nome), contratos(descricao, modalidade, servico)').eq('id', id)))[0];
  if (!l) return aviso('Lançamento não encontrado (pode ter sido excluído ou ser de outra área).', true);
  const lin = (rot, v) => v ? '<div class="tf-lin"><span>' + rot + '</span><div>' + v + '</div></div>' : '';
  const empresa = l.empresa === 'contabilidade' ? 'Contabilidade' : 'Jurídico';
  const j = abrirJanela({ titulo: (l.tipo === 'despesa' ? 'Despesa' : l.redutor ? 'Redutor de receita' : 'Honorário') + ' — ' + empresa, larga: true,
    corpo: '<div class="tf-ficha"><div class="tf-ficha-hd"><h3>' + esc(l.descricao) + '</h3><div class="tf-selos">' + pillSit(l) +
        (l.servico ? ' <span class="pill neutro">' + esc(l.servico) + '</span>' : '') + (l.categoria ? ' <span class="pill neutro">' + esc(l.categoria) + '</span>' : '') + '</div></div>' +
      '<div class="tf-grade">' +
        lin('Valor', '<b>' + (l.redutor || l.tipo === 'despesa' ? '− ' : '') + brl(l.valor) + '</b>') +
        lin('Vencimento', dataBR(l.vencimento)) + lin('Recebido em', l.pago ? dataBR(l.data_pagamento) + (l.forma_pagamento ? ' · ' + esc(l.forma_pagamento) : '') : '') +
        lin('Grupo', esc((l.grupos && l.grupos.nome) || '')) + lin('Cliente', esc((l.clientes && l.clientes.nome) || '')) + lin('Favorecido', esc(l.favorecido || '')) +
        lin('Responsável', l.responsavel ? pillPessoa(l.responsavel) : '') + lin('Área do serviço', esc(l.servico || '')) + lin('Tipo', esc(l.categoria || '')) +
        lin('Referência', esc(l.referencia || '')) + lin('Situação da cobrança', esc(l.cobranca || '')) +
        lin('Contrato', l.contratos ? esc(l.contratos.descricao) + (l.contratos.modalidade === 'consultoria' ? ' <span class="sub">(consultoria mensal)</span>' : '') : '') +
      '</div>' + (l.obs ? '<div class="tf-bloco"><div class="secao">Observação</div><div class="tf-texto">' + esc(l.obs).replace(/\n/g, '<br>') + '</div></div>' : '') + '</div>',
    rodape: '<span>' + (l.contrato_id ? '<button class="btn btn-o btn-mini" type="button" id="dl-ctr">Abrir contrato</button> ' : '') +
        (l.cliente_id ? '<button class="btn btn-o btn-mini" type="button" id="dl-cli">Ficha do cliente</button>' : '') +
        // Backup 32: recibo já preenchido na Central de Documentos (valor, data, forma e cliente)
        '</span>' +
      '<div class="acoes">' + (l.pago && l.tipo === 'receita' && !l.redutor ? '<button class="btn btn-o" type="button" id="dl-recibo" title="Recibo deste pagamento na Central de Documentos (já preenchido)">🧾 Recibo</button>' : '') +
      '<button class="btn btn-o" type="button" data-editar="' + l.id + '">✎ Editar</button>' +
      (!l.pago && !l.perda ? '<button class="btn btn-v" type="button" data-pagar="' + l.id + '">✓ ' + (l.tipo === 'despesa' && !l.redutor ? 'Pago' : 'Recebido') + '</button>' : '') + '</div>' });
  ligarAcoesLancamentos(j, async () => { fecharJanela(j); if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); else await recarregar(); });
  // Backup 58: "✎ Editar" troca o detalhe pelo formulário (não empilha duas janelas)
  const be = j.querySelector('[data-editar]'); if (be) { const ed = be.onclick; be.onclick = () => { fecharJanela(j); return ed(); }; }
  const bc = j.querySelector('#dl-ctr'); if (bc) bc.onclick = () => { fecharJanela(j); detalheContrato(l.contrato_id); };
  const br = j.querySelector('#dl-recibo'); if (br) br.onclick = () => { fecharJanela(j); abrirGerador('lancamento=' + l.id); };
  const bl = j.querySelector('#dl-cli'); if (bl) bl.onclick = () => { fecharJanela(j); abrirFicha(l.cliente_id); };
  return j;
}


// ═══ Backup 54: "+ Lançar → Recebimento" — achar o honorário em aberto e dar baixa sem sair da tela onde está ═══
async function janelaReceber(depois) {
  const L = await buscarTodos(() => sb.from('lancamentos').select('id, descricao, vencimento, valor, redutor, empresa, cliente_id, grupo_id, grupos(nome), clientes(nome)').eq('tipo', 'receita').eq('pago', false).eq('perda', false).order('vencimento').order('id')).catch(() => []);
  const j = abrirJanela({ titulo: '+ Lançar recebimento', larga: true,
    corpo: '<input class="busca" id="rc-busca" placeholder="Buscar cliente, grupo ou descrição" autocomplete="off" style="width:100%;margin-bottom:10px"><div id="rc-lista"></div>' });
  const pintar = () => { const b = normalizar(j.querySelector('#rc-busca').value);
    const ver = L.filter((l) => !b || normalizar([l.descricao, l.clientes && l.clientes.nome, l.grupos && l.grupos.nome].join(' ')).includes(b)).slice(0, 60);
    j.querySelector('#rc-lista').innerHTML = ver.length ? '<div class="tabela-wrap"><table><thead><tr><th>Vencimento</th><th>Cliente / grupo</th><th>Descrição</th><th>Valor</th><th></th></tr></thead><tbody>' +
      ver.map((l) => '<tr><td>' + dataBR(l.vencimento) + '</td><td>' + esc((l.clientes && l.clientes.nome) || (l.grupos && l.grupos.nome) || '—') + '</td><td>' + esc(l.descricao || '') + '</td>' +
        '<td class="col-valor">' + brl(l.valor) + '</td><td class="acoes-l"><button type="button" class="btn btn-v btn-mini" data-rc="' + l.id + '">✓ Recebido</button></td></tr>').join('') + '</tbody></table></div>'
      : vazio(L.length ? 'Nada com essa busca.' : 'Nenhum honorário em aberto.');
    j.querySelectorAll('[data-rc]').forEach((bt) => bt.onclick = () => comBotao(bt, async () => {
      if (!window.ERP_EDITOR || !window.ERP_EDITOR.baixaRapida) throw new Error('Abra o ERP completo para dar baixa.');
      const r = await window.ERP_EDITOR.baixaRapida('lancamentos', bt.dataset.rc, { semRecarregar: true });
      if (r) { const i = L.findIndex((x) => x.id === bt.dataset.rc); if (i >= 0) L.splice(i, 1); pintar(); if (depois) depois(); } })); };
  let t; j.querySelector('#rc-busca').oninput = () => { clearTimeout(t); t = setTimeout(pintar, 200); };
  pintar(); j.querySelector('#rc-busca').focus();
  return j;
}
