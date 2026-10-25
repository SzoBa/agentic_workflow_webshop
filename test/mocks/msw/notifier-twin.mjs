/**
 * `OrderNotifier`-szintű homlokzat az iker fölé.
 *
 * Ez a réteg azért van, mert a `digital-twin.md` szerint a mérés tárgya nem a
 * státuszkód, hanem az, hogy az alkalmazás MIT LÁT belőle. A `GmailOrderNotifier`
 * minden kivételt elnyel, az `OrderController` még egyszer körbezárja — a nyolc
 * hibaágból hét ugyanazt az egy megfigyelhető kimenetet adja.
 *
 * Két dolog csak itt modellezhető, HTTP szinten nem:
 *
 *  1. A HIÁNYZÓ KONFIGURÁCIÓ nem hibaág. Ha az öt kulcs bármelyike üres, a hívás
 *     el sem indul: `log.warn("Gmail nincs konfigurálva, e-mail kihagyva")`, 0 ms.
 *     Ez a valós fejlesztői alapállapot, mert a `.env` sablonban a kulcsok üresek.
 *  2. A KIVÉTEL ELNYELÉSE. A `notifyNewOrder` soha nem dob: a rendelés a vevő
 *     felé változatlanul `201`, akkor is, ha az értesítés elmaradt.
 */

import { createGmailTwin, SCENARIO } from './twin-core.mjs';

/** A `GmailOrderNotifier` által kötelezően megkövetelt öt konfigurációs kulcs. */
export const REQUIRED_CONFIG_KEYS = [
  'gmailClientId',
  'gmailClientSecret',
  'gmailRefreshToken',
  'gmailSender',
  'orderNotifyTo',
];

const isBlank = (value) => value === undefined || value === null || String(value).trim() === '';

/** Forint formátum tizedes nélkül, magyar tagolással — a Java oldal párja. */
function formatPrice(price) {
  return `${new Intl.NumberFormat('hu-HU').format(price)} Ft`;
}

/** A Java `ISO_MILLIS` formázó párja: mindig UTC, mindig 3 tizedesjegy. */
function formatDate(createdAt) {
  if (!createdAt) return '';
  return new Date(createdAt).toISOString().replace(/(\.\d{3})\d*Z$/, '$1Z');
}

/** A levéltörzs — szó szerint a `GmailOrderNotifier.buildBody` alakja. */
export function buildBody(order, user) {
  return [
    'Új rendelés érkezett a webshopból.',
    '',
    `Rendelésazonosító: ${order.id}`,
    `Dátum: ${formatDate(order.createdAt)}`,
    '',
    'Rendelő:',
    `  Felhasználónév: ${user.username}`,
    `  Email: ${user.email}`,
    `  Szállítási cím: ${order.customerAddress}`,
    '',
    'Tételek:',
    (order.items ?? []).map((i) => `- ${i.name} × ${i.quantity} db`).join('\n'),
    '',
    `Végösszeg: ${formatPrice(order.total)}`,
  ].join('\n');
}

/** RFC 822 üzenet base64url kódolása — a `GmailOrderNotifier.encodeMessage` párja. */
export function encodeMessage(to, from, subject, body) {
  const b64 = (value) => Buffer.from(value, 'utf8').toString('base64');
  const message = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: =?utf-8?B?${b64(subject)}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="utf-8"',
    'Content-Transfer-Encoding: base64',
    '',
    b64(body),
  ].join('\r\n');
  return Buffer.from(message, 'utf8').toString('base64url');
}

/**
 * @param {object} [options]
 * @param {object} [options.config]  Az öt kulcs. Üresen hagyva a „nincs
 *        konfigurálva" ág játszódik le — ez az alapértelmezés, mert ez a valós
 *        fejlesztői alapállapot.
 * @param {(level: string, message: string, fields?: object) => void} [options.log]
 * @param {boolean} [options.realTime=false] valós várakozás a késésekhez.
 */
export function createTwinOrderNotifier(options = {}) {
  const config = options.config ?? {};
  const twin = options.twin ?? createGmailTwin(options);
  const realTime = options.realTime ?? false;
  const logLines = [];
  const log = options.log ?? ((level, message, fields) => {
    logLines.push({ level, message, ...fields });
  });

  return {
    twin,

    /** Az összes kiírt naplósor — ezen mérhető a megfigyelhetőségi vakfolt. */
    get logLines() {
      return logLines.slice();
    },

    /**
     * A `GmailOrderNotifier.notifyNewOrder` viselkedési mása. SOHA nem dob.
     *
     * @returns {{outcome:'sent'|'failed'|'skipped', scenario:string|null, elapsedMs:number}}
     */
    async notifyNewOrder(order, user) {
      const missing = REQUIRED_CONFIG_KEYS.some((key) => isBlank(config[key]));
      if (missing) {
        // A napló SEM nevezi meg, melyik kulcs hiányzik — a „melyik van meg"
        // információ már a konfiguráció térképe.
        log('warn', 'Gmail nincs konfigurálva, e-mail kihagyva');
        return { outcome: 'skipped', scenario: null, elapsedMs: 0 };
      }

      const subject = `Új rendelés érkezett: ${order.id}`;
      const raw = encodeMessage(
        config.orderNotifyTo,
        config.gmailSender,
        subject,
        buildBody(order, user),
      );

      const decision = twin.decide({
        authorization: 'Bearer twin-access-token',
        body: { raw },
      });

      if (realTime && decision.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, decision.delayMs));
      }

      if (decision.scenario === SCENARIO.SUCCESS) {
        log('info', 'Rendelési e-mail elküldve', { orderId: order.id });
        return { outcome: 'sent', scenario: decision.scenario, elapsedMs: decision.delayMs };
      }

      // ITT A LÉNYEG: hét különböző hibaág, egyetlen naplósor. A kivétel oka
      // (403? 429? időkorlát?) sehol nem jelenik meg strukturáltan, ezért az
      // üzemeltető nem tudja megmondani, kell-e új OAuth-folyamat vagy csak várni.
      log('error', 'Rendelési e-mail küldése sikertelen', { orderId: order.id });
      return { outcome: 'failed', scenario: decision.scenario, elapsedMs: decision.delayMs };
    },
  };
}
