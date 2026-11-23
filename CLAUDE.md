# Consignes pour les agents qui travaillent sur axta-demo

Version de démonstration d'axta, publique : sans espace IA et avec des données 100 % fictives.

- Langue de l'interface et des docs : français. Ton concis et direct (tutoiement dans l'appli).
- Aucune donnée réelle, nulle part (code, tests, docs, captures). La démo est dans `src/domain/demo.ts` ; le petit jeu des tests dans `src/domain/defaults.ts` (`sampleData`).
- Logique métier uniquement dans `src/domain/` (fonctions pures + tests Vitest). Les composants ne font que lire et afficher.
- Tout changement du format des données → migration dans `src/domain/migrate.ts` + test.
- Animations : `motion/react`, toujours un repli pour `prefers-reduced-motion`.
- Avant de pousser : `npm run typecheck && npm test && npm run build`.
- Rapports : définitions dans `src/domain/reports.ts` ; ne pas afficher de comparaison si `comparable()` est faux.
- Historique : les photos mensuelles (`snapshots`) et les dates de clôture (`closedAt`) ne sont jamais effacées ; tout import ou restauration crée d'abord un point de restauration.
- Contrôles : jamais de `<select>` ni d'`<input type="date">` natifs ; utiliser `Select` et `DatePicker` de `src/ui/Pickers.tsx`.
