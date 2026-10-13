# ICEP HUB — Painel de disparos WhatsApp

Painel estático (GitHub Pages) com os resultados da régua de WhatsApp do funil 0 (Bitrix24 ICEP HUB).

- `index.html`: o painel. Lê o `data.json` do próprio repositório.
- `data.json`: dados atualizados automaticamente pelo GitHub Actions (`.github/workflows/atualizar.yml`), a cada 1 hora. O script é `scripts/atualizar.mjs`.
- Segredos do repositório (Settings → Secrets and variables → Actions): `META_TOKEN` (token do usuário do sistema da Meta) e `BITRIX_WEBHOOK` (URL do webhook de entrada do Bitrix24).
- Atualização manual: aba Actions → Atualizar painel → Run workflow.

## Métricas
- **Envios, entregues e lidas**: estatísticas de templates da Meta (templates da régua), por número e por dia (UTC).
- **Respondidas**: conversas abertas pelo lead no Canal Aberto do vendedor (Bitrix24).
- **Tempo médio de retorno do operador**: da mensagem do lead até a primeira resposta do operador (Canais Abertos do Bitrix24).
- **Qualidade e status**: leitura de cada número na Meta no momento da atualização.

## Formato do data.json
```json
{
  "geradoEm": "ISO-8601",
  "rows": [{"data": "AAAA-MM-DD", "numero": "55...", "vendedor": "...", "envios": 0, "entregues": 0, "lidas": 0, "respondidas": 0}],
  "status": [{"numero": "55...", "vendedor": "...", "qualidade": "GREEN", "status": "CONNECTED", "limite": "TIER_2K", "nome_exibicao": "...", "status_nome": "..."}],
  "tempoRetorno": null,
  "avisos": []
}
```
