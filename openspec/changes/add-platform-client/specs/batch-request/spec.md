# Spec Delta

## Purpose

Permite solicitar um novo lote de SKUs à plataforma e informar o restante do serviço sobre o run esperado (`run_id` e `total`) antes que as mensagens comecem a chegar.

## ADDED Requirements

### Requirement: Solicitação de lote
O serviço SHALL expor `POST /admin/burst` (protegido como os demais endpoints `/admin`), que chama `POST <PLATFORM_BASE_URL>/burst/<cid>` com o header `x-token` e responde `200` com `{run_id, total, started_at}` recebidos da plataforma.

#### Scenario: Lote solicitado
- **WHEN** há credenciais e a plataforma responde `{"run_id": "r1", "total": 20, "started_at": "2026-08-03T12:00:00Z"}`
- **THEN** o serviço responde `200` com o mesmo `run_id`, `total` e `started_at`

#### Scenario: Serviço não registrado
- **WHEN** não há `cid`/`token` disponíveis
- **THEN** o serviço responde `409` com `{"error": "not_registered"}` e não chama a plataforma

#### Scenario: Credencial recusada
- **WHEN** a plataforma responde `401`
- **THEN** o serviço responde `502` com `{"error": "platform_unauthorized"}`

#### Scenario: Plataforma indisponível
- **WHEN** a chamada falha por erro de rede, timeout ou status `5xx`
- **THEN** o serviço responde `502` com `{"error": "platform_unavailable"}`

### Requirement: Publicação do run iniciado
Ao receber a resposta do burst, o serviço MUST notificar internamente o run iniciado (`run_id`, `total`, `started_at`) antes de responder ao cliente administrativo, para que o total esperado já esteja conhecido quando chegarem as mensagens de `/process`.

#### Scenario: Run publicado
- **WHEN** o burst é bem-sucedido
- **THEN** o run `r1` com `total` 20 fica registrado internamente e é logado
