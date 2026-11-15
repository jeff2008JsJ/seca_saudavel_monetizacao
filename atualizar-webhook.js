const fs = require("fs");

const file = "server.js";
const source = fs.readFileSync(file, "utf8");

const start = source.indexOf("function validWebhook(req) {");
const end = source.indexOf("app.get('/health'", start);

if (start === -1 || end === -1) {
  console.error("Não encontrei os limites do webhook. Nenhuma alteração foi feita.");
  process.exit(1);
}

const replacement = `
function validWebhook(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return false;

  const signature = req.get('x-signature') || '';
  const requestId = req.get('x-request-id') || '';
  const dataId = String(req.query['data.id'] || req.body?.data?.id || '').toLowerCase();

  const parts = Object.fromEntries(
    signature.split(',').map(p => p.trim().split('='))
  );

  if (!parts.ts || !parts.v1 || !requestId || !dataId) return false;

  const manifest = 'id:' + dataId + ';request-id:' + requestId + ';ts:' + parts.ts + ';';
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);

  return a.length === b.length && crypto.timingSafeEqual(a, b);
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

  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Falha ao consultar assinatura: HTTP ' + response.status);

  return response.json();
}

async function atualizarAssinatura(subscription) {
  const userId = Number(subscription.external_reference);

  if (!Number.isInteger(userId) || userId <= 0 || !subscription.id) {
    console.warn('Assinatura sem external_reference válido.');
    return;
  }

  const status = String(subscription.status || 'pending');

  db.prepare(\`
    INSERT INTO subscriptions(user_id, mp_preapproval_id, status, init_point, updated_at)
    VALUES(?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(mp_preapproval_id)
    DO UPDATE SET status=excluded.status, updated_at=CURRENT_TIMESTAMP
  \`).run(
    userId,
    String(subscription.id),
    status,
    subscription.init_point || null
  );

  console.log('Assinatura sincronizada. Usuário:', userId, 'Status:', status);
}

app.post('/api/webhooks/mercadopago', async (req, res) => {
  if (!validWebhook(req)) {
    console.warn('Webhook recusado: assinatura inválida.');
    return res.status(401).send('Assinatura inválida');
  }

  const type = String(req.query.type || req.body?.type || '');
  const id = String(req.query['data.id'] || req.body?.data?.id || '');

  if (!id) return res.sendStatus(200);

  try {
    let preapprovalId = null;

    if (type === 'subscription_preapproval') {
      preapprovalId = id;

    } else if (type === 'subscription_authorized_payment') {
      const response = await fetch(
        'https://api.mercadopago.com/authorized_payments/' + encodeURIComponent(id),
        {
          headers: {
            Authorization: 'Bearer ' + process.env.MP_ACCESS_TOKEN
          }
        }
      );

      if (response.status === 404) {
        console.warn('Pagamento de teste não encontrado:', id);
        return res.sendStatus(200);
      }

      if (!response.ok) {
        throw new Error('Falha ao consultar pagamento: HTTP ' + response.status);
      }

      const payment = await response.json();
      preapprovalId = payment.preapproval_id || payment.preapproval?.id || null;

      if (!preapprovalId) {
        console.warn('Pagamento recebido sem referência de assinatura:', id);
        return res.sendStatus(200);
      }

    } else {
      console.log('Evento ignorado:', type);
      return res.sendStatus(200);
    }

    const subscription = await buscarAssinatura(preapprovalId);

    if (!subscription) {
      console.warn('Assinatura não encontrada na API:', preapprovalId);
      return res.sendStatus(200);
    }

    await atualizarAssinatura(subscription);
    return res.sendStatus(200);

  } catch (e) {
    console.error('Webhook error:', e.message);
    return res.sendStatus(500);
  }
});

`;

const updated = source.slice(0, start) + replacement + source.slice(end);

fs.writeFileSync(file, updated, "utf8");
console.log("Webhook atualizado com sucesso.");
