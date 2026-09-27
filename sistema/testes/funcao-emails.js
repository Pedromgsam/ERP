// Carrega supabase/functions/erp-emails/index.ts no Node (como o Supabase faria), com um carteiro falso.
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const { SEGREDO } = require('./servidor-local-segredo.js');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(c) { const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64(c); return h + '.' + p + '.' + crypto.createHmac('sha256', SEGREDO).update(h + '.' + p).digest('base64url'); }
function carregar(base) {
  const fonte = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'functions', 'erp-emails', 'index.ts'), 'utf8')
    .replace(/^import .*$/mg, '').replace(/export async function/g, 'async function').replace(/Deno\.serve\([\s\S]*$/, '') + '\nthis.tratar = tratar;';
  const ctx = { fetch: (...a) => ctx._fetch(...a), _fetch: fetch, Response, Headers, JSON, String, Number, Date, Error, console, URL };
  vm.createContext(ctx); vm.runInContext(fonte, ctx);
  const sbCtx = { fetch, Headers, Request, Response, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, console, TextEncoder, TextDecoder,
    crypto: globalThis.crypto, atob, btoa, Blob, FormData, WebSocket, setInterval, clearInterval, queueMicrotask, structuredClone };
  sbCtx.globalThis = sbCtx; sbCtx.self = sbCtx;
  vm.createContext(sbCtx); vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'vendor', 'supabase.js'), 'utf8'), sbCtx);
  const servico = sbCtx.supabase.createClient(base, jwt({ role: 'service_role', iss: 'teste', exp: 9999999999 }), { auth: { persistSession: false, autoRefreshToken: false } });
  const cartas = []; const estado = { falhar: false };
  const mailer = { createTransport: (o) => ({ sendMail: async (m) => { if (estado.falhar) throw new Error('SMTP recusou a senha'); cartas.push(Object.assign({ _host: o.host, _porta: o.port }, m)); } }) };
  return { tratar: (req) => ctx.tratar(req, servico, mailer), cartas, estado, ctx, jwt };
}
module.exports = { carregar, jwt };
