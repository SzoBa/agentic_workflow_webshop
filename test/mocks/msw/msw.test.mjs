/**
 * Az MSW adapter integrációs ellenőrzése: valódi `fetch` hívások, elfogva.
 *
 * A `twin.test.mjs` a döntési magot méri; ez a fájl azt bizonyítja, hogy a HTTP
 * réteg ugyanazt adja vissza — státuszkód, törzs, ragadósság, kvótaszabály. A
 * késés mindenhol `realTime: false`, különben egyetlen beragadt kapcsolat 20 s-ot
 * enne meg a futásból.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { setupGmailTwin } from './msw-server.mjs';
import { createGmailTwin, SCENARIO } from './twin-core.mjs';
import { encodeMessage } from './notifier-twin.mjs';

const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const RAW = encodeMessage('a@b.hu', 'c@d.hu', 'Új rendelés érkezett: r-1', 'Törzs\nsor');

function send(extraHeaders = {}, raw = RAW) {
  return fetch(SEND_URL, {
    method: 'POST',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify({ raw }),
  });
}

/** Külön iker példányonként: a seedelt futások így nem zavarják egymást. */
function harness(options = {}) {
  const twin = createGmailTwin({ seed: 42, ...options });
  const { server } = setupGmailTwin({ twin, realTime: false });
  server.listen({ onUnhandledRequest: 'error' });
  return { server, twin };
}

test('serves the documented success body over HTTP', async (t) => {
  const { server, twin } = harness({ rateLimitRule: false });
  t.after(() => server.close());

  twin.force(SCENARIO.SUCCESS);
  const response = await send();
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['id', 'labelIds', 'threadId']);
  assert.deepEqual(body.labelIds, ['SENT']);
  assert.equal(body.id, body.threadId);
});

test('applies the quota rule across real HTTP requests', async (t) => {
  const { server } = harness();
  t.after(() => server.close());

  const statuses = [];
  for (let i = 0; i < 3; i += 1) {
    statuses.push((await send()).status);
  }
  // A harmadik küldés egy másodpercen belül: 250 egység elfogyott.
  assert.equal(statuses[2], 403);
  assert.notEqual(statuses[0], 403);
  assert.notEqual(statuses[1], 403);
});

test('injects a fault through the request header', async (t) => {
  const { server } = harness({ rateLimitRule: false });
  t.after(() => server.close());

  const response = await send({ 'x-twin-scenario': SCENARIO.QUOTA_EXHAUSTED });
  assert.equal(response.status, 429);
  const body = await response.json();
  assert.equal(body.error.status, 'RESOURCE_EXHAUSTED');
  assert.equal(body.error.code, 429);
});

test('keeps returning 401 once the token expired, then recovers after re-auth', async (t) => {
  const { server, twin } = harness({ rateLimitRule: false });
  t.after(() => server.close());

  twin.stick(SCENARIO.EXPIRED_TOKEN);
  for (let i = 0; i < 5; i += 1) {
    const response = await send();
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.status, 'UNAUTHENTICATED');
  }

  // Ugyanez a ragadós állapot az OAuth végponton `invalid_grant`-ként látszik:
  // a valódi 7 napos lejárat itt üt ki először, a küldés el sem indul.
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST' });
  assert.equal(tokenResponse.status, 400);
  assert.equal((await tokenResponse.json()).error, 'invalid_grant');

  twin.reauthorize();
  assert.notEqual((await send()).status, 401);
  assert.equal((await fetch('https://oauth2.googleapis.com/token', { method: 'POST' })).status, 200);
});

test('rejects a malformed raw with 400 invalidArgument', async (t) => {
  const { server } = harness({ rateLimitRule: false });
  t.after(() => server.close());

  const response = await send({}, 'nem base64url!!!');
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.errors[0].reason, 'invalidArgument');
});

test('surfaces a stuck connection as a client-side network failure', async (t) => {
  const { server, twin } = harness({ rateLimitRule: false });
  t.after(() => server.close());

  twin.force(SCENARIO.STUCK_CONNECTION);
  // A `realTime: false` miatt nem várunk 20 s-ot, de a kimenet ugyanaz: nincs
  // válasz, a hívó a saját hibaágán fut tovább (Java: SocketTimeoutException).
  await assert.rejects(() => send(), (error) => error instanceof TypeError);
  assert.equal(twin.ledger[twin.ledger.length - 1].delayMs, 20_000);
});

test('records every HTTP call in the ledger with one observable failure mode', async (t) => {
  const { server, twin } = harness({ rateLimitRule: false, stickyFailures: false });
  t.after(() => server.close());

  const failing = [
    SCENARIO.USER_RATE_LIMIT,
    SCENARIO.QUOTA_EXHAUSTED,
    SCENARIO.INSUFFICIENT_PERMISSIONS,
    SCENARIO.EXPIRED_TOKEN,
    SCENARIO.INVALID_ARGUMENT,
    SCENARIO.BACKEND_ERROR,
  ];
  const statuses = [];
  for (const scenario of failing) {
    statuses.push((await send({ 'x-twin-scenario': scenario })).status);
  }

  // Hat különböző státuszkód a dróton…
  assert.deepEqual(statuses.slice(0, 5), [403, 429, 403, 401, 400]);
  assert.ok([500, 503].includes(statuses[5]));
  // …és mégis egyetlen megkülönböztethető kimenet az alkalmazás felől.
  assert.equal(twin.stats().distinguishableFailureModes, 1);
  assert.equal(twin.stats().byObservable['error-log'], 6);
});
