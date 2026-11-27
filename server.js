require('dotenv').config();

const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const premiumContent = require('./premium-content');
const ai = require('./ai');
const whatsapp = require('./whatsapp');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não está configurada no arquivo .env.');
}

// O servidor usa a conexão PostgreSQL do Supabase.
// Não use a chave anon/public do Supabase aqui; DATABASE_URL é uma credencial privada.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000
});

pool.on('error', err => console.error('Erro inesperado no pool PostgreSQL:', err));

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const whatsappConfig = whatsapp.configuracao();
const MP_WEBHOOK_URL = (process.env.MP_WEBHOOK_URL || `${BASE_URL}/api/webhooks/mercadopago`).replace(/\/$/, '');
if (/localhost|127\.0\.0\.1/i.test(MP_WEBHOOK_URL)) {
  console.warn('ATENÇÃO: MP_WEBHOOK_URL aponta para localhost; o Mercado Pago não consegue acessar esse endereço. Configure a URL pública do ngrok no .env.');
}

const PRICE = 19.90;
const isProd = process.env.NODE_ENV === 'production';

// Envio de e-mails de recuperação pela API HTTPS do Resend.
const resendApiKey = String(process.env.RESEND_API_KEY || '').trim();
const resendFromEmail = String(process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev').trim();

async function enviarEmailRecuperacao({ to, subject, text, html }) {
  if (!resendApiKey) {
    throw new Error('RESEND_API_KEY não está configurada.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: `Projeto Seca Saudável <${resendFromEmail}>`,
      to: [to],
      subject,
      text,
      html
    })
  });

  const responseText = await response.text();
  let data = {};
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch (_) {
    throw new Error(`Resposta inválida do Resend (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(`Resend: ${data.message || data.error || `HTTP ${response.status}`}`);
  }

  return data;
}

app.set('trust proxy', 1);

if (isProd && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error('Defina SESSION_SECRET (mínimo de 32 caracteres) no ambiente de produção.');
}

// Cabeçalhos de segurança (CSP, anti-clickjacking, HSTS em produção etc.).
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      frameSrc: ['https://www.youtube-nocookie.com', 'https://www.youtube.com'],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      ...(isProd ? { upgradeInsecureRequests: [] } : {})
    }
  },
  hsts: isProd ? { maxAge: 180 * 24 * 60 * 60 } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// Página principal: o BASE_URL é inserido nas meta tags de compartilhamento.
const fs = require('fs');
const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')
  .replaceAll('%BASE_URL%', BASE_URL)
  .replace('id="registerWhatsApp" hidden', whatsappConfig ? 'id="registerWhatsApp"' : 'id="registerWhatsApp" hidden');
app.get('/', (_req, res) => res.set('Cache-Control', 'no-cache').type('html').send(indexHtml));

// Somente a pasta public/ é servida como arquivos estáticos (nunca a raiz do projeto).
app.use(express.static(path.join(__dirname, 'public'), { maxAge: isProd ? '1d' : 0, extensions: ['html'] }));
app.use(express.json({
  limit: '1mb',
  verify(req, _res, body) {
    if (whatsappConfig && req.method === 'POST' && req.path === whatsapp.CAMINHO_WEBHOOK) {
      req.whatsappRawBody = body;
    }
  }
}));

// Proteção CSRF: toda requisição que altera dados precisa vir do próprio site
// (cabeçalho Origin/Referer) e em JSON. O webhook do Mercado Pago tem assinatura própria.
const allowedOrigins = new Set([new URL(BASE_URL).origin]);
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path.startsWith('/webhooks/')) return next();
  let origin = req.get('origin');
  if (!origin && req.get('referer')) {
    try { origin = new URL(req.get('referer')).origin; } catch (_) { origin = ''; }
  }
  const sameHost = origin && origin === `${req.protocol}://${req.get('host')}`;
  if (!origin || !(allowedOrigins.has(origin) || sameHost) || !req.is('application/json')) {
    return res.status(403).json({ error: 'Requisição bloqueada por segurança. Recarregue a página e tente novamente.' });
  }
  return next();
});

// Sessões ficam no PostgreSQL (tabela public.user_sessions), então ninguém é
// deslogado quando o servidor reinicia ou é publicado de novo.
app.use(session({
  store: new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true, pruneSessionInterval: 60 * 60 }),
  name: 'seca.sid',
  secret: process.env.SESSION_SECRET || 'DEV_ONLY_CHANGE_THIS_SECRET',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false
});

const requireAuth = (req, res, next) =>
  req.session.userId ? next() : res.status(401).json({ error: 'Faça login para continuar.' });

async function getUser(id) {
  const result = await pool.query(
    'SELECT id, name, email FROM public.users WHERE id = $1',
    [id]
  );
  return result.rows[0] ? { ...result.rows[0], id: Number(result.rows[0].id) } : null;
}

async function activeSub(userId) {
  const result = await pool.query(
    `SELECT * FROM public.subscriptions
     WHERE user_id = $1 AND status = 'authorized'
     ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

app.post('/api/auth/register', authLimiter, async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  const email = String(req.body.email || '').trim().toLowerCase().slice(0, 190);
  const password = String(req.body.password || '');

  if (req.body.acceptTerms !== true) {
    return res.status(400).json({ error: 'Para criar a conta, aceite os Termos de uso e a Política de privacidade.' });
  }
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10) {
    return res.status(400).json({ error: 'Informe nome, e-mail válido e senha com pelo menos 10 caracteres.' });
  }
  const preferencias = whatsappConfig ? whatsapp.preferencias(req.body) : { telefone: null, optIn: false };
  if (!preferencias) return res.status(400).json({ error: 'Informe um número de WhatsApp brasileiro válido, com DDD.' });

  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO public.users (name, email, password_hash, terms_accepted_at, phone, whatsapp_opt_in_at)
       VALUES ($1, $2, $3, NOW(), $4, CASE WHEN $5::boolean THEN NOW() END)
       RETURNING id, name, email`,
      [name, email, hash, preferencias.telefone, preferencias.optIn]
    );
    const user = { ...result.rows[0], id: Number(result.rows[0].id) };
    await new Promise((resolve, reject) => req.session.regenerate(err => (err ? reject(err) : resolve())));
    req.session.userId = Number(user.id);
    if (preferencias.optIn && whatsappConfig?.boasVindas) {
      whatsapp.notificar(pool, whatsappConfig, {
        chave: `boas-vindas:${user.id}`, tipo: 'boas-vindas', userId: user.id, template: whatsappConfig.boasVindas
      }).catch(erro => whatsapp.registrarErro('boas-vindas', erro));
    }
    return res.json({ user, premium: false });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
    }
    console.error('Erro ao criar conta:', error);
    return res.status(500).json({ error: 'Não foi possível criar a conta.' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  try {
    const result = await pool.query(
      'SELECT id, name, email, password_hash FROM public.users WHERE email = $1',
      [email]
    );
    const row = result.rows[0];

    if (!row || !(await bcrypt.compare(password, row.password_hash))) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    req.session.regenerate(async err => {
      if (err) return res.status(500).json({ error: 'Falha ao iniciar sessão.' });
      req.session.userId = Number(row.id);
      try {
        const user = await getUser(row.id);
        const sub = await activeSub(row.id);
        return res.json({ user, premium: !!sub });
      } catch (dbError) {
        console.error('Erro ao carregar conta após login:', dbError);
        return res.status(500).json({ error: 'Falha ao carregar a conta.' });
      }
    });
  } catch (error) {
    console.error('Erro no login:', error);
    return res.status(500).json({ error: 'Não foi possível realizar o login.' });
  }
});

// Solicita um link de redefinição. A resposta é igual exista ou não o e-mail.
app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase().slice(0, 190);
  const genericMessage = 'Se esse e-mail estiver cadastrado, enviaremos um link de recuperação. Verifique também a pasta de spam.';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Informe um endereço de e-mail válido.' });
  }
  if (!resendApiKey) {
    console.error('Recuperação de senha indisponível: configure RESEND_API_KEY na Render.');
    return res.status(503).json({ error: 'O envio de e-mails ainda não está configurado. Tente novamente mais tarde.' });
  }

  try {
    const found = await pool.query(
      'SELECT id, name, email FROM public.users WHERE email = $1',
      [email]
    );

    // Não revelar se a conta existe.
    if (!found.rows[0]) return res.json({ ok: true, message: genericMessage });

    const user = found.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    await pool.query(
      `INSERT INTO public.password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 minutes')`,
      [user.id, tokenHash]
    );

    const resetUrl = `${BASE_URL}/?resetToken=${encodeURIComponent(token)}`;
    const safeName = String(user.name || 'usuário').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));

    try {
      await enviarEmailRecuperacao({
        to: user.email,
        subject: 'Redefinição de senha — Projeto Seca Saudável',
        text: `Olá, ${user.name || 'usuário'}!\\n\\nRecebemos uma solicitação para redefinir a senha da sua conta. Acesse este link em até 30 minutos:\\n${resetUrl}\\n\\nSe você não solicitou a alteração, ignore este e-mail.`,
        html: `<p>Olá, ${safeName}!</p><p>Recebemos uma solicitação para redefinir a senha da sua conta do Projeto Seca Saudável.</p><p><a href="${resetUrl}">Criar uma nova senha</a></p><p>Este link expira em 30 minutos e só pode ser usado uma vez.</p><p>Se você não solicitou a alteração, ignore este e-mail.</p>`
      });
    } catch (mailError) {
      // Invalida o token se o provedor de e-mail falhar.
      await pool.query(
        'DELETE FROM public.password_reset_tokens WHERE token_hash = $1',
        [tokenHash]
      );
      console.error('Falha ao enviar e-mail de recuperação:', mailError.message);
      return res.status(502).json({ error: 'Não foi possível enviar o e-mail agora. Confira a configuração do Resend e tente novamente.' });
    }

    return res.json({ ok: true, message: genericMessage });
  } catch (error) {
    console.error('Erro ao solicitar redefinição de senha:', error);
    return res.status(500).json({ error: 'Não foi possível processar a solicitação.' });
  }
});

// Consome o token de uso único e atualiza o hash da senha.
app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
  const token = String(req.body.token || '').trim();
  const password = String(req.body.password || '');
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return res.status(400).json({ error: 'Link de recuperação inválido ou expirado.' });
  }
  if (password.length < 10) {
    return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 10 caracteres.' });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tokenResult = await client.query(
      `SELECT id, user_id
       FROM public.password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       FOR UPDATE`,
      [tokenHash]
    );
    const reset = tokenResult.rows[0];
    if (!reset) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Link de recuperação inválido ou expirado. Solicite um novo link.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await client.query(
      'UPDATE public.users SET password_hash = $1 WHERE id = $2',
      [passwordHash, reset.user_id]
    );
    await client.query(
      'UPDATE public.password_reset_tokens SET used_at = NOW() WHERE id = $1',
      [reset.id]
    );
    await client.query(
      'DELETE FROM public.password_reset_tokens WHERE user_id = $1 AND id <> $2',
      [reset.user_id, reset.id]
    );
    await client.query('COMMIT');
    return res.json({ ok: true, message: 'Senha alterada com sucesso. Você já pode entrar com a nova senha.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao redefinir senha:', error);
    return res.status(500).json({ error: 'Não foi possível alterar a senha. Tente novamente.' });
  } finally {
    client.release();
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.clearCookie('seca.sid').json({ ok: true }));
});

app.get('/api/gym/data', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT data_json, updated_at FROM public.user_gym_data WHERE user_id = $1',
      [req.session.userId]
    );
    const row = result.rows[0];
    let data = {};
    try {
      data = row ? JSON.parse(row.data_json) : {};
    } catch (_) {
      data = {};
    }
    return res.json({ data, updatedAt: row?.updated_at || null });
  } catch (error) {
    console.error('Erro ao carregar dados da Academia:', error);
    return res.status(500).json({ error: 'Não foi possível carregar os dados da Academia.' });
  }
});

app.put('/api/gym/data', requireAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const allowed = ['routine', 'calendar', 'logs', 'performance', 'bodyEvolution', 'aiPlan'];
  const data = {};

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, key)) data[key] = body[key];
  }

  if (JSON.stringify(data).length > 900000) {
    return res.status(413).json({ error: 'Os dados da Academia excedem o limite permitido.' });
  }
  if (Array.isArray(data.logs) && data.logs.length > 100) data.logs = data.logs.slice(0, 100);
  if (Array.isArray(data.performance) && data.performance.length > 500) data.performance = data.performance.slice(0, 500);

  try {
    // Preserva campos de outros módulos (por exemplo, o desafio de 30 dias)
    // que compartilham o JSON do usuário.
    const current = await pool.query(
      'SELECT data_json FROM public.user_gym_data WHERE user_id = $1',
      [req.session.userId]
    );
    let existing = {};
    try {
      const raw = current.rows[0]?.data_json;
      existing = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    } catch (_) { existing = {}; }
    const merged = { ...existing, ...data };
    const json = JSON.stringify(merged);
    const result = await pool.query(
      `INSERT INTO public.user_gym_data (user_id, data_json, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET data_json = EXCLUDED.data_json, updated_at = NOW()
       RETURNING updated_at`,
      [req.session.userId, json]
    );
    return res.json({ ok: true, updatedAt: result.rows[0].updated_at });
  } catch (error) {
    console.error('Erro ao salvar dados da Academia:', error);
    return res.status(500).json({ error: 'Não foi possível salvar os dados da Academia.' });
  }
});

// Dados gerais do aplicativo (desafio 30 dias, hidratação, atividades, notas e lista).
// O usuário é identificado pela sessão; o navegador não escolhe o user_id.
app.get('/api/app-state', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT data_json, updated_at FROM public.user_gym_data WHERE user_id = $1',
      [req.session.userId]
    );
    let stored = {};
    try {
      const raw = result.rows[0]?.data_json;
      stored = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    } catch (_) { stored = {}; }
    return res.json({ state: stored.appState || null, updatedAt: result.rows[0]?.updated_at || null });
  } catch (error) {
    console.error('Erro ao carregar dados gerais do aplicativo:', error);
    return res.status(500).json({ error: 'Não foi possível carregar os dados do aplicativo.' });
  }
});

app.put('/api/app-state', requireAuth, async (req, res) => {
  const state = req.body?.state;
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return res.status(400).json({ error: 'Dados do aplicativo inválidos.' });
  }
  const jsonState = JSON.stringify(state);
  if (jsonState.length > 250000) {
    return res.status(413).json({ error: 'Os dados do aplicativo excedem o limite permitido.' });
  }
  try {
    const current = await pool.query(
      'SELECT data_json FROM public.user_gym_data WHERE user_id = $1',
      [req.session.userId]
    );
    let stored = {};
    try {
      const raw = current.rows[0]?.data_json;
      stored = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    } catch (_) { stored = {}; }
    stored.appState = state;
    const result = await pool.query(
      `INSERT INTO public.user_gym_data (user_id, data_json, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET data_json = EXCLUDED.data_json, updated_at = NOW()
       RETURNING updated_at`,
      [req.session.userId, JSON.stringify(stored)]
    );
    return res.json({ ok: true, updatedAt: result.rows[0].updated_at });
  } catch (error) {
    console.error('Erro ao salvar dados gerais do aplicativo:', error);
    return res.status(500).json({ error: 'Não foi possível salvar os dados do aplicativo.' });
  }
});

app.get('/api/me', async (req, res) => {
  if (!req.session.userId) return res.json({ user: null, premium: false });

  try {
    const user = await getUser(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.json({ user: null, premium: false });
    }
    const sub = await activeSub(user.id);
    const preferencias = whatsappConfig ? await pool.query(
      'SELECT phone, whatsapp_opt_in_at IS NOT NULL AS "optIn" FROM public.users WHERE id = $1',
      [user.id]
    ) : null;
    return res.json({
      user, premium: !!sub, subscriptionStatus: sub?.status || 'free',
      ...(preferencias?.rows[0] && { whatsapp: preferencias.rows[0] })
    });
  } catch (error) {
    console.error('Erro ao consultar usuário:', error);
    return res.status(500).json({ error: 'Não foi possível consultar sua conta.' });
  }
});

app.put('/api/account/whatsapp', requireAuth, authLimiter, async (req, res) => {
  if (!whatsappConfig) return res.status(404).json({ error: 'Os avisos pelo WhatsApp não estão disponíveis.' });
  const preferencias = whatsapp.preferencias(req.body);
  if (!preferencias) return res.status(400).json({ error: 'Informe um número de WhatsApp brasileiro válido, com DDD.' });

  try {
    await pool.query(`
      UPDATE public.users
      SET phone = $1, whatsapp_opt_in_at = CASE WHEN $2::boolean THEN
        CASE WHEN phone = $1 THEN COALESCE(whatsapp_opt_in_at, NOW()) ELSE NOW() END
      END
      WHERE id = $3
    `, [preferencias.telefone, preferencias.optIn, req.session.userId]);
    return res.json({ ok: true, message: 'Preferências de WhatsApp salvas.' });
  } catch (erro) {
    whatsapp.registrarErro('preferências', erro);
    return res.status(500).json({ error: 'Não foi possível salvar suas preferências de WhatsApp.' });
  }
});

app.post('/api/subscription/checkout', requireAuth, async (req, res) => {
  if (!process.env.MP_ACCESS_TOKEN || !process.env.MP_ACCESS_TOKEN.trim()) {
    return res.status(503).json({ error: 'Configure MP_ACCESS_TOKEN no arquivo .env antes de habilitar pagamentos.' });
  }

  try {
    if (await activeSub(req.session.userId)) {
      return res.status(409).json({ error: 'Sua assinatura Premium já está ativa.' });
    }

    const userResult = await pool.query(
      'SELECT id, email FROM public.users WHERE id = $1',
      [req.session.userId]
    );
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

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

    const response = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    let data = {};
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch (_) {
      console.error('Resposta inválida do Mercado Pago:', response.status, responseText);
      return res.status(502).json({ error: 'O Mercado Pago retornou uma resposta inválida.' });
    }

    if (!response.ok || !data.init_point || !data.id) {
      console.error('Erro na assinatura Mercado Pago:', response.status, data);
      return res.status(502).json({ error: data.message || 'Não foi possível iniciar a assinatura.' });
    }

    await pool.query(
      `INSERT INTO public.subscriptions
       (user_id, mp_preapproval_id, status, init_point)
       VALUES ($1, $2, $3, $4)`,
      [user.id, String(data.id), String(data.status || 'pending'), data.init_point]
    );

    return res.json({ checkoutUrl: data.init_point });
  } catch (error) {
    console.error('Falha ao iniciar assinatura:', error);
    return res.status(502).json({ error: 'Falha ao iniciar a assinatura.' });
  }
});

app.get('/api/premium/content', requireAuth, async (req, res) => {
  try {
    if (!(await activeSub(req.session.userId))) {
      return res.status(403).json({ error: 'Conteúdo exclusivo para assinantes Premium.' });
    }
    return res.json(premiumContent);
  } catch (error) {
    console.error('Erro ao verificar conteúdo Premium:', error);
    return res.status(500).json({ error: 'Não foi possível verificar o acesso Premium.' });
  }
});

async function cancelarPreapprovalMP(preapprovalId) {
  const response = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(preapprovalId)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'cancelled' })
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error('Erro ao cancelar assinatura no Mercado Pago:', response.status, detail);
  }
  return response.ok;
}

async function statusPreapprovalMP(preapprovalId) {
  const response = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(preapprovalId)}`, {
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => ({}));
  return data.status || null;
}

app.post('/api/subscription/cancel', requireAuth, async (req, res) => {
  try {
    const sub = await activeSub(req.session.userId);
    if (!sub) return res.status(404).json({ error: 'Você não tem uma assinatura Premium ativa.' });
    if (!process.env.MP_ACCESS_TOKEN || !process.env.MP_ACCESS_TOKEN.trim()) {
      return res.status(503).json({ error: 'Pagamentos não configurados. Fale com o suporte para cancelar.' });
    }

    if (sub.mp_preapproval_id && !(await cancelarPreapprovalMP(sub.mp_preapproval_id))) {
      return res.status(502).json({ error: 'O Mercado Pago não confirmou o cancelamento. Tente novamente em alguns minutos.' });
    }

    await pool.query(
      `UPDATE public.subscriptions SET status = 'cancelled', updated_at = NOW()
       WHERE user_id = $1 AND status = 'authorized'`,
      [req.session.userId]
    );
    return res.json({ ok: true, message: 'Assinatura cancelada. Não haverá novas cobranças.' });
  } catch (error) {
    console.error('Falha ao cancelar assinatura:', error);
    return res.status(500).json({ error: 'Não foi possível cancelar a assinatura agora.' });
  }
});

// Exclusão definitiva da conta (exigida pela Google Play para apps com cadastro).
app.post('/api/account/delete', requireAuth, authLimiter, async (req, res) => {
  const userId = req.session.userId;
  const password = String(req.body.password || '');

  try {
    const result = await pool.query('SELECT password_hash FROM public.users WHERE id = $1', [userId]);
    const row = result.rows[0];
    if (!row || !(await bcrypt.compare(password, row.password_hash))) {
      return res.status(401).json({ error: 'Senha incorreta.' });
    }

    // Cancela no Mercado Pago toda assinatura não cancelada, inclusive as que ainda
    // constam como pendentes aqui mas já podem ter sido autorizadas lá.
    const subs = await pool.query(
      `SELECT mp_preapproval_id FROM public.subscriptions
       WHERE user_id = $1 AND mp_preapproval_id IS NOT NULL AND status <> 'cancelled'`,
      [userId]
    );
    if (subs.rows.length && (!process.env.MP_ACCESS_TOKEN || !process.env.MP_ACCESS_TOKEN.trim())) {
      return res.status(503).json({ error: 'Não foi possível cancelar sua assinatura agora. Fale com o suporte para excluir a conta.' });
    }
    for (const { mp_preapproval_id: preapprovalId } of subs.rows) {
      if (!(await cancelarPreapprovalMP(preapprovalId)) && (await statusPreapprovalMP(preapprovalId)) !== 'cancelled') {
        return res.status(502).json({ error: 'O Mercado Pago não confirmou o cancelamento da assinatura. Tente novamente em alguns minutos.' });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM public.user_gym_data WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM public.subscriptions WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM public.ai_usage WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM public.password_reset_tokens WHERE user_id = $1', [userId]);
      await client.query(`DELETE FROM public.user_sessions WHERE sess->>'userId' = $1`, [String(userId)]);
      await client.query('DELETE FROM public.whatsapp_messages WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM public.users WHERE id = $1', [userId]);
      await client.query('COMMIT');
    } catch (dbError) {
      await client.query('ROLLBACK');
      throw dbError;
    } finally {
      client.release();
    }

    return req.session.destroy(() => res.clearCookie('seca.sid').json({ ok: true, message: 'Sua conta e seus dados foram excluídos.' }));
  } catch (error) {
    console.error('Falha ao excluir conta:', error);
    return res.status(500).json({ error: 'Não foi possível excluir a conta agora.' });
  }
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
  const expectedBuffer = Buffer.from(expected, 'hex');
  const receivedBuffer = Buffer.from(parts.v1, 'hex');

  return expectedBuffer.length === receivedBuffer.length &&
    expectedBuffer.length > 0 &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

async function buscarAssinatura(id) {
  const response = await fetch(
    'https://api.mercadopago.com/preapproval/' + encodeURIComponent(id),
    { headers: { Authorization: 'Bearer ' + process.env.MP_ACCESS_TOKEN } }
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

async function atualizarAssinatura(subscription, pagamentoRecusadoId) {
  const userId = Number(subscription.external_reference);
  const subscriptionId = String(subscription.id || '');
  const status = String(subscription.status || 'pending');
  const data = typeof subscription.next_payment_date === 'string' ? Date.parse(subscription.next_payment_date) : NaN;
  const proximaCobranca = Number.isFinite(data) ? new Date(data) : null;

  if (!Number.isInteger(userId) || userId <= 0 || !subscriptionId) {
    console.warn('Assinatura recebida sem identificação válida.');
    return false;
  }

  const client = await pool.connect();
  let alteradaEm;
  let statusAnterior;
  try {
    await client.query('BEGIN');

    const user = await client.query('SELECT id FROM public.users WHERE id = $1', [userId]);
    if (!user.rows[0]) {
      await client.query('ROLLBACK');
      console.warn('Usuário da assinatura não encontrado:', userId);
      return false;
    }

    const existing = await client.query(
      `SELECT user_id, status FROM public.subscriptions WHERE mp_preapproval_id = $1${whatsappConfig?.cobranca ? ' FOR UPDATE' : ''}`,
      [subscriptionId]
    );

    if (existing.rows[0] && Number(existing.rows[0].user_id) !== userId) {
      await client.query('ROLLBACK');
      console.error('ERRO: assinatura vinculada a outro usuário; atualização recusada.');
      return false;
    }

    if (existing.rows[0]) {
      statusAnterior = existing.rows[0].status;
      const atualizada = await client.query(
        `UPDATE public.subscriptions
         SET status = $1, init_point = COALESCE($2, init_point), updated_at = NOW(), next_payment_date = $5
         WHERE mp_preapproval_id = $3 AND user_id = $4
         RETURNING updated_at::text`,
        [status, subscription.init_point || null, subscriptionId, userId, proximaCobranca]
      );
      alteradaEm = atualizada.rows[0]?.updated_at;
    } else {
      await client.query(
        `INSERT INTO public.subscriptions
         (user_id, mp_preapproval_id, status, init_point, updated_at, next_payment_date)
         VALUES ($1, $2, $3, $4, NOW(), $5)`,
        [userId, subscriptionId, status, subscription.init_point || null, proximaCobranca]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  console.log('Assinatura sincronizada. Usuário:', userId, 'Status:', status);
  if (whatsappConfig?.cobranca && (status === 'authorized' || status === 'paused')) {
    const chave = pagamentoRecusadoId ? `pagamento-recusado:${subscriptionId}:${pagamentoRecusadoId}` :
      status === 'paused' && statusAnterior !== 'paused' && alteradaEm ? `assinatura-pausada:${subscriptionId}:${alteradaEm}` : null;
    if (chave) {
      whatsapp.notificar(pool, whatsappConfig, { chave, tipo: 'cobranca', userId, template: whatsappConfig.cobranca })
        .catch(erro => whatsapp.registrarErro('cobrança', erro));
    }
  }
  return true;
}

app.get(whatsapp.CAMINHO_WEBHOOK, (req, res) => {
  if (!whatsappConfig) return res.sendStatus(404);
  if (req.query['hub.mode'] !== 'subscribe' || req.query['hub.verify_token'] !== whatsappConfig.verifyToken ||
      typeof req.query['hub.challenge'] !== 'string') return res.sendStatus(403);
  return res.type('text').send(req.query['hub.challenge']);
});

app.post(whatsapp.CAMINHO_WEBHOOK, (req, res) => {
  if (!whatsappConfig) return res.sendStatus(404);
  if (!whatsapp.assinaturaValida(req.whatsappRawBody, req.get('x-hub-signature-256'), whatsappConfig.appSecret)) {
    return res.sendStatus(403);
  }
  res.sendStatus(200);
  setImmediate(() => {
    whatsapp.processarWebhook(pool, whatsappConfig, req.body, BASE_URL)
      .catch(erro => whatsapp.registrarErro('webhook', erro));
  });
});

app.post('/api/webhooks/mercadopago', async (req, res) => {
  if (!validWebhook(req)) {
    console.warn('Webhook recusado: assinatura inválida ou cabeçalhos/dados ausentes.');
    return res.status(401).send('Assinatura inválida');
  }

  const body = req.body || {};
  const action = String(body.action || '');
  let type = String(
    req.query.type ||
    req.query.topic ||
    body.type ||
    body.topic ||
    (body.entity === 'preapproval' ? 'subscription_preapproval' : '') ||
    (action.startsWith('subscription_preapproval') ? 'subscription_preapproval' : '') ||
    (action.startsWith('subscription_authorized_payment') ? 'subscription_authorized_payment' : '')
  ).toLowerCase().trim();

  if (type === 'preapproval' || type === 'subscription') type = 'subscription_preapproval';

  const id = String(
    req.query['data.id'] ||
    body.data?.id ||
    body.id ||
    req.query.id ||
    ''
  ).trim();

  if (!type && id) {
    const local = await pool.query(
      'SELECT 1 FROM public.subscriptions WHERE mp_preapproval_id = $1',
      [id]
    );
    if (local.rows.length) type = 'subscription_preapproval';
  }

  console.log('Webhook Mercado Pago recebido:', { type, id, action });

  if (!id) {
    console.warn('Webhook sem ID do recurso; notificação reconhecida sem atualização.');
    return res.sendStatus(200);
  }
  if (id === '123456' || id === 'test') {
    console.log('Notificação de teste com ID fictício ignorada; nenhuma assinatura foi alterada.');
    return res.sendStatus(200);
  }

  try {
    let preapprovalId = null;
    let pagamentoRecusadoId;

    if (type === 'subscription_preapproval') {
      preapprovalId = id;
    } else if (type === 'subscription_authorized_payment') {
      const response = await fetch(
        'https://api.mercadopago.com/authorized_payments/' + encodeURIComponent(id),
        { headers: { Authorization: 'Bearer ' + process.env.MP_ACCESS_TOKEN } }
      );

      if (response.status === 404) {
        console.warn('Pagamento recorrente ainda não localizado; solicitando nova tentativa:', id);
        return res.sendStatus(500);
      }
      if (!response.ok) {
        const detail = await response.text();
        console.error('Erro ao consultar pagamento recorrente:', response.status, detail);
        return res.sendStatus(response.status >= 500 ? 500 : 200);
      }

      const payment = await response.json();
      preapprovalId = payment.preapproval_id || payment.preapproval?.id || null;
      if (payment.payment?.status === 'rejected') pagamentoRecusadoId = id;
      if (!preapprovalId) {
        console.warn('Pagamento recorrente sem referência de assinatura; solicitando nova tentativa:', id);
        return res.sendStatus(500);
      }
    } else {
      console.log('Evento recebido, sem atualização de assinatura:', type || '(sem tipo)');
      return res.sendStatus(200);
    }

    const subscription = await buscarAssinatura(preapprovalId);
    if (!subscription) {
      console.warn('Assinatura ainda não localizada na API; solicitando nova tentativa:', preapprovalId);
      return res.sendStatus(500);
    }

    const updated = await atualizarAssinatura(subscription, pagamentoRecusadoId);
    if (!updated) console.warn('Assinatura consultada, mas não foi possível vinculá-la a um usuário local.');
    return res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error.message);
    return res.sendStatus(500);
  }
});

let sincronizacaoEmAndamento = false;
async function sincronizarAssinaturasPendentes() {
  if (sincronizacaoEmAndamento || !process.env.MP_ACCESS_TOKEN) return;
  sincronizacaoEmAndamento = true;

  try {
    const result = await pool.query(`
      SELECT mp_preapproval_id FROM public.subscriptions
      WHERE mp_preapproval_id IS NOT NULL AND mp_preapproval_id <> ''
      ORDER BY id DESC LIMIT 100
    `);
    if (whatsappConfig?.renovacao) {
      const adicionais = await pool.query(`
        SELECT s.mp_preapproval_id FROM public.subscriptions s
        JOIN public.users u ON u.id = s.user_id
        WHERE s.status = 'authorized' AND s.mp_preapproval_id <> '' AND u.whatsapp_opt_in_at IS NOT NULL
          AND s.mp_preapproval_id <> ALL ($1::text[])
          AND (s.updated_at IS NULL OR s.updated_at < NOW() - INTERVAL '12 hours')
        ORDER BY s.updated_at ASC NULLS FIRST LIMIT 10
      `, [result.rows.map(row => row.mp_preapproval_id)]);
      result.rows.push(...adicionais.rows);
    }
    let atualizadas = 0;

    for (const row of result.rows) {
      try {
        const subscription = await buscarAssinatura(row.mp_preapproval_id);
        if (subscription && await atualizarAssinatura(subscription)) atualizadas++;
      } catch (error) {
        console.error('Falha na sincronização da assinatura', row.mp_preapproval_id, error.message);
      }
    }

    console.log(`Sincronização automática concluída. ${result.rows.length} assinatura(s) verificadas; ${atualizadas} vinculada(s)/sincronizada(s).`);
  } catch (error) {
    console.error('Erro na rotina de sincronização automática:', error.message);
  } finally {
    sincronizacaoEmAndamento = false;
  }
}

let rotinaWhatsAppEmAndamento = false;
async function rotinaWhatsApp() {
  if (rotinaWhatsAppEmAndamento) return;
  rotinaWhatsAppEmAndamento = true;
  try {
    await whatsapp.lembrarRenovacoes(pool, whatsappConfig);
    await whatsapp.limparConversas(pool);
  } catch (erro) {
    whatsapp.registrarErro('rotina de manutenção', erro);
  } finally {
    rotinaWhatsAppEmAndamento = false;
  }
}

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas solicitações seguidas. Aguarde alguns minutos.' }
});

function todayInBrazil() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

async function aiUsageToday(userId) {
  const result = await pool.query('SELECT count FROM public.ai_usage WHERE user_id = $1 AND day = $2', [userId, todayInBrazil()]);
  return result.rows[0]?.count || 0;
}

app.get('/api/ai/status', async (req, res) => {
  const cfg = ai.aiConfig();
  if (!req.session.userId) return res.json({ enabled: !!cfg, loggedIn: false, premium: false });
  try {
    const premium = !!(await activeSub(req.session.userId));
    const used = premium ? await aiUsageToday(req.session.userId) : 0;
    const limit = cfg?.dailyLimit || 0;
    return res.json({ enabled: !!cfg, loggedIn: true, premium, limit, used, remaining: Math.max(0, limit - used) });
  } catch (error) {
    console.error('Erro ao consultar status da IA:', error);
    return res.status(500).json({ error: 'Não foi possível consultar a IA agora.' });
  }
});

app.post('/api/ai/plan', requireAuth, aiLimiter, async (req, res) => {
  const cfg = ai.aiConfig();
  if (!cfg) return res.status(503).json({ error: 'O gerador com IA ainda não foi configurado neste site.' });
  const userId = req.session.userId;
  let reserved = false;
  try {
    if (!(await activeSub(userId))) {
      return res.status(403).json({ error: 'O plano com IA é exclusivo para assinantes Premium.' });
    }
    const day = todayInBrazil();
    const reserve = await pool.query(
      `INSERT INTO public.ai_usage (user_id, day, count) VALUES ($1, $2, 1)
       ON CONFLICT (user_id, day) DO UPDATE SET count = public.ai_usage.count + 1
       WHERE public.ai_usage.count < $3
       RETURNING count`,
      [userId, day, cfg.dailyLimit]
    );
    if (!reserve.rowCount) {
      return res.status(429).json({ error: `Você já usou os ${cfg.dailyLimit} planos com IA de hoje. Tente novamente amanhã.` });
    }
    reserved = true;
    const input = ai.validateRequest(req.body);
    const plan = await ai.generatePlan(input, cfg);
    const used = reserve.rows[0].count;
    return res.json({ plan: { ...plan, criadoEm: new Date().toISOString(), entrada: input }, limit: cfg.dailyLimit, used, remaining: Math.max(0, cfg.dailyLimit - used) });
  } catch (error) {
    console.error('Erro ao gerar plano com IA:', error.message);
    if (reserved) {
      await pool.query('UPDATE public.ai_usage SET count = GREATEST(count - 1, 0) WHERE user_id = $1 AND day = $2', [userId, todayInBrazil()]).catch(() => {});
    }
    return res.status(502).json({ error: 'A IA não conseguiu montar o plano agora. Tente novamente em instantes; esta tentativa não foi descontada do seu limite.' });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true, app: 'Projeto Seca Saudável', version: '4.5.0' }));

async function iniciar() {
  // Tabela pequena e separada para tokens temporários de recuperação.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON public.password_reset_tokens(user_id)');

  await pool.query('ALTER TABLE public.users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ');
  await whatsapp.migrar(pool);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_usage (
      user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      day DATE NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day)
    )
  `);

  // Testa a conexão antes de abrir a aplicação.
  const check = await pool.query('SELECT 1');
  if (check.rowCount !== 1) throw new Error('Não foi possível validar a conexão com o Supabase.');

  const server = app.listen(PORT, () => {
    console.log(`Projeto Seca Saudável em http://localhost:${PORT}`);
    console.log('Banco de dados: Supabase PostgreSQL');
    console.log('Sessões: PostgreSQL (public.user_sessions)');
    console.log('Webhook Mercado Pago configurado em:', MP_WEBHOOK_URL);
    sincronizarAssinaturasPendentes();
    setInterval(sincronizarAssinaturasPendentes, 5 * 60 * 1000);
    if (whatsappConfig) {
      rotinaWhatsApp();
      setInterval(rotinaWhatsApp, 60 * 60 * 1000);
    }
  });

  const shutdown = async () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

iniciar().catch(async error => {
  console.error('Não foi possível iniciar o Projeto Seca Saudável:', error.message);
  await pool.end();
  process.exit(1);
});
