# Design

## Context

O `RunStore` guarda os itens de cada run com status `pending`/`done`/`failed`, mas é passivo: ninguém fica sabendo quando um item muda. O `RetryPolicy` e o `PlatformError` das changes 2 e 4 servem também para o callback. Ver proposal.md e a spec `run-callback`.

## Goals / Non-Goals

**Goals:**
- Enviar o callback assim que o run completa, sem polling.
- Nunca perder um run: se mensagens não chegam, enviar o parcial; se chegam depois, reenviar completo.
- Nada de custo relevante no caminho do ACK.

**Non-Goals:**
- Persistir o estado do callback entre reinícios.
- Validar `seq` fora de `0..total-1` (aparecem no `result` como recebidos).

## Decisions

- **`RunStore.onChange(listener)`** chamado de forma síncrona a cada `startRun`, `recordMessage`, `markDone`, `markFailed`. O `RunFinalizer` assina e decide. Alternativa: o worker chamar o finalizador direto — não cobriria o run completado pelo `startRun` (burst registrado depois das mensagens) nem o timer de inatividade, que depende de mensagens.
- **Contadores incrementais no `RunStore`** (`pending`/`done`/`failed`) em vez de recontar os itens a cada mudança: a checagem de conclusão roda dentro do `/process` e precisa ser O(1).
- **Envio adiado com `setImmediate`.** O listener só agenda; o `POST /callback` nunca começa dentro do handler do `/process`.
- **Timer de inatividade por run** com `setTimeout(...).unref()` e `timer.refresh()` a cada mudança (sem alocar timer novo por mensagem). Ao disparar: se há `pending`, só rearma (os itens têm retries limitados e vão finalizar); se não há e o run não está completo, envia o parcial com motivo `idle_timeout`.
- **Máquina de estado do callback por run** no finalizador: `idle → sending → sent | failed`, com `reason` (`complete`, `idle_timeout`, `manual`). Regra automática: enviar se completo e o último envio bem-sucedido não foi `complete`; enviar parcial só se nada foi enviado ainda. Se uma mudança relevante chega durante `sending`, marca `dirty` e reavalia ao terminar — sem envio concorrente e sem perder o reenvio.
- **Consolidação como função pura** `buildResult(items)` em `src/callback/consolidate.ts`: ordena por `seq` e mapeia `failed` para `price/stock: null`. Fácil de testar e de trocar caso o relatório mostre que omitir é melhor.
- **Retry do callback** com uma instância própria de `createRetryPolicy({ maxAttempts: 5 })`, reaproveitando a mesma lógica de backoff e `retry-after`.
- **Resposta da plataforma guardada** no estado do callback e logada: o relatório da execução é gerado a cada callback e pode vir nessa resposta, o que facilita registrar a melhor execução (change 6).

## Risks / Trade-offs

- [`failed` com `null` pode contar como divergência] → decisão do usuário; testar contra a plataforma real e, se necessário, trocar `buildResult` e reenviar pelo endpoint manual.
- [Timeout de 10s atrasa o callback de um run com mensagem perdida] → mensagens chegam em ~1s após o burst; 10s dá margem para a reentrega at-least-once da plataforma sem segurar demais.
- [Cache do worker e runs nunca são liberados da memória] → irrelevante para dezenas de runs de 20 itens; registrado para o cenário de 20.000 SKUs.
- [Reinício do processo perde runs em andamento] → mesmo trade-off das changes anteriores; o reenvio manual não ajuda nesse caso.
