# Tasks

## 1. Setup do projeto

- [x] 1.1 Criar `package.json` (ESM, Node >= 22.18, scripts `build`, `typecheck`, `start`, `dev`, `test`) e `.gitignore`; verificar com `npm install` sem erros
- [x] 1.2 Adicionar dependências `express`, `pino` e dev `typescript`, `@types/*`, `supertest`; verificar que aparecem no `package-lock.json`
- [x] 1.3 Criar `tsconfig.json` (strict, `erasableSyntaxOnly`, `rewriteRelativeImportExtensions`) e `tsconfig.build.json` (emite para `dist/`); verificar com `npm run typecheck` e `npm run build` sem erros
- [x] 1.4 Criar `src/config.ts` lendo `PORT` (4000), `PLATFORM_BASE_URL` e `LOG_LEVEL` com defaults, e `.env.example`; verificar com teste unitário de defaults

## 2. Servidor base

- [x] 2.1 Criar `src/logger.ts` (pino) e `src/app.ts` com `createApp()`, parser JSON e middlewares de 404/erro; verificar com testes de rota inexistente, JSON inválido e exceção em handler
- [x] 2.2 Implementar `GET /health`; verificar com teste `supertest`
- [x] 2.3 Criar `src/server.ts` com listen e graceful shutdown em SIGINT/SIGTERM; verificar subindo com `npm start` e chamando `/health`

## 3. Handshake

- [x] 3.1 Implementar `POST /check` ecoando o token e respondendo 400 para token inválido; verificar com testes dos cenários da spec `webhook-handshake`
