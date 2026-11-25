# Projeto Seca Saudável 4.5

Web app do desafio de 30 dias com cadastro, sincronização de progresso e assinatura Premium de R$ 19,90/mês via Mercado Pago.

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

- Node.js 20 ou superior.
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

- Edite `public/termos.html` e `public/privacidade.html` e troque os campos entre colchetes (nome, CPF/CNPJ, e-mail e data). Se possível, peça revisão a um profissional jurídico.
- Para mudar receitas, cardápios ou treinos do Premium, edite `premium-content.js`.
- Teste cadastro, assinatura, retorno, webhook e cancelamento com credenciais de teste do Mercado Pago antes de usar as de produção.

## Mercado Pago

1. Configure a URL de webhook como `https://SEU-DOMINIO/api/webhooks/mercadopago`.
2. Selecione o evento de assinatura (`subscription_preapproval`).
3. Copie a chave secreta do webhook para `MP_WEBHOOK_SECRET`.

O backend usa `POST /preapproval` para criar a assinatura, `GET /preapproval/{id}` para consultar o status e `PUT /preapproval/{id}` com `status: cancelled` para cancelar. O preço é definido no servidor.

## Endpoints

- `POST /api/auth/register` · `POST /api/auth/login` · `POST /api/auth/logout`
- `POST /api/auth/forgot-password` · `POST /api/auth/reset-password`
- `GET /api/me`
- `GET|PUT /api/gym/data` · `GET|PUT /api/app-state`
- `POST /api/subscription/checkout` · `POST /api/subscription/cancel`
- `GET /api/premium/content` (somente assinantes)
- `POST /api/webhooks/mercadopago`
- `GET /health`

Requisições que alteram dados (`POST`/`PUT`) precisam vir do próprio site em JSON; chamadas de outros domínios recebem 403. O webhook do Mercado Pago é validado pela assinatura `x-signature`.
