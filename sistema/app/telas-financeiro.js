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
function tabelaLancamentos(lista, opc) {
  opc = opc || {};
  if (!lista.length) return '<div class="vazio">Nenhum lançamento aqui.</div>';
  const porPagamento = opc.aba === 'recebidos' || opc.aba === 'despesas';
  const compacta = !!opc.compacta;
  // opc.semDescricao / opc.semSituacao / opc.semCobranca: relatórios do Início (janela larga, menos colunas)
  const comDesc = !opc.semDescricao, comSit = !opc.semSituacao;
  return '<div class="tabela-wrap"><table class="ordenavel' + (opc.semDescricao ? ' tab-rel' : '') + '"><thead><tr>' +
    '<th data-tipo="data">' + (porPagamento ? 'Pago em' : 'Vencimento') + '</th>' +
    (compacta ? '' : '<th>Grupo / Favorecido</th>') + (comDesc ? '<th>Descrição</th>' : '') +
    (compacta ? '' : '<th>Pessoa</th>') + '<th class="num">Valor</th>' + (comSit ? '<th>Situação</th>' : '') + '<th class="sem-ordem"></th></tr></thead><tbody>' +
    lista.map((l) => {
      const data = porPagamento ? l.data_pagamento : l.vencimento;
      const quem = (l.grupos && l.grupos.nome) || l.favorecido || (l.clientes && l.clientes.nome) || '';
      return '<tr class="clicavel" data-lanc="' + l.id + '" title="Clique para ver o detalhe"><td class="mono" data-ord="' + esc(data || '') + '">' + dataBR(data) +
        (porPagamento && l.vencimento !== data ? '<div class="sub">venc. ' + dataBR(l.vencimento) + '</div>' : '') + '</td>' +
        (compacta ? '' : '<td title="' + esc(quem) + '"><b>' + esc(quem || '—') + '</b>' + (l.clientes && l.grupos ? '<div class="sub">' + esc(l.clientes.nome) + '</div>' : '') + '</td>') +
        (comDesc ? '<td>' + esc(l.descricao) + (!compacta && legendaLanc(l) ? '<div class="sub">' + esc(legendaLanc(l)) + '</div>' : '') + '</td>' : '') +
        (compacta ? '' : '<td>' + pillPessoa(l.responsavel) + '</td>') +
        '<td class="num mono ' + (l.tipo === 'receita' && !l.redutor ? 'valor-rec' : 'valor-desp') + '" data-ord="' + (l.tipo === 'despesa' ? -l.valor : vl(l)) + '">' + (l.tipo === 'despesa' || l.redutor ? '−\u00A0' : '') + brl(l.valor) + (l.redutor ? '<div class="sub">redutor</div>' : '') + '</td>' +
        (comSit ? '<td>' + (opc.semCobranca ? pillSit(Object.assign({}, l, { cobranca: '' })) : pillSit(l)) + '</td>' : '') + '<td class="acoes-l">' +
        (l.pago ? '<button class="btn btn-o btn-mini" data-desfazer="' + l.id + '" title="Voltar para em aberto">↺</button> '
                : l.perda ? '' : '<button class="btn btn-v btn-mini" data-pagar="' + l.id + '" title="Recebido (pergunta a data)">✓ Recebido</button> ') +
        '<button class="btn btn-o btn-mini" data-editar="' + l.id + '">Editar</button></td></tr>';
    }).join('') +
    '</tbody><tfoot><tr><td colspan="' + ((compacta ? 2 : 4) - (comDesc ? 0 : 1)) + '">Total (' + lista.length + ')</td><td class="num mono">' +
    brl(soma(lista, (l) => l.tipo === 'despesa' ? -l.valor : vl(l))) + '</td><td colspan="' + (comSit ? 2 : 1) + '"></td></tr></tfoot></table></div>';
}

function ligarAcoesLancamentos(raiz, depois) {
  const apos = depois || recarregar;
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
  despesa: ['Sistema/Software', 'Folha de Pagamento', 'Comissão', 'Aluguel', 'Impostos', 'Custas processuais', 'Marketing', 'Outros']
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
      campo('Categoria / tipo', '<input name="categoria" list="lanc-cat" value="' + esc(l.categoria || '') + '"><datalist id="lanc-cat">' +
        CATEGORIAS[tipo].map((c) => '<option value="' + esc(c) + '">').join('') + '</datalist>') +
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
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  f.onsubmit = (ev) => { ev.preventDefault(); j.querySelector('#btn-salvar-lanc').click(); };
  const apos = depois || recarregar;

  j.querySelector('#btn-salvar-lanc').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const valor = lerValor(f.valor.value);
    if (!f.descricao.value.trim()) throw new Error('Preencha a descrição.');
    if (!(valor > 0)) throw new Error('Informe um valor maior que zero (ex.: 1.500,00).');
    if (!f.vencimento.value) throw new Error('Informe o vencimento.');
    const grupo_id = await grupoPorNome(f.grupo.value);
    const dados = {
      tipo, empresa: f.empresa.value, descricao: f.descricao.value.trim(), valor, vencimento: f.vencimento.value,
      grupo_id, cliente_id: f.cliente_id.value || null, categoria: f.categoria.value.trim(), servico: f.servico ? f.servico.value : (l.servico || ''),
      favorecido: f.favorecido ? f.favorecido.value.trim() : (l.favorecido || ''),
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
        (l.cliente_id ? '<button class="btn btn-o btn-mini" type="button" id="dl-cli">Ficha do cliente</button>' : '') + '</span>' +
      '<div class="acoes"><button class="btn btn-o" type="button" data-editar="' + l.id + '">✎ Editar</button>' +
      (!l.pago && !l.perda ? '<button class="btn btn-v" type="button" data-pagar="' + l.id + '">✓ ' + (l.tipo === 'despesa' && !l.redutor ? 'Pago' : 'Recebido') + '</button>' : '') + '</div>' });
  ligarAcoesLancamentos(j, async () => { fecharJanela(j); if (window.ERP_RECARREGAR) window.ERP_RECARREGAR(); else await recarregar(); });
  const bc = j.querySelector('#dl-ctr'); if (bc) bc.onclick = () => { fecharJanela(j); detalheContrato(l.contrato_id); };
  const bl = j.querySelector('#dl-cli'); if (bl) bl.onclick = () => { fecharJanela(j); abrirFicha(l.cliente_id); };
  return j;
}

// ─────────── Editar em tabela / por planilha (Backup 16) ───────────
// Para completar dados importados sem detalhe (área do serviço, descrição, tipo, pessoa, datas…):
// edita na tela (Tab/Enter/colar do Excel) ou baixa a planilha, ajusta no Excel e envia de volta.
// A coluna "id" liga cada linha ao lançamento; só o que mudou é gravado.
const COLS_LANC = [
  ['vencimento', 'Vencimento', 'data'], ['descricao', 'Descrição', 'texto'], ['categoria', 'Tipo', 'texto'], ['servico', 'Área do serviço', 'area'],
  ['referencia', 'Referência', 'texto'], ['valor', 'Valor', 'valor'], ['responsavel', 'Pessoa', 'texto'], ['pago', 'Pago', 'simnao'],
  ['data_pagamento', 'Pago em', 'data'], ['obs', 'Observação', 'texto']];
const txtLanc = (l, k, t) => { const v = l[k];
  if (t === 'simnao') return v ? 'Sim' : 'Não';
  if (v == null || v === '') return '';
  if (t === 'valor') return Number(v).toFixed(2).replace('.', ',');
  if (t === 'data') return dataBR(v);
  return String(v); };
function lerCelLanc(k, t, v, rot) {
  v = String(v == null ? '' : v).trim();
  if (t === 'simnao') return /^(s|sim|x|true|1|pago)$/i.test(v);
  if (t === 'valor') { const n = lerValor(v.replace(/^R\$\s*/, '')); if (!v || isNaN(n)) throw new Error(rot + ': valor inválido ("' + v + '").'); return n; }
  if (t === 'data') { if (!v) return null; const d = /^\d{4}-\d{2}-\d{2}/.test(v) ? { iso: v.slice(0, 10) } : lerDataBR(v); if (!d) throw new Error(rot + ': data inválida ("' + v + '"), use dd/mm/aaaa.'); return d.iso; }
  if (t === 'area') { if (!v) return ''; const a = AREAS_SERVICO.find((x) => normalizar(x) === normalizar(v)); if (!a) throw new Error(rot + ': área "' + v + '" não existe (use ' + AREAS_SERVICO.join(', ') + ').'); return a; }
  if (k === 'descricao' && !v) throw new Error(rot + ': a descrição não pode ficar vazia.');
  return v;
}
async function edicaoLancamentos(empresa) {
  const nomeEmp = empresa === 'contabilidade' ? 'Contabilidade' : 'Jurídico';
  const todos = await buscarTodos(() => sb.from('lancamentos').select('*, grupos(nome), clientes(nome)').eq('empresa', empresa).order('vencimento', { ascending: false }));
  const EST = { filtro: 'sem_area', busca: '' };
  const j = abrirJanela({ titulo: '✎ Editar em tabela — Financeiro ' + nomeEmp, larga: true,
    corpo: '<div class="dica" style="margin-bottom:10px">Para completar o que veio da planilha sem detalhe. Clique numa célula e digite (<b>Tab</b> anda para a direita, <b>Enter</b> para baixo, pode <b>colar do Excel</b>). ' +
        'Ou use <b>⬇ Baixar planilha</b>, ajuste no Excel (não mexa na coluna <b>id</b>) e <b>⬆ Enviar planilha</b>. Só o que mudou é gravado.</div>' +
      '<div class="filtros" style="margin-bottom:8px"><select class="busca sel" id="ml-filtro"><option value="sem_area">Sem área do serviço</option><option value="receitas">Todas as receitas</option>' +
        '<option value="todos">Tudo (receitas e despesas)</option></select><input class="busca" id="ml-busca" placeholder="Buscar grupo, cliente ou descrição" autocomplete="off">' +
        '<span class="sub" id="ml-qtd"></span></div><div id="ml-grade"></div>',
    rodape: '<span><button class="btn btn-o" type="button" id="ml-baixar">⬇ Baixar planilha</button> <label class="btn btn-o" style="cursor:pointer">⬆ Enviar planilha<input type="file" id="ml-arq" accept=".xlsx" hidden></label></span>' +
      '<div class="acoes"><span class="sub" id="ml-conta">Nenhuma alteração</span><button class="btn btn-p" type="button" id="ml-salvar">Salvar alterações</button></div>' });
  j.querySelector('.janela').classList.add('janela-massa');
  let lista = [];
  const filtrar = () => { const b = normalizar(EST.busca);
    return todos.filter((l) => (EST.filtro === 'todos' || l.tipo === 'receita') && (EST.filtro !== 'sem_area' || !l.servico) &&
      (!b || normalizar([(l.grupos || {}).nome, (l.clientes || {}).nome, l.favorecido, l.descricao].join(' ')).includes(b))).slice(0, 400); };
  const cel = (i, c) => j.querySelector('tr[data-i="' + i + '"] [data-c="' + c + '"]');
  const marcar = (el) => { const l = lista[+el.closest('tr').dataset.i], [k, , t] = COLS_LANC[+el.dataset.c];
    el.closest('td').classList.toggle('mudou', el.value.trim() !== txtLanc(l, k, t));
    const n = new Set([...j.querySelectorAll('td.mudou')].map((td) => td.parentElement.dataset.i)).size;
    j.querySelector('#ml-conta').textContent = n ? n + ' linha(s) alterada(s)' : 'Nenhuma alteração'; };
  const pintar = () => {
    if (j.querySelector('td.mudou') && !confirm('Há alterações não salvas nesta lista. Trocar o filtro e perder essas alterações?')) return;
    lista = filtrar();
    j.querySelector('#ml-qtd').textContent = lista.length + (lista.length === 400 ? '+ (mostrando 400 — use a busca)' : '') + ' lançamento(s)';
    j.querySelector('#ml-grade').innerHTML = lista.length ? '<div class="tabela-wrap massa-wrap"><table class="massa"><thead><tr><th>Grupo / cliente</th>' +
      COLS_LANC.map(([, r, t]) => '<th' + (t === 'valor' ? ' class="num"' : '') + '>' + r + '</th>').join('') + '</tr></thead><tbody>' +
      lista.map((l, i) => '<tr data-i="' + i + '"><td class="sub">' + esc((l.grupos && l.grupos.nome) || (l.clientes && l.clientes.nome) || l.favorecido || '—') + '</td>' +
        COLS_LANC.map(([k, , t], jx) => '<td>' + (t === 'area' ? '<select data-k="' + k + '" data-c="' + jx + '"><option value=""></option>' + AREAS_SERVICO.map((a) => '<option' + (l.servico === a ? ' selected' : '') + '>' + a + '</option>').join('') + '</select>'
          : t === 'simnao' ? '<select data-k="' + k + '" data-c="' + jx + '"><option' + (l.pago ? '' : ' selected') + '>Não</option><option' + (l.pago ? ' selected' : '') + '>Sim</option></select>'
          : '<input data-k="' + k + '" data-c="' + jx + '" value="' + esc(txtLanc(l, k, t)) + '"' + (t === 'valor' ? ' inputmode="decimal" class="num"' : t === 'data' ? ' placeholder="dd/mm/aaaa" class="mono"' : '') + '>') + '</td>').join('') + '</tr>').join('') +
      '</tbody></table></div>' : vazio('Nada neste filtro. 👏');
    j.querySelector('#ml-conta').textContent = 'Nenhuma alteração';
    j.querySelectorAll('[data-k]').forEach((el) => {
      el.oninput = el.onchange = () => marcar(el);
      el.onkeydown = (ev) => { if (ev.key !== 'Enter' || el.tagName === 'SELECT') return; ev.preventDefault(); const p = cel(+el.closest('tr').dataset.i + 1, +el.dataset.c); if (p) p.focus(); };
      el.onpaste = (ev) => {
        const dado = (ev.clipboardData || window.clipboardData).getData('text'); if (!/[\t\n]/.test(dado)) return;
        ev.preventDefault(); const i0 = +el.closest('tr').dataset.i, c0 = +el.dataset.c;
        dado.replace(/\r/g, '').replace(/\n$/, '').split('\n').forEach((lin, di) => lin.split('\t').forEach((v, dc) => {
          const alvo = cel(i0 + di, c0 + dc); if (!alvo) return;
          if (alvo.tagName === 'SELECT') { const o = [...alvo.options].find((x) => normalizar(x.value || x.text) === normalizar(v.trim())); if (o) alvo.value = o.value || o.text; }
          else alvo.value = v.trim();
          marcar(alvo); }));
      };
    });
  };
  j.querySelector('#ml-filtro').onchange = (ev) => { EST.filtro = ev.target.value; pintar(); };
  let t0; j.querySelector('#ml-busca').oninput = (ev) => { clearTimeout(t0); t0 = setTimeout(() => { EST.busca = ev.target.value; pintar(); }, 300); };
  pintar();
  const gravar = async (mudancas) => {
    let ok = 0, rasc = 0;
    for (const [l, d] of mudancas) {
      if ('pago' in d && d.pago && !d.data_pagamento && !l.data_pagamento) d.data_pagamento = hojeISO();
      if ('pago' in d && !d.pago) d.data_pagamento = null;
      const { error } = await sb.from('lancamentos').update(d).eq('id', l.id);
      if (error && error.rascunho) rasc++; else if (error) throw new Error((l.descricao || 'lançamento') + ': ' + erroAmigavel(error)); else ok++;
    }
    return { ok, rasc };
  };
  const fim = async (r) => { fecharJanela(j);
    aviso(r.rasc ? '📝 ' + r.rasc + ' alteração(ões) enviada(s) para aprovação' + (r.ok ? ' e ' + r.ok + ' gravada(s)' : '') + '.' : '✓ ' + r.ok + ' lançamento(s) atualizado(s).');
    if (typeof recarregar === 'function') await recarregar(); };
  j.querySelector('#ml-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const linhas = [...new Set([...j.querySelectorAll('td.mudou')].map((td) => +td.parentElement.dataset.i))];
    if (!linhas.length) throw new Error('Nada foi alterado.');
    const mud = linhas.map((i) => { const l = lista[i], d = {};
      j.querySelectorAll('tr[data-i="' + i + '"] td.mudou [data-k]').forEach((el) => { const [k, r, t] = COLS_LANC[+el.dataset.c]; d[k] = lerCelLanc(k, t, el.value, r + ' de "' + (l.descricao || '') + '"'); });
      return [l, d]; });
    await fim(await gravar(mud));
  });
  j.querySelector('#ml-baixar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    await carregarScript('vendor/exceljs.min.js');
    const wb = new window.ExcelJS.Workbook(), ws = wb.addWorksheet('Lançamentos');
    ws.addRow(['id', 'Grupo / cliente', 'Receita/Despesa'].concat(COLS_LANC.map((c) => c[1]))).font = { bold: true };
    todos.forEach((l) => ws.addRow([l.id, (l.grupos && l.grupos.nome) || (l.clientes && l.clientes.nome) || l.favorecido || '', l.tipo === 'despesa' ? 'Despesa' : 'Receita']
      .concat(COLS_LANC.map(([k, , t]) => t === 'valor' ? Number(l[k]) || 0 : txtLanc(l, k, t)))));
    ws.views = [{ state: 'frozen', ySplit: 1 }]; ws.getColumn(1).hidden = false; ws.getColumn(1).width = 12;
    [2, 5, 13].forEach((c) => { ws.getColumn(c).width = 34; }); [4, 6, 7, 9, 10, 11, 12].forEach((c) => { ws.getColumn(c).width = 15; });
    const ls = wb.addWorksheet('Áreas do serviço'); AREAS_SERVICO.forEach((a) => ls.addRow([a]));
    const buf = await wb.xlsx.writeBuffer();
    baixarArquivo('Lancamentos ' + nomeEmp + ' ' + hojeISO() + '.xlsx', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  });
  j.querySelector('#ml-arq').onchange = (ev) => comBotao(null, async () => {
    const arq = ev.target.files[0]; if (!arq) return;
    await carregarScript('vendor/exceljs.min.js');
    const wb = new window.ExcelJS.Workbook(); await wb.xlsx.load(await arq.arrayBuffer());
    const ws = wb.worksheets[0], cab = (ws.getRow(1).values || []).map((v) => String(v || '').trim());
    const ci = (rot) => cab.findIndex((x) => normalizar(x) === normalizar(rot));
    if (ci('id') < 0) throw new Error('A planilha precisa da coluna "id" (use a planilha baixada aqui).');
    const porId = {}; todos.forEach((l) => { porId[l.id] = l; });
    const mud = []; let ign = 0;
    ws.eachRow((row, n) => { if (n === 1) return;
      const cv = (i) => { const x = row.getCell(i).value; return x && typeof x === 'object' && x.result !== undefined ? x.result : x instanceof Date ? x.toISOString().slice(0, 10) : x; };
      const l = porId[String(cv(ci('id')) || '').trim()]; if (!l) { ign++; return; }
      const d = {};
      COLS_LANC.forEach(([k, r, t]) => { const c = ci(r); if (c < 0) return;
        const bruto = cv(c), novo = lerCelLanc(k, t, t === 'valor' && typeof bruto === 'number' ? String(bruto).replace('.', ',') : bruto, r + ' (linha ' + n + ')');
        const atual = t === 'simnao' ? !!l[k] : t === 'valor' ? Number(l[k]) || 0 : (l[k] == null ? (t === 'data' ? null : '') : l[k]);
        if (t === 'valor' ? Math.abs(novo - atual) > 0.004 : String(novo == null ? '' : novo) !== String(atual == null ? '' : atual)) d[k] = novo; });
      if (Object.keys(d).length) mud.push([l, d]); });
    ev.target.value = '';
    if (!mud.length) return aviso('Nenhuma diferença encontrada na planilha' + (ign ? ' (' + ign + ' linha(s) sem id conhecido foram ignoradas)' : '') + '.');
    if (!confirm(mud.length + ' lançamento(s) serão atualizados a partir da planilha' + (ign ? ' (' + ign + ' linha(s) ignoradas: id desconhecido)' : '') + '. Continuar?')) return;
    await fim(await gravar(mud));
  });
}
