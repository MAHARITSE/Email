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

```bash
npm run build   # Build production (client + serveur)
npm run start   # Serveur production (node dist/server.cjs)
npm run lint    # Vérification TypeScript
```

---

## 👤 Créateur

| | |
|---|---|
| **Nom** | MAHARITSE Hyacinthe Bertand |
| **Email** | [maharitse@gmail.com](mailto:maharitse@gmail.com) |
| **Téléphone** | [+261 38 34 092 61](tel:+261383409261) |

---

<div align="center">
<sub>GMAIL-PRO — © MAHARITSE Hyacinthe Bertand</sub>
</div>
