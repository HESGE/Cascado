#!/usr/bin/env node
import { runSimulation } from '../src/simulation.js';
import { ORIGINAL_START_MODE } from '../src/starting-position.js';

const usage = `Cascado — confrontations sans interface graphique

Usage : npm run simulate -- --games 10 --ai1 normal --ai2 hard --seed 42

  --games N       De 1 à 1 000 parties (10 par défaut)
  --ai1 NIVEAU    easy, normal ou hard (normal par défaut)
  --ai2 NIVEAU    easy, normal ou hard (normal par défaut)
  --seed ENTIER   Graine reproductible des départs et des IA faciles (1 par défaut)
  --set SET       reference ou miroir-50 (reference par défaut)
  --starts MODE   classic : ancien neutre à zéro ; varied : même pose par paire ; original : départ reconstitué estimé (classic par défaut)
  --max-turns N   Limite par partie, sans fabriquer d'égalité (10 000 par défaut)
  --json          Résultats structurés, une ligne JSON
  --help          Afficher cette aide

Miroir 50 utilise uniquement ses 50 poses fixes. Ses revanches complémentaires
croisent les deux premiers joueurs sur 100 manches. --starts ne remélange pas ce lot.
Le premier joueur alterne à chaque partie. Ctrl+C arrête après le tour en cours.`;

function integer(value, name) {
  if (!/^-?\d+$/.test(value ?? '') || !Number.isSafeInteger(Number(value))) {
    throw new TypeError(`${name} exige un entier.`);
  }
  return Number(value);
}

try {
  const options = { levels: ['normal', 'normal'] };
  let json = false;
  const seen = new Set();
  const args = process.argv.slice(2);
  if (args.includes('--help')) { console.log(usage); process.exit(0); }
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (seen.has(flag)) throw new TypeError(`Option répétée : ${flag}`);
    seen.add(flag);
    if (flag === '--json') { json = true; continue; }
    if (!['--games', '--ai1', '--ai2', '--seed', '--max-turns', '--starts', '--set'].includes(flag)) {
      throw new TypeError(`Option inconnue : ${flag}`);
    }
    const value = args[++index];
    if (value === undefined || value.startsWith('--')) throw new TypeError(`Valeur manquante pour ${flag}.`);
    if (flag === '--ai1' || flag === '--ai2') options.levels[flag === '--ai1' ? 0 : 1] = value;
    else if (flag === '--set') options.gameSetId = value;
    else if (flag === '--starts') options.startMode = value === 'original' ? ORIGINAL_START_MODE : value;
    else options[{ '--games': 'count', '--seed': 'seed', '--max-turns': 'maxTurns' }[flag]] = integer(value, flag);
  }
  let stopped = false;
  const stop = () => { stopped = true; };
  process.on('SIGINT', stop);
  const result = await runSimulation(options, { shouldStop: () => stopped });
  process.off('SIGINT', stop);
  if (json) console.log(JSON.stringify(result));
  else {
    console.log(`${result.completed} / ${result.requested} parties terminées — graine ${result.seed}`);
    console.log(`Set : ${result.gameSetLabel} (${result.gameSetId})`);
    console.log(`Départs : ${result.gameSetId === 'miroir-50' ? 'lot fixe Miroir 50, revanches complémentaires' : result.startMode === 'varied' ? 'variés par paires' : result.startMode === ORIGINAL_START_MODE ? 'original reconstitué (original-v1)' : 'classiques'} — ${result.positionCount} position(s) distincte(s)`);
    console.log(`IA 1 (${result.levels[0]}) : ${result.wins[0]} victoire(s)`);
    console.log(`IA 2 (${result.levels[1]}) : ${result.wins[1]} victoire(s)`);
    console.log(`Égalités : ${result.draws} — moyenne : ${result.averageTurns.toFixed(1)} tours par partie`);
    if (result.unfinished) console.log(`Partie ${result.unfinished.round} inachevée (${result.unfinished.reason}, ${result.unfinished.turns} tours).`);
    if (result.status === 'stopped') console.log('Simulation interrompue.');
  }
  process.exitCode = result.status === 'completed' ? 0 : result.status === 'stopped' ? 130 : 1;
} catch (error) {
  console.error(`Erreur : ${error.message}\nUtilise --help pour afficher les options.`);
  process.exitCode = 2;
}
