import React, { useEffect, useState } from "react"
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
  const [teams, setTeams] = usePersistentState<Team[]>('Teams', [])
  const [chapters, setChapters] = usePersistentState<string[]>('Video_Chapters', [])
  const [offsetTime, setOffsetTime] = usePersistentState<number>('Offset_Time', 0)
  const { isConnected, serverUrl, selectedEvent } = useFtcLive()
  const { latestStreamData } = useFtcLive()
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
    const getTeamName = (number?: number) => {
      if (!number) return undefined;
      return teams.find(team => team.number === number)
    }


    rows.sort((prev, curr) => {
      // Ensure that values without preview times get sorted to the end
      // Otherwise when loading a match list, you get weird negative values on run matches
      const prev_time = prev.SHOW_PREVIEW ?? 0
      const curr_time = curr.SHOW_PREVIEW ?? 0
      // Use match number as a tie-breaker
      if(prev_time === curr_time) return prev.number-curr.number
      if(prev_time === 0) return 1
      if(curr_time === 0) return -1
      return prev_time - curr_time
    });

    const firstTime = useStreamTime? startStreamTime:rows[0]?.SHOW_PREVIEW ?? 0
    let chapters: string[] = rows.map(r => {
      let blueTeams = `${r.blue1} ${getTeamName(r.blue1)?.name}, ${r.blue2} ${getTeamName(r.blue2)?.name}`
      if (r.blue3)
        blueTeams += `${r.blue3} ${getTeamName(r.blue3)?.name}`
      let redTeams = `${r.red1} ${getTeamName(r.red1)?.name}, ${r.red2} ${getTeamName(r.red2)?.name}`
      if (r.red3)
        redTeams += `${r.red3} ${getTeamName(r.red3)?.name}`
      let time = ((r.SHOW_PREVIEW ?? 0) - firstTime) / 1000 + offsetTime
      let timeString = "N/A"
      if (time>=0) {
        // Negative times look bad so show N/A instead
        const hours = Math.floor(time / 3600)
        time -= hours * 3600
        const minutes = Math.floor(time / 60)
        time -= minutes * 60
        const seconds = Math.floor(time)
        timeString = `${hours < 10 ? '0' + hours : hours}:${minutes < 10 ? '0' + minutes : minutes}:${seconds < 10 ? '0' + seconds : seconds}`
      }
      return `${timeString} ${r.name} - Blue: ${blueTeams}; Red: ${redTeams}`
    })
    setChapters(['00:00:00 Event Start', ...chapters])
  }, [rows, setChapters, teams, offsetTime, startStreamTime, useStreamTime])

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
      const teamsResponse = await fetch(`http://${serverUrl}/api/v1/events/${selectedEvent?.eventCode}/teams/`)
      const teamNumbers = (await teamsResponse.json()).teamNumbers as number[];
      const newTeams = await Promise.all(teamNumbers.map(async teamNumber => {
        let retryCount = 0;
        let teamDataResponse = await fetch(`http://${serverUrl}/api/v1/events/${selectedEvent?.eventCode}/teams/${teamNumber}/`)
        while (retryCount < 10 && teamDataResponse.status === 429) {
          retryCount++;
          await delay(60 * 5); // wait 5 minute before trying again
        }
        const teamData = (await teamDataResponse.json()) as TeamData;
        return {
          number: teamNumber,
          name: teamData.name
        };
      }))
      setTeams(newTeams)
    } catch (error) {
      console.error('Fetching matches failed: ', error)
    }
  }

  const clearRows = () => {
    setRows([])
    setTeams([])
    setOffsetTime(0)
    setUseStreamTime(false)
  }

  const exportData = () => {
    const fileData = JSON.stringify({ matches: rows, teams: teams }, null, 2);
    const blob = new Blob([fileData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.download = `${selectedEvent?.eventCode ?? 'event_data'}.json`
    link.href = url;
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <div className="section">
      <button onClick={fetchMatches} disabled={!isConnected}>Get Match List</button>
      <button onClick={clearRows}>Clear All Data</button>
      <button onClick={exportData}>Export Data</button>
      <table>
        <thead>
          <tr>
            <th>Number</th>
            <th>Name</th>
            <th>Schedule Time</th>
            <th>Blue 1</th>
            <th>Blue 2</th>
            <th>Blue 3</th>
            <th>Red 1</th>
            <th>Red 2</th>
            <th>Red 3</th>
            <th>LOAD</th>
            <th>SHOW PREVIEW</th>
            <th>SHOW RANDOM</th>
            <th>SHOW MATCH</th>
            <th>START</th>
            <th>ABORT</th>
            <th>COMMIT</th>
            <th>POST</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.number}>
              <td>{row.number}</td>
              <td>{row.name}</td>
              <td>{row.scheduledTime ? new Date(row.scheduledTime).toLocaleTimeString() : ''}</td>
              <td>{row.blue1}</td>
              <td>{row.blue2}</td>
              <td>{row.blue3}</td>
              <td>{row.red1}</td>
              <td>{row.red2}</td>
              <td>{row.red3}</td>
              <td>{row.MATCH_LOAD ? new Date(row.MATCH_LOAD).toLocaleTimeString() : ''}</td>
              <td>{row.SHOW_PREVIEW ? new Date(row.SHOW_PREVIEW).toLocaleTimeString() : ''}</td>
              <td>{row.SHOW_RANDOM ? new Date(row.SHOW_RANDOM).toLocaleTimeString() : ''}</td>
              <td>{row.SHOW_MATCH ? new Date(row.SHOW_MATCH).toLocaleTimeString() : ''}</td>
              <td>{row.MATCH_START ? new Date(row.MATCH_START).toLocaleTimeString() : ''}</td>
              <td>{row.MATCH_ABORT ? new Date(row.MATCH_ABORT).toLocaleTimeString() : ''}</td>
              <td>{row.MATCH_COMMIT ? new Date(row.MATCH_COMMIT).toLocaleTimeString() : ''}</td>
              <td>{row.MATCH_POST ? new Date(row.MATCH_POST).toLocaleTimeString() : ''}</td>
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