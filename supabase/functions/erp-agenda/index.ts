// erp-agenda — agenda de cada pessoa no formato iCalendar (.ics), para assinar no Google Agenda.
// GET /functions/v1/erp-agenda?t=<link secreto da pessoa>  → prazos fatais e audiências dela.
// O link sai de "Tarefas → 📅 Google Agenda" (RPC meu_link_agenda) e pode ser trocado a qualquer hora.
// Publicar com "Verify JWT" DESLIGADO (o Google não manda login; quem autoriza é o link secreto).
import { createClient } from 'npm:@supabase/supabase-js@2';

const VERSAO = '2026-09-29';

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
  const { data: tarefas, error } = await db.from('tarefas')
    .select('id, titulo, responsavel, prazo, prazo_fatal, status, processos_vinculados, etiquetas, descricao, grupos(nome), clientes(nome)')
    .not('status', 'in', '(concluida,cancelada)')
    .or('prazo_fatal.not.is.null,titulo.ilike.*audi*ncia*,etiquetas.ilike.*audi*ncia*');
  if (error) return texto('Erro ao montar a agenda: ' + error.message, 500);
  const agora = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev = [];
  for (const x of tarefas || []) {
    if (primeiroNome(x.responsavel) !== eu) continue;
    const quem = [x.clientes && x.clientes.nome, x.grupos && x.grupos.nome].filter(Boolean).join(' · ');
    const desc = [quem, x.processos_vinculados ? 'Processo: ' + x.processos_vinculados : '', x.descricao || ''].filter(Boolean).join('\n');
    const audiencia = /audi[eê]ncia/i.test((x.titulo || '') + ' ' + (x.etiquetas || ''));
    const itens = [];
    if (x.prazo_fatal) itens.push(['fatal', x.prazo_fatal, '⚑ Prazo fatal: ' + x.titulo]);
    if (audiencia && x.prazo && x.prazo !== x.prazo_fatal) itens.push(['aud', x.prazo, '⚖ ' + x.titulo]);
    for (const [tipo, data, titulo] of itens) {
      ev.push(['BEGIN:VEVENT', 'UID:' + x.id + '-' + tipo + '@erp-araujo-castro', 'DTSTAMP:' + agora,
        'DTSTART;VALUE=DATE:' + dia(data), 'DTEND;VALUE=DATE:' + diaSeguinte(data),
        'SUMMARY:' + icsTexto(titulo), 'DESCRIPTION:' + icsTexto(desc), 'TRANSP:TRANSPARENT',
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsTexto(titulo), 'TRIGGER:-P1D', 'END:VALARM', 'END:VEVENT'].map(dobrar).join('\r\n'));
    }
  }
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Araujo e Castro//ERP//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    dobrar('X-WR-CALNAME:ERP · prazos de ' + icsTexto(pf.nome)), 'X-WR-TIMEZONE:America/Sao_Paulo', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H']
    .concat(ev, ['END:VCALENDAR']).join('\r\n') + '\r\n';
  return new Response(ics, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' } });
}

Deno.serve((req) => tratar(req,
  createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })));
