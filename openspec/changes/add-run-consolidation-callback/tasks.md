# Tasks

## 1. Base

- [x] 1.1 Adicionar `RUN_IDLE_TIMEOUT_MS` (10000) em `src/config.ts` e `.env.example`; verificar com teste de defaults
- [x] 1.2 Adicionar `sendCallback(payload, credentials)` ao cliente (`POST /callback` com `x-token`); verificar com testes de corpo, header, 401 e 500
- [x] 1.3 Adicionar ao `RunStore` contadores incrementais, `onChange`, `isComplete`, `missingSeqs` e `items(runId)`; verificar com testes de conclusão (inclusive burst registrado depois das mensagens) e de notificação

## 2. Consolidação

- [x] 2.1 Criar `src/callback/consolidate.ts` com `buildResult` (ordem por `seq`, `failed` com `null`); verificar com testes unitários

## 3. Finalizador

- [x] 3.1 Criar `src/callback/run-finalizer.ts` (`RunFinalizer`: envio ao completar, timer de inatividade, estado do callback, retry, `dirty`, `resend` manual, `stop`); verificar com testes de todos os cenários da spec `run-callback`
- [x] 3.2 Rotas `POST /admin/runs/:runId/callback` e campo `callback` em `GET /admin/runs/:runId`; verificar com testes `supertest`

## 4. Integração

- [x] 4.1 Ligar o finalizador em `src/server.ts` (start e stop no shutdown) e registrar a decisão de `null` no `CLAUDE.md`; verificar com `npm run typecheck`, `npm test` e um run completo contra a plataforma fake mostrando o callback recebido com 20 itens
