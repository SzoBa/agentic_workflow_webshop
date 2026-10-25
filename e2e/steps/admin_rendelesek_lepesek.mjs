// Az admin rendeléskezelő szcenárióinak lépései
// (features/admin-rendelesek-lista.feature, features/admin-rendelesek-statusz.feature).
//
// HÁROM SZABÁLY, amit ez a fájl testesít meg:
//
//  1. AZ ELŐFELTÉTELEK AZ API-N ÉPÜLNEK. Termék, vásárló, rendelés, készlet-
//     módosítás mind egy-egy HTTP-kérés (support/fixtures.mjs). A felület akkor
//     jön képbe, amikor a szcenárió TÁRGYA a felület — itt a rendeléskezelő az.
//
//  2. KIVÁLASZTÁS SZEREP ÉS CÍMKE SZERINT. A client/src/ egyetlen `data-testid`-t
//     sem tartalmaz, és ne is kezdjen. Ha egy elem szerep vagy címke alapján
//     elérhetetlen, az akadálymentességi hiány a komponensben.
//     A kiválasztók forrása a megbízásban kapott UI-kiválasztói szerződés
//     (szerep + név, címke, szó szerinti szövegek), nem a kliens forráskódja: ez
//     a fájl a képernyővel PÁRHUZAMOSAN készült, előretolt módban.
//
//  3. A SZERVER ÁLLAPOTA SOHA NEM ÁLL VISSZA. Ezért minden darabszámot állító
//     lépés előtt a szcenárió leszűkít a saját, nonce-os fixture-jére — a
//     „1 rendelés" csak azért igaz, mert az e-mail címre rajta kívül semmi nem
//     illeszkedhet.
//
// A navigációs lépéseket (`megnyitom a/az … útvonalat`) a váz adja
// (steps/onteszt_lepesek.mjs); itt nincsenek újradefiniálva.

import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "playwright/test";
import { elvarStatusz } from "../support/api.mjs";

/** A rendeléskezelő keresőmezőjének címkéje — az UI-kiválasztói szerződésből. */
const KERESO_CIMKE = "Keresés (vevő neve, email, rendelésazonosító)";

/** Az üres találathalmaz üzenete — az UI-kiválasztói szerződésből, szó szerint. */
const URES_LISTA = "Nincs megjeleníthető rendelés.";

/**
 * Egy rendelés sora a táblázatban, az azonosítója alapján.
 *
 * Szerep szerint választ (`row`), és az azonosítóra szűr: a rendelés-azonosító
 * UUID, tehát a soron belül semmi máshoz nem illeszkedhet.
 */
function sor(vilag, rendeles) {
  return vilag.page.getByRole("row").filter({ hasText: rendeles.id });
}

/** Az a rendelés, amiről a szcenárió éppen beszél (alapból az elsőként leadott). */
function aktualisRendeles(vilag) {
  if (!vilag.rendeles) throw new Error("Ehhez a lépéshez előbb le kell adni egy rendelést.");
  return vilag.rendeles;
}

/** Beírja a keresőmezőbe a szöveget. A `fill` egy input-eseményt ad, nem karakterenkéntit. */
async function keres(vilag, szoveg) {
  await vilag.page.getByLabel(KERESO_CIMKE).fill(szoveg);
}

// --- Előfeltételek ---------------------------------------------------------

Given("egy raktáron lévő termék", async function () {
  this.termek = await this.ujTermek();
});

// A mennyiség 2, nem 1: így a "fedezethiány" szcenárió le tudja vinni a
// készletet a rendelt darabszám ALÁ (1-re) anélkül, hogy nullát kellene írnia.
Given("a vásárló leadott egy rendelést a termékre", async function () {
  this.rendeles = await this.ujRendeles({
    vasarlo: this.vasarlo,
    termek: this.termek,
    mennyiseg: 2,
  });
  this.rendelesek = [this.rendeles];
});

Given("a vásárló leadott még egy rendelést a termékre", async function () {
  this.ujabbRendeles = await this.ujRendeles({
    vasarlo: this.vasarlo,
    termek: this.termek,
    mennyiseg: 1,
  });
  this.rendelesek.push(this.ujabbRendeles);
});

// A készletet az API-n állítjuk, nem a termékszerkesztő képernyőn: a szcenárió
// tárgya a rendeléskezelő, nem a termékfelvitel. A rendelt 2 db-hoz képest az 1
// db fedezethiány — a `delivered`-re váltás a FIZIKAI készletből von le, és
// fedezethiánynál 409-cel elutasít (spec/backend/requirements.md, K-25 / K-26).
Given("az admin a rendeltnél kevesebbre csökkentette a termék készletét", async function () {
  await this.keszletModositas(this.termek, 1);
});

// --- Navigáció és szűrés ---------------------------------------------------

When("bejelentkezett adminként megnyitom a/az {string} útvonalat", async function (utvonal) {
  // A sorrend kötött: a munkamenet beültetése a KÖVETKEZŐ oldalbetöltés előtt
  // fut le (addInitScript), egy már megnyitott oldalra nincs hatással.
  await this.bejelentkezveMint(await this.adminMunkamenet());
  await this.megnyit(utvonal);
});

When("a vásárló e-mail címére keresek", async function () {
  await keres(this, this.vasarlo.user.email);
});

When("a rendelés azonosítójára keresek", async function () {
  await keres(this, aktualisRendeles(this).id);
});

// `a/az` alternatíva: „a »Kiszállítva« státuszt", de „az »Összes« státuszt".
// A választás CÍMKE szerint történik, nem érték szerint — a felület a magyar
// címkét mutatja, a mögötte lévő `all` / `pending` érték a kliens és a szerver
// belügye.
When("a/az {string} státuszt választom a szűrőben", async function (cimke) {
  await this.page.getByLabel("Státusz").selectOption({ label: cimke });
});

// Újratöltés: a felület állapotát eldobja, a munkamenetet (localStorage) nem. Így
// a következő állítás már azt méri, amit a SZERVER ad vissza, nem azt, amit a
// kliens a sikeres PATCH után a saját állapotában átírt.
When("újratöltöm a rendeléskezelőt", async function () {
  await this.page.reload({ waitUntil: "domcontentloaded" });
});

// --- Státuszváltás ---------------------------------------------------------

When("a rendelés során a/az {string} gombra kattintok", async function (felirat) {
  await sor(this, aktualisRendeles(this)).getByRole("button", { name: felirat }).click();
});

// --- Állítások: a képernyő -------------------------------------------------

Then("megjelenik a/az {string} képernyő", async function (cim) {
  await expect(this.page.getByRole("heading", { name: cim, level: 1 })).toBeVisible();
});

// A HIÁNY mérése önmagában nem bizonyít semmit: egy még ki sem rajzolt oldalon is
// igaz. Ezért a szcenárióban ezt MINDIG megelőzi egy pozitív horgony (a fejléc
// „Belépve: …" szövege), ami megvárja, hogy a felület betöltsön.
//
// Azt SZÁNDÉKOSAN nem állítjuk, hogy a RequireAdmin hová irányít át: az
// átirányítás célja nem szerepel a kapott UI-kiválasztói szerződésben, és az
// AR-12 sem mondja meg. Kitalálni annyi lenne, mint egy nem létező normát mérni.
Then("nem jelenik meg a/az {string} képernyő", async function (cim) {
  await expect(this.page.getByRole("heading", { name: cim, level: 1 })).toHaveCount(0);
});

// A menüpont neve `exact`: a fejlécben ott van a „Rendeléseim" link is, amire a
// részletegyezés ráillene.
Then("látszik a/az {string} menüpont", async function (nev) {
  await expect(this.page.getByRole("link", { name: nev, exact: true })).toBeVisible();
});

Then("nem látszik a/az {string} menüpont", async function (nev) {
  await expect(this.page.getByRole("link", { name: nev, exact: true })).toHaveCount(0);
});

// --- Állítások: a rendelés sora --------------------------------------------

Then("a rendelés sora látszik", async function () {
  await expect(sor(this, aktualisRendeles(this))).toBeVisible();
});

Then("a rendelés sora nem látszik", async function () {
  await expect(sor(this, aktualisRendeles(this))).toHaveCount(0);
});

Then("a rendelés sora tartalmazza a rendelés azonosítóját", async function () {
  // A `sor()` maga az azonosítóra szűr, ezért ez a lépés a láthatóságot méri:
  // ha nincs ilyen sor, itt derül ki, nem három lépéssel később.
  await expect(sor(this, aktualisRendeles(this))).toBeVisible();
});

// KORLÁT, amit érdemes tudni: a fixture a `customer.name`-be a FELHASZNÁLÓNEVET
// írja (support/fixtures.mjs), mert az nonce-os, tehát a keresővel egyértelműen
// megtalálható. Ezért ez a lépés a „vevő neve" és az esetleges külön
// „felhasználónév" oszlopot NEM tudja megkülönböztetni — azt méri, hogy a
// leadáskori vevői másolat neve és e-mailje eljut a sorig.
Then("a rendelés sora tartalmazza a vásárló nevét és e-mail címét", async function () {
  const rendelesSor = sor(this, aktualisRendeles(this));
  await expect(rendelesSor).toContainText(this.vasarlo.user.username);
  await expect(rendelesSor).toContainText(this.vasarlo.user.email);
});

Then("a rendelés sora tartalmazza a megrendelt terméket a darabszámával", async function () {
  const tetel = aktualisRendeles(this).items[0];
  await expect(sor(this, aktualisRendeles(this))).toContainText(
    `${tetel.name} × ${tetel.quantity} db`,
  );
});

// A tárolt végösszeget mérjük, nem a tételsorokból újraszámoltat: a szerver
// szerinti `total` az igazság. A formázás a kliens `formatPrice`-áé, ezért csak
// a számjegyeket vetjük össze — a szóköz-fajta (NBSP) és a pénznem-jel a
// böngésző Intl-implementációjától függ.
Then("a rendelés sora tartalmazza a rendelés végösszegét", async function () {
  const rendelesSor = sor(this, aktualisRendeles(this));
  const szamjegyek = String(aktualisRendeles(this).total);
  const szoveg = (await rendelesSor.innerText()).replace(/[^\d]/g, "");
  expect(szoveg).toContain(szamjegyek);
});

// A státuszváltó gomb HIÁNYA a kiszállított soron (AR-20). A `sor()` maga az
// azonosítóra szűr, tehát a nulla találat erre az EGY sorra vonatkozik, nem a
// táblázat egészére. A hiány méréséhez itt is kell a pozitív horgony: a
// szcenárióban ezt megelőzi a „a rendelés sorának státusza »Kiszállítva«"
// lépés, ami megvárja, hogy a sor a szerver adataival kirajzolódjon.
Then("a rendelés során nem jelenik meg a/az {string} gomb", async function (felirat) {
  await expect(
    sor(this, aktualisRendeles(this)).getByRole("button", { name: felirat }),
  ).toHaveCount(0);
});

Then("a rendelés sorának státusza {string}", async function (cimke) {
  // A címke a meglévő ORDER_STATUS_LABELS-ből jön (AR-13): ugyanarra a fogalomra
  // nem születik új magyar szöveg. A szcenárió a szó szerinti címkét adja át.
  await expect(sor(this, aktualisRendeles(this))).toContainText(cimke);
});

Then("a később leadott rendelés sora előrébb van a korábban leadottnál", async function () {
  const [korabbi, kesobbi] = this.rendelesek;
  const sorok = await this.page.getByRole("row").allInnerTexts();
  const kesobbiIndex = sorok.findIndex((s) => s.includes(kesobbi.id));
  const korabbiIndex = sorok.findIndex((s) => s.includes(korabbi.id));

  expect(kesobbiIndex, `A később leadott rendelés (${kesobbi.id}) sora nincs a listában`)
    .toBeGreaterThanOrEqual(0);
  expect(korabbiIndex, `A korábban leadott rendelés (${korabbi.id}) sora nincs a listában`)
    .toBeGreaterThanOrEqual(0);
  expect(
    kesobbiIndex,
    "A rendezés `seq` szerint CSÖKKENŐ: a később leadott rendelésnek elöl kell lennie.",
  ).toBeLessThan(korabbiIndex);
});

// A szűrt találatszám — a `total` a SZŰRT halmaz mérete, nem a teljes
// rendelésszám. Az `exact` kötelező: a "11 rendelés" tartalmazza az "1 rendelés"
// szöveget is.
Then("a lista {string} találatot jelez", async function (szoveg) {
  await expect(this.page.getByText(szoveg, { exact: true })).toBeVisible();
});

// Az üres találathalmaz üzenete. Csak akkor determinisztikus, ha a szcenárió
// előbb a saját nonce-os fixture-jére szűkített: a teljes lista SOHA nem üres, és
// üres katalógust feltételezni tilos (support/fixtures.mjs, 1. megkötés).
Then("a lista az üres találathalmaz üzenetét mutatja", async function () {
  await expect(this.page.getByText(URES_LISTA, { exact: true })).toBeVisible();
});

// --- Állítások: a foglalás -------------------------------------------------

// A meglévő ReservationStatus komponens kimenete (AR-15): `pending`-nél
// visszaszámláló, `expired`-nél a lejárat magyarázata, egyébként semmi. A
// képernyő maga nem ágazik el a státuszra — ezt méri ez a két lépés.
// Az `expired` ág itt nem mérhető: azt csak a lejárati söprő ütemező állítja elő.
Then("a rendelés sora a foglalás hátralévő idejét mutatja", async function () {
  await expect(sor(this, aktualisRendeles(this))).toContainText(/A foglalás még .+ érvényes\./);
});

// `delivered`-nél a ReservationStatus SEMMIT nem ír ki — sem visszaszámlálót, sem
// lejárat-magyarázatot. A minta ezért a mindkettőben közös kezdetre („A foglalás
// még …" / „A foglalás lejárt, …") illeszkedik: ha bármelyik ág megjelenne egy
// kiszállított soron, az elágazás visszaszivárgott a képernyőbe (AR-15).
Then("a rendelés sora nem mutat foglalás-szöveget", async function () {
  await expect(sor(this, aktualisRendeles(this))).not.toContainText(/A foglalás/);
});

// --- Állítások: a szerver hibaüzenete --------------------------------------

// A hibaüzenet SZÓ SZERINT a spec/backend/hibakatalogus.md-ből való. Ha ez a
// lépés a szövegen bukik, az a kliens vagy a katalógus hibája — nem a
// szcenárióé, és nem a várt szöveget kell igazítani.
Then("a rendelés sorában megjelenik a készlethiányra figyelmeztető hibaüzenet", async function () {
  await expect(sor(this, aktualisRendeles(this))).toContainText(
    /nincs elegendő készlet a rendelés teljesítéséhez/,
  );
});

// A darabszámot mintával ellenőrizzük, nem konkrét számmal: az üzenetbe a szerver
// írja bele az általa elérhetőnek tartott mennyiséget, és ezt a szcenárió NEM
// hivatott újraszámolni — az üzleti szabály átmásolása a tesztbe tilos.
Then("a hibaüzenet megnevezi a terméket és az elérhető darabszámot", async function () {
  const rendelesSor = sor(this, aktualisRendeles(this));
  await expect(rendelesSor).toContainText(this.termek.name);
  await expect(rendelesSor).toContainText(/\(elérhető: \d+ db\)/);
});

// A hibaüzenet HIÁNYA — az egyetlen hely, ahol nem szerep vagy címke szerint
// választunk. Egy `<p className="error">`-nek nincs ARIA-szerepe, amire fogni
// lehetne, és itt épp az a kérdés, hogy egyáltalán megjelent-e ilyen elem. Ez
// MEGLÉVŐ megjelenítési osztály, nem a teszt kedvéért felakasztott fogantyú.
//
// AKADÁLYMENTESSÉGI HIÁNY, amit ez a lépés kikerül: a soronkénti hibaüzenetnek
// nincs `role="alert"`/`status` szerepe, ezért a képernyőolvasó sem jelzi az
// adminnak, hogy a mentés elbukott. Ezt jelentjük, nem javítjuk.
Then("a rendelés sorában nem jelenik meg hibaüzenet", async function () {
  await expect(sor(this, aktualisRendeles(this)).locator("p.error")).toHaveCount(0);
});

// Az idempotencia BIZONYÍTÉKA: a felületen látott státusz önmagában nem
// zárja ki a kétszeres levonást — azt csak a készlet mondja meg. Ezért megy ez
// az állítás az API-ra, nem a képernyőre.
Then("a termék készlete pontosan egyszer csökkent a rendelt darabszámmal", async function () {
  const mennyiseg = aktualisRendeles(this).items[0].quantity;
  const termek = elvarStatusz(
    await this.api.get(`/api/products/${this.termek.id}`),
    200,
    "Termék lekérdezése",
  );
  expect(termek.stock).toBe(this.termek.stock - mennyiseg);
});

// --- A háttérlépések „már megtörtént" alakjai ------------------------------

Given("a rendelés során a/az {string} gombra kattintottam", async function (felirat) {
  const rendelesSor = sor(this, aktualisRendeles(this));
  await rendelesSor.getByRole("button", { name: felirat }).click();
  // Megvárjuk, amíg a váltás végigment: enélkül a következő kattintás még a
  // korábbi kérés közben érné a sort, ahol a gomb `disabled`.
  await expect(rendelesSor).toContainText("Kiszállítva");
});
