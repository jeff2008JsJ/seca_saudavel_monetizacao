'use strict';

const crypto = require('crypto');
const { aiConfig } = require('./ai');

const CAMINHO_WEBHOOK = '/api/webhooks/whatsapp';
const COMANDOS_SAIDA = /^(STOP|PARAR|SAIR)[.!]?$/i;

function configuracao(env = process.env) {
  const valor = nome => (env[nome] || '').trim();
  const token = valor('WHATSAPP_TOKEN');
  const numeroId = valor('WHATSAPP_PHONE_NUMBER_ID');
  const appSecret = valor('WHATSAPP_APP_SECRET');
  const verifyToken = valor('WHATSAPP_VERIFY_TOKEN');
  const versao = valor('WHATSAPP_GRAPH_VERSION') || 'v23.0';
  if (!token || !/^\d+$/.test(numeroId) || !appSecret || !verifyToken || !/^v\d+\.\d+$/.test(versao)) return null;

  const dias = Number(valor('WHATSAPP_RENEWAL_DAYS') || 3);
  return {
    token, numeroId, appSecret, verifyToken, versao,
    boasVindas: valor('WHATSAPP_WELCOME_TEMPLATE'),
    cobranca: valor('WHATSAPP_BILLING_TEMPLATE'),
    renovacao: valor('WHATSAPP_RENEWAL_TEMPLATE'),
    idioma: valor('WHATSAPP_TEMPLATE_LANGUAGE') || 'pt_BR',
    diasRenovacao: Number.isInteger(dias) && dias >= 1 && dias <= 30 ? dias : 3,
    respostasIa: valor('WHATSAPP_AI_REPLIES').toLowerCase() === 'true'
  };
}

function normalizarTelefone(valor) {
  if (typeof valor !== 'string' || !/^\+?[0-9 ().-]+$/.test(valor.trim())) return null;
  const numero = valor.replace(/\D/g, '');
  const internacional = numero.length >= 12 && numero.startsWith('55');
  if (valor.trim().startsWith('+') && !internacional) return null;
  const local = internacional ? numero.slice(2) : numero;
  if (!/^[1-9]\d(?:[2-5]\d{7}|9\d{8})$/.test(local)) return null;
  return '55' + local;
}

function preferencias(body) {
  const telefone = normalizarTelefone(body?.phone);
  const optIn = body?.whatsappOptIn === true;
  if (!telefone && (optIn || (body?.phone != null && body.phone !== ''))) return null;
  return { telefone, optIn };
}

function assinaturaValida(body, assinatura, secret) {
  if (!Buffer.isBuffer(body) || !secret || !/^sha256=[0-9a-f]{64}$/i.test(assinatura || '')) return false;
  const esperado = crypto.createHmac('sha256', secret).update(body).digest();
  return crypto.timingSafeEqual(esperado, Buffer.from(assinatura.slice(7), 'hex'));
}

function* mensagensRecebidas(body, numeroId) {
  if (body?.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return;
  for (const entrada of body.entry) {
    if (!Array.isArray(entrada?.changes)) continue;
    for (const alteracao of entrada.changes) {
      const dados = alteracao?.value;
      if (alteracao?.field !== 'messages' || dados?.metadata?.phone_number_id !== numeroId ||
          !Array.isArray(dados.messages)) continue;
      for (const mensagem of dados.messages) {
        const telefone = normalizarTelefone(mensagem?.from);
        const texto = typeof mensagem?.text?.body === 'string' ? mensagem.text.body.trim().slice(0, 1000) : '';
        if (mensagem?.type === 'text' && telefone && typeof mensagem.id === 'string' && mensagem.id && texto) {
          yield { id: mensagem.id, telefone, texto, timestamp: Number(mensagem.timestamp) };
        }
      }
    }
  }
}

async function enviar(config, telefone, mensagem) {
  const resposta = await fetch(`https://graph.facebook.com/${config.versao}/${config.numeroId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: telefone, ...mensagem }),
    signal: AbortSignal.timeout(8000)
  });
  await resposta.body?.cancel().catch(() => {});
  if (!resposta.ok) throw new Error(`Meta Cloud API: HTTP ${resposta.status}`);
}

function sendTemplate(config, telefone, nome, variaveis = []) {
  const template = { name: nome, language: { code: config.idioma } };
  if (variaveis.length) {
    template.components = [{ type: 'body', parameters: variaveis.map(text => ({ type: 'text', text })) }];
  }
  return enviar(config, telefone, { type: 'template', template });
}

function sendText(config, telefone, texto) {
  return enviar(config, telefone, { type: 'text', text: { body: texto, preview_url: false } });
}

async function migrar(pool) {
  await pool.query(`
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT,
      ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at TIMESTAMPTZ;
    ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS next_payment_date TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
      message_key TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      user_id BIGINT REFERENCES public.users(id) ON DELETE CASCADE,
      phone TEXT,
      body TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
    CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_user ON public.whatsapp_messages(user_id)
      WHERE user_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone ON public.whatsapp_messages(phone, created_at DESC)
      WHERE phone IS NOT NULL;
  `);
}

async function notificar(pool, config, { chave, tipo, userId, template, variaveis, assinaturaId, dataCobranca }) {
  if (!template) return;
  const reserva = await pool.query(`
    WITH destinatario AS (
      SELECT id, phone FROM public.users
      WHERE id = $3 AND phone IS NOT NULL AND whatsapp_opt_in_at IS NOT NULL
        AND ($4::bigint IS NULL OR EXISTS (
          SELECT 1 FROM public.subscriptions
          WHERE id = $4 AND user_id = $3 AND status = 'authorized'
            AND next_payment_date = $5::timestamptz AND next_payment_date > NOW()
        ))
    ), tentativa AS (
      INSERT INTO public.whatsapp_messages (message_key, kind, user_id)
        SELECT $1, $2, id FROM destinatario
      ON CONFLICT DO NOTHING RETURNING user_id
    )
    SELECT phone FROM destinatario JOIN tentativa ON id = user_id
  `, [chave, tipo, userId, assinaturaId ?? null, dataCobranca ?? null]);
  if (reserva.rows[0]?.phone) await sendTemplate(config, reserva.rows[0].phone, template, variaveis);
}

async function lembrarRenovacoes(pool, config) {
  if (!config.renovacao) return;
  const renovacoes = await pool.query(`
    WITH proximas AS (
      SELECT s.id, s.user_id, s.next_payment_date, s.next_payment_date AT TIME ZONE 'America/Sao_Paulo' AS data_local
      FROM public.subscriptions s JOIN public.users u ON u.id = s.user_id
      WHERE s.status = 'authorized' AND s.next_payment_date > NOW()
        AND u.phone IS NOT NULL AND u.whatsapp_opt_in_at IS NOT NULL
    )
    SELECT id, user_id, next_payment_date::text, TO_CHAR(data_local, 'DD/MM/YYYY') AS data_formatada,
      CONCAT('renovacao:', id, ':', TO_CHAR(data_local, 'YYYY-MM-DD')) AS chave
    FROM proximas
    WHERE data_local::date <= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date + $1::int
    ORDER BY next_payment_date
  `, [config.diasRenovacao]);
  for (const { id, user_id, next_payment_date, data_formatada, chave } of renovacoes.rows) {
    try {
      await notificar(pool, config, {
        chave, tipo: 'renovacao', userId: user_id, template: config.renovacao, variaveis: [data_formatada],
        assinaturaId: id, dataCobranca: next_payment_date
      });
    } catch (erro) {
      registrarErro('renovação', erro);
    }
  }
}

function registrarErro(operacao, erro) {
  const motivo = /^Meta Cloud API: HTTP \d+$/.test(erro?.message) ? erro.message : 'falha na operação';
  console.error(`WhatsApp (${operacao}): ${motivo}.`);
}

async function registrarRecebidas(pool, config, body) {
  const agora = Date.now();
  const mensagens = [...mensagensRecebidas(body, config.numeroId)].filter(({ timestamp, texto }) =>
    timestamp * 1000 > agora - 86400000 && timestamp * 1000 <= agora + 300000 &&
    (config.respostasIa || COMANDOS_SAIDA.test(texto))
  );
  if (!mensagens.length) return [];

  const client = await pool.connect();
  const paraResponder = [];
  try {
    await client.query('BEGIN');
    for (const mensagem of mensagens) {
      const { id, telefone, texto } = mensagem;
      const sair = COMANDOS_SAIDA.test(texto);
      const recebido = await client.query(`
        INSERT INTO public.whatsapp_messages (message_key, kind, phone, body, user_id, created_at)
        SELECT $1, 'entrada', $2, $3, CASE WHEN COUNT(*) = 1 THEN MIN(id) END, clock_timestamp()
        FROM public.users WHERE phone = $2
        ON CONFLICT DO NOTHING
      `, [`entrada:${id}`, telefone, sair ? null : texto]);
      if (!recebido.rowCount) continue;
      if (sair) {
        await client.query('UPDATE public.users SET whatsapp_opt_in_at = NULL WHERE phone = $1 AND whatsapp_opt_in_at IS NOT NULL', [telefone]);
        await client.query('UPDATE public.whatsapp_messages SET body = NULL WHERE phone = $1 AND body IS NOT NULL', [telefone]);
      } else {
        paraResponder.push(mensagem);
      }
    }
    await client.query('COMMIT');
    return paraResponder;
  } catch (erro) {
    await client.query('ROLLBACK');
    throw erro;
  } finally {
    client.release();
  }
}

async function respostaAutomatica(pool, config, { telefone, texto, id }, entradasDoLote, baseUrl) {
  const chave = `resposta:${telefone}:${Math.floor(Date.now() / 60000)}`;
  const entrada = `entrada:${id}`;
  const reserva = await pool.query(`
    INSERT INTO public.whatsapp_messages (message_key, kind, phone, user_id)
    SELECT $1, 'resposta', $2, user_id FROM public.whatsapp_messages WHERE message_key = $3 AND body IS NOT NULL
    ON CONFLICT DO NOTHING
  `, [chave, telefone, entrada]);
  if (!reserva.rowCount) return;

  const suporte = `${baseUrl}/privacidade`;
  let resposta = `Olá! Este é o atendimento do Projeto Seca Saudável. Para falar com o suporte, consulte o contato em ${suporte}.`;
  const cfg = aiConfig();
  if (cfg) {
    try {
      const historico = await pool.query(`
        WITH contexto AS (
          SELECT anterior.kind, anterior.body, anterior.created_at, anterior.message_key,
            anterior.message_key = ANY($2::text[]) AS do_lote
          FROM public.whatsapp_messages atual
          JOIN public.whatsapp_messages anterior ON anterior.phone = atual.phone
            AND anterior.user_id IS NOT DISTINCT FROM atual.user_id
          WHERE atual.message_key = $1
            AND (anterior.created_at, anterior.message_key) < (atual.created_at, atual.message_key)
            AND anterior.body IS NOT NULL AND anterior.created_at >= NOW() - INTERVAL '7 days'
        )
        SELECT kind, body FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY do_lote ORDER BY created_at DESC, message_key DESC) AS ordem
          FROM contexto
        ) AS ordenado
        WHERE do_lote OR ordem <= 6
        ORDER BY created_at, message_key
      `, [entrada, entradasDoLote]);
      const resultado = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            { role: 'system', content: `Você é o assistente virtual do Projeto Seca Saudável, um desafio de 30 dias com treinos, cardápios e acompanhamento de hábitos. Responda em português brasileiro em no máximo três frases, apenas sobre o aplicativo. Não dê diagnóstico, orientação médica ou nutricional individual, nem solicite dados pessoais, de saúde ou de pagamento. Você não tem acesso a contas. Para cobrança, dados da conta ou ajuda humana, oriente a consultar o contato em ${suporte}. Não invente informações.` },
            ...historico.rows.map(({ kind, body }) => ({ role: kind === 'entrada' ? 'user' : 'assistant', content: body })),
            { role: 'user', content: texto }
          ],
          [cfg.tokenField]: 500,
          ...(cfg.reasoning ? { reasoning_effort: cfg.reasoning } : {})
        }),
        signal: AbortSignal.timeout(12000)
      });
      const dados = await resultado.json();
      const conteudo = dados?.choices?.[0]?.message?.content;
      if (resultado.ok && typeof conteudo === 'string' && conteudo.trim()) resposta = conteudo.trim().slice(0, 600);
    } catch (erro) {
      registrarErro('IA', erro);
    }
  }
  await sendText(config, telefone, resposta);
  await pool.query('UPDATE public.whatsapp_messages SET body = $1 WHERE message_key = $2', [resposta, chave]);
}

async function responderMensagens(pool, config, mensagens, baseUrl) {
  const porTelefone = new Map();
  for (const mensagem of mensagens) {
    const { telefone } = mensagem;
    if (!porTelefone.has(telefone)) porTelefone.set(telefone, []);
    porTelefone.get(telefone).push(mensagem);
  }
  for (const lote of porTelefone.values()) {
    try {
      const anteriores = lote.slice(0, -1).map(({ id }) => `entrada:${id}`);
      await respostaAutomatica(pool, config, lote.at(-1), anteriores, baseUrl);
    } catch (erro) {
      registrarErro('mensagem recebida', erro);
    }
  }
}

function limparConversas(pool) {
  return pool.query(`
    DELETE FROM public.whatsapp_messages
    WHERE kind IN ('entrada', 'resposta') AND created_at < NOW() - INTERVAL '7 days'
  `);
}

module.exports = {
  CAMINHO_WEBHOOK, configuracao, normalizarTelefone, preferencias, assinaturaValida, mensagensRecebidas,
  sendTemplate, sendText, migrar, notificar, lembrarRenovacoes, registrarErro, registrarRecebidas, responderMensagens, limparConversas
};
