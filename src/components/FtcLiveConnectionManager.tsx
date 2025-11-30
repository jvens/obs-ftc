// src/components/WebSocketManager.tsx
import React, { useState, useContext } from 'react';
import { FtcLiveContext } from '../contexts/FtcLiveContext';
import { Event } from '../types/FtcLive';
import { fetchAllEvents } from '../services/ftcLiveApi';
import { selectFtcServerUrl, selectSelectedEvent, setFtcServerUrl, setSelectedEvent } from '../store/connectionSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';


const FtcLiveConnectionManager: React.FC = () => {
  const { isConnected, connectWebSocket, isReconnecting, reconnectCountdown, cancelReconnect } = useContext(FtcLiveContext);
  const dispatch = useAppDispatch();
  const selectedEvent = useAppSelector(selectSelectedEvent);
  const serverUrl = useAppSelector(selectFtcServerUrl);
  const [events, setEvents] = useState<Event[]>([]);

  // Fetch event codes from the server
  const fetchEvents = async () => {
    try {
      const events = await fetchAllEvents(serverUrl);
      setEvents(events);
    } catch (error) {
      console.error('Fetching events failed:', error);
      setEvents([]);
    }
  };

  const selectEvent = (eventCode: string) => {
    const event = events.find(evt => evt.eventCode === eventCode) || null;
    dispatch(setSelectedEvent(event));
  }

  const eventList = events.length > 0 ? events : selectedEvent ? [selectedEvent] : [];

  return (
    <div className="section">
      <h2>FTC Live Server</h2>
      <input
        type="text"
        placeholder="Enter server IP"
        value={serverUrl}
        disabled={isConnected}
        onChange={(e) => dispatch(setFtcServerUrl(e.target.value))}
      />
      <button onClick={fetchEvents} disabled={isConnected}>Get Event Codes</button>
      <br />
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

      <button onClick={() => connectWebSocket(!isConnected)} disabled={!selectedEvent}>
        {isConnected ? 'Disconnect' : 'Connect'}
      </button>
      <div>
        Connection Status:
        <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {isReconnecting && (
        <div className="reconnect-status">
          <span>Attempting to reconnect in {reconnectCountdown}s...</span>
          <button onClick={cancelReconnect}>Cancel</button>
        </div>
      )}

      {!isConnected && !isReconnecting && <div className="connection-helper">
        <p>You may need to enable "Insecure content" in your browser settings<br/>for this tool to access the scoring system. For example, in Chrome:</p>
        <div className="connection-helper-steps">
        <ol>
          <li>Select the icon next to the URL and go to "Site settings"</li>
          <li>Find "Insecure content" and set it to "Allow"</li>
          <li>Refresh this page</li>
        </ol>
        </div>
      </div>}
    </div>
  );
};

export default FtcLiveConnectionManager;
