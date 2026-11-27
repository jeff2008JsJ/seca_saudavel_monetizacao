# App Android — Seca Saudável

App Android que abre o site https://seca-saudavel-monetizacao.onrender.com/ dentro de um WebView, mantendo login, Premium e sincronização (cookies da sessão `seca.sid` ficam salvos no aparelho).

## Comportamento

- Links do próprio site e do checkout do Mercado Pago abrem dentro do app (o `back_url` volta logado).
- Outros sites (ex.: busca no YouTube), `mailto:`, `intent:` etc. abrem no app correspondente do celular.
- Botão voltar navega no histórico do site; vídeos do YouTube podem ir para tela cheia; sem internet aparece uma tela com "Tentar de novo".
- O app se identifica ao site pelo User-Agent: `SecaSaudavelApp/Android/<versão> (<direct|play>)`.

## Versões (flavors)

| Flavor | Arquivo | Uso |
| --- | --- | --- |
| `direct` | `app-direct-release.apk` | Instalação direta pelo link de download. |
| `play` | `app-play-release.aab` | Envio para a Google Play Console. |

## Build

Requer JDK 17 e Android SDK (platform 36).

```bash
cd android
./gradlew testDirectDebugUnitTest            # testes de unidade
./gradlew connectedPlayDebugAndroidTest      # testes de UI (emulador com internet)
./gradlew assembleDirectRelease bundlePlayRelease
```

Saídas: `app/build/outputs/apk/direct/release/` e `app/build/outputs/bundle/playRelease/`.

## Assinatura

Os builds de release são assinados com a chave de upload, lida de `android/keystore.properties` (fora do git):

```properties
storeFile=/caminho/para/seca-saudavel-upload.jks
storePassword=...
keyAlias=upload
keyPassword=...
```

ou das variáveis `SECA_KEYSTORE_FILE`, `SECA_KEYSTORE_PASSWORD`, `SECA_KEY_ALIAS`, `SECA_KEY_PASSWORD`. Guarde a chave: atualizações do APK direto precisam da mesma chave. Na Play Store, ative o Play App Signing; a chave acima vira apenas a chave de upload.

Para cada nova versão, aumente `versionCode` e `versionName` em `app/build.gradle`.

## Play Store

`play-store/` tem o ícone 512×512 e o gráfico de destaque 1024×500 pedidos pela Play Console.
