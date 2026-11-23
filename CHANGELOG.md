# Journal des versions — axta-demo

## [0.6.2-demo] — 23/11/2026 — Déconnexion
**Corrigé**
- Le bouton ⏻ ne faisait rien sans code de déverrouillage (cas de la démo). Il ramène maintenant à l'écran d'entrée : « Entrer » pour revenir, « Quitter et effacer cet espace » pour vider le navigateur et revenir à l'accueil. Libellé « Se déconnecter » (navigation et palette ⌘K).

**Documentation** : README, visite guidée de la démo en 9 étapes.

## [0.6.1-demo] — 23/11/2026 — Version de démonstration publique
Tirée d'axta 0.6.1.

**Retiré**
- Espace IA : page Assistant, panneau ⌘J, réglages (clé, modèle, mémoire, compétences), « Commenter avec axta » dans Rapports, « Capture → assistant » dans Mouvements, bouton ✨ des suggestions et question à axta dans la palette ⌘K.
- Toute donnée personnelle : données, relevés, archives de la v1, documents de travail et historique git d'axta.

**Ajouté**
- Démo « Sika Mensah, photographe freelance » : 12 mois de missions, mouvements, dettes, coffres, photos mensuelles, budget, projets et démarches, 100 % fictifs et datés par rapport à aujourd'hui (`src/domain/demo.ts`, testée).
- Bandeau « Version de démonstration » sur l'écran d'accueil ; « Explorer la démo » mis en avant.
- Catégorie « Travail » dans le budget.
- Publication automatique sur GitHub Pages à chaque push sur `main`.
