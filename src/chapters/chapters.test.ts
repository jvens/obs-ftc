import { describe, expect, it } from '@jest/globals';
import { ChapterOptions, buildChapters } from './chapters';
import { MatchRow } from '../store/matchDataSlice';

const START = Date.UTC(2026, 10, 7, 14, 0, 0);
const at = (minutes: number, seconds = 0) => START + (minutes * 60 + seconds) * 1000;

const OPTIONS: ChapterOptions = {
  event: 'SHOW_PREVIEW',
  offsetSeconds: 0,
  includeTestMatches: false,
  includePracticeMatches: false,
  includeTeamNumbers: false,
  streamStartTime: START,
};

const match = (name: string, previewAt: number, extra: Partial<MatchRow> = {}): MatchRow =>
  ({ name, number: Number(name.slice(1)), SHOW_PREVIEW: previewAt, ...extra });

describe('buildChapters', () => {
  it('times each match from the start of the stream, in order', () => {
    const rows = [match('Q2', at(9, 30)), match('Q1', at(2, 5)), match('Q10', at(65, 1))];
    expect(buildChapters(rows, OPTIONS)).toEqual([
      '00:00:00 Event Start',
      '00:02:05 Q1',
      '00:09:30 Q2',
      '01:05:01 Q10',
    ]);
  });

  it('times from the first match when the stream start is unknown, which then opens the video', () => {
    const rows = [match('Q1', at(2)), match('Q2', at(9))];
    expect(buildChapters(rows, { ...OPTIONS, streamStartTime: 0 })).toEqual(['00:00:00 Q1', '00:07:00 Q2']);
  });

  it('lets a match that starts with the video open it instead of Event Start', () => {
    const rows = [match('Q1', START), match('Q2', at(7))];
    expect(buildChapters(rows, OPTIONS)).toEqual(['00:00:00 Q1', '00:07:00 Q2']);
  });

  it('keeps Event Start when the offset moves the first match later', () => {
    const rows = [match('Q1', at(2)), match('Q2', at(9))];
    expect(buildChapters(rows, { ...OPTIONS, streamStartTime: 0, offsetSeconds: 30 }))
      .toEqual(['00:00:00 Event Start', '00:00:30 Q1', '00:07:30 Q2']);
  });

  it('shifts every chapter by the offset, dropping any that would start before the video', () => {
    const rows = [match('Q1', at(0, 20)), match('Q2', at(5))];
    expect(buildChapters(rows, { ...OPTIONS, offsetSeconds: -30 })).toEqual(['00:00:00 Event Start', '00:04:30 Q2']);
  });

  it('uses the match event picked', () => {
    const rows = [match('Q1', at(2), { MATCH_START: at(4) }), match('Q2', at(9))];
    expect(buildChapters(rows, { ...OPTIONS, event: 'MATCH_START' })).toEqual(['00:00:00 Event Start', '00:04:00 Q1']);
  });

  it('leaves test and practice matches out unless asked', () => {
    const rows = [match('T1', at(1)), match('P1', at(2)), match('Q1', at(3))];
    expect(buildChapters(rows, OPTIONS)).toEqual(['00:00:00 Event Start', '00:03:00 Q1']);
    expect(buildChapters(rows, { ...OPTIONS, includeTestMatches: true, includePracticeMatches: true }))
      .toEqual(['00:00:00 Event Start', '00:01:00 T1', '00:02:00 P1', '00:03:00 Q1']);
  });

  it('adds the teams when asked, with two- or three-team alliances', () => {
    const rows = [
      match('Q1', at(3), { blue1: 1001, blue2: 1002, red1: 2001, red2: 2002 }),
      match('Q2', at(9), { blue1: 1, blue2: 2, blue3: 3, red1: 4, red2: 5, red3: 6 }),
      match('Q3', at(15)),
    ];
    expect(buildChapters(rows, { ...OPTIONS, includeTeamNumbers: true })).toEqual([
      '00:00:00 Event Start',
      '00:03:00 Q1 - Blue: 1001, 1002; Red: 2001, 2002',
      '00:09:00 Q2 - Blue: 1, 2, 3; Red: 4, 5, 6',
      '00:15:00 Q3',
    ]);
  });

  it('has only the Event Start chapter before any match', () => {
    expect(buildChapters([], OPTIONS)).toEqual(['00:00:00 Event Start']);
  });
});
