# Spec Delta

## Purpose

Consulta preço e estoque de cada SKU recebido no serviço de enriquecimento da plataforma, respeitando o limite de concorrência e tolerando falhas transitórias, e registra o resultado final de cada item do run.

## ADDED Requirements

### Requirement: Chamada autenticada ao enriquecimento
Para cada item aceito, o serviço SHALL chamar `GET <PLATFORM_BASE_URL>/enrich/<sku>` com os headers `x-cid` e `x-token` das credenciais atuais. Uma resposta `200` com `price` e `stock` numéricos SHALL marcar o item como `done` com esses valores.

#### Scenario: Enriquecimento bem-sucedido
- **WHEN** o item `{run_id: "r1", seq: 7, sku: "sku-007"}` é processado e a plataforma responde `{"sku": "sku-007", "price": 149.9, "stock": 42}`
- **THEN** o item `seq` 7 do run `r1` fica `done` com `price` 149.9 e `stock` 42

#### Scenario: Serviço sem credenciais
- **WHEN** um item é processado e não há `cid`/`token` disponíveis
- **THEN** o item fica `failed` com motivo `not_registered` e nenhuma chamada é feita

### Requirement: Limite de concorrência
O serviço MUST manter no máximo `ENRICH_MAX_CONCURRENCY` (padrão 3) requisições ao `/enrich` em voo ao mesmo tempo, somando todos os runs.

#### Scenario: Rajada de 20 itens
- **WHEN** 20 itens chegam de uma vez
- **THEN** em nenhum momento há mais de 3 chamadas ao `/enrich` em andamento, e todos os itens são processados

### Requirement: Retry de falhas transitórias
Respostas `5xx`, timeout (`ENRICH_TIMEOUT_MS`, padrão 3000ms) e erro de rede SHALL ser repetidos com backoff exponencial e jitter, até `ENRICH_MAX_ATTEMPTS` (padrão 5) tentativas no total. Esgotadas as tentativas, o item SHALL ficar `failed` com o motivo da última falha.

#### Scenario: 500 seguido de sucesso
- **WHEN** a primeira chamada responde `500` e a segunda `200`
- **THEN** o item fica `done` após 2 chamadas

#### Scenario: Falha persistente
- **WHEN** todas as tentativas respondem `500`
- **THEN** o serviço faz exatamente `ENRICH_MAX_ATTEMPTS` chamadas e o item fica `failed` com motivo `server`

### Requirement: Respeito ao 429
Ao receber `429`, o serviço MUST aguardar o tempo indicado em `retry-after` antes de enviar qualquer nova chamada ao `/enrich` (de qualquer item) e SHALL repetir a chamada. Respostas `429` MUST NOT consumir as tentativas de `ENRICH_MAX_ATTEMPTS`; o serviço SHALL desistir apenas após 20 respostas `429` consecutivas para o mesmo item.

#### Scenario: 429 com retry-after
- **WHEN** uma chamada responde `429` com `retry-after: 1`
- **THEN** nenhuma nova chamada ao `/enrich` é enviada durante 1 segundo, e depois a chamada é repetida

### Requirement: Falhas definitivas
Respostas `401`, `404` e respostas `200` fora do contrato MUST NOT ser repetidas; o item SHALL ficar `failed` com motivo `unauthorized`, `not_found` ou `invalid_response`.

#### Scenario: SKU inválido
- **WHEN** a plataforma responde `404` para o SKU do item
- **THEN** o item fica `failed` com motivo `not_found` após uma única chamada

### Requirement: Uma consulta por SKU em cada run
Itens do mesmo run com o mesmo `sku` MUST compartilhar uma única consulta bem-sucedida (ou definitiva de `404`), inclusive quando processados ao mesmo tempo.

#### Scenario: SKU repetido em seq diferentes
- **WHEN** os itens `seq` 1 e `seq` 2 do run `r1` têm o mesmo `sku`
- **THEN** o `/enrich` é chamado uma vez para esse `sku` e os dois itens recebem o mesmo resultado

### Requirement: Progresso do enriquecimento no estado do run
`GET /admin/runs/:runId` SHALL incluir `done`, `failed` e `enrich_calls` (total de chamadas HTTP ao `/enrich` feitas para o run), e `pending` SHALL contar apenas itens ainda não finalizados.

#### Scenario: Run em andamento
- **WHEN** o run `r1` tem 3 itens recebidos, 2 `done` e 1 aguardando, com 3 chamadas ao `/enrich`
- **THEN** a consulta mostra `done` 2, `failed` 0, `pending` 1 e `enrich_calls` 3
