// Team colours (primary c1 / secondary c2) for the two-tone diagonal marks and
// team-page hero gradients. Curated from each nation's well-known kit/identity
// colours. Keyed by our team slug. Used in dense contexts (marks); flags (SVG,
// in concepts assets) are used in 1–2-team contexts per the IA.
//
// These are facts/identity colours (not a copyrighted design), safe to use.

export interface TeamColor {
  c1: string; // primary
  c2: string; // secondary
}

export const TEAM_COLORS: Record<string, TeamColor> = {
  mexico: { c1: '#006847', c2: '#ce1126' },
  'south-africa': { c1: '#007a4d', c2: '#ffb612' },
  'south-korea': { c1: '#c60c30', c2: '#003478' },
  czechia: { c1: '#11457e', c2: '#d7141a' },
  switzerland: { c1: '#d52b1e', c2: '#ffffff' },
  canada: { c1: '#d52b1e', c2: '#ffffff' },
  'bosnia-and-herzegovina': { c1: '#002395', c2: '#ffec00' },
  qatar: { c1: '#8a1538', c2: '#ffffff' },
  brazil: { c1: '#ffdf00', c2: '#009c3b' },
  morocco: { c1: '#c1272d', c2: '#006233' },
  scotland: { c1: '#005eb8', c2: '#ffffff' },
  haiti: { c1: '#00209f', c2: '#d21034' },
  'united-states': { c1: '#0a3161', c2: '#b31942' },
  australia: { c1: '#00843d', c2: '#ffcd00' },
  paraguay: { c1: '#d52b1e', c2: '#0038a8' },
  turkiye: { c1: '#e30a17', c2: '#ffffff' },
  germany: { c1: '#000000', c2: '#dd0000' },
  'ivory-coast': { c1: '#f77f00', c2: '#009e60' },
  ecuador: { c1: '#ffd100', c2: '#0072c6' },
  curacao: { c1: '#002b7f', c2: '#f9d616' },
  netherlands: { c1: '#ff4f00', c2: '#21468b' },
  japan: { c1: '#002b7f', c2: '#bc002d' },
  sweden: { c1: '#005293', c2: '#fecb00' },
  tunisia: { c1: '#e70013', c2: '#ffffff' },
  egypt: { c1: '#ce1126', c2: '#000000' },
  iran: { c1: '#239f40', c2: '#da0000' },
  belgium: { c1: '#e30613', c2: '#fdda24' },
  'new-zealand': { c1: '#000000', c2: '#ffffff' },
  spain: { c1: '#c60b1e', c2: '#ffc400' },
  'cape-verde': { c1: '#003893', c2: '#cf2027' },
  'saudi-arabia': { c1: '#006c35', c2: '#ffffff' },
  uruguay: { c1: '#7ba4db', c2: '#001b8e' },
  france: { c1: '#0055a4', c2: '#ef4135' },
  senegal: { c1: '#00853f', c2: '#fdef42' },
  iraq: { c1: '#007a3d', c2: '#ce1126' },
  norway: { c1: '#ba0c2f', c2: '#00205b' },
  argentina: { c1: '#75aadb', c2: '#ffffff' },
  austria: { c1: '#ed2939', c2: '#ffffff' },
  algeria: { c1: '#006233', c2: '#d21034' },
  jordan: { c1: '#007a3d', c2: '#ce1126' },
  colombia: { c1: '#fcd116', c2: '#003893' },
  portugal: { c1: '#006600', c2: '#ff0000' },
  'dr-congo': { c1: '#007fff', c2: '#f7d618' },
  uzbekistan: { c1: '#1eb53a', c2: '#0099b5' },
  england: { c1: '#ffffff', c2: '#cf081f' },
  croatia: { c1: '#ff0000', c2: '#ffffff' },
  ghana: { c1: '#006b3f', c2: '#fcd116' },
  panama: { c1: '#005293', c2: '#da121a' },
};

const FALLBACK: TeamColor = { c1: '#6f6655', c2: '#a59a85' };

export function teamColors(slug: string): TeamColor {
  return TEAM_COLORS[slug] ?? FALLBACK;
}

/** CSS diagonal two-tone team mark. Hard 50/50 split — touching colour stops so
 *  the seam is crisp (a transition band reads as blur, esp. on a diagonal). */
export function teamGrad(slug: string): string {
  const { c1, c2 } = teamColors(slug);
  return `linear-gradient(135deg, ${c1} 0%, ${c1} 50%, ${c2} 50%, ${c2} 100%)`;
}
