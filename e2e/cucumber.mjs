// Cucumber-profilok. A kapcsolók feldolgozása és a környezet-ellenőrzés NEM itt
// van, hanem a `run.mjs`-ben — ez a fájl csak azt mondja meg, mit hol keressen a
// cucumber-js, és hogyan riportáljon.

const kozos = {
  // Csak a lépésdefiníciókat töltjük be. A `support/` modulokat ezek importálják,
  // külön betöltésük felesleges (lépésdefiníció nincs bennük).
  import: ["steps/**/*.mjs"],
  paths: ["features/**/*.feature"],

  // Egy szcenárió sem maradhat implementálatlan lépéssel: a hiányzó lépés
  // csendes "undefined" helyett bukás legyen.
  strict: true,

  // A futás SOROS. Nem technikai korlát, hanem a mért rendszer tulajdonsága:
  // a szerver állapota nem áll vissza szcenáriók között, és a bejelentkezési
  // rate limit IP-re szól — párhuzamos futásnál mindkettő nehezen olvasható
  // bukásokat okoz. Ha egy nap kell a párhuzamosítás, előbb a fixture-izolációt
  // kell átgondolni (support/fixtures.mjs).
  parallel: 0,

  // Újrapróbálkozás SZÁNDÉKOSAN nincs. Egy retry-jal zöldülő e2e teszt nem zöld,
  // csak elrejtett. Ha egy szcenárió billeg, azt javítani kell, nem ismételni.
  retry: 0,
};

export default {
  ...kozos,
  format: ["progress-bar", "html:reports/report.html"],
};

export const headed = {
  ...kozos,
  format: ["progress", "html:reports/report.html"],
};

// CI: sorosan haladó, nem kurzorvezérelt kimenet (a progress-bar a GitHub
// Actions naplójában olvashatatlan visszatörléseket hagy), plusz a riport.
export const ci = {
  ...kozos,
  format: ["progress", "html:reports/report.html"],
};
