# Veille goulottes & mixte — v2.1

Application web (HTML/JS sans framework) + fonctions serveur Cloudflare Pages.

## Nouveautés v2.1
- Bandeau des cumuls journaliers de précipitations avec échelle colorée (faible / modéré / fort / très fort) et neige fraîche.
- Courbe du cumul depuis J-14 (axe droit) + tableau des cumuls 24 h / 72 h / 7 j / 14 j passés et 24 / 72 / 96 h prévus (pluie / neige).
- Panneau vent : vitesse moyenne, rafales, bandes d'intensité, flèches de direction toutes les 6 h.
- Choix du vent analysé : altitude ≈ 3000 m (700 hPa) ou 10 m.
- Roses des vents 72 h passées / 72 h à venir, versant chargé, heures de transport (≥ 30 km/h).
- Détection du chargement éolien de l'orientation de la voie, intégrée à la synthèse.

## Déploiement (GitHub → Cloudflare Pages)
1. Déposer le contenu du dossier à la racine d'un dépôt GitHub (conserver `functions/` et `config/`).
2. Cloudflare → Workers & Pages → Créer → Pages → Connecter à Git → choisir le dépôt.
3. Framework : None · Commande de build : vide · Répertoire de sortie : `/`.
4. Déployer. Chaque push redéploie.

## BERA (facultatif)
Compte sur portail-api.meteofrance.fr, abonnement à l'API BRA, puis variable secrète `METEOFRANCE_API_KEY` dans Cloudflare Pages → Settings → Variables and Secrets.

## Configuration partagée
Renseigner les voies, « Exporter config », remplacer `config/routes.json` dans le dépôt.
