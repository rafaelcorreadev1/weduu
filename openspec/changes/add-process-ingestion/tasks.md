# Tasks

## 1. Estado dos runs

- [x] 1.1 Criar `src/runs/run-store.ts` com `RunStore` (`startRun`, `recordMessage` retornando `accepted`/`duplicate`, `get`, snapshot com `received`/`duplicates`/`pending`); verificar com testes de deduplicação, mesmo `seq` em runs diferentes, run criado antes do burst e `sku` divergente

## 2. Fila

- [x] 2.1 Criar `src/queue/work-queue.ts` com `WorkQueue<T>` (`enqueue`, `dequeue`, `size`, `onAvailable` via `setImmediate`, um aviso por rajada); verificar com testes de ordem FIFO, aviso assíncrono e aviso único por rajada

## 3. Endpoint /process

- [x] 3.1 Implementar `src/http/routes/process.ts` (validação, `recordMessage`, `enqueue`, `200 {"ok": true}`); verificar com testes dos cenários de ACK, validação, duplicata e fora de ordem da spec `message-ingestion`
- [x] 3.2 Testar o ACK com 20 mensagens concorrentes (cada uma < 150ms) e com um consumidor que nunca termina; verificar que o teste passa
- [x] 3.3 Implementar `GET /admin/runs/:runId`; verificar com testes de run existente, inexistente e sem `x-admin-key`

## 4. Integração

- [x] 4.1 Ligar `RunStore` e `WorkQueue` em `src/app.ts` e `src/server.ts` (`onRunStarted` → `runs.startRun`); verificar com `npm run typecheck`, `npm test` e um `POST /process` manual no servidor rodando
