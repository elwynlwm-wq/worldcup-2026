// The data-access seam. Pages and the predictor read the analysis data ONLY
// through this interface — never from raw data or a backend directly.
//
// Today the SampleProvider serves the in-repo snapshot (built once at module
// load). When the data plane lands, a WorkerProvider implements the same
// interface against the Cloudflare backend, and nothing that consumes a
// provider has to change. This is the abstraction docs/data-model.md describes.

import { buildDb, type Db, type Team, type Player, type Group, type Match, type Tournament } from './model';

export interface FootballDataProvider {
  getTournament(): Tournament;
  getGroups(): Group[];
  getTeams(): Team[];
  getTeam(id: string): Team | undefined;
  getSquad(teamId: string): Player[];
  getCoach(teamId: string): { teamId: string; name: string | null };
  getAllPlayers(): Player[];
  getPlayer(id: string): Player | undefined;
  getFixtures(): Match[];
}

function makeSampleProvider(db: Db): FootballDataProvider {
  return {
    getTournament: () => db.tournament,
    getGroups: () => db.groups,
    getTeams: () => db.teams,
    getTeam: (id) => db.byId[id],
    getSquad: (id) => db.squads[id] || [],
    getCoach: (id) => ({ teamId: id, name: db.coaches[id] || null }),
    getAllPlayers: () => Object.values(db.squads).flat(),
    getPlayer: (id) => Object.values(db.squads).flat().find((p) => p.id === id),
    getFixtures: () => db.matches,
  };
}

// Single shared instance for the static build.
export const provider: FootballDataProvider = makeSampleProvider(buildDb());
