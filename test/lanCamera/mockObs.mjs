// A minimal obs-websocket v5 server for testing the LAN camera pages without OBS: no authentication,
// BroadcastCustomEvent relayed to every client (nested as OBS does), a fixed GetSceneList, and every
// other request answered with success.
import { WebSocketServer } from 'ws';

const SCENES = ['Camera - Ceremony', 'Camera - Field 1', 'Field 1'];

export const startMockObs = (port, log = () => {}) => new Promise(resolve => {
  const server = new WebSocketServer({ port });
  const clients = new Set();
  server.on('connection', socket => {
    socket.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: '5.5.0', rpcVersion: 1 } }));
    socket.on('message', raw => {
      const { op, d } = JSON.parse(String(raw));
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
        log(`broadcast ${eventData.type} ${eventData.camera}`);
        for (const client of clients)
          client.send(JSON.stringify({ op: 5, d: { eventType: 'CustomEvent', eventIntent: 1, eventData: { eventData } } }));
      }
      socket.send(JSON.stringify({
        op: 7,
        d: { requestType: d.requestType, requestId: d.requestId, requestStatus: { result: true, code: 100 }, responseData },
      }));
    });
    socket.on('close', () => clients.delete(socket));
  });
  server.on('listening', () => resolve({ close: () => server.close() }));
});
