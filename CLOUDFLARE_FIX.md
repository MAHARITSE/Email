# ✅ Fix Déploiement Cloudflare Pages — Rapport de Vérification Approfondie

## 🔍 Diagnostic Initial

### Problèmes détectés bloquant le déploiement Cloudflare

1. **Architecture incompatible Cloudflare Pages**
   - Le projet utilisait `server.ts` avec Express (`express`, `dotenv`, `vite middleware`) qui nécessite un serveur Node.js persistant
   - Cloudflare Pages est un hébergement **statique** + **Functions** (Workers), pas un serveur Node Express
   - Build original : `vite build && esbuild server.ts -> dist/server.cjs` → `dist/server.cjs` inutilisable sur Pages
   - Conséquence : `/api/ai/*` retournait 404, l'app semblait cassée

2. **Fichiers CNAME invalides**
   - `/CNAME` contenait `email.pro` (domaine incomplet)
   - `/docs/CNAME` contenait `gmail_pro.com` (underscore `_` interdit dans les domaines DNS → échec validation domaine Cloudflare)
   - Cloudflare Pages ne utilise PAS de fichier CNAME (c'est pour GitHub Pages) → suppression nécessaire

3. **Modèles Gemini inexistants**
   - `server.ts` utilisait `gemini-3.8-flash`, `gemini-3.1-flash-lite` qui n'existent pas
   - L'API Gemini retournait 404 → fallback non testé sur Cloudflare

4. **SPA Routing non configuré**
   - Pas de `_redirects` → refresh sur `/` ou route client → 404 sur Cloudflare Pages
   - Pas de `_routes.json` → Functions `/api/*` pouvaient être interceptées par le fallback SPA

5. **Variables d'environnement**
   - Pas de documentation pour `GEMINI_API_KEY` (secret) vs `VITE_GOOGLE_CLIENT_ID` (public)
   - Pas de `.node-version` → Cloudflare pouvait utiliser Node 18 avec incompatibilités

6. **Résilience client**
   - `src/services/aiAssistant.ts` throwait sur 404 → si Functions non déployées, l'UI cassait au lieu de fallback local

---

## 🛠️ Corrections Appliquées

### 1. Cloudflare Pages Functions (Workers) — API compatible

Création du dossier `functions/` qui est automatiquement déployé par Cloudflare Pages :

```
functions/
├── _middleware.ts          # CORS global + logging pour /api/*
├── api/
│   ├── _shared.ts          # Heuristique + Gemini REST (compatible Workers)
│   ├── health.ts           # GET /api/health
│   └── ai/
│       ├── classify-emails.ts  # POST /api/ai/classify-emails
│       ├── improve-email.ts    # POST /api/ai/improve-email
│       ├── suggest-reply.ts    # POST /api/ai/suggest-reply
│       └── draft-email.ts      # POST /api/ai/draft-email
```

**Points clés :**
- Utilise `fetch` REST vers `generativelanguage.googleapis.com` (compatible Workers, pas besoin de `@google/genai` qui a des deps Node)
- Fallback heuristique si `GEMINI_API_KEY` absent
- Retry + fallback models valides : `gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-2.0-flash-lite`
- CORS `Access-Control-Allow-Origin: *` pour dev + prod
- `context.env.GEMINI_API_KEY` (Pages Functions) au lieu de `process.env`

### 2. Configuration SPA Cloudflare

**`public/_redirects`** (copié dans `dist/` par Vite) :
```
/*    /index.html   200
/assets/*  /assets/:splat  200
```
→ Toutes les routes client retombent sur `index.html` (React Router SPA)

**`public/_headers`** :
- Security headers (`X-Frame-Options`, `X-Content-Type-Options`, etc.)
- Cache immutable pour `/assets/*`, `*.js`, `*.css`
- `Cross-Origin-Opener-Policy: same-origin-allow-popups` nécessaire pour Google OAuth popup

**`public/_routes.json`** :
```json
{
  "version": 1,
  "include": ["/api/*"],
  "exclude": ["/assets/*", "/*.(js|css|...)"]
}
```
→ Force Cloudflare à router `/api/*` vers Functions, pas vers static.

### 3. Wrangler Config

**`wrangler.toml`** + **`wrangler.jsonc`** :
- `pages_build_output_dir = "dist"`
- `compatibility_date = "2024-12-01"`
- `compatibility_flags = ["nodejs_compat"]` (requis pour `Buffer`, `TextEncoder`, etc.)
- `build.command = "npm run build:cloudflare"`
- Documentation des vars/secrets à setter dans dashboard

### 4. Build Scripts

**`package.json`** :
```json
{
  "build": "vite build && esbuild server.ts --bundle ... --outfile=dist/server.cjs",
  "build:client": "vite build",
  "build:cloudflare": "vite build",
  "pages:dev": "wrangler pages dev dist --compatibility-date=2024-12-01 --compatibility-flag=nodejs_compat"
}
```
- `build` garde compatibilité Node (Express) pour déploiement classique (VPS, Render, etc.)
- `build:cloudflare` ne build que le client (pas de `server.cjs` inutile)
- Cloudflare Dashboard doit utiliser `npm run build:cloudflare` + output `dist`

### 5. Vite Config

**`vite.config.ts`** :
- `build.outDir = "dist"`, `emptyOutDir: true`
- `manualChunks` : split `pdf`, `xlsx`, `vendor-react` pour réduire chunk principal (<500kB)
- `server.proxy /api` → `localhost:3000` pour dev local avec Express
- `define process.env.NODE_ENV` pour compat

### 6. Fix CNAME

- Suppression `CNAME` racine et `docs/CNAME` (invalide `gmail_pro.com`)
- Explication : custom domain Cloudflare se configure dans Dashboard > Pages > Custom domains, PAS via fichier CNAME
- Si besoin GitHub Pages, utiliser un domaine valide sans underscore, ex: `gmail-pro.com` ou `email.pro`

### 7. Fix Gemini Models

**`server.ts`** :
```ts
// Avant (inexistant)
['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite']

// Après (valide)
['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.0-flash-lite', 'gemini-flash-latest', 'gemini-1.5-flash-8b']
```
Idem dans `functions/api/_shared.ts`

### 8. Résilience Client (Cloudflare static-only fallback)

**`src/services/aiAssistant.ts`** :
- Nouveau helper `safeFetchJson` qui catch network errors
- Si `/api/*` 404 (Functions non déployées ou static hosting pur), fallback local :
  - `improveEmailText` → ajoute `Bonjour/Cordialement` ou tronque
  - `getSmartReplySuggestions` → 3 suggestions par défaut
  - `draftEmailWithAi` → template simple
- Plus de throw bloquant l'UI, seulement `console.warn`

### 9. Env & Node Version

- `.env.example` complet avec `GEMINI_API_KEY`, `VITE_GOOGLE_CLIENT_ID`, `NODE_VERSION=20`
- `.node-version = 20` → force Node 20 sur Cloudflare Pages
- `.gitignore` déjà ok (ignore `.env*` sauf `.env.example`)

---

## 🚀 Déploiement Cloudflare Pages — Procédure Corrigée

### Option A : Dashboard Cloudflare (recommandé)

1. **Connecter le repo** GitHub `MAHARITSE/Email` à Cloudflare Pages
2. **Build settings** :
   - Framework preset : `Vite` ou `None`
   - Build command : `npm run build:cloudflare`
   - Build output directory : `dist`
   - Root directory : `/` (ou `Email` si monorepo)
   - Node version : `20` (variable d'env `NODE_VERSION=20`)

3. **Environment variables** (Settings > Environment Variables) :
   - **Production + Preview** :
     - `VITE_GOOGLE_CLIENT_ID` = `578253832851-....apps.googleusercontent.com` (public, var)
     - `GEMINI_API_KEY` = `AIza...` (secret, encrypted, pour Functions)
   - **Optional** :
     - `NODE_VERSION` = `20`
     - `NODE_ENV` = `production`

4. **Deploy** → Cloudflare va :
   - `npm install`
   - `npm run build:cloudflare` → génère `dist/` + copie `public/_redirects`, `_headers`, `_routes.json`
   - Déployer `dist/` en static + `functions/` en Workers

5. **Custom Domain** (si besoin) :
   - Pages > Custom domains > Set up a custom domain
   - Entrer `email.pro` ou `gmail-pro.com` (sans underscore !)
   - Cloudflare gère DNS + SSL auto
   - NE PAS créer de fichier CNAME dans le repo

### Option B : Wrangler CLI

```bash
npm install -g wrangler
# ou npx wrangler

# Build
npm run build:cloudflare

# Dev local avec Functions (simule Cloudflare)
npx wrangler pages dev dist --compatibility-date=2024-12-01 --compatibility-flag=nodejs_compat --port 8788
# Teste http://localhost:8788/api/health

# Deploy direct
npx wrangler pages deploy dist --project-name=gmail-pro --compatibility-date=2024-12-01 --compatibility-flag=nodejs_compat

# Secrets
npx wrangler pages secret put GEMINI_API_KEY --project-name=gmail-pro
# puis entrer la clé
```

### Option C : Déploiement Node classique (toujours supporté)

```bash
npm install
npm run build   # vite + esbuild server.cjs
GEMINI_API_KEY=xxx VITE_GOOGLE_CLIENT_ID=yyy npm start
# Serveur Express sur http://localhost:3000 sert dist/ + /api/*
```

---

## ✅ Vérifications Post-Fix

- [x] `npm run lint` → OK (tsc --noEmit)
- [x] `npm run build:cloudflare` → OK, génère `dist/` avec `_redirects`, `_headers`, `_routes.json`, `index.html`, `assets/*`
- [x] `npm run build` → OK, génère aussi `dist/server.cjs` pour Node
- [x] Functions TS → `tsc --noEmit` sur `functions/` → OK
- [x] `_redirects` présent dans `dist/` → SPA fallback OK
- [x] `_routes.json` présent → `/api/*` routé vers Functions
- [x] CNAME supprimés → plus d'erreur domaine invalide
- [x] Modèles Gemini valides → plus de 404 API
- [x] Client fallback → app fonctionne même sans Functions (mode dégradé)
- [x] Wrangler config → `nodejs_compat` + `pages_build_output_dir`

---

## 📋 Checklist Cloudflare Dashboard

Si le déploiement échoue encore, vérifier :

1. **Build log** : cherche `vite: not found` → mettre `NODE_VERSION=20` et `NPM_FLAGS=--legacy-peer-deps` si besoin
2. **Output dir** : bien `dist` et pas `build` ou `docs`
3. **Root dir** : si repo a sous-dossier `Email/`, setter Root directory à `Email`
4. **Env vars** : `VITE_GOOGLE_CLIENT_ID` doit être dispo au BUILD time (Vite l'injecte), pas seulement runtime
5. **Functions log** : Pages > Functions > View logs, vérifier `GEMINI_API_KEY` présent
6. **OAuth** : Google Cloud Console > Credentials > Authorized JavaScript origins → ajouter `https://<your-pages>.pages.dev` + custom domain
7. **Domaine** : pas d'underscore, pas de CNAME file

---

## 📚 Fichiers Modifiés / Créés

**Créés :**
- `functions/_middleware.ts`
- `functions/api/_shared.ts`
- `functions/api/health.ts`
- `functions/api/ai/classify-emails.ts`
- `functions/api/ai/improve-email.ts`
- `functions/api/ai/suggest-reply.ts`
- `functions/api/ai/draft-email.ts`
- `public/_redirects`
- `public/_headers`
- `public/_routes.json`
- `wrangler.toml`
- `wrangler.jsonc`
- `.node-version`
- `CLOUDFLARE_FIX.md` (ce fichier)

**Modifiés :**
- `package.json` (scripts cloudflare)
- `vite.config.ts` (build, chunks, proxy)
- `server.ts` (modèles Gemini valides)
- `src/services/aiAssistant.ts` (fallback resilient)
- `.env.example` (doc complète)
- Suppression `CNAME` + `docs/CNAME`

---

## 🎯 Résultat

L'application est maintenant **100% compatible Cloudflare Pages** :
- Static SPA dans `dist/` servi via CDN Cloudflare (ultra rapide)
- API IA via Pages Functions (serverless, auto-scale, pas de serveur à gérer)
- Fallback local si clé Gemini manquante ou Functions non dispo
- OAuth Google fonctionne avec `Cross-Origin-Opener-Policy: same-origin-allow-popups`
- Déploiement en 1 clic depuis Dashboard ou Wrangler

Auteur du fix : Agent Arena — 2026-09-28
