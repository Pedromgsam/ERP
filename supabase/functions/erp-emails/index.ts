// Função "erp-emails" do Supabase (Edge Functions): envia os e-mails da fila do ERP.
// Como publicar (sem instalar nada): Supabase → Edge Functions → Deploy a new function → Via Editor,
// nome "erp-emails", cole este arquivo inteiro e clique em Deploy. Depois, nos detalhes da função,
// DESLIGUE "Verify JWT" (a própria função confere quem chamou).
// Ações (corpo JSON {"acao": ...}):
//   "enviar" → envia os pendentes (a rotina chama a cada 5 min; o admin pelo botão "Enviar agora")
//   "teste"  → põe um e-mail de teste para o admin e envia
//   "resumo" → monta o resumo do dia de cada pessoa e envia
//   "rascunho" (Backup 44, com "ref") → em vez de enviar, guarda o e-mail na pasta Rascunhos do Gmail (IMAP, mesma senha de app)
// E-mail com anexo {tipo:'recibo', dados} (Recebido → recibo): o PDF do recibo é montado aqui, sem biblioteca.
// Backup 26: anexo {tipo:'ics', arquivo, conteudo} (convite de reunião) e vários destinatários em "para" (separados por vírgula).
// Backup 28: anexo {tipo:'arquivos', lista:[{caminho, arquivo}]} (várias guias num e-mail só) e remetente por empresa:
//   email_fila.conta = 'contabilidade' usa a conta de e-mail da Contabilidade (config_privada 'email_contab'), o resto a do escritório.
// Quem pode chamar: a rotina do banco (cabeçalho x-erp-segredo) ou um administrador logado.
// A senha do Gmail/SMTP/Resend fica no banco (config_privada) — nunca no site.
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.14';

const VERSAO = '2026-10-04';
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

// ─────────── PDF do recibo (texto simples, Helvetica, A4) ───────────
const WIN = { '—': 0x97, '–': 0x96, '“': 0x93, '”': 0x94, '‘': 0x91, '’': 0x92, '•': 0x95, '€': 0x80, 'º': 0xBA, 'ª': 0xAA };
function latin1(t) {
  const out = [];
  for (const ch of String(t || '')) {
    const c = ch.codePointAt(0);
    out.push(WIN[ch] || (c < 256 ? c : 0x3F));
  }
  return out;
}
function pdfTexto(t) {   // string PDF entre parênteses, com escape
  return '(' + latin1(t).map((c) => (c === 0x28 || c === 0x29 || c === 0x5C) ? '\\' + String.fromCharCode(c) : c < 32 || c > 126 ? '\\' + c.toString(8).padStart(3, '0') : String.fromCharCode(c)).join('') + ')';
}
function quebrar(t, max) {
  const linhas = []; let atual = '';
  for (const p of String(t || '').split(/\s+/)) { if ((atual + ' ' + p).trim().length > max) { if (atual) linhas.push(atual); atual = p; } else atual = (atual + ' ' + p).trim(); }
  if (atual) linhas.push(atual); return linhas;
}
export function pdfRecibo(d) {
  const ops = [];
  const txt = (x, y, tam, s, negrito) => ops.push('BT /' + (negrito ? 'F2' : 'F1') + ' ' + tam + ' Tf ' + x + ' ' + y + ' Td ' + pdfTexto(s) + ' Tj ET');
  // faixa da marca
  ops.push('0.106 0.165 0.290 rg 0 772 595 70 re f', '0.788 0.659 0.298 rg 0 768 595 4 re f');
  ops.push('1 1 1 rg'); txt(50, 808, 18, 'ARAÚJO & CASTRO', true); txt(50, 790, 9, 'ADVOCACIA E CONSULTORIA', false); ops.push('0 0 0 rg');
  txt(50, 720, 22, 'RECIBO', true); txt(400, 720, 11, 'Nº ' + (d.numero || ''), false);
  ops.push('0.95 0.96 0.98 rg 380 680 165 30 re f 0 0 0 rg'); txt(392, 690, 15, d.valor_txt || '', true);
  const corpo = (d.emitente || '') + (d.qualif ? ', ' + d.qualif : '') + ', declara que recebeu de ' + (d.pagador || '') + (d.doc ? ', inscrito(a) no CPF/CNPJ sob o n. ' + d.doc : '') +
    ', a quantia de ' + (d.valor_txt || '') + ' (' + (d.extenso || '') + '), referente a ' + (d.referente || '') + ', dando plena e geral quitação do valor recebido.';
  let y = 640;
  for (const l of quebrar(corpo, 92)) { txt(50, y, 11.5, l, false); y -= 17; }
  y -= 20; txt(50, y, 11.5, (d.local ? d.local + ', ' : '') + (d.data_extenso || d.data || '') + '.', false);
  y -= 90; ops.push('0.5 0.5 0.5 RG 180 ' + (y + 14) + ' m 415 ' + (y + 14) + ' l S');
  txt(297 - Math.min(117, (d.emitente || '').length * 3), y, 11, d.emitente || '', true); if (d.oab) txt(297 - d.oab.length * 2.6, y - 15, 10, d.oab, false);
  ops.push('0.85 0.85 0.85 RG 50 60 m 545 60 l S'); txt(50, 45, 8, 'Recibo emitido pelo sistema do escritório Araújo & Castro.', false);
  const conteudo = ops.join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Length ' + conteudo.length + ' >>\nstream\n' + conteudo + '\nendstream'
  ];
  let pdf = '%PDF-1.4\n'; const pos = [];
  objs.forEach((o, i) => { pos.push(pdf.length); pdf += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xref = pdf.length;
  pdf += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + pos.map((p) => String(p).padStart(10, '0') + ' 00000 n \n').join('') +
    'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  // o conteúdo já é ASCII (acentos viram \ooo), então cada caractere = 1 byte
  const bytes = new Uint8Array(pdf.length); for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xFF;
  return bytes;
}
function base64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); }
// "a@x.com, b@y.com" → ['a@x.com', 'b@y.com']
const destinos = (para) => String(para || '').split(/[,;]\s*/).map((x) => x.trim()).filter(Boolean);
function anexos(msg) {
  if (msg.anexo && msg.anexo.tipo === 'lista') return (msg.anexo.itens || []).flatMap((a) => anexos({ anexo: a }));
  if (msg.anexo && msg.anexo.tipo === 'ics' && msg.anexo.conteudo) {
    return [{ filename: String(msg.anexo.arquivo || 'convite.ics').replace(/[\\/:*?"<>|]/g, '-'), content: base64(new TextEncoder().encode(String(msg.anexo.conteudo))), tipo: 'text/calendar' }];
  }
  // Backup 27: arquivo guardado em Documentos (ex.: a guia do parcelamento/acordo), já baixado em processarFila
  if (msg.anexo && msg.anexo.tipo === 'bin' && msg.anexo.b64) {
    return [{ filename: String(msg.anexo.arquivo || 'guia.pdf').replace(/[\\/:*?"<>|]/g, '-'), content: msg.anexo.b64, tipo: msg.anexo.mime || 'application/pdf' }];
  }
  if (!msg.anexo || msg.anexo.tipo !== 'recibo' || !msg.anexo.dados) return [];
  return [{ filename: String(msg.anexo.arquivo || 'Recibo.pdf').replace(/[\\/:*?"<>|]/g, '-'), content: base64(pdfRecibo(msg.anexo.dados)) }];
}

// envia um e-mail conforme o serviço escolhido na tela
async function enviarUm(cfg, msg, mailer) {
  const de = (cfg.remetente ? '"' + String(cfg.remetente).replace(/"/g, '') + '" ' : '') + '<' + cfg.usuario + '>';
  if (cfg.provedor === 'resend') {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + cfg.senha, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: de, to: destinos(msg.para), subject: msg.assunto, html: msg.html, reply_to: cfg.responder || undefined, attachments: anexos(msg).length ? anexos(msg).map((a) => ({ filename: a.filename, content: a.content })) : undefined })
    });
    if (!r.ok) throw new Error('Resend recusou (' + r.status + '): ' + (await r.text()).slice(0, 300));
    return;
  }
  // Gmail (senha de app) ou outro SMTP. Porta 465 com SSL (as portas 25 e 587 costumam ser bloqueadas).
  const host = cfg.provedor === 'gmail' ? 'smtp.gmail.com' : cfg.host;
  const porta = Number(cfg.provedor === 'gmail' ? 465 : cfg.porta || 465);
  const t = mailer.createTransport({ host, port: porta, secure: porta === 465, auth: { user: cfg.usuario, pass: cfg.senha } });
  await t.sendMail(opcoesEmail(cfg, msg));
}
function opcoesEmail(cfg, msg) {
  const de = (cfg.remetente ? '"' + String(cfg.remetente).replace(/"/g, '') + '" ' : '') + '<' + cfg.usuario + '>';
  return { from: de, to: destinos(msg.para).join(', '), subject: msg.assunto, html: msg.html, replyTo: cfg.responder || undefined,
    attachments: anexos(msg).map((a) => ({ filename: a.filename, content: a.content, encoding: 'base64', contentType: a.tipo || 'application/pdf' })) };
}

// ─────────── Backup 44: rascunho no Gmail (IMAP APPEND na pasta Rascunhos) ───────────
// conectar(host, porta) devolve { read(Uint8Array) → n|null, write(Uint8Array) → n, close() } — no Supabase é Deno.connectTls.
// raw = a mensagem pronta (RFC 822), montada pelo próprio nodemailer.
export async function imapRascunho(cfg, raw, conectar) {
  const host = cfg.provedor === 'gmail' ? 'imap.gmail.com' : (cfg.imap || String(cfg.host || '').replace(/^smtp\./i, 'imap.'));
  if (!host) throw new Error('Não sei o servidor IMAP desta conta de e-mail.');
  const con = await conectar(host, 993);
  const enc = new TextEncoder(), dec = new TextDecoder(), pedaco = new Uint8Array(65536);
  let buf = '';
  const escrever = async (b) => { let i = 0; while (i < b.length) i += await con.write(b.subarray(i)); };
  const linha = async () => {
    for (;;) {
      const k = buf.indexOf('\r\n');
      if (k >= 0) { const l = buf.slice(0, k); buf = buf.slice(k + 2); return l; }
      const n = await con.read(pedaco);
      if (n === null) throw new Error('o servidor de e-mail fechou a conexão');
      buf += dec.decode(pedaco.subarray(0, n), { stream: true });
    }
  };
  const ate = async (tag, oque) => {   // lê até a resposta com a etiqueta; erro se não for OK
    const lidas = [];
    for (;;) { const l = await linha(); lidas.push(l); if (l.startsWith(tag + ' ')) { if (!/^\S+ OK/i.test(l)) throw new Error(oque + ' (' + l.slice(tag.length + 1) + ')'); return lidas; } }
  };
  const aspas = (t) => '"' + String(t).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  let pasta = '"[Gmail]/Drafts"';
  try {
    await linha();   // "* OK ... ready"
    await escrever(enc.encode('a1 LOGIN ' + aspas(cfg.usuario) + ' ' + aspas(cfg.senha) + '\r\n'));
    await ate('a1', 'o Gmail recusou o login (use a senha de app de 16 letras)');
    await escrever(enc.encode('a2 LIST "" "*"\r\n'));
    const l = (await ate('a2', 'não consegui ler as pastas')).find((x) => /^\* LIST \([^)]*\\Drafts/i.test(x));
    const m = l && l.match(/("(?:[^"\\]|\\.)*"|[^\s"]+)\s*$/);
    if (m) pasta = m[1].charAt(0) === '"' ? m[1] : aspas(m[1]);
    await escrever(enc.encode('a3 APPEND ' + pasta + ' (\\Draft \\Seen) {' + raw.length + '}\r\n'));
    const c = await linha();
    if (c.charAt(0) !== '+') throw new Error('o Gmail não aceitou o rascunho (' + c + ')');
    await escrever(raw); await escrever(enc.encode('\r\n'));
    await ate('a3', 'o Gmail não guardou o rascunho');
    await escrever(enc.encode('a4 LOGOUT\r\n'));
  } finally { try { con.close(); } catch (e) { /* já fechou */ } }
  return pasta.replace(/^"|"$/g, '');
}

async function baixarAnexo(db, a) {
  const { data: arq, error: eArq } = await db.storage.from('documentos').download(a.caminho);
  if (eArq || !arq) throw new Error('Não consegui ler o anexo em Documentos: ' + ((eArq && eArq.message) || a.caminho));
  return { tipo: 'bin', arquivo: a.arquivo, mime: a.mime || arq.type || 'application/pdf', b64: base64(new Uint8Array(await arq.arrayBuffer())) };
}
async function prepararAnexo(db, m) {
  const baixar = (a) => baixarAnexo(db, a);
  // Backup 27: anexo que está no Storage ("documentos") — baixa antes de enviar
  if (m.anexo && m.anexo.tipo === 'arquivo' && m.anexo.caminho) m.anexo = await baixar(m.anexo);
  if (m.anexo && m.anexo.tipo === 'arquivos') m.anexo = { tipo: 'lista', itens: await Promise.all((m.anexo.lista || []).filter((a) => a && a.caminho).map(baixar)) };
  // Backup 29: lista mista — PDFs que vieram direto da tela (bin, não ficam guardados) e arquivos de Documentos
  if (m.anexo && m.anexo.tipo === 'lista') m.anexo = { tipo: 'lista', itens: await Promise.all((m.anexo.itens || []).map((a) => (a && a.tipo === 'arquivo' && a.caminho ? baixar(a) : a))) };
}
// o PDF anexado na tela não fica guardado: depois de enviar, só o nome do arquivo fica no registro
const semArquivo = (a) => (a && (a.tipo === 'lista' || a.tipo === 'bin') ? { tipo: 'enviado', arquivos: (a.tipo === 'lista' ? a.itens : [a]).map((x) => x && x.arquivo).filter(Boolean) } : undefined);

// Backup 44: os e-mails marcados como "rascunho" (status 'rascunho') daquela ref vão para a pasta Rascunhos do Gmail
async function salvarRascunhos(db, mailer, ref, gaveta) {
  const cfg = await valor(db, 'email'), cfgContab = await valor(db, 'email_contab');
  if (!cfg || !cfg.usuario || !cfg.senha) return { rascunhos: 0, erros: 0, aviso: 'E-mail ainda não configurado em Administração → E-mail.' };
  const contaDe = (m) => (m.conta === 'contabilidade' && cfgContab && cfgContab.usuario && cfgContab.senha ? cfgContab : cfg);
  const { data: fila, error } = await db.from('email_fila').select('*').eq('referencia', String(ref)).eq('status', 'rascunho');
  if (error) throw error;
  let rascunhos = 0, erros = 0, ultimoErro = '', pasta = '';
  for (const m of fila || []) {
    try {
      const c = contaDe(m);
      if (c.provedor === 'resend') throw new Error('O rascunho só funciona com Gmail ou SMTP (o Resend não tem caixa de rascunhos).');
      await prepararAnexo(db, m);
      const info = await mailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' }).sendMail(opcoesEmail(c, m));
      pasta = await gaveta(c, info.message);
      const limpo = semArquivo(m.anexo);
      await db.from('email_fila').update(Object.assign({ status: 'rascunho_salvo', enviado_em: new Date().toISOString(), erro: '' }, limpo ? { anexo: limpo } : {})).eq('id', m.id);
      rascunhos++;
    } catch (e) {
      ultimoErro = String((e && e.message) || e).slice(0, 500);
      await db.from('email_fila').update({ tentativas: (m.tentativas || 0) + 1, erro: ultimoErro }).eq('id', m.id);
      erros++;
    }
  }
  return { rascunhos, erros, ultimoErro, pasta };
}

async function processarFila(db, mailer, ref) {
  const cfg = await valor(db, 'email'), cfgContab = await valor(db, 'email_contab');
  if (!cfg || !cfg.usuario || !cfg.senha) return { enviados: 0, erros: 0, aviso: 'E-mail ainda não configurado em Administração → E-mail.' };
  // Backup 28: clientes da Contabilidade saem pela conta da Contabilidade (se estiver configurada)
  const contaDe = (m) => (m.conta === 'contabilidade' && cfgContab && cfgContab.usuario && cfgContab.senha ? cfgContab : cfg);
  const { data: lote, error } = await db.from('email_fila').select('*').eq('status', 'pendente').lt('tentativas', 3).order('criado_em').limit(40);
  if (error) throw error;
  // Backup 42: o e-mail que a pessoa acabou de mandar ("ref") passa na frente da fila
  let fila = lote || [];
  if (ref) { const { data: meu } = await db.from('email_fila').select('*').eq('referencia', String(ref)).eq('status', 'pendente');
    fila = (meu || []).concat(fila.filter((m) => !(meu || []).some((x) => x.id === m.id))); }
  let enviados = 0, erros = 0, ultimoErro = '';
  for (const m of fila || []) {
    try {
      await prepararAnexo(db, m);
      await enviarUm(contaDe(m), m, mailer);
      const limpo = semArquivo(m.anexo);
      await db.from('email_fila').update(Object.assign({ status: 'enviado', enviado_em: new Date().toISOString(), erro: '' }, limpo ? { anexo: limpo } : {})).eq('id', m.id);
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

// quem chamou: a rotina (segredo), um administrador logado ou (Backup 42, só para "enviar") alguém da equipe —
// assim o e-mail sai na hora em que a pessoa clica em Enviar, sem esperar a rotina de 5 minutos
async function autorizado(req, db) {
  const seg = req.headers.get('x-erp-segredo');
  if (seg && seg === (await valor(db, 'segredo_funcoes'))) return { rotina: true };
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await db.auth.getUser(token);
  if (!data || !data.user) return null;
  const { data: p } = await db.from('perfis').select('id, email, nome, papel').eq('id', data.user.id).maybeSingle();
  if (p && p.papel === 'admin') return { admin: p };
  return p && p.papel === 'equipe' ? { equipe: p } : null;
}

export async function tratar(req, db, mailer, gaveta) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const quem = await autorizado(req, db);
    if (!quem) return resposta({ erro: 'Sem permissão.' }, 401);
    const corpo = await req.json().catch(() => ({}));
    if (corpo.acao === 'ping') return resposta({ ok: true, versao: VERSAO });
    const acao = corpo.acao || 'enviar';
    if (quem.equipe && acao !== 'enviar' && acao !== 'rascunho') return resposta({ erro: 'Só o administrador.' }, 403);
    if (acao === 'rascunho') {
      if (!corpo.ref) return resposta({ erro: 'Falta a referência do e-mail.' }, 400);
      const r = await salvarRascunhos(db, mailer, corpo.ref, gaveta || ((c, raw) => imapRascunho(c, raw, (h, p) => Deno.connectTls({ hostname: h, port: p }))));
      const { data: m } = await db.from('email_fila').select('status, erro, para').eq('referencia', String(corpo.ref)).order('criado_em', { ascending: false }).limit(1).maybeSingle();
      r.item = m || null;
      return resposta(r);
    }
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
    const r = await processarFila(db, mailer, corpo.ref);
    // Backup 42: com "ref", devolve a situação real daquele e-mail (enviado, erro e o motivo) para a tela mostrar
    if (corpo.ref) {
      const { data: m } = await db.from('email_fila').select('status, erro, para').eq('referencia', String(corpo.ref)).order('criado_em', { ascending: false }).limit(1).maybeSingle();
      r.item = m || null;
    }
    return resposta(r);
  } catch (e) {
    return resposta({ erro: String((e && e.message) || e) }, 500);
  }
}

Deno.serve((req) => tratar(req,
  createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } }),
  nodemailer));
