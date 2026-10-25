// A váz önellenőrzésének lépései (features/onteszt.feature).
//
// SZÁNDÉKOSAN csak ez az egy lépéskészlet létezik. A terméki lépések külön
// fájlokba kerülnek; ide ne kerüljön üzleti szabály — ez a fájl a vázat méri.

import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "playwright/test";
import assert from "node:assert/strict";

Given("egy regisztrált vásárló", async function () {
  this.vasarlo = await this.ujVasarlo();
});

// A két navigációs lépés `a/az` alternatívát enged: magyarul „az /admin/orders
// útvonalat" a helyes alak, „a /" viszont marad. Egyetlen definíció fedi mindkettőt
// — két külön lépésszöveg ugyanarra a mozdulatra fölösleges duplikáció lenne.
// Ezek az EGYETLEN lépések ebből a fájlból, amiket terméki feature-fájlok is
// használnak: általános navigáció, nem üzleti szabály.
When("megnyitom a/az {string} útvonalat", async function (utvonal) {
  await this.megnyit(utvonal);
});

When("bejelentkezett munkamenettel megnyitom a/az {string} útvonalat", async function (utvonal) {
  // A sorrend kötött: a munkamenet beültetése a KÖVETKEZŐ oldalbetöltés előtt fut
  // le (addInitScript), egy már megnyitott oldalra nincs hatással.
  await this.bejelentkezveMint(this.vasarlo);
  await this.megnyit(utvonal);
});

Then("megjelenik a terméklista", async function () {
  // Szerep + név szerinti kiválasztás, ahogy a Vitest komponenstesztek is teszik
  // (client/test/). A kliensben nincs egyetlen data-testid sem, és ne is legyen:
  // ha egy elem szerep vagy címke alapján elérhetetlen, az akadálymentességi
  // hiány a komponensben, nem a tesztben.
  await expect(this.page.getByRole("heading", { name: "Termékek", level: 1 })).toBeVisible();
});

Then("a backend egészséges", async function () {
  const res = await this.api.get("/api/health");
  assert.equal(res.status, 200, `/api/health → ${res.status} (200 helyett)`);
  assert.ok(res.body, `/api/health nem JSON-nal válaszolt: ${res.raw.slice(0, 120)}`);
});

Then("a felület a vásárló nevével jelzi a belépést", async function () {
  // A fejlécben "Belépve: <felhasználónév>" jelenik meg (client/src/App.tsx).
  // Ha ez látszik, a beültetett munkamenetet a kliens elfogadta ÉS a szerver is
  // érvényesnek találta (az AuthProvider indulás után /api/auth/me-vel ellenőrzi;
  // érvénytelen tokenre kiléptetne).
  await expect(this.page.getByText(`Belépve: ${this.vasarlo.user.username}`)).toBeVisible();
});

Then("kijelentkezve és üres kosárral indulok", async function () {
  // Az izoláció bizonyítéka: a szcenárió friss böngésző-kontextust kapott, tehát
  // nem látja az előző szcenárió munkamenetét és kosarát.
  //
  // FIGYELEM: nem a KULCSOK hiányát mérjük. Az alkalmazás betöltéskor magától
  // kiírja mindkét kulcsot — az AuthProvider a `{user:null,token:null}` kezdeti
  // állapotot, a CartProvider az üres tömböt (client/src/auth.tsx,
  // client/src/cart.tsx). A kulcsok tehát MINDIG ott vannak; a kérdés az, hogy
  // mi van bennük.
  const tarolo = await this.page.evaluate(() =>
    Object.fromEntries(
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith("webshop-"))
        .map((k) => [k, window.localStorage.getItem(k)]),
    ),
  );

  assert.deepEqual(
    JSON.parse(tarolo["webshop-auth"] ?? "null"),
    { user: null, token: null },
    `Szivárgott munkamenet az előző szcenárióból: ${tarolo["webshop-auth"]}`,
  );

  // Kijelentkezve a kosár kulcsa `webshop-cart:anon` (cartKey a cart.tsx-ben).
  // Ha bármelyik kosárkulcs nem üres, az előző szcenárió kosara szivárgott át.
  for (const [kulcs, ertek] of Object.entries(tarolo)) {
    if (!kulcs.startsWith("webshop-cart:")) continue;
    assert.deepEqual(JSON.parse(ertek), [], `Szivárgott kosár a(z) ${kulcs} kulcson: ${ertek}`);
  }
});
