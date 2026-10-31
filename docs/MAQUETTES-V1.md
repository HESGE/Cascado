# Cascado — Maquettes visuelles V1

Maquettes initiales du 28 octobre 2026 · Parcours actualisé le 29 octobre 2026

Le produit porte désormais le nom **Cascado**. Les images initiales restent des archives de conception et peuvent encore présenter le nom de travail Dix de chute.

Les planches statiques initiales sont au format **9:16, 1080 × 1920 pixels**, prévues pour une surface de référence de 360 × 640 pixels CSS. Elles documentent l’origine graphique du plateau et du passage. Entre humains, le parcours actuel comporte **un seul écran de passage et un seul bouton de révélation**. Une partie humain contre IA conserve le plateau humain entre les tours. L’ancienne confirmation et les boutons de rotation visibles dans ces images ne correspondent plus à l’interface actuelle. Les sources SVG restent modifiables.

Voir la planche initiale du plateau et du passage (archive locale non incluse : `output/maquettes/maquettes-9x16.png`)

## Plateau

Voir le plateau en PNG (archive locale non incluse : `output/maquettes/plateau-9x16.png`) · Source vectorielle (archive locale non incluse : `output/maquettes/plateau-9x16.svg`)

Le dessin initial suit les centres, rayons, ouvertures et liaisons de [la géométrie de référence](GEOMETRIE-V1.md). Le mécanisme est réduit uniformément à 70 % dans cette planche pour réserver les commandes sous le plateau. L’application actuelle conserve ddc-v1.3 et son seuil de passage de 20 unités sur 28 ; cette évolution ne change pas les centres ou rayons.

État illustratif : Camille joue la face A ; le jeton 1 est arrivé, le 2 attend dans la roue 5, le 3 est dans la roue 4, le 4 dans la roue 3 et le 5 dans la glissière. La roue 4 est sélectionnée et déjà engagée ; la roue 2 est interdite. Le prochain jeton attendu est donc le 2. Cet état est une illustration de composition, pas le résultat d’une partie simulée.

Les indices de roue sont placés à l’extérieur des disques et les jetons utilisent des chiffres foncés sur fond orange. La sélection est cerclée d’orange ; l’interdiction est signalée par un cadenas et un libellé. Seule la progression de Camille apparaît. Dans l’application actuelle, le doigt maintenu sur la roue trace un arc autour de son centre ; les boutons de précision de la planche sont supprimés. Entre humains, terminer le tour masque le plateau ; face à une IA, la même action garde la face humaine affichée et donne la main à l’IA. Une aimantation légère accompagne les alignements avec un bref halo et une vibration facultative. Le rail de sortie est incliné, avec le 1 au point le plus bas sur les deux faces.

## Passage du téléphone

Voir l’écran de passage en PNG (archive locale non incluse : `output/maquettes/passage-9x16.png`) · Source vectorielle (archive locale non incluse : `output/maquettes/passage-9x16.svg`)

Entre humains, le fond opaque masque entièrement le jeu. Le titre « Passe le téléphone à Léa » indique à qui donner l’appareil. Léa appuie sur **« Je suis Léa — afficher mon plateau »** : cet unique bouton affiche directement son plateau ou le résultat autorisé. Aucun écran de confirmation supplémentaire n’est présenté. Ce passage n’apparaît pas entre les tours d’une partie humain contre IA.

## Protection du passage

Avant cet appui, le masque ne présente aucun aperçu, score, jeton, historique ou verdict. L’entrée du masque impose le relâchement des contacts précédents et un délai fixe de protection de 300 ms. Un doigt ou une touche maintenus depuis la fin du tour ne révèlent pas la face suivante. Une interruption revient au masque et exige un nouvel appui volontaire.

La composition du passage reste identique pour un tour ordinaire et avant l’annonce d’un résultat. Le résultat éventuel n’apparaît qu’après l’appui sur le bouton unique. Le cercle associé à Camille et le losange associé à Léa distinguent les joueurs en complément de la couleur.

L’ancienne planche à deux appuis (archive locale non incluse : `output/maquettes/passage-deux-appuis-9x16.png`) et sa confirmation (archive locale non incluse : `output/maquettes/confirmation-9x16.svg`) sont conservées comme références historiques ; ce parcours a été remplacé à la demande de l’utilisateur.

## Configuration et tours IA

La préparation propose deux places. Chacune contient un nom, le choix **Humain / IA** et, pour une IA, **Facile / Normal / Difficile**. Le premier joueur reste choisi séparément. Les combinaisons humain contre humain, humain contre IA et IA contre IA utilisent le même plateau.

Face à une IA, la face humaine reste affichée pendant toute la partie, que l’humain soit en place A ou B. L’interface indique qui joue ; pendant le tour IA, la roue choisie est mise en évidence et tourne progressivement dans cette vue commune, avec les chutes des seuls jetons humains. Les commandes des roues sont indisponibles jusqu’au retour automatique de la main. Aucun écran de passage ni bouton de confirmation ne sépare les tours ; les jetons et la progression de l’IA restent cachés.

Avec deux IA, le mode spectateur montre successivement la face active et permet de suspendre puis reprendre les tours. **Lent, Normal, Rapide et Full** restent accessibles pendant la partie et à la pause. Dans tous les modes, une pause, une interruption ou un rechargement masque le plateau et exige une reprise explicite. Le son est temporairement coupé, sans commande de réactivation.

## Direction graphique

Bleu profond pour le cadre et l’écran masqué, ivoire pour les roues, orange pour les jetons et la sélection. Typographie sans empattement et effets de profondeur discrets pour conserver la lecture du mécanisme. Les actions principales disposent de cibles d’au moins 44 unités d’interface ; les jetons sont des éléments de lecture, pas des commandes tactiles.

Les planches restent des références de composition, sans interaction ni moteur. La [spécification actuelle](SPECIFICATIONS-PWA.md) définit le parcours et la [fiche de recette](RECETTE-V1.md) distingue les vérifications effectuées des essais restant à réaliser sur des téléphones physiques.
