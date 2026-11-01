import { UpdateType } from '../types/FtcLive';
import { MatchRow } from '../store/matchDataSlice';

export interface ChapterOptions {
  // The match event each chapter starts at.
  event: UpdateType;
  // Seconds added to every chapter, to line them up with the video.
  offsetSeconds: number;
  includeTestMatches: boolean;
  includePracticeMatches: boolean;
  includeTeamNumbers: boolean;
  // When the stream started (ms since the epoch), or 0 to time chapters from the first match.
  streamStartTime: number;
}

const teams = (row: MatchRow) => {
  const blue = [row.blue1, row.blue2, row.blue3].filter(Boolean).join(', ');
  const red = [row.red1, row.red2, row.red3].filter(Boolean).join(', ');
  return blue || red ? ` - Blue: ${blue}; Red: ${red}` : '';
};

const timestamp = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds - hours * 3600) / 60);
  const rest = Math.floor(seconds - hours * 3600 - minutes * 60);
  return [hours, minutes, rest].map(part => part.toString().padStart(2, '0')).join(':');
};

// YouTube chapter lines ("HH:MM:SS name") for the matches that reached `event`, in the order they
// reached it, after an "Event Start" chapter at the start of the video.
export const buildChapters = (rows: MatchRow[], options: ChapterOptions): string[] => {
  const matches = rows
    .filter(row => !row.name
      || ((options.includeTestMatches || !row.name.startsWith('T')) && (options.includePracticeMatches || !row.name.startsWith('P'))))
    .filter(row => row[options.event] !== undefined)
    .sort((a, b) => (a[options.event] ?? 0) - (b[options.event] ?? 0));

  const reference = options.streamStartTime > 0 ? options.streamStartTime : matches[0]?.[options.event] ?? 0;
  const lines = ['00:00:00 Event Start'];
  for (const row of matches) {
    const seconds = ((row[options.event] ?? 0) - reference) / 1000 + options.offsetSeconds;
    // Before the stream started.
    if (seconds < 0) continue;
    lines.push(`${timestamp(seconds)} ${row.name}${options.includeTeamNumbers ? teams(row) : ''}`);
  }
  return lines;
};
