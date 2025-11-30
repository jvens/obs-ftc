import React, { useMemo, useCallback } from "react"
import { usePersistentState } from "../helpers/persistant";
import { UpdateType } from "../types/FtcLive";
import { useObsStudio } from "../contexts/ObsStudioContext";
import { useAppSelector } from "../store/hooks";
import { MatchRow } from "../store/matchDataSlice";

const ChapterEventOptions: { value: UpdateType; label: string }[] = [
  { value: 'SHOW_PREVIEW', label: 'Show Preview' },
  { value: 'SHOW_RANDOM', label: 'Show Random' },
  { value: 'SHOW_MATCH', label: 'Show Match' },
  { value: 'MATCH_START', label: 'Match Start' },
  { value: 'MATCH_POST', label: 'Match Post' },
];

const ChaptersSettings: React.FC = () => {
  const rows = useAppSelector(state => state.matchData.matches);
  const [chapterEvent, setChapterEvent] = usePersistentState<UpdateType>('Chapter_Event', 'SHOW_PREVIEW')
  const [offsetTime, setOffsetTime] = usePersistentState<number>('Chapter_Offset_Time', 0)
  const [includeTestMatches, setIncludeTestMatches] = usePersistentState<boolean>('Chapter_Include_Test', false)
  const [includeTeamNumbers, setIncludeTeamNumbers] = usePersistentState<boolean>('Chapter_Include_Team_Numbers', false)
  const [useStreamTime, setUseStreamTime] = usePersistentState<boolean>('Chapter_Use_Stream_Time', false)

  const { startStreamTime } = useObsStudio()

  const formatTeamInfo = useCallback((row: MatchRow): string => {
    if (!includeTeamNumbers) return '';

    const blueTeams = [row.blue1, row.blue2, row.blue3]
      .filter(Boolean)
      .join(', ');
    const redTeams = [row.red1, row.red2, row.red3]
      .filter(Boolean)
      .join(', ');

    if (!blueTeams && !redTeams) return '';
    return ` - Blue: ${blueTeams}; Red: ${redTeams}`;
  }, [includeTeamNumbers]);

  const chapters = useMemo(() => {
    // Filter rows based on includeTestMatches
    let filteredRows = rows.filter(r => {
      // Test matches typically start with 'T' or 'P' (practice)
      const isTestMatch = r.name && (r.name.startsWith('T') || r.name.startsWith('P'));
      return includeTestMatches || !isTestMatch;
    });

    // Filter out rows that don't have the selected event timestamp
    filteredRows = filteredRows.filter(r => r[chapterEvent] !== undefined);

    // Sort by the selected event timestamp
    filteredRows = [...filteredRows].sort((a, b) => {
      const aTime = a[chapterEvent] ?? 0;
      const bTime = b[chapterEvent] ?? 0;
      return aTime - bTime;
    });

    // Calculate reference time
    let referenceTime: number;
    if (useStreamTime && startStreamTime > 0) {
      referenceTime = startStreamTime;
    } else {
      referenceTime = filteredRows[0]?.[chapterEvent] ?? 0;
    }

    const chapterLines: string[] = [];

    // Add event start chapter
    chapterLines.push('00:00:00 Event Start');

    for (const row of filteredRows) {
      const eventTime = row[chapterEvent];
      if (eventTime === undefined) continue;

      let time = (eventTime - referenceTime) / 1000 + offsetTime;

      // Skip negative times
      if (time < 0) continue;

      const hours = Math.floor(time / 3600);
      time -= hours * 3600;
      const minutes = Math.floor(time / 60);
      time -= minutes * 60;
      const seconds = Math.floor(time);

      const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      const allianceString = formatTeamInfo(row);

      chapterLines.push(`${timeString} ${row.name}${allianceString}`);
    }

    return chapterLines;
  }, [rows, chapterEvent, offsetTime, includeTestMatches, useStreamTime, startStreamTime, formatTeamInfo]);

  const chaptersText = useMemo(() => chapters.join('\n'), [chapters]);

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(chaptersText).catch(err => {
      console.error('Failed to copy chapters:', err);
    });
  }, [chaptersText]);

  return (
    <div className="section">
      <h2>YouTube Video Chapters</h2>

      <div className="chapters-options">
        <div className="chapters-option-row">
          <label htmlFor="chapter-event">Chapter Event:</label>
          <select
            id="chapter-event"
            value={chapterEvent}
            onChange={(e) => setChapterEvent(e.target.value as UpdateType)}
          >
            {ChapterEventOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="chapters-option-row">
          <label htmlFor="video-offset">Video Offset (seconds):</label>
          <input
            id="video-offset"
            type="number"
            value={offsetTime}
            onChange={(e) => setOffsetTime(parseInt(e.target.value) || 0)}
          />
        </div>

        <div className="chapters-option-row">
          <label>
            <input
              type="checkbox"
              checked={useStreamTime}
              onChange={(e) => setUseStreamTime(e.target.checked)}
            />
            Use stream start time as reference
            {startStreamTime > 0 && ` (${new Date(startStreamTime).toLocaleTimeString()})`}
          </label>
        </div>

        <div className="chapters-option-row">
          <label>
            <input
              type="checkbox"
              checked={includeTestMatches}
              onChange={(e) => setIncludeTestMatches(e.target.checked)}
            />
            Include test/practice matches
          </label>
        </div>

        <div className="chapters-option-row">
          <label>
            <input
              type="checkbox"
              checked={includeTeamNumbers}
              onChange={(e) => setIncludeTeamNumbers(e.target.checked)}
            />
            Include team numbers
          </label>
        </div>
      </div>

      <div className="chapters-output">
        <div className="chapters-header">
          <span>{chapters.length} chapters</span>
          <button onClick={copyToClipboard}>Copy to Clipboard</button>
        </div>
        <textarea
          className="chapters-textarea"
          value={chaptersText}
          readOnly
        />
      </div>
    </div>
  )
}

export default ChaptersSettings
