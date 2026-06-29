// Assembles the compact, serializable team dataset the Predictor island needs:
// every team plus its top-3 goalscorers. Computed at build time from the
// provider, passed into the island as a prop.
import { provider } from './provider';
import type { PredictorTeam } from '../components/analysis/Predictor';

export function getPredictorTeams(): PredictorTeam[] {
  return provider.getTeams().map((t) => ({
    ...t,
    keyPlayers: provider
      .getSquad(t.id)
      .slice()
      .sort((a, b) => b.goals - a.goals)
      .slice(0, 3)
      .map((p) => ({ name: p.name, pos: p.pos, club: p.club, goals: p.goals })),
  }));
}
