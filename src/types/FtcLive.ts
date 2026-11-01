
export interface Event {
  eventCode: string;
  name: string;
  division: number;
  finals: boolean;
  start: Date;
  end: Date;
  type: string; // make enum
  status: string; // make enum
  fieldCount: number;
};


// SHOW_RANDOM only comes in seasons whose game has a randomization step; INIT_SUBMITTED (FTC Live 8
// and later) when both alliances' referees have submitted the pre-match setup.
export type UpdateType = 'MATCH_LOAD' | 'MATCH_START' | 'MATCH_ABORT' | 'MATCH_COMMIT' | 'MATCH_POST' | 'SHOW_PREVIEW' | 'SHOW_RANDOM' | 'SHOW_MATCH'
  | 'INIT_SUBMITTED';
export interface FtcLiveSteamData {
  updateTime: number;
  updateType: UpdateType;
  payload: {
    number: number;
    shortName: string;
    field: number;
  };
};

export const UpdateTypes: UpdateType[] = [
  'MATCH_LOAD',
  'MATCH_START',
  'MATCH_ABORT',
  'MATCH_COMMIT',
  'MATCH_POST',
  'SHOW_PREVIEW',
  'SHOW_RANDOM',
  'SHOW_MATCH',
  'INIT_SUBMITTED',
]

export interface FtcMatch {
  matchName: string;
  matchNumber: number;
  field: number;
  red: {
    team1: number;
    team2: number;
    team3?: number;
    isTeam1Surrogate: boolean;
    isTeam2Surrogate: boolean;
    isTeam3Surrogate?: boolean;
  };
  blue: {
    team1: number;
    team2: number;
    team3?: number;
    isTeam1Surrogate: boolean;
    isTeam2Surrogate: boolean;
    isTeam3Surrogate?: boolean;
  };
  finished: boolean;
  matchState: string;
  time: number;
}