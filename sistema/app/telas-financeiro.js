'use strict';
// ═══════════════════════════════════════════════════════════════════
// Honorários Jurídico (empresa 'escritorio') e Honorários Contabilidade
// (empresa 'contabilidade'). Mesma tela, mesmas abas do ERP antigo.
// A barra de filtros é montada uma vez; filtro repinta só #fin-corpo.
// ═══════════════════════════════════════════════════════════════════

const EMPRESAS = {
  escritorio:    { tela: 'juridico',      titulo: 'Honorários Jurídico',      sub: 'Honorários do escritório · recebimentos · análise por pessoa e por período' },
  contabilidade: { tela: 'contabilidade', titulo: 'Honorários Contabilidade', sub: 'Financeiro da empresa de contabilidade · a receber, a pagar, receita e despesa' }
};
const ABAS_FIN = [
  { id: 'analise',   rot: '📊 Análise' },
  { id: 'areceber',  rot: '📋 A Receber' },
  { id: 'recebidos', rot: '✅ Recebidos' },
  { id: 'prejuizo',  rot: '📉 Prejuízo' },
  { id: 'apagar',    rot: '📤 A Pagar' },
  { id: 'despesas',  rot: '💸 Despesas pagas' }
];
// Abas que mostram "todos os meses" ao abrir; as demais abrem no mês atual.
const ABRE_EM_TODOS = { areceber: true, apagar: true, prejuizo: true };

function estadoFin(empresa) {
  E.fin = E.fin || {};
  if (!E.fin[empresa]) E.fin[empresa] = { aba: 'analise', mes: primeiroDiaDoMes(new Date()), todos: false, grupo: '', resp: '', busca: '' };
  return E.fin[empresa];
}

TELAS.juridico = () => telaHonorarios('escritorio');
TELAS.contabilidade = () => telaHonorarios('contabilidade');

async function telaHonorarios(empresa) {
  const F = estadoFin(empresa), info = EMPRESAS[empresa];
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>' + info.titulo + '</h1><p>' + info.sub + '</p></div>' +
    '<div class="acoes"><button class="btn btn-p" data-novo-l="receita">+ Receita</button>' +
    '<button class="btn btn-o" data-novo-l="despesa">+ Despesa</button></div></div>' +
    '<div class="abas" id="fin-abas">' + ABAS_FIN.map((a) => '<button data-aba="' + a.id + '">' + a.rot + '</button>').join('') + '</div>' +
    '<div class="filtros" id="fin-barra">' +
    '<div class="mes-sel" id="fin-mes"><button data-mes="-1" aria-label="Mês anterior">‹</button><span></span><button data-mes="1" aria-label="Próximo mês">›</button></div>' +
    '<button class="chip" id="fin-todos">Todos os meses</button>' +
    '<select class="busca sel" id="fin-grupo" autocomplete="off"><option value="">Todos os grupos</option>' +
    E.grupos.map((g) => '<option value="' + g.id + '">' + esc(g.nome) + '</option>').join('') + '</select>' +
    '<select class="busca sel" id="fin-resp" autocomplete="off"><option value="">Todas as pessoas</option>' +
    Object.keys(PESSOA).map((p) => '<option>' + p + '</option>').join('') + '</select>' +
    '<input class="busca" id="fin-busca" placeholder="Buscar descrição, grupo ou fornecedor" autocomplete="off">' +
    '<span class="pill neutro periodo" id="fin-periodo"></span>' +
    '</div><div id="fin-corpo"><div class="carregando">Carregando…</div></div>';

  const c = $('conteudo');
  c.querySelectorAll('[data-novo-l]').forEach((b) => b.onclick = () =>
    formLancamento({ tipo: b.dataset.novoL, empresa, grupo_id: F.grupo || null }, () => pintarFin(empresa)));
  c.querySelectorAll('#fin-abas [data-aba]').forEach((b) => b.onclick = () => {
    F.aba = b.dataset.aba; F.todos = !!ABRE_EM_TODOS[F.aba]; pintarFin(empresa);
  });
  c.querySelectorAll('#fin-mes [data-mes]').forEach((b) => b.onclick = () => {
    F.mes = new Date(F.mes.getFullYear(), F.mes.getMonth() + Number(b.dataset.mes), 1); F.todos = false; pintarFin(empresa);
  });
  $('fin-todos').onclick = () => { F.todos = !F.todos; pintarFin(empresa); };
  $('fin-grupo').onchange = (ev) => { F.grupo = ev.target.value; pintarFin(empresa); };
  $('fin-resp').onchange = (ev) => { F.resp = ev.target.value; pintarFin(empresa); };
  let t;
  $('fin-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarLista(empresa); }, 250); };
  await pintarFin(empresa);
}

// Atualiza a barra no lugar (sem recriar) e repinta o corpo.
function sincronizarBarraFin(empresa) {
  const F = estadoFin(empresa);
  document.querySelectorAll('#fin-abas [data-aba]').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === F.aba));
  const semMes = F.aba === 'prejuizo';
  $('fin-mes').classList.toggle('escondido', semMes);
  $('fin-todos').classList.toggle('escondido', semMes || F.aba === 'analise');
  $('fin-todos').classList.toggle('ativo', F.todos);
  $('fin-mes').classList.toggle('apagado', F.todos && F.aba !== 'analise');
  $('fin-mes').querySelector('span').textContent = nomeMes(F.mes);
  const g = $('fin-grupo'), r = $('fin-resp'), b = $('fin-busca');
  if (document.activeElement !== g) g.value = F.grupo;
  if (document.activeElement !== r) r.value = F.resp;
  if (document.activeElement !== b) b.value = F.busca;
  const periodo = F.aba === 'prejuizo' ? 'Todos os meses'
    : F.aba === 'analise' ? 'Referência: ' + nomeMes(F.mes)
    : F.todos ? 'Todos os meses' : nomeMes(F.mes);
  const recorte = [periodo, F.grupo ? nomeGrupo(F.grupo) : '', F.resp].filter(Boolean).join(' · ');
  $('fin-periodo').textContent = '🗓 ' + recorte;
}

function consultaBase(empresa) {
  const F = estadoFin(empresa);
  let q1 = sb.from('lancamentos').select('*, grupos(nome), clientes(nome), contratos(descricao)').eq('empresa', empresa);
  if (F.grupo) q1 = q1.eq('grupo_id', F.grupo);
  if (F.resp) q1 = q1.eq('responsavel', F.resp);
  return q1;
}

async function pintarFin(empresa) {
  sincronizarBarraFin(empresa);
  const F = estadoFin(empresa), corpo = $('fin-corpo');
  corpo.innerHTML = '<div class="carregando">Carregando…</div>';
  try {
    if (F.aba === 'analise') await pintarAnalise(empresa);
    else await pintarLista(empresa, true);
  } catch (e) {
    console.error(e);
    corpo.innerHTML = '<div class="card"><div class="card-bd msg-erro">' + esc(erroAmigavel(e)) + '</div></div>';
  }
}

// ───────────────────────────── listas ──────────────────────────────
let _listaFin = [];
async function pintarLista(empresa, buscar) {
  const F = estadoFin(empresa);
  if (buscar) {
    const ini = iso(F.mes), fim = iso(fimDoMes(F.mes));
    _listaFin = await buscarTodos(() => {
      let c = consultaBase(empresa);
      switch (F.aba) {
        case 'areceber':  c = c.eq('tipo', 'receita').eq('pago', false).eq('perda', false); break;
        case 'recebidos': c = c.eq('tipo', 'receita').eq('pago', true); break;
        case 'prejuizo':  c = c.eq('tipo', 'receita').eq('perda', true); break;
        case 'apagar':    c = c.eq('tipo', 'despesa').eq('pago', false); break;
        case 'despesas':  c = c.eq('tipo', 'despesa').eq('pago', true); break;
      }
      const porPagamento = F.aba === 'recebidos' || F.aba === 'despesas';
      if (!F.todos && F.aba !== 'prejuizo') {
        const campo = porPagamento ? 'data_pagamento' : 'vencimento';
        c = c.gte(campo, ini).lte(campo, fim);
      }
      return c.order(porPagamento ? 'data_pagamento' : 'vencimento', { ascending: !porPagamento }).order('descricao');
    });
  }
  let lista = _listaFin;
  if (F.busca) {
    const b = normalizar(F.busca);
    lista = lista.filter((l) => normalizar([l.descricao, l.grupos && l.grupos.nome, l.clientes && l.clientes.nome, l.favorecido, l.categoria, l.obs].join(' ')).includes(b));
  }
  const total = soma(lista, vl);
  const atrasado = soma(lista.filter((l) => situacao(l) === 'vencido'), vl);
  const rotAba = ABAS_FIN.find((a) => a.id === F.aba).rot.replace(/^\S+\s/, '');
  $('fin-corpo').innerHTML =
    '<div class="kpis">' +
    kpi(rotAba, brl(total), F.aba === 'prejuizo' || F.aba === 'apagar' ? 'ambar' : F.aba === 'recebidos' ? 'verde' : '', lista.length + ' lançamento(s)') +
    (F.aba === 'areceber' || F.aba === 'apagar' ? kpi('Em atraso', brl(atrasado), 'vermelho', lista.filter((l) => situacao(l) === 'vencido').length + ' vencido(s)') : '') +
    '</div>' +
    '<div class="card">' + tabelaLancamentos(lista, { aba: F.aba }) + '</div>';
  ligarAcoesLancamentos($('fin-corpo'), () => pintarFin(empresa));
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
        (comAtraso ? '<td data-ord="' + (l.pago || l.perda || !l.vencimento ? 99999 : diasAte(l.vencimento)) + '">' + (l.pago ? '<span class="pill pago">pago</span>' : l.perda ? pillSit(l) : celulaAtraso(l.vencimento, l)) + '</td>' : '') +
        '<td class="acoes-l">' +
        (l.pago ? '<button class="btn btn-o btn-mini" data-desfazer="' + l.id + '" title="Voltar para em aberto">↺</button> '
                : l.perda ? '' : '<button class="btn btn-v btn-mini" data-pagar="' + l.id + '" title="Dar baixa — ' + (l.tipo === 'despesa' && !l.redutor ? 'pago' : 'recebido') + ' (pergunta a data)">✓ Baixa</button> ') +
        '<button class="btn btn-o btn-mini btn-ed" data-editar="' + l.id + '" title="Editar" aria-label="Editar">✎</button></td></tr>';
    }).join('') +
    '</tbody><tfoot><tr><td colspan="' + ((lote ? 1 : 0) + (compacta ? 0 : 2) + (comDesc ? 1 : 0)) + '">Total (' + lista.length + ')</td><td class="num mono">' +
    brl(soma(lista, (l) => l.tipo === 'despesa' ? -l.valor : vl(l))) + '</td><td colspan="' + (nCols - (lote ? 1 : 0) - (compacta ? 0 : 2) - (comDesc ? 1 : 0) - 1) + '"></td></tr></tfoot></table></div></div>';
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

// ───────────────────────────── análise ─────────────────────────────
async function pintarAnalise(empresa) {
  const F = estadoFin(empresa), h = hojeISO();
  const ini12 = iso(new Date(F.mes.getFullYear(), F.mes.getMonth() - 11, 1));
  const fimRef = iso(fimDoMes(F.mes)), iniRef = iso(F.mes);
  const fim3 = iso(fimDoMes(new Date(F.mes.getFullYear(), F.mes.getMonth() + 3, 1)));
  const [pagos, abertos, perdas] = await Promise.all([
    buscarTodos(() => consultaBase(empresa).eq('pago', true).gte('data_pagamento', ini12).lte('data_pagamento', fimRef)),
    buscarTodos(() => consultaBase(empresa).eq('pago', false).eq('perda', false)),
    buscarTodos(() => consultaBase(empresa).eq('tipo', 'receita').eq('perda', true))
  ]);
  const rec = (l) => l.tipo === 'receita', desp = (l) => l.tipo === 'despesa';
  const noMes = (l) => l.data_pagamento >= iniRef && l.data_pagamento <= fimRef;
  const recebidoMes = soma(pagos.filter((l) => rec(l) && noMes(l)), vl);
  const pagoMes = soma(pagos.filter((l) => desp(l) && noMes(l)), vl);
  const aReceber = abertos.filter(rec), aPagar = abertos.filter(desp);
  const atraso = aReceber.filter((l) => l.vencimento < h);
  const aReceberMes = aReceber.filter((l) => l.vencimento >= iniRef && l.vencimento <= fimRef);

  // série mensal: 12 meses recebidos + 3 meses previstos (a receber)
  const serie = [];
  const mesAtual = iso(primeiroDiaDoMes(new Date())).slice(0, 7);
  for (let i = -11; i <= 3; i++) {
    const d = new Date(F.mes.getFullYear(), F.mes.getMonth() + i, 1), chave = iso(d).slice(0, 7);
    const futuro = chave > mesAtual;
    const valor = futuro
      ? soma(aReceber.filter((l) => l.vencimento.slice(0, 7) === chave), vl)
      : soma(pagos.filter((l) => rec(l) && l.data_pagamento.slice(0, 7) === chave), vl);
    if (i > 0 && !futuro) continue;              // mês de referência no passado: não mostra "futuro" já ocorrido
    serie.push({ rotulo: mesCurto(d), valor, estado: futuro ? 'futuro' : chave === mesAtual ? 'atual' : 'passado',
                 dica: nomeMes(d) + ': ' + brl(valor) + (futuro ? ' a receber (previsto)' : ' recebido') });
  }
  // em aberto por grupo (top 10)
  const porGrupo = {};
  aReceber.forEach((l) => { const n = (l.grupos && l.grupos.nome) || l.favorecido || 'Sem grupo'; porGrupo[n] = (porGrupo[n] || 0) + vl(l); });
  const topGrupos = Object.entries(porGrupo).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([rotulo, valor]) => ({ rotulo, valor }));
  // recebido no mês por pessoa
  const porPessoa = {};
  pagos.filter((l) => rec(l) && noMes(l)).forEach((l) => { const p = l.responsavel || 'Sem pessoa'; porPessoa[p] = (porPessoa[p] || 0) + vl(l); });

  $('fin-corpo').innerHTML =
    '<div class="kpis">' +
    kpi('Recebido em ' + nomeMes(F.mes).split(' ')[0].toLowerCase(), brl(recebidoMes), 'verde', pagos.filter((l) => rec(l) && noMes(l)).length + ' recebimento(s)') +
    kpi('A receber no mês', brl(soma(aReceberMes, vl)), '', aReceberMes.length + ' em aberto') +
    kpi('Total em aberto', brl(soma(aReceber, vl)), '', aReceber.length + ' lançamento(s), todos os meses') +
    kpi('Em atraso', brl(soma(atraso, vl)), 'vermelho', atraso.length + ' vencido(s)') +
    (aPagar.length || pagoMes ? kpi('A pagar (aberto)', brl(soma(aPagar, vl)), 'ambar', 'pago no mês: ' + brl(pagoMes)) : '') +
    kpi('Prejuízo', brl(soma(perdas, vl)), 'ambar', perdas.length + ' crédito(s) perdido(s)') +
    '</div>' +
    blocoRecolhivel('fin-g-mensal-' + empresa, '📊 Recebido por mês e previsão', '<div class="card-bd">' + graficoMensal(serie, { titulo: 'Recebido por mês' }) + '</div>') +
    '<div class="duas-col">' +
    blocoRecolhivel('fin-g-grupo-' + empresa, '💰 Em aberto por grupo (10 maiores)', '<div class="card-bd">' + graficoRanking(topGrupos, { titulo: 'Em aberto por grupo' }) + '</div>') +
    blocoRecolhivel('fin-g-pessoa-' + empresa, '👤 Recebido no mês por pessoa', '<div class="card-bd">' + barrasPessoa(porPessoa) + '</div>') +
    '</div>' +
    '<div class="card"><div class="card-hd">⚠ Em atraso<span class="pill neutro">' + atraso.length + '</span></div>' + tabelaLancamentos(atraso.sort((a, b) => a.vencimento < b.vencimento ? -1 : 1), { aba: 'areceber' }) + '</div>';
  ligarAcoesLancamentos($('fin-corpo'), () => pintarFin(empresa));
}

// Barras por pessoa: a cor é a identidade da pessoa (única exceção à rampa azul).
function barrasPessoa(mapa) {
  const itens = Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  if (!itens.length) return '<div class="vazio">Nenhum recebimento no mês.</div>';
  const max = Math.max(...itens.map((i) => i[1]), 1);
  return '<div class="barras-pessoa">' + itens.map(([p, v]) => {
    const c = corPessoa(p);
    return '<div class="bp" data-dica="' + esc(p + ': ' + brl(v)) + '"><span class="bp-nome">' + esc(p) + '</span>' +
      '<span class="bp-trilho"><span class="bp-barra" style="width:' + (v / max * 100).toFixed(1) + '%;background:' + c.marca + '"></span></span>' +
      '<span class="mono bp-val">' + esc(brlCurto(v)) + '</span></div>';
  }).join('') + '</div>';
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
      '<div class="acoes"><button class="btn btn-o" type="button" data-editar="' + l.id + '">✎ Editar</button>' +
      (!l.pago && !l.perda ? '<button class="btn btn-v" type="button" data-pagar="' + l.id + '">✓ ' + (l.tipo === 'despesa' && !l.redutor ? 'Pago' : 'Recebido') + '</button>' : '') + '</div>' });
  ligarAcoesLancamentos(j, async () => { fecharJanela(j); if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); else await recarregar(); });
  const bc = j.querySelector('#dl-ctr'); if (bc) bc.onclick = () => { fecharJanela(j); detalheContrato(l.contrato_id); };
  const bl = j.querySelector('#dl-cli'); if (bl) bl.onclick = () => { fecharJanela(j); abrirFicha(l.cliente_id); };
  return j;
}

