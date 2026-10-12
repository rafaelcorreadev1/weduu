# Proposal

## Why

O lote só conta quando o resultado consolidado chega em `POST /callback`. Hoje os itens terminam como `done`/`failed` no `RunStore`, mas nada detecta o fim do run nem entrega o resultado. Mensagens podem chegar fora de ordem, duplicadas ou nunca chegar, e o callback em si pode falhar.

## What Changes

- Detecção de conclusão: o run está completo quando o `total` é conhecido e todos os `seq` de `0..total-1` estão `done` ou `failed`.
- Timeout de inatividade (`RUN_IDLE_TIMEOUT_MS`, padrão 10s): se nenhum item está em processamento e mensagens esperadas não chegaram, envia o consolidado parcial e loga os `seq` faltantes. Se as mensagens faltantes chegarem depois, o callback é reenviado com o run completo.
- Consolidação ordenada por `seq` no formato `{cid, run_id, result:[{seq, sku, price, stock}]}`. Itens `failed` entram com `price: null` e `stock: null` (decisão do usuário: mostrar que o item foi recebido e processado em vez de omiti-lo).
- Envio do `/callback` com `x-token` e retry com backoff (mesma política do enriquecimento); um envio por vez por run.
- `POST /admin/runs/:runId/callback` para reenviar manualmente (o contrato permite vários envios; cada um gera um relatório).
- `GET /admin/runs/:runId` passa a mostrar o estado do callback, incluindo a resposta da plataforma.

## Capabilities

### New Capabilities
- `run-callback`: conclusão do run, consolidação dos resultados e entrega do lote finalizado.

### Modified Capabilities

## Impact

- Novo código em `src/callback/` (consolidação e finalizador); `sendCallback()` em `src/platform/client.ts`; contadores e notificação de mudanças em `src/runs/run-store.ts`; rotas novas em `src/http/routes/admin.ts`.
- Nova env: `RUN_IDLE_TIMEOUT_MS` (10000).
- Depende de `add-enrichment-worker`.
