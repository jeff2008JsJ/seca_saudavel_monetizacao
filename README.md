# Projeto Seca Saudável 4.5

Web app do desafio de 30 dias com cadastro, sincronização de progresso e assinatura Premium de R$ 19,90/mês via Mercado Pago.

## Atualização visual e páginas legais

- A apresentação para visitantes e o topo do painel de quem está conectado usam fotos locais em WebP, com disposição adaptada para celular e desktop. O painel mantém o progresso e os controles, sem repetir a apresentação comercial. Créditos, licença e instruções de troca estão em `FOTOS.md`.
- Termos e privacidade estão preenchidos com os dados fornecidos pelo responsável e a data de 26/11/2026.
- A pasta `public/` acompanha o projeto e deve ser publicada inteira: o servidor não expõe os arquivos estáticos da raiz.
- O backend continua na versão 4.5.0. Resumo das diferenças em relação à publicação e das pendências verificadas em `ATUALIZACAO.md`.
- O ZIP não inclui `.env`, banco de dados, `node_modules` nem histórico Git; mantenha as variáveis já configuradas no Render.

## O que mudou na versão 4.5

- **Vídeos sempre no site:** a lista de exercícios e vídeos agora fica dentro do próprio `index.html`. Antes ela ficava em `public/exercises.js`; se esse arquivo não fosse publicado, os vídeos dos planos caíam na busca do YouTube.
- **Plano com IA (Premium):** nova sub-aba "🤖 Plano com IA" na Academia (também acessível pelo botão "Montar com IA" nos Planos e em Refeições). O assinante responde objetivo, nível, dias, equipamentos, alimentos preferidos, restrições e limitações, e a IA monta um treino semanal e/ou um cardápio de 3 dias.
- Os exercícios gerados usam os nomes da biblioteca, então aparecem com "▶ Vídeo" e com o ✓ de concluído. O plano fica salvo e sincronizado com a conta.
- Só assinantes Premium ativos podem gerar. Cada assinante tem um limite diário (padrão 3). Se a IA falhar, a tentativa não é descontada.
- O plano é educativo e exibe aviso de que não substitui nutricionista, médico ou educador físico.

### Como configurar a IA

1. Crie uma chave em **uma** das opções:
   - OpenAI: https://platform.openai.com/api-keys (precisa adicionar créditos em Billing).
   - Google Gemini: https://aistudio.google.com/apikey (tem uso gratuito limitado).
2. No Render (Environment) ou no `.env`, defina:
   - OpenAI: `AI_PROVIDER=openai` e `OPENAI_API_KEY=sua_chave`
   - Gemini: `AI_PROVIDER=gemini` e `GEMINI_API_KEY=sua_chave`
3. Opcional: `AI_DAILY_LIMIT` (planos por assinante por dia, padrão 3) e `AI_MODEL` (padrão `gpt-6-luna` na OpenAI e `gemini-3.5-flash-lite` no Gemini).
4. Reinicie o serviço. A tabela `ai_usage` é criada automaticamente no banco.

Sem chave configurada, o site funciona normalmente e a sub-aba mostra "Em breve" para os assinantes. A chave fica só no servidor; nunca coloque no `index.html`. Defina um limite de gastos no painel do provedor para evitar surpresas.

## O que mudou na versão 4.4

- **Checklist de treino:** cada exercício dos planos prontos, da rotina personalizada e do dia em "Minha semana" tem uma caixa ✓ para marcar quando terminar. Uma barra mostra o progresso (ex.: "3 de 5 feitos").
- **Conclusão automática:** quando todos os exercícios do treino estão marcados, o treino entra no histórico e o dia fica como "✓ Concluído" no calendário.
- As marcações ficam salvas no navegador e são sincronizadas com a conta de quem está logado. Dias futuros não podem ser marcados.

## O que mudou na versão 4.3

- **Vídeos em todos os exercícios:** a biblioteca da Academia tem 91 exercícios, e cada um tem um vídeo demonstrativo do YouTube incorporado (lista no próprio `index.html`, no bloco `exerciseLibrary`). O vídeo só carrega quando a pessoa toca em “Assistir”.
- **Vídeo direto dos planos:** nos planos prontos e na rotina gerada, tocar no exercício abre o vídeo correspondente.
- **Cronômetro de descanso:** botões de 30, 60 e 90 segundos, com aviso sonoro e vibração no celular.
- **Busca melhorada:** a busca ignora acentos e também encontra nomes alternativos (ex.: “triceps”, “hip thrust”, “voador”).
- A biblioteca não depende mais da API externa wger.

### Como trocar ou adicionar um vídeo
Abra o `index.html`, procure o bloco `<script id="exerciseLibrary">` e altere o campo `video` do exercício. Use o código que aparece depois de `watch?v=` no link do YouTube. Exemplo: em `https://www.youtube.com/watch?v=zgk71dUUt0Y`, o código é `zgk71dUUt0Y`.

## O que mudou na versão 4.0

- **Página de venda** na aba Início para visitantes: benefícios, comparação Grátis × Premium, perguntas frequentes e botões "Começar grátis" / "Assinar Premium".
- **Premium com conteúdo real** (`premium-content.js`): 12 receitas, 7 cardápios extras, plano de treino de 4 semanas e 4 desafios bônus. O conteúdo só sai do servidor para assinaturas `authorized`.
- **Cancelamento pelo site**: botão "Cancelar assinatura" na aba Conta (`POST /api/subscription/cancel`, cancela no Mercado Pago).
- **Termos de uso** (`/termos`) e **Política de privacidade/LGPD** (`/privacidade`), com aceite obrigatório no cadastro (gravado em `users.terms_accepted_at`).
- **Sessões no PostgreSQL** (tabela `public.user_sessions`, criada automaticamente): ninguém é deslogado a cada deploy.
- **Segurança**: cabeçalhos HTTP com `helmet` (CSP, anti-clickjacking, HSTS em produção), proteção CSRF por verificação de origem, nova sessão a cada login/cadastro e exigência de `SESSION_SECRET` forte em produção. Só a pasta `public/` é servida como arquivo estático.
- **Correções**: barra vazia no topo para visitantes, peso/altura/meta fixos no código, aba "Conteúdo" pública (o editor dos dias agora fica dentro da aba 30 dias), favicon e prévia de compartilhamento (WhatsApp/Instagram).
- **Celular**: barra de navegação fixa embaixo (Início, 30 dias, Academia, Progresso e "Mais") e Academia dividida em sub-abas (Planos, Exercícios, Minha semana, Evolução).

## Requisitos

- Node.js 22.x.
- Banco PostgreSQL (Supabase).
- Conta Mercado Pago com aplicação criada.
- Hospedagem com HTTPS (ex.: Render).

## Executar localmente

1. Abra um terminal nesta pasta.
2. Execute `npm install`.
3. Copie `.env.example` para `.env` e preencha os valores.
4. Execute `npm start`.
5. Abra `http://localhost:3000`.

**Não compartilhe o arquivo `.env` nem coloque tokens no HTML.**

## Publicar uma nova versão (Render)

1. Envie os arquivos desta pasta para o repositório/serviço (sem `.env`, sem `node_modules`).
2. Confira as variáveis de ambiente no painel do Render: `NODE_ENV=production`, `BASE_URL`, `SESSION_SECRET` (mínimo de 32 caracteres), `DATABASE_URL`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `MP_WEBHOOK_URL`, `RESEND_API_KEY` e `RESEND_FROM_EMAIL`.
3. Comando de build: `npm install`. Comando de start: `npm start`.
4. No primeiro start, o servidor cria sozinho a tabela `user_sessions` e a coluna `users.terms_accepted_at`.
5. Depois da primeira publicação desta versão, todos precisarão entrar de novo uma única vez (as sessões antigas ficavam no SQLite).

## Antes de vender

- Confira os dados já preenchidos em `public/termos.html` e `public/privacidade.html` antes da publicação.
- Para mudar receitas, cardápios ou treinos do Premium, edite `premium-content.js`.
- Teste cadastro, assinatura, retorno, webhook e cancelamento com credenciais de teste do Mercado Pago antes de usar as de produção.

## Mercado Pago

1. Configure a URL de webhook como `https://SEU-DOMINIO/api/webhooks/mercadopago`.
2. Selecione o evento de assinatura (`subscription_preapproval`).
3. Copie a chave secreta do webhook para `MP_WEBHOOK_SECRET`.

O backend usa `POST /preapproval` para criar a assinatura, `GET /preapproval/{id}` para consultar o status e `PUT /preapproval/{id}` com `status: cancelled` para cancelar. O preço é definido no servidor.

## WhatsApp Business (opcional)

1. No [Meta for Developers](https://developers.facebook.com/apps/), crie um app com o produto **WhatsApp** e vincule um número à sua conta WhatsApp Business. Esta integração usa a **Cloud API oficial**, não automatiza conversas do WhatsApp pessoal.
2. No servidor, configure `WHATSAPP_TOKEN` (token com permissão `whatsapp_business_messaging` para a conta), `WHATSAPP_PHONE_NUMBER_ID` (ID do número, não o telefone), `WHATSAPP_APP_SECRET` (segredo do app Meta) e `WHATSAPP_VERIFY_TOKEN` (um segredo aleatório criado por você para verificar o webhook). Deixe-os vazios para manter o recurso desativado.
3. Na configuração do WhatsApp no app Meta, informe a URL de callback `https://SEU-DOMINIO/api/webhooks/whatsapp` e o mesmo token de verificação. Inscreva a conta WhatsApp Business no app e assine o campo **messages**. Teste primeiro com um número de teste da Meta.
4. No [WhatsApp Manager](https://business.facebook.com/wa/manage/), crie e aguarde a aprovação dos modelos transacionais abaixo, sem cabeçalho, rodapé ou botões obrigatórios. Configure o nome exato de cada modelo aprovado no servidor; um nome em branco desativa apenas aquele envio.

| Variável | Exemplo de corpo do modelo | Variáveis do corpo (em ordem) |
| --- | --- | --- |
| `WHATSAPP_WELCOME_TEMPLATE` | Bem-vindo(a) ao Projeto Seca Saudável! Sua conta foi criada com sucesso. Para deixar de receber avisos, responda PARAR. | Nenhuma |
| `WHATSAPP_BILLING_TEMPLATE` | Confira a situação da sua assinatura Premium do Projeto Seca Saudável na aba Conta. Se precisar de ajuda, fale com o suporte. Para deixar de receber avisos, responda PARAR. | Nenhuma |
| `WHATSAPP_RENEWAL_TEMPLATE` | Sua assinatura Premium do Projeto Seca Saudável tem renovação prevista para {{1}}. Para deixar de receber avisos, responda PARAR. | `{{1}}`: data da próxima cobrança, no formato `DD/MM/AAAA` |

Os padrões são versão Graph `v23.0`, idioma `pt_BR` e aviso com até 3 dias de antecedência (de 1 a 30, em `WHATSAPP_RENEWAL_DAYS`). A data vem de `next_payment_date` do Mercado Pago e é interpretada no horário de São Paulo. O servidor verifica as renovações a cada hora e evita repetir o aviso na mesma data de cobrança. Avisos de cobrança são acionados quando a assinatura passa a pausada ou quando um evento de pagamento recorrente confirma uma recusa; para receber esse último evento, assine também `subscription_authorized_payment` no Mercado Pago.

As mensagens proativas só são enviadas com autorização explícita. O cliente pode alterar a preferência em **Conta** ou responder **STOP**, **PARAR** ou **SAIR**. Os envios são assíncronos, não alteram a situação da cobrança e não são reenviados automaticamente se a API da Meta falhar; confira os logs do servidor no teste de ativação.

Para habilitar respostas a mensagens recebidas, defina `WHATSAPP_AI_REPLIES=true` e configure o provedor de IA acima. O assistente usa um contexto curto das conversas recentes, não acessa contas e orienta a falar com o suporte para questões de cobrança. Sem provedor configurado ou em caso de falha da IA, envia uma resposta padrão com o caminho para o suporte. Revise a política de privacidade e teste todos os fluxos com o número de teste antes de liberar para clientes.

## Endpoints

- `POST /api/auth/register` · `POST /api/auth/login` · `POST /api/auth/logout`
- `POST /api/auth/forgot-password` · `POST /api/auth/reset-password`
- `GET /api/me`
- `PUT /api/account/whatsapp` (quando habilitado)
- `GET|PUT /api/gym/data` · `GET|PUT /api/app-state`
- `POST /api/subscription/checkout` · `POST /api/subscription/cancel`
- `GET /api/premium/content` (somente assinantes)
- `POST /api/webhooks/mercadopago`
- `GET|POST /api/webhooks/whatsapp` (quando habilitado)
- `GET /health`

Requisições que alteram dados (`POST`/`PUT`) precisam vir do próprio site em JSON; chamadas de outros domínios recebem 403. Os webhooks são exceções e validam as assinaturas `x-signature` (Mercado Pago) e `X-Hub-Signature-256` (WhatsApp).
