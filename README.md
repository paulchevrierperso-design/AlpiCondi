# Veille goulottes & mixte — v2

Application web (HTML/JS sans framework) + fonctions serveur Cloudflare Pages.

## Déploiement (GitHub → Cloudflare Pages)
1. Déposer le contenu de ce dossier à la racine d'un dépôt GitHub (conserver `functions/` et `config/`).
2. Cloudflare → Workers & Pages → Créer → Pages → Connecter à Git → choisir le dépôt.
3. Framework : None · Commande de build : (vide) · Répertoire de sortie : `/`.
4. Déployer → URL `https://<projet>.pages.dev`. Chaque push redéploie.

## BERA (facultatif)
1. Créer un compte sur portail-api.meteofrance.fr et s'abonner à l'API « Bulletins de risque d'avalanche ».
2. Cloudflare Pages → Settings → Variables and Secrets → ajouter `METEOFRANCE_API_KEY` (secret).
3. Redéployer, puis saisir l'ID du massif dans chaque fiche.

## Partager une configuration
Renseigner les voies, « Exporter config », puis remplacer `config/routes.json` dans le dépôt :
les coordonnées deviennent les valeurs par défaut pour tous les navigateurs.

## Sources
- Camptocamp (itinéraires, sorties) via `/api/routes` et `/api/outings`
- Open-Meteo (météo horaire J-14 à J+4, appel direct)
- Météo-France BERA via `/api/bera`
- Data-Avalanche : lien de consultation (pas d'API publique documentée)
