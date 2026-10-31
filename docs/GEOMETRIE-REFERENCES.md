# Dix de chute — Dossier de géométrie

Recherche documentaire du 28 octobre 2026 · Historique des sources des [spécifications de la PWA](SPECIFICATIONS-PWA.md)

**Décision ultérieure de l’utilisateur : une géométrie cohérente suffit, sans reproduction au millimètre.** La référence normative est désormais la [géométrie V1, ddc-v1](GEOMETRIE-V1.md). Les réserves et le protocole de relevé ci-dessous documentent la recherche initiale d’exactitude ; ils ne sont plus des préalables à la PWA.

## 1. Résultat de la recherche

**Un plan primaire avec les deux faces et des angles cotés a été retrouvé. Un relevé complet et coté du moule MB 1994 n’a pas été trouvé dans les sources consultées.**

Le dossier distingue trois objets : le dispositif dessiné dans le brevet de 1971, l’édition MB visée par la notice de 1994 et un exemplaire photographié annoncé comme datant de 1996. Leur parenté ne permet pas de supposer l’identité de toutes leurs dimensions.

Les valeurs ci-dessous documentent donc des références précises. Elles doivent être distinguées des choix numériques explicites du gabarit ddc-v1. Aucun moteur, projet applicatif ou modèle géométrique exécutable n’est créé.

## 2. Plan primaire retrouvé : brevet US3592471A

Le [brevet « Gravity projector game device »](https://patents.google.com/patent/US3592471A/en), publié en 1971 pour Western Publishing, présente en **page 2, figure 1**, les cavités avant en traits pleins et celles de l’arrière en pointillés, projetées dans le même repère.

| Numéro de roue retenu dans le dossier | Repère du brevet | Encoches par face, comptées sur la figure | Décalage coté entre les faces |
| --- | --- | --- | --- |
| 1 | 5 | 1 | 90° |
| 2 | 10 | 3 | 36° |
| 3 | 11 | 2 | 45° |
| 4 | 12 | 4 | 45° |
| 5 | 13 | 5 | 36° |

**Portée : valeurs du dessin breveté, pas valeurs certifiées du moule 1994.** Ces cotes ne donnent ni un zéro de départ MB, ni toutes les dimensions des encoches. La formule textuelle de croissance progressive des cavités ne correspond pas à l’ordre visuel du dessin : le comptage ci-dessus provient de la figure.

Lecture visuelle des voisinages pour la recherche historique : **1–2, 2–3, 2–4, 3–4, 3–5, 4–5**. Le passage 3–4 apparaît entre les deux îlots triangulaires ; cette liste est une interprétation de la figure. Le gabarit numérique ddc-v1 retient explicitement ces six liaisons.

Les angles du tableau sont des amplitudes cotées : ils ne doivent pas être transformés directement en décalages signés ou en angles de départ.

PDF original conservé (archive locale non incluse : `docs/references/US3592471A-1971.pdf`) · [PDF en ligne](https://patentimages.storage.googleapis.com/0b/33/76/f1a751785f6e20/US3592471.pdf)

Plan original du brevet : figure 1 et vues de coupe (archive locale non incluse : `docs/references/US3592471A-figure-1-8.png`)

## 3. Référence photographique des deux faces

Une [annonce de La Roue du Passé](https://larouedupasse.com/products/jeu-de-societe-vintage-dix-de-chute-mb-jeux-de-1996) présente les deux faces d’un exemplaire annoncé **MB 1996** :

- [Face avec jetons verts et jaunes](https://larouedupasse.com/cdn/shop/products/IMG_5130_90243eee-ab4f-4804-91ec-47b71657db94_1024x1024.jpg?v=1659950427).
- [Face avec jetons rouges et orange](https://larouedupasse.com/cdn/shop/products/IMG_5141_56ef4295-4a7b-485c-832c-edb10186b37f_1024x1024.jpg?v=1659950427).

Les cinq roues numérotées et les repères sont visibles. On compte également **1, 3, 2, 4 et 5 encoches**. Les centres sont disposés en miroir. Les roues 1 et 3 paraissent de diamètre similaire ; il ne faut donc pas imposer une croissance de rayon par numéro.

Ces photos permettent une comparaison visuelle, pas une métrologie exacte : perspective, absence d’échelle, relief des pièces et position des roues entre les prises non documentée. Une différence angulaire apparente entre les photos ne prouve pas le calage mécanique de deux demi-roues.

Les six voisinages proposés par le brevet paraissent compatibles avec ces vues, y compris le passage 3–4 ; son fonctionnement effectif reste à vérifier. Aucun élément de l’annonce ne démontre que le moule 1996 est identique au moule 1994.

### Photo fournie par l’utilisateur

La photo fournie dans la conversation (archive locale non incluse : `docs/references/plateau-face-fournie-2026-10-28.png`), de **458 × 627 pixels**, est conservée sans modification. Elle montre une seule face, avec des jetons engagés dans plusieurs roues ; ni l’édition ni une position neutre ne sont attestées.

Le comptage visuel est compatible avec 1/3/2/4/5 encoches. Les jetons et les poignées masquent cependant une partie des profils. Cette vue améliore la référence de disposition ; elle ne permet pas de connaître le profil opposé ni son calage.

Un relevé indicatif des **contours blancs visibles** a été effectué sur l’image originale, sans correction de perspective. Les arcs peu saturés ont été ajustés à des cercles ; les valeurs sont arrondies au pixel. L’origine est le coin supérieur gauche de l’image.

| Roue visible | Centre du contour x, en pixels | Centre du contour y, en pixels | Rayon apparent, en pixels |
| --- | --- | --- | --- |
| 1 | ≈ 230 | ≈ 151 | ≈ 47 |
| 2 | ≈ 287 | ≈ 252 | ≈ 57 |
| 3 | ≈ 196 | ≈ 320 | ≈ 46 |
| 4 | ≈ 298 | ≈ 383 | ≈ 64 |
| 5 | ≈ 165 | ≈ 443 | ≈ 72 |

**Ce tableau mesure une image, pas le jeu physique.** Le centre d’un contour projeté ne certifie pas la position réelle de l’axe. Les poignées en relief, la perspective et les portions masquées interdisent de traiter ces rayons comme des cotes mécaniques. Ces valeurs servent à localiser les éléments de la référence visuelle et ne remplacent pas le gabarit validé.

Pour exploiter une seconde photo comme relevé du calage, il faudra la prendre sur le même exemplaire **sans modifier les rotations des roues**, avec une orientation conservée et des repères communs identifiables. Une vue accompagnée d’une règle dans le plan du cadre, puis des détails des roues démontées en conservant leur appairage, permettraient de réduire les autres inconnues.

## 4. Autres références et limites

| Source | Apport vérifiable | Décision documentaire |
| --- | --- | --- |
| [Notice MB 1994](https://ludosierre.ch/zwook/liens/catalogue/0268/texte_fck/image/dixdechute_0001.pdf) | Assemblage des paires, repères de départ et origine Western Publishing mentionnée en dernière page | Référence de règles conservée ; pas de cotes d’usinage ni de plan complet des dix profils |
| [Math-École n° 152, mars 1992](https://revue-mathematiques.ch/application/files/2214/6288/8331/Mathecole_152.pdf), p. 39 imprimée / p. 41 du PDF | Schémas d’un problème de Michel Chastellain : cinq roues, 1/3/2/4/5 logements visibles, positions successives | Recoupement historique ; dessin pédagogique, une face seulement et pas d’échelle métrologique |
| [Nacelle, Downfall the game](https://cults3d.com/en/3d-model/game/downfall-the-game) | Modèle complet dont l’auteur dit qu’il est construit d’après photos et que le calage correct lui est inconnu | Ne pas utiliser comme relevé exact ; les connecteurs proposent justement des alignements variables |
| [rodrigocnc, Downfall Board Game](https://cults3d.com/en/3d-model/game/downfall-board-game-rodrigocnc-2) | Fiche d’un modèle comprenant dix demi-roues et des panneaux | Aucune édition ni méthode de mesure annoncée ; fichiers non acquis, fidélité non démontrée |
| [Rémi Morin, jetons de remplacement](https://cults3d.com/fr/mod%C3%A8le-3d/jeu/pions-du-jeu-dix-de-chute) | Dimensions annoncées des STL : 15 × 15 × 5 mm | Dimensions d’une pièce de remplacement, sans certification du jeton MB 1994 ; pas une échelle de référence à imposer |

Une table d’angles circule également dans d’anciens miroirs de Wikipédia. Le [miroir de-academic, section « Räder »](https://de-academic.com/dic.nsf/dewiki/1297123/), précise que sa description concerne la **version compacte MB**, la cinquième roue à gauche et des angles positifs antihoraires vus depuis l’avant. Elle ne fournit pas de relevé primaire des pièces du grand modèle bleu. L’[historique de l’article Slotter, modification du 18 janvier 2015](https://de.wikipedia.org/w/index.php?title=Slotter&diff=137923213&oldid=133900348), signale la suppression de ces angles faute de source. Ils ne sont pas repris comme données du projet.

Les réinterprétations imprimables, modèles de poche et simulations non officielles ne prouvent pas davantage les dimensions d’origine. Un fichier très précis numériquement peut rester une approximation du jeu physique.

### Recherche complémentaire du 30 octobre 2026 : demi-roues physiques démontées

Trois annonces du vendeur Twisted Tulip Vintage montrent des paires de demi-roues présentées comme des **pièces OEM retirées d’un Downfall MB de 1979**, et non des impressions 3D. Cette provenance est la déclaration du vendeur ; elle ne certifie ni le millésime du moule ni son identité avec l’exemplaire bleu annoncé de 1996.

| Paire annoncée | Source et photographie détaillée | Capture de consultation conservée |
| --- | --- | --- |
| Roue 1 | [Annonce 137226641788](https://www.ebay.com/itm/137226641788) · [Photo des deux faces extérieures](https://i.ebayimg.com/images/g/fw0AAeSwe1Np3p84/s-l1600.webp) | Capture roue 1 (archive locale non incluse : `output/recherche-calage-mb/roue-1-oem-1979-detail.png`) |
| Roue 2 | [Annonce 137226642160](https://www.ebay.com/itm/137226642160) · [Photo des deux faces extérieures](https://i.ebayimg.com/images/g/VJwAAeSwYudp3p84/s-l1600.webp) | Capture roue 2 (archive locale non incluse : `output/recherche-calage-mb/roue-2-oem-1979-detail.png`) |
| Roue 5 | [Annonce 137226642476](https://www.ebay.com/itm/137226642476) · [Photo des deux faces extérieures](https://i.ebayimg.com/images/g/dEkAAeSwjCJp3p83/s-l1600.webp) | Capture roue 5 (archive locale non incluse : `output/recherche-calage-mb/roue-5-oem-1979-detail.png`) |

Les originaux affichés mesurent 1600 × 1200 pixels ; les captures montrent leur présentation dans le navigateur. Les chevrons moulés et les encoches sont visibles. Contrairement à deux photos d’un plateau en partie, ces vues permettent d’étudier **l’angle entre le chevron et une encoche sur chaque demi-roue**, indépendamment de l’orientation donnée à la pièce pour la photographie.

Sur la roue 1, une lecture du contour extérieur, avec correction indicative de son ellipse projetée, donne environ **141° et 143° dans le sens horaire du chevron vers l’encoche**. Le moyeu en relief ne doit pas servir de centre de mesure. Si les deux repères de cadre correspondent à une même direction physique, la conversion miroir donnerait environ `−(141 + 143) mod 360 = 76°`, soit une valeur **compatible avec 75°**. Ce résultat reste une estimation photographique conditionnelle, pas une cote constructeur ni un calage vérifié après assemblage. Il ne suffit pas pour attribuer 75° à la roue 1 du modèle MB 1994/1996.

Les roues 3 et 4 n’ont pas été retrouvées sous une forme démontée et appairée exploitable. La boutique consultée ne présentait que les roues 1, 2 et 5 ainsi que des pièces du haut du cadre ; la consultation des annonces vendues demandait une connexion. Les deux autres lots de pièces examinés ne fournissaient pas ces demi-roues. Aucun achat, contact vendeur ou accès à un compte n’a été effectué.

**État après cette recherche : de nouvelles preuves photographiques matérielles existent, mais aucun tableau complet de cinq décalages MB vérifiés n’est établi.** Les valeurs du brevet, celles de la version compacte non sourcées et les estimations des pièces annoncées de 1979 restent séparées. Aucun paramètre applicatif, sauvegarde ou site publié n’a été modifié à partir de cette recherche.

### Reconstitution ultérieure par les dix flèches : exemplaire annoncé MB 1977

Une nouvelle [galerie de Ma petite chine vintage](https://www.mapetitechinevintage.be/shop/jeu-dix-de-chute-mb-1977-38) fournit les deux faces du même article avec **les dix chevrons mobiles lisibles**, y compris ceux des roues 3 et 4. Les photos 11672 et 11673 permettent donc une reconstitution indicative complète des départs : on corrige chaque roue de la rotation nécessaire pour aligner son chevron sur celui du cadre, puis on applique le miroir pour comparer les faces. L’immobilité des roues entre les deux prises n’est pas nécessaire à cette méthode ; l’identification du même exemplaire et son assemblage correct restent nécessaires.

La note de reconstitution (archive locale non incluse : `output/recherche-calage-mb/RECONSTITUTION-MB1977-FLECHES.md`) conserve les sources, captures, coordonnées, conventions et limites. Les écarts photographiques les plus courts entre familles d’encoches sont **environ 82°, 23°, 89°, 19° et 17°**, avec des marges visuelles de l’ordre de **10° à 14°**. Il ne s’agit pas de cotes constructeur. La roue 1 ne départage pas sûrement 75° et 90° ; les angles nominaux ne doivent pas être déduits par arrondi arbitraire.

Ce relevé concerne exclusivement l’exemplaire **annoncé de 1977**. Il ne certifie pas le moule 1994/1996 et ne fusionne pas les demi-roues annoncées de 1979. Le schéma des départs (archive locale non incluse : `output/recherche-calage-mb/departs-decalages-mb1977.png`) représente les axes des encoches, pas leur profil exact ni un nouveau gabarit applicatif. Aucun paramètre de Cascado n’a été modifié.

**Réserve sur le recalage : les deux poses aux flèches alignées ont été calculées, pas observées comme un état mécanique commun vérifié.** La méthode exige que les repères de chaque face définissent effectivement le même état d'une paire correctement montée. Les marges de lecture de 10–14° ne couvrent pas une erreur de cette hypothèse. La comparaison entre petites fentes et trous adverses est donc conditionnelle ; ses écarts ne constituent pas une réfutation de leur éventuel rôle de repères. Deux vues d'un montage conservé dans une même pose immobilisée permettraient une comparaison par miroir sans ce recalage.

## 5. État des paramètres nécessaires à la PWA

| Paramètre | Ce que la recherche apporte | Statut pour MB 1994 |
| --- | --- | --- |
| Nombre d’axes | Cinq dans la notice de référence | Établi |
| Solidarité des deux faces | Paires de roues de même numéro assemblées sur le même axe | Établi |
| Nombre d’encoches | 1/3/2/4/5 recoupé sur dessin ancien et photos 1996 | Candidat fortement documenté, à rapprocher du même exemplaire 1994 |
| Décalages entre demi-roues | Cotes du brevet disponibles | Correspondance avec le moule 1994 non établie |
| Position et rayon de chaque roue | Contours de la photo fournie localisés en pixels ; autres vues comparatives disponibles | Pas de coordonnées physiques ni de rapports cotés vérifiés |
| Profil de chaque encoche | Silhouettes visibles | Largeur, profondeur, fond et raccords exacts non établis |
| Glissières et passages | Architecture observable et voisinages candidats | Largeurs, seuils et angles de transfert non établis |
| Jetons | Un modèle de remplacement dimensionné existe | Diamètre, épaisseur et jeux d’origine non vérifiés |
| Position neutre | Alignement des flèches prescrit | Angles des cavités par rapport aux flèches non relevés pour les dix demi-roues |
| Épaisseur et jeu latéral | Principe visible dans les coupes | Valeurs du moule cible inconnues |

**Conclusion de la recherche historique : les sources ne clôturent pas la géométrie exacte MB 1994.** Le choix de l’utilisateur permet de lever cette contrainte : ddc-v1 fixe désormais les valeurs manquantes comme décisions de conception, sans les attribuer à une mesure d’origine.

## 6. Convention de relevé historique et de représentation

Cette convention décrit le relevé exact initialement envisagé. Les règles de miroir restent pertinentes ; les conventions et paramètres applicables à la PWA sont fixés par ddc-v1.

- Un seul jeu physique identifié fournit toutes les mesures d’un gabarit. Les photos de versions différentes restent des références séparées.
- La face A est nommée de façon permanente ; la face B est son opposée. Les numéros des axes restent 1 à 5 sur les deux faces.
- Le repère de chaque vue joueur a son origine en haut à gauche, l’axe horizontal vers la droite et l’axe vertical vers le bas. Pour les orientations des rayons, **0° pointe vers la droite (+x)** ; les angles sont positifs dans le sens horaire et exprimés en degrés.
- La position mécanique neutre correspond à l’alignement des repères prescrits par la notice. Elle définit l’angle physique de référence de chaque paire.
- Les angles d’encoches des deux faces sont relevés après cette mise au neutre ; le décalage n’est pas calculé à partir de deux photos prises dans des positions quelconques.
- Les pointillés du brevet montrent l’arrière projeté sur l’avant. Ils ne sont pas une vue de joueur arrière prête à afficher.

Pour une largeur de cadre W, le changement de vue d’un même point physique est **xB = W − xA** et **yB = yA**. Un rayon d’angle φ dans le repère avant devient un rayon d’angle **180° − φ**, modulo 360°, dans le repère arrière. Une rotation physique positive du côté A apparaît donc négative du côté B. Les profils propres de chaque face restent distincts.

Les dimensions pourront ensuite être normalisées, par exemple en fixant le diamètre vérifié du jeton à une unité. Une normalisation change l’échelle, jamais les rapports mesurés, les jeux ni les angles. Elle ne transforme pas une estimation photographique en mesure exacte.

## 7. Protocole de relevé exact conservé à titre documentaire

Ce protocole serait utile pour une reproduction métrique ultérieure. **Il n’est pas requis pour la V1.** Une référence physique ou un plan constructeur complet permettrait les opérations suivantes :

1. Identifier l’édition par la boîte, la notice, les références moulées et les numéros des pièces. Conserver ces éléments avec le relevé.
2. Aligner toutes les flèches, puis immobiliser les paires avant toute prise de vue des deux faces. Inclure un repère d’échelle dans le plan du cadre, pas devant les poignées.
3. Relever les centres, rayons et connexions du cadre. Les vues doivent être orthogonales ou corrigées à partir de repères coplanaires connus.
4. Photographier les dix demi-roues à plat, en conservant leur identification et leur orientation de montage. Documenter le détrompage et le calage de chaque paire.
5. Mesurer au moins diamètre et épaisseur des jetons, largeurs et profondeurs des logements, fonds d’encoches, jeux latéraux et seuils de passage. Indiquer l’instrument et l’incertitude de mesure.
6. Vérifier chaque liaison candidate avec un jeton, y compris 3–4. Noter les orientations des deux roues à l’entrée et à la sortie du transfert.
7. Vérifier que les angles neutres et le changement de face reproduisent les deux photographies de référence du même exemplaire sans recalage arbitraire.

Un futur relevé métrique serait considéré complet lorsque toutes les données mécaniquement utiles des deux faces seraient renseignées, avec provenance et tolérance, et que les transferts auraient été vérifiés. Ce critère ne s’applique pas au gabarit numérique ddc-v1, dont les paramètres sont des choix de conception documentés.

## 8. Provenance des fichiers conservés

Le PDF du brevet est conservé sans modification. L’image est le rendu de sa page de dessins ; elle sert à relire les cotes, pas à les inventer par mesure des pixels.

| Fichier | Empreinte SHA-256 |
| --- | --- |
| Brevet original (archive locale non incluse : `docs/references/US3592471A-1971.pdf`) | `5e08d5f08abac6cd21f353c1e3f81f1d1f76ff7efbf4bbafaeba7f4e6e94984b` |
| Rendu de la page de dessins (archive locale non incluse : `docs/references/US3592471A-figure-1-8.png`) | `3875f0df2b9ed25e70c0efeac7709e38197c7f79007e9bb9dcc7c5f1dfb672a1` |
| Photo fournie par l’utilisateur (archive locale non incluse : `docs/references/plateau-face-fournie-2026-10-28.png`) | `9e2e1b5e66361946d4703d7b9fb2be60ae314c70e2b7eebbc50b0caa153749fb` |

Les photos de l’annonce et l’article pédagogique ont été consultés pour comparaison. Leurs liens d’origine sont fournis ci-dessus. Aucun modèle tiers n’a été intégré au jeu et aucune estimation sur image n’a été promue en cote physique vérifiée.
