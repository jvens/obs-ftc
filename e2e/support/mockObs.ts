// A minimal obs-websocket v5 server for testing the pages without OBS: no authentication,
// BroadcastCustomEvent relayed to every client (with its data as the event data, as OBS does), a
// fixed GetSceneList, and every other request answered with success. Listens on a free port, so
// every test can have its own.
import { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';

const SCENES = ['Camera - Ceremony', 'Camera - Field 1', 'Field 1'];

export interface MockObs {
  port: number;
  // Plays the dashboard: asks every camera computer to announce itself and collects their names.
  discoverCameras: () => Promise<string[]>;
  close: () => Promise<void>;
}

const handle = (socket: WebSocket, clients: Set<WebSocket>, raw: string) => {
  const { op, d } = JSON.parse(raw);
  if (op === 1) {
    clients.add(socket);
    socket.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
    return;
  }
  if (op !== 6) return;
  let responseData = {};
  if (d.requestType === 'GetSceneList')
    responseData = {
      currentProgramSceneName: 'Field 1',
      scenes: SCENES.map((sceneName, sceneIndex) => ({ sceneName, sceneIndex })),
    };
  if (d.requestType === 'BroadcastCustomEvent') {
    const { eventData } = d.requestData;
    for (const client of clients)
      client.send(JSON.stringify({ op: 5, d: { eventType: 'CustomEvent', eventIntent: 1, eventData } }));
  }
  socket.send(JSON.stringify({
    op: 7,
    d: { requestType: d.requestType, requestId: d.requestId, requestStatus: { result: true, code: 100 }, responseData },
  }));
};

const discoverCameras = (port: number) => new Promise<string[]>((resolve, reject) => {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  const names = new Set<string>();
  socket.on('error', reject);
  socket.on('message', raw => {
    const { op, d } = JSON.parse(String(raw));
    if (op === 0) socket.send(JSON.stringify({ op: 1, d: { rpcVersion: 1 } }));
    else if (op === 2) socket.send(JSON.stringify({
      op: 6,
      d: {
        requestType: 'BroadcastCustomEvent',
        requestId: 'discover',
        requestData: { eventData: { app: 'ftc-lan-camera', v: 2, from: 'e2e-dashboard', type: 'discover', camera: '' } },
      },
    }));
    else if (op === 5 && d.eventData.type === 'presence') names.add(d.eventData.camera);
  });
  setTimeout(() => { socket.close(); resolve([...names]); }, 1000);
});

// `listen` is the address to listen on: 0.0.0.0 to be reachable on this computer's network addresses too.
export const startMockObs = ({ listen = '127.0.0.1' } = {}) => new Promise<MockObs>(resolve => {
  const server = new WebSocketServer({ port: 0, host: listen });
  const clients = new Set<WebSocket>();
  server.on('connection', socket => {
    socket.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: '5.5.0', rpcVersion: 1 } }));
    socket.on('message', raw => handle(socket, clients, String(raw)));
    socket.on('close', () => clients.delete(socket));
  });
  server.on('listening', () => {
    const { port } = server.address() as AddressInfo;
    resolve({
      port,
      discoverCameras: () => discoverCameras(port),
      close: () => new Promise(done => {
        for (const client of server.clients) client.terminate();
        server.close(() => done());
      }),
    });
  });
});
