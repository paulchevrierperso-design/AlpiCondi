# Veille goulottes & mixte — v3

Application web (HTML/JS + Leaflet) et fonctions serveur Cloudflare Pages.
Aucune voie pré-définie : les voies se créent depuis l'interface.

## Utilisation
1. « + Nouvelle voie », saisir le nom.
2. Cliquer sur la carte pour positionner la voie (marqueur déplaçable). Fonds : OpenTopoMap, OSM, Plan IGN, photos aériennes IGN.
3. Saisir l'altitude et choisir l'exposition (rose des vents).
4. Facultatif : ID massif BERA, ID itinéraire C2C. Le bouton « Itinéraires C2C ici » affiche les voies glace/mixte Camptocamp autour du centre de la carte ; un clic permet d'en créer une voie.
5. « Analyser cette voie » ou « Analyser toutes les voies ».

Les voies sont enregistrées dans le navigateur. « Exporter » / « Importer » (JSON) permet de les transférer.
Pour qu'elles soient chargées par défaut sur tout nouvel appareil, remplacer `config/routes.json` du dépôt par le fichier exporté.

## Déploiement (GitHub → Cloudflare Pages, gratuit)
1. Déposer le contenu de ce dossier à la racine d'un dépôt GitHub.
2. Cloudflare → Workers & Pages → Créer → Pages → Connecter à Git.
3. Framework : None · Build : vide · Répertoire de sortie : `/`.

## BERA (facultatif)
Créer un compte sur portail-api.meteofrance.fr, s'abonner à l'API « Bulletins de risque d'avalanche »,
puis ajouter le secret `METEOFRANCE_API_KEY` dans Cloudflare Pages (Settings → Variables and Secrets) et redéployer.
