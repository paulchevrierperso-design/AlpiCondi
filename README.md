# Alpi

MVP statique d’une application de veille d’itinéraires hivernaux, déployable sur GitHub Pages. La liste initiale est vide. Les voies sont ajoutées depuis une URL Camptocamp de type `/routes/<id>`.

## Fonctions disponibles

- validation stricte d’une URL Camptocamp ;
- prévisualisation avant import ;
- enregistrement local dans le navigateur ;
- suppression et export JSON ;
- déploiement automatique sur GitHub Pages ;
- emplacement prévu pour un proxy de métadonnées.

## Limite importante de GitHub Pages

GitHub Pages héberge uniquement des fichiers statiques. Il ne peut pas exécuter FastAPI, protéger des secrets, planifier des collectes ni réaliser un proxy serveur. Sans proxy, l’application extrait uniquement l’identifiant de l’URL. L’altitude et la localisation doivent être complétées plus tard.

Pour récupérer des métadonnées Camptocamp, utilisez un backend séparé (par exemple Cloudflare Workers, Scaleway Serverless Containers ou une API FastAPI). Le dossier `worker/` contient seulement un squelette sûr : l’endpoint Camptocamp n’est volontairement pas inventé. Vérifiez sa documentation, son schéma et ses conditions d’utilisation avant activation.

## Déploiement GitHub Pages

1. Créer un dépôt GitHub vide, par exemple `alpi`.
2. Décompresser les fichiers à la racine du dépôt.
3. Exécuter :

```bash
git init
git add .
git commit -m "Initialisation Alpi"
git branch -M main
git remote add origin https://github.com/VOTRE-COMPTE/alpi.git
git push -u origin main
```

4. Dans GitHub : **Settings > Pages > Source > GitHub Actions**.
5. Le workflow `.github/workflows/pages.yml` publie le site après chaque push sur `main`.

## Développement local

```bash
python3 -m http.server 8080
```

Ouvrir `http://localhost:8080`.

## Activation d’un proxy

1. Déployer et configurer un backend réel.
2. Copier `config.example.js` en `config.js`.
3. Définir `window.ALPI_PROXY_URL`.
4. Ajouter `<script src="config.js"></script>` avant `app.js` dans `index.html`.

## Sécurité et usage

Cette application n’est pas un outil de décision de sécurité. Les coordonnées Camptocamp peuvent correspondre à un sommet, un départ ou un point de secteur et non à l’entrée exacte de la voie. Toute donnée importée doit être validée cartographiquement avant calcul météo, solaire ou avalancheux.
