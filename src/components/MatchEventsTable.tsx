import React, { useEffect } from "react"
import { useFtcLive } from "../contexts/FtcLiveContext";
import { usePersistentState } from "../helpers/persistant";
import { FtcMatch } from "../types/FtcLive";
import { TypeParameterDeclaration } from "typescript";
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
  scoreScreenshot?: string;
}

type TeamData = {
  number: number;
  name: string;
  school: string;
  cit: string;
  state: string;
  country: string;
  rookie: number;
}

type Team = {
  number: number;
  name: string;
}

const MatchEventsTable: React.FC = () => {
  const [rows, setRows] = usePersistentState<MatchRow[]>('Match_Events', [])
  // const [teams, setTeams] = usePersistentState<Team[]>('Teams', [])
  const [chapters, setChapters] = usePersistentState<string[]>('Video_Chapters', [])
  const [offsetTime, setOffsetTime] = usePersistentState<number>('Offset_Time', 0)
  const { serverUrl, selectedEvent , recordings, clearRecordings} = useFtcLive()
  const { latestStreamData , isConnected} = useFtcLive()
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

  const delay = (seconds: number) => {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000))
  }

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
    <div className="section">
      <button className="matches-button" onClick={fetchMatches} disabled={!isConnected}>Get Match List</button>
      <button className="matches-button" onClick={clearRows}>Clear All Data</button>
      <button className="matches-button" onClick={exportData}>Export Data</button>
      <table className="matches-table">
        <thead>
          <tr>
            <th>Number</th>
            <th>Name</th>
            <th>Scheduled</th>
            <th>Blue</th>
            <th>Red</th>
            <th>LOAD</th>
            <th>PREVIEW</th>
            {/* <th>SHOW RANDOM</th> */}
            <th>SHOW</th>
            <th>START</th>
            <th>ABORT</th>
            <th>COMMIT</th>
            <th>POST</th>
            <th>Recording</th>
            <th>Replay</th>
            <th>Preview</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.number}>
              <td>{row.number}</td>
              <td>{row.name}</td>
              <td>{row.scheduledTime ? new Date(row.scheduledTime).toLocaleTimeString() : ''}</td>
              <td>
                {row.blue1}<br />
                {row.blue2}<br/>
                {row.blue3}
              </td>
              <td>
                {row.red1}<br />
                {row.red2}<br />
                {row.red3}
              </td>
              <td>{row.MATCH_LOAD ? new Date(row.MATCH_LOAD).toLocaleTimeString() : ''}</td>
              <td>{row.SHOW_PREVIEW ? new Date(row.SHOW_PREVIEW).toLocaleTimeString() : ''}</td>
              <td>{row.SHOW_RANDOM ? new Date(row.SHOW_RANDOM).toLocaleTimeString() : ''}</td>
              <td>{row.SHOW_MATCH ? new Date(row.SHOW_MATCH).toLocaleTimeString() : ''}</td>
              <td>{row.MATCH_START ? new Date(row.MATCH_START).toLocaleTimeString() : ''}</td>
              <td>{row.MATCH_ABORT ? new Date(row.MATCH_ABORT).toLocaleTimeString() : ''}</td>
              <td>{row.MATCH_COMMIT ? new Date(row.MATCH_COMMIT).toLocaleTimeString() : ''}</td>
              <td>{row.MATCH_POST ? new Date(row.MATCH_POST).toLocaleTimeString() : ''}</td>
              <td>{row.recordingFile && <a href={`file:///${row.recordingFile}`} download={`${row.name}_recording.mkv`}>Link</a>}</td>
              <td>{row.replayFile && <a href={`file:///${row.replayFile}`} download={`${row.name}_replay.mkv`}>Link</a>}</td>
              <td>{row.previewScreenshot && <a href={`file:///${row.previewScreenshot}`} download={`${row.name}_preview.png`}>Link</a>}</td>
              <td>{row.scoreScreenshot && <a href={`file:///${row.scoreScreenshot}`} download={`${row.name}_score.png`}>Link</a>}</td>
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