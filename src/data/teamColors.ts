// Two-tone national marks (primary, secondary) for dense/list contexts.
// Trademark-free CSS marks; real flags can layer in on 1-v-1 pages later.
export const TEAM_COLORS: Record<string, [string, string]> = {
  'south-africa': ['#007a4d', '#ffb612'], 'canada': ['#d52b1e', '#e8e8e8'],
  'brazil': ['#ffdf00', '#009739'], 'japan': ['#e8e8e8', '#bc002d'],
  'netherlands': ['#ff6c00', '#21468b'], 'morocco': ['#c1272d', '#006233'],
  'united-states': ['#3c3b6e', '#b22234'], 'bosnia-and-herzegovina': ['#002395', '#fecb00'],
  'argentina': ['#75aadb', '#e8e8e8'], 'spain': ['#c60b1e', '#ffc400'],
  'france': ['#0055a4', '#ef4135'], 'england': ['#e8e8e8', '#cf081f'],
  'portugal': ['#006600', '#da291c'], 'mexico': ['#006847', '#ce1126'],
  'germany': ['#141414', '#ffce00'], 'croatia': ['#e8e8e8', '#c8102e'],
  'colombia': ['#fcd116', '#003893'], 'belgium': ['#141414', '#fdda24'],
  'switzerland': ['#d52b1e', '#e8e8e8'], 'uruguay': ['#5cbcef', '#141414'],
  'norway': ['#ba0c2f', '#00205b'], 'australia': ['#00843d', '#ffcd00'],
  'ecuador': ['#ffd100', '#0072ce'], 'egypt': ['#141414', '#c8102e'],
  'senegal': ['#00853f', '#e31b23'], 'iran': ['#239f40', '#da0000'],
  'south-korea': ['#0047a0', '#cd2e3a'], 'paraguay': ['#0038a8', '#d52b1e'],
  'ghana': ['#006b3f', '#fcd116'], 'turkiye': ['#e30a17', '#e8e8e8'],
};
export function teamColors(id: string): [string, string] {
  return TEAM_COLORS[id] ?? ['#3a3f4a', '#5a606c'];
}
