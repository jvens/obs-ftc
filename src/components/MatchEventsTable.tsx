import React, { useState, useMemo, useCallback } from "react"
import { useFtcLive } from "../contexts/FtcLiveContext";
import { usePersistentState } from "../helpers/persistant";
import { FtcMatch } from "../types/FtcLive";
import { useAppSelector, useAppDispatch } from "../store/hooks";
import { MatchRow, setMatches, clearAllData } from "../store/matchDataSlice";

type SortKey = keyof MatchRow;
type SortDirection = 'asc' | 'desc';

const MatchEventsTable: React.FC = () => {
  const dispatch = useAppDispatch();
  const rows = useAppSelector(state => state.matchData.matches);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [showPaths, setShowPaths] = usePersistentState<boolean>('Show_Paths', false)
  const { serverUrl, selectedEvent, enableScreenshots, enableReplayBuffer, enableMatchRecording } = useFtcLive()
  const { isConnected } = useFtcLive()

  // Determine which column groups to show
  const numberVideos = (enableMatchRecording ? 1 : 0) + (enableReplayBuffer ? 1 : 0);
  const showScreenshots = enableScreenshots;

  // Copy file path to clipboard
  const copyToClipboard = useCallback((path: string) => {
    navigator.clipboard.writeText(path).then(() => {
      // Could add a toast notification here
    }).catch(err => {
      console.error('Failed to copy path:', err);
    });
  }, []);

  // Sorting logic
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  // Parse match name into prefix and number for natural sorting
  const parseMatchName = (name: string): { prefix: string; num: number } => {
    const match = name.match(/^([A-Za-z]+)-?(\d+)$/);
    if (match) {
      return { prefix: match[1].toUpperCase(), num: parseInt(match[2], 10) };
    }
    return { prefix: name, num: 0 };
  };

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      // Handle undefined values - put them at the end
      if (aVal === undefined && bVal === undefined) return 0;
      if (aVal === undefined) return 1;
      if (bVal === undefined) return -1;

      // Compare values
      let comparison = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        // Use natural sorting for match names
        if (sortKey === 'name') {
          const aParsed = parseMatchName(aVal);
          const bParsed = parseMatchName(bVal);
          comparison = aParsed.prefix.localeCompare(bParsed.prefix);
          if (comparison === 0) {
            comparison = aParsed.num - bParsed.num;
          }
        } else {
          comparison = aVal.localeCompare(bVal);
        }
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [rows, sortKey, sortDirection]);

  const getSortClass = (key: SortKey) => {
    if (sortKey !== key) return 'sortable';
    return `sortable sorted-${sortDirection}`;
  };

  const fetchMatches = async () => {
    console.log('fetching matches')
    try {
      const response = await fetch(`http://${serverUrl}/api/v1/events/${selectedEvent?.eventCode}/matches/`)
      const matches = (await response.json()).matches as FtcMatch[];
      const newRows = matches.map(match => {
        const existingRow = rows.find(row => row.name === match.matchName);
        const row: MatchRow = existingRow
          ? { ...existingRow }
          : { name: match.matchName, number: match.matchNumber };

        row.blue1 = match.blue.team1;
        row.blue2 = match.blue.team2;
        row.blue3 = match.blue.team3;
        row.red1 = match.red.team1;
        row.red2 = match.red.team2;
        row.red3 = match.red.team3;
        row.scheduledTime = match.time;
        return row;
      });
      dispatch(setMatches(newRows));
    } catch (error) {
      console.error('Fetching matches failed: ', error)
    }
  }

  const clearRows = () => {
    dispatch(clearAllData());
  }

  const exportData = () => {
    const fileData = JSON.stringify({matches: rows}, null, 2);
    const blob = new Blob([fileData], {type: 'application/json'});
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.download = `${selectedEvent?.eventCode ?? 'event_data'}.json`
    link.href = url;
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <div className="section full-width">
      <h2>Match Events</h2>
      <button className="matches-button" onClick={fetchMatches} disabled={!isConnected}>Get Match List</button>
      <button className="matches-button" onClick={clearRows}>Clear All Data</button>
      <button className="matches-button" onClick={exportData}>Export Data</button>

      {(numberVideos > 0 || showScreenshots) && <><input type="checkbox" checked={showPaths} onChange={(e) => setShowPaths(e.target.checked)} /> Show File Paths </>}

      <table className="matches-table">
        <thead>
          <tr>
            <th colSpan={5} className="col-group-header col-group-info">Match Info</th>
            <th colSpan={8} className="col-group-header col-group-timestamps">Event Timestamps</th>
            {numberVideos > 0 && <th colSpan={numberVideos} className="col-group-header col-group-recordings">Videos</th>}
            {showScreenshots && <th colSpan={3} className="col-group-header col-group-screenshots">Screenshots</th>}
          </tr>
          <tr>
            <th className={`col-group-info ${getSortClass('number')}`} onClick={() => handleSort('number')}>Number</th>
            <th className={`col-group-info ${getSortClass('name')}`} onClick={() => handleSort('name')}>Name</th>
            <th className={`col-group-info ${getSortClass('scheduledTime')}`} onClick={() => handleSort('scheduledTime')}>Scheduled</th>
            <th className="col-group-info">Blue</th>
            <th className="col-group-info">Red</th>
            <th className={`col-group-timestamps ${getSortClass('MATCH_LOAD')}`} onClick={() => handleSort('MATCH_LOAD')}>LOAD</th>
            <th className={`col-group-timestamps ${getSortClass('SHOW_PREVIEW')}`} onClick={() => handleSort('SHOW_PREVIEW')}>PREVIEW</th>
            <th className={`col-group-timestamps ${getSortClass('SHOW_RANDOM')}`} onClick={() => handleSort('SHOW_RANDOM')}>RANDOM</th>
            <th className={`col-group-timestamps ${getSortClass('SHOW_MATCH')}`} onClick={() => handleSort('SHOW_MATCH')}>SHOW</th>
            <th className={`col-group-timestamps ${getSortClass('MATCH_START')}`} onClick={() => handleSort('MATCH_START')}>START</th>
            <th className={`col-group-timestamps ${getSortClass('MATCH_ABORT')}`} onClick={() => handleSort('MATCH_ABORT')}>ABORT</th>
            <th className={`col-group-timestamps ${getSortClass('MATCH_COMMIT')}`} onClick={() => handleSort('MATCH_COMMIT')}>COMMIT</th>
            <th className={`col-group-timestamps ${getSortClass('MATCH_POST')}`} onClick={() => handleSort('MATCH_POST')}>POST</th>
            {enableMatchRecording && <th className="col-group-recordings">Recording</th>}
            {enableReplayBuffer && <th className="col-group-recordings">Replay</th>}
            {showScreenshots && <th className="col-group-screenshots">Preview</th>}
            {showScreenshots && <th className="col-group-screenshots">Random</th>}
            {showScreenshots && <th className="col-group-screenshots">Score</th>}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map(row => (
            <tr key={row.name}>
              <td className="col-info">{row.number}</td>
              <td className="col-info">{row.name}</td>
              <td className="col-info">{row.scheduledTime ? new Date(row.scheduledTime).toLocaleTimeString() : ''}</td>
              <td className="col-info">
                {row.blue1}<br />
                {row.blue2}<br/>
                {row.blue3}
              </td>
              <td className="col-info">
                {row.red1}<br />
                {row.red2}<br />
                {row.red3}
              </td>
              <td className="col-timestamps">{row.MATCH_LOAD ? new Date(row.MATCH_LOAD).toLocaleTimeString() : ''}</td>
              <td className="col-timestamps">{row.SHOW_PREVIEW ? new Date(row.SHOW_PREVIEW).toLocaleTimeString() : ''}</td>
              <td className="col-timestamps">{row.SHOW_RANDOM ? new Date(row.SHOW_RANDOM).toLocaleTimeString() : ''}</td>
              <td className="col-timestamps">{row.SHOW_MATCH ? new Date(row.SHOW_MATCH).toLocaleTimeString() : ''}</td>
              <td className="col-timestamps">{row.MATCH_START ? new Date(row.MATCH_START).toLocaleTimeString() : ''}</td>
              <td className="col-timestamps">{row.MATCH_ABORT ? new Date(row.MATCH_ABORT).toLocaleTimeString() : ''}</td>
              <td className="col-timestamps">{row.MATCH_COMMIT ? new Date(row.MATCH_COMMIT).toLocaleTimeString() : ''}</td>
              <td className="col-timestamps">{row.MATCH_POST ? new Date(row.MATCH_POST).toLocaleTimeString() : ''}</td>
              {enableMatchRecording && <td className="col-recordings">{row.recordingFile && <span className="file-link" onClick={() => copyToClipboard(row.recordingFile!)} title={row.recordingFile}>{showPaths ? row.recordingFile : 'Copy Path'}</span>}</td>}
              {enableReplayBuffer && <td className="col-recordings">{row.replayFile && <span className="file-link" onClick={() => copyToClipboard(row.replayFile!)} title={row.replayFile}>{showPaths ? row.replayFile : 'Copy Path'}</span>}</td>}
              {showScreenshots && <td className="col-screenshots">{row.previewScreenshot && <span className="file-link" onClick={() => copyToClipboard(row.previewScreenshot!)} title={row.previewScreenshot}>{showPaths ? row.previewScreenshot : 'Copy Path'}</span>}</td>}
              {showScreenshots && <td className="col-screenshots">{row.randomScreenshot && <span className="file-link" onClick={() => copyToClipboard(row.randomScreenshot!)} title={row.randomScreenshot}>{showPaths ? row.randomScreenshot : 'Copy Path'}</span>}</td>}
              {showScreenshots && <td className="col-screenshots">{row.scoreScreenshot && <span className="file-link" onClick={() => copyToClipboard(row.scoreScreenshot!)} title={row.scoreScreenshot}>{showPaths ? row.scoreScreenshot : 'Copy Path'}</span>}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default MatchEventsTable
