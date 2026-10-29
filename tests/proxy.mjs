// Simula a fachada do Supabase: /auth/v1 (login por senha com JWT) e /rest/v1 -> PostgREST. Serve também o app.
import http from 'node:http'; import crypto from 'node:crypto'; import fs from 'node:fs'; import path from 'node:path';
const SEG = 'segredo-de-teste-local-com-32-caracteres!!';
const USERS = { 'jesrrael.santos@gmail.com': { id: '11111111-1111-1111-1111-111111111111', senha: 'senhaJes123' }, 'laucielly@teste.com': { id: '22222222-2222-2222-2222-222222222222', senha: 'senhaLau123' }, 'intruso@x.com': { id: '99999999-9999-9999-9999-999999999999', senha: 'intruso123' } };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (p) => { const h = b64({ alg: 'HS256', typ: 'JWT' }), c = b64(p); return `${h}.${c}.${crypto.createHmac('sha256', SEG).update(h + '.' + c).digest('base64url')}`; };
const sessao = (email) => { const u = USERS[email]; const exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: u.id, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  return { access_token: jwt({ sub: u.id, email, role: 'authenticated', aud: 'authenticated', exp }), token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r-' + email, user }; };
const WEB = '/home/claude/gf/web';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/json' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const body = await new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(d)); });
  const json = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (url.pathname.startsWith('/auth/v1/')) {
    if (url.pathname === '/auth/v1/token') {
      const b = JSON.parse(body || '{}');
      if (url.searchParams.get('grant_type') === 'refresh_token') { const e = b.refresh_token?.slice(2); return USERS[e] ? json(200, sessao(e)) : json(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' }); }
      const u = USERS[b.email]; if (!u || u.senha !== b.password) return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' });
      return json(200, sessao(b.email));
    }
    if (url.pathname === '/auth/v1/user') { const t = (req.headers.authorization || '').split('.')[1]; const p = t ? JSON.parse(Buffer.from(t, 'base64url')) : null; return p ? json(200, sessao(p.email).user) : json(401, {}); }
    if (url.pathname === '/auth/v1/logout') { res.writeHead(204); return res.end(); }
    if (url.pathname === '/auth/v1/recover') return json(200, {});
    return json(404, {});
  }
  if (url.pathname.startsWith('/rest/v1/')) {
    const alvo = 'http://localhost:3001' + req.url.replace('/rest/v1', '');
    const h = { ...req.headers }; delete h.host; delete h['content-length'];
    let r; try { r = await fetch(alvo, { method: req.method, headers: h, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }); } catch (e) { return json(502, { message: 'upstream ' + e.message }); }
    const hs = {}; r.headers.forEach((v, k) => { if (!['content-encoding', 'transfer-encoding', 'connection'].includes(k)) hs[k] = v; });
    const buf = Buffer.from(await r.arrayBuffer()); if (r.status >= 400) console.log('ERRO', r.status, req.method, req.url, body.slice(0, 300), buf.toString().slice(0, 300)); res.writeHead(r.status, hs); return res.end(buf);
  }
  if (url.pathname.startsWith('/realtime') || url.pathname.startsWith('/storage')) return json(404, {});
  if (url.pathname === '/config.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(`window.GF_CONFIG={SUPABASE_URL:'http://localhost:8090',SUPABASE_ANON_KEY:'${jwt({ role: 'anon', exp: 9999999999 })}'};`); }
  let f = path.join(WEB, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!f.startsWith(WEB) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(8090, () => console.log('proxy 8090'));
