# Spec Delta

## Purpose

Recebe as mensagens do lote enviadas pela plataforma em `POST /process`, confirma o recebimento dentro do SLA de 600ms e garante que cada `run_id + seq` seja encaminhado para processamento uma única vez, mesmo com entrega at-least-once e fora de ordem.

## ADDED Requirements

### Requirement: ACK imediato
O serviço SHALL expor `POST /process` que, para um corpo válido `{run_id, seq, sku}`, responde `200` com `{"ok": true}`. A resposta MUST ser enviada sem aguardar chamadas de rede, o enriquecimento ou qualquer processamento do item.

#### Scenario: Mensagem válida
- **WHEN** a plataforma envia `POST /process` com `{"run_id": "r1", "seq": 7, "sku": "sku-007"}`
- **THEN** o serviço responde `200` com `{"ok": true}` e o item fica disponível para processamento

#### Scenario: Processamento lento não atrasa o ACK
- **WHEN** o consumidor da fila está ocupado ou demora para processar
- **THEN** o `POST /process` continua respondendo `200` sem esperar por ele

#### Scenario: Rajada de mensagens
- **WHEN** 20 mensagens válidas chegam ao mesmo tempo
- **THEN** todas recebem `200` e cada resposta local leva menos de 150ms (bem abaixo dos 400ms mínimos de uma chamada ao `/enrich`)

### Requirement: Validação do payload
O serviço MUST responder `400` com `{"error": "invalid_message"}` quando `run_id` não for string não vazia, `seq` não for inteiro maior ou igual a zero, ou `sku` não for string não vazia. Mensagens inválidas MUST NOT ser registradas nem enfileiradas.

#### Scenario: seq inválido
- **WHEN** a plataforma envia `{"run_id": "r1", "seq": -1, "sku": "sku-001"}` ou `seq` como `"7"` ou `7.5`
- **THEN** o serviço responde `400` com `{"error": "invalid_message"}` e nada é enfileirado

#### Scenario: Campos ausentes
- **WHEN** falta `run_id` ou `sku`
- **THEN** o serviço responde `400` com `{"error": "invalid_message"}`

### Requirement: Deduplicação por run_id + seq
O serviço SHALL tratar `run_id + seq` como identificador único. Uma mensagem repetida MUST receber `200` e MUST NOT ser enfileirada de novo; o run SHALL contabilizar a duplicata. Se a repetição trouxer um `sku` diferente, o serviço SHALL manter o primeiro e registrar um aviso no log.

#### Scenario: Mensagem duplicada
- **WHEN** a mesma mensagem `{"run_id": "r1", "seq": 7, "sku": "sku-007"}` chega duas vezes
- **THEN** ambas recebem `200`, o item é enfileirado uma única vez e o run registra 1 duplicata

#### Scenario: Mesmo seq em runs diferentes
- **WHEN** chegam `{"run_id": "r1", "seq": 0, ...}` e `{"run_id": "r2", "seq": 0, ...}`
- **THEN** as duas são aceitas e enfileiradas

### Requirement: Ordem não garantida e run desconhecido
O serviço SHALL aceitar mensagens em qualquer ordem de `seq` e SHALL aceitar mensagens de um `run_id` ainda não anunciado pelo burst, criando o run com `total` desconhecido; quando o burst for registrado depois, o `total` SHALL ser preenchido sem perder as mensagens já recebidas.

#### Scenario: Mensagem antes do burst
- **WHEN** chega `POST /process` para `r9` antes de o serviço registrar o burst de `r9`, e depois o burst informa `total` 20
- **THEN** a mensagem é aceita e enfileirada, e o run `r9` passa a ter `total` 20 com a mensagem já contabilizada

#### Scenario: Fora de ordem
- **WHEN** chegam os `seq` 5, 0 e 3, nessa ordem
- **THEN** os três são aceitos e enfileirados

### Requirement: Consulta do estado do run
O serviço SHALL expor `GET /admin/runs/:runId` (protegido por `x-admin-key`) respondendo `200` com `run_id`, `total`, `started_at`, `received` (mensagens únicas), `duplicates` e `pending`; e `404` com `{"error": "run_not_found"}` para run desconhecido.

#### Scenario: Run existente
- **WHEN** o run `r1` recebeu 3 mensagens únicas e 1 duplicata
- **THEN** a consulta responde `received` 3, `duplicates` 1 e `pending` 3

#### Scenario: Run inexistente
- **WHEN** um cliente autorizado consulta `GET /admin/runs/nao-existe`
- **THEN** o serviço responde `404` com `{"error": "run_not_found"}`
