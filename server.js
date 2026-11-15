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
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
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
CREATE TABLE IF NOT EXISTS user_gym_data (
 user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 data_json TEXT NOT NULL DEFAULT '{}',
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
// URL pública exclusiva para notificações do Mercado Pago. Configure MP_WEBHOOK_URL no .env.
const MP_WEBHOOK_URL = (process.env.MP_WEBHOOK_URL || `${BASE_URL}/api/webhooks/mercadopago`).replace(/\/$/, '');
if (/localhost|127\.0\.0\.1/i.test(MP_WEBHOOK_URL)) {
  console.warn('ATENÇÃO: MP_WEBHOOK_URL aponta para localhost; o Mercado Pago não consegue acessar esse endereço. Configure a URL pública do ngrok no .env.');
}
const PRICE = 19.90;
const isProd = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: __dirname }),
  secret: process.env.SESSION_SECRET || 'DEV_ONLY_CHANGE_THIS_SECRET',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

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

// Dados da Academia são armazenados por usuário no SQLite, nunca por e-mail enviado pelo navegador.
app.get('/api/gym/data', requireAuth, (req, res) => {
  const row = db.prepare('SELECT data_json, updated_at FROM user_gym_data WHERE user_id=?').get(req.session.userId);
  let data = {};
  try { data = row ? JSON.parse(row.data_json) : {}; } catch (_) { data = {}; }
  res.json({ data, updatedAt: row?.updated_at || null });
});

app.put('/api/gym/data', requireAuth, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const allowed = ['routine', 'calendar', 'logs', 'performance'];
  const data = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, key)) data[key] = body[key];
  }
  if (JSON.stringify(data).length > 900000) return res.status(413).json({ error: 'Os dados da Academia excedem o limite permitido.' });
  if (Array.isArray(data.logs) && data.logs.length > 100) data.logs = data.logs.slice(0, 100);
  if (Array.isArray(data.performance) && data.performance.length > 500) data.performance = data.performance.slice(0, 500);
  const json = JSON.stringify(data);
  db.prepare(`INSERT INTO user_gym_data(user_id,data_json,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET data_json=excluded.data_json, updated_at=CURRENT_TIMESTAMP`).run(req.session.userId, json);
  res.json({ ok: true, updatedAt: new Date().toISOString() });
});
app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null, premium: false });
  const user = getUser(req.session.userId);
  if (!user) { req.session.destroy(() => {}); return res.json({ user: null, premium: false }); }
  const sub = activeSub(user.id);
  res.json({ user, premium: !!sub, subscriptionStatus: sub?.status || 'free' });
});


app.post('/api/subscription/checkout', requireAuth, async (req, res) => {
  if (!process.env.MP_ACCESS_TOKEN || !process.env.MP_ACCESS_TOKEN.trim()) {
    return res.status(503).json({
      error: 'Configure MP_ACCESS_TOKEN no arquivo .env antes de habilitar pagamentos.'
    });
  }

  if (activeSub(req.session.userId)) {
    return res.status(409).json({
      error: 'Sua assinatura Premium já está ativa.'
    });
  }

  const user = db.prepare(
    'SELECT id, email FROM users WHERE id=?'
  ).get(req.session.userId);

  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  const payerEmail =
    process.env.NODE_ENV === 'development' && process.env.MP_TEST_PAYER_EMAIL
      ? process.env.MP_TEST_PAYER_EMAIL
      : user.email;

  const payload = {
    reason: 'Projeto Seca Saudável Premium - assinatura mensal',
    external_reference: String(user.id),
    payer_email: payerEmail,
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: PRICE,
      currency_id: 'BRL'
    },
    back_url: `${BASE_URL}/?assinatura=retorno`,
    notification_url: MP_WEBHOOK_URL,
    status: 'pending'
  };

  try {
    const response = await fetch(
      'https://api.mercadopago.com/preapproval',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );

    const responseText = await response.text();
    let data = {};

    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch (erro) {
      console.error(
        'Resposta inválida do Mercado Pago:',
        response.status,
        responseText
      );

      return res.status(502).json({
        error: 'O Mercado Pago retornou uma resposta inválida.'
      });
    }

    if (!response.ok || !data.init_point || !data.id) {
      console.error(
        'Erro na assinatura Mercado Pago:',
        response.status,
        data
      );

      return res.status(502).json({
        error: data.message || 'Não foi possível iniciar a assinatura.'
      });
    }

    db.prepare(`
      INSERT INTO subscriptions
      (user_id, mp_preapproval_id, status, init_point)
      VALUES (?, ?, ?, ?)
    `).run(
      user.id,
      String(data.id),
      String(data.status || 'pending'),
      data.init_point
    );

    return res.json({ checkoutUrl: data.init_point });

  } catch (erro) {
    console.error('Falha na comunicação com Mercado Pago:', erro.message);

    return res.status(502).json({
      error: 'Falha de comunicação com o Mercado Pago.'
    });
  }
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
  if (!secret) {
    console.error('Webhook não configurado: MP_WEBHOOK_SECRET ausente.');
    return false;
  }

  const signature = req.get('x-signature') || '';
  const requestId = req.get('x-request-id') || '';
  const rawDataId = req.query['data.id'] || req.body?.data?.id || '';
  const dataId = String(rawDataId).toLowerCase();

  const parts = Object.fromEntries(
    signature.split(',').map(part => {
      const [key, ...value] = part.trim().split('=');
      return [key, value.join('=')];
    })
  );

  if (!parts.ts || !parts.v1 || !requestId || !dataId) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  // Comparação em tempo constante para evitar vazamento por tempo de execução.
  const expectedBuffer = Buffer.from(expected, 'hex');
  const receivedBuffer = Buffer.from(parts.v1, 'hex');
  return expectedBuffer.length === receivedBuffer.length &&
    expectedBuffer.length > 0 &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

async function buscarAssinatura(id) {
  const response = await fetch(
    'https://api.mercadopago.com/preapproval/' + encodeURIComponent(id),
    {
      headers: {
        Authorization: 'Bearer ' + process.env.MP_ACCESS_TOKEN
      }
    }
  );

  const responseText = await response.text();
  let data = {};
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch (_) {
    throw new Error('Resposta inválida ao consultar assinatura no Mercado Pago.');
  }

  if (response.status === 404) return null;
  if (!response.ok) {
    console.error('Erro Mercado Pago ao consultar assinatura:', response.status, data);
    throw new Error('Falha ao consultar assinatura: HTTP ' + response.status);
  }
  return data;
}

async function atualizarAssinatura(subscription) {
  const userId = Number(subscription.external_reference);
  const subscriptionId = String(subscription.id || '');
  const status = String(subscription.status || 'pending');

  if (!Number.isInteger(userId) || userId <= 0 || !subscriptionId) {
    console.warn('Assinatura recebida sem identificação válida.');
    return false;
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) {
    console.warn('Usuário da assinatura não encontrado:', userId);
    return false;
  }

  const existing = db.prepare(
    'SELECT user_id FROM subscriptions WHERE mp_preapproval_id = ?'
  ).get(subscriptionId);

  if (existing && Number(existing.user_id) !== userId) {
    console.error('ERRO: assinatura vinculada a outro usuário; atualização recusada.');
    return false;
  }

  if (existing) {
    const current = db.prepare(
      'SELECT status, init_point FROM subscriptions WHERE mp_preapproval_id = ? AND user_id = ?'
    ).get(subscriptionId, userId);
    if (current && (current.status !== status || (subscription.init_point && current.init_point !== subscription.init_point))) {
      db.prepare(`
        UPDATE subscriptions
        SET status = ?, init_point = COALESCE(?, init_point), updated_at = CURRENT_TIMESTAMP
        WHERE mp_preapproval_id = ? AND user_id = ?
      `).run(status, subscription.init_point || null, subscriptionId, userId);
    }
  } else {
    db.prepare(`
      INSERT INTO subscriptions
      (user_id, mp_preapproval_id, status, init_point, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(userId, subscriptionId, status, subscription.init_point || null);
  }

  console.log('Assinatura sincronizada. Usuário:', userId, 'Status:', status);
  return true;
}

app.post('/api/webhooks/mercadopago', async (req, res) => {
  // A assinatura HMAC valida que a notificação veio do Mercado Pago.
  if (!validWebhook(req)) {
    console.warn('Webhook recusado: assinatura inválida ou cabeçalhos/dados ausentes.');
    return res.status(401).send('Assinatura inválida');
  }

  const body = req.body || {};
  const action = String(body.action || '');
  // O Mercado Pago pode informar o tipo na query string ou no corpo.
  // Normalizamos os formatos conhecidos sem confiar no ID para decidir o status.
  let type = String(
    req.query.type ||
    req.query.topic ||
    body.type ||
    body.topic ||
    (body.entity === 'preapproval' ? 'subscription_preapproval' : '') ||
    (action.startsWith('subscription_preapproval') ? 'subscription_preapproval' : '') ||
    (action.startsWith('subscription_authorized_payment') ? 'subscription_authorized_payment' : '')
  ).toLowerCase().trim();

  // Algumas integrações/versões antigas notificam a assinatura como "preapproval".
  if (type === 'preapproval' || type === 'subscription') {
    type = 'subscription_preapproval';
  }

  const id = String(
    req.query['data.id'] ||
    body.data?.id ||
    body.id ||
    req.query.id ||
    ''
  ).trim();

  // Algumas notificações de atualização da assinatura chegam sem "type",
  // mas o ID já existe como mp_preapproval_id no banco local.
  if (!type && id) {
    const localSubscription = db.prepare(
      'SELECT 1 FROM subscriptions WHERE mp_preapproval_id = ?'
    ).get(id);
    if (localSubscription) type = 'subscription_preapproval';
  }
  console.log('Webhook Mercado Pago recebido:', { type, id, action });

  if (!id) {
    console.warn('Webhook sem ID do recurso; notificação reconhecida sem atualização.');
    return res.sendStatus(200);
  }

  // O botão "Simular" do painel pode enviar IDs fictícios, como 123456.
  // Nesse caso, não existe recurso real para consultar na API.
  if (id === '123456' || id === 'test') {
    console.log('Notificação de teste com ID fictício ignorada; nenhuma assinatura foi alterada.');
    return res.sendStatus(200);
  }

  try {
    let preapprovalId = null;

    if (type === 'subscription_preapproval') {
      // Evento de criação/alteração da própria assinatura.
      preapprovalId = id;
    } else if (type === 'subscription_authorized_payment') {
      // Evento de cobrança recorrente: primeiro consulta a fatura para obter
      // o ID da assinatura vinculada.
      const response = await fetch(
        'https://api.mercadopago.com/authorized_payments/' + encodeURIComponent(id),
        {
          headers: {
            Authorization: 'Bearer ' + process.env.MP_ACCESS_TOKEN
          }
        }
      );

      if (response.status === 404) {
        console.warn('Pagamento recorrente ainda não localizado na API; solicitando nova tentativa do Mercado Pago:', id);
        return res.sendStatus(500);
      }
      if (!response.ok) {
        const detalhe = await response.text();
        console.error('Erro ao consultar pagamento recorrente:', response.status, detalhe);
        // 5xx permite que o Mercado Pago tente entregar a notificação novamente.
        return res.sendStatus(response.status >= 500 ? 500 : 200);
      }

      const payment = await response.json();
      preapprovalId = payment.preapproval_id || payment.preapproval?.id || null;
      if (!preapprovalId) {
        console.warn('Pagamento recorrente ainda sem referência de assinatura; solicitando nova tentativa:', id);
        return res.sendStatus(500);
      }
    } else {
      console.log('Evento recebido, sem atualização de assinatura:', type || '(sem tipo)');
      return res.sendStatus(200);
    }

    const subscription = await buscarAssinatura(preapprovalId);
    if (!subscription) {
      console.warn('Assinatura ainda não localizada na API; solicitando nova tentativa do Mercado Pago:', preapprovalId);
      return res.sendStatus(500);
    }

    const atualizada = await atualizarAssinatura(subscription);
    if (!atualizada) {
      console.warn('Assinatura consultada, mas não foi possível vinculá-la a um usuário local.');
    }
    return res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error.message);
    return res.sendStatus(500);
  }
});


// Sincronização automática de segurança: consulta as assinaturas já cadastradas
// mesmo quando uma notificação do Mercado Pago não chega ao webhook.
let sincronizacaoEmAndamento = false;
async function sincronizarAssinaturasPendentes() {
  if (sincronizacaoEmAndamento || !process.env.MP_ACCESS_TOKEN) return;
  sincronizacaoEmAndamento = true;
  try {
    const rows = db.prepare(`
      SELECT mp_preapproval_id FROM subscriptions
      WHERE mp_preapproval_id IS NOT NULL AND mp_preapproval_id <> ''
      ORDER BY id DESC LIMIT 100
    `).all();
    let atualizadas = 0;
    for (const row of rows) {
      try {
        const subscription = await buscarAssinatura(row.mp_preapproval_id);
        if (subscription && await atualizarAssinatura(subscription)) atualizadas++;
      } catch (error) {
        console.error('Falha na sincronização da assinatura', row.mp_preapproval_id, error.message);
      }
    }
    console.log(`Sincronização automática concluída. ${rows.length} assinatura(s) verificadas; ${atualizadas} vinculada(s)/sincronizada(s).`);
  } catch (error) {
    console.error('Erro na rotina de sincronização automática:', error.message);
  } finally {
    sincronizacaoEmAndamento = false;
  }
}

app.get('/health', (_req, res) => res.json({ ok: true, app: 'Projeto Seca Saudável', version: '4.0.0' }));
app.listen(PORT, () => {
  console.log(`Projeto Seca Saudável em http://localhost:${PORT}`);
  console.log('Webhook Mercado Pago configurado em:', MP_WEBHOOK_URL);
  // Primeira verificação após iniciar e repetição a cada 5 minutos.
  sincronizarAssinaturasPendentes();
  setInterval(sincronizarAssinaturasPendentes, 5 * 60 * 1000);
});
