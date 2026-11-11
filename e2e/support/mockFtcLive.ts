// A minimal FTC Live scoring system for the dashboard: the REST API it reads events and matches from,
// and the match event stream, which tests drive with send(). Listens on a free port.
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import type { Event, FtcMatch, UpdateType } from '../../src/types/FtcLive';

export interface MockFtcLive {
  // What to type as the FTC Live server: 127.0.0.1:port.
  host: string;
  port: number;
  // The one event on the server; changes show in later requests.
  event: Event;
  // Sends a match event to every connected dashboard, for a match on `field`.
  send: (updateType: UpdateType, match: { number: number; field: number }) => void;
  // Resolves once a dashboard is listening to the match event stream.
  connected: () => Promise<void>;
  close: () => Promise<void>;
}

const match = (number: number, field: number): FtcMatch => ({
  matchName: `Q${number}`,
  matchNumber: number,
  field,
  red: { team1: 1000 + number, team2: 2000 + number, isTeam1Surrogate: false, isTeam2Surrogate: false },
  blue: { team1: 3000 + number, team2: 4000 + number, isTeam1Surrogate: false, isTeam2Surrogate: false },
  finished: false,
  matchState: 'UNPLAYED',
  time: Date.UTC(2026, 10, 7, 14) + number * 7 * 60_000,
});

// `listen` is the address to listen on: 0.0.0.0 to be reachable on this computer's network addresses too.
export const startMockFtcLive = ({ eventCode = 'usmnrq1', fieldCount = 2, listen = '127.0.0.1' } = {}) => new Promise<MockFtcLive>(resolve => {
  const event: Event = {
    eventCode,
    name: 'Mock Qualifier',
    division: 0,
    finals: false,
    start: new Date(Date.UTC(2026, 10, 7)),
    end: new Date(Date.UTC(2026, 10, 7)),
    type: 'QUALIFIER',
    status: 'ACTIVE',
    fieldCount,
  };
  const matches = [1, 2, 3, 4].map(number => match(number, (number - 1) % fieldCount + 1));
  // Read per request, so a test can change the event (for example its code) as it goes.
  const routes = (): Record<string, unknown> => ({
    '/api/v1/events/': { eventCodes: [event.eventCode] },
    [`/api/v1/events/${event.eventCode}/`]: event,
    [`/api/v1/events/${event.eventCode}/matches/`]: { matches },
    [`/api/v1/events/${event.eventCode}/matches/active/`]: { matches: matches.slice(0, 1) },
  });

  const server = createServer((request, response) => {
    const body = routes()[new URL(request.url ?? '/', 'http://localhost').pathname];
    // The dashboard is served from elsewhere, as it is in production.
    response.writeHead(body ? 200 : 404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    response.end(body ? JSON.stringify(body) : '{}');
  });
  const stream = new WebSocketServer({ server, path: '/api/v2/stream/' });
  const listeners = new Set<() => void>();
  stream.on('connection', socket => {
    socket.on('message', data => { if (String(data) === 'ping') socket.send('pong'); });
    listeners.forEach(listener => listener());
  });

  server.listen(0, listen, () => {
    const { port } = server.address() as AddressInfo;
    resolve({
      host: `127.0.0.1:${port}`,
      port,
      event,
      send: (updateType, { number, field }) => {
        const message = JSON.stringify({ updateTime: Date.now(), updateType, payload: { number, shortName: `Q${number}`, field } });
        for (const client of stream.clients)
          if (client.readyState === WebSocket.OPEN) client.send(message);
      },
      connected: () => stream.clients.size > 0 ? Promise.resolve() : new Promise(done => listeners.add(done)),
      close: () => new Promise(done => {
        for (const client of stream.clients) client.terminate();
        stream.close();
        server.close(() => done());
        // Browsers keep HTTP connections open, which would hold close() up.
        server.closeAllConnections();
      }),
    });
  });
});
