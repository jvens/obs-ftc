// The built site over HTTPS, as the hosted site is served, so the browser applies its mixed content
// and local network rules to the FTC Live and OBS connections. The certificate is self-signed and
// only for these tests (test-https.crt, for localhost and 127.0.0.1): browsers are told to accept it.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:https';
import { AddressInfo } from 'node:net';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const BUILD = join(HERE, '../../build');
const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.jpg': 'image/jpeg',
};

export interface HttpsSite {
  // https://127.0.0.1:port
  url: string;
  port: number;
  close: () => Promise<void>;
}

export const startHttpsSite = async (): Promise<HttpsSite> => {
  const [key, cert] = await Promise.all([
    readFile(join(HERE, 'test-https.key')),
    readFile(join(HERE, 'test-https.crt')),
  ]);
  const server = createServer({ key, cert }, async (request, response) => {
    const path = normalize(new URL(request.url ?? '/', 'https://localhost').pathname).replace(/^(\.\.[/\\])+/, '');
    // Clean URLs, as Cloudflare serves them: /camera is camera.html.
    const candidates = path === '/' ? ['index.html'] : [path, `${path}.html`];
    for (const candidate of candidates) {
      const body = await readFile(join(BUILD, candidate)).catch(() => undefined);
      if (body) {
        response.writeHead(200, { 'Content-Type': TYPES[extname(candidate)] ?? 'application/octet-stream' });
        response.end(body);
        return;
      }
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `https://127.0.0.1:${port}`,
    port,
    close: () => new Promise(resolve => server.close(() => resolve())),
  };
};

// An IPv4 address of this computer on a network, not loopback: how another computer reaches it.
export const networkAddress = () =>
  Object.values(networkInterfaces()).flat().find(address => address?.family === 'IPv4' && !address.internal)?.address;
