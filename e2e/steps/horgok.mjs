// A futás életciklusa: böngésző indítása, szcenáriónkénti izoláció, diagnosztika.

import { AfterAll, After, Before, BeforeAll, Status } from "@cucumber/cucumber";
import { chromium } from "playwright";
import { konfiguracio } from "../support/kornyezet.mjs";

const config = konfiguracio();

/** @type {import("playwright").Browser} */
let bongeszo;

// A böngésző FUTÁSONKÉNT egyszer indul, nem szcenáriónként: a Chromium indítása
// nagyságrendekkel drágább, mint egy kontextus létrehozása, és szcenáriónként
// újraindítva ez uralná a futásidőt.
BeforeAll(async function () {
  bongeszo = await chromium.launch({
    headless: !config.headed,
    slowMo: config.slowMo,
  });
});

AfterAll(async function () {
  await bongeszo?.close();
});

// Szcenáriónként FRISS böngésző-kontextus. Ez adja az izolációt, teardown-kód
// nélkül: az új kontextus üres localStorage-dzsal és süti nélkül indul, tehát a
// `webshop-auth` munkamenet (client/src/auth.tsx) és a kosár (client/src/cart.tsx)
// is tiszta. A szerver állapota ettől NEM áll vissza — lásd support/fixtures.mjs.
Before(async function () {
  this.context = await bongeszo.newContext({ baseURL: config.baseUrl });
  this.page = await this.context.newPage();

  // Diagnosztika gyűjtése. Bukáskor a képernyőkép megmutatja, mit LÁTOTT a
  // felhasználó; a konzol és a hibás válaszok azt, hogy MIÉRT azt látta.
  //
  // FÜGGŐSÉG, amit ez a három sor kihasznál: a figyelők a `this`-re (a Világra)
  // gyűjtenek, és a lapot is itt hozzuk létre. Ez CSAK azért helyes, mert
  // mindkettő SZCENÁRIÓNKÉNTI: a Cucumber minden szcenárióhoz új Világot ad, a
  // lap pedig a szcenárió végén bezáródik a kontextussal. Ha valaki a lapot vagy
  // a kontextust sebességből `BeforeAll`-ba mozgatja, a figyelők túlélik a
  // szcenáriót, és a diagnosztika csendben átszivárog a következőkbe — a bukó
  // szcenárió riportjában az előzők konzolja jelenne meg.
  this.page.on("console", (uzenet) => {
    this.konzol.push(`[${uzenet.type()}] ${uzenet.text()}`);
  });
  this.page.on("pageerror", (hiba) => {
    this.konzol.push(`[pageerror] ${hiba.message}`);
  });
  this.page.on("response", (valasz) => {
    if (valasz.status() >= 400) {
      this.hibasValaszok.push(`${valasz.status()} ${valasz.request().method()} ${valasz.url()}`);
    }
  });
});

After(async function ({ result }) {
  if (result?.status === Status.FAILED && this.page && !this.page.isClosed()) {
    // A képernyőkép hibája nem nyomhatja el a szcenárió VALÓDI hibáját: ha a
    // lap időközben összeomlott, csak jelezzük, és megyünk tovább.
    try {
      await this.attach(await this.page.screenshot({ fullPage: true }), "image/png");
      await this.attach(`URL: ${this.page.url()}`, "text/plain");
    } catch (hiba) {
      await this.attach(`Képernyőkép nem készült: ${hiba.message}`, "text/plain");
    }
    if (this.hibasValaszok.length > 0) {
      await this.attach(`Hibás HTTP-válaszok:\n${this.hibasValaszok.join("\n")}`, "text/plain");
    }
    if (this.konzol.length > 0) {
      await this.attach(`Böngésző-konzol:\n${this.konzol.join("\n")}`, "text/plain");
    }
  }
  await this.context?.close();
});
