# Design

## Context

Projeto greenfield. A plataforma mede o ACK de `/process` de ponta a ponta com SLA de 600ms, então a base precisa ser enxuta desde o início: nada de middleware pesado no caminho de requisição. Ver proposal.md para motivação.

## Goals / Non-Goals

**Goals:**
- Estrutura de pastas que acomode as próximas changes (cliente da plataforma, ingestão, worker, callback) sem reorganização.
- `createApp()` separado de `server.ts` para testar rotas com `supertest` sem abrir porta.

**Non-Goals:**
- Autenticação nos endpoints expostos (o contrato não define nenhuma).
- Persistência, filas ou métricas — chegam nas changes seguintes.

## Decisions

- **TypeScript estrito executado pelo type stripping nativo do Node.** Em desenvolvimento e nos testes, o Node (>= 22.18) roda os `.ts` direto, sem `tsx`/`ts-node`. O `tsc` faz o typecheck (`npm run typecheck`) e o build para `dist/` (`npm run build`), usado pelo `npm start`. Imports relativos usam a extensão `.ts`, reescrita para `.js` no build (`rewriteRelativeImportExtensions`). `erasableSyntaxOnly` proíbe sintaxe que o Node não consegue apenas apagar (enums, parameter properties, namespaces). Alternativas: JavaScript puro (contratos implícitos, inadequado para o nível da vaga); `tsx` (mais uma dependência com binário nativo, desnecessária no Node 24).
- **Express 5.** Trata promises rejeitadas em handlers async nativamente, dispensando wrappers. Alternativa: Fastify (mais rápido), descartado porque o desafio pede Express.
- **pino para logs.** JSON estruturado e barato no hot path. Alternativa: `console.log` — sem níveis nem contexto por run.
- **`node:test` + `supertest`.** Sem framework de teste extra. Alternativa: Jest/Vitest — mais features, mas desnecessárias aqui.
- **Layout:**
  ```
  src/
    config.ts        # leitura e validação de env
    logger.ts
    app.ts           # createApp(deps) — monta middlewares e rotas
    server.ts        # entrypoint: listen + graceful shutdown
    http/
      routes/        # check.ts, health.ts (process.ts virá depois)
      middlewares/   # errorHandler, notFound
  test/
  ```
- **Injeção de dependências simples via `createApp(deps)`**: as próximas changes passam store/fila/cliente por parâmetro, tipados por interfaces, facilitando testes com fakes.

## Risks / Trade-offs

- [Express não é o framework mais rápido] → o ACK depende de não fazer I/O no handler, não do framework; ganho do Fastify seria marginal frente à latência do túnel.
- [Tipos não validam payloads em runtime] → validação explícita nas bordas (corpo das requisições e respostas da plataforma) e testes por cenário de spec.
