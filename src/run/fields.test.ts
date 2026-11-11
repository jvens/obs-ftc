import { describe, expect, it } from '@jest/globals';
import { MatchRow } from '../store/matchDataSlice';
import { fieldStatuses } from './fields';

const row = (name: string, field: number | undefined, events: Partial<MatchRow>, teams: Partial<MatchRow> = {}): MatchRow =>
  ({ name, number: Number(name.slice(1)), field, ...events, ...teams });

describe('fieldStatuses', () => {
  it('shows each field with nothing yet', () => {
    expect(fieldStatuses([], 2)).toEqual([{ field: 1 }, { field: 2 }]);
  });

  it('shows the latest match on each field, at its latest event, with its teams', () => {
    const matches = [
      row('Q1', 1, { MATCH_LOAD: 10, MATCH_START: 20, MATCH_POST: 30 }, { red1: 1001, red2: 2001, blue1: 3001, blue2: 4001 }),
      row('Q2', 2, { MATCH_LOAD: 25, SHOW_PREVIEW: 26 }),
      row('Q3', 1, { MATCH_LOAD: 40, MATCH_START: 50 }, { red1: 1003, blue1: 3003, blue2: 0 }),
      // Scheduled, but nothing has happened yet.
      row('Q4', 2, {}),
    ];
    expect(fieldStatuses(matches, 2)).toEqual([
      { field: 1, match: { name: 'Q3', phase: 'Match running', tone: 'live', red: [1003], blue: [3003] } },
      { field: 2, match: { name: 'Q2', phase: 'Preview on screen', tone: 'ok', red: [], blue: [] } },
    ]);
  });

  it('leaves out matches without a field', () => {
    expect(fieldStatuses([row('Q1', undefined, { MATCH_START: 5 })], 1)).toEqual([{ field: 1 }]);
  });

  it('takes the later stage when two events arrive in the same millisecond', () => {
    expect(fieldStatuses([row('Q1', 1, { MATCH_LOAD: 7, MATCH_START: 7 })], 1)[0].match?.phase).toBe('Match running');
  });

  it('names each stage of a match', () => {
    const phase = (events: Partial<MatchRow>) => fieldStatuses([row('Q1', 1, events)], 1)[0].match?.phase;
    expect(phase({ MATCH_LOAD: 1, MATCH_ABORT: 2 })).toBe('Aborted');
    expect(phase({ MATCH_START: 1, MATCH_COMMIT: 2 })).toBe('Scores committed');
    expect(phase({ SHOW_MATCH: 1, INIT_SUBMITTED: 2 })).toBe('Ready to start');
  });
});
