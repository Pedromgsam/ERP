'use strict';
// ═══════════════════════════════════════════════════════════════════
// Início (resumo das duas empresas) e Painel Executivo (passivo
// tributário consolidado dos clientes, como no ERP antigo).
// ═══════════════════════════════════════════════════════════════════

function kpi(rotulo, valor, cor, sub) {
  return '<div class="kpi ' + (cor || '') + '"><div class="kpi-l">' + rotulo + '</div><div class="kpi-v">' + valor +
    '</div><div class="kpi-s">' + esc(sub || '') + '</div></div>';
}

// ─────────────────────────── INÍCIO ────────────────────────────────
// Cartões sem sobreposição: "A receber" = de hoje até o fim do mês (o que já venceu fica só em "Em atraso").
// Em atraso: duas tabelas completas lado a lado (Jurídico | Contabilidade), com o que vence HOJE destacado.
TELAS.inicio = async function () {
  if (typeof ambTeste === 'function' && ambTeste() && typeof inicioTeste === 'function') return inicioTeste();   // Backup 96: Início do ambiente de teste
  // Backup 74: como no ambiente de teste, mas funcionando com os dados reais — cabeçalho com a data, os cartões Financeiro e Escritório
  // (o usuário pediu para manter, E3 = não), "Meu dia" (hoje + atrasadas) ao lado de Lembretes e "Próximos 7 dias" (o calendário da fila saiu no Backup 83: agenda só em Tarefas).
  const h = new Date(), hora = h.getHours(), saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const dataLonga = h.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  // Backup 82 (E3 aprovado): os cartões grandes viraram a faixa "Financeiro · Escritório" em pílulas, como no ambiente; avisos e conferências entram na linha do Escritório
  // Backup 89 (I1): Início "Hoje" — saudação, UMA faixa de avisos (até 5, só o que pede ação), "Para hoje" (atrasadas + vencendo hoje, com Concluir)
  // e Lembretes em pequeno ao lado. Saiu "Próximos 7 dias" (está em Tarefas → Calendário); "Ver como" foi para o ⋯.
  const adm = (E.perfil || {}).papel === 'admin' && typeof pessoasFiltro === 'function';
  $('conteudo').innerHTML =
    cabecalhoTela({ icone: 'inicio', titulo: saud + ', ' + primeiroNomeUsuario(), frase: dataLonga, botao: { id: 'lemb-novo', rotulo: 'Lembrete' },
      mais: adm ? ['<div class="b-mais-rot">Ver o dia de</div>'].concat(pessoasFiltro().map((n) => '<button type="button" role="menuitem" class="b-mais-it" data-ini-vercomo="' + esc(primeiroNome(n)) + '">' + esc(nomeCurto(n)) + '</button>')) : null }) +
    '<div id="ini-valid"></div>' +
    '<section class="b-faixa-av ini-faixa ini-faixa-1" id="ini-faixa"><div class="b-faixa-lin"><span class="b-faixa-rot">Avisos</span><div class="ini-conf-l"><span id="ini-resumo" class="ini-pills"></span><span id="ini-resumo-fin" hidden></span></div></div></section>' +
    '<div class="ini-b74 ini-b89"><section class="ini-col"><div class="ini-sec-hd"><div><h2 id="ini-dia-tit">Para hoje</h2><p id="ini-dia-sub">Atrasadas e o que vence hoje</p></div><div id="ini-quem"></div></div><div id="ini-dia"></div></section>' +
    '<section class="ini-col ini-col-lemb"><div id="ini-lembretes"></div></section></div>';
  // Backup 83: sem o calendário ("Minha fila de trabalho") no Início — a agenda fica só em Tarefas (Semana · Calendário)
  $('lemb-novo').onclick = () => formLembrete();
  verComoIni();
  cardLembretes().catch((e) => console.error(e));
  cardResumoEscritorio().catch((e) => console.error(e));
  meuDia().catch((e) => console.error(e));
  // Backup 86 (M31): sem as linhas Avisos/Conferências na faixa (conferenciasIni saiu)
  if (typeof buscaPubAutomatica === 'function') buscaPubAutomatica().catch(() => {});
  if (typeof vigiarAgenda === 'function') vigiarAgenda();   // Backup 40: aviso antes dos compromissos
  if (typeof cardValidacoes === 'function') cardValidacoes().then((c) => { const el = $('ini-valid'); if (el) { el.innerHTML = c.html; c.ligar(el); } }).catch((e) => console.error(e));
};
ICONES_B.inicio = ICONES_B.inicio || '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>';
// Backup 74: "Meu dia" (prazo até hoje, inclusive atrasadas) e "Próximos 7 dias" — tarefas reais, com Concluir (e Desfazer por 6 s)
const TIPO_ITEM_INI = { reuniao: 'Reunião', audiencia: 'Audiência', compromisso: 'Compromisso', tarefa: 'Tarefa', rotina: 'Rotina' };
// Backup 82: "Ver como" (como no ambiente) — o administrador vê o dia de outra pessoa da equipe
function verComoIni() {
  // Backup 89 (I1/D2): "Ver o dia de" está no ⋯ do cabeçalho (só o administrador)
  E.ini = E.ini || { quem: 'eu' };
  const cab = document.querySelector('#conteudo .b-cab'); if (!cab) return;
  cab.addEventListener('click', (ev) => { const b = ev.target.closest('[data-ini-vercomo]'); if (!b) return;
    E.ini.pessoa = b.dataset.iniVercomo === primeiroNome(meuNome()) ? '' : b.dataset.iniVercomo; E.ini.quem = 'eu'; meuDia(); });
}
async function meuDia() {
  const el = $('ini-dia'); if (!el) return;
  E.ini = E.ini || { quem: 'eu' };
  const h = hojeISO(), lim = somarDias(h, 7);
  const L = await buscarTodos(() => sb.from('tarefas').select('id, titulo, prazo, prazo_fatal, hora, responsavel, participantes, revisor, status, tipo_agenda, chave_regra, recorrencia, cliente_id, grupo_id')
    .not('status', 'in', '(concluida,cancelada)').lte('prazo', h).order('prazo')).catch(() => []);   // Backup 89: só até hoje (os próximos dias estão em Tarefas)
  const daPessoa = (t, p) => [t.responsavel, t.revisor].concat(String(t.participantes || '').split(',')).some((n) => n && primeiroNome(n) === p);
  const doDono = (t) => E.ini.quem === 'todos' || (E.ini.pessoa ? daPessoa(t, E.ini.pessoa) : ehMinha(t));
  const linha = (t) => { const tipo = TIPO_ITEM_INI[tipoItemAgenda(t)] || 'Tarefa', atr = t.prazo < h;
    const sub = [String(t.responsavel || '').split(' ')[0]].filter(Boolean).join(' · ');   // Backup 88/89: sem "prazo fatal"
    return '<div class="ini-it' + (atr ? ' ini-it-atr' : '') + '" data-ini-t="' + t.id + '" tabindex="0"><span class="ini-tipo">' + esc(tipo) + '</span><div class="ini-it-tx"><b>' + esc(t.titulo) + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>' +
      '<span class="ini-dt' + (atr ? ' ini-dt-atr' : '') + '">' + (t.hora ? esc(String(t.hora).slice(0, 5)) + ' · ' : '') + dataBR(t.prazo).slice(0, 5) + '</span>' +
      '<button type="button" class="b-bt-baixa" data-ini-ok="' + t.id + '">Concluir</button></div>'; };
  const pintar = () => {
    $('ini-quem').innerHTML = segFiltroB('', 'data-ini-quem', [['eu', E.ini.pessoa ? 'Só ' + E.ini.pessoa.charAt(0).toUpperCase() + E.ini.pessoa.slice(1) : 'Só eu'], ['todos', 'Equipe toda']], E.ini.quem, 'De quem');
    const hoje = L.filter((t) => t.prazo && t.prazo <= h && doDono(t)).sort((a, b) => String(a.prazo).localeCompare(String(b.prazo)) || String(a.hora || '').localeCompare(String(b.hora || '')));
    const nAtr = hoje.filter((t) => t.prazo < h).length, nHoje = hoje.length - nAtr;
    const sub = $('ini-dia-sub'); if (sub) sub.textContent = hoje.length ? [nAtr ? plural(nAtr, 'atrasada', 'atrasadas') : '', nHoje ? plural(nHoje, 'vence hoje', 'vencem hoje').replace(/^1 vencem/, '1 vence') : ''].filter(Boolean).join(' · ') : 'Atrasadas e o que vence hoje';
    el.innerHTML = hoje.length ? '<div class="ini-lista">' + hoje.map(linha).join('') + '</div>' : '<div class="ini-vazio">' + vazioB({ icone: 'ok', titulo: 'Nada para hoje', frase: 'Nenhuma tarefa vence hoje nem está atrasada.' }) + '</div>';
  };
  pintar();
  const raiz = el.closest('.ini-b74');
  raiz.onclick = (ev) => {
    const q2 = ev.target.closest('[data-ini-quem]'); if (q2) { E.ini.quem = q2.dataset.iniQuem; return pintar(); }
    const ok = ev.target.closest('[data-ini-ok]');
    if (ok) { ev.stopPropagation(); const id = ok.dataset.iniOk, t = L.find((x) => x.id === id); return comBotao(ok, async () => {
      await q(sb.from('tarefas').update({ status: 'concluida' }).eq('id', id));
      const i = L.indexOf(t); if (i >= 0) L.splice(i, 1); pintar();
      const desfazer = async () => { await q(sb.from('tarefas').update({ status: t.status || 'pendente' }).eq('id', id)); L.splice(Math.max(0, i), 0, t); pintar(); };
      if (window.ERP_EDITOR && window.ERP_EDITOR.gravou) window.ERP_EDITOR.gravou('Tarefa concluída — ' + t.titulo, desfazer, 8000); else aviso('✓ Tarefa concluída.');
    }); }
    const it = ev.target.closest('[data-ini-t]');
    if (it && typeof abrirTarefa === 'function') q(sb.from('tarefas').select('*').eq('id', it.dataset.iniT).maybeSingle()).then((t) => { if (t) abrirTarefa(t, () => TELAS.inicio()); });
  };
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
    '<div class="titulo-pag b-cab"><div class="b-cab-ic">' + iconeB('pizza') + '</div><div class="b-cab-tx"><h1>Painel Executivo</h1><p>Passivo tributário consolidado · todos os grupos e empresas</p></div></div>' +
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
async function dadosLembretes() {
  const h = hojeISO();
  const meus = await q(sb.from('lembretes').select('*').is('feito_em', null).order('dia', { nullsFirst: true })).catch(() => []);
  const eu = primeiroNome((E.perfil && E.perfil.nome) || ''), lim = somarDias(h, 7);
  const meu = meus.filter((l) => !l.pessoa || primeiroNome(l.pessoa) === eu || (E.perfil && E.perfil.papel === 'admin'))
    .sort((a, b) => (b.fixo - a.fixo) || ((a.dia ? 1 : 0) - (b.dia ? 1 : 0)) || String(a.dia || '').localeCompare(String(b.dia || '')));
  // Backup 23: o lembrete com data distante não "some" — fica em "Mais adiante" até faltar 7 dias
  const vis = meu.filter((l) => l.fixo || !l.dia || l.dia <= lim), futuros = meu.filter((l) => !(l.fixo || !l.dia || l.dia <= lim));
  return { semGuia: [], vis, futuros, todos: meu };   // Backup 38: as guias saíram do Início (ficam em Parcelamentos/Rotina)
}
// Cartão próprio de Lembretes (o que NÃO é tarefa; Backup 24: as guias foram para a faixa de destaques): lembretes dos próximos 7 dias / sem prazo / fixos,
// e "Mais adiante" com os de data distante. Clicar no lembrete abre o DETALHAMENTO (editar fica lá dentro).
async function cardLembretes() {
  const el = $('ini-lembretes'); if (!el) return;
  // Backup 27: aparecem os fixados (sempre), os sem prazo e os com data em até 7 dias; o resto fica em "Todos os lembretes"
  const L = await dadosLembretes().catch(() => ({ semGuia: [], vis: [], futuros: [], todos: [], dias: 5 }));
  // Backup 82: como no ambiente — título "Lembretes" (sem cartão em volta), itens com a faixa de cor à esquerda e "✓ Feito"; o "+ Lembrete" foi para o alto da tela
  el.innerHTML = '<div class="ini-lemb"><div class="ini-sec-hd"><div><h2>Lembretes</h2></div><button type="button" class="b-link" id="lemb-todos" title="Todos os lembretes, inclusive os com data depois de 7 dias e os concluídos">Todos (' + L.todos.length + ')</button></div>' +
    (L.vis.length ? '<div class="lemb-lista">' + htmlLembretes(L.vis) + '</div>' : '<div class="ini-vazio-p">Nenhum lembrete nos próximos 7 dias.</div>') +
    (L.futuros.length ? '<button type="button" class="lemb-tg lemb-tg-fut" id="lemb-fut">+ ' + plural(L.futuros.length, 'lembrete mais adiante', 'lembretes mais adiante') + ' — ver todos</button>' : '') +
    '</div>';
  const fu = $('lemb-fut'); if (fu) fu.onclick = () => janelaTodosLembretes();
  $('lemb-todos').onclick = () => janelaTodosLembretes();
  ligarLembretes(el, L);
}
// Todos os lembretes (Backup 27): fixados, próximos 7 dias/sem prazo, mais adiante e concluídos nos últimos 90 dias
async function janelaTodosLembretes() {
  const h = hojeISO();
  const [L, feitos] = await Promise.all([dadosLembretes(), q(sb.from('lembretes').select('*').not('feito_em', 'is', null).gte('feito_em', somarDias(h, -90)).order('feito_em', { ascending: false })).catch(() => [])]);
  const fixos = L.todos.filter((l) => l.fixo), prox = L.vis.filter((l) => !l.fixo);
  const sec = (tit, lista, vazio) => '<div class="lemb-sec"><div class="secao">' + tit + ' <span class="sub">' + lista.length + '</span></div>' +
    (lista.length ? '<div class="lemb-lista">' + htmlLembretes(lista) + '</div>' : '<div class="sub">' + vazio + '</div>') + '</div>';
  const j = abrirJanela({ titulo: '🔔 Todos os lembretes', larga: true,
    corpo: sec('📌 Fixados no topo', fixos, 'Nenhum lembrete fixado.') + sec('Próximos 7 dias e sem prazo', prox, 'Nada para os próximos 7 dias.') +
      sec('Mais adiante (aparecem no Início 7 dias antes)', L.futuros.filter((l) => !l.fixo), 'Nenhum lembrete com data distante.') +
      '<div class="lemb-sec"><div class="secao">✓ Concluídos nos últimos 90 dias <span class="sub">' + feitos.length + '</span></div>' +
      (feitos.length ? '<div class="lista-ficha">' + feitos.map((l) => '<div class="item-ficha"><div><span style="text-decoration:line-through">' + esc(l.texto) + '</span><div class="sub">feito em ' + dataBR(String(l.feito_em).slice(0, 10)) + '</div></div>' +
        '<button type="button" class="btn btn-o btn-mini" data-lemb-volta="' + l.id + '">↺ Reabrir</button></div>').join('') + '</div>' : '<div class="sub">Nenhum.</div>') + '</div>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-p" type="button" id="lt-novo">+ Lembrete</button></div>' });
  const reabrir = () => { fecharJanela(j); janelaTodosLembretes(); };
  ligarLembretes(j, L, reabrir);
  j.querySelector('#lt-novo').onclick = () => { fecharJanela(j); formLembrete(); };
  j.querySelectorAll('[data-lemb-volta]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    await q(sb.from('lembretes').update({ feito_em: null }).eq('id', b.dataset.lembVolta)); aviso('Lembrete reaberto.'); await cardLembretes(); reabrir();
  }));
}

// ── Resumo do escritório (Início = "home"): um número por assunto, clicável ──
async function cardResumoEscritorio() {
  const el = $('ini-resumo'); if (!el) return;
  // Backup 17: só o que pede ação (sem Processos). Atraso, hoje e próximos 5 dias ficam no mesmo cartão, um por linha.
  const h = hojeISO(), lim5 = somarDias(h, 5);
  const conta = (qq) => qq.then((r) => (r.error ? 0 : r.count || 0)).catch(() => 0);
  const cnt = (t) => sb.from(t).select('id', { count: 'exact', head: true });
  const jur = pode('juridico'), crm = pode('crm'), fin = pode('financeiro_juridico') || pode('financeiro_contab');
  const aberta = () => cnt('tarefas').not('status', 'in', '(concluida,cancelada)');
  const tres = (t, col, filtro) => jur ? Promise.all([
    conta(filtro(cnt(t)).lt(col, h)), conta(filtro(cnt(t)).eq(col, h)), conta(filtro(cnt(t)).gt(col, h).lte(col, lim5))]) : [0, 0, 0];
  let lancs = [];
  const [pubs, parc, aco, ops, tAb, tAtr, tHoje, t5] = await Promise.all([
    // Backup 39: só as publicações do advogado que entrou (pelo primeiro nome: Pedro vê as do Pedro)
    jur ? conta(cnt('publicacoes').eq('status', 'nova').or('advogado.ilike.' + primeiroNomeUsuario().replace(/[,()*%]/g, '') + '*,advogados.ilike.*' + primeiroNomeUsuario().replace(/[,()*%]/g, '') + '*')) : 0,
    tres('parcelas', 'vencimento', (x) => x.eq('pago', false)),
    tres('acordos', 'vencimento', (x) => x.eq('pago', false)),
    crm ? q(sb.from('crm_oportunidades').select('valor_estimado, crm_etapas(final)')).catch(() => []) : [],
    conta(aberta()), conta(aberta().lt('prazo', h)), conta(aberta().eq('prazo', h)), conta(aberta().gt('prazo', h).lte('prazo', lim5)),
    // Backup 50: financeiro que vence (em atraso, hoje e nos próximos 5 dias)
    fin ? buscarTodos(() => sb.from('lancamentos').select('id, tipo, valor, redutor, vencimento, empresa').eq('pago', false).eq('perda', false).lte('vencimento', lim5)).catch(() => []) : []
  ]).then((r) => { lancs = r.pop(); return r; });
  const abertas = (ops || []).filter((o) => !(o.crm_etapas && o.crm_etapas.final));
  // linhas de prazo: [quantidade, texto, cor] — Backup 19: plural certo, sem "(s)"
  const pl = (n, um, varios) => (Number(n) === 1 ? um : varios);
  const prazos = (v) => [[v[1], pl(v[1], 'vence hoje', 'vencem hoje'), 'ambar'], [v[2], 'nos próximos 5 dias', '']];
  const T = [
    jur ? ['publicacoes', '📰', 'Publicações', pubs, pl(pubs, 'nova sua para ler', 'novas suas para ler'), [], pubs ? 'ambar' : ''] : null,
    jur ? ['parcelamentos', '🧾', 'Parcelamentos', parc[0], pl(parc[0], 'parcela em atraso', 'parcelas em atraso'), prazos(parc), parc[0] ? 'vermelho' : parc[1] ? 'ambar' : ''] : null,
    jur ? ['acordos', '🤝', 'Acordos', aco[0], pl(aco[0], 'parcela em atraso', 'parcelas em atraso'), prazos(aco), aco[0] ? 'vermelho' : aco[1] ? 'ambar' : ''] : null,
    crm ? ['crm', '🎯', 'CRM', abertas.length, pl(abertas.length, 'oportunidade em andamento', 'oportunidades em andamento'), [[null, brl(soma(abertas, (o) => o.valor_estimado)) + ' em negociação', '']], ''] : null,
    // Backup 53: A receber separado (Jurídico × Contabilidade) e A pagar à parte; cada um com hoje · próximos 5 dias · em atraso (sem repetir valores)
    ...(() => { if (!fin) return [];
      const f = (l, a, b) => l.filter((x) => x.vencimento >= a && x.vencimento <= b), at = (l) => l.filter((x) => x.vencimento < h);
      const sm = (l) => brlCurto(soma(l, (x) => Math.abs(vl(x)))), amanha = somarDias(h, 1);
      const card = (k, tit, l) => [k, '💰', tit, sm(f(l, h, h)), 'vence hoje',
        [[null, sm(f(l, amanha, lim5)) + ' nos próximos 5 dias', ''], [null, at(l).length ? sm(at(l)) + ' em atraso' : '', '']].filter((x) => x[1]),
        at(l).length ? 'vermelho' : f(l, h, h).length ? 'ambar' : ''];   // Backup 53: o cartão aparece mesmo zerado (R$ 0 = nada vence)
      const rec = lancs.filter((l) => l.tipo === 'receita'), pag = lancs.filter((l) => l.tipo === 'despesa');
      return [pode('financeiro_juridico') ? card('fin-jur', 'A receber · Jurídico', rec.filter((l) => l.empresa !== 'contabilidade')) : null,
        pode('financeiro_contab') ? card('fin-contab', 'A receber · Contabilidade', rec.filter((l) => l.empresa === 'contabilidade')) : null,
        // Backup 55: "A pagar" virou "A pagar · Contabilidade" e mostra só as despesas da contabilidade
        pode('financeiro_contab') ? card('fin-pagar', 'A pagar · Contabilidade', pag.filter((l) => l.empresa === 'contabilidade')) : null].filter(Boolean); })(),
    ['tarefas', '📋', 'Tarefas do escritório', tAb, 'em aberto · equipe toda', [[tAtr, pl(tAtr, 'atrasada', 'atrasadas'), 'vermelho']].concat(prazos([0, tHoje, t5])), tAtr ? 'vermelho' : '']
  ].filter(Boolean);
  // Backup 85 (IN1/IN2/IN3/TB8): a faixa do ambiente — Financeiro: "honorários em atraso" e "a pagar em 5 dias";
  // Escritório: guias a emitir, parcelas em atraso, acordos em atraso, publicações, tarefas atrasadas, e-mail com erro, certificado vencendo.
  // Cada pílula abre a tela já na aba e no prazo certos (Backup 86: CRM e avisos/conferências saíram).
  const pil = (k, n, txt, nivel, tit) => '<button type="button" class="ini-conf-it ini-pil b-av-' + nivel + '" data-ini-ir="' + k + '"' + (tit ? ' title="' + esc(tit) + '"' : '') + '><span class="b-av-pt" aria-hidden="true"></span>' +
    (n !== '' && n != null ? '<b>' + n + '</b>' : '') + '<span class="ini-pil-tx">' + esc(txt) + '</span></button>';
  const finP = [], esc2 = [];
  const fimMes = (() => { const d = new Date(h + 'T12:00:00'); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10); })();
  const [guias, emailsErro, certs, confAtr] = await Promise.all([
    jur ? conta(sb.from('parcelas').select('id, parcelamentos!inner(emitimos_guia)', { count: 'exact', head: true }).eq('pago', false).is('emitida_em', null).lte('vencimento', fimMes).eq('parcelamentos.emitimos_guia', true)) : 0,
    pode('admin') || pode('clientes') ? conta(cnt('email_fila').eq('status', 'erro').gte('criado_em', somarDias(h, -30))) : 0,
    pode('clientes') ? conta(sb.from('cliente_certificado').select('cliente_id', { count: 'exact', head: true }).not('validade', 'is', null).lte('validade', somarDias(h, 30))) : 0,
    // Backup 93 (A2): grupos com o passivo há mais de 30 dias sem conferência
    pode('clientes', 'editar') ? q(sb.rpc('conferencias_passivo_atrasadas', { p_dias: 30 })).then((l) => (l || []).length).catch(() => 0) : 0]);
  if (lancs && (pode('financeiro_juridico') || pode('financeiro_contab'))) {
    const atr = (l) => l.filter((x) => x.vencimento <= h), cinco = (l) => l.filter((x) => x.vencimento <= lim5);
    const sm = (l) => brl(soma(l, (x) => Math.abs(vl(x))));
    const recJ = pode('financeiro_juridico') ? atr(lancs.filter((l) => l.tipo === 'receita' && !l.redutor && l.empresa !== 'contabilidade')) : [];
    const recC = pode('financeiro_contab') ? atr(lancs.filter((l) => l.tipo === 'receita' && !l.redutor && l.empresa === 'contabilidade')) : [];
    const pag = pode('financeiro_contab') ? cinco(lancs.filter((l) => l.tipo === 'despesa' && !l.redutor && l.empresa === 'contabilidade')) : [];
    if (recJ.length || recC.length) finP.push(pil(recJ.length ? 'fin-jur' : 'fin-contab', sm(recJ.concat(recC)), 'de honorários em atraso', 'critico'));   // Backup 86 (M32): sem o balão Jurídico/Contabilidade
    if (pag.length) finP.push(pil('fin-pagar', sm(pag), 'a pagar em 5 dias', 'atencao', 'A pagar · Contabilidade'));
  }
  const parcAtr = (Number(parc[0]) || 0) + (Number(parc[1]) || 0), acAtr = (Number(aco[0]) || 0) + (Number(aco[1]) || 0);
  if (guias) esc2.push(pil('guias', guias, pl(guias, 'guia a emitir este mês', 'guias a emitir este mês'), 'atencao'));
  if (parcAtr) esc2.push(pil('parcelamentos', parcAtr, pl(parcAtr, 'parcela de parcelamento em atraso', 'parcelas de parcelamento em atraso'), 'critico'));
  if (acAtr) esc2.push(pil('acordos', acAtr, pl(acAtr, 'parcela de acordo em atraso', 'parcelas de acordo em atraso'), 'critico'));
  if (pubs) esc2.push(pil('publicacoes', pubs, pl(pubs, 'publicação nova', 'publicações novas'), 'info'));
  if (tAtr) esc2.push(pil('tarefas', tAtr, pl(tAtr, 'tarefa atrasada', 'tarefas atrasadas'), 'critico'));
  if (emailsErro) esc2.push(pil('emails', emailsErro, pl(emailsErro, 'e-mail com erro', 'e-mails com erro'), 'critico'));
  if (confAtr) esc2.push(pil('conferencia', confAtr, pl(confAtr, 'grupo sem conferência do passivo há 30+ dias', 'grupos sem conferência do passivo há 30+ dias'), 'atencao'));
  if (certs) esc2.push(pil('certificados', certs, pl(certs, 'certificado vencendo', 'certificados vencendo'), 'atencao'));
  // Backup 89 (I1): UMA faixa "Avisos" — Financeiro e Escritório juntos, os críticos primeiro, no máximo 5 à vista (o resto em "+N")
  const todosP = finP.concat(esc2), peso = (h2) => (/b-av-critico/.test(h2) ? 0 : /b-av-atencao/.test(h2) ? 1 : 2);
  todosP.sort((a2, b2) => peso(a2) - peso(b2));
  const vis5 = todosP.slice(0, 5), resto = todosP.slice(5);
  el.innerHTML = (!todosP.length ? '<span class="ini-tudo-ok">' + iconeB('ok') + 'Nada pendente. Tudo em dia.</span>' : '') + vis5.join('') +
    (resto.length ? '<span class="ini-pil-resto" hidden>' + resto.join('') + '</span><button type="button" class="b-link ini-pil-mais" id="ini-pil-mais">+' + resto.length + '</button>' : '');
  const pm = $('ini-pil-mais'); if (pm) pm.onclick = () => { el.querySelector('.ini-pil-resto').hidden = false; pm.remove(); };
  const raiz = $('ini-faixa') || el;
  raiz.querySelectorAll('[data-ini-ir]').forEach((b) => b.onclick = () => abrirDaFaixa(b.dataset.iniIr));
}
// Backup 85 (TB8): cada item da faixa abre a tela já filtrada (aba e prazo certos)
function abrirDaFaixa(k) {
  const ir = (t) => { if (typeof window.nav === 'function') window.nav(null, t); else irPara(t); };
  if (k === 'fin-jur' || k === 'fin-contab') { const emp = k === 'fin-jur' ? 'juridico' : 'contabilidade';
    estadoFinB(emp).aba = 'lanc'; prepararTabB('fin-' + emp, { aba: 'areceber', prazo: 'venc' }); return ir(emp === 'juridico' ? 'financeiro' : 'financeiroContab'); }
  if (k === 'fin-pagar') { estadoFinB('contabilidade').aba = 'lanc'; prepararTabB('fin-contabilidade', { aba: 'apagar', prazo: '5' }); return ir('financeiroContab'); }
  if (k === 'parcelamentos') { prepararTabB('parcelas', { aba: 'apagar', prazo: 'venc' }); return ir('parcelamentos'); }
  if (k === 'acordos') { prepararTabB('acordos', { aba: 'apagar', prazo: 'venc' }); return ir('acordos'); }
  if (k === 'tarefas') { E.tf = Object.assign(E.tf || {}, { aba: 'atrasadas', atalho: 'atrasadas', vista: 'lista' }); prepararTabB('tarefas', { aba: 'atrasadas' }); return ir('tarefas'); }
  if (k === 'publicacoes') { E.pub = Object.assign(E.pub || { tribunal: '', dias: '30', busca: '' }, { status: 'nova', adv: primeiroNomeUsuario() }); return ir('publicacoes'); }
  if (k === 'guias') { E.rt = Object.assign(E.rt || {}, { aba: 'guias' }); return ir('rotina'); }
  if (k === 'emails') { E.adm = Object.assign(E.adm || { tabela: '' }, { aba: 'email', emailAba: 'saida', saidaF: 'erro' }); return ir('admin'); }
  if (k === 'conferencia') { E.rt = Object.assign(E.rt || {}, { aba: 'passivo' }); return ir('rotina'); }
  if (k === 'certificados') { E.rt = Object.assign(E.rt || {}, { aba: 'passivo' }); return ir('rotina'); }
  return ir(k);
}
// o estado do Financeiro mora em E.fin[empresa] (telas-financeiro.js); aqui só garante a aba de Lançamentos
function estadoFinB(emp) { E.fin = E.fin || {}; E.fin[emp] = E.fin[emp] || { aba: 'analise', an: { quem: [], preset: 'ano', de: '', ate: '', tipo: '', grupo: '' }, caixa: 'consolidado', dados: null, lidoEm: 0 }; return E.fin[emp]; }

// ── Lembretes: o que NÃO é tarefa (recado sem prazo, pagar o aluguel, emitir guias de parcelamento) ──
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
    await q(sb.rpc('registrar_emissao', { p_tabela: 'parcelas', p_id: b.dataset.guiaOk, p_emitida: true, p_doc: null, p_enviar: false })); aviso('✓ Guia marcada como emitida.'); await fim();
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
    if (!await confirmarB('Apagar este lembrete?')) return;
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


