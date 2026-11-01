// What the dashboard reads from FTC Live, against the real thing: its API client
// (src/services/ftcLiveApi.ts) and the match event stream. Run for each new FTC Live release.
import WebSocket from 'ws';
import { fetchActiveMatches, fetchAllEvents, fetchEvent, fetchMatches, fetchTeam, fetchTeamNumbers } from '../../src/services/ftcLiveApi';
import { FtcLiveSteamData, UpdateTypes } from '../../src/types/FtcLive';
import { expect, test } from './fixtures';

test('the API gives the dashboard the event, its matches and its teams', async ({ realFtcLive }) => {
  const { host, event } = realFtcLive;

  expect(await fetchAllEvents(host)).toContainEqual(expect.objectContaining({ eventCode: event.eventCode }));
  expect(await fetchEvent(event.eventCode, host)).toMatchObject({
    eventCode: event.eventCode,
    name: event.name,
    fieldCount: event.fieldCount,
    start: expect.any(Number),
    end: expect.any(Number),
  });

  const matches = await fetchMatches(event.eventCode, host);
  expect(matches.length).toBeGreaterThan(0);
  const alliance = { team1: expect.any(Number), team2: expect.any(Number) };
  for (const match of matches)
    expect(match).toMatchObject({
      matchName: `Q${match.matchNumber}`,
      field: expect.any(Number),
      red: alliance,
      blue: alliance,
      time: expect.any(Number),
    });
  expect(new Set(matches.map(match => match.field))).toEqual(new Set([1, 2]));
  expect(Array.isArray(await fetchActiveMatches(event.eventCode, host))).toBe(true);

  expect((await fetchTeamNumbers(event.eventCode, host)).sort()).toEqual(event.teams);
  expect(await fetchTeam(event.eventCode, event.teams[0], host)).toMatchObject({ number: event.teams[0] });
});

test('the match event stream sends events the dashboard understands', async ({ realFtcLive, scorekeeper }) => {
  const { host, event } = realFtcLive;
  const received: FtcLiveSteamData[] = [];
  const stream = new WebSocket(`ws://${host}/api/v2/stream/?code=${event.eventCode}`);
  stream.on('message', data => { if (String(data) !== 'pong') received.push(JSON.parse(String(data))); });
  await new Promise(resolve => stream.once('open', resolve));

  try {
    await scorekeeper.loadMatch();
    await scorekeeper.showPreview();
    await scorekeeper.showMatch();
    await scorekeeper.startMatch();
    await scorekeeper.abortMatch();
    // FTC Live loads an aborted match again, ready to replay.
    await expect.poll(() => received.map(update => update.updateType))
      .toEqual(['MATCH_LOAD', 'SHOW_PREVIEW', 'SHOW_MATCH', 'MATCH_START', 'MATCH_ABORT', 'MATCH_LOAD']);
  } finally {
    stream.close();
  }

  for (const update of received) {
    expect(UpdateTypes).toContain(update.updateType);
    expect(update).toMatchObject({
      updateTime: expect.any(Number),
      payload: { number: expect.any(Number), shortName: `Q${update.payload.number}`, field: expect.any(Number) },
    });
  }
});
