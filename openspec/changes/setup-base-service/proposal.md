# Proposal

## Why

O desafio exige um serviço HTTP público que a plataforma Weduu consiga validar (`POST /check`) antes de enviar lotes de SKUs. Sem um esqueleto estável (servidor Express, configuração, logs, testes) as próximas changes — ingestão, enriquecimento e callback — não têm onde se apoiar.

## What Changes

- Criar o projeto Node.js + TypeScript (ESM, strict) com Express, scripts `npm run build`, `npm run typecheck`, `npm start`, `npm run dev` e `npm test`.
- Centralizar configuração via variáveis de ambiente (`PORT`, `PLATFORM_BASE_URL`, `LOG_LEVEL`) com valores padrão.
- Adicionar logger estruturado (JSON) e tratamento global de erros que nunca derruba o processo.
- Implementar `POST /check`, que devolve o `token` recebido (handshake do registro).
- Implementar `GET /health` para diagnóstico local e via túnel.
- Encerramento gracioso em `SIGINT`/`SIGTERM`.

## Capabilities

### New Capabilities
- `webhook-handshake`: validação do webhook pela plataforma via `POST /check`.
- `service-health`: endpoint de saúde e comportamento base do servidor HTTP (JSON, erros, rotas desconhecidas).

### Modified Capabilities

## Impact

- Novo código em `src/` (app, server, config, logger, rotas) e `test/`.
- Dependências: `express`, `pino`; dev: `typescript`, `@types/node`, `@types/express`, `@types/supertest`, `supertest`. Testes com `node:test` nativo.
- Porta padrão 4000, compatível com o `ngrok http 4000` da documentação.
