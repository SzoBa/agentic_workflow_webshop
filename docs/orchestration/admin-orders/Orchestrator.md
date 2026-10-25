# FELBONTÁS TERVEZÉSI SABLON — admin rendeléskezelő

> Ez a dokumentum a **spec/admin-orders/** feature subagent-felbontásának terve. Az orchestrátor
> (a fő session) ez alapján delegál. **Egyik subagent sem kapja meg** — ez a szervezés könyvelése,
> nem a feature normája.
>
> Kapcsolódó: [`Running.md`](./Running.md) (futási napló) · [`Decision.md`](./Decision.md)
> (kontextus-átadási döntések indoklása).

---

## Választott szétválasztási logika

A szóba jövő logikák:

- **A — szerep szerint.** A meglévő `feature-implement` lánc változatlanul: kutató → implementáló →
  validáló. Három subagent, mindegyik a **teljes** specet látja.
- **B — réteg szerint.** Két párhuzamos implementáló (backend ∥ kliens), felderítés és átvétel
  nélkül.
- **C — hibrid.** Szerep szerinti lánc, de az implementálói lépés **két réteg-hatókörű futásra**
  bomlik, amiket egy előre befagyasztott interfész-szerződés köt össze.

**Választott: `[ ] A   [ ] B   [x] C   [ ] Egyéb: ____`**

**Indoklás.** Az **A** felbontásban az implementáló egyetlen futásban írna Java entitást, JPQL-t,
Spring kontrollert, React komponenst és Vitest tesztet — a kontextusa a futás végére két,
egymással semmilyen kapcsolatban nem álló konvenciórendszert tartalmazna, és a hosszú futás vége
felé pont a spec betűjétől sodródik el (ott születik a legtöbb hiba). A **B** felbontás gyors, de
kidobja a projekt agent-készletének két harmadát: a felderítés nélkül az implementáló újra kitalálja
a már meglévő mintákat, a validáció nélkül pedig az implementáló önbevallása lenne a mérce — amit a
`spec-validator` definíciója kifejezetten tilt.

A **C** azért a helyes választás, mert ennél a feature-nél a két réteg között **pontosan egy**
érintkezési felület van: a HTTP-válasz alakja és annak TypeScript-tükre. Ha ezt a felületet előre
befagyasztjuk (`plan.md` 1–2. szakasz), a két implementálói futás kontextusa **teljesen
elkülöníthető** — és akkor egyik sem hordozza a másik zaját. A párhuzamosítást viszont nem
vállaljuk: az F csomag a B által megírt `api.ts`-re épül, tehát szekvenciális.

---

## 1. subagent — `spec-researcher`

**Feladata:** Feltárni a kódbázis releváns konvencióit, mielőtt bárki kódot ír: hogyan van
bekötve az admin névtér védelme, hogyan lapoz a katalógus, hogyan képez az `OrderMapper`, milyen
mintát követnek az integrációs tesztek — és hol tér el a spec a valóságtól.

**Kontextus, amit megkap:**
- a `spec/admin-orders/` mappa útvonala és a benne talált három fájl felsorolása,
- a `plan.md` 3. szakasza (fájltulajdon) mint a felderítés fókuszterülete,
- annak jelzése, hogy a `spec/backend/` a rendszer általános normája — **hivatkozásként**, nem
  beillesztve,
- a `spec-konvenciok` skill (a definíciója tölti be automatikusan).

**Elvárt kimenet:** egyetlen magyar markdown eligazítás a saját kimeneti szerződése szerint:
érintett fájlok `fájl:sor` hivatkozással, követendő minták rövid kódidézettel, adatmodell,
tesztelési minta, eltérések és nyitott kérdések, javasolt sorrend.

**Validálási szempont:** minden állítás mellett van `fájl:sor` hivatkozás, és a hivatkozott hely
**tényleg létezik**. A jelentés nem ismétli a specet, hanem a kódbázisról szól. Ha a `plan.md`
hivatkozott sorszámai elcsúsztak, azt jelzi.

---

## 2. subagent — `spec-implementer` (B csomag: backend + típustükör)

**Feladata:** A `tasks.md` **B-M1 … B-M4** munkaegységeinek végrehajtása: lapozó általánosítása,
repository-lekérdezés, `OrderPage` / `AdminOrderView`, lekérdező szolgáltatás, a `@GetMapping`
bekötése, integrációs tesztek, és a `client/src/api.ts` típustükör.

**Kontextus, amit megkap:**
- a kutató jelentése **szó szerint**,
- a spec-mappa útvonala (a három fájlt maga olvassa be — ez a definíciója),
- kifejezetten: **a B csomag a megbízás**, az F csomaghoz nem nyúl,
- a `plan.md` 3. szakaszának fájltulajdon-táblázata mint kemény korlát,
- emlékeztető a két legvalószínűbb hibára: **ne írj Flyway-migrációt** (4.1), és az **ismeretlen
  `status` nem 400** (`AR-06`).

**Elvárt kimenet:** jelentés az elvégzett munkaegységekről `fájl:sor` hivatkozással, a `B`-hez
tartozó `AR-xx` pontok önellenőrzése bizonyítékkal, a `mvn test` / `npm run build` / `npm test`
**tényleges** kimenete, és — a lánc szempontjából a legfontosabb — a `client/src/api.ts` új
exportjainak **tényleges** alakja.

**Validálási szempont:** zöld `mvn test`. A `client/src/api.ts` exportjai megegyeznek a `plan.md`
2. szakaszában rögzített szerződéssel — ha eltér, az vagy jelentett és indokolt eltérés, vagy
javítandó. Nem keletkezett új fájl a `db/migration` alatt. A katalógus tesztek zöldek maradtak.

---

## 3. subagent — `spec-implementer` (F csomag: kliens)

**Feladata:** A `tasks.md` **F-M1 … F-M2** munkaegységeinek végrehajtása: az `AdminOrders.tsx`
képernyő, az útvonal és a menüpont, valamint a hozzá tartozó Vitest tesztek.

**Kontextus, amit megkap:**
- a `plan.md` 2. szakasza (a TypeScript-szerződés) és a B csomag jelentéséből **kizárólag** az
  `api.ts` exportjainak tényleges alakja,
- a spec-mappa útvonala,
- kifejezetten: **az F csomag a megbízás**; az `api.ts` **nem** az ő tulajdona — ha hiányzik belőle
  valami, azt jelenti, nem írja bele,
- a követendő minta megnevezése: `AdminUsers.tsx` + `AdminUsers.test.tsx`,
- emlékeztető: az **ES2020**-korlát (`Array#at` buktatja a buildet), a `ReservationStatus`
  újrahasznosítása, és hogy az **átmenettáblát nem másoljuk a kliensbe** (4.6).

**Amit szándékosan NEM kap meg:** a kutató jelentésének backend-részei (JPA, `@EntityGraph`,
Flyway, tranzakcióhatár, JPQL), a B csomag Java-oldali `fájl:sor` hivatkozásai, a
`hibakatalogus.md` — a hibaüzeneteket úgyis a szervertől veszi át változtatás nélkül.

**Elvárt kimenet:** jelentés az elvégzett munkaegységekről, az `F`-hez tartozó `AR-xx` pontok
önellenőrzése, és az `npm run build` / `npm test` **tényleges** kimenete.

**Validálási szempont:** zöld `npm run build` és `npm test`. Az `AdminOrders.tsx` a szerződés
szerinti `api.ts` függvényeket hívja, nem definiál saját `fetch`-et. A `client/src/api.ts` **nem
módosult** ebben a futásban.

---

## 4. subagent — `spec-validator`

**Feladata:** Friss szemmel végigmérni a `requirements.md` **összes `AR-xx`** pontját, és
pontonként ítéletet mondani bizonyítékkal. (A 2026-07-27-i futáskor `AR-01`…`AR-18`; azóta a
spec egy `AR-19` end-to-end ponttal bővült — lásd a `requirements.md` változásnaplóját. Ezért
a tartomány itt szándékosan nincs rögzítve.)

**Kontextus, amit megkap:**
- a spec-mappa útvonala,
- mindkét implementálói jelentés, kifejezetten **„mutató a bizonyítékhoz, nem bizonyíték"**
  megjelöléssel,
- a kérés: minden `AR-xx` pontra külön ítélet, mindegyik mellé `fájl:sor`, tesztnév vagy
  tényleges kimenet.

**Validálási szempont (mi teszi a validátor jelentését elfogadhatóvá):** minden `[teljesül]` mellett
van **mért** bizonyíték — nem az implementáló állítására hivatkozik. A Docker hiánya miatt
elmaradt mérés `[kétséges]`, nem `[nem teljesül]`. A 18 pontból egy sem maradt ítélet nélkül.

---

## Mi az az információ, amelyet az orchestrátor tart meg magának (nem adja át)?

1. **A másik subagent nyers jelentése.** A B csomag jelentése ~100 sor Java-részlet; ebből az F
   csomag **egyetlen** dolgot kap: az `api.ts` exportjainak tényleges alakját. A kutató
   jelentésének backend-részeit ugyanígy nem kapja meg az F csomag.
2. **A feature kiválasztásának indoklása.** Az orchestrátor tudja, miért *ez* a feature készül el
   (a rendeléskezelés a funkció-lánc hiányzó közepe, ez volt a legnagyobb valódi hézag). Ez az
   érvelés az implementálónak **zaj**, sőt kockázat: a „miért fontos" indoklás rábírhatja, hogy a
   spec keretein túl is „hasznos" dolgokat építsen. A norma a spec betűje, nem a mögötte lévő szándék.
3. **A modellválasztási triázs.** Melyik subagent milyen modellen fut, és miért — ez az
   orchestrátor költség-döntése, a subagent munkájára nézve irreleváns.
4. **A javítókör-számláló.** Hányadik körben tart a lánc, és mennyi maradt a 2-es korlátból. A
   javító körre hívott implementáló a **konkrét hibákat** kapja, nem azt, hogy „ez az utolsó
   esélyed" — az torzítana a „zöldre erőltetés" irányába, amit a definíciója kifejezetten tilt.
5. **Ez a három orchestration-dokumentum.** Az `Orchestrator.md`, a `Running.md` és a
   `Decision.md` egyik subagenthez sem jut el. Ezért is vannak a `spec/` mappán **kívül**: mindhárom
   agent `Glob`-bal beolvassa a spec-mappa összes `.md` fájlját, és **normatívnak** tekinti őket —
   egy futási napló ott hamis követelményként viselkedne.
