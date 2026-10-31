import { jest } from '@jest/globals';

// Replaces fetch with canned JSON responses by URL; anything else is a 404.
export const mockFetch = (responses: Record<string, unknown>) => {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const found = url in responses;
    return {
      ok: found,
      status: found ? 200 : 404,
      statusText: found ? 'OK' : 'Not Found',
      json: async () => responses[url],
    } as Response;
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};
