# Atualização das fotos e páginas legais — versão 4.5.0

## Base utilizada

Código público da branch `main` de [jeff2008JsJ/seca_saudavel_monetizacao](https://github.com/jeff2008JsJ/seca_saudavel_monetizacao/commit/ed20af9), obtido em 26/11/2026. Antes das alterações, o HTML era idêntico ao [site publicado](https://seca-saudavel-monetizacao.onrender.com/) após substituir `%BASE_URL%` pelo domínio que o servidor insere. O health público informa 4.5.0.

Este pacote substitui os ZIPs anteriores baseados na versão antiga 4.2.0. Não foi feita publicação nem alteração nas configurações do Render ou do Supabase.

## Diferenças em relação ao site no ar

| Item | Publicação verificada | Neste pacote |
| --- | --- | --- |
| Abertura | Texto sem as novas fotos | Fotos locais de alimentação e treino para visitantes e no topo do painel de contas conectadas; disposição responsiva |
| Termos e privacidade | Links retornam 404 | Páginas em `public/`, com nome, CPF, telefone e data preenchidos |
| Ícones, manifesto, estilo legal e service worker | Arquivos na raiz, fora da pasta servida | Arquivos existentes movidos para `public/`, sem alterar seu conteúdo |
| Backend e dependências | Versão 4.5.0 | `server.js`, `ai.js`, conteúdo Premium, `package.json` e lockfile preservados |
| IA, vídeos, cronômetro e checklist | Presentes no site atual | Funções preservadas; a atualização de conta também mostra/oculta as fotos do painel conforme a sessão |

O selo visual “VERSÃO 4.0” do cabeçalho foi mantido como no código atual; ele não corresponde à versão 4.5.0 do backend/pacote.

Na prévia local isolada, ambas as fotos carregaram sem rolagem horizontal em 320, 390, 760, 768, 1024 e 1440 px; os botões da abertura e os links legais funcionaram. A prévia não executou o backend nem testou a integração de e-mail.

## Publicação no Render

1. Confira os dados legais e a aparência da atualização.
2. Envie o código deste pacote para a origem usada pelo serviço, incluindo a pasta `public/` inteira.
3. Mantenha as variáveis de ambiente existentes no Render. Não envie `.env` e não copie configurações da versão antiga.
4. Mantenha os comandos existentes (`npm install` e `npm start`). O `package.json` solicita Node.js 22.x.
5. Após a publicação, confira `/health`, as fotos na abertura, `/termos`, `/privacidade`, `/favicon.svg` e `/manifest.webmanifest`.

As fotos podem ser substituídas mantendo os nomes e formatos indicados em `FOTOS.md`.

## Testes na produção antes desta atualização

- Cadastro gratuito com conta sintética: passou, incluindo a exigência de aceite dos termos.
- Sincronização: passou entre janela normal e janela anônima com cookies e armazenamento separados. O Dia 1 marcado apareceu após login na segunda sessão. Não foi usado um segundo aparelho físico.
- Recuperação de senha: falhou no envio; a interface pediu para conferir a configuração do Resend. A causa exata do provedor não foi confirmada. Recebimento, link e troca de senha não foram validados.
- Os links legais retornaram 404; a organização dos arquivos neste pacote corrige a causa encontrada no código, mas ainda precisa ser publicada.
- Nenhum checkout, pagamento ou cancelamento foi iniciado. O responsável já havia confirmado um pagamento real.

O responsável pela produção ainda precisa consultar os logs do Render para o erro “Falha ao enviar e-mail de recuperação”, conferir remetente/domínio no Resend e repetir a recuperação de ponta a ponta. Este pacote não altera essa integração nem afirma corrigir o envio de e-mail.

## Conteúdo excluído do ZIP

Credenciais, `.env`, arquivos Git, dependências instaladas, bancos de dados e arquivos locais de editor não fazem parte da entrega. A `.env.example` permanece somente como referência, sem chaves ou senhas.
