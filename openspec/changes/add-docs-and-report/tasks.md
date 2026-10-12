# Tasks

## 1. Composição compartilhada

- [x] 1.1 Extrair a montagem de `src/server.ts` para `src/service.ts` (`createService` com `start`/`stop`); verificar com `npm run typecheck`, `npm test` e o servidor subindo com `npm run dev`

## 2. Teste de integração

- [x] 2.1 Criar `test/integration/fake-platform.ts` (register com handshake, burst disparando `/process`, enrich com latência/429/500/404, callback com conferência de valores, cenários configuráveis); verificar usando-o no teste 2.2
- [x] 2.2 Criar `test/integration/flow.test.ts` com os cenários: run feliz (20 itens, ordenados, `seq` inválido com `null`, 0 divergências, no máximo 3 em voo, todos os ACKs 200), mensagem perdida (callback parcial com 19 itens) e limite de concorrência menor na plataforma (429 tratados, todos os itens `done`); verificar com `npm test`

## 3. Documentação

- [x] 3.1 Escrever `README.md` sucinto (requisitos, `.env`, ngrok, register, burst, acompanhamento, testes); verificar seguindo os comandos do README com o servidor local
- [x] 3.2 Escrever `docs/DECISIONS.md` (arquitetura, decisões, trade-offs, 20.000 SKUs); verificar que cobre as três perguntas da entrega
- [x] 3.3 Preencher `docs/report.md` com o relatório da melhor execução real; verificado com 10 lotes contra a plataforma real (melhor: score 100)
