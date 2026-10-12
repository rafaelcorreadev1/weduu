# Tasks

## 1. Configuração e cliente

- [x] 1.1 Adicionar `ENRICH_MAX_CONCURRENCY` (3), `ENRICH_TIMEOUT_MS` (3000) e `ENRICH_MAX_ATTEMPTS` (5) em `src/config.ts` e `.env.example`; verificar com teste de defaults
- [x] 1.2 Adicionar `enrich(sku, credentials)` ao cliente (`x-cid`, `x-token`, timeout próprio, validação de `sku`/`price`/`stock`); verificar com testes de sucesso, headers, SKU com caracteres especiais, 404, 429 com `retry-after` e resposta fora do contrato

## 2. Estado dos itens

- [x] 2.1 Adicionar `markDone`, `markFailed` e `recordEnrichCall` ao `RunStore` e `done`/`failed`/`enrichCalls` ao snapshot; verificar com testes unitários
- [x] 2.2 Incluir `done`, `failed` e `enrich_calls` em `GET /admin/runs/:runId`; verificar com o teste da rota

## 3. Concorrência e retry

- [x] 3.1 Criar `src/enrichment/limiter.ts` (`ConcurrencyLimiter` com `run` e `pauseFor`); verificar com testes de pico de concorrência, liberação após erro e pausa bloqueando novos acquires
- [x] 3.2 Criar `src/enrichment/retry-policy.ts` (`nextDelay`); verificar com testes de backoff com jitter, teto, limite de tentativas, `429` com e sem `retry-after` e erros definitivos

## 4. Worker

- [x] 4.1 Criar `src/enrichment/worker.ts` (`EnrichmentWorker` com `start`, `idle`, cache por run+sku, retry, `failed` com motivo); verificar com testes: 20 itens sem passar de 3 em voo, 500→200, 500 persistente, 429, 404, 401, sem credenciais, SKU repetido com uma chamada e erro inesperado não derrubando o worker
- [x] 4.2 Ligar o worker em `src/server.ts`; verificar com `npm run typecheck`, `npm test` e um run completo contra a plataforma fake (com 429 e 500 simulados) mostrando todos os itens `done` em `/admin/runs/:runId`
