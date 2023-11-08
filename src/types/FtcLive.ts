
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



export interface FtcLiveSteamData {
  updateTime: number;
  updateType: 'MATCH_LOAD' | 'MATCH_START' | 'MATCH_ABORT' | 'MATCH_COMMIT' | 'MATCH_POST' | 'SHOW_PREVIEW' | 'SHOW_RANDOM' | 'SHOW_MATCH';
  payload: {
    number: number;
    shortName: string;
    field: number;
  };
};

export const UpdateTypes = [
  'MATCH_LOAD',
  'MATCH_START',
  'MATCH_ABORT',
  'MATCH_COMMIT',
  'MATCH_POST',
  'SHOW_PREVIEW',
  'SHOW_RANDOM',
  'SHOW_MATCH'
]