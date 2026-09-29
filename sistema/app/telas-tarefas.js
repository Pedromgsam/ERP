'use strict';
// ═══════════════════════════════════════════════════════════════════
// Tarefas — lista em árvore (subtarefas), quadro (kanban), calendário,
// fluxos com prazos em dias úteis, relatório, checklist, comentários,
// recorrência e alertas (sino da barra superior).
// ═══════════════════════════════════════════════════════════════════
const PRIORIDADE = { alta: ['Alta', 'vencido'], media: ['Média', 'hoje'], baixa: ['Baixa', 'pago'] };
const STATUS_TAREFA = { pendente: 'Pendente', andamento: 'Em andamento', aguardando: 'Aguardando', revisao: 'Aguardando revisão', concluida: 'Concluída', cancelada: 'Cancelada' };
const COLUNAS_KANBAN = ['pendente', 'andamento', 'aguardando', 'revisao', 'concluida'];
const tarefaFechada = (t) => t.status === 'concluida' || t.status === 'cancelada';

// ─────────────── pessoas, feriados e dias úteis ───────────────
function primeiroNome(s) { return normalizar(String(s || '').trim().split(/\s+/)[0]); }
function meuNome() { return (E.perfil && E.perfil.nome) || ''; }
function ehMinha(t) {
  const eu = primeiroNome(meuNome());
  if (!eu) return false;
  return primeiroNome(t.responsavel) === eu || String(t.participantes || '').split(',').some((p) => primeiroNome(p) === eu);
}
async function equipe() {
  if (!E._equipe) E._equipe = await q(sb.rpc('equipe_nomes')).catch(() => []);
  return E._equipe;
}
async function usuarioPorNome(nome) {
  const n = primeiroNome(nome);
  if (!n) return null;
  const u = (await equipe()).find((x) => primeiroNome(x.nome) === n || primeiroNome(String(x.email).split('@')[0]) === n);
  return u ? u.id : null;
}
// Pessoas do escritório para as listas (Responsável, Revisor, Participantes): as de sempre + quem tem acesso ao sistema
const EQUIPE_BASE = ['Pedro', 'Emanuelle', 'Adriana', 'João Vitor', 'Éder'];
function pessoasEscritorio(incluir) {
  const lista = EQUIPE_BASE.slice();
  (E._equipe || []).forEach((u) => { const n = String(u.nome || '').trim(); if (n && !lista.some((b) => primeiroNome(b) === primeiroNome(n))) lista.push(n); });
  String(incluir || '').split(',').map((x) => x.trim()).filter(Boolean).forEach((n) => { if (!lista.some((b) => primeiroNome(b) === primeiroNome(n))) lista.push(n); });
  return lista;
}
function selectPessoa(nome, valor, rotVazio) {
  const v = String(valor || '').trim(), lista = pessoasEscritorio(v);
  const marcada = lista.find((p) => primeiroNome(p) === primeiroNome(v)) || '';
  return '<select name="' + nome + '" class="sel-pessoa"><option value="">' + esc(rotVazio || '— ninguém —') + '</option>' +
    lista.map((p) => '<option value="' + esc(p) + '"' + (p === marcada ? ' selected' : '') + '>' + esc(p) + '</option>').join('') + '</select>';
}
// participantes: marcar as pessoas (sem digitar)
function campoParticipantes(valor) {
  const marcados = String(valor || '').split(',').map((x) => primeiroNome(x)).filter(Boolean);
  return '<div class="tf-part" role="group" aria-label="Participantes">' + pessoasEscritorio(valor).map((p) =>
    '<label class="tf-part-it"><input type="checkbox" value="' + esc(p) + '"' + (marcados.includes(primeiroNome(p)) ? ' checked' : '') + '><span>' + esc(p) + '</span></label>').join('') + '</div>';
}
const lerParticipantes = (raiz) => [...raiz.querySelectorAll('.tf-part input:checked')].map((i) => i.value).join(', ');

async function notificar(nome, titulo, detalhe, link, tipo) {
  const id = await usuarioPorNome(nome);
  if (!id || (E.perfil && id === E.perfil.id)) return;
  await sb.from('notificacoes').insert({ usuario_id: id, tipo: tipo || 'tarefa', titulo, detalhe: detalhe || '', link: link || '' });
}
async function feriados() {
  if (!E._feriados) {
    const fs = await q(sb.from('feriados').select('data, abrangencia')).catch(() => []);
    E._feriados = new Set(fs.map((f) => f.data));
  }
  return E._feriados;
}
function diaUtil(isoStr, fer) {
  const d = new Date(isoStr + 'T12:00:00').getDay();
  return d !== 0 && d !== 6 && !fer.has(isoStr);
}
// n dias úteis antes da data (0 = a própria data, ou o dia útil anterior se ela não for útil)
function subtrairUteis(isoStr, n, fer) {
  let d = isoStr;
  while (!diaUtil(d, fer)) d = somarDias(d, -1);
  for (let i = 0; i < n; i++) { d = somarDias(d, -1); while (!diaUtil(d, fer)) d = somarDias(d, -1); }
  return d;
}
function uteisAte(isoStr, fer) {   // dias úteis de hoje até a data (negativo se já passou)
  const h = hojeISO(); let n = 0, d = h;
  if (isoStr === h) return 0;
  const passo = isoStr > h ? 1 : -1;
  for (let i = 0; i < 400 && d !== isoStr; i++) { d = somarDias(d, passo); if (diaUtil(d, fer)) n += passo; }
  return n;
}
// Semáforo (calculado, nunca digitado): ⚫ fatal em risco · 🔴 atrasada · 🟡 até 2 dias úteis · 🟢 no prazo
function semaforo(t, fer) {
  if (tarefaFechada(t)) return null;
  const h = hojeISO(); fer = fer || E._feriados || new Set();
  if (t.prazo && t.prazo < h && t.prazo_fatal && uteisAte(t.prazo_fatal, fer) <= 3) return ['preto', 'Prazo fatal em risco'];
  if (t.prazo && t.prazo < h) return ['vermelho', 'Atrasada'];
  const ref = [t.prazo, t.prazo_fatal].filter(Boolean).sort()[0];
  if (ref && uteisAte(ref, fer) <= 2) return ['amarelo', 'Vence em até 2 dias úteis'];
  return ['verde', 'No prazo'];
}
function bolinha(t) { const s = semaforo(t); return s ? '<span class="semaforo ' + s[0] + '" title="' + s[1] + '"></span>' : ''; }
// Fila de trabalho: fatal em risco → atrasadas → fatal mais próximo → prioridade → prazo interno
const PESO_PRI = { alta: 0, media: 1, baixa: 2 };
function ordenarFila(lista) {
  const peso = (t) => { const s = semaforo(t); return s ? { preto: 0, vermelho: 1, amarelo: 2, verde: 3 }[s[0]] : 4; };
  return lista.slice().sort((a, b) => peso(a) - peso(b) || String(a.prazo_fatal || '9999').localeCompare(String(b.prazo_fatal || '9999'))
    || (PESO_PRI[a.prioridade] ?? 1) - (PESO_PRI[b.prioridade] ?? 1) || String(a.prazo || '9999').localeCompare(String(b.prazo || '9999')));
}
// Fila do Início: 5 primeiras + "Ver todas"; ou em calendário (mês, semana ou dia). A escolha fica salva na pessoa
// (perfis.preferencias.fila) e vale no próximo acesso, em qualquer computador. Cobrança de honorário atrasado não entra
// (já aparece em "Atrasados", logo abaixo).
const FILA = { toda: false, min: false, vista: 'lista', ref: null, lida: false };
const VISTAS_FILA = [['lista', 'Lista'], ['mes', 'Mês'], ['semana', 'Semana'], ['dia', 'Dia']];
function salvarPrefFila() {
  const v = { vista: FILA.vista, min: FILA.min };
  if (E.perfil) E.perfil.preferencias = Object.assign({}, E.perfil.preferencias || {}, { fila: v });
  sb.rpc('salvar_preferencia', { p_chave: 'fila', p_valor: v }).then(() => {}, () => {});
}
function calendarioFila(lista) {
  const h = hojeISO(), ref = FILA.ref || h, d0 = new Date(ref + 'T12:00:00');
  const doDia = (d) => lista.filter((t) => t.prazo === d || t.prazo_fatal === d);
  const item = (t, d) => '<button type="button" class="cal-tf' + (t.prazo_fatal === d ? ' fatal' : '') + (t.prazo && t.prazo < h ? ' atrasada' : '') + '" data-fila="' + t.id + '" title="' + esc(t.titulo) + '">' +
    (t.prazo_fatal === d ? '⚑ ' : '') + esc(t.titulo) + '</button>';
  let titulo, corpo;
  if (FILA.vista === 'dia') {
    titulo = d0.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    const l = doDia(ref);
    corpo = l.length ? '<div class="lista-ficha">' + l.map((t) => '<div class="item-ficha clicavel" data-fila="' + t.id + '"><div>' + bolinha(t) + ' <b>' + esc(t.titulo) + '</b>' + seloFatal(t) +
      '<div class="sub">' + esc(nomeCliente(t.cliente_id) || nomeGrupo(t.grupo_id) || '') + '</div></div></div>').join('') + '</div>' : '<div class="sub">Nada com prazo neste dia.</div>';
  } else if (FILA.vista === 'semana') {
    const ini = new Date(d0); ini.setDate(d0.getDate() - d0.getDay());
    const dias = [...Array(7)].map((_, k) => { const x = new Date(ini); x.setDate(ini.getDate() + k); return iso(x); });
    titulo = 'Semana de ' + dataBR(dias[0]).slice(0, 5) + ' a ' + dataBR(dias[6]).slice(0, 5);
    corpo = '<div class="fila-semana">' + dias.map((d) => '<div class="fila-sem-dia' + (d === h ? ' cal-hoje' : '') + '"><div class="cal-num">' +
      new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }) + '</div>' + doDia(d).map((t) => item(t, d)).join('') + '</div>').join('') + '</div>';
  } else {
    const a = d0.getFullYear(), m = d0.getMonth(), primeiro = new Date(a, m, 1), n = new Date(a, m + 1, 0).getDate();
    titulo = primeiro.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    let c = '<div class="calendario">' + ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((x) => '<div class="cal-sem">' + x + '</div>').join('') + '<div class="cal-dia vazio-dia"></div>'.repeat(primeiro.getDay());
    for (let k = 1; k <= n; k++) {
      const d = iso(new Date(a, m, k)), l = doDia(d);
      c += '<div class="cal-dia' + (d === h ? ' cal-hoje' : '') + '"><div class="cal-num">' + k + '</div>' + l.slice(0, 3).map((t) => item(t, d)).join('') + (l.length > 3 ? '<div class="sub">+ ' + (l.length - 3) + '</div>' : '') + '</div>';
    }
    corpo = c + '</div>';
  }
  return '<div class="fila-cal-nav"><button type="button" class="btn btn-o btn-mini" data-fila-nav="-1" aria-label="Anterior">‹</button><b>' + esc(titulo) + '</b>' +
    '<button type="button" class="btn btn-o btn-mini" data-fila-nav="1" aria-label="Próximo">›</button><button type="button" class="btn btn-o btn-mini" data-fila-nav="0">Hoje</button></div>' + corpo;
}
async function cardMinhaFila() {
  if (!FILA.lida) { const p = (E.perfil && E.perfil.preferencias && E.perfil.preferencias.fila) || {}; if (p.vista) FILA.vista = p.vista; FILA.min = !!p.min; FILA.lida = true; }
  await feriados();
  await equipe().catch(() => []);
  const ts = await q(sb.from('tarefas').select('*').not('status', 'in', '(concluida,cancelada)')).catch(() => []);
  const todas = ordenarFila(ts.filter((t) => ehMinha(t) && !/^(cob|parc|aco):/.test(t.chave_regra || ''))), minhas = FILA.toda ? todas : todas.slice(0, 5);
  const html = '<div class="card ini-fila' + (FILA.min ? ' minimizada' : '') + '"><div class="card-hd">📋 Minha fila de trabalho <span class="sub">' + todas.length + ' aberta(s)</span>' +
      '<div class="segmento ini-fila-vista" role="group" aria-label="Ver como">' + VISTAS_FILA.map(([v, r]) => '<button type="button" data-fila-vista="' + v + '"' + (FILA.vista === v ? ' class="ativo"' : '') + '>' + r + '</button>').join('') + '</div>' +
      '<button type="button" class="btn btn-o btn-mini ini-fila-min" data-fila-min aria-expanded="' + !FILA.min + '">' + (FILA.min ? '▸ Mostrar' : '▾ Minimizar') + '</button></div>' +
    (FILA.min ? '' : '<div class="card-bd">' + (FILA.vista !== 'lista' ? calendarioFila(todas) :
    (minhas.length ? '<div class="lista-ficha">' + minhas.map((t) => '<div class="item-ficha clicavel" data-fila="' + t.id + '"><div>' + bolinha(t) + ' <b>' + esc(t.titulo) + '</b>' + seloPrazo(t) +
      '<div class="sub">' + (t.prazo ? 'prazo ' + dataBR(t.prazo) : 'sem prazo') + (t.prazo_fatal ? ' · ⚑ fatal ' + dataBR(t.prazo_fatal) : '') + (t.status === 'revisao' ? ' · aguardando revisão' : '') +
      (nomeCliente(t.cliente_id) || nomeGrupo(t.grupo_id) ? ' · ' + esc(nomeCliente(t.cliente_id) || nomeGrupo(t.grupo_id)) : '') + '</div></div>' +
      '<span class="pill ' + (PRIORIDADE[t.prioridade] || ['', 'neutro'])[1] + '">' + esc((PRIORIDADE[t.prioridade] || [t.prioridade])[0]) + '</span></div>').join('') + '</div>' +
      (todas.length > 5 ? '<div class="ini-fila-mais"><button type="button" class="btn btn-o btn-mini" data-fila-toda>' + (FILA.toda ? '▴ Mostrar só as 5 primeiras' : '▾ Ver todas (' + todas.length + ')') + '</button></div>' : '')
      : '<div class="sub">Nenhuma tarefa com você. 🎉</div>')) + '</div>') + '</div>';
  const repinta = async (raiz) => { const c = await cardMinhaFila(); raiz.innerHTML = c.html; c.ligar(raiz); };
  return { html, ligar: (raiz) => {
    raiz.querySelectorAll('[data-fila]').forEach((d) => d.onclick = () => abrirTarefa(ts.find((t) => t.id === d.dataset.fila), () => irPara(E.tela)));
    const bm = raiz.querySelector('[data-fila-min]'); if (bm) bm.onclick = () => { FILA.min = !FILA.min; salvarPrefFila(); repinta(raiz); };
    const bt = raiz.querySelector('[data-fila-toda]'); if (bt) bt.onclick = () => { FILA.toda = !FILA.toda; repinta(raiz); };
    raiz.querySelectorAll('[data-fila-vista]').forEach((b) => b.onclick = () => { FILA.vista = b.dataset.filaVista; FILA.min = false; FILA.ref = null; salvarPrefFila(); repinta(raiz); });
    raiz.querySelectorAll('[data-fila-nav]').forEach((b) => b.onclick = () => {
      const n = +b.dataset.filaNav, d = new Date((FILA.ref || hojeISO()) + 'T12:00:00');
      if (!n) FILA.ref = null;
      else { if (FILA.vista === 'mes') d.setMonth(d.getMonth() + n, 1); else d.setDate(d.getDate() + n * (FILA.vista === 'semana' ? 7 : 1)); FILA.ref = iso(d); }
      repinta(raiz);
    });
  } };
}
function diasAte(isoStr) { return Math.round((new Date(isoStr + 'T12:00:00') - new Date(hojeISO() + 'T12:00:00')) / 86400000); }
function progresso(t, filhas) {
  const ck = Array.isArray(t.checklist) ? t.checklist : [];
  const tot = ck.length + filhas.length, feitos = ck.filter((c) => c.feito).length + filhas.filter(tarefaFechada).length;
  return tot ? { tot, feitos, pct: Math.round(feitos / tot * 100) } : null;
}
function barraProgresso(p) {
  return p ? '<span class="tf-prog" title="' + p.feitos + ' de ' + p.tot + ' concluído(s)"><i style="width:' + p.pct + '%"></i></span><span class="sub"> ' + p.feitos + '/' + p.tot + '</span>' : '';
}
function seloPrazo(t) {
  if (tarefaFechada(t) || !t.prazo) return '';
  const d = diasAte(t.prazo);
  if (d < 0) return ' <span class="pill vencido">atrasada ' + (-d) + 'd</span>';
  if (d === 0) return ' <span class="pill hoje">hoje</span>';
  if (d <= 2) return ' <span class="pill hoje">em ' + d + 'd</span>';
  return '';
}
function seloFatal(t) {
  if (!t.prazo_fatal) return '';
  const d = diasAte(t.prazo_fatal);
  return ' <span class="pill ' + (tarefaFechada(t) ? 'neutro' : d <= 2 ? 'vencido' : 'cobranca') + '" title="Prazo fatal">⚑ ' + dataBR(t.prazo_fatal) + '</span>';
}
function nomeCliente(id) { const c = E.clientes.find((x) => x.id === id); return c ? c.nome : ''; }

// ─────────────────────────── tela ───────────────────────────
TELAS.tarefas = async function () {
  E.tf = E.tf || { vista: 'lista', atalho: '', resp: '', pri: '', busca: '', mes: hojeISO().slice(0, 7) };
  const F = E.tf;
  // abas: o painel mostra só o que está em aberto; concluídas e excluídas ficam separadas
  F.aba = F.aba || 'abertas'; if (F.atalho === 'abertas' || F.atalho === 'concluidas') F.atalho = '';
  $('conteudo').innerHTML =
    '<div class="titulo-pag"><div><h1>Tarefas</h1><p>Prazos, fluxos e acompanhamento do escritório</p></div>' +
    '<div class="acoes"><button class="btn btn-o" id="tf-regras">⚡ Automações</button><button class="btn btn-o" id="tf-modelos">Modelos de fluxo</button><button class="btn btn-o" id="tf-feriados">Feriados</button><button class="btn btn-o" id="tf-agenda" title="Prazos fatais e audiências no seu Google Agenda">📅 Google Agenda</button>' +
    '<button class="btn btn-o" id="tf-fluxo">+ Novo fluxo</button><button class="btn btn-p" id="tf-nova">+ Nova tarefa</button></div></div>' +
    '<div class="abas" id="tf-abas">' + [['abertas', 'Em aberto'], ['concluidas', '✓ Concluídas'], ['excluidas', '🗑 Excluídas']]
      .map(([v, r]) => '<button data-aba="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<div class="filtros">' +
    '<div class="segmento" id="tf-vista">' + [['lista', 'Lista'], ['kanban', 'Quadro'], ['calendario', 'Calendário'], ['fluxos', 'Fluxos'], ['relatorio', 'Relatório']]
      .map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<div class="segmento" id="tf-atalho">' + [['', 'Todas'], ['minhas', 'Minhas'], ['hoje', 'Hoje'], ['atrasadas', 'Atrasadas'], ['7', '7 dias']]
      .map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<select class="busca sel" id="tf-resp"><option value="">Todas as pessoas</option>' + Object.keys(PESSOA).map((p) => '<option>' + p + '</option>').join('') + '</select>' +
    '<select class="busca sel" id="tf-pri"><option value="">Todas as prioridades</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select>' +
    '<input class="busca" id="tf-busca" placeholder="Buscar tarefa, cliente, processo ou etiqueta" autocomplete="off">' +
    '</div><div id="tf-corpo"><div class="carregando">Carregando…</div></div>';
  $('tf-nova').onclick = () => formTarefa({}, () => TELAS.tarefas());
  $('tf-fluxo').onclick = () => formNovoFluxo(() => TELAS.tarefas());
  $('tf-modelos').onclick = () => janelaModelos();
  $('tf-regras').onclick = () => irParaTela('automacoes');
  $('tf-feriados').onclick = () => janelaFeriados();
  $('tf-agenda').onclick = () => janelaAgenda();
  $('tf-vista').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.vista = b.dataset.v; pintarTarefas(); } };
  $('tf-abas').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.aba = b.dataset.aba; pintarTarefas(); } };
  $('tf-atalho').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.atalho = b.dataset.v; pintarTarefas(); } };
  [['tf-resp', 'resp'], ['tf-pri', 'pri']].forEach(([id, k]) => { $(id).value = F[k]; $(id).onchange = (ev) => { F[k] = ev.target.value; pintarTarefas(); }; });
  $('tf-busca').value = F.busca;
  let t; $('tf-busca').oninput = (ev) => { clearTimeout(t); t = setTimeout(() => { F.busca = ev.target.value; pintarTarefas(); }, 250); };
  const [ts, fl] = await Promise.all([
    buscarTodos(() => sb.from('tarefas').select('*').order('prazo', { nullsFirst: false })),
    q(sb.from('fluxos').select('*').order('prazo_fatal', { nullsFirst: false })).catch(() => [])
  ]);
  E._tarefas = ts; E._fluxos = fl;
  await feriados();
  pintarTarefas();
};

function filtrarTarefas() {
  const F = E.tf, h = hojeISO(), b = normalizar(F.busca);
  return (E._tarefas || []).filter((t) => {
    if (F.aba === 'concluidas') { if (t.status !== 'concluida') return false; }
    else if (F.aba === 'excluidas') { if (t.status !== 'cancelada') return false; }
    else if (tarefaFechada(t)) return false;
    const a = F.aba === 'abertas' ? F.atalho : '';
    if (a === 'minhas' && (tarefaFechada(t) || !ehMinha(t))) return false;
    if (a === 'hoje' && (tarefaFechada(t) || !t.prazo || t.prazo > h)) return false;
    if (a === 'atrasadas' && (tarefaFechada(t) || !t.prazo || t.prazo >= h)) return false;
    if (a === '7' && (tarefaFechada(t) || !t.prazo || t.prazo > somarDias(h, 7))) return false;
    if (F.resp && t.responsavel !== F.resp) return false;
    if (F.pri && t.prioridade !== F.pri) return false;
    if (b && !normalizar(t.titulo + ' ' + t.processos_vinculados + ' ' + nomeGrupo(t.grupo_id) + ' ' + nomeCliente(t.cliente_id) + ' ' + t.etiquetas + ' ' + t.descricao).includes(b)) return false;
    return true;
  });
}

function pintarTarefas() {
  const F = E.tf, h = hojeISO();
  document.querySelectorAll('#tf-vista button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === F.vista));
  document.querySelectorAll('#tf-atalho button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === F.atalho));
  document.querySelectorAll('#tf-abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === F.aba));
  $('tf-atalho').style.display = F.vista === 'fluxos' || F.vista === 'relatorio' || F.aba !== 'abertas' ? 'none' : '';
  const todas = E._tarefas || [];
  const abertas = todas.filter((t) => !tarefaFechada(t));
  const atrasadas = abertas.filter((t) => t.prazo && t.prazo < h).length;
  const fatais = abertas.filter((t) => t.prazo_fatal && t.prazo_fatal >= h && t.prazo_fatal <= somarDias(h, 7)).length;
  const minhas = abertas.filter(ehMinha).length;
  const kpis = '<div class="kpis">' + kpi('Em aberto', String(abertas.length), '', minhas + ' comigo') +
    kpi('Atrasadas', String(atrasadas), atrasadas ? 'vermelho' : 'verde', 'todas as pessoas') +
    kpi('Prazos fatais em 7 dias', String(fatais), fatais ? 'ambar' : '', 'tarefas com prazo fatal marcado') +
    kpi('Concluídas no mês', String(todas.filter((t) => t.status === 'concluida' && String(t.concluida_em || '').slice(0, 7) === h.slice(0, 7)).length), 'verde', '') + '</div>';
  const V = { lista: vistaLista, kanban: vistaKanban, calendario: vistaCalendario, fluxos: vistaFluxos, relatorio: vistaRelatorio };
  $('tf-corpo').innerHTML = kpis + '<div id="tf-vista-corpo"></div>';
  V[F.vista]($('tf-vista-corpo'));
}
const recarregarTarefas = () => TELAS.tarefas();

async function concluirTarefa(id) {
  await q(sb.from('tarefas').update({ status: 'concluida' }).eq('id', id));
}
function ligarLinhasTarefa(raiz) {
  raiz.querySelectorAll('[data-concluir]').forEach((bt) => bt.onclick = (ev) => { ev.stopPropagation(); comBotao(bt, async () => {
    await concluirTarefa(bt.dataset.concluir); aviso('✓ Tarefa concluída.'); await recarregarTarefas();
  }); });
  raiz.querySelectorAll('[data-restaurar-t]').forEach((bt) => bt.onclick = (ev) => { ev.stopPropagation(); comBotao(bt, async () => {
    await q(sb.from('tarefas').update({ status: 'pendente' }).eq('id', bt.dataset.restaurarT)); aviso('✓ Tarefa restaurada (voltou para Em aberto).'); await recarregarTarefas();
  }); });
  raiz.querySelectorAll('[data-apagar-t]').forEach((bt) => bt.onclick = (ev) => { ev.stopPropagation(); comBotao(bt, async () => {
    if (!confirm('Excluir de vez? Esta ação não pode ser desfeita.')) return;
    await excluir('tarefas', bt.dataset.apagarT); aviso('Tarefa excluída de vez.'); await recarregarTarefas();
  }); });
  raiz.querySelectorAll('[data-editar-t]').forEach((bt) => bt.onclick = (ev) => { ev.stopPropagation();
    formTarefa(E._tarefas.find((t) => t.id === bt.dataset.editarT), recarregarTarefas); });
  raiz.querySelectorAll('[data-abrir-t]').forEach((tr) => tr.onclick = () => abrirTarefa(E._tarefas.find((t) => t.id === tr.dataset.abrirT), recarregarTarefas));
}

// ── Lista em árvore ──
function vistaLista(alvo) {
  const lista = filtrarTarefas(), ids = new Set(lista.map((t) => t.id));
  const filhasDe = (id) => (E._tarefas || []).filter((x) => x.tarefa_pai_id === id);
  let raizes = lista.filter((t) => !t.tarefa_pai_id || !ids.has(t.tarefa_pai_id));
  if (E.tf.atalho === 'minhas') raizes = ordenarFila(raizes);
  const linha = (t, nivel) => {
    const pr = PRIORIDADE[t.prioridade] || [t.prioridade || '—', 'neutro'];
    const filhas = filhasDe(t.id), pai = t.tarefa_pai_id && !ids.has(t.tarefa_pai_id) ? (E._tarefas.find((x) => x.id === t.tarefa_pai_id) || {}).titulo : '';
    const onde = [nomeCliente(t.cliente_id) || nomeGrupo(t.grupo_id), t.processos_vinculados].filter(Boolean).join(' · ');
    return '<tr class="clicavel' + (tarefaFechada(t) ? ' tf-feita' : '') + '" data-abrir-t="' + t.id + '"><td class="mono" data-ord="' + esc(t.prazo || '9999') + '">' + dataBR(t.prazo) + seloPrazo(t) + '</td>' +
      '<td style="padding-left:' + (12 + nivel * 22) + 'px">' + bolinha(t) + ' ' + (nivel ? '<span class="sub">↳ </span>' : '') + '<b>' + esc(t.titulo) + '</b>' + seloFatal(t) +
      (t.recorrencia ? ' <span class="pill neutro" title="Repete">↻ ' + esc(t.recorrencia) + '</span>' : '') + ' ' + barraProgresso(progresso(t, filhas)) +
      '<div class="sub">' + esc([pai ? 'parte de: ' + pai : '', onde, t.etiquetas].filter(Boolean).join(' · ')) + '</div></td>' +
      '<td>' + pillPessoa(t.responsavel) + '</td><td><span class="pill ' + pr[1] + '">' + esc(pr[0]) + '</span></td><td>' + esc(STATUS_TAREFA[t.status] || t.status) + '</td>' +
      '<td class="acoes-l">' + (t.status === 'cancelada'
        ? '<button class="btn btn-o btn-mini" data-restaurar-t="' + t.id + '">↩ Restaurar</button>' + ((E.perfil || {}).papel === 'admin' ? ' <button class="btn btn-x btn-mini" data-apagar-t="' + t.id + '">Excluir de vez</button>' : '')
        : (tarefaFechada(t) ? '' : '<button class="btn btn-v btn-mini" data-concluir="' + t.id + '">✓ Concluir</button> ') +
      '<button class="btn btn-o btn-mini" data-editar-t="' + t.id + '">Editar</button>') + '</td></tr>' +
      filhas.filter((f) => ids.has(f.id)).map((f) => linha(f, nivel + 1)).join('');
  };
  alvo.innerHTML = '<div class="card">' + (raizes.length ? '<div class="tabela-wrap"><table><thead><tr><th>Prazo</th><th>Tarefa</th><th>Pessoa</th><th>Prioridade</th><th>Status</th><th></th></tr></thead><tbody>' +
    raizes.map((t) => linha(t, 0)).join('') + '</tbody></table></div>' : vazio('Nenhuma tarefa com esses filtros.', '+ Nova tarefa', '#tf-nova')) + '</div>';
  ligarLinhasTarefa(alvo);
}

// ── Quadro (kanban): arraste o cartão para mudar o status ──
function vistaKanban(alvo) {
  const lista = filtrarTarefas().filter((t) => t.status !== 'cancelada');
  alvo.innerHTML = '<div class="kanban">' + COLUNAS_KANBAN.map((s) => {
    const cs = lista.filter((t) => t.status === s);
    return '<div class="kb-col" data-status="' + s + '"><div class="kb-tit">' + STATUS_TAREFA[s] + ' <span class="sub">' + cs.length + '</span></div>' +
      cs.map((t) => '<div class="kb-card" draggable="true" data-id="' + t.id + '">' + bolinha(t) + ' <b>' + esc(t.titulo) + '</b>' +
        '<div class="sub">' + esc(nomeCliente(t.cliente_id) || nomeGrupo(t.grupo_id) || '') + '</div>' +
        '<div class="kb-rod">' + pillPessoa(t.responsavel) + (t.prazo ? ' <span class="sub mono">' + dataBR(t.prazo) + '</span>' : '') + seloPrazo(t) + seloFatal(t) + '</div>' +
        barraProgresso(progresso(t, (E._tarefas || []).filter((x) => x.tarefa_pai_id === t.id))) + '</div>').join('') +
      '</div>';
  }).join('') + '</div><p class="sub" style="margin-top:8px">Arraste um cartão para outra coluna para mudar o status. Clique para abrir.</p>';
  let arrastando = null;
  alvo.querySelectorAll('.kb-card').forEach((c) => {
    c.addEventListener('dragstart', (ev) => { arrastando = c.dataset.id; ev.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('arrastando'); });
    c.addEventListener('dragend', () => c.classList.remove('arrastando'));
    c.onclick = () => abrirTarefa(E._tarefas.find((t) => t.id === c.dataset.id), recarregarTarefas);
  });
  alvo.querySelectorAll('.kb-col').forEach((col) => {
    col.addEventListener('dragover', (ev) => { ev.preventDefault(); col.classList.add('sobre'); });
    col.addEventListener('dragleave', () => col.classList.remove('sobre'));
    col.addEventListener('drop', (ev) => {
      ev.preventDefault(); col.classList.remove('sobre');
      const id = ev.dataTransfer.getData('text/plain') || arrastando, t = E._tarefas.find((x) => x.id === id);
      if (!t || t.status === col.dataset.status) return;
      comBotao(null, async () => {
        await validarDependencia(t, col.dataset.status);
        await q(sb.from('tarefas').update({ status: col.dataset.status }).eq('id', id));
        aviso('✓ Tarefa movida para ' + STATUS_TAREFA[col.dataset.status] + '.'); await recarregarTarefas();
      });
    });
  });
}

// ── Calendário do mês (prazo interno e ⚑ prazo fatal) ──
async function vistaCalendario(alvo) {
  const F = E.tf, fer = await feriados();
  const [a, m] = F.mes.split('-').map(Number), ini = new Date(a, m - 1, 1), dias = new Date(a, m, 0).getDate();
  const lista = filtrarTarefas(), h = hojeISO();
  let html = '<div class="card"><div class="card-hd"><button class="btn btn-o btn-mini" id="cal-ant">‹</button><span>' +
    ini.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) + '</span><button class="btn btn-o btn-mini" id="cal-prox">›</button></div>' +
    '<div class="calendario">' + ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => '<div class="cal-sem">' + d + '</div>').join('') +
    '<div class="cal-dia vazio-dia"></div>'.repeat(ini.getDay());
  for (let d = 1; d <= dias; d++) {
    const iso_ = F.mes + '-' + String(d).padStart(2, '0');
    const doDia = lista.filter((t) => t.prazo === iso_ || t.prazo_fatal === iso_);
    html += '<div class="cal-dia' + (iso_ === h ? ' cal-hoje' : '') + (!diaUtil(iso_, fer) ? ' cal-folga' : '') + '"><div class="cal-num">' + d + '</div>' +
      doDia.slice(0, 4).map((t) => '<button class="cal-tf' + (t.prazo_fatal === iso_ ? ' fatal' : '') + (tarefaFechada(t) ? ' feita' : t.prazo && t.prazo < h ? ' atrasada' : '') +
        '" data-editar-t="' + t.id + '" title="' + esc(t.titulo) + '">' + (t.prazo_fatal === iso_ ? '⚑ ' : '') + esc(t.titulo) + '</button>').join('') +
      (doDia.length > 4 ? '<div class="sub">+ ' + (doDia.length - 4) + '</div>' : '') + '</div>';
  }
  alvo.innerHTML = html + '</div></div>';
  const mudar = (n) => { const d = new Date(a, m - 1 + n, 1); F.mes = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); pintarTarefas(); };
  $('cal-ant').onclick = () => mudar(-1); $('cal-prox').onclick = () => mudar(1);
  ligarLinhasTarefa(alvo);
}

// ── Fluxos: andamento e linha do tempo (Gantt simples) ──
function vistaFluxos(alvo) {
  const fl = E._fluxos || [], h = hojeISO();
  if (!fl.length) { alvo.innerHTML = '<div class="card">' + vazio('Nenhum fluxo ainda — um fluxo cria várias tarefas de uma vez a partir de um modelo (ex.: Defesa em execução fiscal).', '+ Novo fluxo', '#tf-fluxo') + '</div>'; return; }
  alvo.innerHTML = fl.map((f) => {
    const ts = (E._tarefas || []).filter((t) => t.fluxo_id === f.id).sort((x, y) => String(x.prazo).localeCompare(String(y.prazo)));
    const feitas = ts.filter(tarefaFechada).length;
    const datas = ts.flatMap((t) => [t.inicio, t.prazo]).concat([f.inicio, f.prazo_fatal, h]).filter(Boolean).sort();
    const d0 = datas[0], d1 = datas[datas.length - 1], span = Math.max(1, diasEntre(d0, d1));
    const pos = (d) => Math.max(0, Math.min(100, diasEntre(d0, d) / span * 100));
    return '<div class="card"><div class="card-hd"><span>' + esc(f.nome) + ' <span class="sub">' + esc(nomeCliente(f.cliente_id) || nomeGrupo(f.grupo_id) || '') + '</span></span>' +
      '<span>' + (f.prazo_fatal ? '<span class="pill ' + (f.status === 'ativo' && f.prazo_fatal < h ? 'vencido' : 'cobranca') + '">⚑ ' + dataBR(f.prazo_fatal) + '</span> ' : '') +
      '<span class="pill ' + (f.status === 'concluido' ? 'pago' : f.status === 'cancelado' ? 'neutro' : 'aberto') + '">' + esc(f.status) + '</span> ' +
      '<button class="btn btn-o btn-mini" data-fluxo-st="' + f.id + '">' + (f.status === 'ativo' ? 'Encerrar' : 'Reabrir') + '</button></span></div>' +
      '<div class="card-bd"><div class="sub" style="margin-bottom:8px">' + feitas + ' de ' + ts.length + ' tarefa(s) concluída(s) ' + barraProgresso(ts.length ? { tot: ts.length, feitos: feitas, pct: Math.round(feitas / ts.length * 100) } : null) + '</div>' +
      '<div class="gantt">' + ts.map((t) => {
        const i = t.inicio || t.prazo || h, fim = t.prazo || i;
        return '<div class="gantt-lin"><button class="gantt-rot" data-editar-t="' + t.id + '">' + (t.tarefa_pai_id ? '↳ ' : '') + esc(t.titulo) + '</button><div class="gantt-trilho">' +
          '<div class="gantt-barra' + (tarefaFechada(t) ? ' feita' : fim < h ? ' atrasada' : '') + '" style="left:' + pos(i) + '%;width:' + Math.max(1.5, pos(fim) - pos(i)) + '%" title="' + dataBR(i) + ' → ' + dataBR(fim) + '"></div></div>' +
          '<span class="sub mono">' + dataBR(fim) + '</span></div>';
      }).join('') + '</div></div></div>';
  }).join('');
  ligarLinhasTarefa(alvo);
  alvo.querySelectorAll('[data-fluxo-st]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const f = fl.find((x) => x.id === b.dataset.fluxoSt);
    await q(sb.from('fluxos').update({ status: f.status === 'ativo' ? 'concluido' : 'ativo' }).eq('id', f.id));
    aviso('✓ Fluxo atualizado.'); await recarregarTarefas();
  }));
}
async function horasGastasPorPessoa(alvo) {
  const ini = hojeISO().slice(0, 8) + '01';
  const [tempos, eq] = await Promise.all([q(sb.from('tarefa_tempos').select('usuario, inicio, fim').gte('inicio', ini)), equipe()]);
  const por = {};
  tempos.forEach((x) => { const u = eq.find((e) => e.id === x.usuario); const n = u ? primeiroNome(u.nome) : '?';
    por[n] = (por[n] || 0) + ((x.fim ? new Date(x.fim) : new Date()) - new Date(x.inicio)) / 3600000; });
  alvo.querySelectorAll('[data-gasto]').forEach((td) => { const v = por[primeiroNome(td.dataset.gasto)]; if (v) td.textContent = String(Math.round(v * 10) / 10).replace('.', ',') + ' h'; });
}
function diasEntre(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }

// ── Relatório: por pessoa, prazos fatais, exportação ──
function vistaRelatorio(alvo) {
  const ts = E._tarefas || [], h = hojeISO(), mes = h.slice(0, 7);
  const pessoas = [...new Set(Object.keys(PESSOA).concat(ts.map((t) => t.responsavel).filter(Boolean)))];
  const linhas = pessoas.map((p) => {
    const d = ts.filter((t) => t.responsavel === p), ab = d.filter((t) => !tarefaFechada(t));
    const concl = d.filter((t) => t.status === 'concluida' && String(t.concluida_em || '').slice(0, 7) === mes);
    const noPrazo = concl.filter((t) => !t.prazo || String(t.concluida_em).slice(0, 10) <= t.prazo).length;
    return { p, abertas: ab.length, atrasadas: ab.filter((t) => t.prazo && t.prazo < h).length, concl: concl.length,
      noPrazo: concl.length ? Math.round(noPrazo / concl.length * 100) : null, horas: soma(ab, (t) => t.estimativa_horas) };
  }).filter((l) => l.abertas || l.concl);
  const concl = ts.filter((t) => t.status === 'concluida' && t.concluida_em);
  const medio = concl.length ? soma(concl, (t) => (new Date(t.concluida_em) - new Date(t.criado_em)) / 86400000) / concl.length : null;
  const fatConcl = concl.filter((t) => t.prazo_fatal), fatOk = fatConcl.filter((t) => String(t.concluida_em).slice(0, 10) <= t.prazo_fatal).length;
  const fatais = ts.filter((t) => !tarefaFechada(t) && t.prazo_fatal && t.prazo_fatal <= somarDias(h, 30)).sort((a, b) => a.prazo_fatal.localeCompare(b.prazo_fatal));
  alvo.innerHTML = '<div class="kpis">' + kpi('Tempo médio de conclusão', medio == null ? '—' : String(Math.round(medio * 10) / 10).replace('.', ',') + ' dia(s)', '', concl.length + ' concluída(s)') +
    kpi('Prazos fatais cumpridos', fatConcl.length ? Math.round(fatOk / fatConcl.length * 100) + '%' : '—', fatConcl.length && fatOk < fatConcl.length ? 'vermelho' : 'verde', fatOk + ' de ' + fatConcl.length + ' · meta 100%') + '</div>' +
    '<div class="card"><div class="card-hd">Por pessoa <button class="btn btn-o btn-mini" id="tf-csv">Baixar planilha (CSV)</button></div>' +
    '<div class="tabela-wrap"><table class="ordenavel"><thead><tr><th>Pessoa</th><th data-tipo="num">Abertas</th><th data-tipo="num">Atrasadas</th><th data-tipo="num">Concluídas no mês</th><th data-tipo="num">% no prazo</th><th data-tipo="num">Horas estimadas (abertas)</th><th data-tipo="num">Horas gastas no mês</th></tr></thead><tbody>' +
    (linhas.map((l) => '<tr><td>' + pillPessoa(l.p) + '</td><td class="mono">' + l.abertas + '</td><td class="mono">' + (l.atrasadas ? '<b style="color:var(--red)">' + l.atrasadas + '</b>' : '0') + '</td>' +
      '<td class="mono">' + l.concl + '</td><td class="mono">' + (l.noPrazo == null ? '—' : l.noPrazo + '%') + '</td><td class="mono">' + (l.horas ? String(l.horas).replace('.', ',') : '—') + '</td><td class="mono" data-gasto="' + esc(l.p) + '">—</td></tr>').join('') ||
      '<tr><td colspan="7" class="sub">Nenhuma tarefa.</td></tr>') + '</tbody></table></div></div>' +
    '<div class="card"><div class="card-hd">Prazos fatais nos próximos 30 dias (e vencidos)</div>' +
    (fatais.length ? '<div class="tabela-wrap"><table><thead><tr><th>Prazo fatal</th><th>Tarefa</th><th>Cliente / grupo</th><th>Pessoa</th><th>Status</th></tr></thead><tbody>' +
      fatais.map((t) => '<tr class="clicavel" data-editar-t="' + t.id + '"><td class="mono">' + dataBR(t.prazo_fatal) + (t.prazo_fatal < h ? ' <span class="pill vencido">vencido</span>' : '') + '</td><td><b>' + esc(t.titulo) + '</b></td>' +
        '<td>' + esc(nomeCliente(t.cliente_id) || nomeGrupo(t.grupo_id) || '—') + '</td><td>' + pillPessoa(t.responsavel) + '</td><td>' + esc(STATUS_TAREFA[t.status] || t.status) + '</td></tr>').join('') +
      '</tbody></table></div>' : '<div class="vazio">Nenhum prazo fatal nos próximos 30 dias.</div>') + '</div>';
  ligarLinhasTarefa(alvo);
  horasGastasPorPessoa(alvo).catch(() => {});
  $('tf-csv').onclick = () => {
    const cab = ['Tarefa', 'Status', 'Pessoa', 'Prazo', 'Prazo fatal', 'Cliente', 'Grupo', 'Prioridade', 'Etiquetas', 'Concluída em'];
    const lin = filtrarTarefas().map((t) => [t.titulo, STATUS_TAREFA[t.status] || t.status, t.responsavel, dataBR(t.prazo), t.prazo_fatal ? dataBR(t.prazo_fatal) : '',
      nomeCliente(t.cliente_id), nomeGrupo(t.grupo_id), (PRIORIDADE[t.prioridade] || [t.prioridade])[0], t.etiquetas, t.concluida_em ? dataBR(t.concluida_em) : '']);
    const csv = [cab].concat(lin).map((l) => l.map((c) => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    baixarArquivo('tarefas-' + hojeISO() + '.csv', '﻿' + csv, 'text/csv;charset=utf-8');
  };
}

// ─────────────────────────── formulário ───────────────────────────
function selectPares(nome, pares, v) {
  return '<select name="' + nome + '">' + pares.map(([val, rot]) => '<option value="' + val + '"' + (val === v ? ' selected' : '') + '>' + esc(rot) + '</option>').join('') + '</select>';
}
async function validarDependencia(t, novoStatus) {
  if (!t.depende_de || !['andamento', 'concluida'].includes(novoStatus)) return;
  const dep = await q(sb.from('tarefas').select('titulo, status').eq('id', t.depende_de).maybeSingle());
  if (dep && !tarefaFechada(dep)) throw new Error('Esta tarefa depende de "' + dep.titulo + '", que ainda não foi concluída.');
}
// Abrir tarefa = ficha de leitura (o que é, prazos, quem, origem). As ações ficam no rodapé:
// Concluir · Encaminhar · + Subtarefa · Editar (o formulário completo).
const ORIGEM_REGRA = { onb: 'Automação: contrato novo (onboarding)', proc: 'Automação: processo novo', cert: 'Automação: certidão vencendo', doc: 'Automação: documento vencendo',
  parc: 'Automação: parcela de parcelamento', aco: 'Automação: parcela de acordo', cob: 'Automação: cobrança de honorário', anexo: 'Automação: contrato sem anexo',
  procur: 'Automação: processo sem procuração', pub: 'Automação: publicação', esc: 'Automação: escalada de atraso' };
async function abrirTarefa(t, depois) {
  if (!t) return;
  if (typeof t === 'string') t = (await q(sb.from('tarefas').select('*').eq('id', t)))[0];
  if (!t) return aviso('Tarefa não encontrada (pode ter sido excluída).', true);
  await equipe().catch(() => []);
  const [subs] = await Promise.all([q(sb.from('tarefas').select('*').eq('tarefa_pai_id', t.id).order('prazo', { nullsFirst: false })).catch(() => [])]);
  const pr = PRIORIDADE[t.prioridade] || [t.prioridade || '—', 'neutro'];
  const ck = Array.isArray(t.checklist) ? t.checklist : [];
  const origem = t.chave_regra ? (ORIGEM_REGRA[String(t.chave_regra).split(':')[0]] || 'Automação') : t.fluxo_id ? 'Fluxo de trabalho' : 'Criada à mão';
  const linha = (rot, val) => val ? '<div class="tf-lin"><span>' + rot + '</span><div>' + val + '</div></div>' : '';
  const fechada = tarefaFechada(t);
  const j = abrirJanela({ titulo: 'Tarefa', larga: true,
    corpo: '<div class="tf-ficha">' +
      '<div class="tf-ficha-hd"><h3>' + bolinha(t) + ' ' + esc(t.titulo) + '</h3><div class="tf-selos"><span class="pill ' + (fechada ? 'pago' : t.status === 'revisao' ? 'hoje' : 'neutro') + '">' +
        esc(STATUS_TAREFA[t.status] || t.status) + '</span> <span class="pill ' + pr[1] + '">' + esc(pr[0]) + '</span>' + seloPrazo(t) + seloFatal(t) + '</div></div>' +
      '<div class="tf-grade">' +
        linha('Prazo', t.prazo ? dataBR(t.prazo) : '<span class="sub">sem prazo</span>') +
        linha('Prazo fatal', t.prazo_fatal ? '<b>' + dataBR(t.prazo_fatal) + '</b>' : '') +
        linha('Cliente', esc(nomeCliente(t.cliente_id) || nomeGrupo(t.grupo_id) || '')) +
        linha('Responsável', pillPessoa(t.responsavel)) +
        linha('Participantes', String(t.participantes || '').split(',').map((x) => x.trim()).filter(Boolean).map(pillPessoa).join(' ')) +
        linha('Revisor', t.exige_revisao || t.revisor ? pillPessoa(t.revisor) : '') +
        linha('Processos', esc(t.processos_vinculados || '')) +
        linha('Origem', esc(origem)) +
        linha('Repete', t.recorrencia ? esc(t.recorrencia) : '') +
      '</div>' +
      (t.descricao ? '<div class="tf-bloco"><div class="secao">O que fazer</div><div class="tf-texto">' + esc(t.descricao).replace(/\n/g, '<br>') + '</div></div>' : '') +
      (t.obs ? '<div class="tf-bloco"><div class="secao">Observação</div><div class="tf-texto">' + esc(t.obs).replace(/\n/g, '<br>') + '</div></div>' : '') +
      (ck.length ? '<div class="tf-bloco"><div class="secao">Checklist · ' + ck.filter((c) => c.feito).length + '/' + ck.length + '</div>' +
        ck.map((c) => '<div class="tf-ck' + (c.feito ? ' feito' : '') + '">' + (c.feito ? '☑' : '☐') + ' ' + esc(c.texto) + '</div>').join('') + '</div>' : '') +
      (subs.length ? '<div class="tf-bloco"><div class="secao">Subtarefas</div><div class="lista-ficha">' + subs.map((x) => '<div class="item-ficha clicavel' + (tarefaFechada(x) ? ' feita' : '') + '" data-ficha-sub="' + x.id + '"><div><b>' + esc(x.titulo) + '</b> ' + seloPrazo(x) +
        '<div class="sub">' + (x.prazo ? 'até ' + dataBR(x.prazo) : 'sem prazo') + ' · ' + esc(x.responsavel || '—') + ' · ' + esc(STATUS_TAREFA[x.status]) + '</div></div></div>').join('') + '</div></div>' : '') +
      '</div>',
    rodape: '<button class="btn btn-o" type="button" id="tf-f-editar">✎ Editar</button><div class="acoes">' +
      (fechada ? '' : '<button class="btn btn-o" type="button" id="tf-f-sub">+ Subtarefa</button><button class="btn btn-o" type="button" id="tf-f-enc">↪ Encaminhar</button>' +
        '<button class="btn btn-v" type="button" id="tf-f-ok">✓ Concluir</button>') + '</div>' });
  const depois2 = async () => { await (depois || recarregar)(); };
  j.querySelector('#tf-f-editar').onclick = () => { fecharJanela(j); formTarefa(t, depois); };
  j.querySelectorAll('[data-ficha-sub]').forEach((d) => d.onclick = () => { fecharJanela(j); abrirTarefa(subs.find((x) => x.id === d.dataset.fichaSub), depois); });
  const bs = j.querySelector('#tf-f-sub');
  if (bs) bs.onclick = () => { fecharJanela(j); formTarefa({ tarefa_pai_id: t.id, fluxo_id: t.fluxo_id, cliente_id: t.cliente_id, grupo_id: t.grupo_id, responsavel: t.responsavel, prazo: t.prazo }, depois); };
  const bo = j.querySelector('#tf-f-ok');
  if (bo) bo.onclick = () => comBotao(bo, async () => {
    if (ck.some((c) => !c.feito)) { fecharJanela(j); formTarefa(t, depois); return aviso('Marque os itens do checklist para concluir.', true); }
    if (t.exige_revisao && t.status !== 'revisao') { await q(sb.from('tarefas').update({ status: 'revisao' }).eq('id', t.id)); aviso('✓ Enviada para revisão de ' + (t.revisor || 'quem revisa') + '.'); }
    else { await validarDependencia(t, 'concluida'); await concluirTarefa(t.id); aviso('✓ Tarefa concluída.'); }
    fecharJanela(j); await depois2();
  });
  const be = j.querySelector('#tf-f-enc');
  if (be) be.onclick = () => {
    const k = abrirJanela({ titulo: 'Encaminhar tarefa', corpo: '<div class="grade">' + campo('Para quem', selectPessoa('para', '', '— escolha —'), 'inteiro') +
        campo('Recado (opcional, vai como comentário)', '<textarea name="recado" maxlength="1000" placeholder="Ex.: falta só protocolar"></textarea>', 'inteiro') + '</div>',
      rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Voltar</button><button class="btn btn-p" type="button" id="tf-enc-ok">Encaminhar</button></div>' });
    k.querySelector('[data-cancelar]').onclick = () => fecharJanela(k);
    k.querySelector('#tf-enc-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
      const para = k.querySelector('[name=para]').value, recado = k.querySelector('[name=recado]').value.trim();
      if (!para) throw new Error('Escolha para quem encaminhar.');
      await q(sb.from('tarefas').update({ responsavel: para }).eq('id', t.id));
      if (recado) await sb.from('comentarios').insert({ tarefa_id: t.id, texto: '↪ Encaminhada para ' + para + ': ' + recado }).then(() => {}, () => {});
      await notificar(para, 'Tarefa encaminhada para você: ' + t.titulo, recado || (t.prazo ? 'Prazo ' + dataBR(t.prazo) : ''), 'tarefas').catch(() => {});
      aviso('✓ Tarefa encaminhada para ' + para + '.'); fecharJanela(k); fecharJanela(j); await depois2();
    });
  };
  return j;
}

function formTarefa(t, depois) {
  t = t || {};
  const novo = !t.id;
  let checklist = Array.isArray(t.checklist) ? t.checklist.map((c) => ({ texto: c.texto, feito: !!c.feito })) : [];
  const outras = (E._tarefas || []).filter((x) => x.id !== t.id && !tarefaFechada(x));
  const j = abrirJanela({ titulo: novo ? (t.tarefa_pai_id ? 'Nova subtarefa' : 'Nova tarefa') : 'Tarefa', larga: true,
    corpo: '<form id="f-tf" class="grade">' +
      campo('Tarefa <span class="obrig">*</span>', '<input name="titulo" maxlength="300" value="' + esc(t.titulo || '') + '">', 'inteiro') +
      campo('Cliente', '<select name="cliente_id">' + opcoesClientes(t.cliente_id || '') + '</select>') +
      campo('Grupo', '<input name="grupo" list="tf-grupos" value="' + esc(nomeGrupo(t.grupo_id)) + '">' + datalistGrupos('tf-grupos')) +
      campo('Pessoa responsável', selectPessoa('responsavel', t.responsavel, '— escolha —')) +
      '<div class="campo inteiro"><span>Participantes</span>' + campoParticipantes(t.participantes) + '</div>' +
      campo('Prazo interno', '<input name="prazo" type="date" value="' + esc(t.prazo || '') + '">') +
      campo('Prazo fatal (legal / judicial)', '<input name="prazo_fatal" type="date" value="' + esc(t.prazo_fatal || '') + '">') +
      campo('Início', '<input name="inicio" type="date" value="' + esc(t.inicio || (novo ? hojeISO() : '')) + '">') +
      campo('Prioridade', selectPares('prioridade', [['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']], t.prioridade || 'media')) +
      campo('Status', selectPares('status', Object.entries(STATUS_TAREFA), t.status || 'pendente')) +
      campo('Repetir', selectPares('recorrencia', [['', 'Não repete'], ['semanal', 'Toda semana'], ['mensal', 'Todo mês'], ['anual', 'Todo ano']], t.recorrencia || '')) +
      campo('Estimativa (horas)', '<input name="estimativa_horas" inputmode="decimal" value="' + (t.estimativa_horas != null ? esc(String(t.estimativa_horas).replace('.', ',')) : '') + '">') +
      campo('Etiquetas', '<input name="etiquetas" value="' + esc(t.etiquetas || '') + '" placeholder="Ex.: urgente, PGFN">') +
      '<label class="check"><input type="checkbox" name="exige_anexo"' + (t.exige_anexo ? ' checked' : '') + '> Exige documento anexado para concluir (ex.: protocolo)</label>' +
      '<label class="check"><input type="checkbox" name="exige_revisao"' + (t.exige_revisao ? ' checked' : '') + '> Exige revisão antes de concluir</label>' +
      campo('Revisor (quem revisa)', selectPessoa('revisor', t.revisor, '— sem revisor —')) +
      '<div id="tf-carga" class="sub" style="align-self:end"></div>' +
      campo('Só começa depois de', '<select name="depende_de"><option value="">— nenhuma —</option>' + outras.map((x) => '<option value="' + x.id + '"' + (x.id === t.depende_de ? ' selected' : '') + '>' + esc(x.titulo) + '</option>').join('') + '</select>', 'inteiro') +
      campo('Processos vinculados', '<input name="processos_vinculados" value="' + esc(t.processos_vinculados || '') + '">', 'inteiro') +
      campo('Descrição', '<textarea name="descricao" maxlength="4000">' + esc(t.descricao || '') + '</textarea>', 'inteiro') +
      campo('Observação', '<textarea name="obs" maxlength="2000">' + esc(t.obs || '') + '</textarea>', 'inteiro') +
      '<div class="inteiro secao">Checklist</div><div class="inteiro" id="tf-check"></div>' +
      '<div class="inteiro filtros" style="margin:0"><input class="busca" id="tf-check-novo" placeholder="Novo item do checklist e Enter"><button class="btn btn-o btn-mini" type="button" id="tf-check-add">+ Item</button></div>' +
      (novo ? '' : '<div class="inteiro secao">Subtarefas</div><div class="inteiro" id="tf-subs"></div>' +
        '<div class="inteiro secao">Horas gastas</div><div class="inteiro" id="tf-tempo"></div>' +
        '<div class="inteiro secao">Documentos</div><div class="inteiro" id="tf-docs"></div>' +
        '<div class="inteiro secao">Comentários <span class="sub">— escreva @Nome para avisar alguém</span></div><div class="inteiro" id="tf-coment"></div>') +
      '</form>',
    rodape: (novo ? '<span></span>' : '<button class="btn btn-x" type="button" id="btn-excluir-tf">Excluir</button>') +
      '<div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-salvar-tf">Salvar</button></div>' });
  const f = j.querySelector('#f-tf');
  const pintarCheck = () => {
    j.querySelector('#tf-check').innerHTML = checklist.length ? checklist.map((c, i) => '<div class="ck-item"><label class="check"><input type="checkbox" data-ck="' + i + '"' + (c.feito ? ' checked' : '') + '> <span' + (c.feito ? ' class="riscado"' : '') + '>' + esc(c.texto) + '</span></label>' +
      '<button type="button" class="btn-etq" data-ck-x="' + i + '" title="Remover">×</button></div>').join('') : '<div class="sub">Sem itens. A tarefa só pode ser concluída com todos os itens marcados.</div>';
    j.querySelectorAll('[data-ck]').forEach((c) => c.onchange = () => { checklist[+c.dataset.ck].feito = c.checked; pintarCheck(); });
    j.querySelectorAll('[data-ck-x]').forEach((b) => b.onclick = () => { checklist.splice(+b.dataset.ckX, 1); pintarCheck(); });
  };
  const addCheck = () => { const i = j.querySelector('#tf-check-novo'); if (i.value.trim()) { checklist.push({ texto: i.value.trim(), feito: false }); i.value = ''; pintarCheck(); } };
  j.querySelector('#tf-check-add').onclick = addCheck;
  j.querySelector('#tf-check-novo').onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addCheck(); } };
  pintarCheck();
  // carga da semana da pessoa responsável (aviso acima de 40 h)
  const mostrarCarga = async () => {
    const quem = f.responsavel.value.trim(), el = j.querySelector('#tf-carga');
    if (!quem) { el.textContent = ''; return; }
    const fimSemana = somarDias(hojeISO(), 7 - new Date().getDay());
    const abertas = await q(sb.from('tarefas').select('id, estimativa_horas, prazo').eq('responsavel', quem).not('status', 'in', '(concluida,cancelada)').lte('prazo', fimSemana)).catch(() => []);
    const horas = soma(abertas.filter((x) => x.id !== t.id), (x) => x.estimativa_horas) + (lerValor(f.estimativa_horas.value) || 0);
    el.innerHTML = 'Carga de ' + esc(quem) + ' até domingo: <b>' + String(Math.round(horas * 10) / 10).replace('.', ',') + ' h</b>' + (horas > 40 ? ' <span class="pill vencido">acima de 40 h</span>' : '');
  };
  f.responsavel.onchange = mostrarCarga; f.estimativa_horas.onchange = mostrarCarga; mostrarCarga();
  if (f.cliente_id) f.cliente_id.onchange = () => { const c = E.clientes.find((x) => x.id === f.cliente_id.value); if (c && c.grupo_id && !f.grupo.value) f.grupo.value = nomeGrupo(c.grupo_id); };
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  f.onsubmit = (ev) => { ev.preventDefault(); j.querySelector('#btn-salvar-tf').click(); };
  const aposSalvar = async () => { await (depois || recarregar)(); };
  j.querySelector('#btn-salvar-tf').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.titulo.value.trim()) throw new Error('Escreva a tarefa.');
    const est = f.estimativa_horas.value.trim() ? lerValor(f.estimativa_horas.value) : null;
    if (Number.isNaN(est)) throw new Error('Estimativa de horas inválida.');
    if (f.prazo.value && f.prazo_fatal.value && f.prazo.value > f.prazo_fatal.value) throw new Error('O prazo interno está depois do prazo fatal.');
    const dados = { titulo: f.titulo.value.trim(), cliente_id: f.cliente_id.value || null, grupo_id: await grupoPorNome(f.grupo.value), responsavel: f.responsavel.value.trim(),
      participantes: lerParticipantes(j), prazo: f.prazo.value || null, prazo_fatal: f.prazo_fatal.value || null, inicio: f.inicio.value || null,
      prioridade: f.prioridade.value, status: f.status.value, recorrencia: f.recorrencia.value, estimativa_horas: est, etiquetas: f.etiquetas.value.trim(),
      depende_de: f.depende_de.value || null, exige_anexo: f.exige_anexo.checked, exige_revisao: f.exige_revisao.checked, revisor: f.revisor.value.trim(),
      processos_vinculados: f.processos_vinculados.value.trim(), descricao: f.descricao.value.trim(), obs: f.obs.value.trim(), checklist };
    if (!dados.grupo_id && dados.cliente_id) { const c = E.clientes.find((x) => x.id === dados.cliente_id); if (c) dados.grupo_id = c.grupo_id; }
    ['tarefa_pai_id', 'fluxo_id', 'contrato_id'].forEach((k) => { if (novo && t[k]) dados[k] = t[k]; });
    if (dados.exige_revisao && !dados.revisor) throw new Error('Informe quem revisa (ou desmarque "Exige revisão").');
    if (dados.status !== (t.status || 'pendente')) await validarDependencia(dados, dados.status);
    if (novo) await q(sb.from('tarefas').insert(dados)); else await q(sb.from('tarefas').update(dados).eq('id', t.id));
    if (dados.responsavel && (novo || dados.responsavel !== t.responsavel)) {
      await notificar(dados.responsavel, 'Nova tarefa para você: ' + dados.titulo, dados.prazo ? 'Prazo ' + dataBR(dados.prazo) : '', 'tarefas').catch(() => {});
    }
    let msg = novo ? '✓ Tarefa criada.' : dados.status === 'concluida' && t.status !== 'concluida' ? '✓ Tarefa concluída.' : '✓ Tarefa atualizada.';
    if (!novo && dados.status === 'concluida' && dados.exige_revisao && t.status !== 'revisao') msg = '✓ Tarefa enviada para revisão de ' + dados.revisor + '.';
    aviso(msg);
    fecharJanela(j); await aposSalvar();
  });
  const bx = j.querySelector('#btn-excluir-tf');
  if (bx) bx.onclick = () => comBotao(bx, async () => {
    if (!confirm('Excluir esta tarefa' + ((E._tarefas || []).some((x) => x.tarefa_pai_id === t.id) ? ' e as subtarefas dela' : '') + '? Ela vai para a aba "Excluídas" (dá para restaurar).')) return;
    // exclusão "suave": vira cancelada e vai para a aba Excluídas (subtarefas abertas junto)
    await q(sb.from('tarefas').update({ status: 'cancelada' }).eq('id', t.id));
    await q(sb.from('tarefas').update({ status: 'cancelada' }).eq('tarefa_pai_id', t.id).not('status', 'in', '(concluida,cancelada)'));
    aviso('Tarefa movida para "Excluídas".'); fecharJanela(j); await aposSalvar();
  });
  if (!novo) {
    pintarSubtarefas(j, t, depois).catch((e) => console.error(e));
    blocoDocumentos(j.querySelector('#tf-docs'), { tarefa_id: t.id, cliente_id: t.cliente_id, grupo_id: t.grupo_id }, { titulo: 'Arquivos da tarefa', vazio: 'Nenhum arquivo.' }).catch((e) => console.error(e));
    pintarComentarios(j, t).catch((e) => console.error(e));
    pintarTempo(j, t).catch((e) => console.error(e));
  }
  return j;
}
async function pintarSubtarefas(j, t, depois) {
  const alvo = j.querySelector('#tf-subs');
  const subs = await q(sb.from('tarefas').select('*').eq('tarefa_pai_id', t.id).order('prazo', { nullsFirst: false }));
  alvo.innerHTML = (subs.length ? subs.map((s) => '<div class="item-ficha' + (tarefaFechada(s) ? ' feita' : '') + '"><div><b>' + esc(s.titulo) + '</b> ' + seloPrazo(s) +
    '<div class="sub">' + (s.prazo ? 'até ' + dataBR(s.prazo) : 'sem prazo') + ' · ' + esc(s.responsavel || '—') + ' · ' + esc(STATUS_TAREFA[s.status]) + '</div></div>' +
    '<span>' + (tarefaFechada(s) ? '' : '<button type="button" class="btn btn-v btn-mini" data-sub-ok="' + s.id + '">✓</button> ') +
    '<button type="button" class="btn btn-o btn-mini" data-sub-ed="' + s.id + '">Abrir</button></span></div>').join('') : '<div class="sub">Nenhuma subtarefa.</div>') +
    '<button type="button" class="btn btn-o btn-mini" id="tf-sub-nova" style="margin-top:6px">+ Subtarefa</button>';
  const repinta = async () => { await pintarSubtarefas(j, t, depois); if (E._tarefas) E._tarefas = await buscarTodos(() => sb.from('tarefas').select('*').order('prazo', { nullsFirst: false })); };
  alvo.querySelector('#tf-sub-nova').onclick = () => formTarefa({ tarefa_pai_id: t.id, fluxo_id: t.fluxo_id, cliente_id: t.cliente_id, grupo_id: t.grupo_id, responsavel: t.responsavel, prazo: t.prazo }, repinta);
  alvo.querySelectorAll('[data-sub-ed]').forEach((b) => b.onclick = () => abrirTarefa(subs.find((s) => s.id === b.dataset.subEd), repinta));
  alvo.querySelectorAll('[data-sub-ok]').forEach((b) => b.onclick = () => comBotao(b, async () => { await concluirTarefa(b.dataset.subOk); aviso('✓ Subtarefa concluída.'); await repinta(); }));
}
async function pintarComentarios(j, t) {
  const alvo = j.querySelector('#tf-coment');
  const [cs, eq] = await Promise.all([q(sb.from('comentarios').select('*').eq('tarefa_id', t.id).order('criado_em')), equipe()]);
  const quem = (id) => { const u = eq.find((x) => x.id === id); return u ? u.nome || u.email : 'Equipe'; };
  alvo.innerHTML = (cs.length ? cs.map((c) => '<div class="coment"><b>' + esc(quem(c.criado_por)) + '</b> <span class="sub">' + dataBR(c.criado_em) + ' ' + new Date(c.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '</span>' +
    '<div>' + esc(c.texto).replace(/@(\S+)/g, '<b class="mencao">@$1</b>') + '</div></div>').join('') : '<div class="sub">Nenhum comentário.</div>') +
    '<div class="filtros" style="margin:8px 0 0"><input class="busca" id="tf-coment-txt" placeholder="Escreva um comentário (ex.: @Emanuelle revisar a minuta)" style="max-width:none"><button type="button" class="btn btn-o btn-mini" id="tf-coment-env">Comentar</button></div>';
  const enviar = (ev) => comBotao(ev && ev.currentTarget, async () => {
    const txt = alvo.querySelector('#tf-coment-txt').value.trim();
    if (!txt) return;
    await q(sb.from('comentarios').insert({ tarefa_id: t.id, texto: txt }));
    const mencoes = [...new Set((txt.match(/@([^\s,.;:!?]+)/g) || []).map((m) => m.slice(1)))];
    for (const m of mencoes) await notificar(m, (meuNome() || 'Alguém') + ' mencionou você em: ' + t.titulo, txt.slice(0, 200), 'tarefas', 'mencao').catch(() => {});
    await pintarComentarios(j, t);
  });
  alvo.querySelector('#tf-coment-env').onclick = enviar;
  alvo.querySelector('#tf-coment-txt').onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); alvo.querySelector('#tf-coment-env').click(); } };
}

// ▶/■ horas gastas na tarefa
async function pintarTempo(j, t) {
  const alvo = j.querySelector('#tf-tempo'); if (!alvo) return;
  const ts = await q(sb.from('tarefa_tempos').select('*').eq('tarefa_id', t.id).order('inicio')).catch(() => []);
  const eu = E.perfil && E.perfil.id, aberto = ts.find((x) => !x.fim && x.usuario === eu);
  const min = soma(ts, (x) => ((x.fim ? new Date(x.fim) : new Date()) - new Date(x.inicio)) / 60000);
  const hh = (m) => Math.floor(m / 60) + 'h' + String(Math.round(m % 60)).padStart(2, '0');
  alvo.innerHTML = '<div class="filtros" style="margin:0"><button type="button" class="btn ' + (aberto ? 'btn-x' : 'btn-v') + ' btn-mini" id="tf-crono">' + (aberto ? '■ Parar' : '▶ Iniciar') + '</button>' +
    '<span>Total: <b>' + hh(min) + '</b>' + (t.estimativa_horas ? ' de ' + String(t.estimativa_horas).replace('.', ',') + ' h estimadas' : '') + '</span>' +
    (aberto ? ' <span class="pill hoje">contando desde ' + new Date(aberto.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '</span>' : '') + '</div>';
  alvo.querySelector('#tf-crono').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (aberto) await q(sb.from('tarefa_tempos').update({ fim: new Date().toISOString() }).eq('id', aberto.id));
    else await q(sb.from('tarefa_tempos').insert({ tarefa_id: t.id }));
    await pintarTempo(j, t);
  });
}
// Tarefas → Regras automáticas (o admin liga, desliga e ajusta)
// (a antiga janela de regras virou a tela Automações — telas-automacoes.js)
function quandoRodou(v) { const d = new Date(v); return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }

// ─────────────────────────── fluxos e modelos ───────────────────────────
async function formNovoFluxo(depois) {
  const modelos = await q(sb.from('modelos_fluxo').select('*').order('nome'));
  if (!modelos.length) { aviso('Crie um modelo de fluxo primeiro (botão "Modelos de fluxo").', true); return; }
  const j = abrirJanela({ titulo: 'Novo fluxo de tarefas', larga: true,
    corpo: '<form class="grade" id="f-fl">' +
      campo('Modelo <span class="obrig">*</span>', '<select name="modelo">' + modelos.map((m) => '<option value="' + m.id + '">' + esc(m.nome) + '</option>').join('') + '</select>', 'inteiro') +
      campo('Nome do fluxo', '<input name="nome" placeholder="Ex.: Defesa — Execução 5001234-56">', 'inteiro') +
      campo('Cliente', '<select name="cliente_id">' + opcoesClientes('') + '</select>') +
      campo('Pessoa responsável', selectPessoa('responsavel', '', '— escolha —')) +
      campo('Prazo fatal <span class="obrig">*</span>', '<input name="prazo_fatal" type="date">') +
      campo('Processo', '<input name="processo" placeholder="Número do processo (opcional)">') +
      '<div class="inteiro dica">Os prazos de cada etapa são contados em <b>dias úteis antes do prazo fatal</b>, pulando fins de semana e feriados cadastrados.</div>' +
      '<div class="inteiro" id="fl-previa"></div></form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-criar-fl">Criar tarefas</button></div>' });
  const f = j.querySelector('#f-fl'), fer = await feriados();
  const itensDoModelo = () => (modelos.find((m) => m.id === f.modelo.value) || {}).itens || [];
  const previa = () => {
    const fatal = f.prazo_fatal.value, its = itensDoModelo();
    if (!f.nome.value || f.nome.dataset.auto) { f.nome.value = (modelos.find((m) => m.id === f.modelo.value) || {}).nome || ''; f.nome.dataset.auto = '1'; }
    j.querySelector('#fl-previa').innerHTML = '<div class="secao">Etapas</div>' + its.map((it) => '<div class="item-ficha"><div><b>' + esc(it.titulo) + '</b>' +
      (it.subtarefas || []).map((s) => '<div class="sub">↳ ' + esc(s.titulo) + (fatal ? ' — ' + dataBR(subtrairUteis(fatal, Number(s.dias) || 0, fer)) : '') + '</div>').join('') +
      ((it.checklist || []).length ? '<div class="sub">☐ ' + it.checklist.map(esc).join(' · ') + '</div>' : '') + '</div>' +
      '<span class="mono">' + (fatal ? dataBR(subtrairUteis(fatal, Number(it.dias) || 0, fer)) : (it.dias || 0) + ' d.u. antes') + '</span></div>').join('');
  };
  f.nome.oninput = () => { delete f.nome.dataset.auto; };
  f.modelo.onchange = previa; f.prazo_fatal.onchange = previa; previa();
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#btn-criar-fl').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const fatal = f.prazo_fatal.value;
    if (!fatal) throw new Error('Informe o prazo fatal.');
    const cli = E.clientes.find((x) => x.id === f.cliente_id.value), grupo = cli ? cli.grupo_id : null, resp = f.responsavel.value.trim();
    const fl = await q(sb.from('fluxos').insert({ nome: f.nome.value.trim() || 'Fluxo', modelo_id: f.modelo.value, cliente_id: cli ? cli.id : null, grupo_id: grupo,
      responsavel: resp, inicio: hojeISO(), prazo_fatal: fatal }).select().single());
    const base = { fluxo_id: fl.id, cliente_id: cli ? cli.id : null, grupo_id: grupo, responsavel: resp, status: 'pendente', prioridade: 'media', inicio: hojeISO(),
      processos_vinculados: f.processo.value.trim() };
    let n = 0;
    for (const it of itensDoModelo()) {
      const dias = Number(it.dias) || 0, prazo = subtrairUteis(fatal, dias, fer);
      const pai = await q(sb.from('tarefas').insert(Object.assign({}, base, { titulo: it.titulo, prazo, prazo_fatal: dias === 0 ? fatal : null,
        responsavel: it.responsavel || resp, checklist: (it.checklist || []).map((texto) => ({ texto, feito: false })) })).select().single());
      n++;
      for (const s of it.subtarefas || []) {
        await q(sb.from('tarefas').insert(Object.assign({}, base, { titulo: s.titulo, prazo: subtrairUteis(fatal, Number(s.dias) || 0, fer), tarefa_pai_id: pai.id,
          responsavel: s.responsavel || it.responsavel || resp, checklist: (s.checklist || []).map((texto) => ({ texto, feito: false })) })));
        n++;
      }
    }
    if (resp) await notificar(resp, 'Novo fluxo para você: ' + fl.nome, n + ' tarefa(s) · prazo fatal ' + dataBR(fatal), 'tarefas').catch(() => {});
    aviso('✓ Fluxo criado com ' + n + ' tarefa(s).'); fecharJanela(j); await depois();
  });
}
// Modelo em texto: "Título ; dias" (etapa), recuado = subtarefa, "- item" = checklist da linha acima
function modeloParaTexto(itens) {
  const l = [];
  (itens || []).forEach((it) => {
    l.push(it.titulo + ' ; ' + (it.dias || 0));
    (it.checklist || []).forEach((c) => l.push('- ' + c));
    (it.subtarefas || []).forEach((s) => { l.push('    ' + s.titulo + ' ; ' + (s.dias || 0)); (s.checklist || []).forEach((c) => l.push('    - ' + c)); });
  });
  return l.join('\n');
}
function textoParaModelo(txt) {
  const itens = [];
  let ultimo = null;
  String(txt || '').split('\n').forEach((bruta) => {
    if (!bruta.trim()) return;
    const recuo = /^\s{2,}|^\t/.test(bruta), s = bruta.trim();
    if (s.startsWith('-')) { if (ultimo) (ultimo.checklist = ultimo.checklist || []).push(s.replace(/^-\s*/, '')); return; }
    const [tit, d] = s.split(';');
    const it = { titulo: tit.trim(), dias: Math.max(0, parseInt(d, 10) || 0) };
    if (recuo && itens.length) { const p = itens[itens.length - 1]; (p.subtarefas = p.subtarefas || []).push(it); }
    else itens.push(it);
    ultimo = it;
  });
  return itens;
}
async function janelaModelos() {
  const ms = await q(sb.from('modelos_fluxo').select('*').order('nome'));
  const j = abrirJanela({ titulo: 'Modelos de fluxo', larga: true,
    corpo: '<div class="lista-ficha">' + (ms.map((m) => '<div class="item-ficha"><div><b>' + esc(m.nome) + '</b><div class="sub">' + esc(m.descricao || '') + ' · ' + (m.itens || []).length + ' etapa(s)</div></div>' +
      '<button class="btn btn-o btn-mini" data-mod="' + m.id + '">Editar</button></div>').join('') || '<div class="vazio">Nenhum modelo.</div>') + '</div>',
    rodape: '<span></span><button class="btn btn-p" type="button" id="btn-novo-mod">+ Novo modelo</button>' });
  const editar = (m) => {
    m = m || {};
    const k = abrirJanela({ titulo: m.id ? 'Editar modelo' : 'Novo modelo', larga: true,
      corpo: '<form class="grade" id="f-mod">' + campo('Nome <span class="obrig">*</span>', '<input name="nome" value="' + esc(m.nome || '') + '">', 'inteiro') +
        campo('Descrição', '<input name="descricao" value="' + esc(m.descricao || '') + '">', 'inteiro') +
        campo('Etapas', '<textarea name="itens" rows="12" style="font-family:var(--font-m);font-size:12.5px" placeholder="Analisar processo ; 10\n- Baixar autos\n    Pesquisa de jurisprudência ; 5\nProtocolo ; 0">' + esc(modeloParaTexto(m.itens)) + '</textarea>', 'inteiro') +
        '<div class="inteiro dica">Uma etapa por linha: <b>Título ; dias úteis antes do prazo fatal</b>. Linha com recuo (4 espaços) = subtarefa da etapa de cima. Linha começando com <b>-</b> = item de checklist.</div></form>',
      rodape: (m.id ? '<button class="btn btn-x" type="button" id="btn-exc-mod">Excluir</button>' : '<span></span>') +
        '<div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="btn-salvar-mod">Salvar</button></div>' });
    const f = k.querySelector('#f-mod');
    k.querySelector('[data-cancelar]').onclick = () => fecharJanela(k);
    k.querySelector('#btn-salvar-mod').onclick = (ev) => comBotao(ev.currentTarget, async () => {
      if (!f.nome.value.trim()) throw new Error('Dê um nome ao modelo.');
      const itens = textoParaModelo(f.itens.value);
      if (!itens.length) throw new Error('Escreva pelo menos uma etapa.');
      const d = { nome: f.nome.value.trim(), descricao: f.descricao.value.trim(), itens };
      if (m.id) await q(sb.from('modelos_fluxo').update(d).eq('id', m.id)); else await q(sb.from('modelos_fluxo').insert(d));
      aviso('✓ Modelo salvo.'); fecharJanela(k); fecharJanela(j); janelaModelos();
    });
    const bx = k.querySelector('#btn-exc-mod');
    if (bx) bx.onclick = () => comBotao(bx, async () => {
      if (!confirm('Excluir este modelo? Os fluxos já criados continuam.')) return;
      await excluir('modelos_fluxo', m.id); aviso('Modelo excluído.'); fecharJanela(k); fecharJanela(j); janelaModelos();
    });
  };
  j.querySelector('#btn-novo-mod').onclick = () => editar();
  j.querySelectorAll('[data-mod]').forEach((b) => b.onclick = () => editar(ms.find((m) => m.id === b.dataset.mod)));
}
async function janelaFeriados() {
  const fs = await q(sb.from('feriados').select('*').gte('data', somarDias(hojeISO(), -30)).order('data'));
  const j = abrirJanela({ titulo: 'Feriados (contagem de dias úteis)', larga: true,
    corpo: '<div class="tabela-wrap" style="max-height:340px;overflow:auto"><table><thead><tr><th>Data</th><th>Feriado</th><th>Abrangência</th><th></th></tr></thead><tbody>' +
      fs.map((x) => '<tr><td class="mono">' + dataBR(x.data) + '</td><td>' + esc(x.nome) + '</td><td>' + esc(x.abrangencia) + (x.local ? ' · ' + esc(x.local) : '') + '</td>' +
        '<td><button class="btn btn-x btn-mini" data-fer="' + x.data + '|' + esc(x.abrangencia) + '|' + esc(x.local) + '">Excluir</button></td></tr>').join('') + '</tbody></table></div>' +
      '<form class="grade" id="f-fer" style="margin-top:12px">' + campo('Data', '<input type="date" name="data">') + campo('Nome', '<input name="nome" placeholder="Ex.: Recesso forense">') +
      campo('Abrangência', selectPares('abrangencia', [['nacional', 'Nacional'], ['estadual', 'Estadual'], ['municipal', 'Municipal'], ['tribunal', 'Tribunal / suspensão de prazos']], 'municipal')) +
      campo('Local', '<input name="local" placeholder="Ex.: MG, Belo Horizonte, TJMG">') + '</form>',
    rodape: '<span class="sub">Só o administrador exclui feriados.</span><button class="btn btn-p" type="button" id="btn-add-fer">+ Incluir feriado</button>' });
  const f = j.querySelector('#f-fer');
  j.querySelector('#btn-add-fer').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.data.value) throw new Error('Informe a data.');
    await q(sb.from('feriados').insert({ data: f.data.value, nome: f.nome.value.trim(), abrangencia: f.abrangencia.value, local: f.local.value.trim() }));
    E._feriados = null; aviso('✓ Feriado incluído.'); fecharJanela(j); janelaFeriados();
  });
  j.querySelectorAll('[data-fer]').forEach((b) => b.onclick = () => comBotao(b, async () => {
    const [data, abr, local] = b.dataset.fer.split('|');
    const r = await q(sb.from('feriados').delete().eq('data', data).eq('abrangencia', abr).eq('local', local).select());
    if (!r.length) throw new Error('Só o administrador pode excluir este registro.');
    E._feriados = null; aviso('Feriado excluído.'); fecharJanela(j); janelaFeriados();
  }));
}

// ─────────────────────────── caixa de avisos (sino) ───────────────────────────
// Funciona como caixa de mensagens: cada aviso tem um ASSUNTO (chave) e uma LEVA.
//  • Ler = some da caixa (tabela avisos_lidos, por pessoa).
//  • Se o assunto não for resolvido, a próxima leva volta como não lida:
//    urgentes (vermelho) todo dia; os demais uma vez por semana.
//  • Notificações gravadas (tarefa atribuída, menção, rascunho…) são lidas uma vez só.
function levaDoAviso(nivel) {
  const h = hojeISO();
  if (nivel === 'alto') return h;
  const d = new Date(h + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // segunda-feira da semana
  return 's' + iso(d);
}
async function coletarAlertas() {
  const h = hojeISO(), lim = somarDias(h, 5), admin = E.perfil && E.perfil.papel === 'admin';
  const fin = pode('financeiro_juridico') || pode('financeiro_contab'), jur = pode('juridico');
  const [nots, ts, docs, certs, lidos, lanc, acs] = await Promise.all([
    q(sb.from('notificacoes').select('*').eq('lida', false).order('criado_em', { ascending: false }).limit(50)).catch(() => []),
    q(sb.from('tarefas').select('id, titulo, prazo, prazo_fatal, responsavel, participantes, status').not('status', 'in', '(concluida,cancelada)').or('prazo.lte.' + lim + ',prazo_fatal.lte.' + lim)).catch(() => []),
    q(sb.from('documentos').select('id, nome, validade, cliente_id').eq('arquivado', false).not('validade', 'is', null).lte('validade', somarDias(h, 15))).catch(() => []),
    q(sb.from('certidoes').select('id, orgao, validade, cliente_id').not('validade', 'is', null).lte('validade', somarDias(h, 15))).catch(() => []),
    q(sb.from('avisos_lidos').select('chave').gte('lido_em', new Date(Date.now() - 21 * 864e5).toISOString())).catch(() => []),
    fin ? q(sb.from('lancamentos').select('empresa, valor, redutor, vencimento').eq('tipo', 'receita').eq('pago', false).eq('perda', false).lte('vencimento', h)).catch(() => []) : [],
    jur ? q(sb.from('acordos').select('id, valor, vencimento').eq('pago', false).lte('vencimento', h)).catch(() => []) : []
  ]);
  const al = nots.map((n) => ({ nivel: n.tipo === 'rascunho' ? 'medio' : 'info', tipo: n.tipo || 'aviso', titulo: n.titulo, detalhe: n.detalhe, notif: n.id, link: n.link, quando: n.criado_em }));
  const add = (a) => { a.chave = a.assunto + '@' + levaDoAviso(a.nivel); al.push(a); };
  ts.forEach((t) => {
    const minha = ehMinha(t);
    const ref = t.prazo_fatal && (!t.prazo || t.prazo_fatal <= t.prazo) ? t.prazo_fatal : t.prazo, fatal = ref === t.prazo_fatal;
    if (!ref) return;
    const d = diasAte(ref);
    if (minha && [5, 2, 1, 0].includes(d)) add({ nivel: d <= 1 ? 'alto' : 'medio', tipo: 'prazo', assunto: 'prazo:' + t.id + ':' + d, titulo: (fatal ? '⚑ Prazo fatal ' : 'Prazo ') + (d === 0 ? 'HOJE' : 'em ' + d + ' dia(s)') + ': ' + t.titulo, detalhe: dataBR(ref), tarefa: t.id });
    else if (minha && d < 0) add({ nivel: 'alto', tipo: 'prazo', assunto: 'atrasada:' + t.id, titulo: 'Atrasada há ' + (-d) + ' dia(s): ' + t.titulo, detalhe: (fatal ? 'prazo fatal ' : 'prazo ') + dataBR(ref), tarefa: t.id });
    else if (admin && !minha && d < -3) add({ nivel: 'medio', tipo: 'equipe', assunto: 'equipe:' + t.id, titulo: 'Equipe: ' + t.titulo + ' atrasada há ' + (-d) + ' dias', detalhe: t.responsavel || 'sem responsável', tarefa: t.id });
  });
  docs.forEach((x) => add({ nivel: x.validade < h ? 'alto' : 'medio', tipo: 'documento', assunto: 'doc:' + x.id, titulo: 'Documento ' + (x.validade < h ? 'vencido' : 'vencendo') + ': ' + x.nome, detalhe: dataBR(x.validade) + ' · ' + nomeCliente(x.cliente_id), cliente: x.cliente_id }));
  certs.forEach((x) => add({ nivel: x.validade < h ? 'alto' : 'medio', tipo: 'certidao', assunto: 'cert:' + x.id, titulo: 'Certidão ' + x.orgao + ' ' + (x.validade < h ? 'vencida' : 'vencendo'), detalhe: dataBR(x.validade) + ' · ' + nomeCliente(x.cliente_id), cliente: x.cliente_id }));
  // financeiro e acordos: um aviso por assunto (não um por lançamento), com o total
  [['escritorio', 'Jurídico', 'financeiro_juridico'], ['contabilidade', 'Contabilidade', 'financeiro_contab']].forEach(([emp, rot, f]) => {
    if (!pode(f)) return;
    const hoje = lanc.filter((l) => l.empresa === emp && l.vencimento === h), atr = lanc.filter((l) => l.empresa === emp && l.vencimento < h);
    if (hoje.length) add({ nivel: 'alto', tipo: 'financeiro', assunto: 'vencehoje:' + emp, titulo: hoje.length + ' honorário(s) ' + rot + ' vencem hoje', detalhe: brl(soma(hoje, vl)) + ' · confira se entrou e dê baixa', tela: 'hoje' });
    if (atr.length) add({ nivel: 'medio', tipo: 'financeiro', assunto: 'atraso:' + emp, titulo: atr.length + ' honorário(s) ' + rot + ' em atraso', detalhe: brl(soma(atr, vl)) + ' · cobrar ou dar baixa', tela: 'hoje' });
  });
  const acH = acs.filter((a) => a.vencimento === h), acA = acs.filter((a) => a.vencimento < h);
  if (acH.length) add({ nivel: 'alto', tipo: 'acordo', assunto: 'acordohoje', titulo: acH.length + ' parcela(s) de acordo vencem hoje', detalhe: brl(soma(acH, (a) => a.valor)) + ' · lembrar o cliente', tela: 'acordos' });
  if (acA.length) add({ nivel: 'medio', tipo: 'acordo', assunto: 'acordoatraso', titulo: acA.length + ' parcela(s) de acordo vencidas', detalhe: brl(soma(acA, (a) => a.valor)) + ' · confirmar pagamento com o cliente', tela: 'acordos' });
  const lidas = new Set(lidos.map((x) => x.chave));
  al.forEach((a) => { a.lido = !!(a.chave && lidas.has(a.chave)); });
  const ordem = { alto: 0, medio: 1, info: 2 };
  return al.sort((a, b) => (a.lido - b.lido) || (ordem[a.nivel] - ordem[b.nivel]));
}
const ICONE_AVISO = { prazo: '⏰', equipe: '👥', documento: '📄', certidao: '📜', financeiro: '💰', acordo: '🤝', rascunho: '📝', publicacao: '⚖', mencao: '💬', revisao: '🔎', acesso: '🔐', tarefa: '✅', cnpj: '🏢' };
async function marcarAvisosLidos(lista) {
  const nots = lista.filter((a) => a.notif).map((a) => a.notif), chaves = lista.filter((a) => a.chave).map((a) => ({ chave: a.chave }));
  if (nots.length) await q(sb.from('notificacoes').update({ lida: true }).in('id', nots));
  if (chaves.length) await q(sb.from('avisos_lidos').upsert(chaves, { onConflict: 'usuario_id,chave', ignoreDuplicates: true }));
}
async function abrirAlertas(ancora, aoMudar) {
  if (!E.clientes.length) await carregarCadastros();
  const todos = await coletarAlertas();
  let aba = 'novos';
  const j = abrirJanela({ titulo: '🔔 Avisos', larga: true, corpo: '<div id="cx-avisos"></div>',
    rodape: '<span class="sub">Lido some da caixa. Se o assunto não for resolvido, volta na próxima leva (urgentes: amanhã; demais: semana que vem).</span><button class="btn btn-o" type="button" id="al-todas">✓ Marcar todos como lidos</button>' });
  j.querySelector('.janela').classList.add('cx-janela');
  const pintar = () => {
    const novos = todos.filter((a) => !a.lido), lidos = todos.filter((a) => a.lido), lista = aba === 'novos' ? novos : lidos;
    j.querySelector('#cx-avisos').innerHTML =
      '<div class="segmento cx-abas"><button data-cx="novos" class="' + (aba === 'novos' ? 'ativo' : '') + '">Não lidos (' + novos.length + ')</button><button data-cx="lidos" class="' + (aba === 'lidos' ? 'ativo' : '') + '">Lidos nesta leva (' + lidos.length + ')</button></div>' +
      (lista.length ? '<div class="cx-lista">' + lista.map((a) => { const i = todos.indexOf(a); return '<div class="cx-item nivel-' + a.nivel + (a.lido ? ' lido' : '') + '">' +
        '<span class="cx-ic" aria-hidden="true">' + (ICONE_AVISO[a.tipo] || '🔔') + '</span><div class="cx-txt"><b>' + esc(a.titulo) + '</b><div class="sub">' + esc(a.detalhe || '') + (a.quando ? ' · ' + quandoRodou(a.quando) : '') + '</div></div>' +
        '<div class="cx-acoes">' + (a.tarefa || a.cliente || a.tela || a.link ? '<button class="btn btn-o btn-mini" data-al-abrir="' + i + '">Abrir</button>' : '') +
        (a.lido ? '' : '<button class="btn btn-mini btn-o" data-al-lida="' + i + '" title="Marcar como lido">✓ Lido</button>') + '</div></div>'; }).join('') + '</div>'
        : '<div class="vazio">' + (aba === 'novos' ? 'Tudo lido. 🎉 Os avisos voltam se o assunto continuar pendente.' : 'Nada lido nesta leva.') + '</div>');
    j.querySelector('#al-todas').hidden = !novos.length;
    j.querySelectorAll('[data-cx]').forEach((b) => b.onclick = () => { aba = b.dataset.cx; pintar(); });
    j.querySelectorAll('[data-al-lida]').forEach((b) => b.onclick = () => comBotao(b, async () => { const a = todos[+b.dataset.alLida]; await marcarAvisosLidos([a]); a.lido = true; pintar(); if (aoMudar) aoMudar(); }));
    j.querySelectorAll('[data-al-abrir]').forEach((b) => b.onclick = () => comBotao(b, async () => {
      const a = todos[+b.dataset.alAbrir];
      if (!a.lido) { await marcarAvisosLidos([a]); a.lido = true; if (aoMudar) aoMudar(); }
      if (a.tarefa) await abrirTarefa(a.tarefa, async () => { if (aoMudar) aoMudar(); });
      else if (a.cliente) abrirFicha(a.cliente, 'documentos');
      else { fecharJanela(j); irParaTela(a.tela || a.link); }
    }));
  };
  pintar();
  j.querySelector('#al-todas').onclick = (ev) => comBotao(ev.currentTarget, async () => { const n = todos.filter((a) => !a.lido); await marcarAvisosLidos(n); n.forEach((a) => { a.lido = true; }); pintar(); if (aoMudar) aoMudar(); });
}
async function contarAlertas() {
  const al = (await coletarAlertas()).filter((a) => !a.lido);
  return { total: al.length, altos: al.filter((a) => a.nivel === 'alto').length, lista: al };
}

// Google Agenda: link secreto da pessoa (função erp-agenda) — o Google assina e atualiza sozinho
async function janelaAgenda(novo) {
  const token = await q(sb.rpc('meu_link_agenda', { p_novo: !!novo }));
  const link = String(CFG.url || location.origin).replace(/\/$/, '') + '/functions/v1/erp-agenda?t=' + token;
  const j = abrirJanela({ titulo: '📅 Seus prazos no Google Agenda', larga: true,
    corpo: '<p style="margin-bottom:10px">Este link mostra no seu Google Agenda os <b>prazos fatais</b> e as <b>audiências</b> das tarefas em que você é responsável, com lembrete 1 dia antes. Não tem custo.</p>' +
      campo('Seu link (pessoal — não compartilhe)', '<input id="ag-link" readonly value="' + esc(link) + '" onclick="this.select()">', 'inteiro') +
      '<ol class="passos" style="margin:12px 0 0 18px;line-height:1.7">' +
      '<li>Clique em <b>Copiar link</b>.</li>' +
      '<li>Abra o <b>Google Agenda</b> no computador → à esquerda, em <b>Outras agendas</b>, clique no <b>+</b> → <b>Do URL</b>.</li>' +
      '<li>Cole o link e clique em <b>Adicionar agenda</b>. Pronto: aparece a agenda "ERP · prazos".</li></ol>' +
      '<div class="dica" style="margin-top:10px">O Google atualiza a agenda sozinho, algumas vezes por dia (pode levar até 24 h para uma mudança aparecer). ' +
      'Se o link vazar, clique em <b>Trocar link</b>: o antigo para de funcionar na hora.</div>',
    rodape: '<button class="btn btn-o" type="button" id="ag-trocar">Trocar link</button><div class="acoes"><button class="btn btn-p" type="button" id="ag-copiar">Copiar link</button></div>' });
  j.querySelector('#ag-copiar').onclick = async () => { try { await navigator.clipboard.writeText(link); aviso('Link copiado. Agora cole no Google Agenda → Do URL.'); } catch (e) { j.querySelector('#ag-link').select(); aviso('Selecionei o link: aperte Ctrl+C para copiar.'); } };
  j.querySelector('#ag-trocar').onclick = () => { if (confirm('Trocar o link? O link antigo para de funcionar e você precisará adicionar o novo no Google Agenda.')) { fecharJanela(j); janelaAgenda(true); } };
}
