# Agente di retention

🌐 [English](../en/agent.md) · [Português](../pt-BR/agent.md) · **Italiano**

Risponde a domande sulla base clienti del negozio attuale, compresi i carrelli abbandonati, e
scrive bozze di messaggi di retention nella lingua dell'interfaccia (inglese, portoghese o italiano).

## Come funziona

```text
Domanda (Server Action, autenticata, Zod)
  → quota per utente sulle ultime 24 h (agent_runs)
  → tool runner dell'Anthropic SDK (Claude, effort "medium", max 6 iterazioni)
      ↔ get_store_overview / find_customers / get_customer_profile / list_abandoned_checkouts   (sola lettura)
  → risposta mostrata come bozza modificabile
  → agent_runs: domanda, risposta, tool, token, latenza
```

## Tool

| Tool                       | Input                   | Restituisce                                                                                         |
| -------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------- |
| `get_store_overview`       | —                       | clienti per segmento, fatturato 30/90 gg, scontrino medio, più venduti                              |
| `find_customers`           | `segment`, `limit ≤ 50` | id, nome, ordini, LTV, scontrino medio, giorni dall'ultimo acquisto                                 |
| `get_customer_profile`     | `customer_id`           | metriche, consenso marketing, ultimi 10 ordini con articoli                                         |
| `list_abandoned_checkouts` | `limit ≤ 30`            | id cliente, nome (null per gli ospiti), consenso, articoli, valore, giorni dall'inizio del carrello |

Tutti riusano `lib/crm/queries.ts`, che ha test di integrazione.

## Principi

- **Sola lettura**: nessun tool scrive nel database o invia messaggi. Le azioni con effetti
  collaterali spettano sempre a una persona.
- **Minimizzazione dei dati (LGPD)**: il modello riceve nome e id interno — mai email, telefono o
  cognome. Suggerisce marketing solo per chi ha dato il consenso.
- **Valori già formattati nella valuta del negozio**: il modello non fa calcoli con il denaro.
- **Vincolato al negozio attuale**: il server crea i tool con lo `storeId` del negozio attuale
  dell'utente; il modello non può scegliere né vedere un altro negozio. Ogni esecuzione è salvata con il suo `storeId`.
- **Risponde nella lingua dell'interfaccia**: il prompt di sistema è in inglese e un secondo
  blocco chiede inglese, portoghese o italiano, come l'interfaccia.
- **I dati del negozio sono dati**: nomi e titoli dei prodotti possono contenere testo malevolo
  (prompt injection); il prompt dice al modello di trattarli come dati, e i tool non permettono
  azioni pericolose anche se obbedisse.
- **Costo controllato**: quota (`AGENT_DAILY_LIMIT` su 24 h mobili), iterazioni limitate, prompt
  statico (cacheabile) e token registrati per ogni esecuzione.
- **Rifiuti**: fallback lato server in caso di rifiuto (`fallbacks: "default"`) e gestione
  esplicita di `stop_reason: "refusal"` con un messaggio chiaro.

## Configurazione

| Variabile           | Default                                             |
| ------------------- | --------------------------------------------------- |
| `ANTHROPIC_API_KEY` | — (senza chiave la pagina mostra "non configurato") |
| `ANTHROPIC_MODEL`   | `claude-opus-5-5`                                   |
| `AGENT_DAILY_LIMIT` | `20`                                                |

## Audit

```sql
select created_at, question, input_tokens, output_tokens, duration_ms, error
from agent_runs order by created_at desc limit 20;
```

## Limiti

Nessuna valutazione automatica, una domanda alla volta, quota a finestra mobile, prompt injection
mitigata ma non impossibile, dati inviati a terzi: vedi [`limitations.md`](limitations.md), voci
G1–G5.
