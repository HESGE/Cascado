# Départ reconstitué à partir des repères du jeu original

Cascado 1.36 · Référence de départ : `original-v1` · Géométrie conservée : `ddc-v1.5`

Le départ proposé dans l’interface sous **« Repères d’origine — estimés »** reproduit approximativement les orientations obtenues en alignant les flèches des roues avec celles du cadre. Il s’agit d’une reconstitution photographique, avec une réserve de lecture d’environ **10 à 14°**, et non d’un relevé constructeur exact. Ce départ ne garantit pas l’équilibre des faces.

## Ce que prescrit la notice

La [notice MB 1994, page 3 du PDF](https://ludosierre.ch/zwook/liens/catalogue/0268/texte_fck/image/dixdechute_0001.pdf) demande d’aligner les flèches du cadre et des deux demi-roues pendant leur assemblage. La préparation d’une partie demande de nouveau cet alignement pour les cinq roues. Les flèches constituent donc une référence de départ explicite ; une pose quelconque observée sur une photo ou dans une vidéo ne remplace pas cette référence.

## Sources des orientations

Les orientations retenues proviennent des deux faces du même exemplaire proposé comme **MB 1977** par [Ma petite chine vintage](https://www.mapetitechinevintage.be/shop/jeu-dix-de-chute-mb-1977-38) : [face A, photo 11672](https://www.mapetitechinevintage.be/web/image/product.image/11672/image_1920/Jeu%20Dix%20de%20chute%20-%20MB%201977?unique=d934fdb) et [face B, photo 11673](https://www.mapetitechinevintage.be/web/image/product.image/11673/image_1920/Jeu%20Dix%20de%20chute%20-%20MB%201977?unique=d934fdb). Le millésime est celui de l’annonce ; il ne certifie pas la date du moule.

Chaque roue photographiée est corrigée de la rotation qui ramènerait son chevron mobile sur celui du cadre. La méthode suppose que les marques identifiées sont les repères correspondants et que les demi-roues sont correctement assemblées. Les poses aux repères alignés sont calculées : elles ne sont pas directement observées comme un même état mécanique vérifié sur les deux faces. La perspective, le relief et le pointage manuel limitent aussi la précision. Les espacements réguliers des ouvertures sont conservés dans la reconstitution.

La [vidéo « Downfall 1985 » de What’s Jamie Up To?, vers 4 min 58 s](https://www.youtube.com/watch?v=ZAwCaRSu-F8&t=298s) a servi à estimer les décalages entre les faces déjà employés par `ddc-v1.5`. Les vues successives y montrent une pose filmée, sans remise à zéro aux flèches démontrée. Cette pose n’est pas utilisée comme départ d’origine. Les exemplaires annoncés de 1977 et de 1985 restent des références distinctes : leur combinaison fournit une approximation de conception, pas la certification d’un modèle commercial précis.

## Angles mémorisés pour `original-v1`

Le moteur exprime les angles en degrés horaires, avec **0° vers la droite**. Les cinq angles physiques initiaux sont figés pour cette référence :

```text
[348, 22, 116, 8, 31]
```

Ils représentent les orientations d’ouvertures correspondant aux petites rotations **[−12°, +22°, −64°, +8°, +31°]** depuis l’ancien neutre numérique. Pour la roue 3, +116° et −64° donnent les mêmes ouvertures parce que son profil se répète tous les 180° ; ils ne désignent pas le même angle brut modulo 360°.

Les paramètres de décalage entre les faces restent **[75°, 90°, 90°, 20°, 15°]**. Seul le départ change : ni les profils, ni les décalages, ni les seuils de passage ne sont ajustés pour rapprocher les résultats d’un partage 50/50. La référence `original-v1` doit conserver ces angles ; une éventuelle reconstitution ultérieure recevra une autre référence.

## Ouvertures au départ

Pour la lecture des tableaux, **0° est en haut, 90° à droite, 180° en bas et 270° à gauche**, dans le sens horaire. Chaque face est vue par son propre joueur. Les valeurs sont les axes des ouvertures, pas leurs bords.

| Roue | Face A : axes approximatifs retenus |
| --- | --- |
| 1 | 123° |
| 2 | 22°, 142°, 262° |
| 3 | 71°, 251° |
| 4 | 8°, 98°, 188°, 278° |
| 5 | 49°, 121°, 193°, 265°, 337° |

La face B résulte du miroir et des décalages actuels de Cascado. Elle n’est pas réglée indépendamment de A : les deux demi-roues d’une paire partagent un seul angle physique.

| Roue | Face B calculée par Cascado | Face B reconstituée d’après les photos |
| --- | --- | --- |
| 1 | 162° | ≈155° |
| 2 | 8°, 128°, 248° | ≈1°, 121°, 241° |
| 3 | 19°, 199° | ≈21°, 201° |
| 4 | 62°, 152°, 242°, 332° | ≈63°, 153°, 243°, 333° |
| 5 | 8°, 80°, 152°, 224°, 296° | ≈6°, 78°, 150°, 222°, 294° |

Les écarts entre la face B calculée et le relevé sont inférieurs aux réserves de lecture des photos. Cela justifie l’approximation proposée, sans démontrer une correspondance exacte avec cet exemplaire ni avec toutes les éditions du jeu original.

Les positions et décalages du modèle numérique restent décrits dans la [géométrie V1](GEOMETRIE-V1.md). L’effet de ce départ sur les résultats doit être mesuré séparément, avec le mode de départ et les niveaux d’IA indiqués.
