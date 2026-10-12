# Tasks

## 1. Configuração

- [x] 1.1 Adicionar `ADMIN_KEY`, `PUBLIC_URL`, `PLATFORM_TIMEOUT_MS` (10000) e `CREDENTIALS_FILE` (`.credentials.json`) em `src/config.ts` e `.env.example`; verificar com teste de defaults

## 2. Cliente da plataforma

- [x] 2.1 Criar `src/platform/errors.ts` com `PlatformError` (`kind`, `status`, `retryable`, `retryAfterMs`, `body`); verificar com testes de classificação por status e parsing de `retry-after` em segundos e em data HTTP
- [x] 2.2 Criar `src/platform/types.ts` e `src/platform/client.ts` com `request()` (JSON, timeout, erros de rede/timeout, validação do formato das respostas) e os métodos `register()` e `requestBurst()`; verificar com testes usando `fetch` fake (sucesso, 401, 422, 5xx, resposta fora do contrato, rede, timeout e headers enviados)

## 3. Credenciais

- [x] 3.1 Criar `src/platform/credentials.ts` com `CredentialStore` (load com precedência das envs, `get()`, `save()` atômico); verificar com testes em diretório temporário

## 4. Endpoints administrativos

- [x] 4.1 Criar middleware `adminAuth` (503 sem `ADMIN_KEY`, 401 com chave errada); verificar com testes `supertest`
- [x] 4.2 Implementar `POST /admin/register`; verificar com testes de todos os cenários da spec `platform-registration`
- [x] 4.3 Implementar `POST /admin/burst` chamando `onRunStarted` antes de responder; verificar com testes de todos os cenários da spec `batch-request`
- [x] 4.4 Ligar cliente, credenciais e rotas admin em `src/app.ts` e `src/server.ts`; verificar que os testes da change 1 continuam passando

## 5. Scripts

- [x] 5.1 Criar `scripts/register.ts` e `scripts/burst.ts` e os scripts `npm run register`/`npm run burst`; verificar rodando contra o servidor local com a plataforma fake ou real
