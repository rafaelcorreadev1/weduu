# Desafio Weduu — Serviço de enriquecimento de SKUs

API Node.js + TypeScript + Express que se integra à plataforma Weduu: registra um webhook, recebe lotes de SKUs, enriquece cada SKU (preço/estoque) e devolve o lote consolidado. Fontes da verdade: `Desafio Técnico — Desenvolvedor(a) Full Stack Sênior.pdf` e `Documentação+Técnica+da+Integração.pdf` na raiz.

## Regras obrigatórias (pedir permissão antes)

- **Git:** nunca fazer `commit`, `push` ou `pull` (nem `merge`, `rebase`, `reset` ou `checkout` que descarte mudanças) sem pedido ou permissão explícita do usuário. A permissão vale só para aquela ação, não para as seguintes.
- **Banco de dados:** nunca alterar dados nem estrutura sem permissão explícita. Isso inclui criar ou rodar migrations, `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`, `ALTER` e qualquer ação equivalente via ORM ou script. Leituras (`SELECT`) são permitidas.
- Na dúvida se uma ação se enquadra nessas regras, perguntar antes de executar.

## Fluxo da integração

1. Expor o serviço via HTTPS público (ngrok na porta 4000).
2. `POST <base>/register` `{name, webhook}` → a plataforma chama `POST <webhook>/check` com `{token}`; devolvendo o mesmo token, recebemos `{cid, token}`. Falha: `422 {"error":"handshake_failed"}`.
3. `POST <base>/burst/:cid` (header `x-token`) → `{run_id, total: 20, started_at}`. Cada burst gera novos SKUs e novo `run_id`.
4. A plataforma envia 20 chamadas `POST /process` `{run_id, seq, sku}`.
5. Para cada SKU: `GET <base>/enrich/:sku` (headers `x-cid`, `x-token`) → `{sku, price, stock}`.
6. `POST <base>/callback` (header `x-token`) com `{cid, run_id, result: [{seq, sku, price, stock}]}`. Pode ser reenviado; cada envio gera um novo relatório.

Base URL: `https://dev-wdu-ped-test-1014944555984.us-central1.run.app`

## Restrições do contrato (não violar)

- **`/process`**: ACK com qualquer 2xx em até **600ms**, medido de ponta a ponta incluindo o túnel; timeout de 3s. Só status e tempo contam. A entrega é **at-least-once**, sem ordem garantida, com duplicatas possíveis; a chave única é `run_id + seq`. A primeira mensagem é warm-up e não entra na medição.
- **`/enrich`**: latência de 400–800ms. **Mais de 3 requisições em voo → 429** com `retry-after`. ~10% de `500` transitório. `401` = credencial inválida, `404` = SKU inválido.
- O relatório mede: tempo médio de ACK, tempo total, mensagens recebidas/processadas/duplicadas, itens perdidos, divergências, chamadas ao enrich e falhas.

## Critérios de avaliação (peso)

Contratos corretos ★5 · ACK rápido ★5 · Organização/arquitetura ★4 · Concorrência ★4 · Falhas e retries ★4 · Clareza do código ★3 · Documentação ★3.

Entrega: repositório com código, README sucinto, relatório da melhor execução e uma breve descrição de decisões arquiteturais, trade-offs e do que mudaria com **20.000 SKUs** em vez de 20.

## Arquitetura adotada

- **Recebimento desacoplado do processamento**: o `/process` valida, descarta duplicatas por `run_id + seq`, enfileira em memória e responde 200 **sem nenhum I/O de rede**. O processamento roda depois da resposta.
- **Worker do enrich**: semáforo global com no máximo 3 chamadas em voo (o limite é por credencial). Retry com backoff exponencial + jitter para `500`, timeout e erro de rede; `429` respeita `retry-after`; `401`/`404` são definitivos. Cache por SKU para não repetir chamadas.
- **Consolidação**: o run termina quando todos os `seq` de `0..total-1` estão em estado final. Se nenhum item está em processamento e mensagens esperadas não chegam por `RUN_IDLE_TIMEOUT_MS`, envia o resultado parcial; se as faltantes chegarem depois, reenvia completo. O `/callback` tem retry, um envio por vez por run, e não é reenviado por duplicatas. Resultado ordenado por `seq`.
- **Itens com falha definitiva (404, retries esgotados) entram no `result` com `price: null` e `stock: null`** (decisão do usuário, em vez de omitir). Se o relatório real penalizar isso, trocar em `src/callback/consolidate.ts` e reenviar via `POST /admin/runs/:runId/callback`.
- Runs são criados sob demanda caso um `/process` chegue antes da resposta do `/burst` ser registrada.
- Estado em memória (sem Redis/fila externa); a justificativa e o cenário de 20k SKUs ficam em `docs/DECISIONS.md`.

## Stack e convenções

- **TypeScript obrigatório** (nunca criar `.js` em `src/`, `test/` ou `scripts/`). Modo strict com `noUncheckedIndexedAccess`, ESM, Node >= 22.18.
- O Node roda os `.ts` direto (type stripping nativo, sem `tsx`/`ts-node`); o `tsc` só faz typecheck e build para `dist/`. Por isso `erasableSyntaxOnly`: **sem `enum`, parameter properties nem `namespace`** (use union types e campos declarados).
- Imports relativos sempre com extensão `.ts` (reescrita para `.js` no build); imports só de tipo com `import type`.
- Contratos externos tipados em `types.ts` de cada módulo, e payloads vindos da rede validados em runtime nas bordas.
- Express 5, pino para logs, testes com `node:test` + `supertest`. `.env` carregado via `--env-file-if-exists`.
- `createApp(deps)` em `src/app.ts` recebe dependências tipadas por interface (para testes com fakes). `src/service.ts` (`createService`) monta todos os componentes e é usado tanto pelo `src/server.ts` (entrypoint) quanto pelos testes de integração — mudanças de composição vão lá.
- Os testes de integração (`test/integration/`) sobem o serviço real contra `fake-platform.ts`, que imita o contrato do PDF. Ela é ferramenta de teste: não substitui uma execução contra a plataforma real.
- Layout: `src/config.ts`, `src/logger.ts`, `src/http/` (routes, middlewares), `src/platform/` (client, errors, credentials, types), `src/runs/` (RunStore), `src/queue/` (WorkQueue), `src/enrichment/` (worker, limiter), `src/resilience/` (retry-policy e timing, compartilhados), `src/callback/` (consolidate, run-finalizer). Scripts CLI em `scripts/`.
- Credenciais em `.credentials.json` (gitignored) ou nas envs `WEDUU_CID`/`WEDUU_TOKEN`. Rotas `/admin` protegidas por `ADMIN_KEY`.

## Comandos

- `npm run dev`: sobe o servidor na porta 4000 a partir do `src/` (watch).
- `npm run build` + `npm start`: compila para `dist/` e roda o build.
- `npm run typecheck`: `tsc --noEmit` em src, test e scripts.
- `npm test`: roda `test/**/*.test.ts`.
- `npm run register -- --name "..." [--webhook https://...]` e `npm run burst`: chamam as rotas `/admin` do servidor local.
- `ngrok http 4000`: expõe o serviço.
- Antes de concluir qualquer task: `npm run typecheck` e `npm test` passando.

## OpenSpec

O trabalho é feito em changes do OpenSpec (artefatos em pt-BR), implementadas nesta ordem:

1. `setup-base-service`: Express, config, logs, erros, `/health`, `/check` (✅ implementada).
2. `add-platform-client`: cliente HTTP, credenciais, rotas `/admin` e comandos `register` e `burst` (✅ implementada).
3. `add-process-ingestion`: `/process`, descarte de duplicatas, ACK rápido, `GET /admin/runs/:runId` (✅ implementada).
4. `add-enrichment-worker`: limite de 3 chamadas com pausa global no 429, retries com backoff, cache por run+SKU, itens `done`/`failed` (✅ implementada).
5. `add-run-consolidation-callback`: fim do run, timeout de inatividade, `/callback` com retry, reenvio manual (✅ implementada).
6. `add-docs-and-report`: `src/service.ts`, testes de integração com plataforma fake (`test/integration/`), README, `docs/DECISIONS.md` (✅ implementada; falta só preencher `docs/report.md` com uma execução real).

Cada change ganha especificação, design e tarefas completos só quando chega a vez dela. Use `/opsx:propose`, `/opsx:apply` e `/opsx:archive`.

## Ambiente

Windows + PowerShell 5.1. Ao escrever arquivos com acentos, usar a ferramenta Write/Edit, não `Set-Content` (corrompe o UTF-8).
