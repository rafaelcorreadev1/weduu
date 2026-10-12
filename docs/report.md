# Relatório da execução

> **Pendente:** este arquivo será preenchido com o relatório da melhor execução contra a plataforma real.

## Como gerar

1. Siga o [README](../README.md) até o `npm run burst`.
2. Aguarde o callback (cerca de 5s) e consulte o run:

   ```bash
   curl -H "x-admin-key: $ADMIN_KEY" http://localhost:4000/admin/runs/<run_id>
   ```

   O campo `callback.response` traz a resposta da plataforma ao `/callback`. O log do serviço também registra essa resposta na linha `callback sent`.
3. Repita o burst algumas vezes e copie abaixo o relatório da melhor execução.

## Melhor execução

| Indicador | Valor |
|---|---|
| Data | |
| `run_id` | |
| Tempo médio de ACK | |
| Tempo total de processamento | |
| Mensagens recebidas | |
| Mensagens processadas | |
| Mensagens duplicadas | |
| Itens perdidos | |
| Divergências no resultado | |
| Chamadas ao serviço de enriquecimento | |
| Falhas encontradas | |

Relatório completo retornado pela plataforma:

```json

```
