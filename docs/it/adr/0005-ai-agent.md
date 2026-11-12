# 0005 — Agente IA in sola lettura, con revisione umana

🌐 [English](../../en/adr/0005-ai-agent.md) · [Português](../../pt-BR/adr/0005-ai-agent.md) · **Italiano**

- **Stato:** accettata
- **Data:** 2026-11-09

## Contesto

Il team vuole fare domande sulla base clienti in linguaggio naturale e ricevere bozze di messaggi
di retention. Rischi: allucinazioni, fuga di dati personali (LGPD), prompt injection tramite i
dati del negozio e costi.

## Decisione

- Tool calling con il tool runner dell'Anthropic SDK e tool Zod **in sola lettura** sulle stesse
  query testate della dashboard.
- Minimizzazione: il modello riceve nome e id interno, mai i contatti.
- L'output è sempre una bozza modificabile; nulla viene inviato in automatico.
- Quota per utente, iterazioni limitate, registro in `agent_runs`.
- **Aggiornamento 2026-11-11 (#26):** ogni utente usa la propria chiave API Anthropic (salvata
  cifrata); la chiave del server è usata solo da `AGENT_OWNER_EMAILS` e la quota vale solo per lei.
- Fallback lato server in caso di rifiuto e gestione esplicita di `refusal`.

## Conseguenze

- (+) Anche una prompt injection riuscita non ha tool pericolosi da usare.
- (+) Costi e comportamento osservabili per ogni esecuzione.
- (−) Per inviare la campagna, una persona copia la bozza — voluto in questa fase.
- (−) Ancora nessuna valutazione automatica: vedi [limitations.md](../limitations.md), voci G1–G6.
