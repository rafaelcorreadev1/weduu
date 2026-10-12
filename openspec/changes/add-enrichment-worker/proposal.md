# Proposal

## Why

O `/enrich/:sku` tem latência de 400–800ms, rejeita com `429` acima de 3 requisições em voo e falha transitoriamente (~10% de `500`). Processar SKUs exige controle de concorrência e retries, que são critérios de peso 4 na avaliação. Hoje os itens aceitos em `/process` ficam parados na fila.

## What Changes

- Método `enrich(sku, credentials)` no cliente da plataforma (`GET /enrich/:sku` com `x-cid` e `x-token`), com timeout próprio e validação da resposta.
- Limitador global de no máximo 3 chamadas `/enrich` em voo (o limite é por credencial), com pausa global quando a plataforma responde `429`.
- Política de retry: `500`, timeout e erro de rede com backoff exponencial + jitter até um limite de tentativas; `429` espera o `retry-after` e tem limite próprio, maior; `401`, `404` e resposta fora do contrato são definitivos.
- Worker que consome a fila e mantém vários itens em andamento (para que itens esperando backoff não ocupem vaga de chamada HTTP).
- Cache por `run_id + sku` que também une chamadas simultâneas do mesmo SKU.
- Cada item termina em `done` (com `price`/`stock`) ou `failed` (com o motivo) no `RunStore`; o estado do run passa a mostrar `done`, `failed` e `enrich_calls`.

## Capabilities

### New Capabilities
- `sku-enrichment`: consulta concorrente e resiliente de preço e estoque por SKU e registro do resultado de cada item.

### Modified Capabilities

## Impact

- Novo código em `src/enrichment/` (worker, limiter, retry-policy); `enrich()` em `src/platform/client.ts`; estados `done`/`failed` em `src/runs/run-store.ts`.
- Novas envs: `ENRICH_MAX_CONCURRENCY` (3), `ENRICH_TIMEOUT_MS` (3000), `ENRICH_MAX_ATTEMPTS` (5).
- `GET /admin/runs/:runId` ganha `done`, `failed` e `enrich_calls`.
- Depende de `add-platform-client` e `add-process-ingestion`.
