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
  const sel = '*, grupos(nome), clientes(nome)';
  const [totais, atrasados] = await Promise.all([
    q(sb.rpc('resumo_financeiro', { p_de: ini, p_ate: fim })).catch(() => resumoFinanceiroNoNavegador(ini, fim, h)),
    buscarTodos(() => sb.from('lancamentos').select(sel).lte('vencimento', h).eq('pago', false).eq('perda', false).order('vencimento'))
  ]);
  const ateFim = 'de hoje até ' + dataBR(fim).slice(0, 5);
  // cada cartão abre o relatório completo (tabela com as mesmas ações do Financeiro + CSV)
  const clic = (emp, k, html) => html.replace('<div class="kpi ', '<div role="button" tabindex="0" title="Clique para ver a lista completa" data-ini-rel="' + emp + '|' + k + '" class="kpi kpi-clica ');
  const linha = (emp, titulo) => { const t = totais[emp] || {};
    return '<div class="kpis-titulo">' + titulo + '</div><div class="kpis">' +
    clic(emp, 'recebido', kpi('Recebido no mês', brl(t.recebido || 0), 'verde', (t.n_recebido || 0) + ' recebimento(s)')) +
    clic(emp, 'a_receber', kpi('A receber', brl(t.a_receber || 0), '', (t.n_a_receber || 0) + ' em aberto · ' + ateFim)) +
    clic(emp, 'em_atraso', kpi('Em atraso', brl(t.em_atraso || 0), 'vermelho', (t.n_em_atraso || 0) + ' vencido(s) · todos os meses')) +
    clic(emp, 'a_pagar', kpi('A pagar', brl(t.a_pagar || 0), 'ambar', (t.n_a_pagar || 0) + ' conta(s) · ' + ateFim)) +
    '</div>'; };
  const verJur = pode('financeiro_juridico'), verCont = pode('financeiro_contab');
  const de = (emp) => atrasados.filter((l) => l.empresa === emp);
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Olá, ' + esc(primeiroNomeUsuario()) + '</h1>' +
    '<p>Resumo de ' + esc(nomeMes(new Date())) + '</p></div>' +
    '<div class="acoes"><button class="btn btn-p" data-novo="receita">+ Receita</button>' +
    '<button class="btn btn-o" data-novo="despesa">+ Despesa</button>' +
    '<button class="btn btn-o" data-novo="contrato">+ Contrato</button></div></div>' +
    '<div id="ini-mural"></div><div id="ini-aprov"></div><div id="ini-fila"></div>' +
    (verJur ? linha('escritorio', '💼 Honorários Jurídico') : '') + (verCont ? linha('contabilidade', '🧮 Contabilidade') : '') +
    (verJur || verCont ? '<div class="' + (verJur && verCont ? 'duas-col' : '') + ' ini-atraso">' +
      (verJur ? cardAtraso('Atrasados', 'Jurídico', de('escritorio')) : '') +
      (verCont ? cardAtraso('Atrasados', 'Contabilidade', de('contabilidade')) : '') + '</div>' : '');
  cardMural().catch((e) => console.error(e));
  if (typeof cardAprovacoes === 'function') cardAprovacoes().then((x) => { const el = $('ini-aprov'); if (el) el.innerHTML = x; }).catch((e) => console.error(e));
  if (typeof cardMinhaFila === 'function') cardMinhaFila().then((c) => { const el = $('ini-fila'); if (el) { el.innerHTML = c.html; c.ligar(el); } }).catch((e) => console.error(e));
  ligarAcoesLancamentos($('conteudo'));
  ligarBotoesNovo($('conteudo'));
  // clicar na linha do atraso = registrar o pagamento (mesma janela do botão)
  $('conteudo').querySelectorAll('.ini-atraso tr[data-linha-pagar]').forEach((tr) => tr.onclick = (ev) => {
    if (ev.target.closest('button,a')) return;
    const b = tr.querySelector('[data-pagar]'); if (b) b.click();
  });
  $('conteudo').querySelectorAll('[data-ini-rel]').forEach((k) => {
    k.onclick = () => { const [emp, tipo] = k.dataset.iniRel.split('|'); relatorioHonorarios(emp, tipo, ini, fim); };
    k.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); k.click(); } };
  });
};

// Relatório expandido de um cartão do Início (Recebido no mês, A receber, Em atraso, A pagar)
async function relatorioHonorarios(emp, tipo, ini, fim) {
  const h = hojeISO(), sel = '*, grupos(nome), clientes(nome)';
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

// Tabela inteira (sem "ver todos"): dá para registrar o pagamento em qualquer linha ali mesmo
// (clicar na linha abre a mesma janela). Selos separados: vencidos (vermelho) e vence hoje (âmbar).
function cardAtraso(titulo, area, lista) {
  const h = hojeISO();
  const quemDe = (l) => (l.grupos && l.grupos.nome) || l.favorecido || (l.clientes && l.clientes.nome) || '';
  const hoje = lista.filter((l) => l.vencimento === h), vencidos = lista.length - hoje.length, total = soma(lista, (l) => l.tipo === 'despesa' ? -l.valor : vl(l));
  return '<div class="card card-lista ini-atraso-card"><div class="card-hd"><span class="ini-atraso-tit">' + esc(titulo) + ' <span class="ini-atraso-area area-' + (area === 'Jurídico' ? 'jur' : 'cont') + '">' + esc(area) + '</span></span>' +
      '<span class="ini-atraso-selos">' + (vencidos ? '<span class="pill vencido">' + vencidos + ' vencido' + (vencidos > 1 ? 's' : '') + '</span>' : '') +
      (hoje.length ? '<span class="pill hoje">' + hoje.length + ' vence' + (hoje.length > 1 ? 'm' : '') + ' hoje</span>' : '') +
      (!lista.length ? '<span class="pill pago">em dia</span>' : '') + '</span></div>' +
    (lista.length ? '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th data-tipo="data">Vencimento</th><th>Quem</th><th class="num">Valor</th><th class="sem-ordem"></th></tr></thead><tbody>' +
      lista.map((l) => '<tr class="clicavel' + (l.vencimento === h ? ' linha-hoje' : '') + '" data-linha-pagar title="Clique para dar como recebido"><td class="mono" data-ord="' + l.vencimento + '">' +
        (l.vencimento === h ? '<span class="pill hoje">Vence hoje</span>' : dataBR(l.vencimento) + '<div class="sub">' + diasAtraso(l.vencimento) + '</div>') + '</td>' +
        '<td><b>' + esc(quemDe(l) || l.descricao) + '</b><div class="sub">' + esc(l.descricao) + '</div></td>' +
        '<td class="num mono ' + (l.tipo === 'receita' && !l.redutor ? 'valor-rec' : 'valor-desp') + '" data-ord="' + (l.tipo === 'despesa' ? -l.valor : vl(l)) + '">' +
          (l.tipo === 'despesa' || l.redutor ? '− ' : '') + brl(l.valor) + (l.redutor ? '<div class="sub">redutor</div>' : l.tipo === 'despesa' ? '<div class="sub">a pagar</div>' : '') + '</td>' +
        '<td class="acoes-l"><button class="btn btn-v btn-mini" data-pagar="' + l.id + '">✓ Recebido</button></td></tr>').join('') +
      '</tbody><tfoot><tr><td colspan="2">Total</td><td class="num mono">' + brl(total) + '</td><td></td></tr></tfoot></table></div>'
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


// ─────────── Mural do Início: o que pede atenção hoje + recados do escritório ───────────
// Destaques (avisos não lidos, prazos fatais da semana, tarefas atrasadas, publicações novas) abrem o lugar certo.
// Recados: qualquer pessoa da equipe publica; o administrador pode fixar no topo; apaga quem publicou ou o admin.
async function cardMural() {
  const el = $('ini-mural'); if (!el) return;
  const h = hojeISO();
  const [recados, avisos, tarefas, pubs] = await Promise.all([
    q(sb.from('mural').select('*').order('fixo', { ascending: false }).order('criado_em', { ascending: false }).limit(20)).catch(() => []),
    contarAlertas().catch(() => ({ total: 0, altos: 0 })),
    q(sb.from('tarefas').select('id, prazo, prazo_fatal, responsavel, participantes, chave_regra').not('status', 'in', '(concluida,cancelada)')).catch(() => []),
    pode('juridico') ? q(sb.from('publicacoes').select('id').eq('status', 'nova')).catch(() => []) : []
  ]);
  const minhas = tarefas.filter(ehMinha);
  const fatais = minhas.filter((t) => t.prazo_fatal && t.prazo_fatal <= somarDias(h, 7)).length, atrasadas = minhas.filter((t) => t.prazo && t.prazo < h && !/^cob:/.test(t.chave_regra || '')).length;
  const vivos = recados.filter((r) => !r.expira_em || r.expira_em >= h).slice(0, 6);
  const admin = E.perfil && E.perfil.papel === 'admin';
  const dest = [
    avisos.total ? ['avisos', (avisos.altos ? 'critico' : ''), '🔔', avisos.total, 'aviso(s) não lido(s)'] : null,
    fatais ? ['fatais', 'critico', '⚑', fatais, 'prazo(s) fatal(is) em 7 dias'] : null,
    atrasadas ? ['atrasadas', 'critico', '⏰', atrasadas, 'tarefa(s) atrasada(s)'] : null,
    pubs.length ? ['pubs', '', '📰', pubs.length, 'publicação(ões) nova(s)'] : null
  ].filter(Boolean);
  el.innerHTML = '<div class="card ini-mural"><div class="card-hd">📌 Mural</div><div class="card-bd">' +
    (dest.length ? '<div class="mural-destaques">' + dest.map((d) => '<button type="button" class="mural-dest ' + d[1] + '" data-mural="' + d[0] + '">' + d[2] + ' <b>' + d[3] + '</b> ' + d[4] + '</button>').join('') + '</div>'
      : '<div class="sub" style="margin-bottom:10px">Nada pedindo atenção agora. 👏</div>') +
    (vivos.length ? '<div class="mural-lista">' + vivos.map((r) => '<div class="mural-it' + (r.fixo ? ' fixo' : '') + '"><div class="mural-txt">' + (r.fixo ? '📌 ' : '') + esc(r.texto) +
      '<div class="sub">' + esc(r.autor_nome || '—') + ' · ' + dataHoraBR(r.criado_em) + (r.expira_em ? ' · até ' + dataBR(r.expira_em) : '') + '</div></div>' +
      (admin || (E.perfil && r.autor === E.perfil.id) ? '<button type="button" class="btn-etq" data-mural-x="' + r.id + '" title="Apagar recado" aria-label="Apagar recado">×</button>' : '') + '</div>').join('') + '</div>' : '') +
    '<div class="mural-novo"><textarea id="mural-txt" maxlength="1000" placeholder="Recado para o escritório (ex.: reunião sexta às 14h; feriado municipal na segunda)"></textarea>' +
      '<div style="display:flex;flex-direction:column;gap:6px">' + (admin ? '<label class="check" style="font-size:12.5px"><input type="checkbox" id="mural-fixo"> Fixar no topo</label>' : '') +
      '<button type="button" class="btn btn-p btn-mini" id="mural-pub">Publicar</button></div></div></div></div>';
  el.querySelectorAll('[data-mural]').forEach((b) => b.onclick = () => {
    const k = b.dataset.mural;
    if (k === 'avisos') abrirAlertas(null, () => cardMural());
    else if (k === 'pubs') irParaTela('publicacoes');
    else { E.tf = Object.assign(E.tf || {}, { vista: 'lista', atalho: k === 'fatais' ? '7' : 'atrasadas', aba: 'abertas' }); irParaTela('tarefas'); }
  });
  el.querySelectorAll('[data-mural-x]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    if (!confirm('Apagar este recado?')) return;
    await q(sb.from('mural').delete().eq('id', b.dataset.muralX)); await cardMural();
  }));
  $('mural-pub').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const t = $('mural-txt').value.trim(); if (!t) throw new Error('Escreva o recado.');
    await q(sb.from('mural').insert({ texto: t, fixo: !!($('mural-fixo') && $('mural-fixo').checked) }));
    aviso('✓ Recado publicado no mural.'); await cardMural();
  });
}
