<div align="center">

# ✉️ GMAIL-PRO

**Client Gmail moderne avec extracteur de pièces jointes, lecteur PDF intégré et assistant IA**

`GMAIL-PRO // NODE` — Terminal client sécurisé pour l'API Gmail

</div>

---

## 🚀 Fonctionnalités

- 📬 **Boîte de réception complète** — dossiers Gmail synchronisés (Boîte de réception, Suivis, Envoyés, Corbeille), libellés personnalisés, fils de discussion regroupés
- 📎 **Extracteur de pièces jointes** — vue dédiée pour parcourir et télécharger toutes les pièces jointes, export groupé `.ZIP`
- 📄 **Lecteur PDF intégré** — les PDF s'ouvrent directement dans l'application (pdf.js) : défilement continu, zoom, rotation, recherche plein texte avec surlignage, prise en charge des PDF protégés par mot de passe
- 📊 **Aperçus multi-formats** — tableurs Excel/CSV (grille interactive multi-feuilles), documents Word `.docx`, images, fichiers texte/code
- 🤖 **Assistant IA Gemini** — suggestions de réponses intelligentes, reformulation (professionnel / concis / correction), génération de réponses personnalisées
- 🗂️ **Classification automatique** — catégories Pro / Personnel / Sites web
- 👥 **Gestionnaire de contacts** — favoris VIP, autocomplétion, import automatique
- ✍️ **Signatures multiples** — signature par défaut par contexte (nouveau message / réponse)
- 🔐 **Authentification OAuth 2.0** — jetons conservés en local, aucun serveur intermédiaire pour vos données
- 🌓 **Thème sombre / clair** et interface responsive

## 🛠️ Stack technique

React 19 · TypeScript · Vite 6 · Tailwind CSS 4 · pdf.js · mammoth · SheetJS (xlsx) · JSZip · DOMPurify · Firebase Auth · Gemini API (via `@google/genai`)

## ⚙️ Exécution locale

**Prérequis :** Node.js 22+ (requis par Wrangler 4.142 pour le déploiement Cloudflare ;
voir `.node-version` / `.nvmrc`)

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer la clé Gemini (optionnelle, pour l'assistant IA)
#    Créez un fichier .env.local avec :
#    GEMINI_API_KEY="votre_cle"
#    (Les identifiants Google/Firebase se configurent dans firebase-applet-config.json)

# 3. Lancer l'application
npm run dev
```

L'application démarre sur `http://localhost:3000`.

```bash
npm run build            # Build production (client dist/ + serveur Node dist/server.cjs)
npm run build:cloudflare # Build client uniquement (dist/ pour Cloudflare)
npm run start            # Serveur production Node (node dist/server.cjs)
npm run lint             # Vérification TypeScript
npm run deploy           # Déploiement Cloudflare Workers (wrangler deploy)
npm run deploy:dry-run   # Vérifie le bundle + les assets sans publier
npm run worker:dev       # Dev local du Worker + SPA (http://localhost:8787)
```

### ☁️ Déploiement Cloudflare (Workers + Static Assets)

**C'est la cible de déploiement par défaut** : la commande de déploiement
`npx wrangler deploy` (utilisée par la CI/plateforme) publie **un Worker**, pas un
projet *Cloudflare Pages*.

`wrangler.jsonc` décrit les deux moitiés du déploiement :

| Réglage | Rôle |
|---|---|
| `main: worker/index.ts` | Point d'entrée du Worker : sert `/api/*` |
| `assets.directory: ./dist` | La SPA construite par Vite, servie par la couche *static assets* |
| `assets.not_found_handling: single-page-application` | Route cliente inconnue → `index.html` (deep links `/inbox/...`) |
| `assets.run_worker_first: ["/api/*"]` | Seul `/api/*` réveille le Worker (pas de coût par requête statique) |
| `compatibility_date: 2026-09-28`, `nodejs_compat` | Runtime Workers à jour |

L'API est **implémentée une seule fois** dans `functions/` (format Pages Functions).
`worker/index.ts` reconstruit le petit objet `context` de Pages et délègue à ces
mêmes handlers — donc zéro duplication, et le dossier `functions/` reste
utilisable tel quel pour un déploiement Pages.

```bash
# 1. Déployer (le build est lancé automatiquement via build.command)
npm run deploy

# 2. Clé Gemini (secret, jamais dans le repo)
npx wrangler secret put GEMINI_API_KEY

# 3. (Optionnel) ID client OAuth Google, injecté au build par Vite
npx wrangler deploy --var VITE_GOOGLE_CLIENT_ID:"xxxx.apps.googleusercontent.com"
#    ou dans le dashboard : Settings > Variables and Secrets (Build-time variable)
```

Après déploiement, l'app est disponible sur `https://gmail-pro.<sous-domaine>.workers.dev`
(ajouter aussi cette origine dans Google Cloud Console > Credentials > Origines JavaScript autorisées).

**Fichiers clés du déploiement :**

- `wrangler.jsonc` → config unique (Worker + assets). *Ne pas* y remettre
  `pages_build_output_dir` : Wrangler considérerait le projet comme Pages et
  refuserait `wrangler deploy`.
- `worker/index.ts` → routeur Worker (`/api/health`, `/api/ai/*`) + middleware CORS
- `functions/_middleware.ts`, `functions/api/**` → handlers partagés (CORS, Gemini REST, heuristiques)
- `public/_headers` → headers de sécurité + `Cross-Origin-Opener-Policy` (popup OAuth Google)
- `public/.assetsignore` → exclut `dist/server.cjs`, `dist/server.cjs.map` et `_routes.json` de l'upload
- `.node-version` / `.nvmrc` = `22`, `engines.node >= 22` → évite l'erreur
  *« Wrangler requires at least Node.js v22.0.0 »* pendant le déploiement

**❓ Erreur « Wrangler requires at least Node.js v22.0.0. You are using v20 »**
→ le build tourne sur Node 20. Wrangler ≥ 4.142 exige Node 22. Ce dépôt déclare
`22` dans `.node-version`, `.nvmrc` et `engines.node` : forcez `NODE_VERSION=22`
dans l'environnement de build si l'erreur persiste.

### ☁️ Alternative : Cloudflare Pages (dossier `functions/`)

Le projet reste compatible Pages (static + Functions) si vous préférez ce mode :

- **Build command :** `npm run build:cloudflare` — **Output directory :** `dist`
- **Node version :** `22` (variable `NODE_VERSION=22`)
- **Env vars :** `VITE_GOOGLE_CLIENT_ID` (Var, public) et `GEMINI_API_KEY` (Secret)
- Ajoutez `public/_redirects` avec `/*    /index.html   200` pour le fallback SPA
  (inutile pour le déploiement Workers, qui utilise `not_found_handling`) ;
  `public/_routes.json` route alors `/api/*` vers les Functions.

```bash
npm run build:cloudflare
npx wrangler pages deploy dist --project-name=gmail-pro
npx wrangler pages secret put GEMINI_API_KEY --project-name=gmail-pro
```

> ⚠️ Ne lancez pas `npx wrangler deploy` sur un projet Pages : Wrangler avertit
> *« It seems that you have run `wrangler deploy` on a Pages project »* et échoue
> faute de point d'entrée. Utilisez `wrangler pages deploy` (Pages) **ou**
> `wrangler deploy` avec `wrangler.jsonc` (Worker), jamais les deux mélangés.

Voir `CLOUDFLARE_FIX.md` pour le rapport détaillé.

---

## 👤 Créateur

| | |
|---|---|
| **Nom** | MAHARITSE Hyacinthe Bertrand |
| **Email** | [maharitse@gmail.com](mailto:maharitse@gmail.com) |
| **Téléphone** | [+261 38 34 092 61](tel:+261383409261) |

---

<div align="center">
<sub>GMAIL-PRO — © MAHARITSE Hyacinthe Bertrand</sub>
</div>

## Dépannage Google OAuth : erreur 401 `invalid_client`

« The OAuth client was not found » signifie que Google ne reconnaît pas le
client envoyé. Ce n'est pas un problème de mot de passe ni d'utilisateur de test.

1. Dans [Google Cloud Console → Identifiants](https://console.cloud.google.com/apis/credentials),
   sélectionnez le projet voulu et vérifiez que votre client OAuth existe
   (ou créez-en un de type **Application Web**).
2. Ajoutez l'origine exacte du site aux **Origines JavaScript autorisées**
   (protocole, domaine et port éventuel, sans chemin). En local :
   `http://localhost:3000`. La prévisualisation doit aussi avoir son origine autorisée.
3. Copiez l'**ID client**, jamais le secret, dans `.env.local` :
   `VITE_GOOGLE_CLIENT_ID=VOTRE_ID.apps.googleusercontent.com`.
   Redémarrez le serveur de développement ou reconstruisez puis redéployez en production.
4. Pour corriger sans reconstruire, ouvrez **Configuration OAuth** sur l'écran
   de connexion et enregistrez l'ID dans ce navigateur.

Priorité : ID personnalisé du navigateur → `VITE_GOOGLE_CLIENT_ID` →
`oAuthClientId` dans `firebase-applet-config.json`. Le bouton **Utiliser la
configuration du site** supprime la surcharge locale obsolète. L'ID client est
public ; ne placez aucun secret dans une variable `VITE_*`.

Une fois le client reconnu, activez l'API Gmail et configurez le consentement
OAuth ; si l'application est en mode test, ajoutez les comptes autorisés aux
utilisateurs de test. Cela ne remplace pas la correction d'un client introuvable.
Google peut afficher cette erreur uniquement dans sa fenêtre, sans la transmettre
à l'application : les réglages restent donc accessibles même sans erreur locale.
