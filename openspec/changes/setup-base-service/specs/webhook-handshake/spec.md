# Spec Delta

## Purpose

Permite que a plataforma Weduu valide o webhook do serviço durante o registro, confirmando que ele está acessível e responde ao contrato de handshake.

## ADDED Requirements

### Requirement: Echo do token no handshake
O serviço SHALL expor `POST /check` que, ao receber um JSON com o campo `token` do tipo string não vazia, responde `200` com `{"token": <mesmo valor>}` e `content-type: application/json`.

#### Scenario: Handshake bem-sucedido
- **WHEN** a plataforma envia `POST /check` com `{"token": "a3f9"}`
- **THEN** o serviço responde `200` com o corpo `{"token": "a3f9"}`

#### Scenario: Token ausente
- **WHEN** a requisição `POST /check` não contém `token` ou ele não é uma string não vazia
- **THEN** o serviço responde `400` com `{"error": "invalid_token"}`

### Requirement: Handshake rápido e sem dependências externas
O `POST /check` MUST responder sem realizar chamadas de rede, para que o registro não falhe por timeout.

#### Scenario: Plataforma indisponível
- **WHEN** a plataforma Weduu está inacessível e o serviço recebe `POST /check` válido
- **THEN** o serviço ainda responde `200` com o token
