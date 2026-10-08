'use strict';
// ═══════════════════════════════════════════════════════════════════
// Tarefas — lista em árvore (subtarefas), quadro (kanban), calendário,
// fluxos com prazos em dias úteis, relatório, checklist, comentários,
// recorrência e alertas (sino da barra superior).
// ═══════════════════════════════════════════════════════════════════
const PRIORIDADE = { alta: ['Alta', 'vencido'], media: ['Média', 'hoje'], baixa: ['Baixa', 'pago'] };
// Backup 50: status com cor própria (pílula), igual à prioridade
function pillStatusTarefa(st) { return '<span class="pill tf-st tf-st-' + esc(st || 'pendente') + '">' + esc(STATUS_TAREFA[st] || st || '—') + '</span>'; }
const STATUS_TAREFA = { pendente: 'Pendente', andamento: 'Em andamento', aguardando: 'Aguardando', revisao: 'Aguardando revisão', concluida: 'Concluída', cancelada: 'Cancelada' };
const COLUNAS_KANBAN = ['pendente', 'andamento', 'aguardando', 'revisao', 'concluida'];
const tarefaFechada = (t) => t.status === 'concluida' || t.status === 'cancelada';

// ─────────────── pessoas, feriados e dias úteis ───────────────
function primeiroNome(s) { return normalizar(String(s || '').trim().split(/\s+/)[0]); }
// Backup 39: primeiro nome para mostrar na tela, com a inicial maiúscula (Pedro, Emanuelle, Adriana…)
function nomeCurto(s) { const p = String(s || '').trim().split(/\s+/)[0] || ''; return p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1).toLocaleLowerCase('pt-BR'); }
function meuNome() { return (E.perfil && E.perfil.nome) || ''; }
function ehMinha(t) {
  const eu = primeiroNome(meuNome());
  if (!eu) return false;
  return primeiroNome(t.responsavel) === eu || String(t.participantes || '').split(',').some((p) => primeiroNome(p) === eu);
}
async function equipe() {
  // Backup 45: com cargo e nível (hierarquia); se o SQL novo ainda não rodou, cai na lista antiga
  if (!E._equipe) E._equipe = await q(sb.rpc('equipe_hierarquia')).catch(() => q(sb.rpc('equipe_nomes')).catch(() => []));
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
const FILA = { toda: false, min: false, vista: 'lista', ref: null, lida: false, quem: '', pessoas: null, tipos: null, pri: '', atalho: '' };
// Backup 38: a agenda mostra SÓ o que está em Tarefas (tarefas e compromissos lançados pela equipe).
// O administrador escolhe de quem ver: só as suas, todos, ou uma pessoa; os demais veem só as suas.
const ehAdminFila = () => !!(E.perfil && E.perfil.papel === 'admin');
const VISTAS_FILA = [['mes', 'Mês'], ['semana', 'Semana'], ['dia', 'Dia'], ['lista', 'Lista']];   // Backup 53: as mesmas vistas do Calendário de Tarefas (+ Lista)
// Backup 53: filtros de prioridade e de prazo — os MESMOS de Tarefas (Início e Tarefas usam estas duas funções)
const PRI_FILTRO = [['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']], PRAZO_FILTRO = [['hoje', 'Hoje'], ['atrasadas', 'Atrasadas'], ['7', '7 dias']];
// Backup 54: os filtros em 2 colunas × 2 linhas — à esquerda Mostrar / De quem, à direita Urgência / Prazo
function gruposPriPrazo(attrPri, attrPrazo, pri, atalho, extras) {
  const grupo = (rot, miolo) => '<div class="fila-chips" role="group" aria-label="' + rot + '"><span class="fila-chips-rot">' + rot + '</span>' + miolo + '</div>';
  return [grupo('Urgência', PRI_FILTRO.map(([k, r]) => chipFiltro(attrPri, k, r, pri === k)).join('')),
    attrPrazo ? grupo('Prazo', PRAZO_FILTRO.concat(extras || []).map(([k, r]) => chipFiltro(attrPrazo, k, r, atalho === k)).join('')) : '<div></div>'];
}
const filtros2x2 = (mostrar, deQuem, urg, prazo) => mostrar + urg + (deQuem || '<div></div>') + prazo;
function passaPriPrazo(t, pri, a) {
  const h = hojeISO();
  if (pri && t.prioridade !== pri) return false;
  if (a === 'hoje' && (tarefaFechada(t) || !t.prazo || t.prazo > h)) return false;
  if (a === 'atrasadas' && (tarefaFechada(t) || !t.prazo || t.prazo >= h)) return false;
  if (a === '7' && (tarefaFechada(t) || !t.prazo || t.prazo > somarDias(h, 7))) return false;
  return true;
}   // Backup 52 (C1): a Semana voltou ao Início — a MESMA de Tarefas → Calendário (arrastar remarca)
function salvarPrefFila() {
  const v = { vista: FILA.vista, min: FILA.min, quem: FILA.quem || '', pessoas: FILA.pessoas || null, tipos: FILA.tipos || null, pri: FILA.pri || '', atalho: FILA.atalho || '' };
  if (E.perfil) E.perfil.preferencias = Object.assign({}, E.perfil.preferencias || {}, { fila: v });
  sb.rpc('salvar_preferencia', { p_chave: 'fila', p_valor: v }).then(() => {}, () => {});
}
// Backup 36: compromissos na agenda (tarefas com tipo_agenda + hora) — cor por tipo e legenda
const TIPOS_AGENDA = [['reuniao', 'Reunião', '🤝'], ['audiencia', 'Audiência', '⚖'], ['compromisso', 'Compromisso', '📌']];   // Backup 40: sem Ligação
// legenda curta: compromissos (reunião, audiência, compromisso), tarefa e atrasada; ⚑ = prazo fatal
const legendaAgenda = () => '<div class="ag-leg">' + TIPOS_AGENDA.map(([k, r]) => '<span><i class="ag-cor ag-' + k + '"></i>' + r + '</span>').join('') +
  '<span><i class="ag-cor ag-tarefa"></i>Tarefa</span><span><i class="ag-cor ag-rotina"></i>Rotina</span><span><i class="ag-cor ag-atrasada"></i>Atrasada</span><span><i class="ag-cor ag-feita"></i>Concluída</span><span><i class="ag-cor ag-prevista"></i>Próxima (repete)</span><span>⚑ Prazo fatal</span></div>';
// Backup 45: filtros da agenda (marca/desmarca) — tipo do item e de quem é (respeitando o cargo: ninguém vê a agenda de quem está acima)
const FILTRO_TIPOS_AG = [['reuniao', 'Reuniões'], ['audiencia', 'Audiências'], ['compromisso', 'Compromissos'], ['tarefa', 'Tarefas'], ['rotina', 'Rotinas']];
function tipoItemAgenda(t) {
  if (t.tipo_agenda) return t.tipo_agenda === 'ligacao' ? 'compromisso' : t.tipo_agenda;
  if (/^reuniao:/.test(t.chave_regra || '')) return 'reuniao';
  return t.recorrencia || /^rot-/.test(t.chave_regra || '') ? 'rotina' : 'tarefa';
}
// Backup 48: o mesmo botão de filtro no Início e em Tarefas (tipo = com a cor do tipo)
function chipFiltro(attr, v, rot, on, comCor) {
  return '<button type="button" class="chip fila-chip' + (comCor && v !== '*' ? ' fila-chip-' + v : '') + (on ? ' ativo' : '') + '" ' + attr + '="' + esc(v) + '" data-tipo-filtro="' + (comCor ? 'tipo' : 'pes') + '"' +
    (comCor ? ' data-fila-tipo-v="' + esc(v) + '"' : '') + ' aria-pressed="' + (on ? 'true' : 'false') + '">' + (on ? '✓ ' : '') + esc(rot) + '</button>';
}
// marca/desmarca num conjunto; '*' = todos (ou nenhum, se já estavam todos)
function alternarFiltro(atual, v, todos) {
  let t = new Set(atual); if (v === '*') t = t.size >= todos.length ? new Set() : new Set(todos); else if (t.has(v)) t.delete(v); else t.add(v);
  return [...t];
}
function nivelDe(u) { return u ? (u.nivel != null ? Number(u.nivel) : nivelCargo(u.cargo, u.papel)) : 2; }
// quem eu posso ver/lançar: eu + quem está no mesmo nível ou abaixo (o administrador vê todos)
function pessoasVisiveis() {
  const eq = E._equipe || [], eu = eq.find((u) => primeiroNome(u.nome) === primeiroNome(meuNome()));
  const meu = ehAdminFila() ? 99 : nivelDe(eu);
  const nomes = eq.filter((u) => nivelDe(u) <= meu).map((u) => String(u.nome || '').trim()).filter(Boolean);
  if (!nomes.some((n) => primeiroNome(n) === primeiroNome(meuNome())) && meuNome()) nomes.unshift(meuNome());
  return [...new Set(nomes)].sort((a, b) => (primeiroNome(b) === primeiroNome(meuNome())) - (primeiroNome(a) === primeiroNome(meuNome())) || a.localeCompare(b, 'pt-BR'));
}
// Backup 40: aviso antes do compromisso (vira notificação + e-mail para quem participa; e um aviso na tela de quem está com o ERP aberto)
const AVISOS_AGENDA = [['', 'Não avisar'], ['15', '15 min antes'], ['30', '30 min antes'], ['60', '1 hora antes'], ['120', '2 horas antes'], ['1440', '1 dia antes'], ['2880', '2 dias antes']];
const TIPOS_AUDIENCIA = ['Conciliação', 'Instrução e julgamento', 'Una', 'Mediação', 'Justificação', 'Outra'];
// hora "HH:MM" → minutos; fim padrão = início + 1 h
const minHora = (h) => { const m = String(h || '').match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
const horaFaixa = (t) => (t.hora ? String(t.hora).slice(0, 5) + (t.hora_fim ? '–' + String(t.hora_fim).slice(0, 5) : '') : '');
// quem se sobrepõe: mesmas pessoas, mesmo dia, horários que se cruzam
async function conflitosAgenda(dia, ini, fim, pessoas, ignorar) {
  const a = minHora(ini); if (a == null) return [];
  const b = minHora(fim) != null && minHora(fim) > a ? minHora(fim) : a + 60;
  const ts = await q(sb.from('tarefas').select('id, titulo, hora, hora_fim, responsavel, participantes').eq('prazo', dia).not('hora', 'is', null).not('status', 'in', '(concluida,cancelada)')).catch(() => []);
  const nomes = pessoas.map(primeiroNome);
  return ts.filter((t) => t.id !== ignorar).filter((t) => {
    const x = minHora(t.hora), y = minHora(t.hora_fim) != null && minHora(t.hora_fim) > x ? minHora(t.hora_fim) : x + 60;
    const deles = [t.responsavel].concat(String(t.participantes || '').split(',')).map(primeiroNome).filter(Boolean);
    return x < b && a < y && deles.some((n) => nomes.includes(n));
  });
}
async function janelaAgendar(dataIni, depois) {
  // Backup 40: só quem está CADASTRADO e ativo (Administração → Usuários); descadastrou, sai da lista
  const eq = await equipe().catch(() => []);
  const pessoas = [...new Set(eq.map((u) => String(u.nome || '').trim()).filter(Boolean))];
  if (!pessoas.some((n) => primeiroNome(n) === primeiroNome(meuNome()))) pessoas.unshift(meuNome());
  const procs = await q(sb.from('processos').select('numero, autor, reu').order('numero').limit(1000)).catch(() => []);
  // Backup 45: dá para lançar para outra pessoa (quem está no mesmo nível ou abaixo) e "Tarefa" é um tipo também
  const podeVer = pessoasVisiveis();
  const j = abrirJanela({ titulo: '📅 Agendar', larga: true,
    corpo: '<form id="f-ag" class="grade ag-form" data-tipo="reuniao">' +
      '<div class="campo" style="grid-column:1/-1"><span>Tipo</span><div class="segmento ag-tipos" id="ag-tipo">' + TIPOS_AGENDA.concat([['tarefa', 'Tarefa', '✓']]).map(([k, r, ic], i) => '<button type="button" data-v="' + k + '"' + (i ? '' : ' class="ativo"') + '>' + ic + ' ' + r + '</button>').join('') + '</div></div>' +
      '<label class="campo"><span>Responsável</span><select name="resp">' + podeVer.map((n) => '<option value="' + esc(n) + '"' + (primeiroNome(n) === primeiroNome(meuNome()) ? ' selected' : '') + '>' + esc(n) + (primeiroNome(n) === primeiroNome(meuNome()) ? ' (eu)' : '') + '</option>').join('') + '</select></label>' +
      // Audiência: processo, tipo, vara e se é virtual
      '<label class="campo ag-so-aud ag-toda"><span>Número do processo *</span><input name="processo" list="ag-procs" autocomplete="off" placeholder="0000000-00.0000.0.00.0000"><datalist id="ag-procs">' +
        procs.map((p) => '<option value="' + esc(p.numero) + '">' + esc([p.autor, p.reu].filter(Boolean).join(' × ')) + '</option>').join('') + '</datalist></label>' +
      '<label class="campo ag-so-aud"><span>Tipo de audiência</span><select name="tipo_aud">' + TIPOS_AUDIENCIA.map((x) => '<option>' + x + '</option>').join('') + '</select></label>' +
      '<label class="campo ag-so-aud"><span>Formato</span><select name="formato"><option value="presencial">Presencial</option><option value="virtual">Virtual (link)</option><option value="hibrida">Híbrida</option></select></label>' +
      '<label class="campo ag-toda"><span class="ag-rot-titulo">Assunto *</span><input name="titulo" placeholder="ex.: Reunião sobre o parcelamento"></label>' +
      '<label class="campo"><span>Dia *</span><input type="date" name="prazo" required value="' + (dataIni || hojeISO()) + '"></label>' +
      '<div class="campo ag-horas ag-nao-tarefa"><span>Horário</span><div class="ag-hh"><input type="time" name="hora" value="09:00" aria-label="Início"><span class="sub">até</span><input type="time" name="hora_fim" value="10:00" aria-label="Fim"></div></div>' +
      '<div class="ag-conflito ag-toda" id="ag-conflito" hidden></div>' +
      '<label class="campo ag-toda"><span class="ag-rot-local">Local ou link</span><input name="local" placeholder="escritório, Google Meet…"></label>' +
      '<div class="campo ag-toda"><span>Quem mais participa</span><div class="ag-pessoas">' + pessoas.map((n) =>
        '<label class="ag-p"><input type="checkbox" name="part" value="' + esc(n) + '"><span>' + esc(nomeCurto(n)) + '</span></label>').join('') + '</div></div>' +
      // cliente cadastrado (escolhe na lista) OU texto livre (ex.: "Dr. Fulano, contador da empresa X")
      '<label class="campo ag-toda ag-nao-comp"><span class="ag-rot-com">Com quem (cliente ou qualquer nome)</span><input name="com" list="ag-clis" autocomplete="off" placeholder="Cliente cadastrado ou texto livre"><datalist id="ag-clis">' + E.clientes.map((c) => '<option value="' + esc(c.nome) + '">').join('') + '</datalist></label>' +
      '<div class="campo ag-avisos"><span>Avisar</span><div class="ag-av2"><select name="aviso" aria-label="1º aviso">' + AVISOS_AGENDA.map(([v, r]) => '<option value="' + v + '"' + (v === '30' ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>' +
        '<span class="sub">e</span><select name="aviso2" aria-label="2º aviso">' + AVISOS_AGENDA.map(([v, r]) => '<option value="' + v + '">' + (v ? r : 'sem 2º aviso') + '</option>').join('') + '</select></div></div>' +
      '<label class="campo ag-toda"><span>Observação</span><textarea name="descricao" rows="2"></textarea></label></form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="ag-ok">Agendar</button></div>' });
  const f = j.querySelector('#f-ag');
  let tipo = 'reuniao';
  const ROT = { reuniao: ['Assunto *', 'Local ou link', 'Com quem (cliente ou qualquer nome)', 'ex.: Reunião sobre o parcelamento', 'escritório, Google Meet…'],
    audiencia: ['Descrição (opcional)', 'Vara / juízo, ou link da sala virtual', 'Cliente (parte que representamos)', 'se vazio: "Audiência de conciliação — nº do processo"', 'ex.: 2ª Vara Cível de Belo Horizonte'],
    compromisso: ['O quê *', 'Local', 'Com quem (opcional)', 'ex.: Cartório, banco, perícia…', 'endereço'],
    tarefa: ['Tarefa *', 'Local (opcional)', 'Cliente (opcional)', 'ex.: Protocolar a defesa', ''] };
  const pintarTipo = () => {
    f.dataset.tipo = tipo;
    const r = ROT[tipo];
    f.querySelector('.ag-rot-titulo').textContent = r[0]; f.querySelector('.ag-rot-local').textContent = r[1]; f.querySelector('.ag-rot-com').textContent = r[2];
    f.titulo.placeholder = r[3]; f.local.placeholder = r[4];
  };
  j.querySelector('#ag-tipo').onclick = (ev) => { const b = ev.target.closest('[data-v]'); if (!b) return; tipo = b.dataset.v; j.querySelectorAll('#ag-tipo button').forEach((x) => x.classList.toggle('ativo', x === b)); pintarTipo(); };
  // fim acompanha o início (1 h depois) até a pessoa mexer no fim
  let fimMexido = false;
  f.hora_fim.oninput = () => { fimMexido = true; };
  f.hora.oninput = () => { if (!fimMexido && minHora(f.hora.value) != null) { const m = Math.min(minHora(f.hora.value) + 60, 23 * 60 + 59); f.hora_fim.value = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); } };
  // processo escolhido → cliente sugerido (autor) se "com quem" estiver vazio
  f.processo.onchange = () => { const p = procs.find((x) => x.numero === f.processo.value.trim()); if (p && !f.com.value) f.com.value = p.autor || ''; };
  // aviso de sobreposição (não impede, só mostra)
  const verConflito = async () => {
    const parts = [f.resp.value].concat([...f.querySelectorAll('[name=part]:checked')].map((x) => x.value));
    const c = f.dataset.tipo !== 'tarefa' && f.prazo.value && f.hora.value ? await conflitosAgenda(f.prazo.value, f.hora.value, f.hora_fim.value, parts) : [];
    const el = j.querySelector('#ag-conflito'); el.hidden = !c.length;
    el.innerHTML = c.length ? '⚠ Choca com: ' + c.map((x) => '<b>' + esc(horaFaixa(x)) + '</b> ' + esc(x.titulo) + ' (' + esc([x.responsavel].concat(String(x.participantes || '').split(',')).map(nomeCurto).filter(Boolean).join(', ')) + ')').join(' · ') : '';
    return c;
  };
  ['prazo', 'hora', 'hora_fim'].forEach((n) => f[n].addEventListener('change', verConflito));
  f.querySelectorAll('[name=part]').forEach((x) => x.addEventListener('change', verConflito));
  f.resp.addEventListener('change', verConflito);
  verConflito();
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#ag-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const proc = f.processo.value.trim();
    let titulo = f.titulo.value.trim();
    if (tipo === 'audiencia') {
      if (!proc) throw new Error('Audiência: informe o número do processo.');
      if (!titulo) titulo = 'Audiência de ' + f.tipo_aud.value.toLowerCase() + ' — ' + proc;
    } else if (!titulo) throw new Error(tipo === 'reuniao' ? 'Escreva o assunto da reunião.' : tipo === 'tarefa' ? 'Escreva a tarefa.' : 'Escreva o que é o compromisso.');
    if (!f.prazo.value) throw new Error('Escolha o dia.');
    const semHora = tipo === 'tarefa';
    if (!semHora && f.hora.value && f.hora_fim.value && minHora(f.hora_fim.value) <= minHora(f.hora.value)) throw new Error('O fim tem que ser depois do início.');
    const resp = f.resp.value || meuNome();
    const parts = [resp].concat([...f.querySelectorAll('[name=part]:checked')].map((x) => x.value).filter((n) => primeiroNome(n) !== primeiroNome(resp)));
    const c = semHora ? [] : await verConflito();
    if (c.length && !confirm('Este horário choca com ' + plural(c.length, 'compromisso', 'compromissos') + ' de quem participa. Agendar mesmo assim?')) return;
    const com = f.com.value.trim(), cli = E.clientes.find((x) => normalizar(x.nome) === normalizar(com));
    const local = f.local.value.trim();
    const obs = [tipo === 'audiencia' ? 'Audiência: ' + f.tipo_aud.value + ' · ' + ({ presencial: 'Presencial', virtual: 'Virtual', hibrida: 'Híbrida' }[f.formato.value]) : '', f.descricao.value.trim()].filter(Boolean).join('\n');
    await q(sb.from('tarefas').insert({ titulo, prazo: f.prazo.value, hora: semHora ? null : f.hora.value || null, hora_fim: !semHora && f.hora.value && f.hora_fim.value ? f.hora_fim.value : null,
      tipo_agenda: semHora ? '' : tipo, local, processos_vinculados: tipo === 'audiencia' ? proc : '', aviso_min: f.aviso.value ? +f.aviso.value : null,
      aviso2_min: f.aviso2.value && f.aviso2.value !== f.aviso.value ? +f.aviso2.value : null,
      responsavel: resp, participantes: parts.filter((n) => n !== resp).join(', '), cliente_id: cli ? cli.id : null, com_quem: cli ? '' : com,
      grupo_id: cli ? cli.grupo_id || null : null, descricao: obs, prioridade: tipo === 'audiencia' ? 'alta' : 'media', status: 'pendente' }));
    try { if (f.aviso.value && window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) { /* navegador sem aviso */ }
    fecharJanela(j); aviso('✓ Agendado para ' + dataBR(f.prazo.value) + (!semHora && f.hora.value ? ' às ' + f.hora.value : '') + (primeiroNome(resp) !== primeiroNome(meuNome()) ? ' — com ' + nomeCurto(resp) : '') + '.'); if (depois) depois();
  });
}
// Backup 40: aviso na tela de quem está com o ERP aberto (o e-mail sai pelo banco, rotina avisos_agenda)
let _vigiaAg = null;
function vigiarAgenda() {
  if (_vigiaAg) return;
  const ver = async () => {
    if (!E.perfil) return;
    const h = hojeISO(), am = iso(new Date(Date.now() + 2 * 864e5));
    const ts = await q(sb.from('tarefas').select('id, titulo, prazo, hora, hora_fim, local, aviso_min, aviso2_min, responsavel, participantes').gte('prazo', h).lte('prazo', am)
      .or('aviso_min.not.is.null,aviso2_min.not.is.null').not('hora', 'is', null).not('status', 'in', '(concluida,cancelada)')).catch(() => []);
    let vistos = {}; try { vistos = JSON.parse(localStorage.getItem('erp_avisos_ag') || '{}'); } catch (e) { /* sem armazenamento */ }
    const agora = Date.now();
    ts.filter((t) => ehMinha(t) || String(t.participantes || '').split(',').some((n) => primeiroNome(n) === primeiroNome(meuNome()))).forEach((t) => {
      const ini = new Date(t.prazo + 'T' + String(t.hora).slice(0, 5) + ':00').getTime();
      // Backup 45: dois avisos (cada um avisa uma vez)
      const k = [[t.id, t.aviso_min], [t.id + ':2', t.aviso2_min]].find(([id, m]) => m != null && !vistos[id] && agora >= ini - m * 6e4 && agora <= ini);
      if (!k) return;
      vistos[k[0]] = 1;
      const txt = horaFaixa(t) + ' · ' + t.titulo + (t.local ? ' · ' + t.local : '');
      aviso('🔔 ' + (t.prazo === h ? 'Hoje' : dataBR(t.prazo)) + ' ' + txt);
      try { if (window.Notification && Notification.permission === 'granted') new Notification('Agenda — ' + t.titulo, { body: txt }); } catch (e) { /* navegador sem aviso */ }
    });
    try { localStorage.setItem('erp_avisos_ag', JSON.stringify(vistos)); } catch (e) { /* sem armazenamento */ }
  };
  ver(); _vigiaAg = setInterval(ver, 60000);
}
function classeAgenda(t, d) {
  const h = hojeISO();
  if (t._cls) return t._cls;
  if (t.prazo_fatal === d) return 'ag-fatal';
  if (tarefaFechada(t)) return 'ag-feita';   // Backup 40: concluída fica riscada
  if (t.tipo_agenda) return 'ag-' + (t.tipo_agenda === 'ligacao' ? 'compromisso' : t.tipo_agenda);
  if (/^reuniao:/.test(t.chave_regra || '')) return 'ag-reuniao';   // reuniões marcadas pelo CRM
  if (t.prazo && t.prazo < h) return 'ag-atrasada';
  return tipoItemAgenda(t) === 'rotina' ? 'ag-rotina' : 'ag-tarefa';   // Backup 46: rotina com cor própria
}
const horaAg = (t) => (t.hora ? horaFaixa(t) + ' ' : '');
// Backup 39: o quadro "Atrasadas" é um só — Início (agenda) e Tarefas (Minha semana e Calendário)
function quadroAtrasadas(atr) {
  return '<aside class="fila-atrasadas"><div class="fila-atr-tit">⏰ Atrasadas <span class="pill ' + (atr.length ? 'vencido' : 'pago') + '">' + atr.length + '</span></div>' +
    (atr.length ? atr.map((t) => '<button type="button" class="fila-atr-it" data-fila="' + t.id + '" title="' + esc(t.titulo) + '"><b>' + esc(t.titulo) + '</b><span class="sub">prazo ' + dataBR(t.prazo) + ' · ' + plural(-diasAte(t.prazo), 'dia', 'dias') + ' de atraso</span></button>').join('')
      : '<div class="sub">Nenhuma atrasada. 🎉</div>') + '</aside>';
}
function calendarioFila(lista) {
  const h = hojeISO(), ref = FILA.ref || h, d0 = new Date(ref + 'T12:00:00');
  const doDia = (d) => lista.filter((t) => t.prazo === d || t.prazo_fatal === d).sort((a, b) => String(a.hora || '99').localeCompare(String(b.hora || '99')));
  const item = (t, d) => '<button type="button" class="cal-tf ' + classeAgenda(t, d) + '" data-fila="' + t.id + '"' + (t._prev ? ' data-prevista="' + d + '"' : '') + ' title="' + esc(horaAg(t) + t.titulo + (t.local ? ' · ' + t.local : '') + (t._prev ? ' · próxima ocorrência (' + textoRepete(t) + ')' : ' · prioridade ' + ((PRIORIDADE[t.prioridade] || ['—'])[0]) + ' · ' + (STATUS_TAREFA[t.status] || ''))) + '">' +
    // Backup 50: bolinha da prioridade (vermelha alta, âmbar média, verde baixa) dentro do item do calendário
    '<span class="cal-pri cal-pri-' + esc(t.prioridade || 'media') + '" aria-hidden="true"></span>' +
    (t.prazo_fatal === d ? '⚑ ' : '') + (t.hora ? '<b>' + horaAg(t) + '</b>' : '') + esc(t.titulo) + '</button>';
  let titulo, corpo;
  if (FILA.vista === 'dia') {
    titulo = d0.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    const l = doDia(ref);
    corpo = l.length ? '<div class="lista-ficha">' + l.map((t) => '<div class="item-ficha clicavel" data-fila="' + t.id + '"><div>' + bolinha(t) + ' <b>' + esc(t.titulo) + '</b>' + seloFatal(t) +
      '<div class="sub">' + esc(quemTarefa(t) || '') + '</div></div></div>').join('') + '</div>' : '<div class="sub">Nada com prazo neste dia.</div>';
  } else if (FILA.vista === 'semana') {
    const ini = new Date(d0); ini.setDate(d0.getDate() - d0.getDay());
    const dias = [...Array(7)].map((_, k) => { const x = new Date(ini); x.setDate(ini.getDate() + k); return iso(x); });
    titulo = 'Semana de ' + dataBR(dias[0]).slice(0, 5) + ' a ' + dataBR(dias[6]).slice(0, 5);
    corpo = '<div class="fila-semana">' + dias.map((d) => '<div class="fila-sem-dia' + (d === h ? ' cal-hoje' : '') + '" data-ag-dia="' + d + '"><div class="cal-num">' +
      new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }) + '</div>' + doDia(d).map((t) => item(t, d)).join('') + '</div>').join('') + '</div>';
  } else {
    const a = d0.getFullYear(), m = d0.getMonth(), primeiro = new Date(a, m, 1), n = new Date(a, m + 1, 0).getDate();
    titulo = primeiro.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    let c = '<div class="calendario">' + ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((x) => '<div class="cal-sem">' + x + '</div>').join('') + '<div class="cal-dia vazio-dia"></div>'.repeat(primeiro.getDay());
    for (let k = 1; k <= n; k++) {
      const d = iso(new Date(a, m, k)), l = doDia(d);
      c += '<div class="cal-dia' + (d === h ? ' cal-hoje' : '') + '" data-ag-dia="' + d + '" title="Clique no espaço vazio para agendar neste dia"><div class="cal-num">' + k + '</div>' + l.slice(0, 3).map((t) => item(t, d)).join('') + (l.length > 3 ? '<div class="sub">+ ' + (l.length - 3) + '</div>' : '') + '</div>';
    }
    // Backup 27: completa a última semana com dias vazios (igual aos dias antes do dia 1, sem o cinza do fundo)
    const resto = (7 - ((primeiro.getDay() + n) % 7)) % 7;
    corpo = c + '<div class="cal-dia vazio-dia"></div>'.repeat(resto) + '</div>';
  }
  // Backup 27: à esquerda, as tarefas atrasadas (não aparecem na semana/dia/mês que você está vendo)
  const lado = quadroAtrasadas(lista.filter((t) => t.prazo && t.prazo < h && !tarefaFechada(t)).sort((a, b) => a.prazo.localeCompare(b.prazo)));
  return '<div class="fila-com-atr">' + lado + '<div class="fila-cal-area"><div class="fila-cal-nav"><button type="button" class="btn btn-o btn-mini" data-fila-nav="-1" aria-label="Anterior">‹</button><b>' + esc(titulo) + '</b>' +
    '<button type="button" class="btn btn-o btn-mini" data-fila-nav="1" aria-label="Próximo">›</button><button type="button" class="btn btn-o btn-mini" data-fila-nav="0">Hoje</button>' +
    '<button type="button" class="btn btn-p btn-mini ag-bt" data-agendar>+ Agendar</button></div>' + corpo + legendaAgenda() + '</div></div>';
}
async function cardMinhaFila() {
  if (!FILA.lida) { const p = (E.perfil && E.perfil.preferencias && E.perfil.preferencias.fila) || {}; if (p.vista) FILA.vista = ['lista', 'semana', 'mes', 'dia'].includes(p.vista) ? p.vista : 'mes'; FILA.min = false; FILA.quem = p.quem || ''; FILA.pri = p.pri || ''; FILA.atalho = p.atalho || '';
    FILA.pessoas = Array.isArray(p.pessoas) ? p.pessoas : null; FILA.tipos = Array.isArray(p.tipos) ? p.tipos : null; FILA.lida = true; }
  await feriados();
  await equipe().catch(() => []);
  const ts = await q(sb.from('tarefas').select('*').not('status', 'in', '(concluida,cancelada)')).catch(() => []);
  // Backup 46: o que foi concluído nos últimos 60 dias aparece riscado no calendário
  const feitas = FILA.vista === 'lista' ? [] : await q(sb.from('tarefas').select('*').eq('status', 'concluida').not('prazo', 'is', null).gte('prazo', somarDias(hojeISO(), -60))).catch(() => []);
  // Backup 45: filtros que se marcam/desmarcam — pessoas (eu + quem está no mesmo nível ou abaixo) e tipos (reunião, audiência, compromisso, tarefa, rotina).
  // A tarefa aparece para o responsável, para quem participa e para quem valida (revisor).
  const visiveis = pessoasVisiveis(), chave = (n) => primeiroNome(n), eu = chave(meuNome());
  const okVis = new Set(visiveis.map(chave));
  let sel = (FILA.pessoas || [eu]).filter((k) => okVis.has(k)); if (!sel.length) sel = [eu];
  const tiposSel = new Set(FILA.tipos && FILA.tipos.length ? FILA.tipos : FILTRO_TIPOS_AG.map((x) => x[0]));
  const daPessoa = (t) => [t.responsavel, t.revisor].concat(String(t.participantes || '').split(',')).some((n) => n && sel.includes(chave(n))) && passaPriPrazo(t, FILA.pri, FILA.atalho);
  const todas = ordenarFila(ts.filter((t) => daPessoa(t) && tiposSel.has(tipoItemAgenda(t)) && !/^(cob|parc|aco):/.test(t.chave_regra || ''))), minhas = FILA.toda ? todas : todas.slice(0, 10);
  // Backup 51 (T2): as próximas ocorrências das tarefas que se repetem já aparecem no calendário (tracejadas)
  const proj = FILA.vista === 'lista' ? [] : await projecoesRecorrentes();
  const naAgenda = todas.concat(feitas.filter((t) => daPessoa(t) && tiposSel.has(tipoItemAgenda(t))), proj.filter((t) => daPessoa(t) && tiposSel.has(tipoItemAgenda(t))));
  const rotQuem = sel.length === 1 && sel[0] === eu ? 'suas' : sel.length >= okVis.size && okVis.size > 1 ? 'de todos' : sel.map((k) => nomeCurto(visiveis.find((n) => chave(n) === k) || k)).join(', ');
  const chip = (attr, v, rot, on) => chipFiltro(attr, v, rot, on, attr === 'data-fila-tipo');
  const [gUrg, gPrazo] = gruposPriPrazo('data-fila-pri', 'data-fila-prazo', FILA.pri, FILA.atalho);
  const filtros = '<div class="fila-filtros fila-2x2">' + filtros2x2(
    '<div class="fila-chips" role="group" aria-label="Mostrar"><span class="fila-chips-rot">Mostrar</span>' + chip('data-fila-tipo', '*', 'Tudo', tiposSel.size === FILTRO_TIPOS_AG.length) +
      FILTRO_TIPOS_AG.map(([k, r]) => chip('data-fila-tipo', k, r, tiposSel.has(k))).join('') + '</div>',
    (visiveis.length > 1 ? '<div class="fila-chips" role="group" aria-label="De quem"><span class="fila-chips-rot">De quem</span>' +
      // Backup 46: Todos primeiro, depois quem está logado, depois os demais
      chip('data-fila-pes', '*', 'Todos', sel.length >= okVis.size) + visiveis.map((n) => chip('data-fila-pes', chave(n), nomeCurto(n), sel.includes(chave(n)))).join('') + '</div>' : ''), gUrg, gPrazo) + '</div>';
  const html = '<div class="card ini-fila' + (FILA.min ? ' minimizada' : '') + '"><div class="card-hd">📋 Minha fila de trabalho ' + '<span class="sub">' + plural(todas.length, 'aberta', 'abertas') + ' · ' + esc(rotQuem) + '</span>' +
      '<div class="segmento ini-fila-vista" role="group" aria-label="Ver como">' + VISTAS_FILA.map(([v, r]) => '<button type="button" data-fila-vista="' + v + '"' + (FILA.vista === v ? ' class="ativo"' : '') + '>' + r + '</button>').join('') + '</div>' +
      '</div>' +   // Backup 39: sem "Minimizar" 
    (FILA.min ? '' : '<div class="card-bd">' + filtros + (FILA.vista === 'semana' ? '<div id="ini-semana"></div>' : FILA.vista !== 'lista' ? calendarioFila(naAgenda) :
    (minhas.length ? '<div class="lista-ficha fila-compacta">' + minhas.map((t) => '<div class="item-ficha clicavel" data-fila="' + t.id + '"><div>' + bolinha(t) + (t.tipo_agenda ? ' <i class="ag-cor ag-' + t.tipo_agenda + '"></i>' : '') + ' <b>' + (t.hora ? horaAg(t) : '') + esc(t.titulo) + '</b>' + seloPrazo(t) +
      '<div class="sub">' + (t.prazo ? 'prazo ' + dataBR(t.prazo) : 'sem prazo') + (t.prazo_fatal ? ' · ⚑ fatal ' + dataBR(t.prazo_fatal) : '') + (t.status === 'revisao' ? ' · aguardando revisão' : '') +
      (quemTarefa(t) ? ' · ' + esc(quemTarefa(t)) : '') + '</div></div>' +
      '<span class="pill ' + (PRIORIDADE[t.prioridade] || ['', 'neutro'])[1] + '">' + esc((PRIORIDADE[t.prioridade] || [t.prioridade])[0]) + '</span></div>').join('') + '</div>' +
      (todas.length > 10 ? '<div class="ini-fila-mais"><button type="button" class="btn btn-o btn-mini" data-fila-toda>' + (FILA.toda ? '▴ Mostrar só as 10 primeiras' : '▾ Ver todas (' + todas.length + ')') + '</button></div>' : '')
      : '<div class="sub">' + (FILA.quem ? 'Nenhuma tarefa aberta.' : 'Nenhuma tarefa com você.') + ' 🎉</div>')) + '</div>') + '</div>';
  const repinta = async (raiz) => { const c = await cardMinhaFila(); raiz.innerHTML = c.html; c.ligar(raiz); };
  return { html, ligar: (raiz) => {
    // Backup 46: a Lista fica da mesma altura do calendário (trocar Lista ↔ Mês não muda o tamanho do quadro)
    const bd = raiz.querySelector('.ini-fila > .card-bd');
    const medir = () => { if (bd && FILA.vista === 'mes' && bd.offsetHeight > 200) FILA.altCal = bd.offsetHeight; else if (bd && FILA.vista === 'semana' && FILA.altCal) bd.style.minHeight = FILA.altCal + 'px'; };
    // Backup 52 (C3): a Lista acompanha o conteúdo (com filtro e poucos itens, o quadro encolhe); com muitos, para na altura do calendário e rola por dentro
    if (bd) { if (FILA.vista !== 'lista') requestAnimationFrame(medir); else { bd.style.maxHeight = (FILA.altCal || 680) + 'px'; bd.style.overflowY = 'auto'; } }
    // Backup 52 (C1): Semana = a mesma de Tarefas → Calendário (arrastar remarca o prazo)
    const sem = raiz.querySelector('#ini-semana');
    if (sem) semanaArrastavel(sem, { lista: todas, estado: FILA, atrasadas: true, cartao: false, rotulo: rotQuem, altura: FILA.altCal ? FILA.altCal - 90 : 600,
      abrir: (t) => abrirTarefa(t, () => irPara(E.tela)), repintar: () => repinta(raiz) });
    raiz.querySelectorAll('[data-fila]').forEach((d) => { if (d.closest('#ini-semana')) return; d.onclick = () => {
      abrirTarefa(ts.find((t) => t.id === d.dataset.fila), () => irPara(E.tela)); }; });
    raiz.querySelectorAll('[data-fila-tipo]').forEach((b) => b.onclick = () => { const v = b.dataset.filaTipo, todos = FILTRO_TIPOS_AG.map((x) => x[0]);
      let t = new Set(tiposSel); if (v === '*') t = t.size === todos.length ? new Set() : new Set(todos); else if (t.has(v)) t.delete(v); else t.add(v);
      FILA.tipos = t.size ? [...t] : []; if (!t.size) FILA.tipos = ['__nada']; salvarPrefFila(); repinta(raiz); });
    raiz.querySelectorAll('[data-fila-pri]').forEach((b) => b.onclick = () => { FILA.pri = FILA.pri === b.dataset.filaPri ? '' : b.dataset.filaPri; salvarPrefFila(); repinta(raiz); });
    raiz.querySelectorAll('[data-fila-prazo]').forEach((b) => b.onclick = () => { FILA.atalho = FILA.atalho === b.dataset.filaPrazo ? '' : b.dataset.filaPrazo; salvarPrefFila(); repinta(raiz); });
    raiz.querySelectorAll('[data-fila-pes]').forEach((b) => b.onclick = () => { const v = b.dataset.filaPes;
      let p = new Set(sel); if (v === '*') p = p.size >= okVis.size ? new Set([eu]) : new Set(okVis); else if (p.has(v)) p.delete(v); else p.add(v);
      FILA.pessoas = p.size ? [...p] : [eu]; salvarPrefFila(); repinta(raiz); });
    const bt = raiz.querySelector('[data-fila-toda]'); if (bt) bt.onclick = () => { FILA.toda = !FILA.toda; repinta(raiz); };
    raiz.querySelectorAll('[data-fila-vista]').forEach((b) => b.onclick = () => { medir(); FILA.vista = b.dataset.filaVista; FILA.min = false; FILA.ref = null; salvarPrefFila(); repinta(raiz); });
    raiz.querySelectorAll('[data-agendar]').forEach((b) => b.onclick = () => janelaAgendar(FILA.vista === 'dia' ? (FILA.ref || hojeISO()) : hojeISO(), () => repinta(raiz)));
    raiz.querySelectorAll('[data-ag-dia]').forEach((d) => d.addEventListener('click', (ev) => { if (ev.target.closest('[data-fila]')) return; janelaAgendar(d.dataset.agDia, () => repinta(raiz)); }));
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
  const d = diasAte(t.prazo_fatal), u = tarefaFechada(t) ? null : uteisAte(t.prazo_fatal, E._feriados || new Set());
  const falta = u == null ? '' : u < 0 ? ' · vencido' : u === 0 ? ' · hoje!' : ' · faltam ' + u + ' dia(s) útil(eis)';
  return ' <span class="pill ' + (tarefaFechada(t) ? 'neutro' : d <= 2 ? 'vencido' : 'cobranca') + '" title="Prazo fatal (contagem em dias úteis, com os feriados cadastrados)">⚑ ' + dataBR(t.prazo_fatal) + falta + '</span>';
}
// Backup 39: cliente, grupo ou o "com quem" livre da agenda
// pessoas dos filtros: quem está cadastrado (Administração → Usuários); sem cadastro ainda, as de sempre
function pessoasFiltro() { const eq = (E._equipe || []).map((u) => String(u.nome || '').trim()).filter(Boolean); return eq.length ? [...new Set(eq)] : Object.keys(PESSOA); }
function quemTarefa(t) { return nomeCliente(t.cliente_id) || nomeGrupo(t.grupo_id) || (t.com_quem || ''); }
function nomeCliente(id) { const c = E.clientes.find((x) => x.id === id); return c ? c.nome : ''; }

// ─────────────────────────── tela ───────────────────────────
TELAS.tarefas = async function () {
  await equipe().catch(() => []);
  vigiarAgenda();
  E.tf = E.tf || { vista: 'lista', atalho: '', resp: '', pri: '', busca: '', mes: hojeISO().slice(0, 7) };
  const F = E.tf;
  // abas: o painel mostra só o que está em aberto; concluídas e excluídas ficam separadas
  F.aba = F.aba || 'abertas'; if (F.atalho === 'abertas' || F.atalho === 'concluidas') F.atalho = '';
  // Backup 49: Minha semana virou a vista Semana do Calendário; o Quadro saiu (repetia a Lista)
  if (F.vista === 'semana') { F.vista = 'calendario'; F.calVista = 'semana'; }
  if (F.vista === 'kanban') F.vista = 'lista';
  if (F.atalho === 'minhas') F.atalho = '';
  $('conteudo').innerHTML =
    // Backup 49: abas junto do título; só "+ Nova tarefa" e "Fluxo" à vista — o resto no ⚙ (Backup 55: a criação rápida ⚡ saiu)
    '<div class="titulo-pag"><div><h1>Tarefas</h1><div class="segmento tf-abas-seg" id="tf-abas">' + [['abertas', 'Em aberto'], ['concluidas', 'Concluídas'], ['excluidas', 'Excluídas']]
      .map(([v, r]) => '<button data-aba="' + v + '">' + r + '</button>').join('') + '</div></div>' +
    '<div class="acoes">' +
    '<span class="tf-cfg-wrap"><button class="btn btn-o tf-bt-ic" id="tf-config" title="Configurar: modelos de fluxo, feriados, Google Agenda e novo fluxo" aria-expanded="false">⚙</button>' +
      '<span class="tf-cfg-menu" id="tf-cfg-menu" hidden><button class="btn btn-o" id="tf-modelos">Modelos de fluxo</button>' +
      '<button class="btn btn-o" id="tf-feriados">Feriados</button><button class="btn btn-o" id="tf-agenda" title="Prazos fatais e audiências no seu Google Agenda">📅 Google Agenda</button></span></span>' +
    // Backup 54: "Delegar" saiu daqui — virou o botão "Fluxo" (as sequências com validação, como "Lead completo", estão na lista de modelos do fluxo)
    '<button class="btn btn-o" id="tf-fluxo" title="Cria várias tarefas de uma vez a partir de um modelo (inclui as sequências com validação, ex.: Lead completo)">🔀 Fluxo</button><button class="btn btn-p" id="tf-nova">+ Nova tarefa</button></div></div>' +
    '<div id="tf-kpis"></div><div class="filtros">' +
    '<div class="segmento" id="tf-vista">' + [['lista', 'Lista'], ['calendario', 'Calendário'], ['fluxos', 'Fluxos']]
      .map(([v, r]) => '<button data-v="' + v + '">' + r + '</button>').join('') + '</div>' +
    '<input class="busca" id="tf-busca" placeholder="Buscar tarefa, cliente, processo ou etiqueta" autocomplete="off">' +
    // Backup 48/49: Mostrar (tipo, prioridade e prazo) e De quem — o mesmo desenho da agenda do Início
    '</div><div class="fila-filtros tf-filtros" id="tf-chips"></div><div id="tf-corpo"><div class="carregando">Carregando…</div></div>';
  $('tf-nova').onclick = () => formTarefa({}, () => TELAS.tarefas());
  $('tf-config').onclick = (ev) => { ev.stopPropagation(); const m = $('tf-cfg-menu'); m.hidden = !m.hidden; $('tf-config').setAttribute('aria-expanded', String(!m.hidden)); };
  if (!window._tfCfgDoc) { window._tfCfgDoc = true; document.addEventListener('click', (ev) => { const m = $('tf-cfg-menu'); if (m && !m.hidden && !ev.target.closest('.tf-cfg-wrap')) m.hidden = true; }); }
  $('tf-cfg-menu').addEventListener('click', () => { setTimeout(() => { const m = $('tf-cfg-menu'); if (m) m.hidden = true; }, 0); });
  $('tf-fluxo').onclick = () => formNovoFluxo(() => TELAS.tarefas());
  $('tf-modelos').onclick = () => janelaModelos();
  $('tf-feriados').onclick = () => janelaFeriados();
  $('tf-agenda').onclick = () => janelaAgenda();
  $('tf-vista').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.vista = b.dataset.v; pintarTarefas(); } };
  $('tf-abas').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { F.aba = b.dataset.aba; pintarTarefas(); } };
  $('tf-chips').onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.tfTipo != null) F.tipos = alternarFiltro(F.tipos || FILTRO_TIPOS_AG.map((x) => x[0]), b.dataset.tfTipo, FILTRO_TIPOS_AG.map((x) => x[0]));
    else if (b.dataset.tfPri != null) F.pri = F.pri === b.dataset.tfPri ? '' : b.dataset.tfPri;
    else if (b.dataset.tfPrazo != null) F.atalho = F.atalho === b.dataset.tfPrazo ? '' : b.dataset.tfPrazo;
    else { const todos = pessoasFiltro().map(primeiroNome); F.pessoas = alternarFiltro(F.pessoas && F.pessoas.length ? F.pessoas : todos, b.dataset.tfPes, todos); if (!F.pessoas.length) F.pessoas = [primeiroNome(meuNome())]; }
    pintarTarefas(); };
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
    else if (F.aba === 'excluidas') { if (t.status !== 'cancelada' || String(t.atualizado_em || '') < somarDias(hojeISO(), -90)) return false; }   // mais de 90 dias: só no histórico
    else if (tarefaFechada(t)) return false;
    const a = F.aba === 'abertas' ? F.atalho : '';
    if (a === 'minhas' && (tarefaFechada(t) || !ehMinha(t))) return false;
    if (a === 'hoje' && (tarefaFechada(t) || !t.prazo || t.prazo > h)) return false;
    if (a === 'atrasadas' && (tarefaFechada(t) || !t.prazo || t.prazo >= h)) return false;
    if (a === '7' && (tarefaFechada(t) || !t.prazo || t.prazo > somarDias(h, 7))) return false;
    // "pedem atenção" (destaque do Início): minhas atrasadas ou com prazo fatal em até 7 dias
    if (a === 'atencao' && (tarefaFechada(t) || !ehMinha(t) || !((t.prazo && t.prazo < h) || (t.prazo_fatal && t.prazo_fatal <= somarDias(h, 7))))) return false;
    if (F.tipos && !F.tipos.includes(tipoItemAgenda(t))) return false;
    if (F.pessoas && F.pessoas.length && ![t.responsavel, t.revisor].concat(String(t.participantes || '').split(',')).some((n) => n && F.pessoas.includes(primeiroNome(n)))) return false;
    if (F.pri && t.prioridade !== F.pri) return false;
    if (b && !normalizar(t.titulo + ' ' + t.processos_vinculados + ' ' + nomeGrupo(t.grupo_id) + ' ' + nomeCliente(t.cliente_id) + ' ' + t.etiquetas + ' ' + t.descricao).includes(b)) return false;
    return true;
  });
}

function pintarTarefas() {
  const F = E.tf, h = hojeISO();
  document.querySelectorAll('#tf-vista button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === F.vista));
  document.querySelectorAll('#tf-abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === F.aba));
  // Backup 48: filtros em botões que se marcam/desmarcam (iguais aos da agenda do Início); pessoas: Todos, eu, depois os outros
  { const tipos = FILTRO_TIPOS_AG.map((x) => x[0]), tSel = new Set(F.tipos || tipos), eu = primeiroNome(meuNome());
    const pes = pessoasFiltro().slice().sort((a, b) => (primeiroNome(b) === eu) - (primeiroNome(a) === eu) || a.localeCompare(b, 'pt-BR'));
    const pSel = new Set(F.pessoas && F.pessoas.length ? F.pessoas : pes.map(primeiroNome)), todasP = pSel.size >= pes.length;
    const prazos = [['hoje', 'Hoje'], ['atrasadas', 'Atrasadas'], ['7', '7 dias']].concat(F.atalho === 'atencao' ? [['atencao', 'Pedem atenção']] : []);
    const [gUrg, gPrazo] = gruposPriPrazo('data-tf-pri', F.aba === 'abertas' && F.vista !== 'fluxos' ? 'data-tf-prazo' : '', F.pri, F.atalho, prazos.slice(3));
    $('tf-chips').classList.add('fila-2x2');
    $('tf-chips').innerHTML = filtros2x2('<div class="fila-chips" role="group" aria-label="Mostrar"><span class="fila-chips-rot">Mostrar</span>' +
        chipFiltro('data-tf-tipo', '*', 'Tudo', tSel.size === tipos.length, true) + FILTRO_TIPOS_AG.map(([k, r]) => chipFiltro('data-tf-tipo', k, r, tSel.has(k), true)).join('') + '</div>',
      (pes.length > 1 ? '<div class="fila-chips" role="group" aria-label="De quem"><span class="fila-chips-rot">De quem</span>' +
        chipFiltro('data-tf-pes', '*', 'Todos', todasP) + pes.map((n) => chipFiltro('data-tf-pes', primeiroNome(n), nomeCurto(n), pSel.has(primeiroNome(n)))).join('') + '</div>' : ''), gUrg, gPrazo); }
  const todas = E._tarefas || [];
  const abertas = todas.filter((t) => !tarefaFechada(t));
  const atrasadas = abertas.filter((t) => t.prazo && t.prazo < h).length;
  const fatais = abertas.filter((t) => t.prazo_fatal && t.prazo_fatal >= h && t.prazo_fatal <= somarDias(h, 7)).length;
  const minhas = abertas.filter(ehMinha).length;
  const kpis = '<div class="kpis">' + kpi('Em aberto', String(abertas.length), '', minhas + ' comigo') +
    kpi('Atrasadas', String(atrasadas), atrasadas ? 'vermelho' : 'verde', 'todas as pessoas') +
    kpi('Prazos fatais em 7 dias', String(fatais), fatais ? 'ambar' : '', 'tarefas com prazo fatal marcado') +
    kpi('Concluídas no mês', String(todas.filter((t) => t.status === 'concluida' && String(t.concluida_em || '').slice(0, 7) === h.slice(0, 7)).length), 'verde', '') + '</div>';
  const V = { lista: vistaLista, calendario: vistaCalendario, fluxos: vistaFluxos };
  $('tf-kpis').innerHTML = kpis; $('tf-corpo').innerHTML = '<div id="tf-vista-corpo"></div>';
  if (!V[F.vista]) F.vista = 'lista';
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
    // Backup 23: Grupo · Tarefa · Pessoa · Prioridade · Status · Prazo
    const cli = t.cliente_id ? (E.clientes || []).find((c) => c.id === t.cliente_id) : null;
    const grupo = nomeGrupo(t.grupo_id || (cli && cli.grupo_id)) || '';
    const sub = [pai ? 'parte de: ' + pai : '', cli ? nomeCliente(t.cliente_id) : '', t.processos_vinculados, t.etiquetas].filter(Boolean).join(' · ');
    return '<tr class="clicavel' + (tarefaFechada(t) ? ' tf-feita' : '') + '" data-abrir-t="' + t.id + '"><td>' + (grupo ? esc(grupo) : '<span class="sub">—</span>') + '</td>' +
      '<td style="padding-left:' + (12 + nivel * 22) + 'px">' + bolinha(t) + ' ' + (nivel ? '<span class="sub">↳ </span>' : '') + esc(t.titulo) + seloFatal(t) +
      (t.recorrencia ? ' <span class="pill neutro tf-repete" title="' + esc(textoRepete(t)) + '">' + esc(textoRepete(t)) + '</span>' : '') +
      // Backup 55: o progresso do fluxo vai na linha de baixo, junto do cliente (a tarefa ocupa no máximo 2 linhas)
      ((sub || progresso(t, filhas)) ? '<div class="sub tf-linha2">' + barraProgresso(progresso(t, filhas)) + (sub ? ' ' + esc(sub) : '') + '</div>' : '') + '</td>' +
      '<td>' + pillPessoa(t.responsavel) + '</td><td><span class="pill ' + pr[1] + '">' + esc(pr[0]) + '</span></td><td>' + pillStatusTarefa(t.status) + '</td>' +
      // Backup 50: Prazo e Dias em colunas separadas (como no Financeiro)
      '<td class="mono" data-ord="' + esc(t.prazo || '9999') + '">' + (t.prazo ? dataBR(t.prazo) : '<span class="sub">—</span>') + '</td>' +
      '<td data-ord="' + (t.prazo && !tarefaFechada(t) ? diasAte(t.prazo) : 99999) + '">' + (t.prazo && !tarefaFechada(t) ? celulaAtraso(t.prazo) : '<span class="sub">—</span>') + '</td>' +
      '<td class="acoes-l">' + (t.status === 'cancelada'
        ? '<button class="btn btn-o btn-mini" data-restaurar-t="' + t.id + '">↩ Restaurar</button>' + ((E.perfil || {}).papel === 'admin' ? ' <button class="btn btn-x btn-mini" data-apagar-t="' + t.id + '">Excluir de vez</button>' : '')
        : (tarefaFechada(t) ? '' : '<button class="btn btn-v btn-mini" data-concluir="' + t.id + '">✓ Concluir</button>')) + '</td></tr>' +   // Backup 39: sem ✎ (editar fica no detalhe)
      filhas.filter((f) => ids.has(f.id)).map((f) => linha(f, nivel + 1)).join('');
  };
  alvo.innerHTML = '<div class="card">' + (raizes.length ? '<div class="tabela-wrap"><table><thead><tr><th>Grupo</th><th>Tarefa</th><th>Pessoa</th><th>Prioridade</th><th>Status</th><th data-tipo="data">Prazo</th><th data-tipo="num">Dias</th><th class="sem-ordem"></th></tr></thead><tbody>' +
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
        '<div class="sub">' + esc(quemTarefa(t) || '') + '</div>' +
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
async function vistaCalendario(raiz) {
  // Backup 49: Calendário com Mês · Semana · Dia (a "Minha semana" de arrastar virou a Semana daqui; o Início ficou só com Lista e Mês)
  const F = E.tf; F.calVista = F.calVista || 'mes';
  raiz.innerHTML = '<div class="segmento tf-cal-vista" id="tf-cal-vista">' + [['mes', 'Mês'], ['semana', 'Semana'], ['dia', 'Dia']]
    .map(([v, r]) => '<button type="button" data-cal-v="' + v + '"' + (F.calVista === v ? ' class="ativo"' : '') + '>' + r + '</button>').join('') + '</div><div id="tf-cal-corpo"></div>';
  raiz.querySelector('#tf-cal-vista').onclick = (ev) => { const b = ev.target.closest('[data-cal-v]'); if (b) { F.calVista = b.dataset.calV; pintarTarefas(); } };
  const alvo = raiz.querySelector('#tf-cal-corpo');
  if (F.calVista === 'semana') return vistaSemana(alvo);
  // Backup 39: o MESMO calendário do Início (quadro Atrasadas, cores da legenda, sem cinza depois do último dia); clicar abre o detalhe
  await feriados();
  const dia = F.calVista === 'dia';
  F.dia = F.dia || hojeISO();
  const salvo = { vista: FILA.vista, ref: FILA.ref };
  FILA.vista = dia ? 'dia' : 'mes'; FILA.ref = dia ? F.dia : F.mes + '-01';
  // Backup 40: em "Em aberto" as concluídas do mês também aparecem, riscadas
  const filtradas = filtrarTarefas(), idsF = new Set(filtradas.map((t) => t.id));
  // Backup 51 (T2): as próximas ocorrências (tracejadas) das tarefas que se repetem e estão na lista filtrada
  const proj = F.aba === 'abertas' ? (await projecoesRecorrentes()).filter((x) => idsF.has(x.id)) : [];
  const pre = dia ? F.dia : F.mes + '-', lista = filtradas.concat(F.aba === 'abertas' ? (E._tarefas || []).filter((t) => t.status === 'concluida' && String(t.prazo || '').startsWith(pre)) : [], proj);
  alvo.innerHTML = '<div class="card ini-fila tf-cal"><div class="card-bd">' + calendarioFila(lista) + '</div></div>';
  FILA.vista = salvo.vista; FILA.ref = salvo.ref;
  // Backup 53: a Semana fica do mesmo tamanho do Mês (guarda a altura do calendário do mês)
  if (!dia) requestAnimationFrame(() => { const c = alvo.querySelector('.tf-cal'); if (c && c.offsetHeight > 300) F.altCal = c.offsetHeight; });
  const [a, m] = F.mes.split('-').map(Number);
  alvo.querySelectorAll('[data-fila-nav]').forEach((b) => b.onclick = () => {
    const n = +b.dataset.filaNav;
    if (dia) { F.dia = n ? somarDias(F.dia, n) : hojeISO(); return pintarTarefas(); }
    const d = n ? new Date(a, m - 1 + n, 1) : new Date();
    F.mes = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); pintarTarefas(); });
  alvo.querySelectorAll('[data-fila]').forEach((d) => d.onclick = () => abrirTarefa(E._tarefas.find((t) => t.id === d.dataset.fila), recarregarTarefas));
  alvo.querySelectorAll('[data-agendar]').forEach((b) => b.onclick = () => janelaAgendar(hojeISO(), recarregarTarefas));
  alvo.querySelectorAll('[data-ag-dia]').forEach((d) => d.addEventListener('click', (ev) => { if (ev.target.closest('[data-fila]')) return; janelaAgendar(d.dataset.agDia, recarregarTarefas); }));
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
  procur: 'Automação: processo sem procuração', pub: 'Automação: publicação', esc: 'Automação: escalada de atraso',
  reuniao: 'Reunião agendada', deleg: 'Delegação (sequência de passos)', 'crm-contrato': 'CRM: contrato fechado' };
async function abrirTarefa(t, depois) {
  if (!t) return;
  if (typeof t === 'string') t = (await q(sb.from('tarefas').select('*').eq('id', t)))[0];
  if (!t) return aviso('Tarefa não encontrada (pode ter sido excluída).', true);
  await equipe().catch(() => []);
  const [subs, coms] = await Promise.all([q(sb.from('tarefas').select('*').eq('tarefa_pai_id', t.id).order('prazo', { nullsFirst: false })).catch(() => []),
    q(sb.from('comentarios').select('texto, criado_em').eq('tarefa_id', t.id).order('criado_em', { ascending: false }).limit(8)).catch(() => [])]);
  const souRevisor = t.status === 'revisao' && (E.perfil.papel === 'admin' || (t.revisor && primeiroNome(t.revisor) === primeiroNome(E.perfil.nome || '')));
  const pr = PRIORIDADE[t.prioridade] || [t.prioridade || '—', 'neutro'];
  const ck = Array.isArray(t.checklist) ? t.checklist : [];
  const origem = t.chave_regra ? (ORIGEM_REGRA[String(t.chave_regra).split(':')[0]] || 'Automação') : t.fluxo_id ? 'Fluxo de trabalho' : 'Criada à mão';
  const linha = (rot, val) => val ? '<div class="tf-lin"><span>' + rot + '</span><div>' + val + '</div></div>' : '';
  const fechada = tarefaFechada(t);
  const j = abrirJanela({ titulo: 'Tarefa', larga: true,
    corpo: '<div class="tf-ficha">' +
      '<div class="tf-ficha-hd"><h3>' + bolinha(t) + ' ' + esc(t.titulo) + '</h3><div class="tf-selos">' + pillStatusTarefa(t.status) + ' <span class="pill ' + pr[1] + '">' + esc(pr[0]) + '</span>' + seloPrazo(t) + seloFatal(t) + '</div></div>' +
      '<div class="tf-grade">' +
        linha(t.tipo_agenda ? 'Dia' : 'Prazo', t.prazo ? dataBR(t.prazo) + (t.hora ? ' · <b>' + esc(horaFaixa(t)) + '</b>' : '') : '<span class="sub">sem prazo</span>') +
        linha('Tipo', t.tipo_agenda ? esc((TIPOS_AGENDA.find(([k]) => k === t.tipo_agenda) || [, t.tipo_agenda])[1]) : '') +
        linha('Local', esc(t.local || '')) +
        linha('Aviso', [[t.aviso_min, t.aviso_em], [t.aviso2_min, t.aviso2_em]].filter(([m]) => m != null).map(([m, em]) => esc((AVISOS_AGENDA.find(([v]) => +v === m) || [, m + ' min antes'])[1]) + (em ? ' <span class="sub">· enviado</span>' : '')).join(' e ')) +
        linha('Prazo fatal', t.prazo_fatal ? '<b>' + dataBR(t.prazo_fatal) + '</b>' : '') +
        linha('Cliente', esc(quemTarefa(t) || '')) +
        linha('Responsável', pillPessoa(t.responsavel)) +
        linha('Participantes', String(t.participantes || '').split(',').map((x) => x.trim()).filter(Boolean).map(pillPessoa).join(' ')) +
        linha('Revisor', t.exige_revisao || t.revisor ? pillPessoa(t.revisor) : '') +
        linha('Processos', esc(t.processos_vinculados || '')) +
        linha('Origem', esc(origem)) +
        linha('Repete', t.recorrencia ? '<span class="tf-repete">' + esc(textoRepete(t)) + '</span>' : '') +
      '</div>' +
      (t.descricao ? '<div class="tf-bloco"><div class="secao">O que fazer</div><div class="tf-texto">' + esc(t.descricao).replace(/\n/g, '<br>') + '</div></div>' : '') +
      (t.obs ? '<div class="tf-bloco"><div class="secao">Observação</div><div class="tf-texto">' + esc(t.obs).replace(/\n/g, '<br>') + '</div></div>' : '') +
      (ck.length ? '<div class="tf-bloco"><div class="secao">Checklist · ' + ck.filter((c) => c.feito).length + '/' + ck.length + '</div>' +
        ck.map((c) => '<div class="tf-ck' + (c.feito ? ' feito' : '') + '">' + (c.feito ? '☑' : '☐') + ' ' + esc(c.texto) + '</div>').join('') + '</div>' : '') +
      (subs.length ? '<div class="tf-bloco"><div class="secao">Subtarefas</div><div class="lista-ficha">' + subs.map((x) => '<div class="item-ficha clicavel' + (tarefaFechada(x) ? ' feita' : '') + '" data-ficha-sub="' + x.id + '"><div><b>' + esc(x.titulo) + '</b> ' + seloPrazo(x) +
        '<div class="sub">' + (x.prazo ? 'até ' + dataBR(x.prazo) : 'sem prazo') + ' · ' + esc(x.responsavel || '—') + ' · ' + esc(STATUS_TAREFA[x.status]) + '</div></div></div>').join('') + '</div></div>' : '') +
      (coms.length ? '<div class="tf-bloco"><div class="secao">Comentários</div>' + coms.map((c) => '<div class="tf-com"><span class="sub">' + dataHoraBR(c.criado_em) + '</span> ' + esc(c.texto) + '</div>').join('') + '</div>' : '') +
      (t.status === 'aguardando' && t.depende_de ? '<div class="dica" style="margin-top:10px">⏳ Este passo começa quando o anterior for concluído' + (t.exige_revisao ? '' : ' (e aprovado, se precisar de validação)') + '.</div>' : '') +
      '</div>',
    rodape: '<button class="btn btn-o" type="button" id="tf-f-editar">✎ Editar</button><div class="acoes">' +
      (fechada ? '' : (t.recorrencia && t.prazo ? '<button class="btn btn-o" type="button" id="tf-f-pular" title="Esta vez não precisa: a tarefa passa para a próxima data">⏭ Pular esta vez</button>' : '') +
        '<button class="btn btn-o" type="button" id="tf-f-sub">+ Subtarefa</button><button class="btn btn-o" type="button" id="tf-f-enc">↪ Encaminhar</button>' +
        (souRevisor ? '<button class="btn btn-x" type="button" id="tf-f-devolver">↩ Devolver</button><button class="btn btn-v" type="button" id="tf-f-aprovar">✓ Aprovar</button>'
          : '<button class="btn btn-v" type="button" id="tf-f-ok">✓ Concluir</button>')) + '</div>' });
  const bAp = j.querySelector('#tf-f-aprovar'), bDv = j.querySelector('#tf-f-devolver');
  if (bAp) bAp.onclick = () => comBotao(bAp, async () => { await q(sb.rpc('tarefa_validar', { p_tarefa: t.id, p_aprovar: true, p_comentario: '' })); aviso('✓ Aprovado: o próximo passo foi liberado.'); fecharJanela(j); await (depois || recarregar)(); });
  if (bDv) bDv.onclick = () => janelaDevolver(t, async () => { fecharJanela(j); await (depois || recarregar)(); });
  const depois2 = async () => { await (depois || recarregar)(); };
  j.querySelector('#tf-f-editar').onclick = () => { fecharJanela(j); formTarefa(t, depois); };
  j.querySelectorAll('[data-ficha-sub]').forEach((d) => d.onclick = () => { fecharJanela(j); abrirTarefa(subs.find((x) => x.id === d.dataset.fichaSub), depois); });
  const bp = j.querySelector('#tf-f-pular');
  if (bp) bp.onclick = () => comBotao(bp, async () => {
    if (t.recorrencia_serie && t.recorrencia_regra) {   // Backup 51: na série, pular = cancelar só esta ocorrência
      await q(sb.from('tarefas').update({ status: 'cancelada' }).eq('id', t.id));
      await sb.from('comentarios').insert({ tarefa_id: t.id, texto: '⏭ Pulada a ocorrência de ' + dataBR(t.prazo) }).then(() => {}, () => {});
      esquecerProjecoes(); aviso('⏭ Pulada. As próximas continuam (' + textoRepete(t) + ').'); fecharJanela(j); return depois2(); }
    const mais = (d) => { if (!d) return null; const x = new Date(d + 'T12:00:00');
      if (t.recorrencia === 'semanal') x.setDate(x.getDate() + 7); else if (t.recorrencia === 'mensal') x.setMonth(x.getMonth() + 1); else x.setFullYear(x.getFullYear() + 1); return iso(x); };
    const d = { prazo: mais(t.prazo), prazo_fatal: mais(t.prazo_fatal), checklist: (Array.isArray(t.checklist) ? t.checklist : []).map((c) => ({ texto: c.texto, feito: false })) };
    await q(sb.from('tarefas').update(d).eq('id', t.id));
    await sb.from('comentarios').insert({ tarefa_id: t.id, texto: '⏭ Pulada a ocorrência de ' + dataBR(t.prazo) }).then(() => {}, () => {});
    aviso('⏭ Pulada. Próxima em ' + dataBR(d.prazo) + '.'); fecharJanela(j); await depois2();
  });
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

// ═══ Backup 51 (T1–T3): regra de repetição — "toda segunda", "dias 5 e 20", "5º dia útil", "última sexta"… ═══
// A regra fica em tarefas.recorrencia_regra (jsonb). As datas certas são calculadas no banco (recorrencia_datas) — aqui há uma cópia
// fiel só para a prévia do formulário (o teste erp.js confere que as duas dão as mesmas datas).
const DIAS_SEM_ISO = ['', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
const DIAS_SEM_CURTO = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const ORDENS_SEM = [[1, '1ª'], [2, '2ª'], [3, '3ª'], [4, '4ª'], [-1, 'última']];
// Backup 53: atalhos "Todo dia útil" e "Quinzenal (a cada 2 semanas)" — viram a mesma regra semanal (dias de seg a sex / a cada 2 semanas)
const TIPOS_REPETE = [['', 'Não repete'], ['uteis', 'Todo dia útil (seg a sex)'], ['semanal', 'Toda semana, nos dias…'], ['quinzenal', 'Quinzenal (a cada 2 semanas)'], ['semanas', 'A cada N semanas'], ['mensal_dias', '2× ao mês, nos dias…'], ['mensal', 'Todo mês'], ['anual', 'Todo ano']];
const isoDow = (d) => { const x = new Date(d + 'T12:00:00').getDay(); return x === 0 ? 7 : x; };
const fimDoMesIso = (d) => { const x = new Date(d + 'T12:00:00'); return iso(new Date(x.getFullYear(), x.getMonth() + 1, 0)); };
function listaE(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1]; }
// a regra "efetiva": a nova ou a antiga (semanal / mensal / anual a partir do prazo) — igual a regra_da_tarefa() do banco
function regraDaTarefa(t) {
  if (!t) return null;
  if (t.recorrencia_regra && t.recorrencia_regra.tipo) return t.recorrencia_regra;
  if (!t.prazo) return null;
  const [, m, d] = t.prazo.split('-').map(Number);
  if (t.recorrencia === 'semanal') return { tipo: 'semanal', dias: [isoDow(t.prazo)], inicio: t.prazo };
  if (t.recorrencia === 'mensal') return { tipo: 'mensal', modo: 'dia', dia: d, inicio: t.prazo };
  if (t.recorrencia === 'anual') return { tipo: 'anual', mes: m, dia: d, inicio: t.prazo };
  return null;
}
// por extenso: "toda segunda, a partir de 13/10"
function textoRegra(r) {
  if (!r || !r.tipo) return '';
  const dm = (d) => { const s = dataBR(d); return d && d.slice(0, 4) === hojeISO().slice(0, 4) ? s.slice(0, 5) : s; };
  const toda = (dw) => (dw >= 6 ? 'todo ' : 'toda ');
  const dias = (r.dias || []).map(Number).filter(Boolean).sort((a, b) => a - b);
  let t = '';
  if (r.tipo === 'semanal' && (Number(r.cada) || 1) > 1) t = 'a cada ' + r.cada + ' semanas, ' + (dias[0] >= 6 ? 'no ' : 'na ') + listaE(dias.map((x) => DIAS_SEM_ISO[x]));
  else if (r.tipo === 'semanal') t = toda(dias[0]) + listaE(dias.map((x) => DIAS_SEM_ISO[x]));
  else if (r.tipo === 'mensal_dias') t = dias.length + '× ao mês, nos dias ' + listaE(dias.map(String));
  else if (r.tipo === 'mensal' && r.modo === 'util') t = 'todo mês no ' + (Number(r.n) || 1) + 'º dia útil';
  else if (r.tipo === 'mensal' && r.modo === 'semana') { const dw = Number(r.dow) || 5, o = Number(r.ordem) || 1;
    t = toda(dw) + (o === -1 ? (dw >= 6 ? 'último ' : 'última ') : (ORDENS_SEM.find(([k]) => k === o) || [, o + 'ª'])[1].replace('ª', dw >= 6 ? 'º' : 'ª') + ' ') + DIAS_SEM_ISO[dw] + ' do mês'; }
  else if (r.tipo === 'mensal') t = 'todo mês no dia ' + (Number(r.dia) || 1);
  else if (r.tipo === 'anual') t = 'todo ano em ' + String(Number(r.dia) || 1).padStart(2, '0') + '/' + String(Number(r.mes) || 1).padStart(2, '0');
  if (r.inicio) t += ', a partir de ' + dm(r.inicio);
  if (r.fim) t += ', até ' + dataBR(r.fim);
  if (r.util) t += ' (se cair em feriado ou fim de semana, no dia útil seguinte)';
  return t;
}
function textoRepete(t) { const r = regraDaTarefa(t); return r ? '↻ ' + textoRegra(r) : (t && t.recorrencia ? '↻ ' + t.recorrencia : ''); }
// as datas da regra entre de e ate (cópia de recorrencia_datas do banco)
function datasRegra(r, de, ate, fer) {
  if (!r || !r.tipo || ate < de) return [];
  fer = fer || E._feriados || new Set();
  const ini = r.inicio || de, fim = r.fim || null, cada = Math.max(1, Number(r.cada) || 1), dias = (r.dias || []).map(Number);
  const semana0 = somarDias(ini, -(isoDow(ini) - 1)), out = [];
  const util = (d) => diaUtil(d, fer);
  if (r.tipo === 'mensal' && r.modo === 'util') {
    let m = (de > ini ? somarDias(de, -10) : ini).slice(0, 7) + '-01';
    if (m < ini.slice(0, 7) + '-01') m = ini.slice(0, 7) + '-01';
    for (let k = 0; k < 600 && m <= ate; k++) { let n = 0, d = m, achou = null; const f = fimDoMesIso(m);
      while (d <= f) { if (util(d) && ++n === Math.max(1, Number(r.n) || 1)) { achou = d; break; } d = somarDias(d, 1); }
      if (achou) out.push(achou); const x = new Date(m + 'T12:00:00'); x.setMonth(x.getMonth() + 1); m = iso(x); }
  } else {
    let d = somarDias(de, -10) > ini ? somarDias(de, -10) : ini;
    for (let k = 0; k < 4000 && d <= ate; k++, d = somarDias(d, 1)) {
      const ult = Number(fimDoMesIso(d).slice(8)), dia = Number(d.slice(8)), mes = Number(d.slice(5, 7)), dw = isoDow(d);
      let ok = false;
      if (r.tipo === 'semanal') ok = dias.includes(dw) && (Math.round((new Date(d + 'T12:00:00') - new Date(semana0 + 'T12:00:00')) / 864e5 / 7) % cada) === 0;
      else if (r.tipo === 'mensal_dias') ok = dias.some((z) => Math.min(z, ult) === dia);
      else if (r.tipo === 'mensal' && (r.modo || 'dia') === 'dia') ok = Math.min(Math.max(1, Number(r.dia) || 1), ult) === dia;
      else if (r.tipo === 'mensal' && r.modo === 'semana') { const o = Number(r.ordem) || 1; ok = dw === (Number(r.dow) || 5) && (o === -1 ? dia + 7 > ult : Math.floor((dia - 1) / 7) + 1 === o); }
      else if (r.tipo === 'anual') ok = mes === (Number(r.mes) || 1) && Math.min(Number(r.dia) || 1, ult) === dia;
      if (ok && (!fim || d <= fim)) { let c = d; if (r.util) { for (let z = 0; z < 30 && !util(c); z++) c = somarDias(c, 1); } out.push(c); }
    }
  }
  const lim = de > ini ? de : ini;
  return [...new Set(out)].filter((z) => z >= lim && z <= ate).sort();
}
function proximasDatas(r, depois, n, fer) { return datasRegra(r, somarDias(depois, 1), somarDias(depois, 800), fer).slice(0, n || 8); }
// T2: as próximas ocorrências (até 8 por série) para o calendário — vêm do banco (as mesmas do Google Agenda)
let _projCache = null;
function projecoesRecorrentes(forcar) {
  if (forcar || !_projCache || Date.now() - _projCache.t > 30000) {
    _projCache = { t: Date.now(), p: q(sb.rpc('recorrencias_projecao', { p_n: 8 })).then((L) => {
      const out = []; (L || []).forEach((s) => (s.datas || []).forEach((d) => out.push({ id: s.tarefa_id, titulo: s.titulo, prazo: d, prioridade: s.prioridade, hora: s.hora, hora_fim: s.hora_fim,
        tipo_agenda: s.tipo_agenda, local: s.local, responsavel: s.responsavel, participantes: s.participantes, revisor: s.revisor, chave_regra: s.chave_regra,
        cliente_id: s.cliente_id, grupo_id: s.grupo_id, status: 'pendente', recorrencia: 'regra', recorrencia_regra: s.regra, _prev: true, _cls: 'ag-prevista' })));
      return out; }).catch(() => []) };
  }
  return _projCache.p;
}
function esquecerProjecoes() { _projCache = null; }
// formulário: o bloco "Repetir"
function campoRepetir(t) {
  const r = regraDaTarefa(t) || {}, cada = Number(r.cada) || 1, dd = (r.dias || []).map(Number).sort().join(',');
  const tipo = r.tipo === 'semanal' && cada === 2 ? 'quinzenal' : r.tipo === 'semanal' && cada > 1 ? 'semanas' : r.tipo === 'semanal' && dd === '1,2,3,4,5' ? 'uteis' : (r.tipo || '');
  const dias = (r.dias || []).map(Number), base = t.prazo || hojeISO();
  const md = r.tipo === 'mensal_dias' ? dias : [5, 20];
  const sel = (id, pares, v) => '<select id="' + id + '">' + pares.map(([k, rot]) => '<option value="' + k + '"' + (String(k) === String(v) ? ' selected' : '') + '>' + rot + '</option>').join('') + '</select>';
  const vis = (tipos) => ' data-rep-vis="' + tipos + '"';
  return '<div class="inteiro tf-rep" id="tf-rep"><div class="tf-rep-linha"><span class="tf-rep-rot">Repetir</span>' + sel('tf-rep-tipo', TIPOS_REPETE, tipo) +
      '<span' + vis('semanas') + '>a cada <input id="tf-rep-cada" type="number" min="2" max="12" value="' + (Number(r.cada) > 1 ? r.cada : 2) + '"> semanas</span></div>' +
    '<div class="tf-rep-linha tf-rep-dias"' + vis('semanal semanas quinzenal') + '>' + [1, 2, 3, 4, 5, 6, 7].map((k) => '<label class="tf-rep-dia"><input type="checkbox" data-rep-dia="' + k + '"' +
      ((dias.length ? dias.includes(k) : isoDow(base) === k) ? ' checked' : '') + '>' + DIAS_SEM_CURTO[k] + '</label>').join('') + '</div>' +
    '<div class="tf-rep-linha"' + vis('mensal_dias') + '>nos dias <input id="tf-rep-d1" type="number" min="1" max="31" value="' + (md[0] || 5) + '"> e <input id="tf-rep-d2" type="number" min="1" max="31" value="' + (md[1] || 20) + '"></div>' +
    '<div class="tf-rep-linha"' + vis('mensal') + '>' + sel('tf-rep-modo', [['dia', 'no dia'], ['util', 'no dia útil nº'], ['semana', 'na']], r.modo || 'dia') +
      '<input id="tf-rep-dia" type="number" min="1" max="31" data-rep-modo="dia" value="' + (r.tipo === 'mensal' && r.dia ? r.dia : Number(base.slice(8))) + '">' +
      '<input id="tf-rep-n" type="number" min="1" max="23" data-rep-modo="util" value="' + (r.n || 5) + '">' +
      '<span data-rep-modo="semana">' + sel('tf-rep-ordem', ORDENS_SEM, r.ordem || -1) + sel('tf-rep-dow', [1, 2, 3, 4, 5, 6, 7].map((k) => [k, DIAS_SEM_ISO[k]]), r.dow || 5) + ' do mês</span></div>' +
    '<div class="tf-rep-linha"' + vis('anual') + '>em <input id="tf-rep-anual" type="date" value="' + (r.tipo === 'anual' ? base.slice(0, 4) + '-' + String(r.mes).padStart(2, '0') + '-' + String(r.dia).padStart(2, '0') : base) + '"></div>' +
    '<div class="tf-rep-linha"' + vis('uteis semanal semanas quinzenal mensal_dias mensal anual') + '>a partir de <input id="tf-rep-ini" type="date" value="' + (r.inicio || base) + '"> até <input id="tf-rep-fim" type="date" value="' + (r.fim || '') + '" title="Deixe vazio para repetir sem fim"> <span class="sub">(fim opcional)</span></div>' +
    '<label class="check tf-rep-linha"' + vis('uteis semanal semanas quinzenal mensal_dias mensal anual') + '><input type="checkbox" id="tf-rep-util"' + (r.util ? ' checked' : '') + '> Se cair em feriado ou fim de semana, passa para o dia útil seguinte</label>' +
    '<div class="tf-rep-txt" id="tf-rep-txt" aria-live="polite"></div></div>';
}
function lerRepetir(j) {
  const v = (id) => (j.querySelector('#' + id) || {}).value || '';
  const tipo = v('tf-rep-tipo'); if (!tipo) return null;
  const r = { tipo: ['semanas', 'quinzenal', 'uteis'].includes(tipo) ? 'semanal' : tipo };
  if (tipo === 'uteis') r.dias = [1, 2, 3, 4, 5];
  if (tipo === 'quinzenal') { r.dias = [...j.querySelectorAll('[data-rep-dia]:checked')].map((c) => Number(c.dataset.repDia)); r.cada = 2; }
  if (tipo === 'semanal' || tipo === 'semanas') { r.dias = [...j.querySelectorAll('[data-rep-dia]:checked')].map((c) => Number(c.dataset.repDia)); if (tipo === 'semanas') r.cada = Math.max(2, Number(v('tf-rep-cada')) || 2); }
  if (tipo === 'mensal_dias') r.dias = [...new Set([Number(v('tf-rep-d1')), Number(v('tf-rep-d2'))].filter((x) => x >= 1 && x <= 31))].sort((a, b) => a - b);
  if (tipo === 'mensal') { r.modo = v('tf-rep-modo') || 'dia'; if (r.modo === 'dia') r.dia = Math.min(31, Math.max(1, Number(v('tf-rep-dia')) || 1));
    if (r.modo === 'util') r.n = Math.min(23, Math.max(1, Number(v('tf-rep-n')) || 1)); if (r.modo === 'semana') { r.ordem = Number(v('tf-rep-ordem')) || -1; r.dow = Number(v('tf-rep-dow')) || 5; } }
  if (tipo === 'anual') { const a = v('tf-rep-anual') || hojeISO(); r.mes = Number(a.slice(5, 7)); r.dia = Number(a.slice(8)); }
  r.inicio = v('tf-rep-ini') || hojeISO();
  if (v('tf-rep-fim')) r.fim = v('tf-rep-fim');
  if ((j.querySelector('#tf-rep-util') || {}).checked) r.util = true;
  return r;
}
function ligarRepetir(j, aoMudar) {
  const box = j.querySelector('#tf-rep'); if (!box) return;
  const pintar = () => {
    const tipo = box.querySelector('#tf-rep-tipo').value, modo = box.querySelector('#tf-rep-modo').value;
    box.querySelectorAll('[data-rep-vis]').forEach((x) => { x.hidden = !x.dataset.repVis.split(' ').includes(tipo); });
    box.querySelectorAll('[data-rep-modo]').forEach((x) => { x.hidden = x.dataset.repModo !== modo; });
    const r = lerRepetir(j), txt = box.querySelector('#tf-rep-txt');
    if (!r) { txt.innerHTML = ''; return; }
    if ((r.tipo === 'semanal' || r.tipo === 'mensal_dias') && !(r.dias || []).length) { txt.innerHTML = '<span class="msg-erro">Escolha pelo menos um dia.</span>'; return; }
    const prox = proximasDatas(r, somarDias(r.inicio, -1), 6, E._feriados);
    txt.innerHTML = '<b>' + esc(textoRepete({ recorrencia_regra: r })) + '</b><div class="sub">Próximas: ' + (prox.length ? prox.map((d) => '<span class="tf-rep-data">' + dataBR(d).slice(0, 5) + '</span>').join(' ') : 'nenhuma (confira o fim)') + '</div>';
    if (aoMudar) aoMudar(r, prox);
  };
  box.addEventListener('change', () => { box._mexeu = true; pintar(); });
  box.addEventListener('input', (ev) => { if (ev.target.type === 'number') { box._mexeu = true; pintar(); } });
  feriados().then(pintar, pintar);
  pintar();
}
// T3: editar uma tarefa de uma série → "só esta" ou "esta e as próximas"
function perguntarSerie(mudouRegra) {
  return new Promise((ok) => {
    const j = abrirJanela({ titulo: '↻ Tarefa que se repete',
      corpo: '<p>Esta tarefa faz parte de uma repetição. Onde aplicar a alteração?</p>' +
        (mudouRegra ? '<p class="dica">A <b>regra de repetição</b> mudou: ela só vale em “esta e as próximas”.</p>' : ''),
      rodape: '<button class="btn btn-o" type="button" data-cancelar>Cancelar</button><div class="acoes">' +
        '<button class="btn btn-o" type="button" id="tf-serie-esta">Só esta</button><button class="btn btn-p" type="button" id="tf-serie-prox">Esta e as próximas</button></div>' });
    let feito = false; const fim = (v) => { if (feito) return; feito = true; fecharJanela(j); ok(v); };
    j._aoFechar = () => fim(null);
    j.querySelector('[data-cancelar]').onclick = () => fim(null);
    j.querySelector('#tf-serie-esta').onclick = () => fim('esta');
    j.querySelector('#tf-serie-prox').onclick = () => fim('proximas');
  });
}

function formTarefa(t, depois) {
  t = t || {};
  const novo = !t.id;
  let checklist = Array.isArray(t.checklist) ? t.checklist.map((c) => ({ texto: c.texto, feito: !!c.feito })) : [];
  const outras = (E._tarefas || []).filter((x) => x.id !== t.id && !tarefaFechada(x));
  const j = abrirJanela({ titulo: novo ? (t.tarefa_pai_id ? 'Nova subtarefa' : 'Nova tarefa') : 'Tarefa', larga: true,
    corpo: '<form id="f-tf" class="grade">' +
      // Backup 54: à vista só o essencial (o que fazer, para quem, até quando, urgência, cliente, se repete); o resto em "Mais opções"
      campo('Tarefa <span class="obrig">*</span>', '<input name="titulo" maxlength="300" value="' + esc(t.titulo || '') + '" placeholder="O que precisa ser feito?">', 'inteiro') +
      campo('Para quem', selectPessoa('responsavel', t.responsavel || (novo && E.perfil ? E.perfil.nome : ''), '— escolha —')) +
      campo('Prazo', '<input name="prazo" type="date" value="' + esc(t.prazo || '') + '">') +
      campo('Urgência', selectPares('prioridade', [['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']], t.prioridade || 'media')) +
      campo('Cliente', '<select name="cliente_id">' + opcoesClientes(t.cliente_id || '') + '</select>') +
      campoRepetir(t) +
      '<details class="inteiro tf-mais" id="tf-mais"' + (novo ? '' : ' open') + '><summary>+ Mais opções <span class="sub">prazo fatal, participantes, revisão, checklist, descrição…</span></summary><div class="grade">' +
      campo('Grupo', '<input name="grupo" list="tf-grupos" value="' + esc(nomeGrupo(t.grupo_id)) + '">' + datalistGrupos('tf-grupos')) +
      campo('Prazo fatal (legal / judicial)', '<input name="prazo_fatal" type="date" value="' + esc(t.prazo_fatal || '') + '">') +
      '<div class="campo inteiro"><span>Participantes</span>' + campoParticipantes(t.participantes) + '</div>' +
      campo('Início', '<input name="inicio" type="date" value="' + esc(t.inicio || (novo ? hojeISO() : '')) + '">') +
      campo('Status', selectPares('status', Object.entries(STATUS_TAREFA), t.status || 'pendente')) +
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
      '</div></details>' +
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
  const aposSalvar = async () => { esquecerProjecoes(); await (depois || recarregar)(); };
  // tarefa nova com repetição: o prazo vira a primeira data da regra
  ligarRepetir(j, (r, prox) => { if (novo && j.querySelector('#tf-rep')._mexeu) { const p1 = proximasDatas(r, somarDias(r.inicio, -1), 1, E._feriados)[0]; if (p1) f.prazo.value = p1; } });
  j.querySelector('#btn-salvar-tf').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.titulo.value.trim()) throw new Error('Escreva a tarefa.');
    const est = f.estimativa_horas.value.trim() ? lerValor(f.estimativa_horas.value) : null;
    if (Number.isNaN(est)) throw new Error('Estimativa de horas inválida.');
    if (f.prazo.value && f.prazo_fatal.value && f.prazo.value > f.prazo_fatal.value) throw new Error('O prazo interno está depois do prazo fatal.');
    const dados = { titulo: f.titulo.value.trim(), cliente_id: f.cliente_id.value || null, grupo_id: await grupoPorNome(f.grupo.value), responsavel: f.responsavel.value.trim(),
      participantes: lerParticipantes(j), prazo: f.prazo.value || null, prazo_fatal: f.prazo_fatal.value || null, inicio: f.inicio.value || null,
      prioridade: f.prioridade.value, status: f.status.value, estimativa_horas: est, etiquetas: f.etiquetas.value.trim(),
      depende_de: f.depende_de.value || null, exige_anexo: f.exige_anexo.checked, exige_revisao: f.exige_revisao.checked, revisor: f.revisor.value.trim(),
      processos_vinculados: f.processos_vinculados.value.trim(), descricao: f.descricao.value.trim(), obs: f.obs.value.trim(), checklist };
    if (!dados.grupo_id && dados.cliente_id) { const c = E.clientes.find((x) => x.id === dados.cliente_id); if (c) dados.grupo_id = c.grupo_id; }
    ['tarefa_pai_id', 'fluxo_id', 'contrato_id'].forEach((k) => { if (novo && t[k]) dados[k] = t[k]; });
    if (dados.exige_revisao && !dados.revisor) throw new Error('Informe quem revisa (ou desmarque "Exige revisão").');
    if (dados.status !== (t.status || 'pendente')) await validarDependencia(dados, dados.status);
    // Backup 51: repetição — regra nova (série) ou a antiga, intocada
    const box = j.querySelector('#tf-rep'), regra = lerRepetir(j), legado = !t.recorrencia_regra && ['semanal', 'mensal', 'anual'].includes(t.recorrencia || '');
    if (regra && (regra.tipo === 'semanal' || regra.tipo === 'mensal_dias') && !(regra.dias || []).length) throw new Error('Repetir: escolha pelo menos um dia.');
    if (legado && !box._mexeu) dados.recorrencia = t.recorrencia;
    else if (regra || t.recorrencia_regra) { dados.recorrencia_regra = regra; dados.recorrencia = regra ? 'regra' : ''; }
    else dados.recorrencia = '';
    if (regra && !dados.prazo) dados.prazo = proximasDatas(regra, somarDias(regra.inicio, -1), 1, E._feriados)[0] || null;
    let modo = 'esta';
    if (!novo && t.recorrencia_serie) {
      const canon = (o) => (o ? JSON.stringify(Object.keys(o).sort().reduce((a, k) => { a[k] = o[k]; return a; }, {})) : 'null');
      const mudou = canon(t.recorrencia_regra) !== canon(dados.recorrencia_regra === undefined ? t.recorrencia_regra : dados.recorrencia_regra);
      modo = await perguntarSerie(mudou); if (!modo) return;
      if (modo === 'esta') { delete dados.recorrencia_regra; delete dados.recorrencia; }
    }
    if (modo === 'proximas') {
      // T3: esta e as próximas — os campos vão para as abertas seguintes da série (cada uma com a própria data)
      await q(sb.rpc('tarefa_serie_editar', { p_id: t.id, p: dados }));
      const proprio = Object.assign({}, dados); delete proprio.recorrencia_regra; delete proprio.recorrencia;
      await q(sb.from('tarefas').update(proprio).eq('id', t.id));
    } else if (novo) await q(sb.from('tarefas').insert(dados)); else await q(sb.from('tarefas').update(dados).eq('id', t.id));
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
// (as regras automáticas rodam sozinhas pelo pg_cron; o liga/desliga dos e-mails fica em Administração → E-mail → Automáticos)
function quandoRodou(v) { const d = new Date(v); return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }

// ─────────────────────────── fluxos e modelos ───────────────────────────
async function formNovoFluxo(depois) {
  const modelos = (await q(sb.from('modelos_fluxo').select('*').order('nome'))).sort((x, y) => !!x.sequencial - !!y.sequencial);   // Backup 54: os "passo a passo" no fim da lista
  if (!modelos.length) { aviso('Crie um modelo de fluxo primeiro (botão "Modelos de fluxo").', true); return; }
  const j = abrirJanela({ titulo: 'Novo fluxo de tarefas', larga: true,
    corpo: '<form class="grade" id="f-fl">' +
      campo('Modelo <span class="obrig">*</span>', '<select name="modelo">' + modelos.map((m) => '<option value="' + m.id + '">' + esc(m.nome) + (m.sequencial ? ' — passo a passo, com validação' : '') + '</option>').join('') + '</select>', 'inteiro') +
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
  // Backup 54: modelo "passo a passo" (ex.: Lead completo) = a antiga janela "Delegar" (cada passo começa quando o anterior termina)
  f.modelo.onchange = () => { const m = modelos.find((x) => x.id === f.modelo.value) || {};
    if (m.sequencial) { fecharJanela(j); return janelaDelegar({ modelo: m.nome, cliente_id: f.cliente_id.value || '' }, depois); } previa(); };
  f.prazo_fatal.onchange = previa; previa();
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
    if (!confirm('Excluir o feriado de ' + dataBR(data) + '?')) return;
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
  const h = hojeISO(), lim = somarDias(h, 2);
  // Backup 27: aviso é só o que NÃO aparece no Início nem nas Tarefas. Saíram: publicações novas, tarefas (atribuída, atrasada, prazo),
  // honorários/acordos/parcelamentos que vencem hoje. Ficam: CRM com o próximo passo chegando, certidões, aprovações, menções, acessos.
  const [nots, ops, certs, lidos] = await Promise.all([
    q(sb.from('notificacoes').select('*').eq('lida', false).not('tipo', 'in', '(publicacao,tarefa,atraso,prazo)').order('criado_em', { ascending: false }).limit(50)).catch(() => []),
    pode('crm') ? q(sb.from('crm_oportunidades').select('id, titulo, responsavel, proxima_acao, proxima_acao_em, crm_etapas(final)').not('proxima_acao_em', 'is', null).lte('proxima_acao_em', lim)).catch(() => []) : [],
    q(sb.from('certidoes').select('id, orgao, validade, cliente_id').not('validade', 'is', null).lte('validade', somarDias(h, 15))).catch(() => []),
    q(sb.from('avisos_lidos').select('chave').gte('lido_em', new Date(Date.now() - 21 * 864e5).toISOString())).catch(() => [])
  ]);
  const al = nots.map((n) => ({ nivel: n.tipo === 'rascunho' ? 'medio' : 'info', tipo: n.tipo || 'aviso', titulo: n.titulo, detalhe: n.detalhe, notif: n.id, link: n.link, quando: n.criado_em }));
  const add = (a) => { a.chave = a.assunto + '@' + levaDoAviso(a.nivel); al.push(a); };
  const eu = primeiroNome((E.perfil && E.perfil.nome) || '');
  ops.filter((o) => !(o.crm_etapas && o.crm_etapas.final) && (!o.responsavel || primeiroNome(o.responsavel) === eu)).forEach((o) => {
    const d = diasAte(o.proxima_acao_em);
    add({ nivel: d <= 0 ? 'alto' : 'medio', tipo: 'crm', assunto: 'crm:' + o.id + ':' + o.proxima_acao_em,
      titulo: 'CRM — ' + (d < 0 ? 'passou do prazo' : d === 0 ? 'hoje' : 'em ' + plural(d, 'dia', 'dias')) + ': ' + (o.proxima_acao || 'próximo passo'),
      detalhe: o.titulo + ' · ' + dataBR(o.proxima_acao_em), tela: 'crm' });
  });
  certs.forEach((x) => add({ nivel: x.validade < h ? 'alto' : 'medio', tipo: 'certidao', assunto: 'cert:' + x.id, titulo: 'Certidão ' + x.orgao + ' ' + (x.validade < h ? 'vencida' : 'vencendo'), detalhe: dataBR(x.validade) + ' · ' + nomeCliente(x.cliente_id), cliente: x.cliente_id }));
  const lidas = new Set(lidos.map((x) => x.chave));
  al.forEach((a) => { a.lido = !!(a.chave && lidas.has(a.chave)); });
  const ordem = { alto: 0, medio: 1, info: 2 };
  return al.sort((a, b) => (a.lido - b.lido) || (ordem[a.nivel] - ordem[b.nivel]));
}
const ICONE_AVISO = { crm: '🎯', prazo: '⏰', equipe: '👥', documento: '📄', certidao: '📜', financeiro: '💰', acordo: '🤝', rascunho: '📝', publicacao: '⚖', mencao: '💬', revisao: '🔎', acesso: '🔐', tarefa: '✅', cnpj: '🏢' };
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

// ─────────── Minha semana: segunda a sexta, arrastar para remarcar ───────────
// Backup 52 (C1): a semana com arrastar é UMA só — Tarefas → Calendário → Semana e o Início usam esta função.
// o = { lista (tarefas já filtradas), estado (guarda .semana), abrir(t), repintar(), atrasadas (bool), rotulo, cartao (bool: dentro de um cartão próprio) }
function semanaArrastavel(alvo, o) {
  const h = hojeISO(), F = o.estado;
  const base = new Date((F.semana || h) + 'T12:00:00'); base.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  const seg = iso(base), dias = [0, 1, 2, 3, 4].map((i) => somarDias(seg, i)), sex = dias[4];
  const ts = o.lista;
  const atrasadas = o.atrasadas ? ts.filter((t) => t.prazo && t.prazo < h && !tarefaFechada(t)).sort((a, b) => a.prazo.localeCompare(b.prazo)) : [], semData = ts.filter((t) => !t.prazo);
  const cartao = (t) => '<div class="sm-card" draggable="true" data-sm="' + t.id + '"><b>' + esc(t.titulo) + '</b>' + seloFatal(t) +
    '<div class="sub">' + esc(quemTarefa(t) || '') + (t.estimativa_horas ? ' · ' + String(t.estimativa_horas).replace('.', ',') + ' h' : '') + '</div></div>';
  const col = (rot, data, lista, cls) => '<div class="sm-col' + (cls ? ' ' + cls : '') + '" data-dia="' + (data || '') + '"><div class="sm-tit">' + rot + ' <span class="sub">' + lista.length + '</span></div>' + lista.map(cartao).join('') + '</div>';
  const miolo = '<div class="fila-cal-nav"><button type="button" class="btn btn-o btn-mini" data-sm-nav="-7" aria-label="Semana anterior">‹</button><b>Semana de ' + dataBR(seg).slice(0, 5) + ' a ' + dataBR(sex).slice(0, 5) +
      (o.rotulo ? ' — ' + esc(o.rotulo) : '') + '</b><button type="button" class="btn btn-o btn-mini" data-sm-nav="7" aria-label="Próxima semana">›</button><button type="button" class="btn btn-o btn-mini" data-sm-nav="0">Esta semana</button></div>' +
    // Backup 39: "Atrasadas" no MESMO quadro do Início (⏰, número em vermelho, contorno vermelho e "prazo · N dias de atraso")
    (o.atrasadas ? '<div class="fila-com-atr sm-com-atr">' + quadroAtrasadas(atrasadas) : '<div>') +
    '<div class="sm-grade">' +
    dias.map((d, i) => col(['Seg', 'Ter', 'Qua', 'Qui', 'Sex'][i] + ' ' + dataBR(d).slice(0, 5), d, ts.filter((t) => t.prazo === d), d === h ? 'sm-hoje' : '')).join('') +
    (semData.length ? col('Sem data', 'sem', semData, 'sm-sem') : '') + '</div></div>' +
    '<p class="sub sm-dica">Arraste a tarefa para outro dia para remarcar o prazo.</p>';
  // Backup 40: dentro do mesmo cartão do calendário, com a mesma altura
  alvo.innerHTML = o.cartao === false ? '<div class="tf-sem tf-sem-ini">' + miolo + '</div>' : '<div class="card ini-fila tf-cal tf-sem"><div class="card-bd">' + miolo + '</div></div>';
  // Backup 53: mesma altura do calendário do mês (as colunas esticam até o pé)
  { const c = alvo.firstElementChild; if (c) c.style.minHeight = (o.altura || 680) + 'px'; }
  const achar = (id) => ts.find((t) => t.id === id) || (E._tarefas || []).find((t) => t.id === id);
  alvo.querySelectorAll('[data-sm-nav]').forEach((b) => b.onclick = () => { F.semana = +b.dataset.smNav ? somarDias(seg, +b.dataset.smNav) : null; o.repintar(); });
  alvo.querySelectorAll('.fila-atrasadas [data-fila]').forEach((b) => b.onclick = () => o.abrir(achar(b.dataset.fila)));
  let arr = null;
  alvo.querySelectorAll('.sm-card').forEach((c) => {
    c.addEventListener('dragstart', (ev) => { arr = c.dataset.sm; ev.dataTransfer.setData('text/plain', arr); c.classList.add('arrastando'); });
    c.addEventListener('dragend', () => c.classList.remove('arrastando'));
    c.onclick = () => o.abrir(achar(c.dataset.sm));
  });
  alvo.querySelectorAll('.sm-col[data-dia]').forEach((cl) => {
    if (!cl.dataset.dia || cl.dataset.dia === 'sem') return;
    cl.addEventListener('dragover', (ev) => { ev.preventDefault(); cl.classList.add('sobre'); });
    cl.addEventListener('dragleave', () => cl.classList.remove('sobre'));
    cl.addEventListener('drop', (ev) => { ev.preventDefault(); cl.classList.remove('sobre');
      const id = ev.dataTransfer.getData('text/plain') || arr, t = achar(id); if (!t || t.prazo === cl.dataset.dia) return;
      comBotao(null, async () => {
        if (t.prazo_fatal && cl.dataset.dia > t.prazo_fatal && !confirm('A nova data passa do PRAZO FATAL (' + dataBR(t.prazo_fatal) + '). Remarcar mesmo assim?')) return;
        await q(sb.from('tarefas').update({ prazo: cl.dataset.dia }).eq('id', id)); t.prazo = cl.dataset.dia;
        aviso('✓ "' + t.titulo + '" remarcada para ' + dataBR(cl.dataset.dia) + '.'); o.repintar();
      }); });
  });
}
function vistaSemana(alvo) {
  const F = E.tf;
  const quem = F.pessoas && F.pessoas.length ? 'escolhida' : '';
  // Backup 39: respeita a aba (Em aberto / Concluídas / Excluídas) — antes "Concluídas" ainda mostrava as abertas
  const doDono = (t) => (quem ? true : ehMinha(t));   // com pessoa escolhida, o filtro de cima já separou (responsável ou participante)
  semanaArrastavel(alvo, { lista: filtrarTarefas().filter(doDono), estado: F, atrasadas: F.aba === 'abertas', rotulo: quem || 'minhas tarefas', altura: F.altCal,
    abrir: (t) => abrirTarefa(t, recarregarTarefas), repintar: () => vistaSemana(alvo) });
}

// ═══ Backup 26: DELEGAR e VALIDAR ═══
// devolver com comentário (volta para quem fez, com aviso)
function janelaDevolver(t, depois) {
  const k = abrirJanela({ titulo: '↩ Devolver para ajuste', corpo: '<p class="sub" style="margin-bottom:8px">' + esc(t.titulo) + ' — volta para <b>' + esc(t.responsavel || '—') + '</b>, que recebe um aviso com o seu comentário.</p>' +
      '<div class="grade">' + campo('O que precisa ser ajustado <span class="obrig">*</span>', '<textarea name="coment" maxlength="1500" placeholder="Ex.: faltou a cláusula de êxito; conferir o CNPJ"></textarea>', 'inteiro') + '</div>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Voltar</button><button class="btn btn-x" type="button" id="tf-dev-ok">Devolver</button></div>' });
  k.querySelector('[data-cancelar]').onclick = () => fecharJanela(k);
  k.querySelector('#tf-dev-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const c = k.querySelector('[name=coment]').value.trim();
    if (!c) throw new Error('Escreva o que precisa ser ajustado.');
    await q(sb.rpc('tarefa_validar', { p_tarefa: t.id, p_aprovar: false, p_comentario: c }));
    aviso('↩ Devolvido para ' + (t.responsavel || 'a pessoa') + '.'); fecharJanela(k); if (depois) await depois();
  });
}
// delegar uma sequência de passos (ex.: "Lead completo": cadastrar → reunião → contrato com validação → enviar)
async function janelaDelegar(o, depois) {
  o = o || {};
  const modelos = await q(sb.from('modelos_fluxo').select('nome, descricao, itens, sequencial').order('nome')).catch(() => []);
  const seq = modelos.filter((m) => m.sequencial);
  if (!seq.length) return aviso('Nenhum modelo de sequência. Rode o SQL mais recente no Supabase.', true);
  const eu = (E.perfil && E.perfil.nome) || '';
  const j = abrirJanela({ titulo: '👥 Delegar passos', larga: true,
    corpo: '<form id="f-deleg" class="grade">' +
      campo('Sequência', '<select name="modelo">' + seq.map((m) => '<option value="' + esc(m.nome) + '"' + (o.modelo === m.nome ? ' selected' : '') + '>' + esc(m.nome) + '</option>').join('') + '</select>', 'inteiro') +
      '<div class="inteiro" id="deleg-passos"></div>' +
      campo('Para quem <span class="obrig">*</span>', selectPessoa('pessoa', o.pessoa || '', '— escolha —')) +
      campo('Quem valida', selectPessoa('revisor', eu, '— eu —')) +
      campo('Cliente (se já cadastrado)', '<select name="cliente_id">' + opcoesClientes(o.cliente_id || '') + '</select>', 'inteiro') +
      campo('Recado (opcional)', '<textarea name="obs" maxlength="1500" placeholder="Ex.: Empresa X é lead; o contato é o João (financeiro)">' + esc(o.obs || '') + '</textarea>', 'inteiro') + '</form>',
    rodape: '<span></span><div class="acoes"><button class="btn btn-o" type="button" data-cancelar>Cancelar</button><button class="btn btn-p" type="button" id="deleg-ok">Delegar</button></div>' });
  const f = j.querySelector('#f-deleg');
  const passos = () => { const m = seq.find((x) => x.nome === f.modelo.value) || seq[0];
    j.querySelector('#deleg-passos').innerHTML = '<div class="dica">' + esc(m.descricao || '') + '<ol style="margin:6px 0 0 18px">' + (m.itens || []).map((it) =>
      '<li>' + esc(it.titulo) + ' <span class="sub">(' + plural(it.dias || 1, 'dia útil', 'dias úteis') + ')</span>' + (it.validar ? ' <span class="pill hoje">passa pela validação</span>' : '') + '</li>').join('') + '</ol>' +
      '<div class="sub" style="margin-top:6px">Cada passo só começa quando o anterior termina. O passo com validação vai para você aprovar ou devolver com comentário.</div></div>'; };
  f.modelo.onchange = passos; passos();
  j.querySelector('[data-cancelar]').onclick = () => fecharJanela(j);
  j.querySelector('#deleg-ok').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    if (!f.pessoa.value) throw new Error('Escolha para quem delegar.');
    await q(sb.rpc('delegar_sequencia', { p_modelo: f.modelo.value, p_pessoa: f.pessoa.value, p_revisor: f.revisor.value || eu, p_cliente: f.cliente_id.value || null,
      p_oportunidade: o.oportunidade_id || null, p_nome: null, p_obs: f.obs.value.trim() }));
    aviso('✓ Delegado para ' + f.pessoa.value + ': o 1º passo já está na fila dele(a).'); fecharJanela(j); if (depois) await depois();
  });
}
// Início: "Aguardando minha validação"
async function cardValidacoes() {
  const l = await q(sb.rpc('minhas_validacoes')).catch(() => []);
  if (!l.length) return { html: '', ligar: () => {} };
  return { html: '<div class="card ini-valid"><div class="card-hd">✅ Aguardando minha validação <span class="pill hoje">' + l.length + '</span>' +
      '<span class="sub" style="margin-left:8px">aprove para liberar o próximo passo, ou devolva com comentário</span></div><div class="card-bd"><div class="lista-ficha">' +
      l.map((t) => '<div class="item-ficha"><div class="clicavel" data-val-abrir="' + t.id + '"><b>' + esc(t.titulo) + '</b><div class="sub">' +
        esc([t.cliente, t.fluxo].filter(Boolean).join(' · ')) + (t.prazo ? ' · prazo ' + dataBR(t.prazo) : '') + '</div></div>' +
        '<div class="acoes">' + pillPessoa(t.responsavel) + '<button class="btn btn-x btn-mini" type="button" data-val-dev="' + t.id + '">↩ Devolver</button>' +
        '<button class="btn btn-v btn-mini" type="button" data-val-ok="' + t.id + '">✓ Aprovar</button></div></div>').join('') + '</div></div></div>',
    ligar: (el) => {
      const recarregarCard = async () => { const c = await cardValidacoes(); el.innerHTML = c.html; c.ligar(el); };
      el.querySelectorAll('[data-val-ok]').forEach((b) => b.onclick = () => comBotao(b, async () => {
        await q(sb.rpc('tarefa_validar', { p_tarefa: b.dataset.valOk, p_aprovar: true, p_comentario: '' })); aviso('✓ Aprovado: o próximo passo foi liberado.'); await recarregarCard(); }));
      el.querySelectorAll('[data-val-dev]').forEach((b) => b.onclick = () => janelaDevolver(l.find((x) => x.id === b.dataset.valDev), recarregarCard));
      el.querySelectorAll('[data-val-abrir]').forEach((d) => d.onclick = async () => {
        const t = (await q(sb.from('tarefas').select('*').eq('id', d.dataset.valAbrir)))[0]; if (t) abrirTarefa(t, recarregarCard); });
    } };
}
