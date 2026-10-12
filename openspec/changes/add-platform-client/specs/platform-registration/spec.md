# Spec Delta

## Purpose

Permite registrar o webhook do serviço na plataforma Weduu e manter as credenciais (`cid` e `token`) disponíveis para as chamadas seguintes, inclusive após reinícios.

## ADDED Requirements

### Requirement: Proteção dos endpoints administrativos
Os endpoints sob `/admin` MUST exigir o header `x-admin-key` igual à env `ADMIN_KEY`, porque o serviço fica exposto publicamente pelo túnel.

#### Scenario: ADMIN_KEY não configurada
- **WHEN** a env `ADMIN_KEY` está vazia e um cliente chama qualquer rota `/admin`
- **THEN** o serviço responde `503` com `{"error": "admin_disabled"}`

#### Scenario: Chave ausente ou incorreta
- **WHEN** um cliente chama uma rota `/admin` sem `x-admin-key` ou com valor diferente de `ADMIN_KEY`
- **THEN** o serviço responde `401` com `{"error": "unauthorized"}` e não chama a plataforma

### Requirement: Registro do webhook
O serviço SHALL expor `POST /admin/register` com corpo `{name, webhook}`. Quando `webhook` for omitido, SHALL usar a env `PUBLIC_URL`. O serviço chama `POST <PLATFORM_BASE_URL>/register` e, em caso de sucesso, guarda `cid` e `token` e responde `200` com `{"cid": <cid>}`, sem devolver o token.

#### Scenario: Registro bem-sucedido
- **WHEN** um cliente autorizado chama `POST /admin/register` com `{"name": "Fulano", "webhook": "https://x.ngrok.app"}` e a plataforma responde `{"cid": "c1", "token": "t1"}`
- **THEN** o serviço responde `200` com `{"cid": "c1"}` e passa a usar `c1`/`t1` nas chamadas seguintes

#### Scenario: Dados obrigatórios ausentes
- **WHEN** `name` não é uma string não vazia, ou não há `webhook` no corpo nem `PUBLIC_URL` configurada
- **THEN** o serviço responde `400` com `{"error": "invalid_request"}` e não chama a plataforma

#### Scenario: Handshake recusado
- **WHEN** a plataforma responde `422` com `{"error": "handshake_failed", "reason": "timeout"}`
- **THEN** o serviço responde `422` com `{"error": "handshake_failed", "reason": "timeout"}` e mantém as credenciais anteriores

#### Scenario: Plataforma indisponível
- **WHEN** a chamada à plataforma falha por erro de rede, timeout ou status `5xx`
- **THEN** o serviço responde `502` com `{"error": "platform_unavailable"}`

### Requirement: Persistência das credenciais
Após um registro bem-sucedido, o serviço SHALL gravar `cid` e `token` em `.credentials.json` e carregá-los ao iniciar. As envs `WEDUU_CID` e `WEDUU_TOKEN`, quando ambas definidas, MUST ter precedência sobre o arquivo.

#### Scenario: Reinício após registro
- **WHEN** o serviço reinicia e existe `.credentials.json` válido
- **THEN** as credenciais do arquivo ficam disponíveis sem novo registro

#### Scenario: Credenciais por env
- **WHEN** `WEDUU_CID` e `WEDUU_TOKEN` estão definidas e também existe `.credentials.json`
- **THEN** o serviço usa os valores das envs
