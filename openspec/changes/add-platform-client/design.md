# Design

## Context

O estado dos runs fica em memória, dentro do processo do servidor (ver CLAUDE.md, Arquitetura). Por isso o burst precisa ser disparado de dentro desse processo: um CLI separado saberia o `run_id` e o `total`, mas o servidor não. A plataforma também chama nosso `/check` durante o `/register`, então o servidor precisa estar no ar quando o registro acontece.

## Goals / Non-Goals

**Goals:**
- Um único cliente HTTP da plataforma, reutilizado por `/enrich` (change 4) e `/callback` (change 5).
- Erros classificados de forma que a política de retry das próximas changes decida só olhando o erro.

**Non-Goals:**
- Retry nas chamadas de register e burst: são ações manuais e o operador pode repetir.
- Métodos `enrich` e `callback` do cliente: entram nas suas próprias changes.

## Decisions

- **Endpoints `/admin` dentro do servidor + scripts finos.** `npm run register`/`npm run burst` só fazem `POST` em `http://localhost:<PORT>/admin/...`. Alternativa: CLI que chama a plataforma direto e grava `run_id` em arquivo para o servidor ler — cria um segundo canal de estado e uma corrida entre o arquivo e as primeiras mensagens.
- **Autenticação por `ADMIN_KEY` em vez de checar loopback.** O agente do ngrok conecta no servidor via `127.0.0.1`, então uma restrição por IP liberaria o mundo inteiro. Comparação com `crypto.timingSafeEqual`. Sem `ADMIN_KEY` as rotas ficam desligadas (`503`).
- **`PlatformError` com `kind` e `retryable`.** `kind` ∈ `unauthorized` (401), `not_found` (404), `handshake_failed` (422), `rate_limited` (429), `server` (5xx), `client` (outros 4xx), `network`, `timeout` e `invalid_response` (2xx com corpo fora do contrato, checado em runtime porque os tipos do TypeScript não validam o que vem da rede). `retryable` é verdadeiro para `rate_limited`, `server`, `network` e `timeout`. `retryAfterMs` vem do header `retry-after` (segundos ou data HTTP). Alternativa: devolver `{ok, status}` sem lançar — espalharia checagem de status por todos os chamadores.
- **Timeout com `AbortSignal.timeout(PLATFORM_TIMEOUT_MS)`**, padrão 10s. O `/enrich` leva até 800ms; 10s cobre `/register`, que espera nosso handshake passar pelo túnel.
- **`fetch` injetável no cliente** (`createPlatformClient({ baseUrl, fetch })`) para testar sem rede e sem lib de mock.
- **`CredentialStore`** guarda as credenciais em memória e só toca o disco ao iniciar e após um registro. Gravação atômica (arquivo temporário + `rename`) para não deixar JSON pela metade.
- **Evento de run iniciado via callback `onRunStarted`** passado ao handler do burst. Nesta change ele só loga; a change 3 liga ao `RunStore`. Alternativa: `EventEmitter` global — acoplamento implícito e mais difícil de testar.

## Risks / Trade-offs

- [Mensagens de `/process` podem chegar antes de `onRunStarted` rodar] → a change 3 cria o run sob demanda; aqui `onRunStarted` é síncrono e roda antes da resposta do admin.
- [`ADMIN_KEY` fraca permite disparar bursts por terceiros] → só afeta nossa credencial no ambiente de teste; documentar no README para gerar uma chave aleatória.
- [`.credentials.json` em texto puro] → aceitável para credencial de teste; fica no `.gitignore`.
