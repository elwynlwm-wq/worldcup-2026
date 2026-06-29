// Shared player-modal data. Players are opened in a modal (no dedicated page),
// triggered from squad cards, star lists, the players index and search. Each
// trigger carries the player's display data as data- attributes; one PlayerModal
// per page reads them and renders. Keeps the site static (no client routing).
import { provider } from './provider';
import { getPlayerTiers, getPlayerWcStats, afPlayerId } from './warehouse';
import type { Player } from './model';

const POS_NAME: Record<string, string> = { GK: 'Goalkeeper', DF: 'Defender', MF: 'Midfielder', FW: 'Forward' };
const POS_COLOR: Record<string, string> = { GK: '#e0a200', DF: '#1f3fbf', MF: '#138a5e', FW: '#b23b2e' };

export interface PlayerModalData {
  name: string;
  pos: string;
  posName: string;
  posColor: string;
  photo: string | null;
  teamId: string;
  teamName: string;
  teamCode: string;
  club: string | null;
  clubTier: string | null;
  playerTier: string | null;
  age: number | null;
  caps: number;
  goals: number;
  goalsPerCap: string;
  // WC tournament: totals + per-match log (compact, ≤4 rows)
  wc: { apps: number; goals: number; assists: number; mins: number;
        matches: { opp: string; oppCode: string; stage: string; date: string;
                   minutes: number | null; goals: number | null; assists: number | null; rating: string | null }[] } | null;
}

/** Build the modal payload for a player (provider Player). */
export function playerModalData(p: Player): PlayerModalData {
  const team = provider.getTeam(p.teamId)!;
  const tiers = getPlayerTiers(p.id);
  const wcRaw = getPlayerWcStats(afPlayerId(tiers?.photo));
  const wc = wcRaw
    ? {
        apps: wcRaw.apps, goals: wcRaw.goals, assists: wcRaw.assists, mins: wcRaw.mins,
        matches: wcRaw.matches.map((m) => {
          const oppId = m.homeId === p.teamId ? m.awayId : m.homeId;
          const opp = provider.getTeam(oppId);
          return {
            opp: oppId, oppCode: opp?.shortCode ?? '—', stage: m.stage, date: m.date,
            minutes: m.minutes, goals: m.goals, assists: m.assists, rating: m.rating,
          };
        }),
      }
    : null;
  return {
    name: p.name, pos: p.pos, posName: POS_NAME[p.pos] ?? p.pos, posColor: POS_COLOR[p.pos] ?? '#5b6470',
    photo: tiers?.photo ?? null,
    teamId: team.id, teamName: team.name, teamCode: team.shortCode,
    club: p.club, clubTier: tiers?.clubTier ?? null, playerTier: tiers?.playerTier ?? null,
    age: p.age ?? null, caps: p.caps, goals: p.goals,
    goalsPerCap: p.caps > 0 ? (p.goals / p.caps).toFixed(2) : '—',
    wc,
  };
}

/** data- attributes for a clickable trigger; spread onto the element. */
export function playerTriggerAttrs(p: Player): Record<string, string> {
  return { 'data-player': JSON.stringify(playerModalData(p)) };
}
