# Cascado — Sons libres du jeu

**Version 1.31 · 31 octobre 2026 : cadence et chutes adverses.** Les petits clics de rotation sont espacés d’au moins **150 ms** (contre 72 ms auparavant), avec le même intervalle laissé après un clic d’alignement fort. L’alignement reste sonore uniquement sur la face du joueur qui manipule la roue. Les nouvelles chutes adverses, y compris internes, déclenchent désormais un bruit générique sur le plateau affiché. Une cascade simultanée produit un seul signal, sans file d’attente ni détail de jeton, de roue, de position ou de verdict communiqué au rendu. Cette présence sonore est un indice adverse demandé explicitement ; les trajectoires privées restent exclues des animations et ne modifient pas la durée des tours IA.

**Version 1.30 · 31 octobre 2026 : activation iPhone renforcée.** Le son reprend aussi après un contexte Safari `interrupted`, et un contexte fermé est recréé au prochain geste. Les clips manquants sont retentés sans recharger ceux qui sont déjà prêts. Le relâchement du doigt réessaie l’activation ; le masque continue d’arrêter les sons immédiatement. La réactivation du haut-parleur émet un bref clic de confirmation, abandonné si une interruption survient pendant son chargement.

Lorsqu’elle est prise en charge, la session audio `playback` permet d’utiliser le volume multimédia sur iPhone. Le type de session précédent est rétabli au passage sous masque et à la mise en sourdine. L’API reste facultative : si elle est absente ou refuse l’opération, Web Audio reste disponible avec les règles du navigateur. Sur les anciens iOS, il peut être nécessaire de désactiver le mode silencieux. Comportement documenté par [WebKit](https://bugs.webkit.org/show_bug.cgi?id=237322).

**Version 1.28 · 31 octobre 2026 : les sons sont rétablis**, avec un bouton haut-parleur et un clic net lorsque le glisser atteint un alignement aimanté. La préférence `ddc-sound-v2` démarre avec le son activé, puis conserve le choix du joueur. Cette version remplace la mise en sourdine globale du 29 octobre.

Les trois sons sont des enregistrements de **Kenney**, publiés sous **Creative Commons Zero 1.0 Universal (CC0)**. L’utilisation, la modification et la redistribution, y compris dans un jeu commercial, sont autorisées. L’attribution n’est pas obligatoire ; le crédit « Sons : Kenney » est conservé ici.

| Fichier livré | Usage | Enregistrement d’origine | Pack |
| --- | --- | --- | --- |
| `assets/audio/wheel.wav` | Mouvement de roue et clic distinct du cran aimanté | `Audio/tick_001.ogg` | Interface Sounds 1.0 |
| `assets/audio/slide.wav` | Frottement et mouvement d’un jeton visible | `Audio/chips-handle-4.ogg` | Casino Audio 1.1 |
| `assets/audio/drop.wav` | Contact d’un jeton à l’arrivée | `Audio/chip-lay-1.ogg` | Casino Audio 1.1 |

Les originaux OGG ont été convertis en WAV PCM 16 bits, mono, 44,1 kHz pour être décodés dans Safari et Chrome. Les WAV sont hébergés avec le jeu : aucun service sonore distant, aucun compte et aucune télémétrie. Les documents de licence originaux accompagnent les sons dans `assets/audio/LICENSE-interface.txt` et `assets/audio/LICENSE-casino.txt`.

Le mouvement de roue et le cran réutilisent le même fichier et le même tampon audio : il n’est téléchargé et décodé qu’une fois. Avant le volume général, le mouvement utilise un gain de **0,35** ; le cran utilise un gain de **1** et une vitesse de lecture de **0,82** pour être mieux distinct. Le cran suit la même arrivée géométrique que le halo de **300 ms** et la vibration facultative de **12 ms**, avec un intervalle minimal commun de **140 ms**. Un alignement ne se signale pas de nouveau avant la sortie de son champ ; l’immobilité et le relâchement ne produisent aucun clic.

Sources vérifiées le 28 octobre 2026 :

- [Interface Sounds — page officielle de Kenney](https://kenney.nl/assets/interface-sounds), licence CC0 affichée.
- [Casino Audio — page officielle de Kenney](https://kenney.nl/assets/casino-audio), licence CC0 affichée.
- [Dépôt Interface Sounds publié par Kenney sur OpenGameArt](https://opengameart.org/content/interface-sounds), utilisé pour le téléchargement ; licence CC0 et attribution facultative précisées.
- [Dépôt Casino Audio publié par Kenney sur OpenGameArt](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips), utilisé pour le téléchargement ; licence CC0 et attribution facultative précisées.
- [Texte de la licence CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

Les sons de glissement et d’arrivée de la face affichée suivent leurs animations, pendant les tours humains ou IA avec plateau. Depuis la version 1.31, une nouvelle chute adverse interne ou finale produit aussi un son générique, sans animation privée supplémentaire. Un verdict caché ne déclenche aucun son distinct. Le clic d’alignement dépend seulement de la géométrie, jamais des jetons. **Full et la simulation sans plateau restent silencieux.**

Le contexte audio s’ouvre après une interaction autorisée par le navigateur. Les événements survenus avant son ouverture ou avant le chargement d’un son sont ignorés, sans file d’attente. Le bouton de son, le passage sous masque et toute interruption peuvent arrêter immédiatement les voix en cours ; aucun son ni arrivée différée ne rejoue après la reprise. Une absence de prise en charge audio ne bloque pas le jeu.
