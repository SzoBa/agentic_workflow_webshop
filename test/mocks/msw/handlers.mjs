/**
 * MSW handlerek a Gmail ikerhez (MSW v2).
 *
 * A handler NEM tartalmaz viselkedési logikát: csak lefordítja a `twin-core.mjs`
 * döntését HTTP válaszra. Ezért ugyanaz a mag hajtja a Node-teszteket és a
 * `http-server.mjs`-t is — nem tud a kettő szétcsúszni.
 *
 * Két végpont kell, nem egy: a Google kliens előbb a refresh tokent váltja be
 * hozzáférési tokenre az `oauth2.googleapis.com/token` végponton, és csak utána
 * küld. Ha ez nincs lefedve, a klón valódi hálózatot próbálna, és a teszt
 * félrevezetően „hitelesítési hibán" bukna, nem a mért ágon.
 */

import { http, HttpResponse, delay } from 'msw';
import { createGmailTwin, SCENARIO } from './twin-core.mjs';

export const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/:userId/messages/send';
export const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** A fault injectiont kérésenként is vezérelhető fejléc. Csak tesztben használd. */
export const FORCE_HEADER = 'x-twin-scenario';

/**
 * @param {object} [options] a `createGmailTwin` beállításai, plusz:
 * @param {boolean} [options.realTime=true] Ha false, a késés nem valós várakozás,
 *        csak a `delayMs` kerül a naplóba — így egy 20 s-os beragadás is
 *        milliszekundumok alatt lefut.
 * @returns {{handlers: import('msw').RequestHandler[], twin: ReturnType<createGmailTwin>}}
 */
export function createGmailTwinHandlers(options = {}) {
  const realTime = options.realTime ?? true;
  const twin = options.twin ?? createGmailTwin(options);

  const wait = async (ms) => {
    if (realTime && ms > 0) await delay(ms);
  };

  const handlers = [
    // A refresh token → access token csere. Az iker itt is tud „lejárt refresh
    // token"-t játszani: ha ez a ragadós állapot áll fenn, a Google `invalid_grant`
    // hibát ad, és a küldés el sem indul — ez a valódi 7 napos lejárat alakja.
    http.post(OAUTH_TOKEN_URL, async () => {
      const state = twin.stuckState;
      if (state && state.scenario === SCENARIO.EXPIRED_TOKEN) {
        await wait(200);
        return HttpResponse.json(
          { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' },
          { status: 400 },
        );
      }
      await wait(120);
      return HttpResponse.json({
        access_token: 'twin-access-token',
        expires_in: 3599,
        scope: 'https://www.googleapis.com/auth/gmail.send',
        token_type: 'Bearer',
      });
    }),

    http.post(GMAIL_SEND_URL, async ({ request }) => {
      let body = null;
      try {
        body = await request.json();
      } catch {
        body = null;
      }

      // Elgépelt forgatókönyvnév: a `force()` dob. Itt a hívó hibája, nem az
      // ikeré — 400-zal válaszolunk, ahogy a HTTP adapter is.
      const forcedScenario = request.headers.get(FORCE_HEADER);
      if (forcedScenario) {
        try {
          twin.force(forcedScenario, 1);
        } catch (ex) {
          return HttpResponse.json({ error: ex.message }, { status: 400 });
        }
      }

      const decision = twin.decide({
        authorization: request.headers.get('authorization') ?? undefined,
        body,
      });

      // Beragadt kapcsolat: kitartjuk az időkorlátig, aztán hálózati hibával
      // elejtjük. A hívó oldalán ez SocketTimeoutException / fetch TypeError —
      // vagyis pont az az ág, amit egyetlen státuszkód sem tud reprodukálni.
      if (decision.hold) {
        await wait(decision.delayMs);
        return HttpResponse.error();
      }

      await wait(decision.delayMs);
      return HttpResponse.json(decision.body, { status: decision.status });
    }),
  ];

  return { handlers, twin };
}

// SZÁNDÉKOSAN NINCS modulszintű `handlers` kényelmi export. Az egy import
// idején létrejövő ikerpéldány lenne, márpedig az iker ÁLLAPOTOT tart: naplót,
// kvótavödröt, ragadós hibát és PRNG-kurzort. Két tesztfájl, amelyik ugyanazt a
// modult importálja, ezen mind osztozna — onnantól az, hogy egy teszt tele
// vödröt lát-e, attól függ, melyik fájl futott előbb. Az ilyen hiba nem
// bugként, hanem flakinessként jelentkezik, és egyik teszt sem említi a másikat.
// Példányonként hívd a `createGmailTwinHandlers()`-t (a `msw-server.mjs` ezt teszi).
