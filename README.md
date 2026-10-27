# Alpi - version autonome GitHub Pages

## Utilisation

1. Déposer `index.html` à la racine d'un dépôt GitHub.
2. Dans **Settings > Pages**, publier depuis la branche principale.
3. Ouvrir le site, cliquer sur la carte, vérifier ou saisir l'altitude, choisir orientation, pente et profil, puis lancer l'analyse.

## Services externes utilisés dans le navigateur

- Leaflet via `unpkg.com`
- Fond CARTO basé sur OpenStreetMap
- Open-Meteo Forecast API
- Open-Meteo Elevation API

Une connexion est indispensable. Les politiques, disponibilités et limites des fournisseurs doivent être vérifiées avant un usage public soutenu.

## Fonctionnalités

- sélection par clic et marqueur déplaçable ;
- altitude automatique ou manuelle ;
- orientation, pente, encaissement et profil de formation ;
- historique météo des dix derniers jours et prévision à sept jours ;
- degrés-heures de gel, redoux, neige, pluie, vent et rayonnement corrigé selon la pente ;
- scores Formation, Conservation, Potentiel et Confiance ;
- graphique ±72 heures ;
- fenêtre prévisionnelle journalière ;
- points enregistrés dans `localStorage`.

## Limites critiques

- Les scores sont heuristiques et ne sont pas calibrés sur une base de sorties réelles.
- L'ombre du relief et l'horizon topographique ne sont pas calculés.
- La grille météo n'est pas une observation de la goulotte.
- Le BERA, les observations Data-Avalanche, Camptocamp et les webcams ne sont pas encore intégrés.
- Le score de conditions ne doit jamais être interprété comme un feu vert de sécurité.

## Étape de production recommandée

Pour intégrer BERA, Data-Avalanche et observations récentes sans problèmes CORS ni dépendance fragile au navigateur, ajouter un workflow GitHub Actions qui collecte les sources autorisées, normalise les données et publie un fichier `data/latest.json`. L'interface pourra ensuite charger ce fichier statique.
