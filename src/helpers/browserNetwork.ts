import { Result } from 'neverthrow';

// What a browser lets this page (served over HTTPS) reach over plain HTTP and ws://, which FTC Live
// and OBS use. Firefox blocks both for any computer but this one, with no per-site setting. Chrome
// and Edge ask for local network access, and also need "Insecure content" for a host name that is
// not an IP address or a .local name.

export interface BrowserEnv {
  userAgent: string;
  // The page came over HTTPS, as the hosted site does. Over plain HTTP nothing is mixed content.
  secure: boolean;
}

export const currentBrowser = (): BrowserEnv => ({
  userAgent: navigator.userAgent,
  secure: window.location.protocol === 'https:',
});

// 'loopback': this computer. 'local': an IP address or .local name on the network. 'name': any
// other host name, which Chrome only reaches with "Insecure content" allowed.
export type HostKind = 'loopback' | 'local' | 'name';

const parseHost = Result.fromThrowable(
  (address: string) => new URL(`http://${address.trim().replace(/^[a-z]+:\/\//i, '')}`).hostname,
  () => 'invalid address',
);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export const hostKind = (address: string): HostKind => {
  const host = parseHost(address).unwrapOr(address.trim()).toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || /^127\./.test(host) || host === '[::1]') return 'loopback';
  if (IPV4.test(host) || host.startsWith('[') || host.endsWith('.local')) return 'local';
  return 'name';
};

export const isFirefox = (userAgent: string) => /\bFirefox\//.test(userAgent) && !/\bSeamonkey\//i.test(userAgent);

// Firefox will not connect to this address from this page, whatever the user allows.
export const firefoxBlocks = (env: BrowserEnv, address: string) =>
  env.secure && isFirefox(env.userAgent) && address.trim() !== '' && hostKind(address) !== 'loopback';

// The steps that may let a failed connection through: allowing local network access, and for a
// host name, insecure content too.
export type ConnectHelp = 'none' | 'local-network' | 'local-network-and-insecure-content';

export const connectHelp = (env: BrowserEnv, address: string, failed: boolean): ConnectHelp => {
  if (!failed || !env.secure || isFirefox(env.userAgent) || address.trim() === '') return 'none';
  return hostKind(address) === 'name' ? 'local-network-and-insecure-content' : 'local-network';
};
