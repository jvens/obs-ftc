import React, { useState, useContext } from 'react';
import { ResultAsync } from 'neverthrow';
import { FtcLiveContext } from '../contexts/FtcLiveContext';
import { Event } from '../types/FtcLive';
import { fetchAllEvents } from '../services/ftcLiveApi';
import { selectFtcServerUrl, selectSelectedEvent, setFtcServerUrl, setSelectedEvent } from '../store/connectionSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import NetworkAccessHelp from './NetworkAccessHelp';


const FtcLiveConnectionManager: React.FC = () => {
  const { isConnected, connectionFailed, connectWebSocket, isReconnecting, reconnectCountdown, cancelReconnect } = useContext(FtcLiveContext);
  const dispatch = useAppDispatch();
  const selectedEvent = useAppSelector(selectSelectedEvent);
  const serverUrl = useAppSelector(selectFtcServerUrl);
  const [events, setEvents] = useState<Event[]>([]);
  const [fetchFailed, setFetchFailed] = useState(false);

  // Fetch event codes from the server
  const fetchEvents = () =>
    ResultAsync.fromPromise(fetchAllEvents(serverUrl), error => error).match(
      events => {
        setEvents(events);
        setFetchFailed(false);
      },
      error => {
        console.error('Fetching events failed:', error);
        setEvents([]);
        setFetchFailed(true);
      },
    );

  const selectEvent = (eventCode: string) => {
    const event = events.find(evt => evt.eventCode === eventCode) || null;
    dispatch(setSelectedEvent(event));
  }

  const eventList = events.length > 0 ? events : selectedEvent ? [selectedEvent] : [];

  return (
    <div className="section setup-card">
      <div className="form-grid">
        <label>
          FTC Live address
          <span className="field-row">
            <input
              type="text"
              placeholder="Enter server IP"
              value={serverUrl}
              disabled={isConnected}
              onChange={(e) => dispatch(setFtcServerUrl(e.target.value))}
            />
            <button onClick={fetchEvents} disabled={isConnected}>Get Event Codes</button>
          </span>
        </label>
        <label>
          Event
          <select
            value={selectedEvent?.eventCode}
            onChange={(e) => selectEvent(e.target.value)}
            disabled={events.length === 0 || isConnected}
          >
            <option value="">Select an event</option>
            {eventList.map((event) => (
              <option key={event.eventCode} value={event.eventCode}>
                {event.eventCode} - {event.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="setup-card-actions">
        <button className={isConnected ? undefined : 'btn-primary'} onClick={() => connectWebSocket(!isConnected)} disabled={!selectedEvent}>
          {isConnected ? 'Disconnect' : 'Connect'}
        </button>
        <span className={`status-pill ${isConnected ? 'ok' : 'off'}`}>
          {isConnected && <span className="status-dot" aria-hidden="true" />}
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {isReconnecting && (
        <div className="reconnect-status">
          <span>Attempting to reconnect in {reconnectCountdown}s...</span>
          <button onClick={cancelReconnect}>Cancel</button>
        </div>
      )}

      {!isConnected && <NetworkAccessHelp service="FTC Live" address={serverUrl} failed={fetchFailed || connectionFailed} />}
    </div>
  );
};

export default FtcLiveConnectionManager;
