# Cascado — Recette V1

Version documentaire 1.24 · 30 octobre 2026 · Profil courant `ddc-v1.5` · [Spécifications courantes](SPECIFICATIONS-PWA.md)

Cette fiche conserve les recettes successives avec leur profil et leur date. Les nombres de jetons, règles et résultats cités dans un lot historique décrivent cette version, sans valider le profil courant à dix jetons par face. Les vérifications exécutées et celles encore à effectuer sont distinguées dans la section de chaque évolution ci-dessous.

## Historique initial — 28 octobre 2026, `ddc-v1`

### Ajustement de prise en main — ddc-v1.1

À la demande de l’utilisateur, les alignements passent de ±1,19–1,87° à **±6°**, sur les deux faces et tous les passages. Les 48 tests du moteur et les 4 tests du parcours passent : les cinq nouveaux tests couvrent les entrées/sorties, les six liaisons côté source et réception, le refus hors fenêtre et la migration d’une sauvegarde sans déplacement ni réécriture du verdict. Les tests existants de logement occupé, de cadence et de parties gagnantes restent réussis. Le bilan initial ci-dessous est conservé comme historique de la première recette.

### Rotation par crans

À la demande de l’utilisateur, les commandes avancent par crans de **6°**. Vérification dans une partie de test indépendante du navigateur intégré : un appui fait passer l’angle visible de 45° à 51°, le maintien à 69°, une flèche gauche au clavier à 63°, puis un geste sur la molette à 75°. Le relâchement n’ajoute aucun déplacement. Sur B, l’appui droit fait passer l’angle local de 114° à 120°, confirmant le sens apparent conservé. La partie de l’utilisateur n’a pas servi à ces rotations de test. Les chutes intermédiaires continuent d’être résolues par le moteur ; aucune position sauvegardée n’est arrondie lors de la mise à jour.

Le développement de la V1 est réalisé localement. La présente fiche distingue les preuves automatisées des essais sur téléphones réels. La validation globale reste ouverte tant que les essais iPhone/Android et les mesures de performance n’ont pas été consignés. Une première tentative d’export vers Sites avait été refusée faute d’autorisation explicite. Après la demande de publication de l’utilisateur, le déploiement privé a réussi le 28 octobre 2026 ; le relevé figure à la fin de cette fiche.

## Exécutions et portée

| Lot | Preuve | Résultat connu |
| --- | --- | --- |
| Moteur | `tests/engine.test.js` | **43 tests réussis** : six liaisons sur chaque face, légalité, entrée/sortie, verdict, simultanéité, cadence et conservation |
| Parcours | `tests/flow.test.js` | **4 tests réussis** : résultat différé, destinataire, reprise avant transmission, résultat déjà révélé |
| Ressources PWA | Contrôles sans navigateur de `tests/pwa.test.js` | **2 tests réussis** : couverture du cache, imports locaux, budget inférieur à 2 Mo, manifest et dimensions PNG |
| Stockage réel | `tests/storage.test.js`, avec `DDC_BROWSER_TEST_URL` | **6 tests réussis** dans IndexedDB Chromium : copie, ordre, atomicité, rollback/retry, rétention, suppression et indisponibilité |
| PWA dans Chromium | `tests/pwa.test.js`, avec navigateur | **6 tests réussis**, dont les 2 contrôles de ressources et 4 intégrations : sous-chemin, hors ligne, cache incomplet, installation atomique et mise à jour |
| PWA dans WebKit | Même suite, avec `DDC_BROWSER=webkit DDC_PWA_ORIGIN_STOP=1` | **6 tests réussis**, dont rechargement et reprise lorsque le serveur HTTP est réellement arrêté |
| Parcours d’interface | `tests/browser.mjs` | **23 scénarios réussis** : 12 Chromium et 11 WebKit ; 1 émulation hors ligne WebKit explicitement ignorée et couverte par le test sans serveur ci-dessus |
| Mise en page | Captures inspectées dans `output/qa/` | 360 × 640, 320 × 568, 390 × 844, texte à 200 % et prénom de 20 caractères ; boutons des deux étapes sans chevauchement |
| Appareils | Safari iPhone et Chrome Android, navigateur et lancement installé | **À effectuer sur appareils réels** |

Les deux trajectoires gagnantes du moteur partent des files initiales : A puis B font chacun sortir les cinq jetons dans l’ordre en 40 tours légaux. Les dix jetons sont conservés à chaque étape. Un autre test conserve les jetons sur 300 tours comprenant des tours complets et inversions. Ces preuves portent sur le moteur ; elles ne mesurent pas une partie complète jouée tactilement sur téléphone.

Les commandes reproductibles figurent dans le [README](../README.md). Le run intégré final a exécuté **59 tests sans échec ni test ignoré** (43 moteur, 4 parcours, 6 PWA et 6 stockage) avec Chromium. Les 6 PWA WebKit et les 23 scénarios d’interface complètent ce run, avec certains contrôles communs. Un scénario d’interface ignoré ne compte pas comme succès. L’émulation hors ligne WebKit sur macOS rencontre le [défaut Playwright #42775](https://github.com/microsoft/playwright/issues/42775) ; le serveur arrêté constitue la preuve de remplacement, sans valider un iPhone physique.

Les mentions « navigateur confirmé » ci-dessous portent sur ces assertions et captures. Elles ne valident ni installation sur téléphone ni performances réelles.

## Règles

| ID | Preuve disponible ou prévue | Statut et complément |
| --- | --- | --- |
| R01 | Création neutre, files 1–5 et choix du premier joueur dans le moteur ; nouvelle partie masquée dans le script navigateur | Moteur et navigateur confirmés |
| R02 | Sélection locale distincte de l’engagement dans `app.js` | Vérification des deux sélections avant mouvement à compléter en interface |
| R03 | Refus d’une autre roue après premier mouvement ; script navigateur tente la seconde sélection | Moteur et navigateur confirmés |
| R04 | Action illégale sans mutation et interdiction au tour suivant | Moteur confirmé ; explication visuelle à confirmer en interface |
| R05 | Dernier jeton exactement dans la roue 5 autorise l’exception | Moteur confirmé |
| R06 | Plusieurs jetons ou dernier jeton ailleurs refusent l’exception | Moteur confirmé |
| R07 | Tours complets et inversions conservent toutes les chutes intermédiaires | Moteur confirmé |
| R08 | Deux profils couplés, sens apparent opposé et mutations des deux faces | Moteur confirmé ; captures A/B inspectées |
| R09 | Cinquième sortie, erreur d’ordre, premier verdict figé et mouvement continu ; parcours différé | Moteur, parcours et annonce dans le navigateur confirmés |
| R10 | Trajectoires identiques à 30, 60 et 120 Hz, événements et états comparés | Moteur confirmé ; performance d’affichage sur appareils à mesurer |
| R11 | Lots consécutifs acceptés, causes communes et gagnants opposés arbitrés sans priorité de joueur | Arbitrage confirmé par tests de lots ; aucune cadence d’image utilisée pour grouper les sorties |

## Confidentialité et interruptions

| ID | Preuve disponible ou prévue | Statut et complément |
| --- | --- | --- |
| C01 | Projection sans adversaire, verdict ou événements ; rendu d’une seule projection ; masques sans roues dans le script navigateur | Projection et navigateur confirmés ; lecteur d’écran et téléphone requis |
| C02 | Défaite cachée puis défaite opposée ultérieure : commandes maintenues et verdict initial conservé | Moteur confirmé ; geste long sur appareil à essayer |
| C03 | Même parcours masqué et mêmes délais d’armement, indépendants du verdict ; états `open`/`passed` | Parcours confirmé ; comparaison temporelle sur appareils à mesurer |
| C04 | Deux écrans, boutons déplacés, relâchement et délai fixe ; double appui au même endroit testé par navigateur | Double appui confirmé ; doigt maintenu et touche maintenue à vérifier explicitement |
| C05 | Masque et confirmation retirent le plateau et les roues du DOM | Assertions navigateur confirmées ; VoiceOver/TalkBack à effectuer |
| C06 | HTML initial neutre, rechargement sur masque, historique interrompu | Rechargement confirmé ; retour arrière/restauration système à essayer |
| C07 | Suspension, roue engagée conservée et reprise à deux appuis ; stockage atomique | Parcours, pause/reprise et stockage confirmés ; verrouillage réel à essayer |
| C08 | Transmission change le destinataire avant la révélation | Parcours et navigateur confirmés |
| C09 | Verdict révélé après transmission et second appui | Parcours et navigateur confirmés |
| C10 | Altération du seul état caché sans modification de la projection visible | Projection confirmée ; comparaison des DOM et réponses temporelles sur gestes identiques à compléter |
| C11 | Verdict acquis avec tour encore ouvert : reprise du plateau, pas du résultat | Parcours et scénario navigateur avec fixture confirmés |
| C12 | Résultat déjà révélé : reprise autorisée du résultat, sans nouveau tour | Parcours et rechargement navigateur confirmés |
| C13 | Premier appui ouvre uniquement la confirmation opaque | Navigateur confirmé ; contrôle VoiceOver/TalkBack requis |
| C14 | Annuler revient au premier masque | Navigateur confirmé |
| C15 | Rechargement entre les deux appuis recommence au premier masque ; autorisation absente de la sauvegarde | Navigateur et intégration IndexedDB confirmés ; interruption système réelle requise |

Une fixture de verdict dans les tests de navigateur sert uniquement à vérifier le parcours de confidentialité. Les verdicts mécaniques sont vérifiés séparément par le moteur et les trajectoires complètes, sans fixture terminale.

## Interface

| ID | Preuve disponible ou prévue | Statut et complément |
| --- | --- | --- |
| U01 | Script navigateur à 360 × 640, captures et contrôle de visibilité de la fin de tour ; captures de QA à d’autres tailles dans `output/qa/` | Navigateur confirmé ; surfaces utiles avec barres système réelles à vérifier |
| U02 | Passage 640 × 360 puis retour 360 × 640 impose masque et révélation | Navigateur confirmé ; rotation physique sur grands téléphones à confirmer |
| U03 | Numéros, symboles, commandes fines, contrôle clavier, style pour mouvement réduit | Commande fine et sens B dans la recette navigateur ; lecteur d’écran, zoom et ergonomie tactile à essayer sur appareils |

## PWA et sauvegarde

| ID | Preuve disponible ou prévue | Statut et complément |
| --- | --- | --- |
| P01 | Cache complet, navigation/reprise hors ligne, nouvelle partie hors ligne et sous-chemin | Ressources et intégrations confirmées ; mode avion réel et partie tactile complète requis |
| P02 | Manifest `standalone`, icônes 192/512 et aide d’installation | Manifest confirmé ; installation et lancement depuis l’écran d’accueil iOS/Android requis |
| P03 | Service worker en attente, refus si autre fenêtre ouverte et aucun rechargement imposé | Intégration PWA confirmée ; essai d’une mise à jour pendant une partie installée requis |
| P04 | Snapshot et journal atomiques, ordre des écritures, autorisation de révélation exclue, échec de transaction simulé ; rechargement masqué | Intégration IndexedDB et navigateur confirmés ; arrêt brutal de l’application réelle à essayer |

Le journal conserve les 256 derniers commits ; le snapshot courant contient l’état complet. Les tests de stockage vérifient aussi cette borne, la suppression et le signalement d’un stockage indisponible. Une disparition du stockage du navigateur supprime la partie ; aucune copie serveur n’existe.

## Géométrie

| ID | Preuve disponible ou prévue | Statut et complément |
| --- | --- | --- |
| G01 | Constantes `ddc-v1`, centres, rayons de siège, nombres d’encoches et fenêtres calculées | Moteur confirmé ; ouvertures en U inspectées dans les captures |
| G02 | Géométrie présentée comme adaptation et règle intégrée mentionnant la version numérique | Conception et texte implémenté ; aucune précision métrique MB revendiquée |
| G03 | Centres réfléchis, indices d’encoches conservés, angle apparent de signe opposé | Moteur confirmé ; rendu B inspecté dans les captures navigateur |
| G04 | Six liaisons sur A et B, réception occupée et roue réceptrice en mouvement | Moteur confirmé |
| G05 | Deux entrées locales à gauche, files initiales intactes et entrées fermées au neutre | Moteur et captures confirmés |
| G06 | Transferts atomiques, conservation, aucun état intermédiaire ni refus dû au verdict | Moteur confirmé ; réactivité et absence de fuite temporelle sur appareils à mesurer |

## Recette sur appareils avant clôture

Consigner le modèle, la version du système, celle du navigateur, le mode onglet/installé et la date pour chaque essai. Tester au moins un iPhone avec Safari et un téléphone Android avec Chrome, en incluant les versions ciblées disponibles.

1. Installer depuis une adresse HTTPS de test, attendre « Prêt hors ligne », puis lancer depuis l’écran d’accueil.
2. Jouer une partie complète à deux en portrait. Contrôler la prise en main, les numéros, les 44 pixels de cible et la fin de tour sans défilement sur la surface minimale.
3. Essayer le double appui, le maintien du doigt/de la touche, Annuler, l’arrière-plan, le verrouillage, le paysage, le retour navigateur et une interruption entre les deux appuis.
4. Vérifier avec VoiceOver/TalkBack que les masques ne contiennent ni plateau ni résultat et que toutes les commandes sont utilisables. Essayer zoom et grossissement du texte.
5. Passer en mode avion après préparation, créer et terminer une partie, interrompre puis reprendre. Relancer depuis l’accueil du système.
6. Essayer une mise à jour pendant une partie et un arrêt brutal après plusieurs mouvements ; relever le dernier état durable restauré.
7. Mesurer la réponse initiale visée sous 100 ms, la fluidité visée à 60 images/s, l’affichage du masque et la stabilisation. Comparer les passages ordinaires et décisifs sans différence liée au résultat caché.

Un défaut de confidentialité, un résultat incorrect ou une mécanique non conforme bloque la livraison. Un appareil manquant empêche de déclarer la recette finale achevée ; il ne transforme pas une simulation de navigateur en preuve d’installation réelle.

## État de sortie

La version locale est prête pour les essais utilisateurs ; le dossier `dist/` a également passé les 23 scénarios d’interface. Aucun défaut bloquant n’est observé dans ces contrôles. Le travail s’arrête à cette version d’essai, avec deux suites identifiées : recette matérielle iPhone/Android et, après autorisation du transfert externe, adresse HTTPS privée. Les variantes et améliorations facultatives restent hors de cette V1.

## Évolution v1.6 — surface, descentes et sons (28 octobre 2026)

Cette vérification complète les recettes historiques ci-dessus. Les boutons de rotation et la molette ont été remplacés par la sélection d’une roue, puis les appuis sur la surface à gauche ou à droite de son centre. Le maintien enchaîne les crans de 6° ; une zone neutre de ±4 pixels évite un choix de sens au centre.

- `npm run check` et `npm run build` réussis ; le build inclut les modules de mouvement, les trois WAV locaux et leurs licences.
- `npm test` : **73 tests réussis, aucun échec**, 10 intégrations navigateur/IndexedDB ignorées faute de configuration navigateur pour cette exécution. Les 10 tests de mouvement couvrent notamment la continuité lors des crans successifs, les transferts multiples, les deux faces, la descente au réceptacle et l’annulation au masque. Les 8 tests audio contrôlent le geste initial, le mode muet, les erreurs et l’arrêt des chargements tardifs.
- Recette d’interface par CUA sur une origine locale distincte : premier appui maintenu sans engagement, appui droit +6°, gauche −6°, maintien et arrêt au relâchement, centre neutre, flèche clavier, bouton son sans rotation, sens horaire local sur la face B, entrée d’un jeton et pause/transmission avec retrait des roues et jetons du DOM. Aucune erreur ou alerte dans la console observée.
- Deux projections de recette temporaires ont montré l’animation d’un transfert 1 → 2 et la sortie de la roue 5 : descente verticale, puis glissement dans le réceptacle. Ces projections et leur page ne sont pas livrées dans le build.
- `tests/browser.mjs` a été adapté aux commandes de surface ; sa syntaxe a été vérifiée. La suite complète de ce script n’a pas été rejouée pour cette évolution ; les anciennes 23 validations ne sont pas comptées comme une nouvelle exécution.
- Sources audio Kenney CC0 et correspondance des fichiers d’origine consignées dans `SONS-LIBRES.md`. Seuls les transferts de la face affichée alimentent les animations et sons ; masque et interruption annulent les callbacks et coupent les voix.

Les essais matériels iPhone/Android, l’écoute sur leurs haut-parleurs, VoiceOver/TalkBack et la mesure des performances restent à effectuer. Les contrôles locaux ne remplacent pas cette recette matérielle.

## Publication privée — 28 octobre 2026

À la demande explicite de l’utilisateur, la V1 avec commandes de surface, animations et sons a été publiée via Sites. L’adresse d’hébergement est conservée hors du dépôt. Le déploiement a retourné `succeeded`. L’accès existant a été conservé : propriétaire uniquement, avec connexion ChatGPT. L’ouverture du lien a confirmé la présence de cet écran de connexion ; aucun contournement d’accès n’est inclus dans le lien ou le QR code.

Les sources de publication sont isolées dans `output/publication/source`, synchronisées au commit `0c713325bb0758119004423298993149442d7453`. Le dossier contient uniquement les sources et ressources du jeu préparées pour la publication. Les identifiants de version et de déploiement figurent dans `output/publication/deployment.json`, sans secret ni jeton d’accès.

QR code fourni en PNG 720 × 720 et SVG dans `output/publication/dix-de-chute-qrcode.*`, noir sur blanc avec marge de quatre modules. Le décodage OpenCV restitue exactement l’adresse HTTPS publiée. La partie locale reste sur l’origine locale ; le téléphone et l’adresse publiée ont leur propre stockage de partie.

## Correction v1.7 — crans calés sur les passages

Le retour utilisateur signalait des trous mal alignés avec les crans et des jetons immobiles. L’audit a confirmé que les anciens pas de 6° pouvaient atteindre les fenêtres de ±6° (écart maximal constaté : 2,72° sur les liaisons). Les graduations dessinées étaient pourtant espacées de 15°, et l’interface n’expliquait pas qu’une encoche libre devait être ouverte sur la roue réceptrice.

La commande avance désormais de 6° maximum et s’arrête sur le premier angle exact de passage rencontré. Les arrêts sont calculés à partir des seules portes et encoches fixes des deux faces ; ils ne dépendent ni des jetons cachés ni du verdict. Les angles sauvegardés ne sont pas recalés au chargement. Le gabarit `ddc-v1.1`, la tolérance et les règles d’engagement sont conservés.

Les graduations de 15° ont été retirées. Quatorze repères fixes indiquent les extrémités des six liaisons, l’entrée et la sortie. Une aide issue seulement de la projection affichée distingue notamment réception fermée ou occupée, et rappelle le besoin d’un autre tour quand la roue est déjà engagée.

Vérifications :

- `npm run check`, `npm test`, `npm run build` réussis : **93 tests passent**, aucun échec, 10 intégrations navigateur/IndexedDB non exécutées dans cette commande.
- Dix nouveaux tests de crans vérifient toutes les portes exactes, les deux sens, les inversions et les angles hors grille. Ils incluent **236 configurations** de transfert source/réception/face/sens, construites uniquement par des crans, ainsi que les entrées et sorties.
- Dix nouveaux tests d’aide et de rendu couvrent les deux faces, les réceptions libres/occupées, la même tolérance que le moteur et l’absence de lecture des données cachées.
- Recette CUA sur origine locale isolée : jeton 1 chargé dans la roue 1, face au passage ; roue 2 initialement fermée. L’aide a demandé de préparer la roue 2. Avant engagement, le changement de sélection a été accepté. La rotation de la roue 2 a ouvert la réception et le jeton est passé dans celle-ci. Après engagement, l’aide a correctement indiqué de préparer la roue suivante à un autre tour. Le masque a retiré le plateau. Capture : `output/recette/crans-alignes.png`.
- La page de recette temporaire a été retirée du build. Le script navigateur complet a été adapté aux crans assistés et sa syntaxe vérifiée ; il n’a pas été exécuté pour cette correction.

La recette matérielle et les mesures de performance sur téléphones restent à consigner.

La correction v1.7 a ensuite été publiée avec succès sur le même lien privé. Commit publié : `a6a38e8bd02ab6485ed56ef7fe8a453a0769d4ab`. Les identifiants courants sont conservés dans `output/publication/deployment.json`. La partie locale a été rechargée sous masque, sans changement de destinataire, et le marqueur d’interface `surface-assisted` a été confirmé.

## Évolution v1.8 — chute au chevauchement visuel (29 octobre 2026)

À la demande de l’utilisateur, le critère de chute n’exige plus que les centres des deux encoches soient chacun dans une fenêtre de ±6°. Le gabarit `ddc-v1.2` calcule les bouches des ouvertures U à partir de la même largeur de 28 unités que leur SVG, les projette dans le repère tangent du passage et les découpe au corridor de largeur 28. Le premier contact commun déclenche le transfert si la réception est libre. Une largeur libre égale au diamètre du jeton n’est pas exigée : c’est l’assistance de passage demandée. Les ouvertures tournées vers le dos et les projections séparées restent fermées.

L’entrée et la sortie suivent le même critère face à leur port fixe. Les six liens restent orientés de la roue du haut vers celle du bas. Le filtre sur la hauteur des centres des sièges a été supprimé : sur 4 → 5, il pouvait refuser un passage dont les ouvertures se touchaient déjà. Le graphe descendant et les fenêtres distinctes garantissent la fin des cascades et l’unicité des sources/destinations. Les crans assistés, la rotation des deux faces, les sons filtrés et le parcours opaque sont conservés.

`src/openings.js` fournit le calcul commun au moteur, aux repères et à l’aide. Les bornes du balayage continu sont calculées analytiquement avec la position de l’ouverture opposée, pour toutes les encoches, sans lire leur occupation ou le verdict. Les événements restent indépendants de la fréquence d’affichage.

Vérifications exécutées :

- `npm run check`, `npm test` et `npm run build` réussis : **127 tests passent**, aucun échec ; 10 intégrations navigateur/IndexedDB non exécutées par cette commande.
- Géométrie SVG, premiers contacts, écarts de ±10°/20°, intervalles séparés, miroir, ouvertures au dos et marges séparant les passages concurrents vérifiés.
- Toutes les liaisons et tous les indices d’encoches sur A/B, réception occupée, passage 4 → 5 malgré un siège récepteur momentanément plus haut, chute en chaîne 2 → 3 → 4, sorties simultanées et conservation vérifiés.
- Trajectoires de 360° par source ou réception, dans les deux sens et sur les deux faces, comparées entre mouvement unique et découpages 30/60/120. États, événements et verdicts identiques. Les deux trajectoires gagnantes historiques de 40 tours passent sans modification.
- Sauvegardes `ddc-v1` et `ddc-v1.1` migrées par changement du seul identifiant : aucune chute, aucun déplacement et aucun résultat réécrit au chargement. Le nouveau calcul intervient au prochain mouvement accepté.
- Recette CUA sur deux origines locales isolées : ancienne sauvegarde avec source à +20° et réception à −20°, jeton conservé au chargement puis transféré de 1 vers 2 au premier mouvement ; cas à +20° sur les deux roues sans recouvrement, jeton maintenu sur 1. Aucun avertissement ni erreur de console observé dans le second cas. Captures `output/recette/chevauchement-avant.png` et `chevauchement-apres.png`.
- Page de recette temporaire retirée du build. Aucun test de navigateur exécuté hors CUA. La recette matérielle iPhone/Android reste à consigner.

Publication v1.8 réussie sur le même lien privé, au commit `6a241ef8e1c3b8a25e45ed60e8ca9182435dfbab`. Le déploiement Sites a retourné `succeeded` ; les identifiants courants figurent dans `output/publication/deployment.json`. Le QR code encode toujours le même lien.

## Évolution v1.9 — rotation directe au doigt (29 octobre 2026)

À la demande de l’utilisateur, la rotation tactile se fait désormais en maintenant la roue et en glissant autour de son centre. Le même appui sélectionne la roue puis commence le suivi angulaire. L’angle apparent suit le doigt à 1:1, dans les deux sens ; le signe physique est inversé sur la face B. Un contact immobile, un simple appui ou un contact hors roue ne tourne plus la roue. Les appuis gauche/droite sur toute la surface et leur répétition tactile ont été retirés.

Le suivi utilise une zone neutre de rayon 12 pixels CSS autour du moyeu et un seuil initial de 2° de déplacement net. Entrer dans le moyeu oublie l’angle précédent ; le premier point à sa sortie réarme sans déplacement, pour éviter un saut de 180°. Le pointeur est capturé sur le conteneur stable du jeu ; les mouvements restent suivis hors du disque. Le relâchement termine les derniers mouvements reçus, sans ajouter de cran ni d’inertie. Annulation, perte de capture, autre doigt, interruption ou redimensionnement arrêtent le geste. Une autre roue ne peut pas être prise après engagement.

Les échantillons reçus sont regroupés au plus une fois par image pour le rendu et la sauvegarde. Le moteur parcourt chaque segment angulaire dans l’ordre, y compris les inversions ; les chutes intermédiaires ne sont pas perdues si l’angle final revient au point de départ. Les rotors et jetons assis suivent immédiatement le geste ; les jetons en vol conservent leurs positions et échéances lors du reciblage. Les chutes continuent au relâchement, mais sont annulées au masque. Entrée/Espace puis les flèches gardent les crans assistés et la répétition clavier.

Vérifications exécutées :

- `npm run check`, `npm test` et `npm run build` réussis : **144 tests passent**, aucun échec ; 10 intégrations navigateur/IndexedDB non exécutées dans cette commande.
- Douze tests du nouveau module `gesture.js` : maintien immobile, déplacement radial, bruit sous le seuil, activation nette, amplitude cumulative, sens inverses, tours complets, passage de ±180°, moyeu et coordonnées invalides.
- Cinq nouveaux tests de mouvement : rendu direct sur A/B, 359° → 1°, poursuite des chutes pendant/après le suivi, transition vers le clavier et absence de double contact sonore ; 15 tests de mouvement au total.
- Recette CUA sur une partie locale séparée : maintien immobile 650 ms sans engagement ; quart de tour horaire d’environ 90° sur A ; inversion ramenant l’angle au départ ; traversée du moyeu sans saut ; appui maintenu hors roue sans mouvement ; flèche clavier ; passage opaque ; prise et rotation de la roue 2 sur B dans un seul geste ; pause masquée. Aucun avertissement ni erreur de console observé. Capture : `output/recette/rotation-au-doigt.png`.
- `tests/browser.mjs` adapté au geste circulaire et vérifié par `node --check`, sans exécution du script complet hors CUA. Les essais physiques iPhone/Android et les mesures de fluidité restent à consigner.

Publication v1.9 réussie sur le même lien privé, au commit `83d9a537bdfd422fb47cf9d6e18f12802ce2a9ba`. Le déploiement Sites a retourné `succeeded` ; les identifiants courants figurent dans `output/publication/deployment.json`. La partie locale est restée masquée pour Camille pendant le chargement ; les marqueurs `wheel-drag` et `visual-overlap` ont été confirmés ensemble. Le QR code reste valable.

## Évolution v1.10 — aimantation légère et passage plus ferme (29 octobre 2026)

La rotation au doigt est conservée. Une attraction douce aide à rejoindre les angles exacts des portes : champ de 3° au maximum, plateau central de 0,5° au maximum, correction inférieure à 1°. Les champs sont réduits lorsque deux angles sont proches. Leur interpolation continue conserve le sens du geste et se dépasse en continuant à tourner. L’angle brut cumulé reste indépendant de l’angle corrigé, pour pouvoir sortir du plateau même par de très petits mouvements. Aucun mouvement n’est ajouté au contact, au maintien immobile ou au relâchement ; aucune inertie n’est ajoutée. Les cibles ne dépendent que de la géométrie fixe des deux faces, jamais des jetons cachés ni du verdict.

Le gabarit `ddc-v1.3` demande désormais une largeur commune de **20 unités sur les 28 unités de l’ouverture**, soit environ 71 %. Un contact de bords ou un chevauchement étroit ne suffit plus. Entrée, sortie, liaisons, repères et aide emploient le même critère ; une réception occupée reste bloquée. Les bornes du balayage continu ont été adaptées analytiquement. Les anciennes sauvegardes `ddc-v1`, `ddc-v1.1` et `ddc-v1.2` sont migrées sans chute, déplacement ni réécriture de résultat au chargement. Le nouveau critère s’applique au prochain mouvement accepté.

Vérifications exécutées :

- `npm run check`, `npm test` et `npm run build` réussis : **165 tests passent**, aucun échec ; 10 intégrations navigateur/IndexedDB non exécutées dans cette commande.
- Onze tests d’aimantation couvrent la monotonie et la continuité, les champs voisins, les inversions, les tours complets, les petits mouvements de sortie et l’absence de dérive. Les seuils de passage, les deux faces, les migrations, les balayages aux cadences 1/30/60/120 et les trajectoires gagnantes historiques ont été vérifiés. Les anciens cas permis uniquement par un chevauchement étroit sont désormais testés comme bloqués.
- Recette CUA sur deux origines locales isolées : sauvegarde antérieure avec source décalée de 12° et réception centrée, jeton retenu au chargement puis après un premier mouvement qui réduit encore le passage ; geste inverse jusqu’à l’alignement, attraction sur l’angle exact et chute 1 → 2. Maintien immobile de 600 ms sans dérive, sortie du champ d’environ 12° puis retour. Sur B, le même geste local a produit l’angle physique inverse attendu et la chute 1 → 2. Aucun avertissement ni erreur de console observé sur A. Capture : `output/recette/aimantation-passage.png`.
- `tests/browser.mjs` adapté à l’aimantation et vérifié par `node --check`, sans exécution du script complet hors CUA. La page de recette temporaire est exclue des livrables. La validation matérielle iPhone/Android et les mesures de fluidité restent à consigner.

Publication v1.10 réussie sur le même lien privé, au commit `4ff4d441659b1037dc236a7ab0707f239b336782`. Le déploiement Sites a retourné `succeeded` ; les identifiants courants figurent dans `output/publication/deployment.json`. La partie locale est restée masquée pour Camille et les marqueurs `wheel-drag-magnet`, `overlap-20` et `ddc-v1.3` ont été confirmés après activation du nouveau cache. Le QR code reste valable.

## Évolution v1.11 — retour d’aimantation et réceptacle incliné (29 octobre 2026)

Pendant le glisser, l’entrée ou la traversée du plateau d’un aimant déclenche un halo vert discret de 300 ms et une vibration de 12 ms si le navigateur le permet. Le signal ne lit que les angles fixes et la trajectoire brute ; ni les jetons ni le verdict n’y participent. Un alignement ne se réarme qu’après sortie complète de son champ ; un délai minimal de 140 ms regroupe les passages proches sans mise en attente. Contact, maintien immobile et relâchement ne produisent pas de nouveau signal. Le masque et les interruptions annulent le halo, sa minuterie et la vibration ; les callbacks périmés restent inopérants. La réduction des animations conserve le halo statique et supprime la vibration. Les crans clavier restent inchangés.

Le rail numéroté du bas est en pente descendante vers le 1, de gauche à droite 1 → 5 sur les deux faces. Les centres sont A x = 28 + 26i, B x = 158 + 26i, y = 494 − 3,5i. Les cinq jetons et leurs numéros utilisent exactement les mêmes positions. La sortie descend d’abord à y = 477, rejoint l’entrée haute A(136 ; 479,461538) ou B(266 ; 479,461538), puis glisse vers sa place sans remontée ni segment final horizontal. Ce changement de présentation ne modifie pas les roues, portes, règles ou sauvegardes du gabarit `ddc-v1.3`.

Vérifications exécutées :

- `npm run check`, `npm test` et `npm run build` réussis : **192 tests passent**, aucun échec ; 10 intégrations navigateur/IndexedDB non exécutées dans cette commande. Le module de retour est inclus dans le cache hors ligne.
- Vingt tests d’aimantation, dont neuf nouveaux sur le compteur d’arrivées, la traversée entre échantillons, l’absence de répétition dans le champ et le réarmement. Six tests du retour : durée, fréquence maximale, annulation et callback périmé, indisponibilité ou refus de vibration, préférence de réduction des animations et vue bloquée. Les dix sorties vers les cinq places des deux faces suivent une trajectoire descendante ; rail, numéros, jetons, marges et absence de collision avec la roue 5 sont vérifiés.
- Recette CUA sur deux origines locales isolées : maintien immobile de 600 ms sur A sans halo ni rotation ; glisser jusqu’au passage 1 → 2 avec halo visible capturé, puis extinction sans rejeu lors d’un nouveau maintien immobile. Le masque retire plateau et halo. Sur B, glisser de la roue 5 jusqu’à sa sortie exacte, progression de 3 à 4 jetons arrivés, numéro 1 au point bas et jetons 1–4 centrés sur la pente. Aucun avertissement ni erreur de console observé sur les deux scénarios. Captures : `output/recette/halo-et-glissiere.png` et `output/recette/glissiere-descente.png`.
- `tests/browser.mjs` mis à jour et sa syntaxe vérifiée, sans exécution du script complet hors CUA. La page temporaire de recette est retirée avant livraison. La vibration matérielle et la validation physique iPhone/Android restent à vérifier sur appareil ; le test de l’API utilise un dispositif simulé et ne prouve pas une vibration réelle.

Publication v1.11 réussie sur le même lien privé, au commit `cb086065ee63e854b6c9ca045cdbfc3662765f39`. Le déploiement Sites a retourné `succeeded` ; les identifiants figurent dans `output/publication/deployment.json`. La partie locale est conservée sous masque pour Camille ; les marqueurs `halo-haptic`, `slope-one-low` et `ddc-v1.3` ont été confirmés après activation du nouveau cache. Le QR code reste valable.

## Évolution v1.12 — joueurs IA et passage à un bouton (29 octobre 2026)

À la demande explicite de l’utilisateur, le parcours à deux appuis est remplacé par un seul bouton de révélation : « Je suis [prénom] — afficher mon plateau ». L’écran de confirmation intermédiaire est retiré. L’armement de 300 ms et l’obligation de relâcher les contacts hérités sont conservés. Un rechargement ou une interruption revient au masque ; la sauvegarde n’accorde toujours aucune permission de révélation.

Chaque place dispose de son type Humain/IA et de son niveau Facile/Normal/Difficile. Les types et niveaux sont enregistrés dans les métadonnées des joueurs ; les anciennes sauvegardes restent humaines sans modifier la mécanique ou les positions. Facile examine le coup immédiat avec une variation parmi des choix sûrs proches, Normal anticipe deux coups et Difficile trois avec une recherche bornée plus large. Le moteur existant arbitre chaque candidat et chaque mouvement réel.

L’IA ne reçoit que sa projection `getView`, copiée par une liste blanche avant son envoi à un worker local. Aucun plateau adverse, journal, nom ou verdict caché n’y est transmis ; aucun service distant n’est utilisé. Une erreur, une absence de worker ou un dépassement de cinq secondes bascule vers le même calcul local borné. Annulation, réponse périmée et requêtes concurrentes sont traitées sans mouvement tardif.

Contre un humain, l’écran de l’IA est opaque et ne présente ni roues, jetons, progression privée, sons de jetons ni vibrations. Le prochain humain retrouve le masque et son bouton unique. Avec deux IA, la face active est visible en mode spectateur avec des commandes de roues désactivées ; les tours s’enchaînent jusqu’au résultat normal. Une commande suspend le duel. Pause, perte de focus, orientation, navigation, erreur de sauvegarde et rechargement annulent les calculs et minuteries ; la reprise est explicite. Une reprise de tour engagé reste sur la même roue. Les générations sont vérifiées après chaque attente, y compris la sauvegarde initiale.

Un verdict acquis pendant un tour encore ouvert ne raccourcit pas le tour IA et ne modifie pas les commandes. Après transmission normale vers une IA, `acceptReveal` peut annoncer le résultat au lieu de jouer un coup supplémentaire. Après transmission vers un humain, le résultat reste derrière son bouton de révélation. Le gabarit `ddc-v1.3`, le seuil de passage et la rotation au doigt sont conservés.

Vérifications exécutées :

- `npm run check`, `npm test` et `npm run build` réussis : **245 tests passent**, aucun échec ; 10 intégrations navigateur/IndexedDB non exécutées dans cette commande. Les quatre nouveaux modules IA/joueurs sont dans le cache hors ligne.
- Trente tests du planificateur : légalité, roue engagée et interdite, exception du dernier jeton, face B, seuil de passage, ordre, projection immuable, absence d’information cachée, hasard contrôlé et progression. Les neuf couples de niveaux avec chacun des deux premiers joueurs ont terminé par une série ordonnée en 51 à 72 tours dans les simulations déterministes. Quatorze tests du client couvrent worker, annulation, concurrence, délai, repli et réponses périmées. Neuf tests des métadonnées couvrent les deux sièges et les anciennes sauvegardes.
- Recette CUA sur deux origines locales séparées : configuration IA Difficile contre IA Facile, démarrage automatique après le formulaire, observation de plusieurs tours, pause au tour 30, rechargement toujours en pause, reprise sur le tour engagé et victoire de Camille par les cinq sorties dans l’ordre. Aucun avertissement ni erreur de console observé.
- Partie mixte avec IA Normal au départ : écran opaque avec zéro roue et zéro jeton dans le DOM ; retour à Léa sous masque ; un seul appui ouvre directement son plateau. Un mouvement humain suivi de « Terminer et masquer » lance le tour IA. Interruption avant son mouvement puis rechargement : écran IA en attente, sans départ automatique ni plateau. Aucun avertissement ni erreur de console observé. Captures : `output/recette/duel-ia.png`, `passage-un-appui.png` et `choix-joueurs-ia.png`.
- `tests/browser.mjs` adapté au parcours à un bouton et aux modes IA, syntaxe vérifiée ; son exécution complète hors CUA n’a pas été effectuée. Les essais physiques iPhone/Android et les mesures de performance sur appareil restent à consigner.

Publication v1.12 réussie sur le même lien privé, au commit `6fd5ce9164d2a9e22323e29f87c65988f878df67`. Le déploiement Sites a retourné `succeeded` ; les identifiants figurent dans `output/publication/deployment.json`. La partie locale antérieure est conservée sous masque pour Camille avec ses deux humains. Les marqueurs `single-confirmation`, `human-or-ai` et `ddc-v1.3`, ainsi que l’absence de confirmation intermédiaire, ont été confirmés après activation du nouveau cache. Le QR code reste valable.

## Évolution v1.13 — tours IA lisibles et rotation progressive (29 octobre 2026)

Les coups IA ne sont plus appliqués en une seule rotation instantanée. Après 900 ms de réflexion et 500 ms de mise en évidence de la roue choisie, le moteur reçoit les portions réellement parcourues, environ toutes les 16 ms. La durée vaut au moins 700 ms, avec une vitesse moyenne de référence de 90°/s et des extrémités adoucies. Les angles restent signés et déroulés : un parcours de 270° ou un tour complet n’est ni raccourci ni inversé. Les retards sont plafonnés à 40 ms par étape, sans dette de rattrapage.

En spectateur, les jetons suivent des chutes allongées de 1,5 fois : 420 ms entre roues et 630 ms pour une sortie simple. La roue attend la fin de chaque transfert visible, avec une marge de 120 ms et un minimum de 300 ms, avant de poursuivre. Après le dernier mouvement, le tour attend au moins 1 000 ms et le temps restant des animations visibles avant transmission. Les rendus successifs conservent la position, l’échéance initiale et l’unique son d’arrivée de chaque chute. Les mouvements et durées des commandes humaines restent inchangés.

Le calcul de l’IA, les trois niveaux, la géométrie et les règles sont conservés. En partie mixte, l’IA reste masquée et aucune pause ou sortie sonore supplémentaire ne dépend d’une chute cachée. Les positions intermédiaires sont sauvegardées à des points de contrôle espacés d’environ 150 ms et lors de chaque interruption ; les écritures restent ordonnées. La reprise recalcule depuis l’angle effectivement sauvegardé sur la roue déjà engagée. Aucun verdict encore ouvert ne raccourcit la trajectoire ou le tour.

Vérifications exécutées :

- `npm run check`, `npm test`, `npm run build` et la vérification syntaxique de `tests/browser.mjs` réussis : **270 tests passent**, aucun échec ; 10 intégrations navigateur/IndexedDB non exécutées dans cette commande.
- Dix-huit tests du rythme progressif : signe, tours complets, départ/arrivée, petits mouvements, cadences 30/60/120 Hz, long retard sans saut, sommes exactes et comparaison avec le mouvement atomique du moteur sur les deux faces. Les placements, transferts et premiers verdicts décisifs restent identiques. Sept nouveaux tests de rendu vérifient les durées allongées, les échéances stables, le seul son d’arrivée, le temps restant et l’annulation.
- Recette CUA sur deux origines isolées : duel IA Normal depuis le formulaire, plusieurs angles intermédiaires du même tour observés (345,7866°, 352,4863°, 357,0698° au tour 3). Pause pendant une rotation au tour 18, rechargement toujours en pause, reprise sur un angle partiel sauvegardé sans retour à l’angle initial ; la roue engagée reste imposée.
- Position temporaire sur B : jeton 1 sur la roue 5 à 12° de la sortie. Rotation progressive jusqu’à l’ouverture, phase « Les jetons descendent… », roue momentanément retenue à 96,2417° pendant le déplacement du jeton vers le rail. Le duel poursuit ensuite normalement. Captures : `output/recette/ia-rotation-progressive.png` et `ia-pause-chute.png`.
- Contrôle mixte : écran IA opaque avec zéro roue et zéro jeton dans le DOM, puis retour à Léa sous le masque à un bouton. Aucun avertissement ni erreur de console observé sur les origines de recette. La page temporaire a été retirée par le build final.
- Le script navigateur complet n’a pas été exécuté hors CUA. Les essais matériels et mesures de fluidité iPhone/Android restent à consigner. Les anciens onglets utilisateur n’étaient plus accessibles à la fin de cette recette ; aucune partie utilisateur n’a été jouée ou remplacée.

Publication v1.13 réussie sur le même lien privé, au commit `ed27823923e305b632747d32da1dada66fe3b2e1`. Le déploiement Sites a retourné `succeeded` ; les identifiants courants figurent dans `output/publication/deployment.json`. Le lien et son QR code restent inchangés.

## Évolution v1.14 — quatre vitesses IA réglables en cours de partie (29 octobre 2026)

« Vitesse des IA » propose Lent (0,5×), Normal (1×), Rapide (2×) et Full. Le réglage est commun aux deux IA, indépendant de leur niveau de jeu, disponible dans la préparation, la pause, le tour IA masqué, le mode spectateur et le tour humain d’une partie mixte. La préférence `ddc-ai-speed` est conservée localement ; une valeur absente ou inconnue utilise Normal. Les sauvegardes de partie et permissions de révélation sont inchangées.

Les attentes conservent leur temps virtuel restant et la rotation sa progression. Changer de vitesse ne relance ni la décision, ni le tour, ni le mouvement. Le temps brut d’une image reste plafonné à 40 ms avant multiplication par la vitesse. Les chutes déjà commencées conservent leur position et leur progression, avec leurs durées restantes recalées dans le rapport ancien/nouveau et un seul impact final. Les commandes et durées humaines restent inchangées.

Full applique le reliquat signé du mouvement par le moteur analytique, puis présente directement les positions finales. Il conserve les passages intermédiaires, l’ordre, la roue engagée et le premier verdict. Il retire les pauses et animations de présentation, sans mettre en file des sons rapides. Une cession réelle de 32 ms entre les tours maintient l’interruption possible. Le sélecteur natif et le bouton Pause restent dans un panneau connecté au document entre les changements de face, positionné dans les emplacements de l’interface : une liste ouverte reste utilisable en Full. Revenir de Full à une autre vitesse ne rembobine aucun déplacement déjà accepté.

Vérifications exécutées :

- `npm run check`, `npm test`, `npm run build` et la vérification syntaxique de `tests/browser.mjs` réussis : **291 tests passent**, aucun échec ; 10 intégrations navigateur/IndexedDB non exécutées dans cette commande. Le module de vitesse est inclus dans le cache hors ligne.
- Quinze nouveaux tests des profils, attentes variables, changements en cours, plafond des retards et finition Full ; comparaison du moteur sur les deux faces avec cinq changements de cadence puis application du reliquat. Six nouveaux tests de rendu : retiming sans saut, échéances recalées, absence d’impact double, finition directe et conteneur masqué ou détaché silencieux.
- Recette CUA sur deux origines isolées : quatre options dans la préparation, démarrage Lent, passage à Rapide pendant la rotation sur B avec même tour 2 et même roue 5 (143,9176° puis 141,5974°). Sélection Full, ouverture native de la liste pendant les changements de tour, retour à Lent par le clavier natif, puis nouvelle sélection Full et Pause. Rechargement : IA toujours en pause et Full conservé. Aucun avertissement ni erreur de console observé.
- Chute sur B : passage de Normal à Lent pendant la descente du jeton 1, roue fixe à 96,1337° sur le même tour tandis que le jeton continue de (242,6263 ; 467,5922) vers (245,1778 ; 477,0208), puis passage à Rapide. La chute n’est ni recommencée ni ramenée dans son encoche.
- Partie mixte : réglage Rapide puis Full pendant le tour IA opaque, zéro roue dans le DOM, retour au masque humain. Pendant le tour de Léa, roue 2 sélectionnée à 114°, changement de vitesse et utilisation du clavier dans le sélecteur : angle toujours 114° et fin de tour toujours désactivée. Le contrôle reste distinct de la commande de rotation. Captures : `output/recette/vitesses-ia.png` et `vitesse-ia-tour-humain.png`.
- Le script navigateur complet n’a pas été exécuté hors CUA. La position temporaire de recette est retirée des livrables. Les essais matériels iPhone/Android restent à consigner ; aucune partie utilisateur n’a été jouée ou remplacée.

Publication v1.14 réussie sur le même lien privé, au commit `70511a77cf847fd299d03f32946fd46f6f7af7dc`. Le déploiement Sites a retourné `succeeded` ; les identifiants courants figurent dans `output/publication/deployment.json`. Le lien et son QR code restent inchangés.


## Évolution v1.15 — même plateau contre l’IA, son coupé (29 octobre 2026)

Une partie avec exactement un humain et une IA affiche toujours la projection de l’humain, qu’il occupe A ou B. Le planificateur continue de recevoir uniquement sa propre face. La rotation physique reste calculée depuis le joueur actif ; le rendu, les transferts et leurs pauses suivent uniquement la face humaine. Les jetons, compteurs et transferts de l’IA restent cachés. Les mêmes éléments `.play` et `.board-wrap` restent connectés pendant les transitions normales. La sélection, l’engagement et les roues liées restent visibles ; toutes les commandes de roue et de fin de tour sont indisponibles pendant le tour IA et les écritures de transition. Le joueur humain retrouve directement les commandes, sans masque ni nouvelle validation. Un résultat est annoncé après la transmission normale, jamais au milieu du mouvement.

La préparation ouvre directement la face humaine en partie mixte. Une interruption, une pause ou un rechargement revient au masque « Partie en pause » et exige « Reprendre la partie ». Le passage opaque à un bouton entre deux humains et le mode spectateur des deux IA sont conservés. Les quatre vitesses restent réglables pendant la partie.

Le son est temporairement désactivé par un réglage global : aucune création de contexte audio ni lecture par le lecteur, même avec une ancienne préférence activée. Le bouton de réactivation est retiré. Les fichiers et licences CC0 sont conservés pour une éventuelle réactivation ultérieure.

Vérifications exécutées :

- Syntaxe et manifest valides ; **297 tests passent**, aucun échec, 10 intégrations navigateur/IndexedDB non exécutées dans cette commande. Cinq nouveaux tests couvrent la projection stable sur les deux sièges, les modes homogènes, les anciennes sauvegardes et l’absence d’accès aux informations cachées. Un nouveau test confirme le verrouillage audio malgré une préférence activée.
- Recette CUA sur origines locales isolées : configuration Humain A contre IA B depuis le formulaire, démarrage direct, mouvement humain puis tour IA sur le même écran. Les identifiants accessibles de la surface et du plateau restent identiques. La roue 5 passe progressivement par 1,1883° puis 11,7185° ; les cinq roues sont désactivées pendant le coup. Le retour humain conserve la face A, sans passage ni validation, avec la roue 5 interdite et les autres commandes disponibles. Aucun bouton de son. Pause puis rechargement : masque « Partie en pause » avec un seul bouton de reprise. Capture : `output/recette/ia-meme-plateau.png`.
- Position de recette sur B : humain Léa, IA Camille active sur A, chaque face ayant un jeton dans la roue 5. La roue humaine tourne de 144° vers 138,7441° puis jusqu’à 54°. Le jeton humain 1 rejoint sa place à (158 ; 494), et la main revient directement à Léa. Une seconde position avec le dernier jeton humain 5 montre la phase « Tes jetons descendent… », roue retenue à 96,2273° et jeton à (248,2207 ; 477,3775), sans écran de résultat. La rotation reprend et se termine avant l’annonce directe « Léa gagne ! » à la frontière de tour.
- Contrôle du duel de deux IA depuis le formulaire : démarrage Full, modification vers Lent pendant le duel, progression et commandes spectateur conservées, puis pause explicite réussie. Contrôle deux humains : masque Camille, révélation à un bouton, puis « Terminer et masquer » produit le masque Léa sans plateau accessible. Aucun avertissement ni erreur de console observé.
- `tests/browser.mjs` adapté au même plateau sur les deux sièges, aux commandes désactivées, à l’identité du conteneur et à l’absence de son ; syntaxe vérifiée uniquement. Aucune exécution de ce script hors CUA. Les positions temporaires sont retirées des livrables par le build final. Aucun essai physique iPhone/Android ni remplacement d’une partie utilisateur.

Publication v1.15 réussie sur le même lien privé, au commit `012a97d6c5d48e5f4c2b531999aeafe85ac17bf1`. Le déploiement Sites a retourné `succeeded` ; les identifiants courants figurent dans `output/publication/deployment.json`. Le lien et le QR code restent inchangés.


## Évolution v1.16 — nom Cascado (29 octobre 2026)

Le nom validé est **Cascado**. Il remplace le nom de travail dans la marque visible, le titre et la description HTML, le nom accessible de l’application, l’attente initiale, le manifest PWA, le titre d’installation iOS, le titre SVG et la page de secours hors ligne. La documentation courante est actualisée ; les références au jeu original et les maquettes historiques restent identifiables.

L’origine publiée, l’identité PWA `./`, IndexedDB `dix-de-chute-v1`, les préférences `ddc-*` et le préfixe de cache restent conservés : aucun changement des sauvegardes ni migration mécanique. La géométrie, les règles, le silence temporaire et les parcours restent ceux de v1.15. Le lien et le QR code restent valables.

Vérifications : `npm run check` et `npm run build` réussis ; les deux contrôles statiques PWA passent (quatre intégrations navigateur ignorées dans cette commande). Pas de nouveau test pour ce changement de libellés. Recette CUA sur une origine locale vierge : titre d’onglet, marque, nom accessible et titre iOS « Cascado », affichage d’accueil et état prêt hors ligne confirmés. Aucun avertissement ni erreur de console observé. Capture : `output/recette/cascado-accueil.png`. Les essais matériels d’installation restent à effectuer. Aucune partie utilisateur ouverte, modifiée ou remplacée.

Publication v1.16 réussie sous le titre Cascado au commit `c6835e73d0058770160d22adacdaed3652361034`, avec état Sites `succeeded`. Adresse et accès privé conservés.


## Évolution v1.17 — statistiques locales et remise à zéro (30 octobre 2026)

L’accueil et les résultats révélés proposent « Statistiques ». Le masque dispose d’un retour neutre à l’accueil pour consulter les compteurs sans reprendre un plateau ou une IA. L’écran présente le total de parties, la répartition Humain/Humain, Humain/IA et IA/IA, les tours joués en moyenne, puis les participations, victoires, défaites, égalités et pourcentages par profil. Les prénoms sont regroupés par trim, casse et Unicode NFC, avec séparation des humains et des IA et de chacun des niveaux IA. La présentation utilise le défilement ordinaire sur petit écran.

Le module pur `statistics.js` ne reçoit que les identités publiques, le tour et le résultat. Le stockage ajoute les statistiques dans la transaction du premier enregistrement `revealed-result`, jamais à la seule présence d’un verdict ouvert ou passé. Un marqueur minimal par identifiant de partie évite les doublons entre fenêtres et après une remise à zéro. Les nouvelles parties ont un UUID ; une ancienne sauvegarde sans identifiant reçoit une empreinte stable SHA-256, identique si deux fenêtres mettent à jour la même sauvegarde. La base IndexedDB existante, ses magasins et sa version sont conservés. Le nouveau module est dans le cache hors ligne.

La remise à zéro demande confirmation avec Annuler, un armement de 300 ms et le relâchement des contacts hérités. Elle efface uniquement l’agrégat : les marqueurs de parties déjà comptées, la sauvegarde et le journal restent conservés. Les réglages restent inchangés. Supprimer une partie conserve également statistiques et marqueurs. Aucun historique ancien n’est reconstruit ; le résultat sauvegardé déjà révélé peut être ajouté une seule fois.

Vérifications exécutées :

- `npm run check`, `npm test` et `npm run build` réussis : **310 tests passent**, aucun échec, **15 intégrations navigateur/IndexedDB ignorées** par cette commande. Treize tests du nouveau module couvrent les issues, les deux sièges, les modes et niveaux, les profils normalisés, les données invalides, la pureté et l’absence d’accès aux jetons/événements. Cinq intégrations de stockage ont été ajoutées et restent conditionnelles au navigateur.
- Recette CUA sur une origine locale isolée avec données synthétiques : **14 vérifications réussies** via une page temporaire visible. Verdict ouvert et verdict passé non comptés ; révélation comptée une fois ; répétition sans doublon ; deux workers avec connexions IndexedDB indépendantes comptent la même partie une seule fois. Une erreur de quota simulée sur l’écriture statistique annule ensemble sauvegarde, journal, compteurs et marqueur, puis un nouvel essai réussit. La remise à zéro conserve le snapshot et le journal ; un ancien résultat reste exclu. Égalité, duel IA, conservation des statistiques et marqueurs après suppression d’une partie vérifiés. Rapport lisible : `output/recette/statistiques-fiabilite.txt`.
- Parcours de l’application : consultation de trois parties de démonstration (une de chaque mode), moyenne 21,3 tours et cinq profils dont deux niveaux de Milo distincts ; Annuler conserve tous les scores. Confirmation du reset : zéro et message de succès, bouton désactivé quand les compteurs sont vides. Reprise de la partie conservée : roue 2 toujours engagée, angle affiché 47°, vitesse Lent. Aucun avertissement ni erreur de console observé. Captures : `statistiques-cascado.png` et `statistiques-confirmation.png`.
- Vue mobile réelle dans un cadre de **360 × 640** : ancien résultat sans identifiant repris volontairement, une seule partie comptée (27 tours), deux profils lisibles, accès depuis le résultat et retour au résultat fonctionnels. Réouverture du résultat : total toujours 1. Après reset puis ouverture du jeu dans un nouvel onglet de la même origine, le résultat est rouvert mais les statistiques restent à 0. Capture : `output/recette/statistiques-mobile.png`.
- Les positions, workers et pages de recette temporaires sont exclus du build final. Aucun essai matériel iPhone/Android, aucune partie ni statistique utilisateur modifiée. Le script Playwright complet n’a pas été exécuté hors CUA.

Publication v1.17 réussie sur le même lien privé Cascado, au commit `f3041e69e68bec52e925d7e550edb03d19c444ad`. Sites a retourné `succeeded` ; identifiants courants dans `output/publication/deployment.json`. Le QR code reste valable.


## Évolution v1.18 — accès direct au Duel automatique (30 octobre 2026)

L’accueil comporte « Duel automatique ». Sa préparation dédiée propose deux niveaux IA indépendants et la vitesse commune Lent/Normal/Rapide/Full, avec les noms fixes IA 1 et IA 2 pour un nouveau duel. Les contrôleurs sont imposés à IA uniquement lors de la validation. Le premier joueur est IA 1 pour un nouveau duel ; la phrase de préparation l’indique. Un avertissement et « Remplacer et lancer » signalent le remplacement d’une sauvegarde existante. Retour conserve intégralement la partie en place. Le formulaire général garde ses choix humains ou IA et son choix du premier joueur.

Le mode reprend le moteur et le spectateur déjà disponibles : mouvements progressifs, chutes visibles, cinq roues sans commande humaine, vitesse réglable, pause et reprise explicite après interruption ou rechargement. Le numéro de tour et l’IA active sont affichés. Les tours s’enchaînent jusqu’à la transmission qui annonce un résultat ; aucune nouvelle partie n’est lancée automatiquement. Les statistiques classent ce résultat en IA/IA. La revanche réouvre la préparation dédiée, conserve les noms et niveaux et alterne le premier joueur. Aucune migration de sauvegarde ni nouveau mode durable n’est nécessaire : les deux contrôleurs IA décrivent le duel.

Vérifications exécutées :

- `npm run check`, `npm test`, `npm run build` et syntaxe du script navigateur réussis : **310 tests passent**, aucun échec, 15 intégrations navigateur/IndexedDB ignorées dans cette commande. Aucun nouveau test ne reproduit les libellés de cette modification d’interface ; la recette passe par les vrais contrôles CUA.
- Origine CUA isolée : accueil puis préparation, IA 1 Facile / IA 2 Difficile, vitesse Lent. Démarrage en un seul bouton, sans sélection de type ni de nom ; cinq roues désactivées et aucun bouton Terminer. Les tours 3 puis 5 sont observés sans validation humaine, avec la roue 1 en rotation à 350,5011° puis environ 352°. Pause du duel, rechargement toujours en pause, sélection de Full puis reprise.
- Le duel se termine seul par « IA 2 gagne ! », série complète, après **64 tours**. Les statistiques montrent une seule partie IA/IA, 64 tours, victoire Difficile et défaite Facile. Aucun enchaînement de revanche sans action. Revanche : deux niveaux conservés, IA 2 indiquée comme premier joueur ; lancement en Lent confirme IA 2 active au premier tour, puis pause réussie.
- Vue 360 × 640 sur une seconde origine : sélecteur Difficile lisible et manipulable, avertissement de remplacement visible, défilement normal pour Retour. Après préparation automatique puis Retour, la reprise retrouve Alex, roue 2 engagée et angle affiché 47°, sans remplacement par des IA. Aucun avertissement ni erreur de console observé.
- Captures : `output/recette/duel-automatique-preparation.png`, `duel-automatique-plateau.png` et `duel-automatique-mobile.png`. La page de recette avec partie synthétique est retirée du build final. Aucune partie utilisateur modifiée ; les essais physiques iPhone/Android restent à effectuer.

Publication v1.18 réussie sur le même lien privé Cascado, au commit `93595e1da636bdf9904242b437409df0a697242c`. Sites a retourné `succeeded` ; identifiants courants dans `output/publication/deployment.json`. Le QR code reste valable.


## Évolution v1.19 — séries de confrontations IA (30 octobre 2026)

« Duel automatique » permet de lancer une série de **1 à 1 000 parties**, avec **10** proposé par défaut, les choix rapides **10 / 50 / 100** et une saisie personnalisée. Les niveaux des deux IA et le nombre de parties restent fixés pendant la série ; la vitesse et la pause restent disponibles. Le premier joueur alterne à chaque partie, sans déplacer les IA de leur face. L’autorisation donnée au lancement couvre exactement N parties ; la progression « Partie X / N » accompagne les tours et le dernier résultat ouvre un bilan final, sans partie supplémentaire.

Le bilan de `game.series` conserve les parties terminées, les victoires des deux places, les égalités, leurs taux de victoire et la moyenne des tours transmis. Les résultats révélés alimentent aussi les statistiques globales une seule fois. La remise à zéro globale ne modifie pas le bilan de la série et ne réajoute pas ses anciennes contributions. La sauvegarde conserve aussi l’étape entre deux parties : une interruption ou un rechargement demande une reprise volontaire, sans doubler un résultat ni sauter une partie. Les sauvegardes antérieures sans série restent des duels ordinaires, sans reconstruction d’un historique.

Vérifications exécutées :

- `npm run check`, `npm test`, `npm run build` et vérification syntaxique du script navigateur réussis : **340 tests inscrits, 325 réussis, aucun échec et 15 intégrations navigateur/IndexedDB ignorées** par cette commande. Les **15 tests du module de séries** couvrent la validation du nombre, le bilan, le dédoublonnage, l’alternance et les limites de l’enchaînement. Les tests ignorés ne sont pas comptés comme réussis.
- Recette CUA sur l’origine isolée `127.0.0.1:4202` : les choix rapides 50, 100 puis 10 mettent à jour le formulaire. La valeur 0 est rejetée avec un message demandant un entier de 1 à 1 000, sans lancement. Depuis le vrai formulaire, une série **Normal / Normal, Full, N = 2** se termine seule à **2 / 2**, avec **deux victoires d’IA 2** et une **moyenne de 58 tours**. Les statistiques globales affichent exactement deux parties IA contre IA.
- Sur cette même origine, la remise à zéro ramène les statistiques globales à 0 tout en conservant le bilan **2 / 2**. Après rechargement et « Voir le bilan », ce bilan reste identique et les statistiques restent à 0. « Nouvelle série » conserve les niveaux et N = 2 ; IA 1 est annoncée au départ, à l’opposé du premier joueur de la dernière partie terminée.
- Recette mobile sur l’origine séparée `127.0.0.1:4203`, dans un cadre de **360 × 640** : formulaire et contrôles lisibles avec défilement ordinaire. Une page de préparation visible installe une première manche terminée par le vrai moteur après **17 tours**. Reprise puis pause pendant le résultat intermédiaire : bilan **1 / 2**, prochaine partie 2. Un nouvel onglet ouvert sur la racine reste en pause à **1 / 2**, sans lancer la suite.
- Reprise de cette série en Lent : **Partie 2 / 2**, IA 2 active conformément à l’alternance. Le passage à Full termine la série à **2 / 2**, avec **une victoire par IA** et une **moyenne de 33,5 tours**. Aucun avertissement ni erreur de console observé sur les scénarios de recette.
- Captures : `output/qa-series-preparation.png`, `output/qa-series-bilan.png`, `output/qa-series-mobile-preparation.png` et `output/qa-series-mobile-pause.png`. Les pages de préparation temporaires sont retirées du build final. Aucune partie ni statistique utilisateur modifiée, aucun essai matériel iPhone/Android. Le script navigateur complet n’a pas été exécuté hors CUA.

Portée des simulations : les calculs demandent que le jeu reste ouvert et actif ; arrière-plan, verrouillage et rechargement suspendent la série. Les niveaux Normal et Difficile sont déterministes : répéter N confrontations ne produit pas N échantillons aléatoires indépendants. L’alternance du premier joueur compare les deux départs, sans constituer à elle seule une mesure statistique indépendante de force. Aucun verrou de série entre onglets n’est ajouté : le dédoublonnage des statistiques globales est conservé, mais deux simulations simultanées de la même série peuvent diverger. Utiliser un seul onglet actif pour la série.

Publication v1.19 réussie sur le même lien privé Cascado, au commit `8d957a6a8805e55197ee5b9ebdf1afcc2be3f2ef`. Sites a retourné `succeeded` ; identifiants courants dans `output/publication/deployment.json`. Le lien et le QR code restent valables. Aperçu supplémentaire du champ : `output/qa-series-choix-nombre.png`.


## Évolution v1.20 — simulation sans plateau et sans navigateur (30 octobre 2026)

Le Duel automatique propose « Affichage » : « Sans plateau — simulation rapide » ou « Avec le plateau ». Les nouvelles préparations proposent Sans plateau par défaut, puis conservent la préférence validée au lancement. Une revanche conserve son choix ; les anciennes séries restent avec plateau. Sans plateau, aucune roue, jeton, animation ou temporisation de vitesse n’est créé. Seuls un écran de progression, le bilan provisoire et Pause sont affichés ; le résultat final conserve le bilan habituel et les statistiques.

Le module pur `simulation.js` reprend les décisions IA sur leur seule projection, la rotation physique complète et les frontières transmit/acceptReveal/recordSeriesResult. Le client copie la session et utilise un worker persistant par lots d’au plus huit tours ou 120 ms, contrôlés entre deux coups. Chaque résultat s’arrête au sein du worker : la page enregistre ensemble résultat, bilan et statistiques avant de créer la partie suivante. Pause termine le worker et invalide sa réponse tardive ; le dernier checkpoint accepté est conservé, le lot non validé est abandonné. Sans Worker disponible, le repli joue un seul tour par tâche. Un défaut met la série en pause, sans inventer de résultat. Les modules sont inclus dans le cache PWA.

La commande `npm run simulate -- --games N --ai1 normal --ai2 hard --seed 42 --json` lance le même moteur sans navigateur, interface, sauvegarde du navigateur ni serveur. La graine rend Facile reproductible. Une limite de tours ou Ctrl+C produit un état inachevé ou interrompu et un code de sortie adapté ; aucune égalité n’est fabriquée.

Vérifications exécutées :

- Syntaxe et build réussis ; suite complète : **370 tests inscrits, 355 réussis, aucun échec, 15 intégrations navigateur/IndexedDB ignorées**. Les 16 tests du moteur sans interface couvrent la parité avec les vrais coups et passages du jeu, les deux premiers joueurs, N exact, le hasard reproductible, les interruptions et limites sans faux verdict. Les 14 tests client/worker couvrent copie, lots, conservation du worker, annulation, messages tardifs, repli et erreurs. Le test de série confirme la conservation du choix sans plateau entre deux parties. Syntaxe des scripts CLI et navigateur vérifiée ; aucune exécution du script navigateur hors CUA.
- Commande réelle Difficile / Difficile, N = 10, graine 42 : arrêt exact après dix parties, cinq victoires par IA, zéro égalité, 570 tours et alternance des départs. Rapport : `output/simulation-10-difficile.json`. Avec une limite d’un tour, zéro partie achevée et état `incomplete`, raison `turn-limit`, code de sortie 1 ; aucun faux nul.
- Recette CUA isolée sur `127.0.0.1:4204` : Sans plateau sélectionné par défaut ; le changement Avec le plateau affiche la vitesse et le retour Sans plateau la masque. Une série Normal / Normal, N = 2, finit à 2 / 2 avec deux victoires d’IA 2 et 58 tours en moyenne, conforme au moteur direct. Pendant les calculs, le DOM comporte zéro plateau et zéro commande de roue.
- Série suivante N = 100 : Pause laisse 2 / 100 terminées, partie 3 en cours ; rechargement conserve cet état en pause avec reprise volontaire. La reprise termine exactement à 100 / 100, avec cent victoires d’IA 2 et 58 tours de moyenne. Les statistiques globales affichent exactement **102 parties IA / IA** (les deux de la première série plus les cent suivantes), sans doublon à la reprise.
- Origine séparée `localhost:4204`, cadre mobile 360 × 640 : progression, cartes et Pause lisibles. Un bouton de recette visible crée le vrai Worker : deux lots de huit tours utilisent une seule instance ; la session originale reste au tour 1. Rapport affiché `passed: true`. Sur l’origine principale, le mode Avec le plateau démarre ensuite une série N = 1 avec cinq roues visibles désactivées et vitesse Lent ; la pause fonctionne et aucun résultat n’est ajouté pour cette partie inachevée.
- Aucun avertissement ni erreur de console observé sur la recette principale. Captures : `output/qa-simulation-sans-plateau.png`, `output/qa-simulation-bilan-100.png` et `output/qa-simulation-mobile.png`. La page temporaire de recette est retirée du build final. Aucune partie ni statistique utilisateur modifiée, aucun essai physique iPhone/Android.

Limites conservées : le mode navigateur demande un jeu ouvert et actif, avec reprise volontaire après interruption. Le CLI fonctionne sans navigateur. Normal et Difficile restent déterministes ; répéter N parties ne représente pas N expériences aléatoires indépendantes. La série reste prévue dans un seul onglet actif. Aucun temps de calcul ni gain de performance matériel n’est garanti.

Publication v1.20 réussie sur le même lien privé Cascado, au commit `df75b4b3f7ff52e6bd640f1281b763ac6e1239c2`. Sites a retourné `succeeded` ; identifiants courants dans `output/publication/deployment.json`. Le lien et le QR code restent valables.


## Évolution v1.21 — IA difficile et avantage du premier joueur (30 octobre 2026)

L’analyse de la série historique Normal / Difficile montre deux parties déterministes répétées cinquante fois. Dans cette confrontation, le premier joueur charge son premier jeton avec la roue 1, qui devient momentanément interdite au second. L’ancien Difficile, limité à trois coups anticipés, ne compensait pas ce retard : lorsque Normal commence sur A, ses sorties arrivent aux tours 9, 21, 33, 45 et 57, celles des quatre premiers jetons de Difficile aux tours 14, 26, 38 et 50. Les traces ne montrent pas de règle donnant une victoire forcée au premier joueur ni de défaut d’arbitrage. Les roues communes et les choix de préparation expliquent le rythme de cette confrontation particulière.

Difficile anticipe désormais **quatre coups sur sa propre face**, avec la même largeur de recherche : au plus huit candidats initiaux et quatre pistes aux étapes suivantes. Le coup supplémentaire permet de considérer davantage la préparation des roues en aval. Facile, Normal, la fonction de score, les règles, la géométrie et la limite d’information du planificateur restent identiques. Les identifiants de niveaux, sauvegardes et statistiques restent conservés. La recherche reste une anticipation de préparation propre, sans connaître les décisions ou les jetons adverses et sans modifier le premier joueur.

Vérifications exécutées :

- `npm run check`, suite complète et build réussis : **374 tests inscrits, 359 réussis, zéro échec, 15 intégrations navigateur/IndexedDB ignorées**. Les quatre nouveaux tests de force vérifient chaque combinaison face de Difficile × premier joueur, une victoire complète avant 160 tours, les coups légaux et rotations miroir, la conservation et l’ordre des jetons et la vraie frontière de révélation. Avant modification, les deux cas où Difficile joue deuxième échouaient ; ils réussissent avec la version renforcée. Les tests existants couvrant la confidentialité, les niveaux, le coût borné, les mouvements IA, le worker et la PWA passent parmi les contrôles exécutés.
- Expériences contrôlées sur quatorze configurations de départ (sept poses angulaires explicites × deux faces, Difficile toujours deuxième) : ancienne profondeur 3 / largeur 4, **4 victoires sur 14** ; profondeur 4 / largeur 3, 13/14 ; réglage retenu profondeur 4 / largeur 4, **14/14**. Toutes ces parties ont une fin complète, aucune boucle. Ces fixtures ne constituent pas un échantillon aléatoire. Rapport : `output/validation-ia-difficile-variantes.json`. Les mesures de coût de cet ordinateur n’engagent pas les performances sur téléphone.
- Analyse avant/après des quatre départs neutres : les traces détaillées et leurs conditions se trouvent dans `output/analyse-ia-difficile-v1.21.json`. Elles proviennent de la variante de profondeur 4 / largeur 4 effectivement retenue, avec le vrai moteur et la seule projection autorisée comme entrée de l’IA.
- Recette CUA sur une origine locale isolée, `127.0.0.1:4205` : vraie préparation Normal / Difficile, Sans plateau, N = 2. Difficile sur B remporte les deux parties, en commençant deuxième puis première ; moyenne 64,5 tours. Les statistiques affichent exactement deux parties IA / IA et deux victoires de Difficile. Aucun avertissement ni erreur de console observé. Capture : `output/qa-ia-difficile-renforcee.png`. Aucune partie ni statistique utilisateur modifiée ; aucun essai physique iPhone/Android. Le script navigateur complet n’a pas été exécuté hors CUA.

Série comparative CLI de cent parties achevée, avec les mêmes places, graine 42 et départs alternés que le bilan historique : **Difficile 100 victoires, Normal 0, aucune égalité**, contre 50/50 auparavant. Difficile gagne les cinquante parties où elle joue deuxième en 72 tours, et les cinquante où elle commence en 57 tours. Total : 6 450 tours, moyenne 64,5. Tous les résultats sont complets et les compteurs ont été recoupés avec les cent lignes individuelles. Rapport : `output/simulation-100-normal-difficile-v1.21.json` ; le fichier historique `output/simulation-100-normal-difficile.json` reste conservé.

Les résultats restent propres à leurs conditions : Normal et Difficile sont déterministes et le planificateur ne peut pas garantir une victoire contre toute stratégie ou toute position. La série de cent répétitions alternées mesure ici deux départs classiques, complétés par les quatre combinaisons face/départ et les quatorze fixtures supplémentaires.

Publication v1.21 réussie sur le même lien privé Cascado, au commit `36162862d8fa2b4928d231742c921316b1e8ccf4`. Sites a retourné `succeeded` ; identifiants courants dans `output/publication/deployment.json`. Le lien et le QR code restent valables.


## Évolution v1.22 — équivalence des faces et comparaison des IA (30 octobre 2026)

L’analyse du résultat « B gagne 100 fois » distingue deux effets. Normal et Difficile sont déterministes : cent parties classiques avec départ alterné répètent seulement deux trajectoires. Le moteur n’accorde pas de priorité de traitement à B, mais les décalages historiques des trois premières roues ne rendaient pas les conditions mécaniques équivalentes après échange des faces. Une expérience exploratoire sur cinquante positions variées, chacune rejouée avec le premier joueur opposé, a encore donné **27 victoires sur A et 73 sur B**, sans égalité, sur le profil `ddc-v1.3` : `output/simulation-100-difficile-difficile-departs-varies-legacy-v1.3.json`. Diversifier les départs ne corrige donc pas à lui seul l’asymétrie géométrique.

Les nouvelles parties utilisent **`ddc-v1.4`** : les décalages des roues 1 à 5 deviennent **180°, 60°, 90°, 45° et 36°**, soit un demi-pas d’encoche sur chacune. La transformation T ajoute ces décalages aux angles, échange les faces et renumérote circulairement les encoches de B ; elle conserve les positions et les possibilités de passage réfléchies. Les dimensions, le graphe descendant, le seuil de 20 unités et les règles de victoire restent conservés. Le tri des coups IA stabilise les égalités numériques, notamment autour de 180°, sans changer les critères d’évaluation, les informations reçues ou la profondeur quatre / largeur quatre de Difficile. Aucun vainqueur ni score n’est corrigé après calcul.

Le Duel automatique propose désormais **Départs** : « Variés — comparer les IA », par défaut sans préférence, ou « Classiques — même position ». En mode varié courant, chaque paire joue une pose θ puis sa complémentaire θ + δ, avec premier joueur inversé ; N impair laisse une dernière paire incomplète. La graine sur 32 bits et le profil rendent ces départs reproductibles. Les tirages sont filtrés uniquement pour garder la première entrée fermée sur les deux faces ; aucun tirage n’est choisi selon son vainqueur. La commande locale accepte `--starts classic|varied`, avec `classic` par défaut. La progression, la pause et le bilan identifient les départs ; aucun champ du formulaire ne modifie la graine.

Les parties et séries déjà enregistrées en `ddc-v1.3` restent dans ce profil jusqu’à leur fin ; une ancienne série variée garde ses poses θ / θ. Les versions `ddc-v1`, `ddc-v1.1` et `ddc-v1.2` migrent uniquement vers `ddc-v1.3`, sans recalage, mouvement ni réécriture d’un verdict. `game.geometryVersion`, `game.startConfig` et `game.startingAngles` conservent la provenance de la série. Une reprise n’en tire pas de nouvelle graine. Les statistiques historiques restent intactes ; les compteurs globaux continuent d’agréger les résultats, indépendamment du bilan propre à la série.

Vérifications exécutées :

- `npm run check`, suite complète et build réussis : **411 tests inscrits, 396 réussis, aucun échec, 15 intégrations navigateur/IndexedDB ignorées** dans cette commande. Ces tests ignorés ne sont pas comptés comme succès.
- Les tests `face-symmetry.test.js` vérifient les demi-pas, les dimensions inchangées, les positions des sièges et leur réflexion, les deux profils et **1 000 mouvements légaux couplés** avec conservation des jetons, correspondance des transferts et des instantanés terminaux. Les lots simultanés conservent les égalités et échangent correctement les vainqueurs.
- Les tests IA couvrent les arrondis proches du demi-tour et les décisions de Difficile après échange complet des faces. Les tests de départ, série et simulation couvrent la génération reproductible, les poses complémentaires, la conservation des métadonnées au fil des tours, les reprises et essais répétés de renouvellement, le worker et le maintien du protocole historique.
- **Cent parties réelles sans interface, Difficile / Difficile, départs variés, graine 42, `ddc-v1.4`, sont terminées.** Le fichier source conserve leurs cent résultats individuels : `output/simulation-100-difficile-difficile-equilibree-v1.22.json`. La durée enregistrée sur cet ordinateur est de **207 952 ms** ; elle ne constitue pas une garantie de performance sur téléphone.
- Le contrôle indépendant de ce fichier recalcule les compteurs, la somme et la moyenne des tours ; il vérifie les numéros 1 à 100, l’alternance du départ, les cinquante paires et les cinq angles de chaque partie contre le générateur, avec une tolérance de 10⁻⁹ degré. Chaque seconde partie possède bien les angles θ + δ, un premier joueur opposé, un gagnant permuté et le même nombre de tours que sa première partie. Chaque résultat est de cause `complete`, sans partie inachevée. Le bilan lisible et l’empreinte SHA-256 du fichier vérifié se trouvent dans `output/bilan-100-difficile-difficile-v1.22.json`. Cette vérification des résultats ne rejoue pas les mouvements de chaque partie.
- Recette CUA sur l’origine isolée `127.0.0.1:4206`, depuis les vrais contrôles : Difficile / Difficile, Sans plateau, N = 4, départs variés, code **4180546578**. Pause, rechargement et reprise conservent le code et le bilan ; la série se termine à **4 / 4**, avec **deux victoires par IA** et **65 tours en moyenne**. Les statistiques globales comptent exactement quatre parties. Capture : `output/qa-v1.22-serie-4.png`.
- Sur l’origine séparée `localhost:4206`, dans un cadre de **360 × 640**, la reprise d’une ancienne sauvegarde synthétique `ddc-v1.3` conserve sa mécanique : la roue 2 de B, à l’angle physique 47°, affiche **67°** selon son ancien décalage, et non 43° comme dans le profil courant. Capture : `output/qa-v1.22-sauvegarde-ancienne.png`. Depuis cette même origine, une nouvelle série Difficile / Difficile, Sans plateau, N = 2, départs variés, code **427644302**, se termine à **2 / 2**, avec une victoire par IA et 65 tours de moyenne. Capture : `output/qa-v1.22-serie-mobile-2.png`.
- Aucun avertissement ni erreur de console observé sur ces deux onglets de recette. Les pages temporaires sont retirées de `dist/` par le build final. Aucune partie ni statistique utilisateur modifiée ; aucun essai matériel iPhone/Android. Ces observations CUA complètent les tests automatiques sans transformer les 15 intégrations ignorées en succès exécutés.

| Résultat de la nouvelle série | Valeur vérifiée |
| --- | --- |
| Parties terminées | 100 / 100 |
| Victoires IA 1, face A | 50 |
| Victoires IA 2, face B | 50 |
| Égalités | 0 |
| Victoires du premier joueur | **100** |
| Victoires du deuxième joueur | **0** |
| Tours au total | 6 086 |
| Tours moyens par partie | 60,86 |
| Tours minimum / maximum | 55 / 71 |
| Paires complémentaires contrôlées | 50 / 50 |

La face B ne gagne plus systématiquement dans ces conditions : chaque paire possède des vainqueurs opposés sur les deux faces. **L’avantage du premier joueur demeure sur cette série : il remporte les cent parties.** L’équilibre A/B observé correspond au protocole de symétrie des paires et à deux IA identiques ; ces parties appariées ne représentent pas cent essais indépendants et ne garantissent pas un jeu universellement équilibré. Les conditions classiques et les profils historiques constituent des expériences différentes. La recette matérielle iPhone/Android et les performances réelles restent à confirmer.

Contrôle complémentaire classique en `ddc-v1.4`, Difficile / Difficile, deux départs neutres : A commence et gagne en 59 tours ; B commence et gagne en 55 tours. Les compteurs sont A 1 / B 1 et premier joueur 2 / 2. Fichier : `output/simulation-2-difficile-difficile-classique-v1.22.json`. Ce contrôle ne multiplie pas artificiellement ces deux trajectoires déterministes.

Publication v1.22 réussie sur le même lien privé Cascado, au commit `063656665e41e9b7eb015b1f4423cefd3a4df1ca`. Sites a retourné `succeeded` ; identifiants courants dans `output/publication/deployment.json`. Le lien et le QR code restent valables.


## Évolution v1.23 — estimations vidéo et deux séries par face (30 octobre 2026)

Le profil **`ddc-v1.5`** devient celui des nouvelles parties. Les décalages bruts retenus sont **[75°, 90°, 90°, 20°, 15°]**, avec écarts courts signés **[75°, −30°, 90°, 20°, 15°]** : la roue 2 représente une amplitude courte de 30° dans le sens négatif. Ces valeurs sont une estimation autorisée de la vidéo vers **298–299 s** ; elles ne constituent ni une reproduction exacte du jeu filmé ni une garantie d’équivalence entre faces. Les mesures et résultats de l’ancien profil équivalent 1.4 ne sont pas transposables à ce nouveau calage.

Chaque face possède deux entrées locales, **gauche 210°** et **droite 330°**, avec une série de cinq jetons dans chaque file. Les **dix IDs uniques 1 à 10** affichent chacun un numéro de **1 à 5** : les deux séries sont distinguées par couleur et motif rond/losange. Leur ordre de sortie est indépendant ; finir une seule série ne suffit pas et la victoire demande les dix sorties correctes. Une sortie hors ordre dans une série fait perdre son propriétaire. Le réceptacle comporte deux rangées inclinées, chacune avec 1 au point le plus bas ; le plateau logique passe à **360 × 540**. Les animations utilisent les IDs uniques, les files et la rangée de destination, sans collision d’identité entre les deux jetons imprimés 1.

Les parties et séries déjà sauvegardées en **`ddc-v1.4`** et **`ddc-v1.3`** conservent leurs décalages, cinq jetons, une entrée et une rampe par face, sans mouvement ou réévaluation au chargement. Les anciennes versions 1 à 1.2 restent migrées uniquement vers 1.3. La série variée courante rejoue **θ / θ** avec départ alterné ; le complément **θ + δ** reste réservé au profil sauvegardé 1.4. Aucune pose n’est retenue selon son résultat et aucun bilan n’est ajusté pour obtenir 50/50.

Les trois IA utilisent leurs deux séries depuis leur seule projection, avec les mêmes niveaux et budgets. Le seuil commun de **20 unités sur 28**, les gestes au doigt et au clavier, la stabilisation atomique, l’annonce à la frontière normale de tour et le masque restent conservés. Les données, commandes, délais et animations de la face affichée ne révèlent ni jetons ni verdict adverses. Le son reste temporairement coupé.

### Vérifications exécutées pour 1.23

- `npm test` : **453 tests découverts, 438 réussis, 0 échec, 15 ignorés** dans Node (scénarios navigateur PWA/IndexedDB sans émulation). Les nouvelles assertions couvrent les deux entrées sur A et B, la conservation des dix IDs, l’équivalence des chutes entre petits et grands mouvements, les ordres entrelacés, les erreurs par série, la victoire à dix et le maintien du premier verdict. Les régressions des trois profils, le dernier jeton, les départs, IA, workers, simulations, trajectoires et réceptacles passent également.
- `npm run check` : syntaxe des modules et manifest valides. `npm run build` : version statique produite, module `tokens.js` inclus dans le cache hors ligne.
- Contrôle dans le navigateur intégré : surface de **391,5 × 696 pixels (9:16)**, deux entrées, dix IDs uniques et deux glissières. La rotation clavier de la roue 1 vers l’entrée droite charge le jeton interne 6 (numéro imprimé 1 de la série droite), sans retirer le 1 gauche. « Terminer et masquer » retire tous les jetons et roues du DOM ; la face B est révélée seulement après l’unique bouton au prénom. Capture : `output/recette/cascado-v1.23-deux-entrees.png`.
- Simulation locale sans interface : **4 parties Difficile / Difficile, départs variés, graine 69**, toutes terminées par sortie complète des dix jetons. Cette vérification de fonctionnement ne mesure pas l’équilibre des faces. Bilan exact : `output/recette/cascado-v1.23-simulation.json`.
- Relecture indépendante du moteur, des projections privées, du rendu, des trajectoires et de la reprise des anciens profils : aucun défaut bloquant relevé. Une précision dans l’aide explique le maintien des cinq jetons d’une partie ancienne.

Les essais sur de vrais téléphones iPhone et Android, les mesures de performances et l’émulation hors ligne complète restent distincts et à confirmer. La publication est consignée séparément après confirmation de Sites.


## Évolution v1.24 — plateau bord à bord et commandes discrètes (30 octobre 2026)

La surface de jeu occupe désormais tout le viewport disponible, avec un fond de plateau bord à bord et sans cadre de téléphone sur les grands écrans. Le mécanisme est redimensionné uniformément, sans étirement ni recadrage des roues, des files ou des réceptacles. L’en-tête devient compact ; l’aide et les commandes restent discrètes près des bords, hors du mécanisme. Les boutons conservent des cibles tactiles de **44 pixels** et tiennent compte des zones système du téléphone.

Le défilement est verrouillé tant que le plateau ou le passage masqué est affiché, y compris pendant un tour IA et une transition de tour. Ce verrou disparaît avec ces surfaces : accueil, préparation, règles, statistiques et autres écrans de contenu gardent leur défilement normal. Le panneau de vitesse IA conserve son sélecteur natif et sa commande de pause ; sa position suit celle de son emplacement après une mise à jour d’interface ou un changement du viewport.

Cette évolution modifie uniquement la présentation et les libellés compacts. Les gestes circulaires, l’aimantation, le clavier, les délais de protection, les projections privées et l’annonce des résultats restent inchangés. Aucun profil mécanique, angle, jeton, verdict, sauvegarde ou protocole de départ n’est transformé.

### Vérifications exécutées pour 1.24

- `npm run check` et `npm run build` réussis ; **55 tests ciblés réussis, zéro échec**, sur les gestes, les phases masquées, les types de joueurs et la rotation progressive IA. La mécanique n’a pas été modifiée ; la suite de 438 tests de la version précédente n’a pas été relancée pour ce changement de présentation.
- Vérification dans le navigateur intégré, aux dimensions **360 × 640** et **320 × 568** : surface de jeu en (0, 0) et dimensions égales au viewport ; hauteur de document égale à 640 ou 568 ; défilement à zéro après une tentative de déplacement. Zone du mécanisme haute de 518 et 446 pixels respectivement. Deux entrées, dix identités et deux rangées de collecte restent visibles sans déformation.
- Rotation directe de la roue 1 de 45° à 135° au pointeur en 360 × 640 ; clavier sur le petit format ; fin de tour activée sans déplacement de la page. Bouton de fin haut de 44 pixels et bas à y = 634 en 360 × 640.
- Passage masqué en 360 × 640 : document haut de 640 pixels, instruction finissant à y = 464,68 et bouton commençant à y = 517, sans chevauchement. Le petit format a également été observé sans défilement. Les écrans de préparation restent utilisables ; à l’accueil, le corps retrouve sa position normale et une hauteur de contenu de 991 pixels en viewport 640.
- Mode humain–IA : plateau conservé, choix de vitesse Lent accessible et tour automatique constaté, puis pause. Mode duel IA avec plateau : compteur de série, vitesse et pause visibles ; rotation observée sur la face active puis série mise en pause. Capture : `output/recette/cascado-v1.24-plein-ecran.png`.

La vérification a été réalisée dans des cadres de navigateur aux dimensions de téléphone ; elle ne remplace pas un essai sur iPhone ou Android physique. La publication est consignée séparément après confirmation de Sites.


## Évolution v1.25 — renfort du verrou tactile (30 octobre 2026)

Le CSS seul de 1.24 ne suffit pas au geste signalé sur téléphone. Le module `viewport-lock.js` installe des écouteurs de `touchmove` et `wheel` sur la fenêtre, en capture et explicitement non passifs. Il annule uniquement les déplacements annulables lorsque le DOM contient le plateau, le passage, la confirmation ou l’écran paysage. La racine et le corps reçoivent alors `touch-action: none`, en plus du verrou de taille et du rebond. Ce contrôle porte aussi sur le panneau IA situé hors du plateau ; il reste valable si le SVG initial est remplacé pendant le geste. Les contrôles natifs, le zoom clavier/molette et les événements de clic restent préservés ; aucun événement de pointeur n’est arrêté. Les menus retrouvent immédiatement leur comportement normal.

Validation : **23 tests ciblés réussis, zéro échec** (verrou tactile, gestes, phases masquées), syntaxe et manifest vérifiés. Les tests du verrou couvrent les quatre surfaces, la première interception non passive, les changements de surface avant l’observateur, les cibles détachées, les contrôles natifs, les événements non annulables et le nettoyage. Le module est inclus dans le cache PWA.

Contrôle dans le navigateur intégré, cadre 360 × 640 : classe de verrou active sur jeu et passage, `touch-action: none` sur html/body, document de 640 pixels et position de défilement nulle après déplacement vers le bas et molette ; rotation de la roue 1 et fin de tour fonctionnelles. Au retour à l’accueil : classe retirée, `touch-action: auto`, corps en position normale et hauteur de contenu 991 pixels. Capture : `output/recette/cascado-v1.25-verrou-tactile.png`.

Ces essais sur ordinateur ne reproduisent pas un glissement physique sur iPhone/Android. Un déplacement de la fenêtre native entière, notamment un geste de fermeture d’un feuillet de l’application hôte, reste hors du contrôle du document web. La validation sur le téléphone concerné est encore nécessaire.


## Évolution v1.26 — résultats adverses en transparence (30 octobre 2026)

À la demande utilisateur, un petit réceptacle estompé rend publics le prénom, le compteur et les seuls jetons déjà collectés de l’adversaire. Il se place à droite sur A et à gauche sur B, dans l’espace inférieur libre, à 48 % d’opacité. Il conserve les numéros de chaque série et les profils historiques. Ce changement étend volontairement l’information visible aux sorties adverses, sans présenter leurs positions encore en jeu ni lire le verdict.

La projection est distincte de `getView` et ne lit que le profil, le nom, la couleur et une copie de `exited`. Le planificateur IA conserve sa projection habituelle. Le calque utilise `data-opponent-token`, jamais les identifiants de jetons ou de roues utilisés par l’animation ; il est statique, sans événements tactiles, son ou délai ajouté. L’adversaire est déterminé depuis la face affichée, y compris pendant un tour IA en mode mixte. Le masque retire intégralement ce calque avec le plateau.

Validation : **82 tests ciblés réussis, zéro échec** (projection, intégration, trajectoires, passage et verrou tactile), syntaxe et build valides. Les assertions couvrent les trois profils, la copie sans mutation, les getters privés interdits, l’échappement des noms et couleurs, le placement hors collecte propre, les identités, le choix IA inchangé, le mode mixte et la frontière de révélation. Le module est inclus dans le cache PWA.

Vérification dans le navigateur intégré, cadre 360 × 640 et partie locale de démonstration : le plateau de Camille affiche Léa 3/10, avec les IDs collectés 1, 2 et 6 (numéros 1, 2 et 1). Les dix IDs propres et cinq roues restent distincts. Rotation au clavier de la roue 1 acceptée, page toujours à zéro de défilement. Après transmission : zéro jeton propre, jeton adverse ou calque dans le masque. Après révélation de B : Léa possède sa collecte propre et le résumé de Camille 0/10 apparaît à gauche, première place en (24, 493). Capture de l’exemple : `output/recette/cascado-v1.26-resultats-adverses.png`.

Les données de démonstration restent locales à la recette et ne sont pas publiées. Cette vérification de navigateur ne remplace pas un essai sur téléphone physique. Aucune mécanique, IA, donnée durable ou règle d’annonce de fin n’est modifiée.

## Évolution v1.27 — cadre stable en onglet iPhone (30 octobre 2026)

Le signalement concerne un iPhone dans Safari ou Chrome, sans installation du jeu. La version 1.25 annulait le déplacement sur la fenêtre, mais le SVG est remplacé pendant la sélection et la rotation : les Touch Events restent attachés à leur cible d’origine, dont les événements peuvent ne plus remonter à la fenêtre après détachement. La hauteur `100dvh` pouvait aussi suivre les barres du navigateur.

Le nouveau verrou capture une hauteur en pixels, bornée par `100svh` et `innerHeight`, avec une marge technique d’un pixel. La hauteur du clavier iPhone via `visualViewport` n’est pas capturée comme hauteur permanente. Racine, corps et cadre ont des dimensions explicites ; `.play` est absolu dans le cadre fixé. La hauteur est conservée pendant le jeu et les passages ; elle est remesurée sur changement de largeur, orientation et reprise, avec une seconde mesure différée pour laisser l’orientation se stabiliser. Les menus retrouvent leur défilement normal.

Le premier contact sur le fond ou une roue annule le déplacement natif, sans arrêter les Pointer Events qui portent la rotation. Les boutons, liens, labels et contrôles natifs conservent leurs appuis. Des écouteurs non passifs sont attachés à la cible tactile avant le remplacement possible du SVG, dans les deux ordres possibles entre Pointer et Touch Events. Ils sont libérés à la fin, à l’annulation, au déverrouillage ou à la suspension de la page. Un déplacement inattendu de la racine est ramené à zéro pendant le verrou uniquement. Les données de partie et les règles du moteur ne changent pas. Le bas de l’accueil indique « Version 1.27 » pour distinguer une ancienne copie hors ligne.

Validation :

- `node --test tests/viewport-lock.test.js tests/gesture.test.js tests/flow.test.js` : **31 tests réussis, zéro échec**. Couverture des cibles détachées, deux ordres Touch/Pointer, nettoyage, boutons natifs, clavier, barres, rotation tardive, suspension, menus et décalage de défilement initial.
- `npm run check` : syntaxe JavaScript et manifest valides. `npm run build` : sortie statique créée avec nouvelle empreinte de cache.
- Navigateur intégré, cadre **360 × 640** : plateau en (0,0), hauteur **639**, défilement racine **0** après rotation de la roue 1 de 45 à 135° et tentative de remontée. Passage humain opaque, sans jetons propres ni adverses.
- Cadre **320 × 568** : plateau haut de **567**, défilement **0**, cinq roues ; bouton de fin de tour haut de **44**, entre y=517 et y=561.
- Partie humain contre IA sur le code final : sélecteur natif passé de Normal à Lent ; panneau et emplacement alignés exactement en (100,589), taille **76 × 44** ; rotation conservée, pause fonctionnelle. Retour accueil : corps `static`, racine déverrouillée, document haut de **1009**, mention Version 1.27.
- Capture : `output/recette/cascado-v1.27-cadre-fixe.png`.

Limites : ces essais utilisent une souris dans le navigateur intégré, pas un iPhone physique. L’immobilité des barres natives de Safari/Chrome n’est pas contrôlable par la page. WebKit documente un [correctif Safari 26.4](https://webkit.org/blog/17862/webkit-features-for-safari-26-4/) pour les pages qui se déplaçaient malgré `overflow: hidden` ; le [ticket 240859](https://bugs.webkit.org/show_bug.cgi?id=240859) distingue ce comportement des anciennes versions. Le choix d’une hauteur stable suit les [variantes de viewport définies par le W3C](https://www.w3.org/TR/css-values-4/#viewport-variants), et les cibles persistantes suivent les [Touch Events](https://www.w3.org/TR/touch-events/#the-touchmove-event). Aucune installation n’est nécessaire pour ce correctif.

Pour charger la mise à jour tout en gardant la sauvegarde : ouvrir l’accueil en ligne, recharger pour laisser télécharger la nouvelle version, puis fermer tous les onglets/fenêtres Cascado et rouvrir le lien dans le même navigateur. Vérifier « Version 1.27 » en bas de l’accueil. Ne pas effacer les données du site.

## Évolution v1.28 — cran sonore, aimantation et prise élargie (31 octobre 2026)

Les sons sont rétablis à la demande de l’utilisateur. La nouvelle préférence `ddc-sound-v2` démarre activée, puis conserve le choix fait avec le bouton haut-parleur. Le déplacement d’une roue utilise le clic Kenney existant avec un gain de 0,35 ; l’arrivée sur un alignement aimanté utilise le même clip avec un gain de 1 et une vitesse de lecture de 0,82. Ce fichier est téléchargé et décodé une seule fois. Le cran suit la même arrivée acceptée que le halo et la vibration : intervalle minimal de 140 ms, aucun rejeu pour le tremblement dans le champ, au maintien, au relâchement ou après le masque. Les sons de chute et de glissement concernent toujours uniquement les jetons affichés. Full et les simulations sans plateau conservent leur silence. Le cran peut remplacer une voix de rotation ancienne lorsque la limite de cinq voix est atteinte.

L’aimantation porte désormais jusqu’à 5° au lieu de 3°, avec une assise exacte de demi-largeur maximale 1° au lieu de 0,5°. Près de voisins proches, les champs restent limités à leur demi-écart et l’assise au quart du rayon du champ. La correction maximale est d’environ 1,412°, inférieure à 1,5°. Les raccords et la trajectoire restent continus et monotones ; le geste peut ressortir de l’alignement dans les deux sens. Aucun mouvement au contact ni recalage au relâchement n’est ajouté. Les angles des crans et le seuil de passage 20/28 du moteur ne changent pas. Le halo est légèrement renforcé, sans nouvelle animation.

Le début d’un glisser accepte une marge de 16 pixels CSS autour du bord des roues. Les cinq cercles sont mesurés dans les coordonnées réelles de l’écran avec la transformation SVG. Un disque réel sous le doigt prime sur la marge d’une voisine ; dans les marges, le bord le plus proche est choisi. Les roues interdites participent à cette résolution et sont ensuite refusées normalement. Seul le début du geste utilise cette zone : la capture permet de continuer librement plus loin sans changer de roue. Les commandes son et pause sont exclues du ciblage. L’en-tête est ajusté pour garder le nom, le compteur et deux boutons de 44 pixels sans chevauchement.

Validation :

- `npm test` : **517 tests, 502 réussis, zéro échec, 15 ignorés** (intégrations qui nécessitent un navigateur/IndexedDB). Parmi eux : 22 tests d’aimantation sur trois profils, 15 tests de ciblage, 11 tests audio et 8 tests de retour d’alignement.
- `npm run check` et `npm run build` réussis. Le nouveau module `wheel-hit.js` est inclus dans le cache hors ligne et la compilation produit une nouvelle empreinte.
- Navigateur intégré, cadre 360 × 640 : départ du geste environ 12 pixels à gauche du bord de la roue 1 ; roue engagée et rotation de 45° à 135°. Une instrumentation locale temporaire conserve le vrai contexte Web Audio et constate le démarrage de deux sons de mouvement et d’un cran, avec contexte `running`. La racine reste à zéro de défilement et le cadre haut de 639 pixels.
- Bouton son coupé puis nouvelle rotation de 135° à 225° : aucun nouveau démarrage audio. Geste commencé environ 22 pixels hors de la roue : angle inchangé à 225°. Réactivation puis rotation : les sons et crans reprennent sans rejouer les événements silencieux.
- Passage au format 320 × 568 : masque sans roue, jeton propre ou jeton adverse, cadre haut de 567 pixels. En-tête : nom x=12 largeur70, progression x=94 largeur126, son x=224 largeur44 et pause x=270 largeur44 ; aucun chevauchement. Sur la face B, départ environ 12 pixels à gauche de la roue 2 : roue engagée, rotation locale à 150° et nouveau cran observé ; défilement toujours à zéro.
- Capture de contrôle : `output/recette/cascado-v1.28-prise-cran.png`. Les pages de contrôle et l’instrumentation sont retirées avant publication.

Limites : la vérification dans le navigateur utilise une souris. Les démarrages Web Audio ont été observés, mais la qualité sonore et la sensation tactile sur un iPhone physique restent à confirmer. La vibration reste facultative selon le navigateur. La version visible en bas de l’accueil est **1.28**.

## Évolution v1.32 — clic réservé au passage réellement ouvert (31 octobre 2026)

Le clic net, le halo et la vibration ne suivent plus les arrêts fixes du magnétisme. Un détecteur distinct utilise uniquement les angles de la face autorisée pour reconnaître une ouverture commune d’au moins 20 unités sur 28 entre deux roues. Une encoche seule devant un conduit, les entrées et la sortie ne déclenchent plus ce signal. Les fenêtres de passage sont calculées analytiquement depuis les bouches de la roue voisine ; le mouvement réellement appliqué est suivi sans dépendre des images, y compris les inversions et les tours complets. Le contact sur un passage déjà ouvert reste silencieux et une hystérésis de 0,2° évite les répétitions par tremblement. L’occupation et les jetons ne participent pas au calcul ; moteur, tolérance de passage et aimantation restent inchangés.

La rotation utilise désormais un frottement distinct : portion 110–220 ms de `slide.wav`, filtre passe-bas 1 600 Hz, gain 0,60 avant le volume général, attaque 12 ms et sortie 28 ms. Le clic de passage conserve `wheel.wav`, gain 1 et vitesse 0,82. Les roues des deux joueurs et les chutes adverses restent audibles ; Full, simulations sans plateau, masque et interruptions gardent leur comportement. Aucun asset, service distant ou préférence supplémentaire n’est ajouté.

Validation :

- Suite complète : **579 tests, 564 réussis, zéro échec, 15 ignorés** car les intégrations navigateur/IndexedDB optionnelles ne sont pas activées dans cette commande.
- Suite ciblée : **76 réussis, aucun échec ou ignoré**, comprenant 15 tests du nouveau détecteur, 23 de routage réel de l’application, 20 audio, 8 de retour visuel et 10 de chutes adverses.
- Les tests de routage exécutent en Node les fonctions et gestionnaires de pointeur réels d’`app.js`, avec le moteur, les gestes et le magnétisme réels. Ils vérifient la création et la transmission du détecteur, le signe sur B, les gestes coalescés, les reprises, les annulations, le clavier et les tours IA mixtes. Les détails adverses restent exclus de l’animation.
- Recette dans le navigateur intégré, cadre **414 × 715**, avec fixtures sur origine locale isolée et comptage des vrais démarrages Web Audio : sur A puis B, le même arc de roue 2 produit **zéro clic net et un frottement** lorsque la roue 1 voisine est fermée ; avec la bouche voisine préparée, il produit **un clic net et un frottement** lors de la traversée. L’angle suit le sens du doigt sur les deux faces. Aucune erreur ou alerte de console constatée.
- Capture locale : `output/recette/cascado-v1.32-clic-passage.png`. La page instrumentée est temporaire et retirée du build avant publication ; ses données n’entrent pas dans le dépôt.

La recette confirme les événements audio réels du navigateur sur ordinateur. Elle ne remplace pas une écoute sur le haut-parleur d’un iPhone physique ; le volume et le ressenti tactile restent à apprécier sur cet appareil. La version visible à l’accueil est **1.32**.
