'use strict';
// ═══════════════════════════════════════════════════════════════════
// Início (resumo das duas empresas) e Painel Executivo (passivo
// tributário consolidado dos clientes, como no ERP antigo).
// ═══════════════════════════════════════════════════════════════════

function kpi(rotulo, valor, cor, sub) {
  return '<div class="kpi ' + (cor || '') + '"><div class="kpi-l">' + rotulo + '</div><div class="kpi-v">' + valor +
    '</div><div class="kpi-s">' + esc(sub || '') + '</div></div>';
}

// Mesmo cálculo do resumo_financeiro do banco — usado só enquanto o SQL novo não foi rodado.
async function resumoFinanceiroNoNavegador(ini, fim, h) {
  const [abertos, pagos, atr] = await Promise.all([
    buscarTodos(() => sb.from('lancamentos').select('empresa, tipo, valor, redutor').gte('vencimento', ini > h ? ini : h).lte('vencimento', fim).eq('pago', false).eq('perda', false)),
    buscarTodos(() => sb.from('lancamentos').select('empresa, tipo, valor, redutor').gte('data_pagamento', ini).lte('data_pagamento', fim).eq('pago', true)),
    buscarTodos(() => sb.from('lancamentos').select('empresa, tipo, valor, redutor').lt('vencimento', h).eq('pago', false).eq('perda', false))
  ]);
  const out = {};
  ['escritorio', 'contabilidade'].forEach((emp) => {
    const de = (lista, tipo) => lista.filter((l) => l.empresa === emp && l.tipo === tipo);
    out[emp] = { recebido: soma(de(pagos, 'receita'), vl), n_recebido: de(pagos, 'receita').length, a_receber: soma(de(abertos, 'receita'), vl), n_a_receber: de(abertos, 'receita').length,
      em_atraso: soma(de(atr, 'receita'), vl), n_em_atraso: de(atr, 'receita').length, a_pagar: soma(de(abertos, 'despesa'), vl), n_a_pagar: de(abertos, 'despesa').length };
  });
  return out;
}

// ─────────────────────────── INÍCIO ────────────────────────────────
// Cartões sem sobreposição: "A receber" = de hoje até o fim do mês (o que já venceu fica só em "Em atraso").
// Em atraso: duas tabelas completas lado a lado (Jurídico | Contabilidade), com o que vence HOJE destacado.
TELAS.inicio = async function () {
  const h = hojeISO(), ini = iso(primeiroDiaDoMes(new Date())), fim = iso(fimDoMes(new Date()));
  const sel = '*, grupos(nome), clientes(nome), contratos(descricao)';
  const [totais, atrasados] = await Promise.all([
    q(sb.rpc('resumo_financeiro', { p_de: ini, p_ate: fim })).catch(() => resumoFinanceiroNoNavegador(ini, fim, h)),
    buscarTodos(() => sb.from('lancamentos').select(sel).lte('vencimento', h).eq('pago', false).eq('perda', false).order('vencimento'))
  ]);
  const ateFim = 'de hoje até ' + dataBR(fim).slice(0, 5);
  // cada cartão abre o relatório completo (tabela com as mesmas ações do Financeiro + CSV)
  const clic = (emp, k, html) => html.replace('<div class="kpi ', '<div role="button" tabindex="0" title="Clique para ver a lista completa" data-ini-rel="' + emp + '|' + k + '" class="kpi kpi-clica ');
  // Backup 20: ordem recebido → a receber → a pagar → em atraso; recebido em verde, atraso em vermelho; o mês no título
  const mes = nomeMes(new Date());
  const linha = (emp, titulo) => { const t = totais[emp] || {};
    return '<div class="kpis-titulo ini-fin-tit">' + titulo + ' <span class="ini-mes">' + esc(mes) + '</span></div><div class="kpis ini-fin">' +
    clic(emp, 'recebido', kpi('Recebido no mês', brl(t.recebido || 0), 'verde', plural(t.n_recebido || 0, 'recebimento', 'recebimentos'))) +
    clic(emp, 'a_receber', kpi('A receber', brl(t.a_receber || 0), '', (t.n_a_receber || 0) + ' em aberto · ' + ateFim)) +
    clic(emp, 'a_pagar', kpi('A pagar', brl(t.a_pagar || 0), '', plural(t.n_a_pagar || 0, 'conta', 'contas') + ' · ' + ateFim)) +
    clic(emp, 'em_atraso', kpi('Em atraso', brl(t.em_atraso || 0), 'vermelho', plural(t.n_em_atraso || 0, 'vencido', 'vencidos') + ' · todos os meses')) +
    '</div>'; };
  const verJur = pode('financeiro_juridico'), verCont = pode('financeiro_contab');
  const de = (emp) => atrasados.filter((l) => l.empresa === emp);
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Olá, ' + esc(primeiroNomeUsuario()) + '</h1>' +
    '<p>Resumo de ' + esc(mes) + ' · para lançar receita, despesa ou contrato use <b>+ Lançar</b> na barra de cima</p></div></div>' +
    '<div id="ini-mural"></div><div id="ini-lembretes"></div><div id="ini-resumo"></div><div id="ini-aprov"></div><div id="ini-fila"></div>' +
    (verJur ? linha('escritorio', '💼 Honorários Jurídico') : '') + (verCont ? linha('contabilidade', '🧮 Honorários Contabilidade') : '') +
    // Backup 22: Jurídico e Contabilidade lado a lado (a pedido)
    (verJur || verCont ? '<div class="' + (verJur && verCont ? 'duas-col' : '') + ' ini-atraso">' +
      (verJur ? cardAtraso('Atrasados', 'Jurídico', de('escritorio')) : '') +
      (verCont ? cardAtraso('Atrasados', 'Contabilidade', de('contabilidade')) : '') + '</div>' : '');
  cardMural().catch((e) => console.error(e));
  cardLembretes().catch((e) => console.error(e));
  cardResumoEscritorio().catch((e) => console.error(e));
  if (typeof buscaPubAutomatica === 'function') buscaPubAutomatica().catch(() => {});
  if (typeof cardAprovacoes === 'function') cardAprovacoes().then((x) => { const el = $('ini-aprov'); if (el) el.innerHTML = x; }).catch((e) => console.error(e));
  if (typeof cardMinhaFila === 'function') cardMinhaFila().then((c) => { const el = $('ini-fila'); if (el) { el.innerHTML = c.html; c.ligar(el); } }).catch((e) => console.error(e));
  ligarAcoesLancamentos($('conteudo'));
  // Backup 21: clicar na dívida abre o detalhamento; o pagamento é só no botão "✓ Baixa"
  $('conteudo').querySelectorAll('.ini-atraso tr[data-linha-det]').forEach((tr) => {
    tr.onclick = (ev) => { if (ev.target.closest('button,a,input,label,.td-lote')) return; detalheLancamento(tr.dataset.linhaDet); };
    tr.onkeydown = (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === tr) { ev.preventDefault(); detalheLancamento(tr.dataset.linhaDet); } };
  });
  $('conteudo').querySelectorAll('[data-ini-rel]').forEach((k) => {
    k.onclick = () => { const [emp, tipo] = k.dataset.iniRel.split('|'); relatorioHonorarios(emp, tipo, ini, fim); };
    k.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); k.click(); } };
  });
};

// Relatório expandido de um cartão do Início (Recebido no mês, A receber, Em atraso, A pagar)
async function relatorioHonorarios(emp, tipo, ini, fim) {
  const h = hojeISO(), sel = '*, grupos(nome), clientes(nome), contratos(descricao)';
  const base = () => sb.from('lancamentos').select(sel).eq('empresa', emp);
  const Q = {
    recebido: [() => base().eq('tipo', 'receita').eq('pago', true).gte('data_pagamento', ini).lte('data_pagamento', fim).order('data_pagamento'), 'Recebido no mês', 'recebidos'],
    a_receber: [() => base().eq('tipo', 'receita').eq('pago', false).eq('perda', false).gte('vencimento', h).lte('vencimento', fim).order('vencimento'), 'A receber até ' + dataBR(fim)],
    em_atraso: [() => base().eq('tipo', 'receita').eq('pago', false).eq('perda', false).lt('vencimento', h).order('vencimento'), 'Em atraso (todos os meses)'],
    a_pagar: [() => base().eq('tipo', 'despesa').eq('pago', false).gte('vencimento', h).lte('vencimento', fim).order('vencimento'), 'A pagar até ' + dataBR(fim), 'despesas']
  }[tipo];
  const lista = await buscarTodos(Q[0]);
  const total = soma(lista, (l) => l.redutor ? -l.valor : l.valor);
  const nomeEmp = emp === 'contabilidade' ? 'Contabilidade' : 'Jurídico';
  // janela bem larga; sem a coluna Descrição; "Recebido" não se repete na lista de recebidos; sem "Emitir guia" nos a receber
  const j = abrirJanela({ titulo: Q[1] + ' — ' + nomeEmp, larga: true,
    corpo: '<div class="kpis" style="margin-bottom:12px">' + kpi('Total', brl(total), tipo === 'em_atraso' ? 'vermelho' : tipo === 'recebido' ? 'verde' : '', lista.length + ' lançamento(s)') + '</div>' +
      '<div class="card" style="margin:0">' + tabelaLancamentos(lista, { aba: Q[2], semDescricao: true, semSituacao: tipo === 'recebido', semCobranca: true }) + '</div>',
    rodape: '<button class="btn btn-o" type="button" data-rel-csv>⬇ CSV</button><span></span>' });
  j.querySelector('.janela').classList.add('janela-rel');
  ligarAcoesLancamentos(j, async () => { fecharJanela(j); await relatorioHonorarios(emp, tipo, ini, fim); await recarregar(); });
  j.querySelector('[data-rel-csv]').onclick = () => baixarArquivo(Q[1] + ' ' + nomeEmp + ' ' + h + '.csv',
    '\ufeff' + [['Vencimento', 'Pago em', 'Quem', 'Descrição', 'Valor', 'Situação']].concat(lista.map((l) => [dataBR(l.vencimento), dataBR(l.data_pagamento),
      (l.grupos && l.grupos.nome) || l.favorecido || (l.clientes && l.clientes.nome) || '', l.descricao, String(l.redutor ? -l.valor : l.valor).replace('.', ','), l.pago ? 'Pago' : 'Em aberto']))
      .map((r) => r.map((v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}

// Tabela inteira (sem "ver todos"): clicar na linha abre o detalhamento; "✓ Baixa" registra o pagamento. Selos separados: vencidos (vermelho) e vence hoje (âmbar).
function cardAtraso(titulo, area, lista) {
  const h = hojeISO();
  const quemDe = (l) => (l.grupos && l.grupos.nome) || l.favorecido || (l.clientes && l.clientes.nome) || '';
  const hoje = lista.filter((l) => l.vencimento === h), vencidos = lista.length - hoje.length, total = soma(lista, (l) => l.tipo === 'despesa' ? -l.valor : vl(l));
  return '<div class="card card-lista ini-atraso-card' + (lista.length ? ' tem-atraso' : '') + '"><div class="card-hd"><span class="ini-atraso-tit">' + esc(titulo) +
      ' <span class="ini-atraso-area area-' + (area === 'Jurídico' ? 'jur' : 'cont') + '">' + esc(area) + '</span></span>' +
      '<span class="ini-atraso-selos">' + (vencidos ? '<span class="pill vencido">' + plural(vencidos, 'vencido', 'vencidos') + '</span>' : '') +
      (hoje.length ? '<span class="pill hoje">' + hoje.length + ' vence' + (hoje.length > 1 ? 'm' : '') + ' hoje</span>' : '') +
      (!lista.length ? '<span class="pill pago">em dia</span>' : '') + '</span></div>' +
    (lista.length ? '<div class="lote-wrap"><div class="lote-barra" hidden><span class="lote-txt"></span><button type="button" class="btn btn-v btn-mini" data-lote-baixa>✓ Dar baixa nos marcados</button><button type="button" class="btn btn-o btn-mini" data-lote-limpar>Desmarcar</button></div>' +
      '<div class="tabela-wrap"><table class="ordenavel tab-pag"><thead><tr><th class="sem-ordem th-lote"><input type="checkbox" data-lote-todos aria-label="Marcar todos" title="Marcar todos para dar baixa de uma vez"></th>' +
      '<th>Quem</th><th>Grupo</th><th class="num">Valor</th><th data-tipo="data">Vencimento</th><th>Atraso</th><th class="sem-ordem"></th></tr></thead><tbody>' +
      lista.map((l) => '<tr class="clicavel' + (l.vencimento === h ? ' linha-hoje' : '') + '" data-linha-det="' + l.id + '" tabindex="0" title="Clique para ver o detalhe">' +
        '<td class="td-lote"><input type="checkbox" data-lote="' + l.id + '" data-valor="' + (l.tipo === 'despesa' ? -l.valor : vl(l)) + '" aria-label="Marcar para dar baixa"></td>' +
        '<td>' + pillPessoa(l.responsavel) + '</td>' +
        '<td>' + esc(quemDe(l) || l.descricao) + '<div class="sub">' + esc([l.descricao !== quemDe(l) ? l.descricao : '', legendaLanc(l)].filter(Boolean).join(' · ')) + '</div></td>' +
        '<td class="num mono ' + (l.tipo === 'receita' && !l.redutor ? 'valor-rec' : 'valor-desp') + '" data-ord="' + (l.tipo === 'despesa' ? -l.valor : vl(l)) + '">' +
          (l.tipo === 'despesa' || l.redutor ? '− ' : '') + brl(l.valor) + (l.redutor ? '<div class="sub">redutor</div>' : l.tipo === 'despesa' ? '<div class="sub">a pagar</div>' : '') + '</td>' +
        '<td class="mono' + (l.vencimento <= h ? ' venc-atraso' : '') + '" data-ord="' + l.vencimento + '">' + dataBR(l.vencimento) + '</td>' +
        '<td data-ord="' + diasAte(l.vencimento) + '">' + celulaAtraso(l.vencimento) + '</td>' +
        '<td class="acoes-l"><button class="btn btn-v btn-mini" data-pagar="' + l.id + '" title="Dar baixa — recebido (pergunta a data)">✓ Baixa</button></td></tr>').join('') +
      '</tbody><tfoot><tr><td></td><td colspan="2">Total</td><td class="num mono">' + brl(total) + '</td><td colspan="3"></td></tr></tfoot></table></div></div>'
      : vazio('Nada em atraso. 👏')) + '</div>';
}
function diasAtraso(venc) {
  const n = Math.round((new Date(hojeISO() + 'T12:00:00') - new Date(venc + 'T12:00:00')) / 864e5);
  return n === 1 ? 'venceu ontem' : 'há ' + n + ' dias';
}
function primeiroNomeUsuario() { return ((E.perfil && E.perfil.nome) || '').trim().split(/\s+/)[0] || ''; }

function ligarBotoesNovo(raiz) {
  raiz.querySelectorAll('[data-novo]').forEach((b) => {
    b.onclick = () => {
      const t = b.dataset.novo;
      if (t === 'contrato') formContrato();
      else if (t === 'cliente') formCliente();
      else formLancamento({ tipo: t, empresa: 'escritorio' });
    };
  });
}

// ─────────────────────────── PAINEL EXECUTIVO ──────────────────────
// Fonte única dos órgãos: KPI, rosca, tabela e ficha leem daqui.
const ORGAOS = [
  { k: 'pgfn',     nome: 'PGFN',     neg: 'pgfn_negociada' },
  { k: 'age_mg',   nome: 'AGE/MG',   neg: 'age_mg_negociada' },
  { k: 'rfb',      nome: 'RFB',      neg: 'rfb_negociada' },
  { k: 'sefaz_mg', nome: 'SEFAZ/MG', neg: null }
];
function passivo(c) { return soma(ORGAOS, (o) => c[o.k]); }

TELAS.painel = async function () {
  E.painel = E.painel || { tipo: 'ativos', grupo: '', pessoa: '', busca: '' };
  await carregarCadastros();
  const P = E.painel;
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Painel Executivo</h1><p>Passivo tributário consolidado · todos os grupos e empresas</p></div></div>' +
    '<div class="filtros" id="pn-barra">' +
    '<div class="segmento" id="pn-tipo">' + [['ativos', 'Ativos'], ['Consultoria', 'Consultoria'], ['Demanda', 'Serviço pontual'], ['Inativo', 'Inativos'], ['todos', 'Todos']]
      .map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<select class="busca sel" id="pn-grupo" autocomplete="off"><option value="">Todos os grupos</option>' +
    E.grupos.map((g) => '<option value="' + g.id + '">' + esc(g.nome) + '</option>').join('') + '</select>' +
    '<div class="segmento" id="pn-pessoa">' + [['', 'Todas'], ['cnpj', 'CNPJs'], ['cpf', 'CPFs']].map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<input class="busca" id="pn-busca" placeholder="Buscar empresa, sócio ou CPF/CNPJ" autocomplete="off">' +
    '<button class="chip" id="pn-limpar">Limpar filtros</button>' +
    '</div><div id="pn-corpo"></div>';
  $('pn-tipo').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { P.tipo = b.dataset.v; pintarPainel(); } };
  $('pn-pessoa').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { P.pessoa = b.dataset.v; pintarPainel(); } };
  $('pn-grupo').onchange = (ev) => { P.grupo = ev.target.value; pintarPainel(); };
  let t;
  $('pn-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { P.busca = ev.target.value; pintarPainel(); }, 250); };
  $('pn-limpar').onclick = () => { Object.assign(P, { tipo: 'ativos', grupo: '', pessoa: '', busca: '' }); pintarPainel(); window.scrollTo(0, 0); };
  pintarPainel();
};

function filtrarPainel() {
  const P = E.painel, b = normalizar(P.busca), bd = soDigitos(P.busca);
  return E.clientes.filter((c) => {
    if (P.tipo === 'ativos' && c.tipo === 'Inativo') return false;
    if (P.tipo !== 'ativos' && P.tipo !== 'todos' && c.tipo !== P.tipo) return false;
    if (P.grupo && c.grupo_id !== P.grupo) return false;
    const doc = soDigitos(c.cpf_cnpj);
    if (P.pessoa === 'cnpj' && doc.length !== 14) return false;
    if (P.pessoa === 'cpf' && doc.length !== 11) return false;
    if (b && !(normalizar(c.nome + ' ' + c.socio_admin + ' ' + (c.grupos ? c.grupos.nome : '')).includes(b) || (bd && doc.includes(bd)))) return false;
    return true;
  });
}

function pintarPainel() {
  const P = E.painel;
  document.querySelectorAll('#pn-tipo button').forEach((x) => x.classList.toggle('ativo', x.dataset.v === P.tipo));
  document.querySelectorAll('#pn-pessoa button').forEach((x) => x.classList.toggle('ativo', x.dataset.v === P.pessoa));
  if (document.activeElement !== $('pn-grupo')) $('pn-grupo').value = P.grupo;
  if (document.activeElement !== $('pn-busca')) $('pn-busca').value = P.busca;
  const lista = filtrarPainel();
  const total = soma(lista, passivo);
  const negociado = soma(lista, (c) => soma(ORGAOS.filter((o) => o.neg), (o) => c[o.neg]));
  const porOrgao = ORGAOS.map((o) => ({ nome: o.nome, valor: soma(lista, (c) => c[o.k]) }));
  const porGrupo = {};
  lista.forEach((c) => { const n = c.grupos ? c.grupos.nome : 'Sem grupo'; porGrupo[n] = (porGrupo[n] || 0) + passivo(c); });
  const topGrupos = Object.entries(porGrupo).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([rotulo, valor]) => { const g = E.grupos.find((x) => x.nome === rotulo); return { rotulo, valor, acao: g ? g.id : '' }; });
  const comProc = lista.filter((c) => c.procuracao === true).length;
  const omissos = lista.filter((c) => String(c.capag).toUpperCase() === 'OMISSO').length;

  $('pn-corpo').innerHTML =
    '<div class="kpis">' +
    kpi('Passivo total', brl(total), 'vermelho', lista.length + ' entidade(s) no recorte') +
    ORGAOS.map((o) => kpi(o.nome, brl(soma(lista, (c) => c[o.k])), '', lista.filter((c) => Number(c[o.k]) > 0).length + ' com débito')).join('') +
    kpi('Já negociado', brl(negociado), 'verde', 'RFB + PGFN + AGE/MG negociadas') +
    kpi('Procuração', comProc + ' de ' + lista.length, '', omissos ? omissos + ' com CAPAG omisso' : 'nenhuma CAPAG omissa') +
    '</div>' +
    '<div class="duas-col">' +
    blocoRecolhivel('pn-g-grupo', '🏛 Passivo por grupo <span class="sub">— soma de todos os órgãos; clique para filtrar</span>',
      '<div class="card-bd">' + graficoRanking(topGrupos, { titulo: 'Passivo por grupo' }) + '</div>') +
    blocoRecolhivel('pn-g-orgao', '📊 Distribuição por órgão <span class="sub">— % do passivo total</span>',
      '<div class="card-bd">' + graficoRosca(porOrgao, { titulo: 'Passivo por órgão' }) + '</div>') +
    '</div>' +
    '<div class="card"><div class="card-hd">🏢 Empresas do grupo<span class="sub">clique no cabeçalho para ordenar · clique na linha para abrir a ficha</span></div>' +
    (lista.length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Grupo</th><th>Entidade / Sócio</th><th>CPF/CNPJ</th>' +
      ORGAOS.map((o) => '<th class="num">' + o.nome + '</th>').join('') +
      '<th class="num">Total</th><th>CAPAG</th><th>Situação</th><th>Procuração</th></tr></thead><tbody>' +
      lista.map((c) => '<tr class="clicavel" data-cli="' + c.id + '"><td title="' + esc(c.grupos ? c.grupos.nome : '') + '">' + esc(c.grupos ? c.grupos.nome : '—') + '</td>' +
        '<td><b>' + esc(c.nome) + '</b>' + (c.socio_admin ? '<div class="sub">' + esc(c.socio_admin) + '</div>' : '') + '</td>' +
        '<td class="mono">' + esc(mascaraDoc(c.cpf_cnpj) || '—') + '</td>' +
        ORGAOS.map((o) => '<td class="num mono" data-ord="' + (c[o.k] == null ? '' : c[o.k]) + '">' + (Number(c[o.k]) ? esc(brl(c[o.k])) : '<span class="sub">—</span>') + '</td>').join('') +
        '<td class="num mono" data-ord="' + passivo(c) + '"><b>' + (passivo(c) ? brl(passivo(c)) : '<span class="sub">—</span>') + '</b></td>' +
        '<td data-ord="' + esc(c.capag || '') + '">' + pillCapag(c.capag) + '</td><td>' + pillSitCad(c.situacao_cadastral) + '</td><td>' + pillSimNao(c.procuracao) + '</td></tr>').join('') +
      '</tbody><tfoot><tr><td colspan="3">Total (' + lista.length + ')</td>' + ORGAOS.map((o) => '<td class="num mono">' + brl(soma(lista, (c) => c[o.k])) + '</td>').join('') +
      '<td class="num mono">' + brl(total) + '</td><td colspan="3"></td></tr></tfoot></table></div>'
      : '<div class="vazio">Nenhuma entidade neste recorte.</div>') + '</div>';

  $('pn-corpo').querySelectorAll('[data-cli]').forEach((tr) => tr.onclick = () => formCliente(E.clientes.find((x) => x.id === tr.dataset.cli), () => pintarPainel()));
  $('pn-corpo').querySelectorAll('g[data-acao]').forEach((g) => g.onclick = () => { if (g.dataset.acao) { P.grupo = g.dataset.acao; pintarPainel(); } });
}


// ─────────── Lembretes do Início (Backup 20: substituem o mural de recados) ───────────
// Topo do Início: destaques do que é SEU (avisos, tarefas atrasadas, prazos fatais…) e a lista de LEMBRETES sempre à vista.
// Lembrete pode ser SEM PRAZO (fica até "Feito", como era o recado), FIXO no topo e ter uma COR de destaque.
const EXPLICA = {
  avisos: 'Avisos (sino 🔔): novidades que pedem sua atenção agora — prazo chegando, o que vence hoje, menções, tarefa que alguém te passou. Depois de lido, some.',
  tarefas: 'Tarefas: trabalho com responsável e prazo (ex.: protocolar defesa). Aqui aparecem só as SUAS que já passaram do prazo.',
  fila: 'Minha fila de trabalho: todas as SUAS tarefas abertas, em ordem de prazo — é a sua lista do dia.',
  lembretes: 'Lembretes: recados com ou sem data que NÃO viram tarefa (ex.: pagar o aluguel, reunião sexta). Aparecem até 7 dias antes da data; sem prazo, ficam até você marcar "Feito".'
};
const DESTAQUES_LEMB = [['', 'Sem destaque'], ['vermelho', '🔴 Vermelho — urgente'], ['amarelo', '🟡 Amarelo — atenção'], ['verde', '🟢 Verde — tudo certo'], ['azul', '🔵 Azul — informação'], ['roxo', '🟣 Roxo — pessoal']];
// ⓘ com balão próprio (Backup 22: volta o ⓘ; o balão do Backup 21 fica)
function infoI(chave) { return '<span class="info-i" tabindex="0" role="note" data-dica="' + esc(EXPLICA[chave]) + '" aria-label="' + esc(EXPLICA[chave]) + '">ⓘ</span>'; }
async function dadosLembretes() {
  const h = hojeISO(), jur = pode('juridico');
  const rg = await q(sb.from('regras_tarefas').select('ligada, dias').eq('chave', 'parcela_parcelamento').maybeSingle()).catch(() => null);
  const dias = rg && rg.dias != null ? rg.dias : 5, guiasLigado = !rg || rg.ligada;
  const [guias, meus] = await Promise.all([
    jur && guiasLigado ? q(sb.from('parcelas').select('id, numero, vencimento, emissao, parcelamentos(empresa, natureza, numero, total_parcelas, grupo_id, emitimos_guia)')
      .eq('pago', false).lte('vencimento', somarDias(h, dias)).order('vencimento')).catch(() => []) : [],
    q(sb.from('lembretes').select('*').is('feito_em', null).order('dia', { nullsFirst: true })).catch(() => [])
  ]);
  const eu = primeiroNome((E.perfil && E.perfil.nome) || ''), lim = somarDias(h, 7);
  const meu = meus.filter((l) => !l.pessoa || primeiroNome(l.pessoa) === eu || (E.perfil && E.perfil.papel === 'admin'))
    .sort((a, b) => (b.fixo - a.fixo) || ((a.dia ? 1 : 0) - (b.dia ? 1 : 0)) || String(a.dia || '').localeCompare(String(b.dia || '')));
  // Backup 23: o lembrete com data distante não "some" — fica em "Mais adiante" até faltar 7 dias
  const vis = meu.filter((l) => l.fixo || !l.dia || l.dia <= lim), futuros = meu.filter((l) => !(l.fixo || !l.dia || l.dia <= lim));
  // Backup 25: só as guias dos parcelamentos em que NÓS emitimos (Parcelamentos → abrir o parcelamento → "Guias deste parcelamento")
  return { dias, semGuia: guias.filter((g) => !/sim|emitid/i.test(g.emissao || '') && !(g.parcelamentos && g.parcelamentos.emitimos_guia === false)), vis, futuros, todos: meu };
}
// Backup 23: o Início volta a ter dois blocos separados — a faixa de DESTAQUES (avisos, tarefas atrasadas, prazos fatais, CRM)
// e o cartão próprio de LEMBRETES (com as guias de parcelamento), como era antes do Backup 19.
async function cardMural() {
  const el = $('ini-mural'); if (!el) return;
  const h = hojeISO();
  const [avisos, tarefas, lemb] = await Promise.all([
    contarAlertas().catch(() => ({ total: 0, altos: 0 })),
    q(sb.from('tarefas').select('id, prazo, prazo_fatal, responsavel, participantes, chave_regra').not('status', 'in', '(concluida,cancelada)')).catch(() => []),
    dadosLembretes().catch(() => ({ semGuia: [], dias: 5 }))
  ]);
  const nGuias = lemb.semGuia.length, aberto = cardMural.aberto || '';
  const semPasso = pode('crm') ? (await q(sb.from('crm_oportunidades').select('id, proxima_acao, proxima_acao_em, crm_etapas(final)')).catch(() => []))
    .filter((o) => !(o.crm_etapas && o.crm_etapas.final) && (!o.proxima_acao || !o.proxima_acao_em)).length : 0;
  const minhas = tarefas.filter(ehMinha);
  const fatais = minhas.filter((t) => t.prazo_fatal && t.prazo_fatal <= somarDias(h, 7)).length, atrasadas = minhas.filter((t) => t.prazo && t.prazo < h && !/^(cob|parc|aco):/.test(t.chave_regra || '')).length;
  const dest = [
    avisos.total ? ['avisos', (avisos.altos ? 'critico' : ''), '🔔', plural(avisos.total, 'aviso não lido', 'avisos não lidos'), EXPLICA.avisos] : null,
    atrasadas ? ['atrasadas', 'critico', '⏰', plural(atrasadas, 'tarefa sua atrasada', 'tarefas suas atrasadas'), EXPLICA.tarefas] : null,
    fatais ? ['fatais', 'critico', '⚑', plural(fatais, 'prazo fatal seu em 7 dias', 'prazos fatais seus em 7 dias'), 'Tarefas SUAS com prazo fatal nos próximos 7 dias.'] : null,
    semPasso ? ['crm', 'ambar', '🎯', plural(semPasso, 'oportunidade sem próximo passo', 'oportunidades sem próximo passo'), 'CRM: oportunidades em andamento sem o próximo passo marcado.'] : null,
    // Backup 24: guias de parcelamento a emitir ficam junto dos avisos e tarefas (clique abre a lista)
    nGuias ? ['guias', lemb.semGuia.some((g) => g.vencimento < h) ? 'critico' : 'ambar', '🧾', plural(nGuias, 'guia de parcelamento a emitir', 'guias de parcelamento a emitir'),
      'Guias de parcelamento que vencem até ' + dataBR(somarDias(h, lemb.dias)) + ' e ainda não foram emitidas. Clique para ver e marcar "Guia emitida".'] : null
  ].filter(Boolean);
  if (!dest.length) { el.innerHTML = ''; return; }
  const chip = (d) => { const n = d[3].match(/^\d+/)[0], resto = d[3].slice(n.length);
    return '<button type="button" class="mural-dest ' + d[1] + (aberto === d[0] ? ' ativo' : '') + '" data-mural="' + d[0] + '" title="' + esc(d[4]) + '"' + (d[0] === 'guias' ? ' aria-expanded="' + (aberto === 'guias') + '"' : '') + '>' + d[2] + ' <b>' + n + '</b>' + esc(resto) + '</button>'; };
  el.innerHTML = '<div class="mural-destaques ini-destaques">' + dest.map(chip).join('') + '</div>' +
    (aberto === 'guias' && nGuias ? '<div class="card ini-guias"><div class="card-bd">' + htmlGuias(lemb) + '</div></div>' : '');
  el.querySelectorAll('[data-guia-ok]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    await q(sb.from('parcelas').update({ emissao: 'SIM' }).eq('id', b.dataset.guiaOk)); aviso('✓ Guia marcada como emitida.'); await cardMural();
  }));
  el.querySelectorAll('[data-mural]').forEach((b) => b.onclick = () => {
    const k = b.dataset.mural;
    if (k === 'guias') { cardMural.aberto = aberto === 'guias' ? '' : 'guias'; cardMural(); }
    else if (k === 'avisos') abrirAlertas(null, () => cardMural());
    else if (k === 'crm') { E.crm = Object.assign(E.crm || {}, { aba: 'andamento', vista: 'lista' }); irParaTela('crm'); }
    else { E.tf = Object.assign(E.tf || {}, { vista: 'lista', atalho: k === 'fatais' ? '7' : 'atrasadas', aba: 'abertas' }); irParaTela('tarefas'); }
  });
}
// Cartão próprio de Lembretes (o que NÃO é tarefa; Backup 24: as guias foram para a faixa de destaques): lembretes dos próximos 7 dias / sem prazo / fixos,
// e "Mais adiante" com os de data distante. Clicar no lembrete abre o DETALHAMENTO (editar fica lá dentro).
async function cardLembretes() {
  const el = $('ini-lembretes'); if (!el) return;
  const h = hojeISO(), L = await dadosLembretes().catch(() => ({ semGuia: [], vis: [], futuros: [], todos: [], dias: 5 }));
  const abF = !!cardLembretes.abertoF;
  el.innerHTML = '<div class="card ini-lemb"><div class="card-hd">🔔 Lembretes <span class="sub">recados que não são tarefas</span>' +
      '<button type="button" class="btn btn-p btn-mini" id="lemb-novo" style="margin-left:auto">+ Lembrete</button></div><div class="card-bd">' +
    (L.vis.length ? '<div class="lemb-lista">' + htmlLembretes(L.vis) + '</div>'
      : '<div class="sub">Nenhum lembrete para os próximos 7 dias. Use <b>+ Lembrete</b> (com ou sem data; dá para fixar no topo e escolher uma cor).</div>') +
    (L.futuros.length ? '<button type="button" class="lemb-tg lemb-tg-fut" id="lemb-fut" aria-expanded="' + abF + '">' + (abF ? '▾' : '▸') + ' Mais adiante <span class="sub">' +
        plural(L.futuros.length, 'lembrete com data depois de ' + dataBR(somarDias(h, 7)), 'lembretes com data depois de ' + dataBR(somarDias(h, 7))) + '</span></button>' +
      (abF ? '<div class="lemb-lista">' + htmlLembretes(L.futuros) + '</div>' : '') : '') +
    '</div></div>';
  const fu = $('lemb-fut'); if (fu) fu.onclick = () => { cardLembretes.abertoF = !abF; cardLembretes(); };
  ligarLembretes(el, L);
  $('lemb-novo').onclick = () => formLembrete();
}

// ── Resumo do escritório (Início = "home"): um número por assunto, clicável ──
async function cardResumoEscritorio() {
  const el = $('ini-resumo'); if (!el) return;
  // Backup 17: só o que pede ação (sem Processos). Atraso, hoje e próximos 5 dias ficam no mesmo cartão, um por linha.
  const h = hojeISO(), lim5 = somarDias(h, 5), lim15 = somarDias(h, 15);
  const conta = (qq) => qq.then((r) => (r.error ? 0 : r.count || 0)).catch(() => 0);
  const cnt = (t) => sb.from(t).select('id', { count: 'exact', head: true });
  const jur = pode('juridico'), crm = pode('crm'), docs = pode('documentos');
  const aberta = () => cnt('tarefas').not('status', 'in', '(concluida,cancelada)');
  const tres = (t, col, filtro) => jur ? Promise.all([
    conta(filtro(cnt(t)).lt(col, h)), conta(filtro(cnt(t)).eq(col, h)), conta(filtro(cnt(t)).gt(col, h).lte(col, lim5))]) : [0, 0, 0];
  const [pubs, parc, aco, ops, tAb, tAtr, tHoje, t5, docV] = await Promise.all([
    jur ? conta(cnt('publicacoes').eq('status', 'nova')) : 0,
    tres('parcelas', 'vencimento', (x) => x.eq('pago', false)),
    tres('acordos', 'vencimento', (x) => x.eq('pago', false)),
    crm ? q(sb.from('crm_oportunidades').select('valor_estimado, crm_etapas(final)')).catch(() => []) : [],
    conta(aberta()), conta(aberta().lt('prazo', h)), conta(aberta().eq('prazo', h)), conta(aberta().gt('prazo', h).lte('prazo', lim5)),
    docs ? conta(cnt('documentos').eq('arquivado', false).gte('validade', h).lte('validade', lim15)) : 0
  ]);
  const abertas = (ops || []).filter((o) => !(o.crm_etapas && o.crm_etapas.final));
  // linhas de prazo: [quantidade, texto, cor] — Backup 19: plural certo, sem "(s)"
  const pl = (n, um, varios) => (Number(n) === 1 ? um : varios);
  const prazos = (v) => [[v[1], pl(v[1], 'vence hoje', 'vencem hoje'), 'ambar'], [v[2], 'nos próximos 5 dias', '']];
  const T = [
    jur ? ['publicacoes', '📰', 'Publicações', pubs, pl(pubs, 'nova para ler', 'novas para ler'), [], pubs ? 'ambar' : ''] : null,
    jur ? ['parcelamentos', '🧾', 'Parcelamentos', parc[0], pl(parc[0], 'parcela em atraso', 'parcelas em atraso'), prazos(parc), parc[0] ? 'vermelho' : parc[1] ? 'ambar' : ''] : null,
    jur ? ['acordos', '🤝', 'Acordos', aco[0], pl(aco[0], 'parcela em atraso', 'parcelas em atraso'), prazos(aco), aco[0] ? 'vermelho' : aco[1] ? 'ambar' : ''] : null,
    crm ? ['crm', '🎯', 'CRM', abertas.length, pl(abertas.length, 'oportunidade em andamento', 'oportunidades em andamento'), [[null, brl(soma(abertas, (o) => o.valor_estimado)) + ' em negociação', '']], ''] : null,
    ['tarefas', '📋', 'Tarefas do escritório', tAb, 'em aberto · equipe toda', [[tAtr, pl(tAtr, 'atrasada', 'atrasadas'), 'vermelho']].concat(prazos([0, tHoje, t5])), tAtr ? 'vermelho' : ''],
    docs ? ['documentos', '📁', 'Documentos', docV, pl(docV, 'vence em 15 dias', 'vencem em 15 dias'), [], docV ? 'ambar' : ''] : null
  ].filter(Boolean);
  const sub = (l) => '<span class="ini-res-sub' + (l[0] && l[2] ? ' ' + l[2] : '') + '">' + (l[0] == null ? '' : '<b>' + l[0] + '</b> ') + esc(l[1]) + '</span>';
  el.innerHTML = '<div class="kpis-titulo">🏠 Resumo do escritório</div><div class="ini-resumo">' + T.map((t) =>
    '<button type="button" class="ini-res ' + t[6] + '" data-ini-ir="' + t[0] + '"' + (t[0] === 'tarefas' ? ' title="Tarefas do escritório: todas as tarefas abertas da equipe (a sua fila fica mais abaixo)."' : '') + '><span class="ini-res-ic" aria-hidden="true">' + t[1] + '</span>' +
    '<span class="ini-res-tit">' + esc(t[2]) + '</span><b class="ini-res-num">' + t[3] + '</b><span class="ini-res-rot">' + esc(t[4]) + '</span>' +
    (t[5].length ? '<span class="ini-res-subs">' + t[5].map(sub).join('') + '</span>' : '') + '</button>').join('') + '</div>';
  el.querySelectorAll('[data-ini-ir]').forEach((b) => b.onclick = () => {
    const k = b.dataset.iniIr;
    if (k === 'tarefas') E.tf = Object.assign(E.tf || {}, { aba: 'abertas', atalho: '' });
    irParaTela(k);
  });
}
function fimDoMesISO(d) { const x = new Date(d + 'T12:00:00'); return iso(new Date(x.getFullYear(), x.getMonth() + 1, 0)); }

// ── Lembretes: o que NÃO é tarefa (recado sem prazo, pagar o aluguel, emitir guias de parcelamento) ──
function htmlGuias(L) {
  const h = hojeISO();
  return '<div class="lista-ficha">' + L.semGuia.map((g) => { const p = g.parcelamentos || {};
    return '<div class="item-ficha"><div><b>' + esc(p.empresa || '—') + '</b> <span class="sub">' + esc([p.natureza, p.numero ? 'nº ' + p.numero : '', 'parc. ' + (g.numero || '?') + (p.total_parcelas ? '/' + p.total_parcelas : '')].filter(Boolean).join(' · ')) + '</span>' +
      '<div class="sub">vence ' + dataBR(g.vencimento) + (g.vencimento < h ? ' <span class="pill vencido">vencida</span>' : '') + '</div></div>' +
      '<button type="button" class="btn btn-v btn-mini" data-guia-ok="' + g.id + '">✓ Guia emitida</button></div>'; }).join('') + '</div>';
}
// Linha do lembrete: fundo pela cor do destaque, "✓ Feito" e "📌 Fixar/Fixado" (o fixado fica marcado, como o Feito); clicar abre o detalhe
function htmlLembretes(lista) {
  const h = hojeISO();
  return lista.map((l) => '<div class="lemb-it' + (l.fixo ? ' fixo' : '') + (l.destaque ? ' dest-' + esc(l.destaque) : '') + '" data-lemb-det="' + l.id + '" tabindex="0" title="Clique para ver o detalhamento">' +
      '<div class="lemb-txt"><span>' + esc(l.texto) + '</span>' +
      '<div class="sub">' + (!l.dia ? 'sem prazo' : l.dia < h ? '<span class="pill vencido">desde ' + dataBR(l.dia) + '</span>' : l.dia === h ? '<span class="pill hoje">hoje</span>' : dataBR(l.dia)) +
        (l.repete ? ' · ↻ ' + esc(l.repete) : '') + (l.pessoa ? ' · ' + esc(l.pessoa) : ' · todos') + '</div></div>' +
    '<div class="acoes-l">' + botoesLembrete(l) + '</div></div>').join('');
}
function botoesLembrete(l) {
  return '<button type="button" class="btn btn-mini lemb-fixo' + (l.fixo ? ' on' : '') + '" data-lemb-fixo="' + l.id + '" aria-pressed="' + !!l.fixo + '" title="' + (l.fixo ? 'Fixado no topo — clique para tirar' : 'Fixar no topo') + '">📌 ' + (l.fixo ? 'Fixado' : 'Fixar') + '</button>' +
    '<button type="button" class="btn btn-v btn-mini" data-lemb-ok="' + l.id + '" title="Concluir (marcar como feito)">✓ Feito</button>' +
    '<button type="button" class="btn-etq" data-lemb-x="' + l.id + '" title="Apagar lembrete" aria-label="Apagar lembrete">×</button>';
}
// detalhamento do lembrete (igual aos outros cartões: abre uma janela; "Editar" fica aqui dentro)
function detalheLembrete(l) {
  const h = hojeISO(), lin = (r, v) => v ? '<div class="tf-lin"><span>' + r + '</span><div>' + v + '</div></div>' : '';
  const dest = (DESTAQUES_LEMB.find((d) => d[0] === (l.destaque || '')) || ['', ''])[1];
  const j = abrirJanela({ titulo: '🔔 Lembrete',
    corpo: '<div class="tf-ficha"><div class="tf-ficha-hd"><h3>' + esc(l.texto) + '</h3><div class="tf-selos">' + (l.fixo ? '<span class="pill aberto">📌 fixado no topo</span> ' : '') +
        (!l.dia ? '<span class="pill neutro">sem prazo</span>' : l.dia < h ? '<span class="pill vencido">desde ' + dataBR(l.dia) + '</span>' : l.dia === h ? '<span class="pill hoje">hoje</span>' : '<span class="pill neutro">' + dataBR(l.dia) + '</span>') + '</div></div>' +
      '<div class="tf-grade">' + lin('Data', l.dia ? dataBR(l.dia) : 'sem prazo — fica até "Feito"') + lin('Repete', esc({ semanal: 'Toda semana', mensal: 'Todo mês', anual: 'Todo ano' }[l.repete] || '')) +
        lin('Para quem', esc(l.pessoa || 'Todo o escritório')) + lin('Destaque', esc(dest)) + lin('Criado em', l.criado_em ? dataHoraBR(l.criado_em) : '') + '</div></div>',
    rodape: '<span><button class="btn btn-o btn-mini" type="button" id="ld-editar">✎ Editar</button></span><div class="acoes">' + botoesLembrete(l) + '</div>' });
  j.querySelector('#ld-editar').onclick = () => { fecharJanela(j); formLembrete(l); };
  ligarLembretes(j, { todos: [l], semGuia: [] }, () => fecharJanela(j));
  return j;
}
function ligarLembretes(el, L, depois) {
  const h = hojeISO(), acha = (id) => (L.todos || []).find((x) => x.id === id);
  const fim = async () => { if (depois) depois(); await cardLembretes(); };
  el.querySelectorAll('[data-guia-ok]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    await q(sb.from('parcelas').update({ emissao: 'SIM' }).eq('id', b.dataset.guiaOk)); aviso('✓ Guia marcada como emitida.'); await fim();
  }));
  el.querySelectorAll('[data-lemb-ok]').forEach((b) => b.onclick = (ev) => { ev.stopPropagation(); comBotao(b, async () => {
    const l = acha(b.dataset.lembOk);
    const prox = { semanal: 7, mensal: 'm1', anual: 'm12' }[l.repete];
    const dados = !l.repete || !l.dia ? { feito_em: h } : { dia: typeof prox === 'number' ? somarDias(l.dia, prox) : somarMeses(l.dia, +prox.slice(1)) };
    await q(sb.from('lembretes').update(dados).eq('id', l.id));
    aviso(dados.dia ? '✓ Feito. Próximo em ' + dataBR(dados.dia) + '.' : '✓ Lembrete concluído.'); await fim();
  }); });
  el.querySelectorAll('[data-lemb-fixo]').forEach((b) => b.onclick = (ev) => { ev.stopPropagation(); comBotao(b, async () => {
    const l = acha(b.dataset.lembFixo);
    await q(sb.from('lembretes').update({ fixo: !l.fixo }).eq('id', l.id)); aviso(l.fixo ? 'Lembrete tirado do topo.' : '📌 Lembrete fixado no topo.'); await fim();
  }); });
  el.querySelectorAll('[data-lemb-x]').forEach((b) => b.onclick = (ev) => { ev.stopPropagation(); comBotao(b, async () => {
    if (!confirm('Apagar este lembrete?')) return;
    await q(sb.from('lembretes').delete().eq('id', b.dataset.lembX)); await fim();
  }); });
  el.querySelectorAll('[data-lemb-det]').forEach((d) => {
    d.onclick = (ev) => { if (ev.target.closest('button')) return; detalheLembrete(acha(d.dataset.lembDet)); };
    d.onkeydown = (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === d) { ev.preventDefault(); detalheLembrete(acha(d.dataset.lembDet)); } };
  });
}
function formLembrete(l) {
  l = l || null;
  const semPrazo = l ? !l.dia : false;
  const j = abrirJanela({ titulo: l ? '📌 Editar lembrete' : '📌 Novo lembrete',
    corpo: '<div class="dica" style="margin-bottom:10px">Lembrete é um recado que <b>não vira tarefa</b> (ex.: "reunião sexta às 14h", "pagar o aluguel da sala"). ' +
      '<b>Sem prazo</b>: fica no Início até você marcar "Feito". Com data: aparece em destaque a partir de 7 dias antes (antes disso fica em "Mais adiante").</div><form id="f-lemb" class="grade">' +
      campo('Lembrete <span class="obrig">*</span>', '<input name="texto" maxlength="300" value="' + esc(l ? l.texto : '') + '">', 'inteiro') +
      campo('Prazo', '<select name="prazo"><option value="data">Com data</option><option value="sem"' + (semPrazo ? ' selected' : '') + '>Sem prazo (fica até "Feito")</option></select>') +
      campo('Data', '<input name="dia" type="date" value="' + esc(l ? l.dia || '' : hojeISO()) + '"' + (semPrazo ? ' disabled' : '') + '>') +
      campo('Repete', '<select name="repete"><option value="">Não repete</option>' + [['semanal', 'Toda semana'], ['mensal', 'Todo mês'], ['anual', 'Todo ano']].map(([v, r]) => '<option value="' + v + '"' + (l && l.repete === v ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') +
      campo('Para quem', selectPessoa('pessoa', l ? l.pessoa : '', 'Todo o escritório')) +
      campo('Destaque', '<select name="destaque">' + DESTAQUES_LEMB.map(([v, r]) => '<option value="' + v + '"' + (l && l.destaque === v ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>') +
      '<label class="check inteiro"><input type="checkbox" name="fixo"' + (l && l.fixo ? ' checked' : '') + '> 📌 Fixar no topo</label></form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-p" type="button" id="lemb-salvar">Salvar</button></div>' });
  const f = j.querySelector('#f-lemb');
  f.prazo.onchange = () => { f.dia.disabled = f.prazo.value === 'sem'; if (!f.dia.disabled && !f.dia.value) f.dia.value = hojeISO(); };
  j.querySelector('#lemb-salvar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const t = f.texto.value.trim(); if (!t) throw new Error('Escreva o lembrete.');
    const dados = { texto: t, dia: f.prazo.value === 'sem' ? null : (f.dia.value || hojeISO()), repete: f.prazo.value === 'sem' ? '' : f.repete.value,
      pessoa: f.pessoa.value, destaque: f.destaque.value, fixo: f.fixo.checked };
    if (l) await q(sb.from('lembretes').update(dados).eq('id', l.id)); else await q(sb.from('lembretes').insert(dados));
    aviso(l ? '✓ Lembrete salvo.' : '✓ Lembrete criado.'); fecharJanela(j); await cardLembretes();
  });
}
