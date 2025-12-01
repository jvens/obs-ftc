
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


export type UpdateType = 'MATCH_LOAD' | 'MATCH_START' | 'MATCH_ABORT' | 'MATCH_COMMIT' | 'MATCH_POST' | 'SHOW_PREVIEW' | 'SHOW_RANDOM' | 'SHOW_MATCH';
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
  'SHOW_MATCH'
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