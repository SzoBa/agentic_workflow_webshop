/**
 * Gmail `users.messages.send` viselkedési iker — a döntési mag.
 *
 * Ez a fájl SEMMIT nem importál: se MSW-t, se HTTP-t. Egyetlen dolga, hogy egy
 * kérésleírásból eldöntse, mi legyen a válasz és mennyit késsen. A hálózati
 * réteget az adapterek adják hozzá (`handlers.mjs` MSW-hez, `http-server.mjs`
 * a Java oldalnak) — így ugyanaz a viselkedés mérhető mindkét stacken.
 *
 * A `digital-twin.md` három állítása szabja meg a felépítést:
 *
 *  1. A sebességkorlát TERHELÉSFÜGGŐ SZABÁLY, nem valószínűség. Kvótavödör
 *     modellezi (250 egység/mp, 100 egység/küldés), ezért a másodpercen belüli
 *     harmadik küldés determinisztikusan 403 — pont az, amit egy rendelési csúcs
 *     kivált, és amit véletlen dobással sosem lehet reprodukálni.
 *  2. A státuszkód-hűség másodlagos, a KÉSÉS és a RAGADÓS ÁLLAPOT az érték. Ezért
 *     a hibáknak külön élettartamuk van: a lejárt token és a hiányzó scope nem
 *     gyógyul magától, a backend-hiba igen.
 *  3. A megfigyelhetőség a mérés tárgya. Minden döntés naplóba (`ledger`) kerül a
 *     vevő által ténylegesen LÁTHATÓ kimenettel együtt (`observable`), hogy egy
 *     teszt ki tudja mutatni: nyolc hibaágból hét ugyanazt az egy naplósort adja.
 */

/** A modellezett ágak. Az érték a `ledger` és a `force()` azonosítója is. */
export const SCENARIO = {
  SUCCESS: 'success',
  USER_RATE_LIMIT: 'userRateLimitExceeded',
  QUOTA_EXHAUSTED: 'quotaExhausted',
  INSUFFICIENT_PERMISSIONS: 'insufficientPermissions',
  EXPIRED_TOKEN: 'expiredToken',
  INVALID_ARGUMENT: 'invalidArgument',
  BACKEND_ERROR: 'backendError',
  STUCK_CONNECTION: 'stuckConnection',
};

/**
 * A kockadobás súlyai.
 *
 * FONTOS: a táblázat 3%-os `userRateLimitExceeded` sora SZÁNDÉKOSAN hiányzik
 * innen. Azt a kvótavödör állítja elő szabályként; ha itt is szerepelne, kétszer
 * számolnánk. A maradék 97% van 100-ra normálva — a súlyok tehát a dokumentum
 * arányait tartják, csak a rate limit nélküli univerzumon.
 */
export const DEFAULT_WEIGHTS = {
  [SCENARIO.SUCCESS]: 90,
  [SCENARIO.BACKEND_ERROR]: 2,
  [SCENARIO.QUOTA_EXHAUSTED]: 1,
  [SCENARIO.INSUFFICIENT_PERMISSIONS]: 1,
  [SCENARIO.EXPIRED_TOKEN]: 1,
  [SCENARIO.INVALID_ARGUMENT]: 1,
  [SCENARIO.STUCK_CONNECTION]: 1,
};

/**
 * Késésprofilok, ms-ban.
 *
 * A siker sora a dokumentumban önellentmondó: „150–900 ms" tartomány, de
 * „p99 ≈ 3 s". A kettő együtt nem fér el egy egyenletes eloszlásban. A feloldás:
 * a tömeg (99%) a 150–900 sávban van, p50 = 300 ms-ra hangolva, és a felső 1%
 * nyúlik ki 900 → 3000 ms-ig. Ezzel p99 ≈ 900 ms és p100 ≈ 3 s. Ha valaha lesz
 * mért adat, EZ a blokk cserélendő — a `digital-twin.md` maga is tervezési
 * feltevésnek nevezi a számokat.
 */
export const DEFAULT_LATENCY = {
  success: { minMs: 150, p50Ms: 300, maxMs: 900, tailMaxMs: 3000, tailProbability: 0.01 },
  [SCENARIO.USER_RATE_LIMIT]: { minMs: 100, maxMs: 400 },
  [SCENARIO.QUOTA_EXHAUSTED]: { minMs: 100, maxMs: 400 },
  [SCENARIO.INSUFFICIENT_PERMISSIONS]: { minMs: 100, maxMs: 300 },
  [SCENARIO.EXPIRED_TOKEN]: { minMs: 100, maxMs: 300 },
  [SCENARIO.INVALID_ARGUMENT]: { minMs: 100, maxMs: 300 },
  [SCENARIO.BACKEND_ERROR]: { minMs: 300, maxMs: 5000 },
  // A 20 s nem önkényes: a Google HTTP kliens alapértelmezett olvasási
  // időkorlátja, amit a kódbázis nem ír felül. Ennyi után dobna a hívó
  // SocketTimeoutException-t.
  [SCENARIO.STUCK_CONNECTION]: { holdMs: 20_000 },
};

/** A Gmail felhasználónkénti kvótája: 250 egység/mp, egy küldés 100 egység. */
export const DEFAULT_QUOTA = { unitsPerSecond: 250, unitsPerSend: 100 };

/** Determinisztikus PRNG (mulberry32) — ugyanaz a seed ugyanazt a futást adja. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A késésprofilok ellenőrzése — indításkor, hangosan.
 *
 * Az `options.latency` dokumentált felülírási pont, a ferdeség képlete viszont
 * néhány teljesen ésszerűnek látszó számra CSENDBEN értelmetlen eloszlást ad:
 * `p50Ms === minMs` → `skew = Infinity` (minden minta a minimum),
 * `p50Ms === maxMs` → `skew = 0` (minden minta a maximum),
 * `minMs === maxMs` → nullával osztás. Egyik sem dob magától, tehát a hívó egy
 * olyan eloszlást mérne, amit nem kért. Inkább bukjunk el érthető üzenettel.
 */
function validateLatency(latency) {
  for (const [name, cfg] of Object.entries(latency)) {
    if (name === SCENARIO.STUCK_CONNECTION) {
      if (!cfg || !Number.isFinite(cfg.holdMs) || cfg.holdMs < 0) {
        throw new Error(`Késésprofil "${name}": a holdMs kötelező, véges, nemnegatív szám.`);
      }
      continue;
    }
    if (!cfg || !Number.isFinite(cfg.minMs) || !Number.isFinite(cfg.maxMs)) {
      throw new Error(`Késésprofil "${name}": a minMs és a maxMs kötelező, véges szám.`);
    }
    if (cfg.minMs < 0) {
      throw new Error(`Késésprofil "${name}": a minMs nem lehet negatív (${cfg.minMs}).`);
    }
    if (cfg.maxMs < cfg.minMs) {
      throw new Error(
        `Késésprofil "${name}": a maxMs (${cfg.maxMs}) nem lehet kisebb a minMs-nél (${cfg.minMs}).`,
      );
    }
    // Innentől csak a ferde (siker-) profil: itt fut a képlet, ami elromolhat.
    if (name !== 'success') continue;
    if (cfg.maxMs === cfg.minMs) {
      throw new Error(
        `Késésprofil "success": a minMs és a maxMs nem lehet egyenlő (${cfg.minMs}) — a ferdeség nullával osztana.`,
      );
    }
    if (!Number.isFinite(cfg.p50Ms) || cfg.p50Ms <= cfg.minMs || cfg.p50Ms >= cfg.maxMs) {
      throw new Error(
        `Késésprofil "success": a p50Ms (${cfg.p50Ms}) szigorúan a minMs (${cfg.minMs}) és a maxMs (${cfg.maxMs}) közé essen.`,
      );
    }
    if (!Number.isFinite(cfg.tailProbability) || cfg.tailProbability < 0 || cfg.tailProbability > 1) {
      throw new Error(`Késésprofil "success": a tailProbability 0 és 1 közé essen (${cfg.tailProbability}).`);
    }
    if (cfg.tailProbability > 0 && (!Number.isFinite(cfg.tailMaxMs) || cfg.tailMaxMs < cfg.maxMs)) {
      throw new Error(
        `Késésprofil "success": a tailMaxMs (${cfg.tailMaxMs}) nem lehet kisebb a maxMs-nél (${cfg.maxMs}).`,
      );
    }
  }
}

/**
 * Ferde mintavétel a siker késéséhez: `min + (max-min) * u^k`, ahol a `k`-t úgy
 * választjuk, hogy a medián pont a megadott p50 legyen. A képlet épségéért a
 * `validateLatency` felel, még a példány létrejötte előtt.
 */
function sampleSuccessLatency(rnd, cfg) {
  if (rnd() < cfg.tailProbability) {
    return Math.round(cfg.maxMs + rnd() * (cfg.tailMaxMs - cfg.maxMs));
  }
  const share = (cfg.p50Ms - cfg.minMs) / (cfg.maxMs - cfg.minMs);
  const skew = Math.log(share) / Math.log(0.5);
  return Math.round(cfg.minMs + (cfg.maxMs - cfg.minMs) * Math.pow(rnd(), skew));
}

function sampleUniform(rnd, cfg) {
  return Math.round(cfg.minMs + rnd() * (cfg.maxMs - cfg.minMs));
}

/** Base64url dekódolás Buffer nélkül is (böngészőben futó MSW workerhez). */
function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(padded, 'base64').toString('utf8');
  }
  return decodeURIComponent(escape(atob(padded)));
}

/**
 * A `raw` mező strukturális ellenőrzése.
 *
 * Ez NEM a kockadobásos `invalidArgument` ág: ez determinisztikus, a tényleges
 * tartalomból következik. A valódi Gmail is így viselkedik, és ez az, ami egy
 * elrontott kódolást (pl. hiányzó base64url réteg) azonnal kimutat.
 */
function inspectRaw(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    return 'A "raw" mező hiányzik vagy üres.';
  }
  if (!/^[A-Za-z0-9_-]+=*$/.test(raw)) {
    return 'A "raw" mező nem érvényes base64url (padding nélküli) érték.';
  }
  let message;
  try {
    message = decodeBase64Url(raw);
  } catch {
    return 'A "raw" mező nem dekódolható.';
  }
  for (const header of ['To:', 'From:', 'Subject:']) {
    if (!message.includes(header)) {
      return `A dekódolt üzenetből hiányzik a(z) "${header}" fejléc.`;
    }
  }
  if (!/\r?\n\r?\n/.test(message)) {
    return 'A dekódolt üzenetben nincs üres sor a fejlécek és a törzs között.';
  }
  return null;
}

/** Google-alakú hibaboríték. A dokumentumban szereplő kulcsok szó szerint benne vannak. */
function googleError(code, status, reason, message) {
  return {
    error: {
      code,
      message,
      status,
      errors: [{ domain: 'global', reason, message }],
    },
  };
}

/** A következő UTC éjfél — a napi kvóta itt áll vissza. */
function nextUtcMidnight(at) {
  const d = new Date(at);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
}

/**
 * Iker példány.
 *
 * @param {object} [options]
 * @param {number} [options.seed=1]           PRNG seed — azonos seed, azonos futás.
 * @param {() => number} [options.now]        Óra (tesztben léptethető hamis óra).
 * @param {object} [options.weights]          Ágsúlyok felülírása.
 * @param {object} [options.latency]          Késésprofilok felülírása.
 * @param {object} [options.quota]            Kvótavödör paraméterei.
 * @param {boolean} [options.rateLimitRule=true]  A kvótaszabály ki-be kapcsolása.
 * @param {boolean} [options.stickyFailures=true] A ragadós hibaállapotok ki-be kapcsolása.
 */
export function createGmailTwin(options = {}) {
  const config = {
    seed: options.seed ?? 1,
    now: options.now ?? (() => Date.now()),
    weights: { ...DEFAULT_WEIGHTS, ...(options.weights ?? {}) },
    latency: { ...DEFAULT_LATENCY, ...(options.latency ?? {}) },
    quota: { ...DEFAULT_QUOTA, ...(options.quota ?? {}) },
    rateLimitRule: options.rateLimitRule ?? true,
    stickyFailures: options.stickyFailures ?? true,
  };
  validateLatency(config.latency);

  let rnd = mulberry32(config.seed);
  let forced = [];
  let ledger = [];
  let seq = 0;

  // Kvótavödör: tele indul, folyamatosan töltődik.
  let tokens = config.quota.unitsPerSecond;
  let lastRefillAt = config.now();

  // Ragadós állapotok. `null` = nincs érvényben.
  let stuck = null; // { scenario, since, until }

  /** A vödör töltöttsége `at` időpontban — TISZTA: nem ír se `tokens`-t, se órát. */
  function tokensAt(at) {
    const elapsedSec = Math.max(0, at - lastRefillAt) / 1000;
    return Math.min(
      config.quota.unitsPerSecond,
      tokens + elapsedSec * config.quota.unitsPerSecond,
    );
  }

  /** A vödör tényleges léptetése. Csak a döntési út hívja, kérésenként egyszer. */
  function refill(at) {
    tokens = tokensAt(at);
    lastRefillAt = at;
  }

  function drawScenario() {
    const entries = Object.entries(config.weights).filter(([, w]) => w > 0);
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = rnd() * total;
    for (const [scenario, weight] of entries) {
      roll -= weight;
      if (roll < 0) return scenario;
    }
    return SCENARIO.SUCCESS;
  }

  function messageId() {
    let id = '';
    for (let i = 0; i < 16; i += 1) {
      id += Math.floor(rnd() * 16).toString(16);
    }
    return id;
  }

  /** A forgatókönyvből válasz + késés. Itt dől el a ragadósság is. */
  function render(scenario, at) {
    switch (scenario) {
      case SCENARIO.SUCCESS: {
        const id = messageId();
        return {
          status: 200,
          body: { id, threadId: id, labelIds: ['SENT'] },
          delayMs: sampleSuccessLatency(rnd, config.latency.success),
        };
      }
      case SCENARIO.USER_RATE_LIMIT:
        return {
          status: 403,
          body: googleError(
            403,
            'PERMISSION_DENIED',
            'userRateLimitExceeded',
            'User-rate limit exceeded.  Retry after some time.',
          ),
          delayMs: sampleUniform(rnd, config.latency[SCENARIO.USER_RATE_LIMIT]),
          retryable: true,
        };
      case SCENARIO.QUOTA_EXHAUSTED:
        // Napi kvóta: UTC éjfélig ragad. Ettől lesz egy rossz napból „minden
        // további rendelés értesítése csendben elmarad", nem egy rossz kérés.
        return {
          status: 429,
          body: googleError(
            429,
            'RESOURCE_EXHAUSTED',
            'rateLimitExceeded',
            'Quota exceeded for quota metric "Send requests".',
          ),
          delayMs: sampleUniform(rnd, config.latency[SCENARIO.QUOTA_EXHAUSTED]),
          stickyUntil: nextUtcMidnight(at),
        };
      case SCENARIO.INSUFFICIENT_PERMISSIONS:
        // Hiányzó `gmail.send` scope: új hozzájárulás nélkül SOHA nem gyógyul.
        return {
          status: 403,
          body: googleError(
            403,
            'PERMISSION_DENIED',
            'insufficientPermissions',
            'Request had insufficient authentication scopes.',
          ),
          delayMs: sampleUniform(rnd, config.latency[SCENARIO.INSUFFICIENT_PERMISSIONS]),
          stickyUntil: Infinity,
        };
      case SCENARIO.EXPIRED_TOKEN:
        // A „Testing" állapotú OAuth-alkalmazás refresh tokenje 7 naponta lejár:
        // amíg nincs új OAuth-folyamat, minden küldés ide fut.
        return {
          status: 401,
          body: googleError(
            401,
            'UNAUTHENTICATED',
            'authError',
            'Invalid Credentials',
          ),
          delayMs: sampleUniform(rnd, config.latency[SCENARIO.EXPIRED_TOKEN]),
          stickyUntil: Infinity,
        };
      case SCENARIO.INVALID_ARGUMENT:
        return {
          status: 400,
          body: googleError(400, 'INVALID_ARGUMENT', 'invalidArgument', 'Invalid value for raw.'),
          delayMs: sampleUniform(rnd, config.latency[SCENARIO.INVALID_ARGUMENT]),
        };
      case SCENARIO.BACKEND_ERROR: {
        const status = rnd() < 0.5 ? 500 : 503;
        return {
          status,
          body: googleError(status, 'INTERNAL', 'backendError', 'Backend Error'),
          delayMs: sampleUniform(rnd, config.latency[SCENARIO.BACKEND_ERROR]),
          retryable: true,
        };
      }
      case SCENARIO.STUCK_CONNECTION:
        // Nincs válasz: az adapter tartja a kapcsolatot, majd elejti. A hívó
        // oldalán ez SocketTimeoutException (Java) / network error (fetch).
        return {
          status: null,
          body: null,
          delayMs: config.latency[SCENARIO.STUCK_CONNECTION].holdMs,
          hold: true,
        };
      default:
        throw new Error(`Ismeretlen forgatókönyv: ${scenario}`);
    }
  }

  function record(decision) {
    seq += 1;
    const entry = {
      seq,
      at: decision.at,
      scenario: decision.scenario,
      status: decision.status,
      delayMs: decision.delayMs,
      sticky: decision.sticky ?? false,
      rule: decision.rule ?? 'dice',
      // Amit az alkalmazás ténylegesen lát. A GmailOrderNotifier minden kivételt
      // elnyel, ezért mind a nyolc hibaág ugyanide fut: egyetlen ERROR naplósor.
      observable: decision.scenario === SCENARIO.SUCCESS ? 'sent' : 'error-log',
    };
    ledger.push(entry);
    return entry;
  }

  return {
    /**
     * Egy küldési kérés eldöntése.
     *
     * @param {object} request
     * @param {string} [request.authorization]  Az Authorization fejléc értéke.
     * @param {object} [request.body]           A kérés JSON törzse (`{ raw }`).
     * @param {number} [request.at]             Időbélyeg (alapból a konfigurált óra).
     * @returns {{scenario:string,status:number|null,body:object|null,delayMs:number,hold?:boolean,rule:string,ledgerEntry:object}}
     */
    decide(request = {}) {
      const at = request.at ?? config.now();

      // 1. Kényszerített ág (fault injection) — mindent megelőz.
      //    A ragadósság a kényszerített ágra IS érvényes: egy ág következményét
      //    nem befolyásolhatja, hogy kockával jött-e ki vagy kézzel kértük. Ha
      //    egy teszt csak az egyszeri választ akarja, `stickyFailures: false`.
      if (forced.length > 0) {
        const scenario = forced.shift();
        const rendered = render(scenario, at);
        if (config.stickyFailures && rendered.stickyUntil) {
          stuck = { scenario, since: at, until: rendered.stickyUntil };
        }
        return {
          ...rendered,
          scenario,
          rule: 'forced',
          ledgerEntry: record({ ...rendered, scenario, at, rule: 'forced' }),
        };
      }

      // 2. Ragadós állapot: amíg tart, minden küldés ugyanazt kapja.
      if (config.stickyFailures && stuck && at < stuck.until) {
        const rendered = render(stuck.scenario, at);
        return {
          ...rendered,
          scenario: stuck.scenario,
          rule: 'sticky',
          ledgerEntry: record({ ...rendered, scenario: stuck.scenario, at, rule: 'sticky', sticky: true }),
        };
      }
      if (stuck && at >= stuck.until) {
        stuck = null;
      }

      // 3. Strukturális ellenőrzés — determinisztikus, a tartalomból következik.
      if (!request.authorization || !/^Bearer\s+\S+/.test(request.authorization)) {
        const rendered = render(SCENARIO.EXPIRED_TOKEN, at);
        return {
          ...rendered,
          stickyUntil: undefined,
          scenario: SCENARIO.EXPIRED_TOKEN,
          rule: 'missing-bearer',
          ledgerEntry: record({
            ...rendered,
            scenario: SCENARIO.EXPIRED_TOKEN,
            at,
            rule: 'missing-bearer',
          }),
        };
      }
      const rawProblem = inspectRaw(request.body?.raw);
      if (rawProblem) {
        const rendered = render(SCENARIO.INVALID_ARGUMENT, at);
        rendered.body.error.message = rawProblem;
        rendered.body.error.errors[0].message = rawProblem;
        return {
          ...rendered,
          scenario: SCENARIO.INVALID_ARGUMENT,
          rule: 'invalid-raw',
          ledgerEntry: record({
            ...rendered,
            scenario: SCENARIO.INVALID_ARGUMENT,
            at,
            rule: 'invalid-raw',
          }),
        };
      }

      // 4. Kvótaszabály. NEM kockadobás: a másodpercen belüli harmadik küldés
      //    determinisztikusan elbukik (250 egység/mp ÷ 100 egység/küldés).
      if (config.rateLimitRule) {
        refill(at);
        if (tokens < config.quota.unitsPerSend) {
          const rendered = render(SCENARIO.USER_RATE_LIMIT, at);
          return {
            ...rendered,
            scenario: SCENARIO.USER_RATE_LIMIT,
            rule: 'quota',
            ledgerEntry: record({
              ...rendered,
              scenario: SCENARIO.USER_RATE_LIMIT,
              at,
              rule: 'quota',
            }),
          };
        }
        tokens -= config.quota.unitsPerSend;
      }

      // 5. Kockadobás a maradék ágakon.
      const scenario = drawScenario();
      const rendered = render(scenario, at);
      if (config.stickyFailures && rendered.stickyUntil) {
        stuck = { scenario, since: at, until: rendered.stickyUntil };
      }
      return {
        ...rendered,
        scenario,
        rule: 'dice',
        ledgerEntry: record({ ...rendered, scenario, at, rule: 'dice' }),
      };
    },

    /**
     * Fault injection: a következő `times` küldés kötelezően ez az ág lesz,
     * a kockadobás és a kvótaszabály megkerülésével.
     */
    force(scenario, times = 1) {
      if (!Object.values(SCENARIO).includes(scenario)) {
        throw new Error(`Ismeretlen forgatókönyv: ${scenario}`);
      }
      for (let i = 0; i < times; i += 1) forced.push(scenario);
      return this;
    },

    /** Ragadós hiba beállítása kézzel (pl. „lejárt a refresh token" állapotból indulunk). */
    stick(scenario, untilMs = Infinity) {
      stuck = { scenario, since: config.now(), until: untilMs };
      return this;
    },

    /** Új OAuth-folyamat: feloldja a hitelesítéshez kötött ragadós állapotokat. */
    reauthorize() {
      if (
        stuck
        && (stuck.scenario === SCENARIO.EXPIRED_TOKEN
          || stuck.scenario === SCENARIO.INSUFFICIENT_PERMISSIONS)
      ) {
        stuck = null;
      }
      return this;
    },

    /** Teljes visszaállítás: PRNG, vödör, ragadós állapot, napló. */
    reset() {
      rnd = mulberry32(config.seed);
      forced = [];
      ledger = [];
      seq = 0;
      tokens = config.quota.unitsPerSecond;
      lastRefillAt = config.now();
      stuck = null;
      return this;
    },

    /** Az eddigi döntések naplója (másolat). */
    get ledger() {
      return ledger.slice();
    },

    /** Aktuális ragadós állapot vagy `null`. */
    get stuckState() {
      return stuck ? { ...stuck } : null;
    },

    /**
     * Maradék kvótaegység (a vödör töltöttsége `at`-kor). Megfigyelés, nem
     * léptetés: szándékosan NEM hív `refill`-t. Amíg hívott, egy injektált órán
     * a `quotaRemaining(jövő)` visszaállította a `lastRefillAt`-ot, és egy utána
     * jövő `decide({ at: korábbi })` visszafelé mozgatta az időt — a következő
     * valós időbélyeg így a teljes rést újratöltötte volna.
     */
    quotaRemaining(at = config.now()) {
      return tokensAt(at);
    },

    /**
     * Összesítés: ágankénti darabszám ÉS a vevő által megkülönböztethető
     * kimenetek darabszáma. A kettő eltérése maga a mérendő vakfolt.
     */
    stats() {
      const byScenario = {};
      const byObservable = {};
      for (const entry of ledger) {
        byScenario[entry.scenario] = (byScenario[entry.scenario] ?? 0) + 1;
        byObservable[entry.observable] = (byObservable[entry.observable] ?? 0) + 1;
      }
      return {
        total: ledger.length,
        byScenario,
        byObservable,
        distinguishableFailureModes: Object.keys(byObservable).filter((k) => k !== 'sent').length,
      };
    },

    config,
  };
}
