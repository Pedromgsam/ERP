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
  // Backup 74: como no ambiente de teste, mas funcionando com os dados reais — cabeçalho com a data, os cartões Financeiro e Escritório
  // (o usuário pediu para manter, E3 = não), "Meu dia" (hoje + atrasadas) ao lado de Lembretes e "Próximos 7 dias", e o calendário da fila embaixo.
  const h = new Date(), hora = h.getHours(), saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const dataLonga = h.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  // Backup 82 (E3 aprovado): os cartões grandes viraram a faixa "Financeiro · Escritório" em pílulas, como no ambiente; avisos e conferências entram na linha do Escritório
  $('conteudo').innerHTML =
    cabecalhoTela({ icone: 'inicio', titulo: saud + ', ' + primeiroNomeUsuario(), frase: dataLonga, botao: { id: 'lemb-novo', rotulo: 'Lembrete' } }) +
    '<div id="ini-valid"></div>' +
    '<section class="b-faixa-av ini-faixa" id="ini-faixa"><div class="b-faixa-lin" id="ini-lin-fin"><span class="b-faixa-rot">Financeiro</span><div class="ini-conf-l" id="ini-resumo-fin"></div></div>' +
      '<div class="b-faixa-lin"><span class="b-faixa-rot">Escritório</span><div class="ini-conf-l"><span id="ini-resumo" class="ini-pills"></span><span id="ini-conf" class="ini-pills"></span></div></div></section>' +
    '<div class="ini-b74"><section class="ini-col"><div class="ini-sec-hd"><div><h2>Meu dia</h2><p>Hoje e o que atrasou</p></div><div class="b-chips ini-quem" id="ini-quem" role="group" aria-label="De quem"></div></div><div id="ini-dia"></div></section>' +
    '<section class="ini-col"><div id="ini-lembretes"></div><div class="ini-sec-hd ini-sec-hd2"><div><h2>Próximos 7 dias</h2></div></div><div id="ini-prox"></div></section></div>' +
    '<div id="ini-fila"></div>';
  $('lemb-novo').onclick = () => formLembrete();
  verComoIni();
  cardLembretes().catch((e) => console.error(e));
  cardResumoEscritorio().catch((e) => console.error(e));
  meuDia().catch((e) => console.error(e));
  conferenciasIni().catch((e) => console.error(e));   // Backup 76 (F3)
  if (typeof buscaPubAutomatica === 'function') buscaPubAutomatica().catch(() => {});
  if (typeof vigiarAgenda === 'function') vigiarAgenda();   // Backup 40: aviso antes dos compromissos
  if (typeof cardValidacoes === 'function') cardValidacoes().then((c) => { const el = $('ini-valid'); if (el) { el.innerHTML = c.html; c.ligar(el); } }).catch((e) => console.error(e));
  if (typeof cardMinhaFila === 'function') cardMinhaFila().then((c) => { const el = $('ini-fila'); if (el) { el.innerHTML = c.html; c.ligar(el); } }).catch((e) => console.error(e));
};
ICONES_B.inicio = ICONES_B.inicio || '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>';
// Backup 74: "Meu dia" (prazo até hoje, inclusive atrasadas) e "Próximos 7 dias" — tarefas reais, com Concluir (e Desfazer por 6 s)
const TIPO_ITEM_INI = { reuniao: 'Reunião', audiencia: 'Audiência', compromisso: 'Compromisso', tarefa: 'Tarefa', rotina: 'Rotina' };
// Backup 82: "Ver como" (como no ambiente) — o administrador vê o dia de outra pessoa da equipe
function verComoIni() {
  if ((E.perfil || {}).papel !== 'admin' || typeof pessoasFiltro !== 'function') return;
  const ac = document.querySelector('#panel-hoje .b-cab-acoes, #conteudo .b-cab-acoes'); if (!ac) return;
  E.ini = E.ini || { quem: 'eu' };
  const pes = pessoasFiltro();
  ac.insertAdjacentHTML('afterbegin', '<label class="ini-vercomo"><span>Ver como</span><select id="ini-vercomo">' +
    pes.map((n) => '<option value="' + esc(primeiroNome(n)) + '"' + ((E.ini.pessoa || primeiroNome(meuNome())) === primeiroNome(n) ? ' selected' : '') + '>' + esc(nomeCurto(n)) + '</option>').join('') + '</select></label>');
  $('ini-vercomo').onchange = (ev) => { E.ini.pessoa = ev.target.value === primeiroNome(meuNome()) ? '' : ev.target.value; E.ini.quem = 'eu'; meuDia(); };
}
async function meuDia() {
  const el = $('ini-dia'), elP = $('ini-prox'); if (!el) return;
  E.ini = E.ini || { quem: 'eu' };
  const h = hojeISO(), lim = somarDias(h, 7);
  const L = await buscarTodos(() => sb.from('tarefas').select('id, titulo, prazo, prazo_fatal, hora, responsavel, participantes, revisor, status, tipo_agenda, chave_regra, recorrencia, cliente_id, grupo_id')
    .not('status', 'in', '(concluida,cancelada)').lte('prazo', lim).order('prazo')).catch(() => []);
  const daPessoa = (t, p) => [t.responsavel, t.revisor].concat(String(t.participantes || '').split(',')).some((n) => n && primeiroNome(n) === p);
  const doDono = (t) => E.ini.quem === 'todos' || (E.ini.pessoa ? daPessoa(t, E.ini.pessoa) : ehMinha(t));
  const linha = (t) => { const tipo = TIPO_ITEM_INI[tipoItemAgenda(t)] || 'Tarefa', atr = t.prazo < h;
    const sub = [String(t.responsavel || '').split(' ')[0], t.prazo_fatal ? '<b class="ini-fatal">prazo fatal' + (t.prazo_fatal !== t.prazo ? ' ' + dataBR(t.prazo_fatal).slice(0, 5) : '') + '</b>' : ''].filter(Boolean).join(' · ');
    return '<div class="ini-it' + (atr ? ' ini-it-atr' : '') + '" data-ini-t="' + t.id + '" tabindex="0"><span class="ini-tipo">' + esc(tipo) + '</span><div class="ini-it-tx"><b>' + esc(t.titulo) + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>' +
      '<span class="ini-dt' + (atr ? ' ini-dt-atr' : '') + '">' + (t.hora ? esc(String(t.hora).slice(0, 5)) + ' · ' : '') + dataBR(t.prazo).slice(0, 5) + '</span>' +
      '<button type="button" class="b-bt-baixa" data-ini-ok="' + t.id + '">Concluir</button></div>'; };
  const pintar = () => {
    $('ini-quem').innerHTML = [['eu', E.ini.pessoa ? 'Só ' + E.ini.pessoa.charAt(0).toUpperCase() + E.ini.pessoa.slice(1) : 'Só eu'], ['todos', 'Equipe toda']].map(([v, r]) => '<button type="button" class="b-chip" data-ini-quem="' + v + '" aria-pressed="' + (E.ini.quem === v) + '">' + r + '</button>').join('');
    const hoje = L.filter((t) => t.prazo && t.prazo <= h && doDono(t)).sort((a, b) => String(a.prazo).localeCompare(String(b.prazo)) || String(a.hora || '').localeCompare(String(b.hora || '')));
    const prox = L.filter((t) => t.prazo && t.prazo > h && t.prazo <= lim && doDono(t));
    el.innerHTML = hoje.length ? '<div class="ini-lista">' + hoje.map(linha).join('') + '</div>' : '<div class="ini-vazio">' + vazioB({ icone: 'ok', titulo: 'Nada para hoje', frase: 'Nenhuma tarefa vence hoje nem está atrasada.' }) + '</div>';
    elP.innerHTML = prox.length ? '<div class="ini-lista">' + prox.slice(0, 6).map(linha).join('') + '</div>' + (prox.length > 6 ? '<button type="button" class="b-link ini-mais" data-ini-tarefas>Ver as ' + prox.length + ' em Tarefas</button>' : '')
      : '<div class="ini-vazio-p">Nada marcado para os próximos 7 dias.</div>';
  };
  pintar();
  const raiz = el.closest('.ini-b74');
  raiz.onclick = (ev) => {
    const q2 = ev.target.closest('[data-ini-quem]'); if (q2) { E.ini.quem = q2.dataset.iniQuem; return pintar(); }
    if (ev.target.closest('[data-ini-tarefas]')) return nav(null, 'tarefas');
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
  // Backup 82 (E3): pílulas da faixa, como no ambiente — cada uma abre a tela certa (data-ini-ir); só o que pede ação (o resto some)
  const pil = (k, n, txt, nivel, tit) => '<button type="button" class="ini-conf-it ini-pil b-av-' + nivel + '" data-ini-ir="' + k + '"><span class="b-av-pt" aria-hidden="true"></span>' +
    (n !== '' && n != null ? '<b>' + n + '</b>' : '') + '<span class="ini-pil-tx" data-tit="' + esc(tit) + '">' + esc(txt) + '</span></button>';
  const finP = [], esc2 = [];
  if (lancs && (pode('financeiro_juridico') || pode('financeiro_contab'))) {
    const at = (l) => l.filter((x) => x.vencimento < h), hj = (l) => l.filter((x) => x.vencimento === h), cinco = (l) => l.filter((x) => x.vencimento >= h && x.vencimento <= lim5);
    const sm = (l) => brl(soma(l, (x) => Math.abs(vl(x))));
    const rec = lancs.filter((l) => l.tipo === 'receita'), pag = lancs.filter((l) => l.tipo === 'despesa' && l.empresa === 'contabilidade');
    const parte = (k, l, nome) => { if (at(l).length) finP.push(pil(k, sm(at(l)), 'de honorários em atraso · ' + nome, 'critico', 'A receber · ' + nome));
      if (hj(l).length) finP.push(pil(k, sm(hj(l)), 'vence hoje · ' + nome, 'atencao', 'A receber · ' + nome)); };
    if (pode('financeiro_juridico')) parte('fin-jur', rec.filter((l) => l.empresa !== 'contabilidade'), 'Jurídico');
    if (pode('financeiro_contab')) { parte('fin-contab', rec.filter((l) => l.empresa === 'contabilidade'), 'Contabilidade');
      if (at(pag).length) finP.push(pil('fin-pagar', sm(at(pag)), 'a pagar em atraso', 'critico', 'A pagar · Contabilidade'));
      if (cinco(pag).length) finP.push(pil('fin-pagar', sm(cinco(pag)), 'a pagar em 5 dias', 'atencao', 'A pagar · Contabilidade')); }
    if (!finP.length) finP.push(pil('fin-jur', '', 'Nada em atraso nem vencendo hoje', 'ok', 'A receber · Jurídico'));
  }
  T.forEach((t) => { const [k, , tit, n] = t, num = Number(n) || 0;
    if (k === 'parcelamentos' && num) esc2.push(pil(k, num, pl(num, 'parcela de parcelamento em atraso', 'parcelas de parcelamento em atraso'), 'critico', tit));
    if (k === 'acordos' && num) esc2.push(pil(k, num, pl(num, 'parcela de acordo em atraso', 'parcelas de acordo em atraso'), 'critico', tit));
    if (k === 'publicacoes' && num) esc2.push(pil(k, num, pl(num, 'publicação nova', 'publicações novas'), 'info', tit));
    if (k === 'crm' && num) esc2.push(pil(k, num, pl(num, 'oportunidade em andamento', 'oportunidades em andamento'), 'info', tit));
    if (k === 'tarefas' && tAtr) esc2.push(pil(k, tAtr, pl(tAtr, 'tarefa atrasada', 'tarefas atrasadas'), 'critico', tit)); });
  const lf = $('ini-resumo-fin'); if (lf) { lf.innerHTML = finP.join(''); const lin = $('ini-lin-fin'); if (lin) lin.hidden = !finP.length; }
  el.innerHTML = esc2.join('');
  const raiz = $('ini-faixa') || el;
  raiz.querySelectorAll('[data-ini-ir]').forEach((b) => b.onclick = () => {
    const k = b.dataset.iniIr;
    if (k === 'tarefas') E.tf = Object.assign(E.tf || {}, { aba: 'abertas', atalho: 'atrasadas' });
    if (/^fin-/.test(k)) { if (typeof window.nav === 'function') window.nav(null, k === 'fin-contab' || k === 'fin-pagar' ? 'financeiroContab' : 'financeiro'); return; }
    if (k === 'publicacoes') E.pub = Object.assign(E.pub || { tribunal: '', dias: '30', busca: '' }, { status: 'nova', adv: primeiroNomeUsuario() });
    irParaTela(k);
  });
}

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


// ═══ Backup 76 (F3): CONFERÊNCIAS AUTOMÁTICAS no Início — o que está faltando no cadastro e pode virar problema ═══
// Cada linha mostra quantos são; clicar abre a lista com o atalho para corrigir. Some sozinha quando está tudo certo.
// o que os cartões Financeiro/Escritório do Início já mostram não se repete na faixa
const NO_CARTAO_INI = ['Publicações novas', 'Parcelamentos com parcela vencida', 'Acordos vencidos', 'Honorários em atraso', 'Tarefas atrasadas'];
async function conferenciasIni() {
  const el = $('ini-conf'); if (!el) return;
  await carregarCadastros().catch(() => {});
  const D = dbParc() || {}, hoje = hojeISO(), lim90 = somarDias(hoje, -90);
  const isoBR = (d) => (/^\d{2}\/\d{2}\/\d{4}$/.test(d || '') ? d.split('/').reverse().join('-') : String(d || '').slice(0, 10));
  const regras = [];
  if (pode('juridico')) {
    const pa = (D.parcelamentos || []).filter((p) => (p.parcelas || []).some((x) => x.pagamento !== 'SIM') && !(Number(p.valorUltimaParcela) > 0) && !(p.parcelas || []).some((x) => x.valorLancado));
    regras.push({ id: 'pa', rot: 'parcelamento sem o valor da parcela', rots: 'parcelamentos sem o valor da parcela', itens: pa.map((p) => ({ t: (p.empresa || '—') + ' — ' + (p.natureza || ''), s: [p.local, p.numero ? 'nº ' + p.numero : ''].filter(Boolean).join(' · '),
      ir: async () => { const PA = await dadosParcelamentos(); E.pc = E.pc || { grupo: '', chip: 'todos' }; E.pc.PA = PA; const x = PA.find((y) => y.id === p._id); if (x) janelaParcelamento(x); } })) });
    const pr = (D.processos || []).filter((p) => !String(p.arquivamento || '').trim() && p.carteira !== 'Prospecção' && (isoBR(p.ultimaMovEm || p.atualizacao) || '0') < lim90);
    regras.push({ id: 'pr', rot: 'processo sem movimentação há mais de 90 dias', rots: 'processos sem movimentação há mais de 90 dias', itens: pr.map((p) => ({ t: p.numero || '(sem número)', s: [p.grupo, p.ultimaMovEm ? 'última: ' + p.ultimaMovEm : 'nenhuma movimentação registrada'].filter(Boolean).join(' · '),
      ir: () => (window.ERP_ABRIR_PROCESSO ? window.ERP_ABRIR_PROCESSO(p) : irParaTela('processos')) })) });
  }
  if (pode('clientes')) {
    const cl = (E.clientes || []).filter((c) => c.recebe_email !== false && c.tipo !== 'Inativo' && !String(c.email || '').trim());
    regras.push({ id: 'cl', rot: 'cliente que recebe e-mail mas não tem e-mail', rots: 'clientes que recebem e-mail mas não têm e-mail', itens: cl.map((c) => ({ t: c.nome, s: nomeGrupo(c.grupo_id), ir: () => formCliente(c, () => conferenciasIni(), 'contato') })) });
  }
  if (pode('contratos')) {
    const cts = await q(sb.from('contratos').select('id, descricao, status, modalidade, forma_valor, valor_mensal, data_contrato, inicio_vigencia, rescindido_em, clientes(nome)').eq('status', 'Ativo').eq('modalidade', 'consultoria')).catch(() => []);
    const sem = cts.filter((c) => !c.rescindido_em && c.forma_valor !== 'salario_minimo' && !c.inicio_vigencia && !c.data_contrato);
    regras.push({ id: 'ct', rot: 'contrato de consultoria sem data para o reajuste', rots: 'contratos de consultoria sem data para o reajuste', itens: sem.map((c) => ({ t: c.descricao || 'Contrato', s: (c.clientes && c.clientes.nome) || '', ir: () => detalheContrato(c.id) })) });
  }
  const comItens = regras.filter((r) => r.itens.length);
  // Backup 80 (E1/M1): faixa de AVISOS — o que era a tela Alertas (fora do menu). Só o que pede ação e que os cartões acima ainda não mostram.
  let avisos = [], cnpjAv = [];
  try { const r = await coletarAlertasTodos(300000); cnpjAv = r.cnpj;
    avisos = r.A.map((x, i) => Object.assign({ i }, x)).filter((x) => (x.nivel === 'critico' || x.nivel === 'atencao') && !NO_CARTAO_INI.includes(x.rot) && (x.setor !== 'Rotinas' || x.nivel === 'critico'))
      .sort((x, y) => (x.nivel === 'critico' ? 0 : 1) - (y.nivel === 'critico' ? 0 : 1));
    avisos.forEach((x) => { x.lista = r.A; }); } catch (e) { console.warn('[Início] avisos:', e.message); }
  if (!$('ini-conf')) return;
  if (!comItens.length && !avisos.length) { el.innerHTML = ''; return; }
  const pilula = (attr, v, n, txt, nivel) => '<button type="button" class="ini-conf-it b-av-' + nivel + '" ' + attr + '="' + v + '"><span class="b-av-pt" aria-hidden="true"></span>' + (n !== '' ? '<b>' + esc(n) + '</b>' : '') + '<span>' + esc(txt) + '</span></button>';
  // Backup 82: avisos e conferências viram pílulas na linha "Escritório" da faixa (como no ambiente)
  el.innerHTML = avisos.map((x) => pilula('data-av', x.i, /^\d+$/.test(x.valor) ? x.valor : '', /^\d+$/.test(x.valor) ? x.rot.charAt(0).toLowerCase() + x.rot.slice(1) : x.setor === 'Rotinas' ? x.rot + ' · ' + x.valor : x.det || x.rot, x.nivel)).join('') +
    comItens.map((r) => pilula('data-conf', r.id, r.itens.length, r.itens.length === 1 ? r.rot : r.rots, 'atencao')).join('');
  el.onclick = (ev) => { const av = ev.target.closest('[data-av]');
    if (av) { const x = avisos.find((y) => String(y.i) === av.dataset.av); if (x) abrirAlerta(x, cnpjAv); return; }
    const b = ev.target.closest('[data-conf]'); if (!b) return; const r = regras.find((x) => x.id === b.dataset.conf);
    const j = abrirJanela({ titulo: r.itens.length + ' ' + (r.itens.length === 1 ? r.rot : r.rots), kick: 'Conferências', larga: true,
      corpo: '<div class="bg-res">' + r.itens.map((x, i) => '<button type="button" class="bg-it" data-ci="' + i + '"><span class="bg-tx"><b>' + esc(x.t) + '</b>' + (x.s ? '<small>' + esc(x.s) + '</small>' : '') + '</span></button>').join('') + '</div>' });
    j.onclick = (e2) => { const it = e2.target.closest('[data-ci]'); if (!it) return; fecharJanela(j); Promise.resolve(r.itens[+it.dataset.ci].ir()).catch((e) => aviso(erroAmigavel(e), true)); }; };
}
