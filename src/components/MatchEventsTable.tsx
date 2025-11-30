import React, { useEffect, useState, useMemo, useCallback } from "react"
import { useFtcLive } from "../contexts/FtcLiveContext";
import { usePersistentState } from "../helpers/persistant";
import { FtcMatch } from "../types/FtcLive";
import {useObsStudio} from "../contexts/ObsStudioContext";

interface MatchRow {
  number: number;
  name: string;
  scheduledTime?: number;
  blue1?: number;
  blue2?: number;
  blue3?: number;
  red1?: number;
  red2?: number;
  red3?: number;
  MATCH_LOAD?: number;
  SHOW_PREVIEW?: number;
  SHOW_RANDOM?: number;
  SHOW_MATCH?: number;
  MATCH_START?: number;
  MATCH_ABORT?: number;
  MATCH_COMMIT?: number;
  MATCH_POST?: number;
  replayFile?: string;
  recordingFile?: string;
  previewScreenshot?: string;
  randomScreenshot?: string;
  scoreScreenshot?: string;
}

type SortKey = keyof MatchRow;
type SortDirection = 'asc' | 'desc';

const MatchEventsTable: React.FC = () => {
  const [rows, setRows] = usePersistentState<MatchRow[]>('Match_Events', [])
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  // const [teams, setTeams] = usePersistentState<Team[]>('Teams', [])
  const [chapters, setChapters] = usePersistentState<string[]>('Video_Chapters', [])
  const [offsetTime, setOffsetTime] = usePersistentState<number>('Offset_Time', 0)
  const [showPaths, setShowPaths] = usePersistentState<boolean>('Show_Paths', false)
  const { serverUrl, selectedEvent , recordings, clearRecordings, enableScreenshots, enableReplayBuffer, enableMatchRecording } = useFtcLive()
  const { latestStreamData , isConnected} = useFtcLive()

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
  const { startStreamTime } = useObsStudio()
  const [useStreamTime, setUseStreamTime] = usePersistentState<boolean>('Use_Stream_Time', false)

  useEffect(() => {
    if (latestStreamData) {
      setRows(currentRows => {
        // Check if the row already exists
        const rowIndex = currentRows.findIndex(row => row.name === latestStreamData.payload.shortName);
        if (rowIndex !== -1) {
          console.log('update row');
          // Clone the array and update the specific row
          const newRows = [...currentRows];
          let newRow = { ...newRows[rowIndex] };
          newRow[latestStreamData.updateType] = latestStreamData.updateTime;
          newRow.name = latestStreamData.payload.shortName;
          newRows[rowIndex] = newRow;
          return newRows;
        } else {
          console.log('create new row');
          // Create a new row and add it to the array
          let newRow: MatchRow = {
            number: latestStreamData.payload.number,
            name: latestStreamData.payload.shortName,
            [latestStreamData.updateType]: latestStreamData.updateTime
          };
          return [...currentRows, newRow];
        }
      });
    }
  }, [latestStreamData, setRows]); // Removed 'rows' and 'setRows' from the dependencies

  useEffect(() => {
    setRows(currentRows => {
      const newRows = [];
      for (let row of currentRows) {
        let newRow = { ...row }
        if (recordings[row.name]) {
          newRow.recordingFile = recordings[row.name].recording;
          newRow.replayFile = recordings[row.name].replay;
          newRow.previewScreenshot = recordings[row.name].preview;
          newRow.randomScreenshot = recordings[row.name].random;
          newRow.scoreScreenshot = recordings[row.name].score;
        }
        newRows.push(newRow);
      }
      return newRows;
    })
  }, [setRows, recordings]);

  useEffect(() => {
    // const getTeamName = (number?: number) => {
    //   if (!number) return undefined;
    //   return teams.find(team => team.number === number)
    // }
    const firstTime = rows[0]?.SHOW_PREVIEW ?? 0
    let chapters: string[] = rows.map(r => {
      let allianceString = '';
      if (r.blue1 && r.red1) {
        let blueTeams = `${r.blue1}, ${r.blue2}`
        if (r.blue3)
          blueTeams += `, ${r.blue3}`
        let redTeams = `${r.red1}, ${r.red2}`
        if (r.red3)
          redTeams += `, ${r.red3}`
        allianceString = `- Blue: ${blueTeams}; Red: ${redTeams}`
      }
      let time = ((r.SHOW_PREVIEW ?? 0) - firstTime)/1000 + offsetTime
      const hours = Math.floor(time/3600)
      time -= hours * 3600
      const minutes = Math.floor(time/60)
      time -= minutes * 60
      const seconds = Math.floor(time)
      const timeString = `${hours < 10 ? '0' + hours : hours}:${minutes < 10 ? '0' + minutes : minutes}:${seconds < 10 ? '0' + seconds : seconds}`
      return `${timeString} ${r.name} ${allianceString}`
    })
    setChapters(['00:00:00 Event Start', ...chapters])
  }, [rows, setChapters, offsetTime, startStreamTime, useStreamTime])

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
        const rowIndex = rows.findIndex(row => row.name === match.matchName)
        let row: MatchRow;
        if (rowIndex !== -1) {
          row = { ...rows[rowIndex] }
        } else {
          row = { name: match.matchName, number: match.matchNumber }
        }
        row.blue1 = match.blue.team1
        row.blue2 = match.blue.team2
        row.blue3 = match.blue.team3
        row.red1 = match.red.team1
        row.red2 = match.red.team2
        row.red3 = match.red.team3
        row.scheduledTime = match.time
        return row
      })
      setRows(newRows)
      // const teamsResponse = await fetch(`http://${serverUrl}/api/v1/events/${selectedEvent?.eventCode}/teams/`)
      // const teamNumbers = (await teamsResponse.json()).teamNumbers as number[];
      // const newTeams = await Promise.all(teamNumbers.map(async teamNumber => {
      //   let retryCount = 0;
      //   let teamDataResponse = await fetch(`http://${serverUrl}/api/v1/events/${selectedEvent?.eventCode}/teams/${teamNumber}/`)
      //   while(retryCount < 10 && teamDataResponse.status === 429) {
      //       retryCount++;
      //       await delay(60 * 5); // wait 5 minute before trying again
      //   }
      //   const teamData = (await teamDataResponse.json()) as TeamData;
      //   return {
      //     number: teamNumber,
      //     name: teamData.name
      //   };
      // }))
      // setTeams(newTeams)
    } catch (error) {
      console.error('Fetching matches failed: ', error)
    }
  }

  const clearRows = () => {
    setRows([])
    // setTeams([])
    clearRecordings();
    setOffsetTime(0)
    setUseStreamTime(false)
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
      <br />
      Video Offset Time (seconds to Match 1 Show Preview)
      <input
        type="number"
        placeholder='Offset Time'
        value={offsetTime}
        onChange={(e) => setOffsetTime(parseInt(e.target.value))}
      />
      <br />
      Use streaming start time {new Date(startStreamTime).toLocaleTimeString()} for reference time:
      <input type="checkbox"
             checked={useStreamTime}
             onChange={(e) => setUseStreamTime(e.target.checked)}
      />
      <br />
      <div>
        {chapters.map((chapter, i) => (<div key={i}>{chapter}</div>))}
      </div>

    </div>
  )
}

export default MatchEventsTable