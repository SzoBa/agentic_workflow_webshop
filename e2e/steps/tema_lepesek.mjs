// A festés előtti téma szcenárióinak lépései (features/tema.feature).
//
// Ez a lépéskészlet SZÁNDÉKOSAN nem használ fixture-t és nem hívja az API-t: a
// mért kód (client/index.html beágyazott scriptje) a szerverről semmit nem tud.
// Az egyetlen két bemenete a `localStorage` és a rendszer szín-preferenciája,
// ezért mindkettőt a szcenárió állítja be — a futtató gép beállítása így nem
// szivárog be a mérésbe.

import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { expect } from "playwright/test";

/** A választás tárolt kulcsa — a client/src/ui.tsx `THEME_STORAGE_KEY`-je. */
const TEMA_KULCS = "webshop-theme";

Given("a rendszer sötét témát kér", async function () {
  await this.page.emulateMedia({ colorScheme: "dark" });
});

Given("a rendszer világos témát kér", async function () {
  // A Playwright alapértelmezése is ez, de kimondva a szcenárió nem függ attól,
  // hogy ez az alapértelmezés mikor változik meg.
  await this.page.emulateMedia({ colorScheme: "light" });
});

Given("a mentett téma-választás {string}", async function (valasztas) {
  await this.tarolobaIr(TEMA_KULCS, valasztas);
});

Given("a látogató még nem választott témát", async function () {
  // Nincs teendő: a szcenárió friss böngésző-kontextusban indul, tehát a kulcs
  // nem létezik (steps/horgok.mjs). A lépés attól van, hogy ez a szcenárió
  // ELŐFELTÉTELE, nem a véletlen műve.
});

When("a kliens kötege nélkül megnyitom a/az {string} útvonalat", async function (utvonal) {
  await this.szkriptekNelkul();
  await this.megnyit(utvonal);
});

Then("az oldal {string} témával indul", async function (varhato) {
  await expect(this.page.locator("html")).toHaveAttribute("data-theme", varhato);
});

Then("a React nem indult el", async function () {
  // A mérés érvényességének bizonyítéka. Ha a köteg mégis lefutott volna, a
  // gyökér-elem nem lenne üres — és akkor a fenti állítás már nem a beágyazott
  // scriptről mondana semmit.
  const gyokerTartalma = await this.page.locator("#root").innerHTML();
  assert.equal(
    gyokerTartalma,
    "",
    "A kliens kötege mégis lefutott: a #root nem üres, tehát a téma-állítás nem a " +
      "festés előtti scriptet méri.",
  );
});
