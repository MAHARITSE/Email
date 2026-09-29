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
- 🗂️ **Classification automatique** — catégories Pro / Personnel / Sites web (chaque courriel n'est envoyé à l'IA qu'une seule fois)
- ⚡ **Synchronisation intelligente** — l'API History de Gmail détecte les changements en une seule requête : la boîte n'est re-téléchargée que si c'est nécessaire (plus de rafraîchissement toutes les 35 s)
- 🗑️ **Corbeille & Spam fiables** — repli automatique sur une recherche au niveau des messages si l'API conversations ne remonte rien, et vidage complet du dossier (toutes pages)
- 👥 **Gestionnaire de contacts** — favoris VIP, autocomplétion, import automatique
- ✍️ **Signatures multiples** — signature par défaut par contexte (nouveau message / réponse)
- 🔐 **Authentification OAuth 2.0** — jetons conservés en local, aucun serveur intermédiaire pour vos données
- 🌓 **Thème sombre / clair** et interface responsive

## 🛠️ Stack technique

React 19 · TypeScript · Vite 6 · Tailwind CSS 4 · pdf.js · mammoth · SheetJS (xlsx) · JSZip · DOMPurify · Firebase Auth · Gemini API (via `@google/genai`)

## ⚙️ Exécution locale

**Prérequis :** Node.js 18+

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

### Assistant IA : quotas et bascule de modèle

En cas de **quota quotidien atteint** (429 `RESOURCE_EXHAUSTED`), le serveur bascule
automatiquement et sans attendre sur une **version antérieure** de Gemini, puis met le
modèle épuisé en quarantaine jusqu'à la réinitialisation du quota (minuit, heure du
Pacifique). La chaîne par défaut est :

```
gemini-3.8-flash -> gemini-flash-latest -> gemini-3.1-flash-lite
-> gemini-2.5-flash -> gemini-2.5-flash-lite -> gemini-2.0-flash
-> gemini-1.5-flash -> gemini-1.5-flash-8b
```

Personnalisable avec `GEMINI_MODEL` (modèle prioritaire) et/ou `GEMINI_MODEL_CHAIN`
(chaîne complète, séparée par des virgules). `GET /api/health` restitue l'état de
chaque modèle (`available`, `reason`, `availableInMs`).

```bash
npm run build   # Build production (client + serveur)
npm run start   # Serveur production (node dist/server.cjs)
npm run lint    # Vérification TypeScript
```

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
