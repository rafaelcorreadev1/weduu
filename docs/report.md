# Relatório da melhor execução

Execução contra a plataforma real em 12/10/2026, com o serviço exposto por um túnel HTTPS (Cloudflare quick tunnel).

## Melhor execução — score 100

| Indicador | Valor |
|---|---|
| `run_id` | `exbwccyfatjvbiodwsrcm9d9` |
| Score | **100 / 100** |
| ACK (alvo 600ms) | p50 248ms · p95 323ms · pior 347ms · nenhum acima do alvo |
| Warm-up (não medido) | 256ms |
| Mensagens recebidas | 20 de 20, mais 1 duplicata |
| Idempotência | duplicata do `seq` 3 gerou 1 chamada ao enrich (esperado: 1) |
| Retries | 2 erros `500` forçados, 2 SKUs recuperados |
| Concorrência (limite 3) | nenhum `429` |
| Resultado | 20 de 20 corretos · 0 divergentes · 0 faltando |
| Chamadas ao enriquecimento | 22 (20 SKUs + 2 retries) |
| Duração medida pela plataforma | 2.062ms |
| Burst → callback enviado (nosso relógio) | 6,8s |

Pontuação por critério: resultado 30/30 · ACK 30/30 · idempotência 15/15 · retry 15/15 · concorrência 10/10.

Resposta completa da plataforma ao `POST /callback`:

```json
{
  "ok": true,
  "score": 100,
  "attempt": 1,
  "ack": {
    "target_ms": 600,
    "measured": 20,
    "p50": 248,
    "p95": 323,
    "worst": { "seq": 19, "ms": 347 },
    "over_target": [],
    "failed": [],
    "warmup_ms": 256,
    "pass": true
  },
  "idempotency": {
    "duplicate_seq": 3,
    "duplicate_sku": "cfqnqfoen1yn54k1jkwianw3",
    "enrich_calls": 1,
    "expected_calls": 1,
    "pass": true
  },
  "retry": { "forced_500": 2, "skus_with_500": 2, "recovered": 2, "pass": true },
  "concurrency": { "limit": 3, "got_429": 0, "skus_stuck_after_429": [], "pass": true },
  "result": {
    "expected": 20,
    "matched": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    "mismatched": [],
    "missing": [],
    "unknown": [],
    "pass": true
  },
  "duration_ms": 2062,
  "breakdown": {
    "result": { "weight": 30, "earned": 30 },
    "ack": { "weight": 30, "earned": 30 },
    "idempotency": { "weight": 15, "earned": 15 },
    "retry": { "weight": 15, "earned": 15 },
    "concurrency": { "weight": 10, "earned": 10 }
  }
}
```

## Todas as execuções da sessão

Foram 10 lotes seguidos. Resultado, idempotência, retry e concorrência passaram em todos; a única variação foi o ACK.

| # | Score | ACK p50 | ACK p95 | Pior ACK | Acima de 600ms | `500` forçados | `429` | Corretos | Chamadas ao enrich |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 100 | 290 | 338 | 338 | 0 | 3 | 0 | 20/20 | 23 |
| 2 | 100 | 256 | 532 | 574 | 0 | 3 | 0 | 20/20 | 23 |
| 3 | 97 | 252 | 2537 | 2538 | 2 | 8 | 0 | 20/20 | 28 |
| 4 | 99 | 252 | 551 | 794 | 1 | 4 | 0 | 20/20 | 24 |
| 5 | 97 | 255 | 2274 | 2275 | 2 | 1 | 0 | 20/20 | 21 |
| 6 | 100 | 252 | 320 | 484 | 0 | 6 | 0 | 20/20 | 26 |
| 7 | 100 | 253 | 277 | 542 | 0 | 3 | 0 | 20/20 | 23 |
| 8 | 100 | 260 | 535 | 557 | 0 | 5 | 0 | 20/20 | 25 |
| 9 | 100 | 252 | 327 | 485 | 0 | 5 | 0 | 20/20 | 25 |
| **10** | **100** | 248 | 323 | 347 | 0 | 2 | 0 | 20/20 | 22 |

### Sobre os ACKs lentos das execuções 3, 4 e 5

Em três execuções, um ou dois ACKs passaram de 600ms. O que foi medido:

- Requisições ao mesmo servidor por `localhost`, inclusive durante lotes em andamento: mediana de 2 a 3ms e pior caso de 77ms em mais de 16.000 requisições.
- As mesmas requisições pelo túnel, com o servidor ocioso: mediana de 64ms, com picos isolados de até 592ms.
- O ACK mediano medido pela plataforma fica em torno de 250ms, ou seja, quase todo o tempo é rede.

O tempo do servidor é de poucos milissegundos, então os picos vêm do caminho de rede (túnel gratuito sobre uma única conexão), não do handler. Os picos não se repetiram nas execuções em que o servidor estava sendo medido por dentro, então essa conclusão é uma inferência dessas medições, não uma observação direta dos lotes lentos. Um túnel com mais de uma conexão ou um deploy próximo da plataforma deve eliminá-los.

### O que estas execuções não exercitaram

Nenhum lote trouxe SKU inválido (`404`) nem provocou `429`, então o tratamento desses casos (item com `price` e `stock` nulos, pausa global pelo `retry-after`) está coberto apenas pelos testes automatizados.

## Como reproduzir

Siga o [README](../README.md) até o `npm run burst` e consulte o run:

```bash
curl -H "x-admin-key: <ADMIN_KEY>" http://localhost:4000/admin/runs/<run_id>
```

O campo `callback.response` traz o relatório devolvido pela plataforma.
