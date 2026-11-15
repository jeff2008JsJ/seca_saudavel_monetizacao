# Projeto Seca Saudável 4.0 — Monetização

Pacote inicial de integração com assinatura mensal Premium de R$ 19,90 via API de Assinaturas do Mercado Pago.

## O que este pacote entrega

- Aplicativo web original em `index.html`.
- Cadastro e login com senha armazenada como hash bcrypt.
- Sessões armazenadas em SQLite.
- Endpoint no servidor para criar assinatura recorrente de R$ 19,90/mês no Mercado Pago.
- Webhook com validação HMAC da assinatura `x-signature`.
- Liberação de exemplo de conteúdo Premium somente no servidor quando a assinatura estiver `authorized`.
- Banco SQLite para usuários e assinaturas.

## Requisitos

- Node.js 20 ou superior.
- Conta Mercado Pago e aplicação criada em Mercado Pago Developers.
- Hospedagem com HTTPS e armazenamento persistente para o banco SQLite.

## Executar localmente

1. Extraia o ZIP.
2. Abra um terminal nesta pasta.
3. Execute `npm install`.
4. Copie `.env.example` para `.env`.
5. Preencha `SESSION_SECRET`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` e `BASE_URL`.
6. Execute `npm start`.
7. Abra `http://localhost:3000`.

**Não compartilhe o arquivo `.env` nem coloque o Access Token no HTML.**

## Configurar Mercado Pago

1. Entre em Mercado Pago Developers e crie/seleciona sua aplicação.
2. Copie o Access Token de teste para validar a integração. Para produção, use credenciais de produção somente após os testes.
3. Configure a URL de webhook como `https://SEU-DOMINIO/api/webhooks/mercadopago`.
4. Selecione o evento de assinatura/vinculação de assinatura (`subscription_preapproval`) conforme as opções do painel.
5. Copie a chave secreta do webhook para `MP_WEBHOOK_SECRET`.
6. Configure `BASE_URL` com o domínio público HTTPS.
7. Teste cadastro, login, checkout, retorno e atualização do status via webhook antes de receber pagamentos reais.

O backend usa `POST https://api.mercadopago.com/preapproval` para criar a assinatura recorrente e `GET /preapproval/{id}` para consultar o estado notificado. O preço e a frequência são definidos no servidor, não pelo navegador.

## Importante antes de vender

Este pacote é um ponto de partida técnico, não uma loja pronta para produção. Antes de publicar:

- Use HTTPS, `SESSION_SECRET` forte, credenciais de produção e armazenamento persistente/backup.
- Configure política de privacidade, termos de uso, política de cancelamento e atendimento ao consumidor.
- Implemente confirmação/verificação de e-mail, recuperação de senha, proteção CSRF e controles antifraude.
- Implemente rotina para sincronizar status de assinatura e pagamentos recorrentes, incluindo atraso, pausa, cancelamento e chargeback, além do webhook.
- O painel de conteúdo original ainda é local; para vender conteúdo exclusivo, mova todos os materiais pagos para endpoints protegidos no servidor. O endpoint `/api/premium/content` é apenas um exemplo seguro de autorização, não um catálogo final.
- O SQLite é adequado para testes e implantação pequena com disco persistente; para escala, prefira banco gerenciado como PostgreSQL.
- Não use credenciais de produção antes de testar o fluxo integral em ambiente de teste.

## Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/me`
- `POST /api/subscription/checkout`
- `GET /api/premium/content` (protegido)
- `POST /api/webhooks/mercadopago`
- `GET /health`

## Documentação oficial

- Assinaturas: https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/overview
- Criar assinatura: https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/create-preapproval/post
- Webhooks: https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks
