# Proposal

## Why

A entrega exige README sucinto, o relatório da melhor execução e uma descrição das decisões arquiteturais, trade-offs e do que mudaria com 20.000 SKUs. Documentação tem peso 3 na avaliação. Além disso, o fluxo completo (register → burst → process → enrich → callback) até agora só foi verificado manualmente contra uma plataforma fake fora do repositório; o avaliador não tem como reproduzir isso.

## What Changes

- Extrair a montagem dos componentes de `src/server.ts` para `src/service.ts` (`createService`), para que o servidor e o teste de integração usem exatamente a mesma composição.
- Plataforma fake em TypeScript dentro de `test/integration/` que imita o contrato documentado: handshake no `/register`, burst disparando 20 `/process` embaralhados e com duplicatas, `/enrich` com latência, 429 acima do limite de concorrência, 500 transitório e SKU inválido, e `/callback` que confere os valores contra o que foi servido.
- Testes de integração ponta a ponta: run feliz, mensagem perdida (callback parcial após o timeout) e plataforma com limite de concorrência menor que o nosso (forçando 429).
- `README.md`: pré-requisitos, configuração, ngrok, register, burst, testes.
- `docs/DECISIONS.md`: decisões, trade-offs e o cenário de 20.000 SKUs.
- `docs/report.md`: roteiro para registrar o relatório da melhor execução real (o relatório em si depende de rodar contra a plataforma real com ngrok).

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

- Refactor sem mudança de comportamento em `src/server.ts` → `src/service.ts`.
- Novos arquivos em `test/integration/` e `docs/`, e `README.md` na raiz.
- Sem mudança de comportamento observável (`skip_specs: true`).
