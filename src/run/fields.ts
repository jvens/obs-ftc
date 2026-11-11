import { MatchRow } from '../store/matchDataSlice';
import { UpdateType } from '../types/FtcLive';

// What each field is doing, from the match events FTC Live has sent: the field's most recent match
// and its latest event.

export type FieldTone = 'live' | 'ok' | 'off';

export interface FieldStatus {
  field: number;
  match?: {
    name: string;
    phase: string;
    tone: FieldTone;
    red: number[];
    blue: number[];
  };
}

const PHASES: Record<UpdateType, { phase: string; tone: FieldTone }> = {
  MATCH_LOAD: { phase: 'Loaded', tone: 'ok' },
  SHOW_PREVIEW: { phase: 'Preview on screen', tone: 'ok' },
  SHOW_RANDOM: { phase: 'Randomized', tone: 'ok' },
  SHOW_MATCH: { phase: 'Match on screen', tone: 'ok' },
  INIT_SUBMITTED: { phase: 'Ready to start', tone: 'ok' },
  MATCH_START: { phase: 'Match running', tone: 'live' },
  MATCH_ABORT: { phase: 'Aborted', tone: 'off' },
  MATCH_COMMIT: { phase: 'Scores committed', tone: 'off' },
  MATCH_POST: { phase: 'Results posted', tone: 'off' },
};

const EVENTS = Object.keys(PHASES) as UpdateType[];

// The match's latest event and when it happened.
const latestEvent = (row: MatchRow): [UpdateType, number] | undefined =>
  EVENTS.reduce<[UpdateType, number] | undefined>((latest, event) => {
    const time = row[event];
    return time !== undefined && (!latest || time > latest[1]) ? [event, time] : latest;
  }, undefined);

const teams = (...numbers: (number | undefined)[]) => numbers.filter((team): team is number => team !== undefined && team > 0);

export const fieldStatuses = (matches: MatchRow[], fieldCount: number): FieldStatus[] =>
  Array.from({ length: Math.max(1, fieldCount) }, (_, index) => {
    const field = index + 1;
    const latest = matches
      .filter(row => row.field === field)
      .map(row => ({ row, event: latestEvent(row) }))
      .filter((candidate): candidate is { row: MatchRow; event: [UpdateType, number] } => !!candidate.event)
      .sort((a, b) => b.event[1] - a.event[1])[0];
    if (!latest) return { field };
    const { row, event } = latest;
    return {
      field,
      match: {
        name: row.name,
        ...PHASES[event[0]],
        red: teams(row.red1, row.red2, row.red3),
        blue: teams(row.blue1, row.blue2, row.blue3),
      },
    };
  });
