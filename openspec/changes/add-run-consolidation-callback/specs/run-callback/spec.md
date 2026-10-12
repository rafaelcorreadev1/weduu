# Spec Delta

## Purpose

Detecta quando um run terminou, consolida o resultado de todos os itens e entrega o lote finalizado à plataforma em `POST /callback`, tolerando mensagens que não chegam e falhas transitórias no envio.

## ADDED Requirements

### Requirement: Envio automático ao completar o run
Quando o `total` do run é conhecido e todos os `seq` de `0` a `total-1` estão finalizados (`done` ou `failed`), o serviço SHALL enviar `POST <PLATFORM_BASE_URL>/callback` com o header `x-token` e o corpo `{"cid", "run_id", "result"}`. O envio MUST acontecer fora do caminho de resposta do `/process`.

#### Scenario: Run completo
- **WHEN** os 20 itens do run `r1` (total 20) ficam finalizados
- **THEN** o serviço envia um único `POST /callback` com `cid`, `run_id` `r1` e 20 itens em `result`

### Requirement: Formato do resultado
O `result` SHALL conter um item por `seq` recebido, ordenado por `seq` crescente, no formato `{"seq", "sku", "price", "stock"}`. Itens `done` levam os valores do enriquecimento; itens `failed` levam `price: null` e `stock: null`.

#### Scenario: Item com falha definitiva
- **WHEN** o item `seq` 13 terminou `failed` com motivo `not_found`
- **THEN** o `result` contém `{"seq": 13, "sku": "<sku>", "price": null, "stock": null}`

#### Scenario: Ordem por seq
- **WHEN** os itens foram finalizados na ordem 5, 0, 3
- **THEN** o `result` lista os `seq` na ordem 0, 3, 5

### Requirement: Run incompleto por mensagens que não chegaram
Se o run não está completo, nenhum item recebido está em processamento e nenhuma mensagem nova chega por `RUN_IDLE_TIMEOUT_MS` (padrão 10000ms), o serviço SHALL enviar o callback com os itens recebidos e registrar no log os `seq` faltantes. O timeout MUST NOT disparar enquanto houver itens em processamento.

#### Scenario: Mensagem perdida
- **WHEN** o run tem `total` 20, 19 itens finalizados, o `seq` 4 nunca chega e passa o timeout de inatividade
- **THEN** o serviço envia o callback com 19 itens e loga `seq` 4 como faltante

#### Scenario: Item ainda em retry
- **WHEN** o timeout de inatividade passa enquanto um item ainda está em retry no `/enrich`
- **THEN** o callback não é enviado até esse item ser finalizado

#### Scenario: Mensagem atrasada após envio parcial
- **WHEN** o callback parcial já foi enviado e depois o `seq` faltante chega e é finalizado, completando o run
- **THEN** o serviço envia um novo callback com o run completo

### Requirement: Um envio por vez e sem reenvio desnecessário
O serviço MUST NOT enviar dois callbacks simultâneos para o mesmo run e MUST NOT reenviar automaticamente um run que já teve callback completo enviado com sucesso. Mensagens duplicadas que chegam depois do envio MUST NOT disparar novo callback.

#### Scenario: Duplicata depois do callback
- **WHEN** o callback completo de `r1` foi enviado e chega uma duplicata de `r1`
- **THEN** o serviço responde `200` ao `/process` e não envia outro callback

### Requirement: Retry do callback
Falhas transitórias no `/callback` (`5xx`, `429`, timeout, rede) SHALL ser repetidas com backoff, respeitando `retry-after`, até 5 tentativas. Falhas definitivas (`401`, outros `4xx`) MUST NOT ser repetidas. O resultado final SHALL ficar registrado no estado do callback do run.

#### Scenario: 500 no callback
- **WHEN** o primeiro `POST /callback` responde `500` e o segundo `200`
- **THEN** o callback fica `sent` após 2 tentativas

#### Scenario: Token recusado
- **WHEN** o `POST /callback` responde `401`
- **THEN** o callback fica `failed` com motivo `unauthorized` após 1 tentativa

### Requirement: Reenvio manual e consulta do callback
O serviço SHALL expor `POST /admin/runs/:runId/callback` (protegido por `x-admin-key`) que envia o consolidado atual e responde `200` com o estado do callback, `404` com `{"error": "run_not_found"}` para run desconhecido e `409` com `{"error": "callback_in_progress"}` se já houver envio em andamento. `GET /admin/runs/:runId` SHALL incluir `callback` com `status` (`idle`, `sending`, `sent`, `failed`), `reason` do envio, `attempts`, `error`, `sent_at` e a `response` da plataforma.

#### Scenario: Reenvio manual
- **WHEN** um cliente autorizado chama `POST /admin/runs/r1/callback` e a plataforma aceita
- **THEN** o serviço responde `200` com `status` `sent`, `reason` `manual` e a resposta da plataforma
