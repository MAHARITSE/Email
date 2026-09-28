# Cloudflare Pages Functions

Ce dossier contient les API serverless pour Cloudflare Pages.

## Structure

- `_middleware.ts` : Middleware global CORS pour `/api/*`
- `api/_shared.ts` : Utilitaires partagés (heuristique + Gemini REST)
- `api/health.ts` : `GET /api/health` → status + check GEMINI_API_KEY
- `api/ai/classify-emails.ts` : `POST /api/ai/classify-emails`
- `api/ai/improve-email.ts` : `POST /api/ai/improve-email`
- `api/ai/suggest-reply.ts` : `POST /api/ai/suggest-reply`
- `api/ai/draft-email.ts` : `POST /api/ai/draft-email`

## Compatibilité

- Runtime : Cloudflare Workers (V8 isolates)
- Pas de Node.js `fs`, `path`, `express` → utilise `fetch` natif
- Env vars via `context.env` (pas `process.env`)
- `GEMINI_API_KEY` doit être configuré comme secret dans Cloudflare Dashboard

## Dev local

```bash
npm run build:cloudflare
npx wrangler pages dev dist --compatibility-date=2024-12-01 --compatibility-flag=nodejs_compat
# → http://localhost:8788
# Test : curl http://localhost:8788/api/health
```

## Déploiement

Automatique via Cloudflare Pages : le dossier `functions/` est détecté et déployé avec `dist/`.
