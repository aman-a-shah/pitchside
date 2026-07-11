/**
 * Kit colors for real teams.
 *
 * A hand-curated table covers the teams that dominate the open dataset
 * (national sides, UCL-final clubs, La Liga, Premier League, Bundesliga,
 * women's competitions — the women's national sides share their federation's
 * kit). Anything unlisted gets a deterministic, name-hashed kit; a clash pass
 * re-colors the away side when the two kits would read as the same on screen.
 */

import type { KitSpec } from '@/ir/types';

const kit = (
  primary: string,
  secondary: string,
  shorts: string,
  socks: string,
  numberColor: string
): KitSpec => ({ primary, secondary, shorts, socks, numberColor, skin: '#d8a373' });

/** two-color shorthand: shirt/number contrast derived automatically */
const k2 = (primary: string, secondary: string): KitSpec =>
  kit(primary, secondary, darken(primary, 0.55), secondary, secondary);

// keys are normalized team names (see normalizeName)
const KITS: Record<string, KitSpec> = {
  // ------- national sides -------
  argentina: kit('#75AADB', '#FFFFFF', '#1B1B2F', '#FFFFFF', '#0B2A4A'),
  france: kit('#1B2A6B', '#FFFFFF', '#FFFFFF', '#C1121F', '#FFFFFF'),
  brazil: kit('#FFD400', '#009C3B', '#0033A0', '#FFFFFF', '#0033A0'),
  germany: kit('#F4F4F4', '#111111', '#111111', '#F4F4F4', '#111111'),
  england: kit('#FFFFFF', '#0A1E5A', '#0A1E5A', '#FFFFFF', '#0A1E5A'),
  spain: kit('#C60B1E', '#FFC400', '#0A1E5A', '#111111', '#FFC400'),
  italy: kit('#1C55A0', '#FFFFFF', '#FFFFFF', '#1C55A0', '#FFFFFF'),
  netherlands: kit('#F36C21', '#FFFFFF', '#FFFFFF', '#F36C21', '#1B2A6B'),
  portugal: kit('#B01C2E', '#0A6E4F', '#0A6E4F', '#B01C2E', '#FFD400'),
  croatia: kit('#E8E8E8', '#C1121F', '#1B2A6B', '#FFFFFF', '#C1121F'),
  belgium: k2('#C1121F', '#FFD400'),
  morocco: k2('#B01C2E', '#0A6E4F'),
  japan: k2('#1B2A6B', '#FFFFFF'),
  mexico: k2('#0A6E4F', '#FFFFFF'),
  'united states': kit('#FFFFFF', '#1B2A6B', '#1B2A6B', '#FFFFFF', '#C1121F'),
  poland: kit('#FFFFFF', '#C1121F', '#C1121F', '#FFFFFF', '#C1121F'),
  senegal: k2('#F4F4F4', '#0A6E4F'),
  australia: k2('#FFC400', '#0A6E4F'),
  wales: k2('#C1121F', '#FFFFFF'),
  denmark: k2('#C8102E', '#FFFFFF'),
  tunisia: k2('#FFFFFF', '#C1121F'),
  ecuador: k2('#FFD400', '#0A1E5A'),
  qatar: k2('#7B1533', '#FFFFFF'),
  uruguay: k2('#7EB6E4', '#111111'),
  ghana: k2('#FFFFFF', '#C1121F'),
  cameroon: k2('#0A6E4F', '#C1121F'),
  serbia: k2('#B01C2E', '#FFFFFF'),
  switzerland: k2('#C1121F', '#FFFFFF'),
  'south korea': k2('#C1121F', '#111111'),
  canada: k2('#C1121F', '#FFFFFF'),
  'costa rica': k2('#C1121F', '#0A1E5A'),
  iran: k2('#FFFFFF', '#C1121F'),
  'saudi arabia': k2('#0A6E4F', '#FFFFFF'),
  scotland: k2('#1B2A6B', '#FFFFFF'),
  sweden: k2('#FFD400', '#1C55A0'),
  norway: k2('#C1121F', '#0A1E5A'),
  austria: k2('#C1121F', '#FFFFFF'),
  hungary: k2('#C1121F', '#0A6E4F'),
  ukraine: k2('#FFD400', '#1C55A0'),
  slovakia: k2('#FFFFFF', '#1C55A0'),
  slovenia: k2('#FFFFFF', '#0A6E4F'),
  romania: k2('#FFD400', '#1B2A6B'),
  georgia: k2('#FFFFFF', '#C1121F'),
  turkiye: k2('#C1121F', '#FFFFFF'),
  turkey: k2('#C1121F', '#FFFFFF'),
  czechia: k2('#C1121F', '#1B2A6B'),
  'czech republic': k2('#C1121F', '#1B2A6B'),
  albania: k2('#C1121F', '#111111'),
  greece: k2('#1C55A0', '#FFFFFF'),
  russia: k2('#C1121F', '#FFFFFF'),
  'soviet union': k2('#C1121F', '#FFFFFF'),
  nigeria: k2('#0A6E4F', '#FFFFFF'),
  "cote d'ivoire": k2('#F36C21', '#0A6E4F'),
  colombia: k2('#FFD400', '#1B2A6B'),
  chile: k2('#C1121F', '#1B2A6B'),
  peru: kit('#FFFFFF', '#C1121F', '#FFFFFF', '#C1121F', '#C1121F'),
  paraguay: k2('#C1121F', '#FFFFFF'),
  bolivia: k2('#0A6E4F', '#FFFFFF'),
  venezuela: k2('#7B1533', '#FFFFFF'),
  panama: k2('#C1121F', '#FFFFFF'),
  jamaica: k2('#FFD400', '#0A6E4F'),
  honduras: k2('#FFFFFF', '#1C55A0'),
  'new zealand': k2('#FFFFFF', '#111111'),
  'south africa': k2('#FFD400', '#0A6E4F'),
  egypt: k2('#C1121F', '#FFFFFF'),
  algeria: k2('#FFFFFF', '#0A6E4F'),
  mali: k2('#FFD400', '#0A6E4F'),
  'burkina faso': k2('#0A6E4F', '#C1121F'),
  'dr congo': k2('#1C55A0', '#FFD400'),
  guinea: k2('#C1121F', '#FFD400'),
  'equatorial guinea': k2('#C1121F', '#FFFFFF'),
  'cape verde': k2('#1C55A0', '#FFFFFF'),
  angola: k2('#C1121F', '#111111'),
  zambia: k2('#0A6E4F', '#F36C21'),
  namibia: k2('#1C55A0', '#C1121F'),
  mauritania: k2('#0A6E4F', '#FFD400'),
  mozambique: k2('#C1121F', '#0A6E4F'),
  gambia: k2('#C1121F', '#1C55A0'),
  'guinea-bissau': k2('#C1121F', '#FFD400'),
  tanzania: k2('#0A6E4F', '#FFD400'),
  china: k2('#C1121F', '#FFD400'),
  thailand: k2('#1B2A6B', '#C1121F'),
  vietnam: k2('#C1121F', '#FFD400'),
  philippines: k2('#1B2A6B', '#FFFFFF'),
  haiti: k2('#1C55A0', '#C1121F'),
  ireland: k2('#0A6E4F', '#FFFFFF'),
  'republic of ireland': k2('#0A6E4F', '#FFFFFF'),
  'northern ireland': k2('#0A6E4F', '#FFFFFF'),
  finland: k2('#FFFFFF', '#1C55A0'),
  iceland: k2('#1C55A0', '#FFFFFF'),
  israel: k2('#1C55A0', '#FFFFFF'),
  'north macedonia': k2('#C1121F', '#FFD400'),
  luxembourg: k2('#C1121F', '#7EB6E4'),
  gibraltar: k2('#C1121F', '#FFFFFF'),

  // ------- clubs -------
  barcelona: kit('#A50044', '#004D98', '#004D98', '#A50044', '#FFC400'),
  'real madrid': kit('#FEFEFE', '#111111', '#FEFEFE', '#FEFEFE', '#1B2A6B'),
  'atletico madrid': kit('#CB3524', '#FFFFFF', '#1B2A6B', '#CB3524', '#FFFFFF'),
  'athletic club': k2('#EE2523', '#FFFFFF'),
  sevilla: k2('#FFFFFF', '#D8091F'),
  valencia: k2('#FFFFFF', '#F36C21'),
  villarreal: k2('#FFE667', '#005187'),
  'real betis': k2('#0BB363', '#FFFFFF'),
  'real sociedad': k2('#0067B1', '#FFFFFF'),
  espanyol: k2('#1C55A0', '#FFFFFF'),
  'deportivo la coruna': k2('#1C55A0', '#FFFFFF'),
  'manchester united': kit('#DA291C', '#FBE122', '#FFFFFF', '#111111', '#FBE122'),
  'manchester city': k2('#6CABDD', '#FFFFFF'),
  liverpool: kit('#C8102E', '#F6EB61', '#C8102E', '#C8102E', '#F6EB61'),
  chelsea: k2('#034694', '#FFFFFF'),
  arsenal: kit('#EF0107', '#FFFFFF', '#FFFFFF', '#EF0107', '#FFFFFF'),
  'tottenham hotspur': kit('#FFFFFF', '#132257', '#132257', '#FFFFFF', '#132257'),
  'newcastle united': k2('#241F20', '#FFFFFF'),
  everton: k2('#003399', '#FFFFFF'),
  'aston villa': k2('#670E36', '#95BFE5'),
  'west ham united': k2('#7A263A', '#1BB1E7'),
  'leicester city': k2('#003090', '#FDBE11'),
  southampton: k2('#D71920', '#FFFFFF'),
  'crystal palace': k2('#1B458F', '#C4122E'),
  'stoke city': k2('#E03A3E', '#FFFFFF'),
  sunderland: k2('#EB172B', '#FFFFFF'),
  'swansea city': k2('#FFFFFF', '#121212'),
  watford: k2('#FBEE23', '#ED2127'),
  'west bromwich albion': k2('#122F67', '#FFFFFF'),
  'norwich city': k2('#00A650', '#FFF200'),
  bournemouth: k2('#DA291C', '#111111'),
  fulham: k2('#FFFFFF', '#111111'),
  'leeds united': k2('#FFFFFF', '#1D428A'),
  'bolton wanderers': k2('#FFFFFF', '#263C7E'),
  'blackburn rovers': k2('#009EE0', '#FFFFFF'),
  'charlton athletic': k2('#E31B23', '#FFFFFF'),
  portsmouth: k2('#001489', '#FFFFFF'),
  middlesbrough: k2('#E21A23', '#FFFFFF'),
  'birmingham city': k2('#0000FF', '#FFFFFF'),
  'wolverhampton wanderers': k2('#FDB913', '#231F20'),
  'bayern munich': k2('#DC052D', '#FFFFFF'),
  'borussia dortmund': k2('#FDE100', '#111111'),
  'bayer leverkusen': k2('#E32221', '#111111'),
  'rb leipzig': k2('#FFFFFF', '#DD0741'),
  'vfb stuttgart': k2('#FFFFFF', '#E32219'),
  'eintracht frankfurt': k2('#E1000F', '#111111'),
  'borussia monchengladbach': k2('#FFFFFF', '#0A5C2F'),
  'union berlin': k2('#EB1923', '#FFD500'),
  'sc freiburg': k2('#5B0D0D', '#FFFFFF'),
  'werder bremen': k2('#1D9053', '#FFFFFF'),
  'vfl wolfsburg': k2('#65B32E', '#FFFFFF'),
  'tsg hoffenheim': k2('#1C63B7', '#FFFFFF'),
  'mainz 05': k2('#C3141E', '#FFFFFF'),
  augsburg: k2('#BA3733', '#FFFFFF'),
  'vfl bochum': k2('#005CA9', '#FFFFFF'),
  'fc heidenheim': k2('#E30613', '#003E7E'),
  darmstadt: k2('#004E9E', '#FFFFFF'),
  'fc koln': k2('#FFFFFF', '#ED1C24'),
  'ac milan': kit('#FB090B', '#111111', '#FFFFFF', '#111111', '#FFFFFF'),
  'inter milan': k2('#0068A8', '#111111'),
  juventus: kit('#FFFFFF', '#111111', '#111111', '#FFFFFF', '#111111'),
  napoli: k2('#12A0D7', '#FFFFFF'),
  'as roma': k2('#8E1F2F', '#F0BC42'),
  lazio: k2('#87D8F7', '#FFFFFF'),
  fiorentina: k2('#4B2E83', '#FFFFFF'),
  'paris saint-germain': k2('#004170', '#DA291C'),
  'as monaco': k2('#E51B22', '#FFFFFF'),
  'olympique lyonnais': k2('#FFFFFF', '#1B2A6B'),
  'olympique marseille': k2('#FFFFFF', '#2FAEE0'),
  ajax: kit('#FFFFFF', '#D2122E', '#FFFFFF', '#FFFFFF', '#D2122E'),
  'fc porto': k2('#00428C', '#FFFFFF'),
  benfica: k2('#E83030', '#FFFFFF'),
  'sporting cp': k2('#008057', '#FFFFFF'),
  celtic: k2('#018749', '#FFFFFF'),
  rangers: k2('#1B458F', '#FFFFFF'),
  panathinaikos: k2('#0A6E4F', '#FFFFFF'),
  'ny cosmos': k2('#FFFFFF', '#0A6E4F'),
  'seattle sounders': k2('#5D9741', '#236192'),
  'seattle reign': k2('#2B4162', '#B3A369'),
  'nj/ny gotham fc': k2('#111111', '#5BC2E7'),
  'portland thorns': k2('#8B1E41', '#FFFFFF'),
  'north carolina courage': k2('#0A2240', '#C99700'),
  'chicago red stars': k2('#7CCDEF', '#C8102E'),
  'orlando pride': k2('#633492', '#00B5E2'),
  'houston dash': k2('#F36C21', '#101820'),
  'kansas city current': k2('#63CFC9', '#C8102E'),
  'washington spirit': k2('#111111', '#C8102E'),
  'san diego wave': k2('#003049', '#7EB6E4'),
  'angel city': k2('#111111', '#FBD0C0'),
  'racing louisville': k2('#C5B4E3', '#111111'),
  'bristol city': k2('#E21A23', '#FFFFFF'),
  'birmingham city wfc': k2('#0000FF', '#FFFFFF'),
};

// ------------------------------ normalization --------------------------------

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\bwomen'?s?\b/g, '')
    .replace(/\b(wfc|fcw|lfc|cf|fc|afc|cd|ac|sc|u\d+)\b/g, '')
    .replace(/[^a-z0-9/' -]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ------------------------------ color helpers --------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function darken(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * f, g * f, b * f);
}

function luma(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** perceptual-ish distance so we can detect two kits that read the same */
function colorDist(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

function hashHue(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 360;
}

function hslHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}

function fallbackKit(name: string): KitSpec {
  const hue = hashHue(normalizeName(name));
  const primary = hslHex(hue, 0.62, 0.42);
  return k2(primary, '#FFFFFF');
}

// ------------------------------ public API ------------------------------------

export function kitFor(teamName: string): KitSpec {
  return KITS[normalizeName(teamName)] ?? fallbackKit(teamName);
}

/**
 * Kits for a fixture: away side switches to a change kit when the two primaries
 * would be indistinguishable on the pitch (the real-world clash rule).
 */
export function kitsForFixture(home: string, away: string): [KitSpec, KitSpec] {
  const h = kitFor(home);
  let a = kitFor(away);
  if (colorDist(h.primary, a.primary) < 90) {
    const altPrimary =
      colorDist(a.secondary, h.primary) >= 90
        ? a.secondary
        : luma(h.primary) > 0.5
          ? '#15203A' // dark change kit against a light home shirt
          : '#F2F2F2'; // light change kit against a dark home shirt
    const altNumber = luma(altPrimary) > 0.5 ? '#111111' : '#FFFFFF';
    a = {
      ...a,
      primary: altPrimary,
      secondary: a.primary,
      shorts: darken(altPrimary, 0.55),
      socks: altPrimary,
      numberColor: altNumber,
    };
  }
  return [h, a];
}

/** Team accent for UI chrome (row hover, scoreboard chip). */
export function accentFor(teamName: string): string {
  const k = kitFor(teamName);
  // white shirts make invisible accents — fall back to the secondary
  return luma(k.primary) > 0.82 ? k.secondary : k.primary;
}

const CODE_STOPWORDS = new Set(['FC', 'AFC', 'CF', 'AC', 'SC', 'CD', 'DE', 'THE', 'WFC', 'FCW']);

/** Broadcast-style 3-letter team code: "Argentina"→ARG, "Real Madrid"→RMA. */
export function teamCode(name: string): string {
  const words = name
    .replace(/\bWomen's\b/gi, '')
    .replace(/\bU\d+\b/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .split(/\s+/)
    .filter((w) => w && !CODE_STOPWORDS.has(w));
  if (words.length === 0) return name.slice(0, 3).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 3).padEnd(3, 'X');
  let code = words.map((w) => w[0]).join('').slice(0, 3);
  const last = words[words.length - 1];
  let i = 1;
  while (code.length < 3 && i < last.length) code += last[i++];
  return code.padEnd(3, 'X');
}
