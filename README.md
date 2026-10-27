# AlpiCondi — veille goulottes & mixte (Cloudflare Worker + assets statiques)

- `public/` : interface (index.html, app.js, style.css, config/routes.json)
- `src/worker.js` : point d'entrée ; `/api/*` -> fonctions, le reste -> fichiers statiques
- `src/api/` : proxy Camptocamp (itinéraires, sorties) et BERA Météo-France
- `wrangler.jsonc` : configuration (le nom doit rester `alpicondi`)

Déploiement : push sur GitHub -> Workers Builds redéploie automatiquement.
Build command : vide · Deploy command : `npx wrangler deploy`.

BERA (facultatif) : Settings > Variables and Secrets > secret `METEOFRANCE_API_KEY`.
