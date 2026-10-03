// Carrega supabase/functions/erp-emails/index.ts no Node (como o Supabase faria), com um carteiro falso.
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const { SEGREDO } = require('./servidor-local-segredo.js');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(c) { const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64(c); return h + '.' + p + '.' + crypto.createHmac('sha256', SEGREDO).update(h + '.' + p).digest('base64url'); }
function carregarFuncao(base, nome) {
  const fonte = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'functions', nome, 'index.ts'), 'utf8')
    .replace(/^import .*$/mg, '').replace(/^export\s+/mg, '').replace(/Deno\.serve\([\s\S]*$/, '') + '\nthis.tratar = tratar;';
  const ctx = { fetch: (...a) => ctx._fetch(...a), _fetch: fetch, Response, Headers, JSON, String, Number, Date, Error, console, URL, Blob, TextEncoder, TextDecoder, btoa, AbortSignal, AbortController };
  vm.createContext(ctx); vm.runInContext(fonte, ctx);
  const sbCtx = { fetch, Headers, Request, Response, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, console, TextEncoder, TextDecoder,
    crypto: globalThis.crypto, atob, btoa, Blob, FormData, WebSocket, setInterval, clearInterval, queueMicrotask, structuredClone };
  sbCtx.globalThis = sbCtx; sbCtx.self = sbCtx;
  vm.createContext(sbCtx); vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'vendor', 'supabase.js'), 'utf8'), sbCtx);
  const servico = sbCtx.supabase.createClient(base, jwt({ role: 'service_role', iss: 'teste', exp: 9999999999 }), { auth: { persistSession: false, autoRefreshToken: false } });
  return { ctx, servico };
}
function carregar(base) {
  const { ctx, servico } = carregarFuncao(base, 'erp-emails');
  const cartas = [], rascunhos = []; const estado = { falhar: false, senhaImap: null };
  const mailer = { createTransport: (o) => ({ sendMail: async (m) => {
    // Backup 44: "streamTransport" = só monta a mensagem (para o rascunho), não envia
    if (o.streamTransport) return { message: Buffer.from('From: ' + m.from + '\r\nTo: ' + m.to + '\r\nSubject: ' + m.subject + '\r\nContent-Type: text/html; charset=utf-8\r\n\r\n' + m.html +
      (m.attachments || []).map((a) => '\r\n[anexo ' + a.filename + ']').join('')) };
    if (estado.falhar) throw new Error('SMTP recusou a senha'); cartas.push(Object.assign({ _host: o.host, _porta: o.port }, m)); } }) };
  // servidor IMAP falso (em memória) — a função conversa com ele pelo mesmo código que fala com o Gmail
  const conectar = async (host, porta) => {
    const saida = []; let buf = Buffer.alloc(0), literal = 0, tagApp = '', pasta = '';
    const diz = (t) => saida.push(Buffer.from(t));
    diz('* OK Gimap ready\r\n');
    const processar = () => {
      for (;;) {
        if (literal) {
          if (buf.length < literal + 2) return;
          rascunhos.push({ host, porta, pasta, raw: buf.subarray(0, literal).toString() }); buf = buf.subarray(literal + 2); literal = 0;
          diz(tagApp + ' OK [APPENDUID 1 1] APPEND completed\r\n'); continue;
        }
        const k = buf.indexOf('\r\n'); if (k < 0) return;
        const l = buf.subarray(0, k).toString(); buf = buf.subarray(k + 2);
        const [tag, cmd] = l.split(' ');
        if (cmd === 'LOGIN') diz(estado.senhaImap && !l.includes(estado.senhaImap) ? tag + ' NO [AUTHENTICATIONFAILED] Invalid credentials (Failure)\r\n' : tag + ' OK logado\r\n');
        else if (cmd === 'LIST') diz('* LIST (\\HasNoChildren) "/" "INBOX"\r\n* LIST (\\HasNoChildren \\Drafts) "/" "[Gmail]/Rascunhos"\r\n' + tag + ' OK Success\r\n');
        else if (cmd === 'APPEND') { pasta = (l.match(/APPEND "([^"]+)"/) || [])[1]; literal = +(l.match(/\{(\d+)\}$/) || [])[1]; tagApp = tag; diz('+ go ahead\r\n'); }
        else if (cmd === 'LOGOUT') diz('* BYE\r\n' + tag + ' OK\r\n');
        else diz(tag + ' BAD\r\n');
      }
    };
    return { write: async (b) => { buf = Buffer.concat([buf, Buffer.from(b)]); processar(); return b.length; },
      read: async (u) => { const b = saida.shift(); if (!b) return null; const n = Math.min(b.length, u.length); u.set(b.subarray(0, n)); if (b.length > n) saida.unshift(b.subarray(n)); return n; },
      close: () => {} };
  };
  const gaveta = (cfg, raw) => ctx.imapRascunho(cfg, raw, conectar);
  return { tratar: (req) => ctx.tratar(req, servico, mailer, gaveta), cartas, rascunhos, estado, ctx, jwt };
}
// publicações: a "API do CNJ" é a imitação do servidor local (/__teste/djen)
function carregarPublicacoes(base) {
  const { ctx, servico } = carregarFuncao(base, 'erp-publicacoes');
  return { tratar: (req) => ctx.tratar(req, servico, fetch), ctx };
}
function carregarCnpj(base) {
  const { ctx, servico } = carregarFuncao(base, 'erp-cnpj');
  return { tratar: (req) => ctx.tratar(req, servico, fetch, async () => {}), ctx };
}
function carregarAgenda(base) {
  const { ctx, servico } = carregarFuncao(base, 'erp-agenda');
  return { tratar: (req) => ctx.tratar(req, servico), ctx };
}
function carregarBackup(base) {
  const { ctx, servico } = carregarFuncao(base, 'erp-backup');
  return { tratar: (req) => ctx.tratar(req, servico), ctx };
}
module.exports = { carregar, carregarPublicacoes, carregarCnpj, carregarAgenda, carregarBackup, jwt };
