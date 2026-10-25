/**
 * Valódi, hálózaton figyelő iker a JAVA oldalnak — nulla függőséggel (`node:http`).
 *
 * Miért nem elég az MSW a Java backendhez: az MSW a Node HTTP rétegét foltozza,
 * a `GmailOrderNotifier` viszont JVM-ben fut, saját transporttal
 * (`GoogleNetHttpTransport.newTrustedTransport()`). Egy folyamaton kívüli JVM-et
 * semmilyen MSW nem tud elfogni. Ezért ugyanaz a döntési mag itt kap egy igazi
 * portot: a Node-tesztek MSW-n, a Java-tesztek TCP-n érik el UGYANAZT a viselkedést.
 *
 * Futtatás:   node http-server.mjs --port 8089 --seed 42
 *             (csak loopbackra köt; hálózatból eléréshez: --host 0.0.0.0)
 * Egészség:   GET  /__twin/health
 * Napló:      GET  /__twin/ledger      → az eddigi döntések
 * Statisztika:GET  /__twin/stats       → ágankénti és megfigyelhető kimenetek
 * Vezérlés:   POST /__twin/force       { "scenario": "backendError", "times": 3 }
 *             POST /__twin/stick       { "scenario": "expiredToken" }
 *             POST /__twin/reauthorize
 *             POST /__twin/reset
 *
 * A Java oldali bekötés — és a mérés határa:
 *
 *   Ez a szerver HTTP-n (nem HTTPS-en) figyel, tehát a `Gmail.Builder`-nek
 *   `setRootUrl("http://localhost:8089/")` kell. Az a hívás MA NINCS kivezetve a
 *   `GmailOrderNotifier`-ből — pontosan az a varrat hiányzik, amit a
 *   `digital-twin.md` „Beillesztési pont" szakasza leír. Amíg nincs, ez a szerver
 *   a HTTP-szintű protokollhűséget méri egy kísérleti kliensről; a termelési
 *   kódút viselkedési mérésének helye az `OrderNotifier` interfész.
 */

import http from 'node:http';
import { createGmailTwin, SCENARIO } from './twin-core.mjs';

const SEND_PATH = /^\/gmail\/v1\/users\/[^/]+\/messages\/send$/;
const TOKEN_PATH = /^\/(oauth2\/v4\/)?token$/;

/** Törzsméret-korlát. A `raw` mező base64, tehát a valós küldések bőven alatta vannak. */
const MAX_BODY_CHARS = 5_000_000;

/** A `readJson` jelzése: a törzs túl nagy volt, a választ MÁR kiküldtük. */
const TOO_LARGE = Symbol('túl nagy törzs');

/**
 * A kérés törzsének beolvasása.
 *
 * Az ígéretnek MINDEN útra kell egy lezárás — arra is, amit mi magunk okozunk.
 * A `req.destroy()` argumentum nélkül sem `end`-et, sem `error`-t nem emittál,
 * ezért a méretkorlát ága korábban egyik listenert sem sütötte el: a handler
 * örökre várt, a kapcsolat szivárgott. Innentől a korlát 413-mal válaszol, és
 * kézzel zárja le az ígéretet.
 */
function readJson(req, res) {
  return new Promise((resolve) => {
    let raw = '';
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    req.on('data', (chunk) => {
      if (settled) {
        // A korlát után a maradékot ELNYELJÜK, nem gyűjtjük. Pufferelni nem
        // kell, de olvasni igen: ha itt bontanánk a socketet, a még feltöltő
        // hívó a 413 helyett ECONNRESET-et kapna — pont a diagnosztizálható
        // választ veszítené el, amiért ez az ág egyáltalán van.
        return;
      }
      raw += chunk;
      if (raw.length > MAX_BODY_CHARS) {
        raw = '';
        sendJson(res, 413, {
          error: `A kérés törzse túllépi a ${MAX_BODY_CHARS} karaktert.`,
        });
        settle(TOO_LARGE);
      }
    });
    req.on('end', () => {
      try {
        settle(raw ? JSON.parse(raw) : null);
      } catch {
        settle(null);
      }
    });
    req.on('error', () => settle(null));
    req.on('aborted', () => settle(null));
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {object} [options] – a `createGmailTwin` beállításai, plusz:
 * @param {boolean} [options.realTime=true] valós várakozás a késésekhez.
 */
export function createTwinHttpServer(options = {}) {
  const realTime = options.realTime ?? true;
  const twin = options.twin ?? createGmailTwin(options);
  const wait = async (ms) => {
    if (realTime && ms > 0) await sleep(ms);
  };

  /**
   * A tényleges útválasztás. A hibahatárt a hívó `createServer` visszahívása
   * adja — lásd ott, miért nem lehet ez a függvény maga a visszahívás.
   */
  const route = async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;

    // --- Vezérlő felület (a klón sajátja, nem a Gmail API része) ---
    if (path.startsWith('/__twin/')) {
      const command = path.slice('/__twin/'.length);
      if (command === 'health') return sendJson(res, 200, { status: 'ok', stuck: twin.stuckState });
      if (command === 'ledger') return sendJson(res, 200, twin.ledger);
      if (command === 'stats') return sendJson(res, 200, twin.stats());
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST kell' });

      const parsed = await readJson(req, res);
      if (parsed === TOO_LARGE) return undefined;
      const body = parsed ?? {};
      try {
        if (command === 'force') twin.force(body.scenario, body.times ?? 1);
        else if (command === 'stick') twin.stick(body.scenario, body.untilMs ?? Infinity);
        else if (command === 'reauthorize') twin.reauthorize();
        else if (command === 'reset') twin.reset();
        else return sendJson(res, 404, { error: `Ismeretlen parancs: ${command}` });
      } catch (ex) {
        return sendJson(res, 400, { error: ex.message });
      }
      return sendJson(res, 200, { status: 'ok', stuck: twin.stuckState });
    }

    // --- OAuth token csere ---
    if (TOKEN_PATH.test(path)) {
      const state = twin.stuckState;
      if (state && state.scenario === SCENARIO.EXPIRED_TOKEN) {
        await wait(200);
        return sendJson(res, 400, {
          error: 'invalid_grant',
          error_description: 'Token has been expired or revoked.',
        });
      }
      await wait(120);
      return sendJson(res, 200, {
        access_token: 'twin-access-token',
        expires_in: 3599,
        scope: 'https://www.googleapis.com/auth/gmail.send',
        token_type: 'Bearer',
      });
    }

    // --- users.messages.send ---
    if (req.method === 'POST' && SEND_PATH.test(path)) {
      const parsed = await readJson(req, res);
      if (parsed === TOO_LARGE) return undefined;
      const body = parsed;

      // Elgépelt forgatókönyvnév: a `force()` dob. Ez a hívó hibája, nem az
      // ikeré — ugyanaz a 400, amit a `/__twin/force` út is ad.
      const forcedScenario = req.headers['x-twin-scenario'];
      if (forcedScenario) {
        try {
          twin.force(String(forcedScenario), 1);
        } catch (ex) {
          return sendJson(res, 400, { error: ex.message });
        }
      }

      const decision = twin.decide({
        authorization: req.headers.authorization,
        body,
      });

      if (decision.hold) {
        // Beragadt kapcsolat: nincs válasz, nincs FIN. A hívó a saját olvasási
        // időkorlátján bukik el — a Java kliensnél ez SocketTimeoutException.
        await wait(decision.delayMs);
        req.socket.destroy();
        return undefined;
      }

      await wait(decision.delayMs);
      return sendJson(res, decision.status, decision.body);
    }

    return sendJson(res, 404, {
      error: { code: 404, message: `Az iker nem modellezi ezt a végpontot: ${req.method} ${path}` },
    });
  };

  /**
   * A hibahatár. A `http.createServer` visszahívásának NINCS sajátja: egy
   * elszálló `await` a visszahívás belsejében kezeletlen ígéret-elutasítás, ami
   * Node 15 óta alapból leállítja a FOLYAMATOT — a hívó pedig soha nem kap
   * választ. Nincs alatta keretrendszer, ami 500-zá alakítaná (az Express és az
   * MSW megteszi, a nyers `node:http` nem), ezért itt kell megfogni.
   */
  const server = http.createServer((req, res) => {
    route(req, res).catch((ex) => {
      if (res.writableEnded || res.headersSent || res.destroyed) return;
      sendJson(res, 500, { error: `Az iker belső hibája: ${ex?.message ?? ex}` });
    });
  });

  return { server, twin };
}

// --- CLI ---
const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`
  || process.argv[1]?.endsWith('http-server.mjs');

if (isMain) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? fallback : process.argv[i + 1];
  };
  const port = Number(arg('port', 8089));
  const seed = Number(arg('seed', 1));
  const realTime = arg('no-delay', null) === null;
  // Alapból CSAK loopback. Host nélkül a `listen` a 0.0.0.0-ra kötne, és ezzel a
  // klón vezérlőfelülete (`/__twin/force`, `/__twin/stick`, `/__twin/reset`) az
  // egész hálózatról elérhető lenne — hitelesítés nélkül, mert egy tesztdublőrbe
  // nem építünk auth-ot. Ez a döntés viszont a kötési címet teszi teherhordóvá:
  // egy irodai vagy kávézós hálózaton bárki elhajthatná vagy visszaállíthatná a
  // futó tesztet, és a naplót is elolvashatná. Konténerből `--host 0.0.0.0`.
  const host = arg('host', '127.0.0.1');

  const { server, twin } = createTwinHttpServer({ seed, realTime });
  server.listen(port, host, () => {
    process.stdout.write(
      `Gmail iker figyel: http://${host}:${port} (seed=${seed}, valós késés: ${realTime})\n`
        + `  küldés:  POST /gmail/v1/users/me/messages/send\n`
        + `  vezérlés: /__twin/{health,ledger,stats,force,stick,reauthorize,reset}\n`,
    );
  });

  const shutdown = () => {
    process.stdout.write(`\nÖsszesítés: ${JSON.stringify(twin.stats())}\n`);
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
