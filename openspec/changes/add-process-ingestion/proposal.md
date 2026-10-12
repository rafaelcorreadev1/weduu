# Proposal

## Why

`POST /process` tem peso máximo na avaliação: ACK em até 600ms medido de ponta a ponta, entrega at-least-once, ordem não garantida e duplicatas possíveis. O recebimento precisa ser totalmente desacoplado do processamento.

## What Changes

- `POST /process` valida `run_id` (string), `seq` (inteiro >= 0) e `sku` (string), registra a mensagem e responde `200 {"ok": true}` sem nenhum I/O de rede nem `await` no caminho da resposta.
- Deduplicação idempotente por `run_id + seq`: duplicatas recebem `200` mas não voltam para a fila; contador de duplicatas por run.
- Registro de runs em memória (`RunStore`), alimentado pelo evento de run iniciado do `/admin/burst` e criado sob demanda caso uma mensagem chegue antes desse evento.
- Fila em memória do tipo pull (o worker da change 4 retira itens conforme tiver vaga), que avisa os consumidores via `setImmediate`, depois da resposta.
- Payload inválido responde `400` (não `2xx`) para não mascarar bugs; registra no log.
- `GET /admin/runs/:runId` para inspecionar o estado de um run (recebidas, duplicatas, pendentes).

## Capabilities

### New Capabilities
- `message-ingestion`: recebimento, validação, deduplicação e ACK das mensagens do lote, e consulta do estado do run.

### Modified Capabilities

## Impact

- Novo código em `src/http/routes/process.ts`, `src/runs/run-store.ts`, `src/queue/work-queue.ts`; rota nova em `src/http/routes/admin.ts`.
- `src/server.ts` passa a ligar `onRunStarted` ao `RunStore`.
- Depende de `setup-base-service` e `add-platform-client`. O tempo de resposta local é verificado em teste (20 mensagens concorrentes, cada uma abaixo de 150ms).
