// Servidor de teste: imita o Supabase (login + API do banco) e serve as telas.
// Uso: node servidor-local.js  (precisa do PostgreSQL local e do PostgREST)
const http = require('http'), crypto = require('crypto'), fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres!!';
const PORTA = +(process.env.PORTA || 8090), PGRST = 'http://127.0.0.1:3001';
const PSQL = ['-h', '127.0.0.1', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', 'erp', '-tAc'];
const APP = path.join(__dirname, '..', 'app');
const REGRAS = JSON.parse(fs.readFileSync(path.join(APP, 'vercel.json'), 'utf8')).headers
  .map((r) => ({ re: new RegExp('^(?:' + r.source + ')$'), headers: r.headers }));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(claims) {
  const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64(claims);
  return h + '.' + p + '.' + crypto.createHmac('sha256', SEGREDO).update(h + '.' + p).digest('base64url');
}
function lerJwt(t) {
  try { const [h, p, s] = t.split('.');
    if (crypto.createHmac('sha256', SEGREDO).update(h + '.' + p).digest('base64url') !== s) return null;
    return JSON.parse(Buffer.from(p, 'base64url').toString()); } catch (e) { return null; }
}
const ANON = jwt({ role: 'anon', iss: 'teste', exp: 9999999999 });
function sql(q) { return execFileSync('psql', PSQL.concat([q])).toString().trim(); }
function usuario(email, senha) {
  const r = sql("select id||'|'||email from auth.users where email=" + lit(email) + (senha != null ? ' and senha_teste=' + lit(senha) : ''));
  if (!r) return null; const [id, em] = r.split('|'); return { id, email: em, aud: 'authenticated', role: 'authenticated' };
}
function lit(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }
function sessao(u) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return { access_token: jwt({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp }),
           token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r-' + u.email, user: u };
}
function json(res, cod, obj) { res.writeHead(cod, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(obj)); }
http.createServer((req, res) => {
  let corpo = []; req.on('data', (c) => corpo.push(c)); req.on('end', () => {
    corpo = Buffer.concat(corpo); const u = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }); return res.end(); }
    if (u.pathname === '/auth/v1/token') {
      const b = JSON.parse(corpo.toString() || '{}');
      if (u.searchParams.get('grant_type') === 'password') {
        const us = usuario(b.email, b.password);
        return us ? json(res, 200, sessao(us)) : json(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials', code: 400 });
      }
      const us = usuario(String(b.refresh_token || '').slice(2));
      return us ? json(res, 200, sessao(us)) : json(res, 400, { error: 'invalid_grant' });
    }
    if (u.pathname === '/auth/v1/user') {
      const c = lerJwt(String(req.headers.authorization || '').replace('Bearer ', ''));
      return c && c.sub ? json(res, 200, { id: c.sub, email: c.email, aud: 'authenticated', role: 'authenticated' }) : json(res, 401, { msg: 'invalid JWT' });
    }
    if (u.pathname === '/auth/v1/logout') { res.writeHead(204, { 'access-control-allow-origin': '*' }); return res.end(); }
    if (u.pathname.startsWith('/rest/v1/')) {
      const alvo = PGRST + u.pathname.replace('/rest/v1', '') + u.search;
      const h = Object.assign({}, req.headers); delete h.host; delete h['content-length'];
      const r2 = http.request(alvo, { method: req.method, headers: h }, (r) => {
        res.writeHead(r.statusCode, Object.assign({}, r.headers, { 'access-control-allow-origin': '*' })); r.pipe(res);
      });
      r2.on('error', (e) => json(res, 502, { message: e.message })); r2.end(corpo); return;
    }
    let f = path.join(APP, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
    if (!f.startsWith(APP) || !fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
    if (f.endsWith('config.js')) {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      return res.end("window.ERP_CONFIG={url:location.origin,chave:'" + ANON + "'};");
    }
    const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
    // mesmos cabeçalhos de segurança da Vercel (CSP etc.), lidos do vercel.json
    const cab = { 'content-type': tipos[path.extname(f)] || 'application/octet-stream' };
    const caminho = '/' + path.relative(APP, f).split(path.sep).join('/');
    REGRAS.forEach((r) => { if (r.re.test(caminho) || (caminho === '/index.html' && r.re.test('/'))) r.headers.forEach((h) => { cab[h.key] = h.value; }); });
    res.writeHead(200, cab);
    fs.createReadStream(f).pipe(res);
  });
}).listen(PORTA, () => console.log('servidor de teste em http://127.0.0.1:' + PORTA));
module.exports = { SEGREDO };
