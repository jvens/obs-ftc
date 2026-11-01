import React, { useMemo, useCallback } from "react"
import { usePersistentState } from "../helpers/persistant";
import { UpdateType } from "../types/FtcLive";
import { useObsStudio } from "../contexts/ObsStudioContext";
import { useAppSelector } from "../store/hooks";
import { buildChapters } from "../chapters/chapters";

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
          <label htmlFor="stream-start-time">Stream Start Time:</label>
          <input
            id="stream-start-time"
            type="time"
            step="1"
            value={streamStartTime > 0 ? timestampToTimeString(streamStartTime) : ''}
            onChange={(e) => setStreamStartTime(e.target.value ? timeStringToTimestamp(e.target.value) : 0)}
          />
          <button onClick={syncToStreamTime} disabled={obsStreamTime === 0}>
            Sync with OBS
          </button>
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
              checked={includeTestMatches}
              onChange={(e) => setIncludeTestMatches(e.target.checked)}
            />
            Include test matches
          </label>
        </div>

        <div className="chapters-option-row">
          <label>
            <input
              type="checkbox"
              checked={includePracticeMatches}
              onChange={(e) => setIncludePracticeMatches(e.target.checked)}
            />
            Include practice matches
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
