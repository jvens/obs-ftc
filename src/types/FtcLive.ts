
export interface Event {
  eventCode: string;
  name: string;
  division: number;
  finals: boolean;
  start: Date;
  end: Date;
  type: string; // make enum
  status: string; // make enum
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