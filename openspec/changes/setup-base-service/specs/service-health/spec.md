# Spec Delta

## Purpose

Define o comportamento base do servidor HTTP: verificação de saúde, respostas JSON consistentes para erros e rotas desconhecidas, e encerramento seguro.

## ADDED Requirements

### Requirement: Endpoint de saúde
O serviço SHALL expor `GET /health` respondendo `200` com `{"status": "ok"}`.

#### Scenario: Serviço no ar
- **WHEN** um cliente chama `GET /health`
- **THEN** o serviço responde `200` com `{"status": "ok"}`

### Requirement: Rotas desconhecidas
O serviço SHALL responder `404` com `{"error": "not_found"}` para rotas não mapeadas.

#### Scenario: Rota inexistente
- **WHEN** um cliente chama `GET /nao-existe`
- **THEN** o serviço responde `404` com `{"error": "not_found"}`

### Requirement: JSON malformado
O serviço SHALL responder `400` com `{"error": "invalid_json"}` quando o corpo da requisição não for JSON válido, sem encerrar o processo.

#### Scenario: Corpo inválido
- **WHEN** um cliente envia `POST /check` com corpo `{token:` e `content-type: application/json`
- **THEN** o serviço responde `400` com `{"error": "invalid_json"}` e continua atendendo novas requisições

### Requirement: Erros inesperados
O serviço MUST responder `500` com `{"error": "internal_error"}` para exceções não tratadas em handlers, sem expor stack trace.

#### Scenario: Exceção em handler
- **WHEN** um handler lança uma exceção inesperada
- **THEN** o serviço responde `500` com `{"error": "internal_error"}` e registra o erro no log

### Requirement: Encerramento gracioso
Ao receber `SIGINT` ou `SIGTERM`, o serviço SHALL parar de aceitar conexões e encerrar após concluir as requisições em andamento.

#### Scenario: Sinal de término
- **WHEN** o processo recebe `SIGTERM`
- **THEN** o servidor fecha o listener e o processo termina com código 0
