# Weduu — Serviço de enriquecimento de SKUs

Serviço Node.js + TypeScript + Express que se registra na plataforma Weduu, recebe lotes de SKUs em `POST /process`, confirma o recebimento rapidamente, enriquece cada SKU em segundo plano (`GET /enrich/:sku`) e entrega o lote consolidado em `POST /callback`.

- Decisões arquiteturais, trade-offs e o cenário de 20.000 SKUs: [docs/DECISIONS.md](docs/DECISIONS.md)
- Relatório da melhor execução: [docs/report.md](docs/report.md)

## Requisitos

- Node.js >= 22.18
- [ngrok](https://ngrok.com/) (ou outro túnel HTTPS)

## Como executar

```bash
npm install
cp .env.example .env
```

No `.env`, preencha `ADMIN_KEY` (qualquer valor secreto; protege as rotas `/admin`, já que o túnel deixa o serviço público) e `PUBLIC_URL` (a URL HTTPS do túnel).

```bash
ngrok http 4000                           # terminal 1: copie a URL https para PUBLIC_URL
npm run dev                               # terminal 2: sobe o serviço na porta 4000
npm run register -- --name "Seu Nome"     # terminal 3: registra o webhook (uma vez)
npm run burst                             # solicita um lote; pode repetir
```

Depois do `burst`, o serviço recebe as mensagens, enriquece os SKUs e envia o `/callback` sozinho. Para ver o resultado de um run, incluindo a resposta da plataforma ao callback:

```bash
curl -H "x-admin-key: <ADMIN_KEY>" http://localhost:4000/admin/runs/<run_id>
```

Para produção: `npm run build && npm start`.

## Testes

```bash
npm run typecheck
npm test
```

`npm test` inclui um teste de integração do fluxo completo contra uma plataforma simulada (`test/integration/`), sem precisar de credenciais nem de rede externa.
