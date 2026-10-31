# Cascado — V1

Version documentaire 1.30 · 31 octobre 2026

[Jouer à Cascado](https://hesge.github.io/Cascado/) · [Code source sur GitHub](https://github.com/HESGE/Cascado)

Le dépôt contient le jeu, ses ressources, ses tests et sa documentation. Les captures de recette, archives de déploiement et paramètres locaux d’hébergement restent hors du dépôt. Le jeu est accessible sur GitHub Pages à l’adresse ci-dessus. Chaque mise à jour de `main` vérifie le projet, exécute les tests et publie uniquement le contenu statique de `dist/`. Le déploiement peut aussi être relancé depuis l’onglet Actions du dépôt.

PWA en français pour deux joueurs sur un smartphone, principalement en portrait 9:16. Chaque place peut être occupée par un humain ou une IA locale : humain contre humain, humain contre IA ou IA contre IA. Chaque joueur manipule sa face d’un mécanisme commun. Entre humains, le téléphone passe sous masque, puis le destinataire affiche son plateau avec un seul bouton ; les résultats suivent le même parcours. Face à une IA, le plateau de l’humain reste affiché pendant les deux tours, sans écran de passage.

La version **1.29** adapte les pages et formulaires à la largeur disponible, y compris les largeurs réduites par le zoom du navigateur. Les champs peuvent rétrécir sans élargir la page, les marges tiennent compte des zones de sécurité et l’accueil utilise des espacements plus compacts quand la hauteur disponible est limitée. Les champs et sélecteurs natifs utilisent des caractères de 16 pixels pour limiter le zoom automatique au focus sur iPhone ; le réglage de vitesse garde assez de largeur pour son libellé. Le plateau conserve ses proportions et le verrouillage des gestes reste inchangé.

La version **1.30** renforce le son sur iPhone : reprise des contextes audio interrompus, nouvelle tentative de chargement des clips manquants et activation réessayée à la fin d’un toucher. Quand l’API est disponible, la lecture demande la session multimédia `playback` ; le mode précédent est restauré quand le son est coupé ou que le plateau est masqué. Un clic confirme la réactivation du haut-parleur. Sur les navigateurs plus anciens, le mode silencieux de l’iPhone peut encore couper les effets.

Depuis la version **1.24**, le fond du plateau occupe **toute la surface disponible du navigateur ou de la PWA**, bord à bord. Le mécanisme conserve ses proportions ; les commandes discrètes gardent des cibles de **44 pixels**. La version **1.27** renforce le mode onglet sur iPhone : hauteur utile capturée en pixels à partir du petit viewport, racine et cadre explicitement bornés, plateau attaché à ce cadre, blocage dès le premier contact sur les roues et le fond. La hauteur reste stable entre les tours et face aux variations verticales des barres ; elle est recalée après rotation ou reprise. Les cibles tactiles d’origine gardent leurs écouteurs même lorsque le SVG est remplacé pendant le geste. Boutons, liens, labels et contrôles natifs conservent leur activation ; les menus gardent leur défilement normal. Aucune installation n’est nécessaire. Le site ne peut pas figer les barres natives du navigateur. Ce correctif ne modifie ni moteur, ni profils, ni sauvegardes. « Version 1.30 » apparaît en bas de l’accueil pour identifier le code chargé.

La version **1.28** rétablit les sons et leur bouton, ajoute un clic net à l’arrivée sur un alignement aimanté, renforce l’aimantation et permet de saisir une roue jusqu’à **16 pixels CSS autour de son bord**. Le seuil de passage des jetons et les règles restent identiques.

Le nom retenu est **Cascado**, depuis le 29 octobre 2026. Ce changement de nom conserve le lien du jeu et les parties déjà sauvegardées ; les références au jeu original Dix de chute restent indiquées dans les documents de conception.

La V1 est implémentée. Les contrôles automatisés et leur portée sont détaillés dans [la fiche de recette](docs/RECETTE-V1.md). La recette sur de vrais iPhone et Android reste à effectuer.

Les nouvelles parties utilisent **`ddc-v1.5`** : chaque face possède **deux entrées, gauche et droite, et deux séries distinctes de 1 à 5**, soit dix jetons par joueur. Chaque série a sa couleur et son symbole ; ses numéros doivent sortir dans l’ordre, indépendamment de l’autre série. La victoire exige les dix sorties correctes. Les identifiants internes 1 à 10 distinguent les jetons ; ils sont imprimés 1 à 5 sur chacune des deux séries.

Les décalages physiques retenus entre les faces sont **75°, 90°, 90°, 20° et 15°**. Compte tenu du pas des encoches, leurs écarts courts valent **75°, −30°, 90°, 20° et 15°** : la roue 2 a une amplitude de 30° avec le signe opposé. Ces valeurs sont une **estimation de conception d’après la séquence vidéo vers 298–299 s**, sans reproduction exacte ni garantie d’équivalence des faces. Le seuil de passage reste **20 unités libres sur 28**, inférieur au diamètre 24 du jeton. Le glisser circulaire, l’aimantation des alignements, les crans clavier de 6° au maximum et la confidentialité sont conservés.

Les parties et séries déjà commencées en **`ddc-v1.4`** ou **`ddc-v1.3`** conservent leur profil, leur entrée unique et leurs cinq jetons par face. Leurs décalages restent respectivement **180°, 60°, 90°, 45°, 36°** et **90°, 36°, 45°, 45°, 36°**. Les sauvegardes `ddc-v1` à `ddc-v1.2` migrent uniquement vers le profil historique `ddc-v1.3`, sans recalage, mouvement ni réévaluation du verdict au chargement.

## Démarrer

Node.js 20 ou version ultérieure suffit. L’application et les commandes de base n’utilisent aucune dépendance npm et ne nécessitent pas d’installation de paquets.

```sh
npm run dev
```

Ouvrir `http://127.0.0.1:4173`. Le serveur est lié à l’ordinateur local. Le service worker fonctionne sur cette adresse de développement. Pour essayer la PWA sur un vrai téléphone, il faudra une adresse de test HTTPS accessible depuis celui-ci.

Choisir les deux noms, le type de chaque joueur, le niveau de chaque IA et le premier joueur. Les niveaux proposés sont Facile, Normal et Difficile. L’IA joue hors ligne et ne reçoit que sa propre face ; elle ne consulte ni les jetons adverses ni un verdict caché. Les anciennes parties restent humain contre humain.

Pour simuler les confrontations de deux IA, choisir **« Duel automatique »** depuis l’accueil. Sa préparation réserve les deux places à **IA 1** et **IA 2**, avec un niveau indépendant pour chacune, les choix **Affichage** et **Départs**, la vitesse globale Lent, Normal, Rapide ou Full avec plateau et le **nombre de parties de 1 à 1 000**. Des choix rapides proposent **10, 50 ou 100 parties**, ainsi qu’une saisie personnalisée ; 10 est proposé par défaut. IA 1 commence la première partie d’une nouvelle série, puis le premier joueur alterne à chaque partie. Une phrase indique ce départ, sans sélecteur supplémentaire. **« Lancer la série »** autorise l’enchaînement du nombre annoncé ; si une sauvegarde existe, **« Remplacer et lancer »** indique explicitement qu’elle sera remplacée. Le parcours « Nouvelle partie » conserve le choix libre des noms, des types et du premier joueur ; les parties humaines et mixtes gardent leur position classique.

Dans **Départs**, **« Variés — comparer les IA »** est proposé en l’absence de préférence. Les cinq roues reçoivent une position initiale reproductible ; les deux entrées de la roue 1 restent fermées sur les deux faces avant le premier coup. En `ddc-v1.5`, chaque paire rejoue **la même pose θ / θ**, avec le premier joueur inversé. Cent parties explorent cinquante paires ; un total impair laisse la dernière paire incomplète. Ce protocole ne rend pas les deux faces mécaniquement équivalentes. Une série sauvegardée en `ddc-v1.4` conserve seule ses poses complémentaires **θ / (θ + δ)** ; `ddc-v1.3` conserve θ / θ. **« Classiques — même position »** conserve la position neutre habituelle. Le profil détermine aussi le nombre de séries et d’entrées ; une reprise ne transforme pas les anciennes parties. Le mode choisi est mémorisé au lancement ; une série ancienne sans configuration de départ reprend classique. La progression, la pause et le bilan affichent **« Départs variés · x / y positions jouées »**, puis **« Code des départs : \<seed> »**, ou **« Départs classiques · même position répétée. »**. Le code et le profil permettent de reproduire l’expérience ; la commande locale accepte `--seed`.

Dans **Affichage**, choisir **« Avec le plateau »** pour suivre la face de l’IA active, ses roues et ses chutes, ou **« Sans plateau — simulation rapide »** pour calculer les confrontations sans dessiner les roues et les jetons. Sans plateau, seul un écran de progression avec bilan et pause reste affiché ; le calcul s’effectue localement dans un worker, par petits lots ; si le navigateur ne permet pas son démarrage, un repli traite un tour par tâche. Les règles et les niveaux IA restent identiques. Aucun délai de présentation, animation ni son n’est exécuté. Ce mode utilise le calcul disponible ; le réglage Lent / Normal / Rapide / Full, réservé au plateau, est masqué ; aucun temps de calcul sur téléphone n’est garanti. Sans plateau est proposé pour une nouvelle préparation sans préférence ; le choix validé au lancement est mémorisé pour les nouvelles séries, et une nouvelle série issue du bilan conserve ce choix. Une série ancienne conserve son plateau.

La progression **« Partie X / N »** reste visible dans les deux affichages. Chaque résultat, sa contribution au bilan et aux statistiques sont enregistrés avant la partie suivante ; la série s’arrête exactement après N parties. Son bilan distingue les victoires d’IA 1, celles d’IA 2 et les égalités, les pourcentages de victoires et la moyenne des tours. Les niveaux, le nombre de parties, l’affichage et les départs sont fixés au lancement ; la pause reste disponible. Avec plateau, la vitesse peut changer pendant la partie. Garder le jeu ouvert : la série ne continue pas en arrière-plan, sous verrouillage ou après un rechargement. « Reprendre » relance volontairement la série depuis son dernier état durable, y compris entre deux parties, sans compter deux fois un résultat ni tirer de nouveaux départs. Sans plateau, un lot de calcul non enregistré peut être abandonné lors d’une interruption ; aucun résultat déjà enregistré n’est perdu ni rejoué dans les compteurs. Une nouvelle série demande un nouveau lancement explicite et reçoit une nouvelle graine de départs variés.

Normal et Difficile sont déterministes : les répétitions classiques ne constituent pas des essais aléatoires indépendants. La version 1.22 avait introduit `ddc-v1.4`, ses demi-pas et ses poses complémentaires pour comparer des conditions mécaniques équivalentes. La version 1.23 retient les décalages estimés de la vidéo et deux séries par face ; elle ne revendique plus cette équivalence pour les nouvelles parties. Aucun tirage n’est choisi selon son vainqueur, aucun résultat n’est forcé et aucun équilibre universel 50/50 n’est promis. Les bilans historiques restent propres à leurs profils et ne prédisent pas les résultats de `ddc-v1.5`. Utiliser un seul onglet actif par série ; deux onglets peuvent faire évoluer séparément la même sauvegarde, malgré le dédoublonnage des statistiques globales.

Facile examine un coup et varie parfois parmi des choix sûrs proches. Normal anticipe deux coups sur sa propre face ; Difficile en anticipe quatre, avec jusqu’à huit candidats initiaux et quatre pistes à chaque étape suivante. La version 1.21 avait approfondi la recherche de Difficile ; la version 1.22 conserve ces paramètres de recherche et stabilise le tri numérique de ses choix, en complément du nouveau gabarit. L’IA cherche à faire avancer les prochains numéros attendus de ses deux séries, puis à préparer les passages, uniquement depuis sa propre face. Ces niveaux ne lui donnent aucune information supplémentaire sur l’adversaire et ne garantissent pas une victoire ; Normal et Difficile restent déterministes.

Entre humains, « Je suis [prénom] — afficher mon plateau » révèle directement le contenu autorisé. Pendant son tour, poser le doigt sur une roue autorisée ou jusqu’à **16 pixels CSS autour de son bord**, le maintenir et tracer un arc autour de son centre : la roue suit le doigt dans le même sens, avec une aimantation près des alignements. Ce premier geste sélectionne puis tourne la roue. Le disque réellement touché a priorité ; à l’extérieur des disques, le bord le plus proche est retenu. Une roue interdite n’est jamais ignorée pour sélectionner sa voisine. Un appui immobile ne tourne pas la roue. Le centre possède une zone neutre de rayon 12 pixels CSS ; si le contact y commence, éloigner le doigt puis commencer l’arc. Un seuil initial de 2° évite le tremblement à la sélection. Après la capture du geste, le doigt peut s’éloigner librement du disque tant qu’il reste posé. Relâcher arrête immédiatement la rotation, sans inertie ni recalage final, puis terminer le tour. Entre humains, « Terminer et masquer » masque le plateau ; face à une IA, « Terminer mon tour » garde le même plateau et lui donne la main. Les appuis au-delà de la marge de saisie ou sur les commandes ne font pas tourner la roue.

Face à une IA, la face humaine reste affichée et conserve la même orientation pendant les deux tours, que l’humain occupe la première ou la seconde place. Pendant le tour IA, sa roue choisie tourne progressivement dans le mécanisme commun : l’humain voit ses propres jetons réagir au coup adverse, avec les résultats déjà collectés de l’IA visibles en transparence ; ses jetons en jeu restent sur sa propre face. Les commandes de roue sont indisponibles jusqu’au retour automatique de la main, sans passage ni confirmation. Avec deux IA et l’affichage avec plateau, le mode spectateur montre successivement la face active. Dans ces modes avec plateau, l’IA prend un temps de réflexion, indique la roue choisie, puis la tourne progressivement ; les chutes visibles sont un peu ralenties et le tour suivant attend leur arrivée. Une commande permet de suspendre et reprendre. Les tours automatiques commencent après une action volontaire et sont suspendus à une interruption ou un rechargement. La reprise reste explicite, sous masque, depuis la position réellement atteinte, sans rejouer le mouvement ni rattraper le temps écoulé.

Le réglage **Vitesse des IA** propose **Lent**, **Normal**, **Rapide** et **Full**, dès la préparation et pendant une partie avec plateau comportant une IA. Il agit sur les deux IA et se modifie aussi au milieu d’une rotation ou d’une chute : Lent joue à la moitié du rythme Normal, Rapide au double, et Full retire les délais de présentation et les animations de rotation pour aller au plus vite. Full conserve tous les passages mécaniques et laisse la commande de pause disponible. Changer de vitesse ne relance ni la réflexion, ni le mouvement, ni le tour ; une chute en cours conserve sa position. La vitesse ne change pas le niveau Facile, Normal ou Difficile, ni les gestes humains. Ce choix est conservé sur cet appareil après rechargement et pour les nouvelles parties ; Normal est utilisé par défaut.

L’aimant attire la roue à moins de **5°** d’un alignement, avec une correction inférieure à **1,5°** et un petit plateau exact de demi-largeur maximale **1°**. Le champ et ce plateau sont réduits près des alignements voisins pour ne pas se chevaucher. Il ne verrouille pas la roue : continuer le geste permet de le traverser. Ses positions sont fixes, communes aux deux faces et indépendantes des jetons ; un aimant ne garantit donc pas qu’une réception soit ouverte ou libre.

Pendant le glisser au doigt, l’arrivée sur un alignement aimanté produit un **clic net** si le son est activé et affiche un halo vert discret autour de la roue pendant **300 ms**. Une vibration de **12 ms** l’accompagne si le navigateur la prend en charge et si la réduction des animations est désactivée. Le [support de la vibration est incomplet](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate), notamment absent de Safari ; le retour visuel reste disponible. Un même alignement ne signale qu’une fois jusqu’à sortie de son champ, avec au moins **140 ms** entre deux retours. Un appui immobile ne produit aucun signal. Ce retour dépend seulement de l’alignement mécanique, jamais d’un jeton ou d’un résultat caché. Les commandes clavier restent inchangées et ne déclenchent pas ce retour d’aimantation.

Au clavier, Entrée ou Espace sélectionne une roue ; les flèches gauche/droite commandent des pas de 6° au maximum, raccourcis si un alignement exact est rencontré. Le maintien répète après 250 ms, puis toutes les 100 ms environ, sans rattrapage. Il n’y a pas de boutons de rotation ni de molette.

Des repères fixes indiquent les portes du cadre ; les graduations décoratives tous les 15° sont retirées. Un jeton descend quand son ouverture et celle d’une encoche libre de la roue d’arrivée partagent au moins 20 unités de largeur libre dans le passage ; leurs centres n’ont pas besoin d’être parfaitement alignés. Les repères et l’aide utilisent le même seuil que le moteur, uniquement sur la face affichée. Il faut parfois préparer cette réception lors d’un tour antérieur, puis revenir à la roue qui porte le jeton : une seule roue reste manipulable par tour et la roue adverse du tour précédent demeure interdite.

Pendant le glisser, les roues affichent directement l’angle assisté, sans retard d’interpolation ; les crans du clavier sont interpolés sur 100 ms. Les chutes simples entre roues durent 280 ms et les sorties 420 ms ; pendant les tours IA, à vitesse Normal, les chutes de la face affichée durent 420 et 630 ms pour mieux les suivre. Lent double ces durées IA, Rapide les divise par deux et Full affiche directement l’arrivée. Le réceptacle courant comporte deux glissières inclinées, une par série, numérotées de 1 à 5 de gauche à droite sur les deux faces : le 1 est au point le plus bas de chaque rangée. Le jeton descend dans la goulotte, rejoint l’entrée haute de sa rangée près du 5, puis glisse en descente vers sa place. Les profils sauvegardés `ddc-v1.3` et `ddc-v1.4` conservent leur rail unique. Le moteur calcule immédiatement les passages sur toute la trajectoire de chaque mouvement accepté ; les animations n’ajoutent aucune attente aux commandes humaines. La réduction des animations affiche directement les nouvelles positions et conserve l’indication visuelle d’alignement sans vibration.

Les sons de roue, de cran aimanté, de glissement et d’arrivée sont rétablis à partir d’enregistrements locaux Kenney sous CC0 ; leur provenance figure dans [les sons libres](docs/SONS-LIBRES.md). Le bouton haut-parleur permet de les couper ou de les réactiver. La nouvelle préférence `ddc-sound-v2` démarre avec le son activé, puis mémorise ce choix. Le clic de cran partage le même fichier que le mouvement de roue, chargé une seule fois ; il se distingue par un gain plus élevé et une lecture légèrement ralentie. Les sons des jetons accompagnent seulement la face affichée ; les jetons cachés restent silencieux. **Full et la simulation sans plateau restent silencieux.** Aucun son n’est mis en attente : le masque ou une interruption arrête les voix et les mouvements visuels, sans rejeu à la reprise.

## Simuler sans ouvrir l’interface

La commande locale utilise les mêmes règles, le même moteur et les mêmes IA que le jeu, sans navigateur ni interface graphique :

```sh
npm run simulate -- --games 100 --ai1 hard --ai2 hard --starts varied --seed 42
```

`--games` accepte de 1 à 1 000 parties, avec alternance du premier joueur ; 10 est proposé par défaut. `--ai1` et `--ai2` acceptent `easy`, `normal` ou `hard`, avec `normal` par défaut. `--starts` accepte `classic` ou `varied` ; `classic` reste le défaut de la commande. Les nouvelles simulations utilisent `ddc-v1.5` : `varied` rejoue la même pose θ / θ dans chaque paire, en échangeant le premier joueur ; avec un nombre impair, la dernière paire reste incomplète. Les poses complémentaires θ + δ concernent uniquement les séries sauvegardées `ddc-v1.4`. `--seed` est un entier, 1 par défaut, normalisé sur 32 bits non signés : à graine, profil de géométrie et paramètres identiques, les départs variés et les choix variables de Facile sont reproductibles. Normal et Difficile restent déterministes une fois la position initiale définie. Ajouter `--json` pour obtenir un bilan structuré, le profil de géométrie, les paramètres des départs et les résultats de chaque partie sur une seule ligne JSON. `npm run simulate -- --help` affiche les options.

La limite de sécurité `--max-turns` vaut 10 000 tours par partie par défaut. Si elle est atteinte, ou si aucun coup valide n’est produit, la simulation s’arrête avec une partie explicitement **inachevée**, sans inventer d’égalité ; seules les parties terminées entrent dans les victoires, égalités et moyennes. Le code de sortie vaut 0 pour une série terminée, 1 pour une simulation inachevée et 2 pour des arguments invalides. `Ctrl+C` interrompt après le tour en cours, fournit le bilan obtenu et retourne le code 130. Cette commande ne lit ni ne modifie les parties et les statistiques enregistrées dans le navigateur.

## Statistiques locales

Le bouton « Accueil » du masque permet de consulter les statistiques sans reprendre une partie. « Statistiques », accessible depuis l’accueil et le résultat, affiche le nombre de parties terminées, leur répartition entre humains, humain contre IA et IA contre IA, ainsi que la moyenne de tours joués par partie. Chaque profil présente ses parties, victoires, défaites, égalités et son pourcentage de victoires. Les profils sont regroupés par prénom et type de joueur, sans distinguer les majuscules ni les espaces en début et fin ; les niveaux des IA restent distincts. Ces compteurs sont propres au navigateur et à l’adresse du jeu, disponibles hors ligne et sans synchronisation entre appareils.

Seul un résultat déjà révélé compte, une fois par partie : recharger ou rouvrir le résultat n’ajoute rien. Une partie quittée ou remplacée sans résultat révélé ne compte pas. L’ancien historique n’est pas reconstruit ; le résultat actuellement sauvegardé peut être ajouté lors de sa révélation, une seule fois.

« Remettre à zéro » demande confirmation et propose d’annuler. La confirmation efface les compteurs et les prénoms des statistiques, tout en conservant la partie sauvegardée et les réglages. Les identifiants nécessaires pour éviter les doublons restent conservés : un ancien résultat ne revient pas dans les compteurs après cette remise à zéro. Remplacer ou supprimer la partie sauvegardée ne supprime pas les statistiques ; supprimer toutes les données du navigateur les efface.

Chaque partie terminée d’une série IA alimente les statistiques globales une seule fois. Le **bilan de la série** est conservé dans la partie sauvegardée, séparément des compteurs globaux : leur remise à zéro ne remet pas la série à zéro. Les parties suivantes complètent son bilan et alimentent de nouveau les statistiques globales. Aucun ancien historique n’est reconstruit pour composer une série. Le passage aux départs variés ne remet aucun compteur à zéro ; les statistiques globales continuent d’agréger les résultats classiques et variés, tandis que chaque bilan identifie le protocole de sa série.

## Produire les fichiers statiques

```sh
npm run check
npm test
npm run build
node scripts/serve.mjs --dist
```

`dist/` contient uniquement l’interface, les modules, les icônes, les sons locaux et leurs licences, le manifest et le service worker. Le build copie les ressources locales et calcule une empreinte du shell pour versionner le cache, sans compilation ni dépendance distante. Les documents de conception, tests, outils et captures restent hors de ce dossier. Le serveur de vérification conserve le port 4173 ; arrêter le serveur de développement avant de le lancer. La variable `PORT` permet de choisir un autre port.

Le dossier `dist/` peut ensuite être servi depuis une racine ou un sous-chemin HTTPS. La commande de build ne publie rien.

## Architecture

| Fichier | Responsabilité |
| --- | --- |
| `src/geometry.js` | Gabarit courant `ddc-v1.5`, profils conservés `ddc-v1.4` et `ddc-v1.3`, dimensions, portes et réflexion des faces |
| `src/tokens.js` | Identités uniques, numéros imprimés, séries, files locales et prochains numéros par série |
| `src/openings.js` | Projection des ouvertures en U et largeur commune minimale de 20 unités, communes au moteur et à l’aide visible |
| `src/detents.js` | Crans clavier assistés de 6° au maximum, sans lire les jetons |
| `src/gesture.js` | Angle du doigt autour du centre, zone neutre et seuil initial du glisser |
| `src/magnet.js` | Aimantation continue des alignements fixes des deux faces, sans lire les jetons |
| `src/feedback.js` | Retour d’alignement limité à 140 ms, halo, clic, vibration facultative et annulation au masque |
| `src/engine.js` | Mouvements analytiques, gravité atomique, règles et premier verdict immuable |
| `src/ai.js` | Choix des coups des trois niveaux à partir de la seule projection du joueur IA |
| `src/ai-speed.js` | Quatre vitesses IA et attentes modifiables pendant le coup |
| `src/ai-motion.js` | Progression angulaire au rythme choisi, sans rattrapage après une interruption |
| `src/flow.js` | Destinataire, transmission et contenu autorisé lors de la reprise |
| `src/board.js` | Plateau propre et résumé autorisé des sorties adverses en transparence |
| `src/opponent-progress.js` | Projection minimale des seuls jetons collectés et réceptacle adverse estompé |
| `src/motion.js` | Interpolation visuelle des seules roues et trajectoires autorisées, annulable au masque |
| `src/sound.js` | Sons Kenney CC0 locaux, clic de cran distinct, préférence de son et arrêt sans file d’attente |
| `src/app.js` | Configuration des joueurs, passage à un bouton, tours IA, commandes et interruptions |
| `src/storage.js` | Snapshot et journal dans une transaction IndexedDB, écritures ordonnées |
| `src/statistics.js` | Agrégats des résultats révélés et regroupement des profils, sans jetons ni détail des coups |
| `src/series.js` | Nombre de confrontations IA, alternance du premier joueur et bilan propre à la série sauvegardée |
| `src/starting-position.js` | Poses reproductibles par graine, protocole θ / θ courant, complément réservé à `ddc-v1.4` et provenance sauvegardée |
| `src/simulation.js` | Tours et séries sans rendu, vrais moteur et IA, départs et choix de Facile reproductibles |
| `src/simulation-worker.js` | Calcul local sans plateau par lots, borné à une partie |
| `src/simulation-client.js` | Worker, validation des checkpoints, annulation et repli local sans worker |
| `scripts/simulate.mjs` | Commande locale de simulation sans navigateur, bilan texte ou JSON |
| `src/styles.css` | Plateau bord à bord, commandes superposées discrètes, jeu et passage sans défilement ; autres écrans en flux normal |
| `sw.js`, `manifest.webmanifest` | Préparation hors ligne, installation et mises à jour |

Le projet utilise JavaScript en modules ES, HTML, CSS et SVG, sans framework. Les règles et le moteur sont indépendants du navigateur. Les trajectoires examinent analytiquement les débuts et fins de chevauchement des ouvertures, y compris entre deux événements du pointeur ; le résultat mécanique ne dépend pas de la cadence des images. Les transferts suivent exclusivement le graphe descendant des passages. La hauteur instantanée des sièges des jetons ne bloque pas un passage visuellement ouvert.

## Confidentialité et reprise

Depuis la version 1.26, le plateau présente aussi un petit réceptacle estompé de l’autre joueur : prénom, compteur et jetons déjà collectés. Ce résumé séparé partage uniquement ces sorties, conformément à la demande utilisateur. Les positions adverses encore en jeu, le journal et le verdict non annoncé ne sont jamais fournis à ce calque. Le planificateur IA conserve sa seule projection privée. Un verdict caché ne termine pas le tour et ne modifie pas les commandes ; son annonce garde la frontière normale de tour. Le calque disparaît entièrement avec le plateau pendant le passage ou une interruption.

Entre humains, le passage retire le plateau. Le seul bouton « Je suis [prénom] — afficher mon plateau » révèle le contenu autorisé après un délai de protection fixe de 300 ms et le relâchement des contacts précédents. Le geste qui termine un tour ou une touche maintenue ne peut pas révéler le suivant. Dans une partie mixte, aucun passage n’interrompt les tours ordinaires : la projection humaine reste visible, seule la main change, et un résultat est annoncé à la frontière normale de tour. Dans tous les modes, une interruption revient au masque et demande une reprise volontaire. Une fin déjà acquise pendant un tour non transmis reste cachée jusqu’à sa transmission normale.

La sauvegarde conserve le modèle, les types et niveaux des joueurs et le but de la reprise, jamais une autorisation de révélation ni un lancement automatique de l’IA. La vitesse globale est une préférence séparée, sous la clé locale `ddc-ai-speed` ; une valeur absente ou inconnue donne Normal. Le choix d’affichage des nouvelles séries est mémorisé sous `ddc-simulation-mode` ; une série sans plateau conserve `game.simulationMode = 'headless'` dans sa sauvegarde. Une sauvegarde ancienne ou sans ce mode garde le plateau, quelle que soit la préférence actuelle. Le choix de départ est mémorisé sous `ddc-start-mode` pour les nouvelles préparations ; les séries variées conservent leur configuration et leur graine dans `game.startConfig`, ainsi que leurs angles initiaux dans `game.startingAngles`. Le profil reste enregistré séparément dans `game.geometryVersion`. Une série ancienne sans configuration de départ reste classique, indépendamment de la préférence actuelle. Une erreur d’écriture de la partie masque le jeu et indique que le dernier mouvement ne peut pas être garanti. Les données restent dans le navigateur de cet appareil : aucun compte, serveur de partie, modèle distant ou service de télémétrie. Le masque ne constitue pas une authentification de la personne et ne peut pas effacer une capture déjà réalisée par le système du téléphone.

Le jeu n’indique « Prêt hors ligne » qu’après vérification de ses ressources essentielles en cache. Attendre cette indication avant de couper la connexion. Une mise à jour ne recharge pas une partie en cours.

## Vérifications

```sh
npm run check
npm test
```

La suite ordinaire vérifie le moteur, le parcours et les ressources PWA. Les intégrations nécessitant un navigateur sont explicitement ignorées sans `DDC_BROWSER_TEST_URL` ; un test ignoré ne vaut pas validation.

Les tests de navigateur utilisent Playwright comme outil de recette facultatif. Il n’est pas chargé par l’application. Avec Playwright disponible localement et ses navigateurs Chromium/WebKit installés, lancer d’abord le serveur, puis dans un autre terminal :

```sh
DDC_BROWSER_TEST_URL=http://127.0.0.1:4173 node --test tests/storage.test.js tests/pwa.test.js
DDC_BROWSER_TEST_URL=http://127.0.0.1:4173 node tests/browser.mjs
```

Si nécessaire, préparer cet outil séparément :

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium webkit
```

Sur macOS, l’émulation hors ligne de WebKit peut échouer dans Playwright ([signalement primaire #42775](https://github.com/microsoft/playwright/issues/42775)). Le test de remplacement arrête réellement son propre serveur HTTP, puis vérifie les rechargements et la reprise :

```sh
DDC_BROWSER_TEST_URL=http://127.0.0.1:4173 DDC_BROWSER=webkit DDC_PWA_ORIGIN_STOP=1 node --test tests/pwa.test.js
```

`tests/browser.mjs` indique explicitement ce cas d’émulation ignoré sur macOS ; il ne le compte pas comme un succès. Ce remplacement reste un essai WebKit sur ordinateur.

Pour utiliser une installation Playwright externe, les tests `storage.test.js` et `pwa.test.js` lisent `NODE_PATH=/chemin/vers/node_modules`. Le script `browser.mjs` accepte `DDC_PLAYWRIGHT_MODULE=file:///chemin/vers/node_modules/playwright/index.mjs`. Les deux familles de tests lisent `DDC_BROWSER_TEST_URL`.

`tests/browser.mjs` écrit ses résultats et captures dans `output/recette/`. Il couvre Chromium et WebKit avec un viewport mobile. Ces moteurs automatisés ne remplacent pas Safari sur iPhone, Chrome sur Android, l’installation depuis leur interface ni les essais en mode avion sur l’appareil.

Les références de conception se trouvent dans [les spécifications](docs/SPECIFICATIONS-PWA.md), [la géométrie](docs/GEOMETRIE-V1.md) et [les maquettes](docs/MAQUETTES-V1.md).
