/**
 * A `node:http` adapter ellenőrzése valódi TCP-n, függőség nélkül.
 *
 * A `twin.test.mjs` a döntési magot méri, a `msw.test.mjs` az MSW réteget; ez a
 * fájl azt a hármat bizonyítja, amit CSAK ez az adapter tud elrontani: van
 * hibahatára (a nyers `node:http`-nek magától nincs), a méretkorlát lezárja az
 * ígéretet ahelyett, hogy örökre várna, és a szerver loopbackra köt.
 * A tesztnevek angolok (projektkonvenció), minden más magyar.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createTwinHttpServer } from './http-server.mjs';
import { encodeMessage } from './notifier-twin.mjs';

const RAW = encodeMessage('a@b.hu', 'c@d.hu', 'Új rendelés érkezett: r-1', 'Törzs\nsor');

/** Loopbackra kötött iker véletlen szabad porton; a teszt végén bezárul. */
async function serve(t, options = {}) {
  const { server, twin } = createTwinHttpServer({ seed: 42, realTime: false, ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { address, port } = server.address();
  return { server, twin, base: `http://127.0.0.1:${port}`, address };
}

const send = (base, headers = {}, body = { raw: RAW }) => fetch(`${base}/gmail/v1/users/me/messages/send`, {
  method: 'POST',
  headers: { authorization: 'Bearer t', 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

test('answers 400 instead of crashing on an unknown forced scenario header', async (t) => {
  const { base, twin } = await serve(t, { rateLimitRule: false });

  // A `twin.force()` dob az ismeretlen néven. Hibahatár nélkül ez kezeletlen
  // ígéret-elutasítás lenne: Node 15 óta a FOLYAMAT állna le, válasz nélkül.
  const response = await send(base, { 'x-twin-scenario': 'typo' });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Ismeretlen forgatókönyv: typo/);

  // A szerver él tovább, és a hibás kérés nem került a naplóba.
  assert.equal(twin.ledger.length, 0);
  assert.equal((await send(base)).status, 200);
});

test('answers 400 on an unknown scenario sent to the control plane', async (t) => {
  const { base } = await serve(t);
  const response = await fetch(`${base}/__twin/force`, {
    method: 'POST',
    body: JSON.stringify({ scenario: 'nincs-ilyen' }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Ismeretlen forgatókönyv/);
});

test('answers 500 and stays up when the twin throws unexpectedly', async (t) => {
  const twin = {
    get stuckState() { return null; },
    get ledger() { return []; },
    stats: () => ({}),
    force: () => {},
    decide() { throw new Error('szándékos hiba'); },
  };
  const { base } = await serve(t, { twin });

  const response = await send(base);
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /szándékos hiba/);
  // A folyamat és a szerver is él: egy második kérés is választ kap.
  assert.equal((await send(base)).status, 500);
});

test('answers 413 for an oversized body instead of hanging forever', async (t) => {
  const { base } = await serve(t, { rateLimitRule: false });

  // 6 MB > 5 M karakter korlát. A korábbi `req.destroy()` se 'end'-et, se
  // 'error'-t nem emittált, ezért a handler ígérete SOHA nem zárult le: a
  // kérés némán lógott, a kapcsolat szivárgott.
  const response = await fetch(`${base}/gmail/v1/users/me/messages/send`, {
    method: 'POST',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: JSON.stringify({ raw: 'A'.repeat(6_000_000) }),
  });
  assert.equal(response.status, 413);
  assert.match((await response.json()).error, /túllépi/);

  // A szerver a korlát után is kiszolgál.
  assert.equal((await send(base)).status, 200);
});

test('binds to loopback only', async (t) => {
  const { address } = await serve(t);
  // A CLI ugyanezt a címet adja alapból: a vezérlőfelületnek nincs
  // hitelesítése, tehát a kötési cím maga a hozzáférés-korlátozás.
  assert.equal(address, '127.0.0.1');
});

test('serves the control plane over real HTTP', async (t) => {
  const { base, twin } = await serve(t, { rateLimitRule: false });

  const forced = await fetch(`${base}/__twin/force`, {
    method: 'POST',
    body: JSON.stringify({ scenario: 'backendError', times: 2 }),
  });
  assert.equal(forced.status, 200);

  for (let i = 0; i < 2; i += 1) {
    assert.ok([500, 503].includes((await send(base)).status));
  }
  const ledger = await (await fetch(`${base}/__twin/ledger`)).json();
  assert.equal(ledger.length, 2);
  assert.deepEqual(ledger.map((e) => e.rule), ['forced', 'forced']);

  await fetch(`${base}/__twin/reset`, { method: 'POST' });
  assert.equal(twin.ledger.length, 0);
});
