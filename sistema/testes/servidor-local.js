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
const RECUPERACOES = [], ARQUIVOS = {}, PEDIDOS_DJEN = []; let FUNCAO = null, FUNCAO_PUB = null, FUNCAO_CNPJ = null;
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
    // cadastro (tela Administração → Novo usuário) e link de nova senha
    if (u.pathname === '/auth/v1/signup') {
      const b = JSON.parse(corpo.toString() || '{}');
      if (usuario(b.email)) return json(res, 200, { id: crypto.randomUUID(), email: b.email, identities: [] });
      sql('insert into auth.users(email,senha_teste,raw_user_meta_data) values (' + lit(b.email) + ',' + lit(b.password) + ',' + lit(JSON.stringify(b.data || {})) + ')');
      const us = usuario(b.email);
      return json(res, 200, Object.assign({}, us, { identities: [{ id: us.id }], confirmation_sent_at: new Date().toISOString() }));
    }
    if (u.pathname === '/auth/v1/recover') { RECUPERACOES.push(JSON.parse(corpo.toString() || '{}').email); return json(res, 200, {}); }
    if (u.pathname === '/__teste/recuperacoes') return json(res, 200, RECUPERACOES);
    if (u.pathname === '/auth/v1/logout') { res.writeHead(204, { 'access-control-allow-origin': '*' }); return res.end(); }
    // Storage (arquivos): guarda em memória; só aceita usuário logado
    if (u.pathname.startsWith('/storage/v1/object/')) {
      const resto = decodeURIComponent(u.pathname.replace('/storage/v1/object/', ''));
      if (resto.startsWith('sign/') && req.method === 'GET') {
        const k = resto.slice(5), arq = ARQUIVOS[k];
        if (!arq || u.searchParams.get('token') !== 'tk') { res.writeHead(404); return res.end('nao achado'); }
        res.writeHead(200, { 'content-type': 'application/octet-stream' }); return res.end(arq);
      }
      const c = lerJwt(String(req.headers.authorization || '').replace('Bearer ', ''));
      if (!c || !c.sub) return json(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
      if (resto.startsWith('sign/')) {
        const k = resto.slice(5);
        if (!ARQUIVOS[k]) return json(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
        return json(res, 200, { signedURL: '/object/sign/' + k.split('/').map(encodeURIComponent).join('/') + '?token=tk' });
      }
      if (req.method === 'POST' || req.method === 'PUT') {
        if (ARQUIVOS[resto] && req.method === 'POST') return json(res, 400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
        ARQUIVOS[resto] = corpo; return json(res, 200, { Key: resto, Id: crypto.randomUUID() });
      }
    }
    if (u.pathname === '/__teste/arquivos') return json(res, 200, Object.keys(ARQUIVOS));
    // Edge Function "erp-emails": roda o código real, com carteiro falso (as cartas ficam em /__teste/cartas)
    if (u.pathname === '/functions/v1/erp-emails') {
      try { FUNCAO = FUNCAO || require('./funcao-emails.js').carregar('http://127.0.0.1:' + PORTA); } catch (e) { console.error(e); return json(res, 500, { erro: 'Função não carregou: ' + e.message }); }
      const h = new Headers(); Object.entries(req.headers).forEach(([k, v]) => h.set(k, v));
      return FUNCAO.tratar(new Request('http://x' + u.pathname, { method: req.method, headers: h, body: req.method === 'POST' ? corpo : undefined }))
        .then(async (r2) => { const cab = { 'access-control-allow-origin': '*' }; r2.headers.forEach((v, k) => { cab[k] = v; }); res.writeHead(r2.status, cab); res.end(await r2.text()); })
        .catch((e) => json(res, 500, { erro: e.message }));
    }
    if (u.pathname === '/functions/v1/erp-publicacoes') {
      try { FUNCAO_PUB = FUNCAO_PUB || require('./funcao-emails.js').carregarPublicacoes('http://127.0.0.1:' + PORTA); } catch (e) { console.error(e); return json(res, 500, { erro: 'Função não carregou: ' + e.message }); }
      const h = new Headers(); Object.entries(req.headers).forEach(([k, v]) => h.set(k, v));
      return FUNCAO_PUB.tratar(new Request('http://x' + u.pathname, { method: req.method, headers: h, body: req.method === 'POST' ? corpo : undefined }))
        .then(async (r2) => { const cab = { 'access-control-allow-origin': '*' }; r2.headers.forEach((v, k) => { cab[k] = v; }); res.writeHead(r2.status, cab); res.end(await r2.text()); })
        .catch((e) => json(res, 500, { erro: e.message }));
    }
    // imitação da API pública do CNJ (Comunica PJe): 2 publicações para a OAB 123456/MG (dados fictícios)
    if (u.pathname === '/__teste/djen/comunicacao') {
      PEDIDOS_DJEN.push(u.search);
      const ok = u.searchParams.get('numeroOab') === '123456' && u.searchParams.get('ufOab') === 'MG' && u.searchParams.get('pagina') === '1';
      return json(res, 200, { status: 'success', count: ok ? 2 : 0, items: ok ? [
        { id: 900001, data_disponibilizacao: '2026-09-25', siglaTribunal: 'TJMG', tipoComunicacao: 'Intimação', nomeOrgao: '2ª Vara de Feitos Tributários',
          texto: '<p>Fica a parte executada INTIMADA para, no prazo de 15 dias, manifestar-se sobre a exceção de pré-executividade.</p>', numero_processo: '50000011120248130024',
          numeroprocessocommascara: '5000001-11.2024.8.13.0024', nomeClasse: 'Execução Fiscal', link: 'https://exemplo.invalido/1',
          destinatarios: [{ nome: 'ALFA COMERCIO LTDA', polo: 'P' }], destinatarioadvogados: [{ advogado: { nome: 'ADVOGADO FICTICIO', numero_oab: '123456', uf_oab: 'MG' } }] },
        { id: 900002, datadisponibilizacao: '24/09/2026', siglaTribunal: 'TRT3', tipoComunicacao: 'Edital', nomeOrgao: 'Vara do Trabalho', texto: 'Audiência designada.',
          numeroProcesso: '00012345520235030001', destinatarios: [], destinatarioadvogados: [] }
      ] : [] });
    }
    if (u.pathname === '/functions/v1/erp-cnpj') {
      try { FUNCAO_CNPJ = FUNCAO_CNPJ || require('./funcao-emails.js').carregarCnpj('http://127.0.0.1:' + PORTA); } catch (e) { console.error(e); return json(res, 500, { erro: 'Função não carregou: ' + e.message }); }
      const h = new Headers(); Object.entries(req.headers).forEach(([k, v]) => h.set(k, v));
      return FUNCAO_CNPJ.tratar(new Request('http://x' + u.pathname, { method: req.method, headers: h, body: req.method === 'POST' ? corpo : undefined }))
        .then(async (r2) => { const cab = { 'access-control-allow-origin': '*' }; r2.headers.forEach((v, k) => { cab[k] = v; }); res.writeHead(r2.status, cab); res.end(await r2.text()); })
        .catch((e) => json(res, 500, { erro: e.message }));
    }
    // imitação da BrasilAPI (dados fictícios): 11222333000181 mudou de endereço; 22333444000172 está INAPTA; o resto não existe
    if (u.pathname.startsWith('/__teste/brasilapi/')) {
      const cnpj = u.pathname.split('/').pop();
      const base = { razao_social: 'ALFA COMERCIO LTDA', nome_fantasia: 'ALFA', descricao_situacao_cadastral: 'ATIVA', data_situacao_cadastral: '2005-11-03',
        cnae_fiscal_descricao: 'Comércio varejista', porte: 'MICRO EMPRESA', data_inicio_atividade: '2005-11-03', descricao_tipo_de_logradouro: 'RUA',
        logradouro: 'DAS FLORES', numero: '100', complemento: 'SALA 2', bairro: 'CENTRO', municipio: 'BELO HORIZONTE', uf: 'MG', cep: '30110000' };
      if (cnpj === '11222333000181') return json(res, 200, base);
      if (cnpj === '22333444000172') return json(res, 200, Object.assign({}, base, { razao_social: 'BETA SERVICOS LTDA', descricao_situacao_cadastral: 'INAPTA', logradouro: 'SEM NOME' }));
      return json(res, 404, { message: 'CNPJ não encontrado' });
    }
    if (u.pathname === '/__teste/djen-pedidos') return json(res, 200, PEDIDOS_DJEN);
    if (u.pathname === '/__teste/cartas') return json(res, 200, FUNCAO ? FUNCAO.cartas.map((c) => ({ to: c.to, subject: c.subject })) : []);
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
