import { BOARD } from './geometry.js';

const atlas = './assets/one-piece/islands.webp';
const islands = [
  { x: 234, y: 108, lines: ['REVERSE', 'MOUNTAIN'] },
  { x: 302, y: 164, lines: ['WHISKY', 'PEAK'] },
  { x: 86, y: 235, lines: ['LITTLE', 'GARDEN'], left: true },
  { x: 320, y: 306, lines: ['DRUM'] },
  { x: 208, y: 414, lines: ['ALABASTA'] },
];

function atlasTile(index, x, y, size) {
  const column = index % 3;
  const row = Math.floor(index / 3);
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${column * 100} ${row * 100} 100 100" overflow="hidden">
    <image href="${atlas}" width="300" height="200" preserveAspectRatio="none"/>
  </svg>`;
}

export const onePieceBoardDefs = `
  <linearGradient id="one-piece-brass" x1="0%" y1="0%" x2="80%" y2="100%">
    <stop stop-color="#fff0bc"/><stop offset=".47" stop-color="#e3bc75"/><stop offset="1" stop-color="#a46d3c"/>
  </linearGradient>
  <radialGradient id="one-piece-hub" cx="34%" cy="24%" r="77%">
    <stop stop-color="#ffe6aa"/><stop offset=".62" stop-color="#ddb477"/><stop offset="1" stop-color="#9f673c"/>
  </radialGradient>`;

/** Keep the mechanical notch mask on the parent rotor. */
export function renderIslandWheel({ id, r }, allowed) {
  const artRadius = r - 4;
  const artMask = `one-piece-island-${id}`;
  return `<circle r="${r}" fill="url(#one-piece-brass)"/>
    <circle r="${artRadius}" fill="#d7bd8e" stroke="#624a36" stroke-width="1.4"/>
    <clipPath id="${artMask}"><circle r="${artRadius}"/></clipPath>
    <g clip-path="url(#${artMask})">
      ${atlasTile(id - 1, -artRadius, -artRadius, artRadius * 2)}
      ${allowed ? '' : `<circle r="${artRadius}" fill="#112b33" opacity=".18"/>`}
    </g>
    <circle r="${r - 2}" fill="none" stroke="#6c452e" stroke-opacity=".65" stroke-width="1.2" stroke-dasharray="1.3 7"/>`;
}

export function renderOnePieceDetails(back, showOpponentProgress) {
  const mirror = x => back ? BOARD.width - x : x;
  const labels = islands.map(({ x, y, lines, left = false }, index) => {
    const labelX = mirror(x);
    const anchor = left !== back ? 'end' : 'start';
    return `<text x="${labelX}" y="${y}" text-anchor="${anchor}"><tspan class="one-piece-island-number">${index + 1}</tspan>${
      lines.map((line, lineIndex) => `<tspan x="${labelX}" dy="${lineIndex === 0 ? 14 : 12}">${line}</tspan>`).join('')
    }</text>`;
  }).join('');
  const treasureX = mirror(304);
  return `<g class="one-piece-map-labels">
    ${showOpponentProgress ? `<rect x="${back ? 12 : 204}" y="460" width="112" height="70" rx="8" fill="#102d37" opacity=".78"/>` : ''}
    ${labels}
    <g transform="translate(${treasureX} 426)">
      <clipPath id="one-piece-treasure-frame"><rect x="-24" y="-24" width="48" height="48" rx="9"/></clipPath>
      <rect x="-24" y="-24" width="48" height="48" rx="9" fill="#203b40"/>
      <g clip-path="url(#one-piece-treasure-frame)">${atlasTile(5, -24, -24, 48)}</g>
      <rect x="-24" y="-24" width="48" height="48" rx="9" fill="none" stroke="#e8c68a" stroke-width="1"/>
      <text class="one-piece-treasure-label" y="34" text-anchor="middle">TRÉSOR ONE PIECE</text>
    </g>
  </g>`;
}
