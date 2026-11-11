import { describe, expect, it } from '@jest/globals';
import { BrowserEnv, connectHelp, firefoxBlocks, hostKind, isFirefox } from './browserNetwork';

const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:155.0) Gecko/20100101 Firefox/155.0';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';
const EDGE = `${CHROME} Edg/153.0.0.0`;
const FIREFOX_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/155.0 Mobile/15E148 Safari/605.1.15';

const hosted = (userAgent: string): BrowserEnv => ({ userAgent, secure: true });
const overHttp = (userAgent: string): BrowserEnv => ({ userAgent, secure: false });

describe('hostKind', () => {
  it.each([
    ['localhost', 'loopback'],
    ['LOCALHOST:8080', 'loopback'],
    ['127.0.0.1', 'loopback'],
    ['127.0.1.1:80', 'loopback'],
    ['[::1]:4455', 'loopback'],
    ['192.168.1.10', 'local'],
    ['10.0.0.5:8080', 'local'],
    [' 172.16.0.2 ', 'local'],
    ['http://192.168.1.10/', 'local'],
    ['[fe80::1]', 'local'],
    ['scoring.local', 'local'],
    ['scoring', 'name'],
    ['scoring.example.com:80', 'name'],
    ['localhost.example.com', 'name'],
  ] as const)('%s is %s', (address, kind) => {
    expect(hostKind(address)).toBe(kind);
  });
});

describe('isFirefox', () => {
  it('recognises desktop Firefox only', () => {
    expect(isFirefox(FIREFOX)).toBe(true);
    expect(isFirefox(CHROME)).toBe(false);
    expect(isFirefox(EDGE)).toBe(false);
    // Firefox on iOS is WebKit, and says so.
    expect(isFirefox(FIREFOX_IOS)).toBe(false);
  });
});

describe('firefoxBlocks', () => {
  it('warns about another computer in Firefox on the hosted site', () => {
    expect(firefoxBlocks(hosted(FIREFOX), '192.168.1.10')).toBe(true);
    expect(firefoxBlocks(hosted(FIREFOX), 'scoring.local')).toBe(true);
  });

  it('does not warn about this computer, an empty address, other browsers, or a page served over HTTP', () => {
    expect(firefoxBlocks(hosted(FIREFOX), 'localhost')).toBe(false);
    expect(firefoxBlocks(hosted(FIREFOX), '127.0.0.1')).toBe(false);
    expect(firefoxBlocks(hosted(FIREFOX), '  ')).toBe(false);
    expect(firefoxBlocks(hosted(CHROME), '192.168.1.10')).toBe(false);
    expect(firefoxBlocks(overHttp(FIREFOX), '192.168.1.10')).toBe(false);
  });
});

describe('connectHelp', () => {
  it('shows nothing until a connection fails', () => {
    expect(connectHelp(hosted(CHROME), '192.168.1.10', false)).toBe('none');
  });

  it('asks for local network access after a failure', () => {
    expect(connectHelp(hosted(CHROME), '192.168.1.10', true)).toBe('local-network');
    expect(connectHelp(hosted(EDGE), 'localhost', true)).toBe('local-network');
    expect(connectHelp(hosted(CHROME), 'scoring.local', true)).toBe('local-network');
  });

  it('asks for insecure content too for a host name', () => {
    expect(connectHelp(hosted(CHROME), 'scoring.example.com', true)).toBe('local-network-and-insecure-content');
  });

  it('leaves Firefox to its warning, and needs nothing over HTTP', () => {
    expect(connectHelp(hosted(FIREFOX), '192.168.1.10', true)).toBe('none');
    expect(connectHelp(overHttp(CHROME), '192.168.1.10', true)).toBe('none');
    expect(connectHelp(hosted(CHROME), '', true)).toBe('none');
  });
});
