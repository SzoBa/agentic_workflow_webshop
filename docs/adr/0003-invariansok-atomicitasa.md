# Az invariánsokat atomicitási követelmény védi, nem az egyszálúság

A jelenlegi backend több invariánsát az védi, hogy a Node egy szálon fut, és a kód gondosan
ügyel arra, hogy az ellenőrzés és a módosítás közé **ne kerüljön `await`** (lásd
`server/src/routes/admin/users.ts`). Ennek a technikának egy szálpoolos futtatókörnyezetben —
például Spring Bootban — semmi értelme: ott a szál bárhol megszakítható. Ezért a specifikáció
minden ilyen szabályt **invariánsként + megkövetelt atomicitásként** fogalmaz meg („az
ellenőrzésnek és a módosításnak a versenytárs kérésekhez képest atominak kell lennie"), a
megvalósítás módját (tranzakció, zár, egyedi index) pedig az implementációra bízza.

## Considered Options

- **A Node-technika leírása követelményként** — maximális hűség a forráshoz, de egy másik
  konkurencia-modellben értelmezhetetlen utasítás, amit az implementáló vagy vakon lemásol
  (értelmetlen kód), vagy figyelmen kívül hagy (néma adatromlás).
- **Csak az invariáns kimondása** — „mindig legyen legalább egy admin", versenyhelyzet említése
  nélkül. Rövidebb, de az implementáló ilyenkor a kézenfekvő check-then-act mintát írja meg,
  ami szálak mellett pontosan azt az invariánst sérti, amit védeni akar.

## Consequences

- Az érintett szabályok tételesen fel vannak sorolva a specifikációban: egyedi felhasználónév és
  e-mail, „legalább egy admin", egy értékelés / felhasználó / termék, készletfoglalás
  ellenőrzése és a rendelés létrehozása, token-csere.
- A jelenlegi Node-implementáció **regisztrációs ága ma nem teljesíti** ezt a követelményt: a
  `hashPassword` `await`-je az egyediség-ellenőrzés és a beszúrás közé esik. Ez a javítási fázis
  egyik tétele.
- A Postgres-alapú megvalósításnál az egyediségi szabályok mögé **adatbázis-szintű megszorítás**
  is kerül, nem csak alkalmazáslogika — a megszorítás az egyetlen védelem, ami akkor is tart, ha
  az alkalmazás több példányban fut.
