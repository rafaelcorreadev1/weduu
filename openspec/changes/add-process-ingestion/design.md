# Design

## Context

O SLA de 600ms inclui o túnel, que sozinho pode consumir boa parte do tempo. O único jeito confiável de cumprir é o handler não esperar nada além de operações em memória. O `/enrich` leva 400–800ms, então ele nunca pode estar no caminho da resposta. Ver proposal.md e a spec `message-ingestion`.

## Goals / Non-Goals

**Goals:**
- Handler de `/process` síncrono: validar, registrar, enfileirar, responder.
- Estruturas que a change 4 (worker) e a change 5 (consolidação) consumam sem reescrever.

**Non-Goals:**
- Consumir a fila: o worker entra na change 4. Nesta change os itens ficam na fila.
- Detectar fim de run e enviar callback (change 5).
- Persistência: tudo em memória (ver CLAUDE.md, Arquitetura).

## Decisions

- **Handler sem `async`.** Valida, chama `runs.recordMessage()` e `queue.enqueue()` (ambos síncronos) e responde. Sem `await`, não há como uma promise lenta entrar no caminho do ACK por acidente. Alternativa: handler `async` com `await` em algo "rápido" — abre espaço para regressões silenciosas.
- **Deduplicação dentro do `RunStore`**, por `Map<runId, Run>` com `Map<seq, Item>` em cada run. A checagem e o registro acontecem na mesma chamada síncrona; como o Node é single-thread, duas requisições iguais não conseguem passar pela checagem ao mesmo tempo. Alternativa: um `Set` de chaves `run_id:seq` separado do estado do run — duas fontes da verdade para o mesmo fato.
- **Fila pull (`WorkQueue<T>`)** com `enqueue`, `dequeue`, `size` e `onAvailable(listener)`. Os listeners são chamados via `setImmediate`, depois que a resposta foi escrita, e uma vez por rajada (não uma vez por item). O worker da change 4 retira itens só quando tem vaga no semáforo, então a fila é o lugar natural para os itens esperarem. Alternativa: fila push que chama o handler por item — o controle de concorrência teria que ficar dentro da fila.
- **Run criado sob demanda** em `recordMessage` com `total: null`; `startRun` preenche `total`/`startedAt` se o run já existir. Cobre a corrida entre a resposta do burst e as primeiras mensagens.
- **`sku` divergente para o mesmo `seq`**: mantém o primeiro e loga `warn`. Pelo contrato isso não deveria acontecer; descartar em silêncio esconderia o problema, e sobrescrever poderia mudar um item já enviado ao worker.
- **`seq` fora de `0..total-1`**: aceito e registrado. Validar contra `total` exigiria que o burst já tivesse chegado; a change 5 decide o que entra no callback.
- **Logs por mensagem em nível `debug`** e duplicatas em `info`. Escrever no stdout a cada mensagem em `info` é barato com 20 itens, mas não escala e polui o log.

## Risks / Trade-offs

- [Runs nunca são removidos da memória] → irrelevante para alguns runs de 20 itens; a change 5 pode limpar runs finalizados após o callback.
- [Reinício do processo perde runs em andamento] → aceito no escopo do desafio; registrado no DECISIONS (change 6) como ponto a mudar com 20.000 SKUs.
- [Responder `400` para payload inválido pode contar como falha no relatório] → é o comportamento correto para dados fora do contrato; a plataforma não deveria enviar isso.
