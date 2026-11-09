# 0004 — Better Auth per l'autenticazione

🌐 [English](../../en/adr/0004-better-auth.md) · [Português](../../pt-BR/adr/0004-better-auth.md) · **Italiano**

- **Stato:** accettata
- **Data:** 2026-11-09

## Contesto

Strumento interno: pochi utenti, nessuna registrazione pubblica, sessioni revocabili e dati di
autenticazione nel nostro Postgres.

## Decisione

Better Auth con l'adapter Prisma: email/password con `disableSignUp`, GitHub OAuth opzionale con
allowlist (`ALLOWED_EMAILS` tramite `validateUserInfo`), rate limit sul login. Controllo
ottimistico in `proxy.ts` e autorizzazione vera nella DAL (`requireUser()`).

## Alternative

- **Auth.js (NextAuth)**: la v5 è rimasta a lungo in beta; il progetto è ora mantenuto dal team di
  Better Auth.
- **Supabase Auth**: legherebbe l'autenticazione al fornitore del database.
- **Clerk**: ottima DX, ma SaaS a pagamento e dati degli utenti fuori dal nostro database.

## Conseguenze

- (+) Sessioni nel database (revoca immediata al logout), nessun vendor lock-in.
- (−) Tabelle di auth nel nostro schema, versionate dalle migrazioni (ed è quello che vogliamo).
- (−) Ancora niente reset password, verifica email né ruoli: vedi [limitations.md](../limitations.md), voci A1–A3.
