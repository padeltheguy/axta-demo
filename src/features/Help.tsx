import { Head } from "@/ui/parts";

export default function Help() {
  return (
    <>
      <Head title="Mode d'emploi" />
      <div className="help">
        <h3>Où sont mes données ?</h3>
        <p>Sur cet appareil, dans le navigateur (IndexedDB). Seuls les taux de change utilisent internet. Clique « Sauvegarder » (Paramètres) chaque semaine : le fichier obtenu est ta copie de secours et te permet de continuer sur un autre appareil avec « Restaurer ».</p>
        <h3>Quand je reçois de l'argent</h3>
        <p>Tableau de bord : saisis le montant et sa nature, la répartition s'affiche avec la destination conseillée. Fais les virements le jour même. Pour une mission, note l'acompte ou le solde dans Revenus.</p>
        <h3>Quand je rembourse une dette</h3>
        <p>Dettes : tape le montant versé dans « Verser » puis Entrée. Tout s'enregistre seul. Une dette payée en entier quitte la liste « À rembourser » (elle reste visible dans « Remboursées »). Il n'y a ni ordre imposé ni date butoir : tu vois simplement ce que tu dois, et à qui. Chaque versement crée aussi un mouvement daté (pour les rapports) et peut être annulé. Un découvert bancaire suivi comme dette se relie à son compte (colonne « Compte lié ») pour ne pas être compté deux fois.</p>
        <h3>Planifier (permis, passeport…)</h3>
        <p>Agenda : écris ce que tu veux faire et pour quand, puis « Ajouter ». Tout ce qui a une date (démarches, projets, coffres, échéances) apparaît en liste par mois ou en calendrier. « Exporter (.ics) » l'envoie dans Google Agenda ou Apple Calendrier, avec des rappels 7 jours avant et la veille.</p>
        <h3>Mes comptes</h3>
        <p>Comptes : note le solde de chaque compte (banque, mobile money, épargne, crypto) et la date du relevé quand tu ouvres tes applis. Un compte à découvert apparaît en rouge.</p>
        <h3>Mes mouvements (relevés, captures)</h3>
        <p>Mouvements : « Importer un relevé MoMo » (PDF ou CSV). axta affiche un aperçu, classe chaque ligne, sépare les frais et ignore ce qui est déjà importé. Tu choisis le compte, puis « Importer ». Pour une autre banque, ajoute les mouvements à la main. Une catégorie mal devinée ? Corrige-la dans le tableau, ou crée une règle (Paramètres › Règles de catégorisation) pour les prochains imports. Onglet « À classer » : dépôts d'espèces et virements reçus sans règle. Ils ne comptent pas en revenus tant que tu ne les as pas qualifiés, car de l'argent retiré puis redéposé n'est pas un gain. Si tu as déjà saisi un versement à la main, l'import du relevé le remplace sans le compter deux fois.</p>
        <h3>Mes rapports (3 mois, 6 mois, 1 an, plusieurs années)</h3>
        <p>Rapports : choisis la période. Revenus et dépenses viennent des mouvements (hors transferts, emprunts, remboursements et épargne). Dettes, épargne et valeur nette viennent des photos mensuelles. La comparaison avec la période précédente n'apparaît que si axta a des données pour elle. « Données » affiche les chiffres en tableau, « Exporter en PDF » imprime le rapport.</p>
        <h3>Historique et sauvegardes automatiques</h3>
        <p>Chaque mois, axta prend une photo de ta situation : c'est elle qui permet de mesurer ta progression dans 6 mois ou un an. Les dettes soldées, démarches et projets terminés gardent leur date. Chaque jour et avant chaque import, axta crée un point de restauration (les 30 derniers sont gardés, Paramètres › Sauvegardes). Sur Chrome ou Edge, choisis un dossier (par exemple dans ton Drive) : axta y dépose une sauvegarde à la fréquence choisie.</p>
        <h3>Les suggestions</h3>
        <p>Le tableau de bord affiche ce qui mérite ton attention : retards, échéances proches, dette presque soldée, abonnement à résilier, client à relancer (avec un e-mail prêt à envoyer), sauvegarde à faire. Sur chaque suggestion : l'horloge pour la reporter (demain, dans une semaine, dans un mois) ou ne plus l'afficher. axta propose, il ne modifie rien sans toi.</p>
        <h3>Quand je repère un article</h3>
        <p>Liste d'achats : colle le lien et clique « Capturer ». Complète le prix et la devise. Au-delà de 50 000 CFA, passe-le en Projets et attends 72 h.</p>
        <h3>Une fois par mois</h3>
        <p>Mets à jour l'épargne disponible de chaque coffre, regarde la marge du budget, les démarches en retard et le graphique des encaissements.</p>
        <h3>La priorité (matrice d'Eisenhower)</h3>
        <p>Urgent et important : maintenant. Important, pas urgent : à planifier. Urgent, pas important : vite ou déléguer. Ni urgent ni important : plus tard, ou jamais.</p>
        <h3>Raccourcis</h3>
        <p>⌘K ou Ctrl+K : palette de commandes (aller à une page, sauvegarder, verrouiller). ⌘B ou Ctrl+B : replier ou déplier la navigation. Échap : fermer une fenêtre.</p>
      </div>
    </>
  );
}
