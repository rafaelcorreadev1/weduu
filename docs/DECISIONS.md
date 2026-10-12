# Decisões, trade-offs e escala

## Quais decisões arquiteturais tomei

**Recebimento separado do processamento.** O ACK de `POST /process` tem SLA de 600ms medido de ponta a ponta, e uma única chamada ao `/enrich` leva de 400 a 800ms. Por isso o handler de `/process` é síncrono e só faz operações em memória: valida, descarta duplicatas pela chave `run_id + seq`, enfileira e responde `200`. O enriquecimento roda depois, em segundo plano. Duplicatas também recebem `200`, mas não voltam para a fila.

**Concorrência controlada no `/enrich`.** Um limitador mantém no máximo 3 chamadas em voo, que é o limite da plataforma. Se ainda assim chegar um `429`, todas as novas chamadas ficam pausadas pelo tempo do `retry-after`, para não gerar `429` em cascata. Falhas transitórias (`500`, timeout, rede) são repetidas até 5 vezes com backoff exponencial e jitter; `401` e `404` são definitivos e não são repetidos. SKUs repetidos no mesmo run compartilham uma única consulta.

**Conclusão orientada a eventos.** O estado do run avisa a cada mudança; quando todos os `seq` de `0` a `total-1` estão finalizados, o `/callback` é enviado (com retry), ordenado por `seq`. Se uma mensagem nunca chega, um timeout de inatividade envia o resultado parcial, e o callback é reenviado completo caso ela chegue depois. Itens com falha definitiva entram no resultado com `price` e `stock` nulos, para não parecerem perdidos.

**Fila e estado em memória, sem Redis ou broker.** Para lotes de 20 itens que terminam em segundos, uma fila externa só adicionaria infraestrutura. O código depende de interfaces, então trocar por uma implementação persistente não muda rotas nem worker. O serviço é TypeScript estrito sobre Express, com testes unitários e um teste de integração que roda o fluxo completo contra uma plataforma simulada.

## Quais trade-offs aceitei

- **Um reinício perde os runs em andamento**, porque fila e estado vivem na memória do processo.
- **O ACK sai antes do processamento**: confirmamos algo que ainda pode falhar. É o único jeito de cumprir o SLA, e é compensado por retries, callback parcial e reenvio manual.
- **Uma única instância**: o limite de 3 é por credencial, então várias instâncias precisariam coordenar o limitador.
- **Throughput preso ao contrato**: com 3 chamadas de cerca de 600ms, um lote de 20 leva de 4 a 5 segundos.
- **Itens sem preço podem contar como divergência** no relatório; preferi isso a omitir o item.

## O que mudaria com 20.000 SKUs em vez de 20

O gargalo passa a ser o próprio contrato: 20.000 × 0,6s ÷ 3 dá cerca de **67 minutos** por lote. Um processamento de uma hora não pode viver só na memória, então eu trocaria a fila e o estado por armazenamento persistente (BullMQ/Redis ou RabbitMQ, com o estado do run em Redis ou Postgres), para sobreviver a deploys e falhas e retomar de onde parou. A deduplicação passaria a ser um `SET NX` por `run_id:seq`.

Para escalar workers horizontalmente sem estourar o limite por credencial, o limitador e a pausa do `429` iriam para o Redis. O recebimento continuaria respondendo rápido, apenas gravando na fila persistente. Eu também adicionaria backpressure e limpeza de memória, métricas e alertas (itens por segundo, `429` por minuto, previsão de término) e enviaria o callback em partes ou comprimido, se a plataforma permitir. Por fim, vale negociar um limite de concorrência maior ou um endpoint de enriquecimento em lote, porque com o limite atual nenhuma arquitetura baixa de uma hora.
