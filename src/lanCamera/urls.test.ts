import { describe, expect, it } from '@jest/globals';
import { isLanReceiverUrl, lanCameraPageUrl, lanReceiverCamera, lanReceiverUrl } from './urls';

// jsdom serves the tests from http://localhost.
describe('LAN camera URLs', () => {
  it('puts the slot, camera and port in the query and the password in the fragment', () => {
    const url = new URL(lanReceiverUrl('Field 1', 'Pit Cam', { port: 4455, password: 's3cret&x' }));
    expect(url.origin + url.pathname).toBe('http://localhost/camera-receiver');
    expect(Object.fromEntries(url.searchParams)).toEqual({ slot: 'Field 1', camera: 'Pit Cam', port: '4455' });
    expect(new URLSearchParams(url.hash.slice(1)).get('password')).toBe('s3cret&x');
  });

  it('leaves the fragment off without a password', () => {
    expect(lanReceiverUrl('Field 1', '', { port: 4455, password: '' })).not.toContain('#');
  });

  it('reads back the camera computer a receiver shows', () => {
    expect(lanReceiverCamera(lanReceiverUrl('Field 1', 'Tripod #2', { port: 4455, password: 'pw' }))).toBe('Tripod #2');
    expect(lanReceiverCamera(lanReceiverUrl('Field 1', '', { port: 4455, password: '' }))).toBe('');
    expect(lanReceiverCamera('https://example.com/page')).toBe('');
  });

  it('recognises receiver pages and nothing else', () => {
    expect(isLanReceiverUrl(lanReceiverUrl('Field 1', '', { port: 4455, password: '' }))).toBe(true);
    expect(isLanReceiverUrl('https://obs.example.com/camera-receiver#password=x')).toBe(true);
    expect(isLanReceiverUrl('https://obs.example.com/camera-receiver.html?slot=Field%201')).toBe(true);
    expect(isLanReceiverUrl(lanCameraPageUrl())).toBe(false);
    expect(isLanReceiverUrl('https://example.com/camera-receiver.html.evil')).toBe(false);
    expect(isLanReceiverUrl('https://example.com/camera-receivers')).toBe(false);
  });
});
