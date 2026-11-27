# Fotos da página inicial

As fotos estão incluídas no projeto e são servidas localmente pelo próprio site. Não dependem de acesso ao Unsplash para aparecer.

| Arquivo em `public/images/` | Autor | Origem |
| --- | --- | --- |
| `alimentacao-saudavel.webp` | Anna Pelzer | https://unsplash.com/photos/bowl-of-vegetable-salads-IGfIGP5ONV0 |
| `movimento.webp` | Victor Freitas | https://unsplash.com/photos/man-holding-black-barbell-hOuJYX2K5DA |

Licença: [Unsplash License](https://unsplash.com/license), que permite download, alteração, distribuição e uso comercial gratuito. As imagens foram redimensionadas e convertidas para WebP; o enquadramento é ajustado pelo CSS. As pessoas fotografadas não são apresentadas como clientes ou apoiadoras do projeto.

## Usar suas próprias fotos

Substitua os dois arquivos de `public/images/`, mantendo os nomes. Use fotos suas ou com autorização de uso. Recomendações: alimentação em formato quadrado, com pelo menos 1000 × 1000 pixels; treino com pelo menos 700 pixels de largura. Converta para WebP antes de substituir.

Se mudar o formato ou as dimensões, atualize também os atributos `width`, `height` e o texto `alt` das imagens em `index.html`. O enquadramento fica nas regras `.landing-photo-food img` e `.landing-photo-move img`.

## Instalar esta atualização em um site existente

Substitua `index.html` e adicione a pasta `public/images/` no projeto atual. Mantenha suas variáveis de ambiente, seu banco de dados e as configurações de pagamento existentes. Esta atualização é visual: não muda os planos nem o backend.
