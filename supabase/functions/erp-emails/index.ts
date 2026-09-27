// Função "erp-emails" do Supabase (Edge Functions): envia os e-mails da fila do ERP.
// Como publicar (sem instalar nada): Supabase → Edge Functions → Deploy a new function → Via Editor,
// nome "erp-emails", cole este arquivo inteiro e clique em Deploy. Depois, nos detalhes da função,
// DESLIGUE "Verify JWT" (a própria função confere quem chamou).
// Ações (corpo JSON {"acao": ...}):
//   "enviar" → envia os pendentes (a rotina chama a cada 5 min; o admin pelo botão "Enviar agora")
//   "teste"  → põe um e-mail de teste para o admin e envia
//   "resumo" → monta o resumo do dia de cada pessoa e envia
// Quem pode chamar: a rotina do banco (cabeçalho x-erp-segredo) ou um administrador logado.
// A senha do Gmail/SMTP/Resend fica no banco (config_privada) — nunca no site.
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.14';

const VERSAO = '2026-09-28';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-erp-segredo',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const resposta = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function valor(db, chave) {
  const { data } = await db.from('config_privada').select('valor').eq('chave', chave).maybeSingle();
  return data ? data.valor : null;
}

// envia um e-mail conforme o serviço escolhido na tela
async function enviarUm(cfg, msg, mailer) {
  const de = (cfg.remetente ? '"' + String(cfg.remetente).replace(/"/g, '') + '" ' : '') + '<' + cfg.usuario + '>';
  if (cfg.provedor === 'resend') {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + cfg.senha, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: de, to: [msg.para], subject: msg.assunto, html: msg.html, reply_to: cfg.responder || undefined })
    });
    if (!r.ok) throw new Error('Resend recusou (' + r.status + '): ' + (await r.text()).slice(0, 300));
    return;
  }
  // Gmail (senha de app) ou outro SMTP. Porta 465 com SSL (as portas 25 e 587 costumam ser bloqueadas).
  const host = cfg.provedor === 'gmail' ? 'smtp.gmail.com' : cfg.host;
  const porta = Number(cfg.provedor === 'gmail' ? 465 : cfg.porta || 465);
  const t = mailer.createTransport({ host, port: porta, secure: porta === 465, auth: { user: cfg.usuario, pass: cfg.senha } });
  await t.sendMail({ from: de, to: msg.para, subject: msg.assunto, html: msg.html, replyTo: cfg.responder || undefined });
}

async function processarFila(db, mailer) {
  const cfg = await valor(db, 'email');
  if (!cfg || !cfg.usuario || !cfg.senha) return { enviados: 0, erros: 0, aviso: 'E-mail ainda não configurado em Administração → E-mail.' };
  const { data: fila, error } = await db.from('email_fila').select('*').eq('status', 'pendente').lt('tentativas', 3).order('criado_em').limit(40);
  if (error) throw error;
  let enviados = 0, erros = 0, ultimoErro = '';
  for (const m of fila || []) {
    try {
      await enviarUm(cfg, m, mailer);
      await db.from('email_fila').update({ status: 'enviado', enviado_em: new Date().toISOString(), erro: '' }).eq('id', m.id);
      enviados++;
    } catch (e) {
      const t = (m.tentativas || 0) + 1;
      ultimoErro = String((e && e.message) || e).slice(0, 500);
      await db.from('email_fila').update({ tentativas: t, status: t >= 3 ? 'erro' : 'pendente', erro: ultimoErro }).eq('id', m.id);
      erros++;
    }
  }
  return { enviados, erros, ultimoErro };
}

// quem chamou: a rotina (segredo) ou um administrador logado
async function autorizado(req, db) {
  const seg = req.headers.get('x-erp-segredo');
  if (seg && seg === (await valor(db, 'segredo_funcoes'))) return { rotina: true };
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await db.auth.getUser(token);
  if (!data || !data.user) return null;
  const { data: p } = await db.from('perfis').select('id, email, nome, papel').eq('id', data.user.id).maybeSingle();
  return p && p.papel === 'admin' ? { admin: p } : null;
}

export async function tratar(req, db, mailer) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const quem = await autorizado(req, db);
    if (!quem) return resposta({ erro: 'Sem permissão.' }, 401);
    const corpo = await req.json().catch(() => ({}));
    if (corpo.acao === 'ping') return resposta({ ok: true, versao: VERSAO });
    const acao = corpo.acao || 'enviar';
    if (acao === 'teste') {
      if (!quem.admin) return resposta({ erro: 'Só o administrador envia o teste.' }, 403);
      const para = corpo.para || quem.admin.email;
      const { error } = await db.from('email_fila').insert({ usuario_id: quem.admin.id, para, tipo: 'teste',
        assunto: 'Teste do ERP — e-mail configurado',
        html: '<div style="font-family:Arial,sans-serif;font-size:14px">Se você recebeu este e-mail, os avisos do ERP estão funcionando. ✅</div>' });
      if (error) throw error;
    }
    if (acao === 'resumo') {
      const { error } = await db.rpc('montar_resumos_diarios');
      if (error) throw error;
    }
    return resposta(await processarFila(db, mailer));
  } catch (e) {
    return resposta({ erro: String((e && e.message) || e) }, 500);
  }
}

Deno.serve((req) => tratar(req,
  createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } }),
  nodemailer));
