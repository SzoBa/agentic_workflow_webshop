// A szcenáriók "világa": minden szcenárió ebből kap egy friss példányt.
//
// A `this` a lépésdefiníciókban EZ az objektum. Ami itt van, az minden lépésben
// elérhető; ami nincs, azt a lépésnek magának kell felépítenie.

import { World, setWorldConstructor, setDefaultTimeout } from "@cucumber/cucumber";
import { createClient } from "../support/api.mjs";
import { konfiguracio } from "../support/kornyezet.mjs";
import {
  adminMunkamenet,
  adminToken,
  keszletModositas,
  leadottRendeles,
  letrehozottTermek,
  nonce,
  regisztraltVasarlo,
} from "../support/fixtures.mjs";

const config = konfiguracio();
setDefaultTimeout(config.lepesTimeout);

export class Vilag extends World {
  constructor(opciok) {
    super(opciok);

    this.config = config;
    this.baseUrl = config.baseUrl;

    /** Szcenáriónkénti egyedi utótag a fixture-nevekhez. */
    this.nonce = nonce();

    /** HTTP-kliens az előfeltételekhez (nem a felületen kattintva). */
    this.api = createClient(config.baseUrl);

    /**
     * A böngésző. A `horgok.mjs` Before horga tölti fel — a konstruktorban még
     * nincs, mert a kontextus létrehozása aszinkron.
     * @type {import("playwright").BrowserContext}
     */
    this.context = null;
    /** @type {import("playwright").Page} */
    this.page = null;

    /** Bukáskor a riportra kerülő diagnosztika (a Before horog gyűjti). */
    this.konzol = [];
    this.hibasValaszok = [];
  }

  // --- Előfeltételek ------------------------------------------------------

  adminToken() {
    return adminToken(this.api);
  }

  /** A seed admin munkamenete `{ user, token }` alakban — beültethető a böngészőbe. */
  adminMunkamenet() {
    return adminMunkamenet(this.api);
  }

  ujTermek(felulir) {
    return letrehozottTermek(this.api, felulir);
  }

  ujVasarlo(felulir) {
    return regisztraltVasarlo(this.api, felulir);
  }

  ujRendeles(opciok) {
    return leadottRendeles(this.api, opciok);
  }

  keszletModositas(termek, ujKeszlet) {
    return keszletModositas(this.api, termek, ujKeszlet);
  }

  // --- Böngésző -----------------------------------------------------------

  /** Megnyit egy alkalmazás-útvonalat (pl. `/`, `/cart`, `/admin/orders`). */
  async megnyit(utvonal = "/") {
    await this.page.goto(`${this.baseUrl}${utvonal}`, { waitUntil: "domcontentloaded" });
  }

  /**
   * Beültet egy `localStorage` kulcsot a KÖVETKEZŐ oldalbetöltés elé.
   *
   * FONTOS: `megnyit()` ELŐTT kell hívni. Az `addInitScript` a következő
   * dokumentum betöltése előtt fut le; egy már megnyitott oldalra nincs hatással.
   */
  async tarolobaIr(kulcs, ertek) {
    await this.context.addInitScript(
      ([k, v]) => window.localStorage.setItem(k, v),
      [kulcs, String(ertek)],
    );
  }

  /**
   * A következő oldalbetöltés a kliens JS-kötege NÉLKÜL fut le.
   *
   * Minden szkript-kérést eldob, a beágyazott (inline) `<script>`-eket viszont
   * nem érinti — azok nem kérések. Így pontosan az mérhető, amit az index.html
   * fejlécében futó kód EGYEDÜL, a React elindulása előtt elvégez.
   *
   * Mindkét topológiában működik: dev módban a `/src/main.tsx` és a Vite
   * kliense, produkció-szerűben az `/assets/*.js` köteg is szkript-kérés.
   */
  async szkriptekNelkul() {
    await this.context.route("**/*", (utvonal) =>
      utvonal.request().resourceType() === "script" ? utvonal.abort() : utvonal.continue(),
    );
  }

  /**
   * Bejelentkezett munkamenettel indítja a következő oldalbetöltést — a
   * felület megkerülésével.
   *
   * FONTOS: `megnyit()` ELŐTT kell hívni. Az `addInitScript` a következő
   * dokumentum betöltése előtt fut le; egy már megnyitott oldalra nincs hatással.
   *
   * Miért az API-n át és nem a bejelentkező űrlapon: a bejelentkezési rate limit
   * IP-re szól és perzisztens (lásd support/fixtures.mjs), ráadásul minden
   * szcenárió elején végigkattintani a bejelentkezést lassú és törékeny. A
   * bejelentkezés folyamatát vizsgáló szcenáriók természetesen a felületet
   * használják — azoknak az a tárgyuk.
   *
   * A beírt alak a `client/src/auth.tsx` `webshop-auth` kulcsának alakja:
   * `{ user, token }`. Ha az ott változik, ez a metódus a másik oldala a
   * változtatásnak.
   */
  async bejelentkezveMint({ user, token }) {
    await this.tarolobaIr("webshop-auth", JSON.stringify({ user, token }));
  }
}

setWorldConstructor(Vilag);
