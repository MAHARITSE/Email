# API Cloudflare (Workers & Pages Functions)

Ce dossier contient l'**implémentation unique** de l'API serverless (heuristiques +
Gemini REST). Elle est consommée de deux façons :

1. **Déploiement par défaut — Cloudflare Worker** (`npx wrangler deploy`, cf. `wrangler.jsonc`) :
   `worker/index.ts` route `/api/*` vers ces handlers en reconstruisant l'objet
   `context` de Pages Functions. Aucune duplication de code.
2. **Cloudflare Pages** (`npx wrangler pages deploy dist --project-name=gmail-pro`, nom de projet libre, distinct du Worker `email`) :
   le dossier `functions/` est détecté automatiquement par Pages.

## Structure

- `_middleware.ts` : middleware global (CORS + logging) pour `/api/*`
- `api/_shared.ts` : utilitaires partagés (heuristique de classement + Gemini REST)
- `api/health.ts` : `GET /api/health` → status + présence de `GEMINI_API_KEY`
- `api/ai/classify-emails.ts` : `POST /api/ai/classify-emails`
- `api/ai/improve-email.ts` : `POST /api/ai/improve-email`
- `api/ai/suggest-reply.ts` : `POST /api/ai/suggest-reply`
- `api/ai/draft-email.ts` : `POST /api/ai/draft-email`

## Compatibilité

- Runtime : Cloudflare Workers (isolats V8) — pas de `fs`, `path`, `express`
- `fetch` natif vers `generativelanguage.googleapis.com`
- Variables d'env via `context.env` (pas `process.env`)
- `GEMINI_API_KEY` doit être un secret (`npx wrangler secret put GEMINI_API_KEY`)
- Sans clé (ou avec une clé invalide) : réponse 200 + résultat heuristique, jamais d'erreur bloquante

## Dev local

```bash
npm run worker:dev     # Worker + SPA + ces API sur http://localhost:8787 (recommandé)
npm run pages:dev      # Simulation Cloudflare Pages (dist + functions/)
curl http://localhost:8787/api/health
```

## Déploiement

```bash
npm run deploy         # Workers : build automatique puis upload (Wrangler, Node >= 22)
npm run deploy:pages   # Pages : dist/ + functions/
```
