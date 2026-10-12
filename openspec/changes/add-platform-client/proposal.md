# Proposal

## Why

O serviço precisa se registrar na plataforma, guardar `cid`/`token` e solicitar lotes (`POST /burst/:cid`). Também é a base HTTP reutilizada depois por `/enrich` e `/callback`.

## What Changes

- Cliente HTTP da plataforma (`fetch` nativo) com timeout por requisição e erros classificados por status (`401`, `404`, `422`, `429` com `retry-after`, `5xx`, rede, timeout).
- Armazenamento de credenciais em memória, persistido em `.credentials.json` (fora do git), com override pelas envs `WEDUU_CID` e `WEDUU_TOKEN`.
- Endpoints administrativos protegidos por `ADMIN_KEY`, executados dentro do processo do servidor:
  - `POST /admin/register`: chama `POST /register` e persiste as credenciais; trata `422 handshake_failed`.
  - `POST /admin/burst`: chama `POST /burst/:cid` e publica o evento de run iniciado (`run_id`, `total`, `started_at`) antes da chegada das mensagens.
- Scripts `npm run register` e `npm run burst`, que apenas chamam esses endpoints no servidor local.

## Capabilities

### New Capabilities
- `platform-registration`: registro do webhook e persistência de credenciais.
- `batch-request`: solicitação de lote e publicação do run esperado.

### Modified Capabilities

## Impact

- Novo código em `src/platform/` (types, client, errors, credentials), `src/http/routes/admin.ts`, `src/http/middlewares/adminAuth.ts` e `scripts/`.
- Novas envs: `ADMIN_KEY`, `PUBLIC_URL`, `PLATFORM_TIMEOUT_MS`, `WEDUU_CID`, `WEDUU_TOKEN`.
- Sem dependências novas.
- Depende de `setup-base-service`.
