# Design

## Context

Os itens aceitos em `/process` ficam na `WorkQueue` (pull) e no `RunStore` como `pending`. O `PlatformError` da change 2 já classifica falhas (`retryable`, `retryAfterMs`). O limite de 3 do `/enrich` conta **requisições em voo**, não requisições por segundo. Ver proposal.md e a spec `sku-enrichment`.

## Goals / Non-Goals

**Goals:**
- Nunca passar de 3 chamadas em voo; tratar o `429` como sinal de que o lado da plataforma ainda vê requisições nossas em andamento.
- Itens em espera de backoff não podem bloquear vagas de chamada.
- Componentes pequenos e testáveis isoladamente: limitador, política de retry e worker.

**Non-Goals:**
- Detectar fim do run e enviar callback (change 5); aqui só marcamos `done`/`failed`.
- Persistir a fila ou retomar após reinício.
- Circuit breaker: com um único destino e lotes de 20, a pausa global do `429` e o limite de tentativas bastam.

## Decisions

- **Dois limites separados.** `ConcurrencyLimiter` (3) protege só a chamada HTTP; o worker mantém até `3 × 4 = 12` itens ativos. Um item dormindo em backoff libera a vaga HTTP para outro item. Alternativa: limitar só os itens a 3 — mais simples, mas cada backoff de 500 deixaria uma vaga ociosa.
- **Pausa global no `429`.** O limitador tem `pauseFor(ms)`; quem pega `429` pausa todos os novos acquires pelo `retry-after`. Sem isso, as outras vagas continuariam batendo e recebendo `429` em cascata. Isso também cobre o caso em que um timeout nosso aborta a requisição mas a plataforma ainda a conta como em voo.
- **Política de retry como função pura** `nextDelay(error, attempt)` retornando ms ou `null` (desistir). Backoff `min(3000, 200 × 2^(n-1))` com "equal jitter" (metade fixa, metade aleatória), que espalha os retries sem zerar a espera. `random` injetável para testes determinísticos. `429` usa `retryAfterMs` (ou 1000ms sem header) e um contador próprio (20), porque não indica falha do item. Alternativa: lib como `p-retry` — não modela bem a diferença entre `429` e `500`.
- **Timeout do `/enrich` de 3000ms**, separado do timeout geral (10s). A latência normal vai até 800ms; esperar 10s por uma resposta travada desperdiça uma das 3 vagas.
- **Cache por `run_id + sku`** guardando a *promise*: chamadas simultâneas do mesmo SKU esperam a mesma requisição. Em falha transitória esgotada a entrada é removida (outro item pode tentar de novo); `404` permanece em cache. Escopo por run porque cada burst gera SKUs novos e um cache global sem TTL arriscaria preço desatualizado entre runs.
- **Worker nunca rejeita.** `#process` captura tudo e marca `failed` (`internal` para erros que não são `PlatformError`), evitando `unhandledRejection` derrubando o processo.
- **Credenciais lidas a cada tentativa** (`credentials.get()`), para que um novo registro no meio do run passe a valer sem reiniciar.
- **`sleep` e `now` injetáveis** no worker e no limitador, para testar backoff e pausas sem esperar tempo real.
- **`idle()`** no worker resolve quando fila e itens ativos zeram; usado nos testes e disponível para o shutdown.

## Risks / Trade-offs

- [Limite de 3 por credencial vira o gargalo: ~20 itens × 600ms / 3 ≈ 4s por lote] → inerente ao contrato; com 20.000 SKUs seria ~67min, ponto discutido no DECISIONS (change 6).
- [Retries aumentam `enrich_calls` no relatório] → limitados a 5 por item; a alternativa seria entregar itens sem preço.
- [Pausa global penaliza todos os runs por um `429`] → correto, já que o limite é por credencial e vale para todos.
- [Itens ativos ilimitados por run se várias rajadas chegarem juntas] → o teto de 12 itens ativos é global, não por run.
