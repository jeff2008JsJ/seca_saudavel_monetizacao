require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const db = new Database(path.join(__dirname, 'seca-saudavel.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS subscriptions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL REFERENCES users(id),
 mp_preapproval_id TEXT UNIQUE,
 status TEXT NOT NULL,
 init_point TEXT,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sub_user ON subscriptions(user_id);
`);

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const PRICE = 19.90;
const isProd = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.use(express.json({ limit: '30kb' }));
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: __dirname }),
  secret: process.env.SESSION_SECRET || 'DEV_ONLY_CHANGE_THIS_SECRET',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname)));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const requireAuth = (req, res, next) => req.session.userId ? next() : res.status(401).json({ error: 'Faça login para continuar.' });
const getUser = id => db.prepare('SELECT id,name,email FROM users WHERE id=?').get(id);
const activeSub = userId => db.prepare("SELECT * FROM subscriptions WHERE user_id=? AND status='authorized' ORDER BY id DESC LIMIT 1").get(userId);

app.post('/api/auth/register', authLimiter, async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  const email = String(req.body.email || '').trim().toLowerCase().slice(0, 190);
  const password = String(req.body.password || '');
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10) {
    return res.status(400).json({ error: 'Informe nome, e-mail válido e senha com pelo menos 10 caracteres.' });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const info = db.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)').run(name, email, hash);
    req.session.userId = Number(info.lastInsertRowid);
    res.json({ user: getUser(req.session.userId), premium: false });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
    console.error(e); res.status(500).json({ error: 'Não foi possível criar a conta.' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const row = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!row || !(await bcrypt.compare(password, row.password_hash))) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Falha ao iniciar sessão.' });
    req.session.userId = row.id;
    res.json({ user: getUser(row.id), premium: !!activeSub(row.id) });
  });
});

app.post('/api/auth/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null, premium: false });
  const user = getUser(req.session.userId);
  if (!user) { req.session.destroy(() => {}); return res.json({ user: null, premium: false }); }
  const sub = activeSub(user.id);
  res.json({ user, premium: !!sub, subscriptionStatus: sub?.status || 'free' });
});

app.post('/api/subscription/checkout', requireAuth, async (req, res) => {
  if (!process.env.MP_ACCESS_TOKEN || !process.env.MP_ACCESS_TOKEN.startsWith('APP_USR-') && !process.env.MP_ACCESS_TOKEN.startsWith('TEST-')) {
    return res.status(503).json({ error: 'Configure MP_ACCESS_TOKEN no arquivo .env antes de habilitar pagamentos.' });
  }
  if (activeSub(req.session.userId)) return res.status(409).json({ error: 'Sua assinatura Premium já está ativa.' });
  const user = db.prepare('SELECT id,email FROM users WHERE id=?').get(req.session.userId);
  const payload = {
    reason: 'Projeto Seca Saudável Premium - assinatura mensal',
    external_reference: String(user.id),
    payer_email: process.env.NODE_ENV === 'development'
  ? process.env.MP_TEST_PAYER_EMAIL
  : user.email,
    auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: PRICE, currency_id: 'BRL' },
    back_url: `${BASE_URL}/?assinatura=retorno`,
    notification_url: `${BASE_URL}/api/webhooks/mercadopago`,
    status: 'pending'
  };
  try {
    const response = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok || !data.init_point || !data.id) {
      console.error('Mercado Pago subscription error:', data);
      return res.status(502).json({ error: 'O Mercado Pago não conseguiu iniciar a assinatura. Verifique as credenciais e a conta.' });
    }
    db.prepare('INSERT INTO subscriptions(user_id,mp_preapproval_id,status,init_point) VALUES(?,?,?,?)')
      .run(user.id, String(data.id), String(data.status || 'pending'), data.init_point);
    res.json({ checkoutUrl: data.init_point });
  } catch (e) { console.error(e); res.status(502).json({ error: 'Falha de comunicação com o Mercado Pago.' }); }
});

// O conteúdo premium é entregue pelo servidor somente após verificar a assinatura.
app.get('/api/premium/content', requireAuth, (req, res) => {
  if (!activeSub(req.session.userId)) return res.status(403).json({ error: 'Conteúdo exclusivo para assinantes Premium.' });
  res.json({
    plan: 'Projeto Seca Saudável Premium',
    price: 'R$ 19,90/mês',
    benefits: ['Biblioteca premium de receitas e materiais', 'Novos desafios mensais', 'Materiais extras para organização alimentar']
  });
});

function validWebhook(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return false;
  const signature = req.get('x-signature') || '';
  const requestId = req.get('x-request-id') || '';
  const dataId = String(req.query['data.id'] || req.body?.data?.id || '').toLowerCase();
  const parts = Object.fromEntries(signature.split(',').map(p => p.trim().split('=')));
  if (!parts.ts || !parts.v1 || !requestId || !dataId) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(expected); const b = Buffer.from(parts.v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.post('/api/webhooks/mercadopago', async (req, res) => {
  if (!validWebhook(req)) return res.status(401).send('Assinatura inválida');
  const type = req.body?.type || req.query.type;
  const id = String(req.body?.data?.id || req.query['data.id'] || '');
  if (type !== 'subscription_preapproval' || !id) return res.sendStatus(200);
  try {
    const response = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });
    if (!response.ok) return res.sendStatus(500);
    const subscription = await response.json();
    const userId = Number(subscription.external_reference);
    if (!Number.isInteger(userId) || userId <= 0) return res.sendStatus(200);
    const status = String(subscription.status || 'pending');
    db.prepare(`INSERT INTO subscriptions(user_id,mp_preapproval_id,status,init_point,updated_at)
      VALUES(?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(mp_preapproval_id) DO UPDATE SET status=excluded.status, updated_at=CURRENT_TIMESTAMP`)
      .run(userId, String(subscription.id), status, subscription.init_point || null);
    return res.sendStatus(200);
  } catch (e) { console.error('Webhook error:', e); return res.sendStatus(500); }
});

app.get('/health', (_req, res) => res.json({ ok: true, app: 'Projeto Seca Saudável', version: '4.0.0' }));
app.listen(PORT, () => console.log(`Projeto Seca Saudável em http://localhost:${PORT}`));
