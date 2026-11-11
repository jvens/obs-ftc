import React, { useMemo, useCallback } from "react"
import { usePersistentState } from "../helpers/persistant";
import { UpdateType } from "../types/FtcLive";
import { useObsStudio } from "../contexts/ObsStudioContext";
import { useAppSelector } from "../store/hooks";
import { buildChapters } from "../chapters/chapters";
import OutputCard from './OutputCard';

const ChapterEventOptions: { value: UpdateType; label: string }[] = [
  { value: 'SHOW_PREVIEW', label: 'Show Preview' },
  { value: 'SHOW_RANDOM', label: 'Show Random' },
  { value: 'SHOW_MATCH', label: 'Show Match' },
  { value: 'MATCH_START', label: 'Match Start' },
  { value: 'MATCH_POST', label: 'Match Post' },
];

// Convert HH:MM:SS time string to milliseconds timestamp for today
const timeStringToTimestamp = (timeStr: string): number => {
  const [hours, minutes, seconds] = timeStr.split(':').map(Number);
  const now = new Date();
  now.setHours(hours, minutes, seconds, 0);
  return now.getTime();
};

// Convert milliseconds timestamp to HH:MM:SS time string
const timestampToTimeString = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toTimeString().slice(0, 8); // HH:MM:SS
};

const ChaptersSettings: React.FC = () => {
  const rows = useAppSelector(state => state.matchData.matches);
  const [chapterEvent, setChapterEvent] = usePersistentState<UpdateType>('Chapter_Event', 'SHOW_PREVIEW')
  const [offsetTime, setOffsetTime] = usePersistentState<number>('Chapter_Offset_Time', 0)
  const [includeTestMatches, setIncludeTestMatches] = usePersistentState<boolean>('Chapter_Include_Test', false)
  const [includePracticeMatches, setIncludePracticeMatches] = usePersistentState<boolean>('Chapter_Include_Practice', false)
  const [includeTeamNumbers, setIncludeTeamNumbers] = usePersistentState<boolean>('Chapter_Include_Team_Numbers', false)
  const [streamStartTime, setStreamStartTime] = usePersistentState<number>('Chapter_Stream_Start_Time', 0)

  const { startStreamTime: obsStreamTime } = useObsStudio()

  const syncToStreamTime = useCallback(() => {
    if (obsStreamTime > 0) {
      setStreamStartTime(obsStreamTime);
    }
  }, [obsStreamTime, setStreamStartTime]);

  const chapters = useMemo(() => buildChapters(rows, {
    event: chapterEvent,
    offsetSeconds: offsetTime,
    includeTestMatches,
    includePracticeMatches,
    includeTeamNumbers,
    streamStartTime,
  }), [rows, chapterEvent, offsetTime, includeTestMatches, includePracticeMatches, includeTeamNumbers, streamStartTime]);

  const chaptersText = useMemo(() => chapters.join('\n'), [chapters]);

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(chaptersText).catch(err => {
      console.error('Failed to copy chapters:', err);
    });
  }, [chaptersText]);

  return (
    <OutputCard
      title="YouTube Chapters"
      hint="Chapters for the stream's video, one per match, to paste into its description on YouTube."
    >
      <div className="output-fields">
        <label>
          Chapter at
          <select value={chapterEvent} onChange={(e) => setChapterEvent(e.target.value as UpdateType)}>
            {ChapterEventOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label>
          Stream start time
          <span className="output-field-row">
            <input
              type="time"
              step="1"
              value={streamStartTime > 0 ? timestampToTimeString(streamStartTime) : ''}
              onChange={(e) => setStreamStartTime(e.target.value ? timeStringToTimestamp(e.target.value) : 0)}
            />
            <button onClick={syncToStreamTime} disabled={obsStreamTime === 0} title="Use the time OBS started streaming">Sync with OBS</button>
          </span>
        </label>
        <label>
          Video offset (seconds)
          <input type="number" value={offsetTime} onChange={(e) => setOffsetTime(parseInt(e.target.value) || 0)} />
        </label>
      </div>

      <div className="output-checks">
        <label>
          <input type="checkbox" checked={includeTestMatches} onChange={(e) => setIncludeTestMatches(e.target.checked)} />
          Include test matches
        </label>
        <label>
          <input type="checkbox" checked={includePracticeMatches} onChange={(e) => setIncludePracticeMatches(e.target.checked)} />
          Include practice matches
        </label>
        <label>
          <input type="checkbox" checked={includeTeamNumbers} onChange={(e) => setIncludeTeamNumbers(e.target.checked)} />
          Include team numbers
        </label>
      </div>

      <div className="chapters-output">
        <div className="chapters-header">
          <span>{chapters.length} chapters</span>
          <button onClick={copyToClipboard}>Copy to Clipboard</button>
        </div>
        <textarea className="chapters-textarea" aria-label="Chapters" value={chaptersText} readOnly />
      </div>
    </OutputCard>
  )
}

export default ChaptersSettings
