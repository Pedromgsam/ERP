// erp-agenda — agenda de cada pessoa no formato iCalendar (.ics), para assinar no Google Agenda.
// GET /functions/v1/erp-agenda?t=<link secreto da pessoa>  → tudo o que está em aberto para ela: tarefas, compromissos, audiências,
// reuniões e prazos fatais (Backup 50; antes eram só prazos fatais, audiências e reuniões).
// O link sai de "Tarefas → 📅 Google Agenda" (RPC meu_link_agenda) e pode ser trocado a qualquer hora.
// Publicar com "Verify JWT" DESLIGADO (o Google não manda login; quem autoriza é o link secreto).
import { createClient } from 'npm:@supabase/supabase-js@2';

const VERSAO = '2026-10-08';   // Backup 50: mostra TUDO da pessoa (tarefas, reuniões, audiências, compromissos, com hora quando houver)

const texto = (s, status) => new Response(s, { status: status || 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
const primeiroNome = (s) => String(s || '').trim().split(/\s+/)[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const icsTexto = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const dia = (iso) => String(iso).slice(0, 10).replace(/-/g, '');
const diaSeguinte = (iso) => { const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10).replace(/-/g, ''); };
// linhas de até 75 caracteres (regra do formato .ics)
const dobrar = (l) => { const out = []; while (l.length > 74) { out.push(l.slice(0, 74)); l = ' ' + l.slice(74); } out.push(l); return out.join('\r\n'); };

export async function tratar(req, db) {
  if (req.method === 'OPTIONS') return texto('ok');
  const u = new URL(req.url);
  if (u.searchParams.get('acao') === 'ping') return new Response(JSON.stringify({ ok: true, versao: VERSAO }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  if (req.method === 'POST') {
    const corpo = await req.json().catch(() => ({}));
    if (corpo.acao === 'ping') return new Response(JSON.stringify({ ok: true, versao: VERSAO }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
  const t = u.searchParams.get('t') || '';
  if (!/^[a-f0-9]{32,80}$/.test(t)) return texto('Link de agenda inválido.', 404);
  const { data: link } = await db.from('agenda_links').select('usuario_id').eq('token', t).maybeSingle();
  if (!link) return texto('Link de agenda inválido ou trocado. Gere um novo em Tarefas → Google Agenda.', 404);
  const { data: pf } = await db.from('perfis').select('nome, papel').eq('id', link.usuario_id).maybeSingle();
  if (!pf || !['admin', 'equipe'].includes(pf.papel)) return texto('Acesso desativado.', 403);
  const eu = primeiroNome(pf.nome);
  // Backup 50: todas as tarefas em aberto com data (de quem é responsável OU participante), com hora quando tiver
  const { data: tarefas, error } = await db.from('tarefas')
    .select('id, titulo, responsavel, participantes, prazo, prazo_fatal, status, tipo_agenda, hora, hora_fim, local, processos_vinculados, etiquetas, descricao, grupos(nome), clientes(nome)')
    .not('status', 'in', '(concluida,cancelada)')
    .or('prazo.not.is.null,prazo_fatal.not.is.null');
  if (error) return texto('Erro ao montar a agenda: ' + error.message, 500);
  const agora = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev = [];
  const ROT = { reuniao: '🤝 ', audiencia: '⚖ ', compromisso: '📌 ', tarefa: '✓ ' };
  const hhmm = (h) => String(h || '').slice(0, 5).replace(':', '') + '00';
  const umaHoraDepois = (h) => { const hh = Number(String(h).slice(0, 2)); return hh >= 23 ? '23:59' : String(hh + 1).padStart(2, '0') + String(h).slice(2, 5); };
  for (const x of tarefas || []) {
    const minha = primeiroNome(x.responsavel) === eu || String(x.participantes || '').split(/[,;]/).some((n) => primeiroNome(n) === eu);
    if (!minha) continue;
    const quem = [x.clientes && x.clientes.nome, x.grupos && x.grupos.nome].filter(Boolean).join(' · ');
    const desc = [quem, x.responsavel ? 'Responsável: ' + x.responsavel : '', x.processos_vinculados ? 'Processo: ' + x.processos_vinculados : '', x.descricao || ''].filter(Boolean).join('\n');
    const audiencia = x.tipo_agenda === 'audiencia' || /audi[eê]ncia/i.test((x.titulo || '') + ' ' + (x.etiquetas || ''));
    const tipo = audiencia ? 'audiencia' : (x.tipo_agenda || 'tarefa');
    const itens = [];
    if (x.prazo_fatal) itens.push(['fatal', x.prazo_fatal, '⚑ Prazo fatal: ' + x.titulo, null]);
    if (x.prazo && x.prazo !== x.prazo_fatal) itens.push(['prazo', x.prazo, (ROT[tipo] || '') + x.titulo, x.hora]);
    for (const [k, data, titulo, hora] of itens) {
      const quando = hora
        ? ['DTSTART;TZID=America/Sao_Paulo:' + dia(data) + 'T' + hhmm(hora), 'DTEND;TZID=America/Sao_Paulo:' + dia(data) + 'T' + hhmm(x.hora_fim || umaHoraDepois(hora))]
        : ['DTSTART;VALUE=DATE:' + dia(data), 'DTEND;VALUE=DATE:' + diaSeguinte(data)];
      ev.push(['BEGIN:VEVENT', 'UID:' + x.id + '-' + k + '@erp-araujo-castro', 'DTSTAMP:' + agora].concat(quando,
        ['SUMMARY:' + icsTexto(titulo), 'DESCRIPTION:' + icsTexto(desc), 'LOCATION:' + icsTexto(x.local || ''), hora ? 'TRANSP:OPAQUE' : 'TRANSP:TRANSPARENT',
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsTexto(titulo), hora ? 'TRIGGER:-PT30M' : 'TRIGGER:-P1D', 'END:VALARM', 'END:VEVENT']).map(dobrar).join('\r\n'));
    }
  }
  // Backup 26: reuniões marcadas no CRM (com hora), para cada participante
  const { data: reunioes } = await db.from('reunioes').select('id, titulo, inicio, duracao_min, local, participantes, status, clientes(nome)')
    .eq('status', 'agendada').gte('inicio', new Date(Date.now() - 30 * 864e5).toISOString());
  const utc = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  for (const r of reunioes || []) {
    if (!String(r.participantes || '').split(',').some((n) => primeiroNome(n) === eu)) continue;
    const fim = new Date(new Date(r.inicio).getTime() + (Number(r.duracao_min) || 60) * 60000);
    ev.push(['BEGIN:VEVENT', 'UID:reuniao-' + r.id + '@erp-araujo-castro', 'DTSTAMP:' + agora, 'DTSTART:' + utc(r.inicio), 'DTEND:' + utc(fim),
      'SUMMARY:' + icsTexto('🤝 ' + r.titulo), 'LOCATION:' + icsTexto(r.local || ''), 'DESCRIPTION:' + icsTexto([r.clientes && r.clientes.nome, 'Participantes: ' + r.participantes].filter(Boolean).join('\n')),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsTexto(r.titulo), 'TRIGGER:-PT30M', 'END:VALARM', 'END:VEVENT'].map(dobrar).join('\r\n'));
  }
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Araujo e Castro//ERP//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    dobrar('X-WR-CALNAME:ERP · agenda de ' + icsTexto(pf.nome)), 'X-WR-TIMEZONE:America/Sao_Paulo', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H']
    .concat(ev, ['END:VCALENDAR']).join('\r\n') + '\r\n';
  return new Response(ics, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' } });
}

Deno.serve((req) => tratar(req,
  createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })));
