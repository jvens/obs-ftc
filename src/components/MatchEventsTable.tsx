import React, { useEffect, useState } from "react"
import { useFtcLive } from "../contexts/FtcLiveContext";
import { usePersistentState } from "../helpers/persistant";
import { FtcMatch } from "../types/FtcLive";

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

const MatchEventsTable: React.FC = () => {
  const [rows, setRows] = usePersistentState<MatchRow[]>('Match_Events', [])
  const {isConnected, serverUrl, selectedEvent} = useFtcLive()
  const {latestStreamData} = useFtcLive()

  useEffect(() => {
    if (latestStreamData) {
      setRows(currentRows => {
        // Check if the row already exists
        const rowIndex = currentRows.findIndex(row => row.number === latestStreamData.payload.number);
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


  const fetchMatches = async() => {
    try {
      const response = await fetch(`http://${serverUrl}/api/v1/events/${selectedEvent?.eventCode}/matches/`)
      const matches = (await response.json()).matches as FtcMatch[];
      const newRows = matches.map(match => {
        const rowIndex = rows.findIndex(row => row.number === match.matchNumber)
        let row: MatchRow;
        if(rowIndex !== -1) {
          row = { ...rows[rowIndex] }
        } else {
          row = { name: match.matchName, number: match.matchNumber}
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
    } catch (error) {
      console.error('Fetching matches faileD: ', error)
    }
  }

  const clearRows = () => {
    setRows([])
  }

  return (
    <div className="section">
      <button onClick={fetchMatches} disabled={!isConnected}>Get Match List</button>
      <button onClick={clearRows}>Clear All Data</button>
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

    </div>
  )
}

export default MatchEventsTable