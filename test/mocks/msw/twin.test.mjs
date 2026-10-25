/**
 * Az iker önellenőrzése: `node --test` (nulla függőség, nem kell MSW).
 *
 * Amit ez a fájl bizonyít: a klón tényleg a dokumentált eloszlást játssza, a
 * sebességkorlát szabály és nem kockadobás, a hitelesítési hibák ragadnak, és a
 * késésprofil eltalálja a mediánt. A tesztnevek angolok (projektkonvenció),
 * minden más magyar.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createGmailTwin, SCENARIO } from './twin-core.mjs';
import { createTwinOrderNotifier, encodeMessage } from './notifier-twin.mjs';

const VALID_RAW = encodeMessage('a@b.hu', 'c@d.hu', 'Új rendelés érkezett: r-1', 'Törzs\nsor');
const VALID_REQUEST = { authorization: 'Bearer t', body: { raw: VALID_RAW } };

/** Hamis óra: minden hívásnál a megadott lépéssel megy előre. */
function fakeClock(startMs = 1_700_000_000_000) {
  let now = startMs;
  return {
    now: () => now,
    advance(ms) {
      now += ms;
      return now;
    },
  };
}

/** Eloszlásméréshez: kvótaszabály és ragadósság nélküli iker, tiszta kockadobás. */
function diceOnlyTwin(seed = 7) {
  return createGmailTwin({ seed, rateLimitRule: false, stickyFailures: false });
}

test('reproduces the documented outcome distribution within tolerance', () => {
  const twin = diceOnlyTwin();
  const N = 20_000;
  for (let i = 0; i < N; i += 1) twin.decide(VALID_REQUEST);

  const { byScenario } = twin.stats();
  const share = (s) => ((byScenario[s] ?? 0) / N) * 100;

  // A várt arányok a rate limit nélküli univerzumon (97 → 100-ra normálva).
  const expected = {
    [SCENARIO.SUCCESS]: (90 / 97) * 100,
    [SCENARIO.BACKEND_ERROR]: (2 / 97) * 100,
    [SCENARIO.QUOTA_EXHAUSTED]: (1 / 97) * 100,
    [SCENARIO.INSUFFICIENT_PERMISSIONS]: (1 / 97) * 100,
    [SCENARIO.EXPIRED_TOKEN]: (1 / 97) * 100,
    [SCENARIO.INVALID_ARGUMENT]: (1 / 97) * 100,
    [SCENARIO.STUCK_CONNECTION]: (1 / 97) * 100,
  };

  for (const [scenario, want] of Object.entries(expected)) {
    const got = share(scenario);
    assert.ok(
      Math.abs(got - want) < 1.0,
      `${scenario}: várt ≈${want.toFixed(2)}%, mért ${got.toFixed(2)}%`,
    );
  }
});

test('is deterministic for a given seed', () => {
  const run = () => {
    const twin = diceOnlyTwin(99);
    return Array.from({ length: 200 }, () => twin.decide(VALID_REQUEST).scenario).join(',');
  };
  assert.equal(run(), run());
});

test('rate limits the third send within one second as a rule, not a dice roll', () => {
  const clock = fakeClock();
  const twin = createGmailTwin({ seed: 5, now: clock.now, stickyFailures: false });

  // 250 kvótaegység / 100 egység per küldés → két küldés fér bele, a harmadik nem.
  const first = twin.decide(VALID_REQUEST);
  const second = twin.decide(VALID_REQUEST);
  const third = twin.decide(VALID_REQUEST);

  assert.notEqual(first.scenario, SCENARIO.USER_RATE_LIMIT);
  assert.notEqual(second.scenario, SCENARIO.USER_RATE_LIMIT);
  assert.equal(third.scenario, SCENARIO.USER_RATE_LIMIT);
  assert.equal(third.status, 403);
  assert.equal(third.rule, 'quota');
  assert.equal(third.body.error.errors[0].reason, 'userRateLimitExceeded');

  // Fél másodperc múlva 125 egység töltődött vissza → megint fér egy küldés.
  clock.advance(500);
  assert.notEqual(twin.decide(VALID_REQUEST).scenario, SCENARIO.USER_RATE_LIMIT);
});

test('sustains roughly 2.5 sends per second under continuous load', () => {
  const clock = fakeClock();
  const twin = createGmailTwin({ seed: 5, now: clock.now, stickyFailures: false });

  let accepted = 0;
  // 10 másodpercen át 10 küldés/mp ütemben — messze a kvóta fölött.
  for (let i = 0; i < 100; i += 1) {
    clock.advance(100);
    if (twin.decide(VALID_REQUEST).scenario !== SCENARIO.USER_RATE_LIMIT) accepted += 1;
  }
  const perSecond = accepted / 10;
  assert.ok(perSecond > 2.2 && perSecond < 3.0, `tartós átbocsátás: ${perSecond}/mp`);
});

test('keeps the expired-token failure sticky until re-authorization', () => {
  const twin = createGmailTwin({ seed: 1, rateLimitRule: false });
  twin.stick(SCENARIO.EXPIRED_TOKEN);

  for (let i = 0; i < 50; i += 1) {
    const decision = twin.decide(VALID_REQUEST);
    assert.equal(decision.scenario, SCENARIO.EXPIRED_TOKEN);
    assert.equal(decision.status, 401);
  }
  // Ez a mérés lényege: 50 rendelés értesítése maradt el CSENDBEN.
  assert.equal(twin.stats().byObservable['error-log'], 50);

  twin.reauthorize();
  assert.equal(twin.stuckState, null);
  assert.notEqual(twin.decide(VALID_REQUEST).scenario, SCENARIO.EXPIRED_TOKEN);
});

test('releases the daily quota block at the next UTC midnight', () => {
  const clock = fakeClock(Date.UTC(2026, 7, 1, 22, 0, 0));
  const twin = createGmailTwin({ seed: 1, now: clock.now, rateLimitRule: false });
  twin.force(SCENARIO.QUOTA_EXHAUSTED);
  twin.decide(VALID_REQUEST);
  twin.stick(SCENARIO.QUOTA_EXHAUSTED, Date.UTC(2026, 7, 2, 0, 0, 0));

  assert.equal(twin.decide(VALID_REQUEST).scenario, SCENARIO.QUOTA_EXHAUSTED);
  clock.advance(3 * 60 * 60 * 1000); // átléptünk éjfélen
  assert.notEqual(twin.decide(VALID_REQUEST).scenario, SCENARIO.QUOTA_EXHAUSTED);
});

test('applies stickiness to a forced branch as well as a drawn one', () => {
  const twin = createGmailTwin({ seed: 3, rateLimitRule: false });
  twin.force(SCENARIO.INSUFFICIENT_PERMISSIONS);

  assert.equal(twin.decide(VALID_REQUEST).rule, 'forced');
  // A scope-hiba nem gyógyul magától: a következő küldés már a ragadós ágon jön.
  const next = twin.decide(VALID_REQUEST);
  assert.equal(next.scenario, SCENARIO.INSUFFICIENT_PERMISSIONS);
  assert.equal(next.rule, 'sticky');
  assert.equal(next.status, 403);

  twin.reauthorize();
  assert.equal(twin.stuckState, null);
});

test('forces a scenario ahead of both the quota rule and the dice', () => {
  const twin = createGmailTwin({ seed: 3 });
  twin.force(SCENARIO.BACKEND_ERROR, 3);

  for (let i = 0; i < 3; i += 1) {
    const decision = twin.decide(VALID_REQUEST);
    assert.equal(decision.scenario, SCENARIO.BACKEND_ERROR);
    assert.equal(decision.rule, 'forced');
    assert.ok([500, 503].includes(decision.status));
    assert.equal(decision.body.error.errors[0].reason, 'backendError');
  }
});

test('rejects a structurally invalid raw deterministically', () => {
  const twin = createGmailTwin({ seed: 1, rateLimitRule: false });

  for (const raw of [undefined, '', 'nem base64url!!!', Buffer.from('To: x').toString('base64url')]) {
    const decision = twin.decide({ authorization: 'Bearer t', body: { raw } });
    assert.equal(decision.scenario, SCENARIO.INVALID_ARGUMENT);
    assert.equal(decision.status, 400);
    assert.equal(decision.rule, 'invalid-raw');
  }
});

test('accepts the raw the production encoder actually produces', () => {
  const twin = createGmailTwin({ seed: 1, rateLimitRule: false });
  twin.force(SCENARIO.SUCCESS);
  const decision = twin.decide(VALID_REQUEST);
  assert.equal(decision.status, 200);
  assert.deepEqual(decision.body.labelIds, ['SENT']);
  assert.equal(decision.body.id, decision.body.threadId);
});

test('holds a stuck connection for the client read timeout', () => {
  const twin = createGmailTwin({ seed: 1, rateLimitRule: false });
  twin.force(SCENARIO.STUCK_CONNECTION);
  const decision = twin.decide(VALID_REQUEST);
  assert.equal(decision.hold, true);
  assert.equal(decision.status, null);
  assert.equal(decision.delayMs, 20_000);
});

test('samples success latency with the documented median and tail', () => {
  const twin = diceOnlyTwin(11);
  const samples = [];
  while (samples.length < 20_000) {
    const decision = twin.decide(VALID_REQUEST);
    if (decision.scenario === SCENARIO.SUCCESS) samples.push(decision.delayMs);
  }
  samples.sort((a, b) => a - b);
  const at = (p) => samples[Math.floor(samples.length * p)];

  assert.ok(samples[0] >= 150, `minimum: ${samples[0]}`);
  assert.ok(Math.abs(at(0.5) - 300) < 25, `p50: ${at(0.5)}`);
  assert.ok(at(0.99) <= 950, `p99: ${at(0.99)}`);
  assert.ok(samples[samples.length - 1] > 900, `farok: ${samples[samples.length - 1]}`);
  assert.ok(samples[samples.length - 1] <= 3000, `maximum: ${samples[samples.length - 1]}`);
});

test('respects the documented latency band of every error branch', () => {
  const bands = {
    [SCENARIO.USER_RATE_LIMIT]: [100, 400],
    [SCENARIO.QUOTA_EXHAUSTED]: [100, 400],
    [SCENARIO.INSUFFICIENT_PERMISSIONS]: [100, 300],
    [SCENARIO.EXPIRED_TOKEN]: [100, 300],
    [SCENARIO.INVALID_ARGUMENT]: [100, 300],
    [SCENARIO.BACKEND_ERROR]: [300, 5000],
  };
  const twin = createGmailTwin({ seed: 2, rateLimitRule: false, stickyFailures: false });
  for (const [scenario, [min, max]] of Object.entries(bands)) {
    for (let i = 0; i < 500; i += 1) {
      twin.force(scenario);
      const { delayMs } = twin.decide(VALID_REQUEST);
      assert.ok(delayMs >= min && delayMs <= max, `${scenario}: ${delayMs} ∉ [${min},${max}]`);
    }
  }
});

test('reads the quota bucket without advancing its clock', () => {
  const clock = fakeClock();
  const twin = createGmailTwin({ seed: 5, now: clock.now, stickyFailures: false });

  // Megfigyelés a jövőből: nem mozdíthatja el a vödör óráját, különben egy
  // utána jövő, korábbi időbélyegű döntés visszafelé léptetné az időt.
  assert.equal(twin.quotaRemaining(), 250);
  assert.equal(twin.quotaRemaining(clock.now() + 60_000), 250);

  twin.decide(VALID_REQUEST);
  twin.decide(VALID_REQUEST);
  assert.equal(twin.quotaRemaining(), 50);
  // Ismételt olvasás ugyanazt adja: a getter nem ír.
  assert.equal(twin.quotaRemaining(), 50);
  assert.equal(twin.decide(VALID_REQUEST).scenario, SCENARIO.USER_RATE_LIMIT);
});

test('rejects a latency profile the skew formula cannot express', () => {
  const withSuccess = (success) => () => createGmailTwin({ latency: { success } });
  const base = { minMs: 150, p50Ms: 300, maxMs: 900, tailMaxMs: 3000, tailProbability: 0.01 };

  // Mindhárom eset csendben értelmetlen eloszlást adna: skew = Infinity,
  // skew = 0, illetve nullával osztás.
  assert.throws(withSuccess({ ...base, p50Ms: 150 }), /p50Ms/);
  assert.throws(withSuccess({ ...base, p50Ms: 900 }), /p50Ms/);
  assert.throws(withSuccess({ ...base, minMs: 900, p50Ms: 900 }), /nem lehet egyenlő/);
  assert.throws(withSuccess({ ...base, tailProbability: 1.5 }), /tailProbability/);
  assert.throws(withSuccess({ ...base, tailMaxMs: 500 }), /tailMaxMs/);
  assert.throws(() => createGmailTwin({ latency: { [SCENARIO.BACKEND_ERROR]: { minMs: 500, maxMs: 100 } } }), /maxMs/);
  assert.throws(() => createGmailTwin({ latency: { [SCENARIO.STUCK_CONNECTION]: {} } }), /holdMs/);

  // Az alapértelmezés és egy érvényes felülírás viszont átmegy.
  assert.doesNotThrow(() => createGmailTwin());
  assert.doesNotThrow(withSuccess({ ...base, p50Ms: 400 }));
});

test('collapses every failure branch into a single observable outcome', async () => {
  const notifier = createTwinOrderNotifier({
    config: {
      gmailClientId: 'id',
      gmailClientSecret: 'secret',
      gmailRefreshToken: 'refresh',
      gmailSender: 'shop@example.hu',
      orderNotifyTo: 'ops@example.hu',
    },
    twin: createGmailTwin({ seed: 1, rateLimitRule: false, stickyFailures: false }),
  });
  const order = {
    id: 'o-1',
    createdAt: '2026-08-01T10:00:00.000Z',
    customerAddress: 'Budapest',
    total: 12345,
    items: [{ name: 'Bögre', quantity: 2 }],
  };
  const user = { username: 'teszt', email: 'teszt@example.hu' };

  const failing = [
    SCENARIO.USER_RATE_LIMIT,
    SCENARIO.QUOTA_EXHAUSTED,
    SCENARIO.INSUFFICIENT_PERMISSIONS,
    SCENARIO.EXPIRED_TOKEN,
    SCENARIO.INVALID_ARGUMENT,
    SCENARIO.BACKEND_ERROR,
    SCENARIO.STUCK_CONNECTION,
  ];
  for (const scenario of failing) {
    notifier.twin.force(scenario);
    const result = await notifier.notifyNewOrder(order, user);
    assert.equal(result.outcome, 'failed');
    assert.equal(result.scenario, scenario);
  }

  // A vakfolt, számszerűsítve: hét megkülönböztethető hibaok → egyetlen naplósor.
  const errors = notifier.logLines.filter((l) => l.level === 'error');
  assert.equal(errors.length, 7);
  assert.equal(new Set(errors.map((l) => l.message)).size, 1);
  assert.equal(notifier.twin.stats().distinguishableFailureModes, 1);
});

test('skips the call entirely when any config key is blank', async () => {
  const keys = [
    'gmailClientId',
    'gmailClientSecret',
    'gmailRefreshToken',
    'gmailSender',
    'orderNotifyTo',
  ];
  const full = Object.fromEntries(keys.map((k) => [k, 'x']));

  for (const missing of keys) {
    const notifier = createTwinOrderNotifier({ config: { ...full, [missing]: '  ' } });
    const result = await notifier.notifyNewOrder({ id: 'o-1', items: [], total: 0 }, {});
    assert.equal(result.outcome, 'skipped');
    assert.equal(result.elapsedMs, 0);
    assert.equal(notifier.twin.stats().total, 0, 'a hívás el sem indulhat');
    assert.equal(notifier.logLines[0].message, 'Gmail nincs konfigurálva, e-mail kihagyva');
  }
});
