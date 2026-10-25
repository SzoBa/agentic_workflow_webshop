# Pipeline-riport — `spec/edit-user-data`

Az implementációs lánc futásának naplója és a
[`docs/scenario-catalog/scenario-katalogus-edit-user-data.md`](../../docs/scenario-catalog/scenario-katalogus-edit-user-data.md)
nyolc forgatókönyve elleni értékelés.

**Mérés dátuma:** 2026-08-02 · **Ág:** `feature/pipeline` · **Körök száma:** 2

## Módszertani megjegyzés — mit kapott a lánc, és mit nem

A `modifs.md` szerint a `spec/edit-user-data/` mappa **szándékosan rontott** változat, és a
scenario-katalógus egy **bővebb** specváltozat ellen íródott (`FA-01…FA-30`). Ezért:

- a `spec-implementer` és a `spec-validator` futásai **soha nem kapták meg** sem a katalógust,
  sem a `modifs.md`-t, sem a `docs/edit-user-data/eredeti-spec/` mappát — minden delegálás
  promptja tételesen tiltotta ezek olvasását;
- a katalógus **kizárólag mérőeszköz**: ez a riport méri vele az eredményt, a lánc nem
  dolgozott belőle;
- a 2. kör spec-élesítése **kizárólag a validátor jelentéséből** táplálkozott, nem a
  katalógusból. Ez fontos: ha a katalógusból élesítettem volna, a mérés körkörös lenne
  („a specbe beleírom a választ, aztán megmérem, hogy megvan-e").

**Az értékelés metrikája:** `Igen` = 1 pont, `Részben` = 0,5 pont, `Nem` = 0 pont. Egy
forgatókönyv akkor `Igen`, ha a **satisfaction kritériumában felsorolt összes** asszertálás
bizonyítottan teljesül — futtatott teszt vagy tényleges parancskimenet alapján, nem kódolvasásból.

---

# 1. rész — Forgatókönyvenkénti értékelés

## Forgatókönyv 1: A felhasználó átírja a szállítási címét

**Teljesült-e?** 1. kör: [x] Igen · 2. kör: [x] Igen

| Asszertálás | Állapot | Bizonyíték |
|---|---|---|
| `PUT /api/auth/me` → `200` | ✅ | `AccountApiTest.savesProfileAndReturnsThePublicUserShape` |
| a válasz **pontosan** `id`, `username`, `email`, `address`, `role` | ✅ | ugyanott: `user.size() == 5` |
| `token` és jelszómező **nincs** a válaszban | ✅ | ugyanott: `has("token") == false` |
| a mentés **előtti** tokennel a `GET /api/auth/me` `200`, az `address` az új érték | ✅ | `AccountApiTest.profileSaveKeepsTheSession` |
| az űrlap előtöltve érkezik | ✅ | `Profile.test.tsx` — előtöltés-eset |

**Maradék eltérés (nem rontja a kritériumot):** a katalógus akciója szerint a felhasználó *„a
fejlécben a felhasználónevére kattint"*. A fejléc-link és a `/profile` útvonal bekötését
(`App.tsx:187-189,222-231`) **egyetlen futó teszt sem rendereli** — nincs `App.test.tsx`, és az
`e2e` sem készült el. A `RequireAuth.test.tsx` a **saját** útvonaltábláján mér, nem az
`App.tsx`-én. A satisfaction kritérium csak HTTP-szintű asszertálásokat sorol, ezért `Igen`, de a
belépő útvonala statikusan van igazolva, nem futtatva.

---

## Forgatókönyv 2: A jelszócsere kicseréli a munkamenetet is

**Teljesült-e?** 1. kör: [x] Részben · 2. kör: [x] Igen

| Asszertálás | 1. kör | 2. kör | Bizonyíték (2. kör) |
|---|---|---|---|
| (1) `POST /api/auth/password` → `200`, `user` + `token` | ✅ | ✅ | `AccountApiTest.changesPasswordAndRotatesTheToken` |
| (2) a **válaszban kapott** tokennel `GET /api/auth/me` → `200` | ✅ | ✅ | ugyanott |
| (3) a csere **előtti** tokennel ugyanez → `401` | ✅ | ✅ | ugyanott |
| (4) login az újjal `200`, a régivel `401` `Hibás felhasználónév vagy jelszó.` | ✅ | ✅ | ugyanott |
| a felületen **nem** jelenik meg a `SessionExpiredNotice`, a user belépve marad | ❌ | ✅ | `auth.test.tsx:315-332` |

**1. körös eltérés:** a szerveroldali négy asszertálás teljesült, de a katalógus megjegyzése
pontosan a kliensoldali felet emeli ki: *„Egy naiv implementáció vagy kilépteti a felhasználót
(rotál, de nem tárolja az új tokent), vagy nem érvényteleníti a régit."* Az `AuthProvider`
`changePassword` metódusa (`auth.tsx:174-181`) **kódolvasásra helyes volt, de teljesen
lefedetlen**: a `Profile.test.tsx` a `../src/auth` modult mockolja, a `client/test/auth.test.tsx`-ben
pedig 0 találat volt a `changePassword`-re. A validátor ezt önállóan megtalálta (`FA-07`
`[kétséges]`), és ez lett a 2. kör legjobb fogása.

**2. körös állapot:** `auth.test.tsx:315-332` **valódi `AuthProvider`-t** renderel:
`setAuthToken("rotalt-token")` megtörtént, a `webshop-auth` kulcs tokenje az új, és a
munkamenet-lejárat nem gyulladt be.

---

## Forgatókönyv 3: Az elgépelt jelszó nem lépteti ki a felhasználót

**Teljesült-e?** 1. kör: [x] Részben · 2. kör: [x] Igen

| Asszertálás | 1. kör | 2. kör | Bizonyíték (2. kör) |
|---|---|---|---|
| az első válasz **`400`** | ❌ **`401` volt** | ✅ | `AccountService.java:142` → `ApiException.badRequest(...)`; `AccountApiTest.java:269` |
| a törzs pontosan `A jelenlegi jelszó hibás.` | ✅ | ✅ | `AccountApiTest.wrongCurrentPasswordHidesFieldErrors` — szó szerinti asszertálás |
| az `Érvénytelen email cím.` **nem** jelenik meg sehol | ✅ | ✅ | ugyanott (a kötött sorrend elfedi a mezőhibát) |
| a user nem kerül a `/login`-ra, belépve marad | ⚠️ kerülőúton | ✅ | `api.test.ts:446` (a `400` nem léptet ki), `auth.test.tsx:352` |
| a profil a mentés előttivel azonos | ✅ | ✅ | `AccountApiTest.wrongCurrentPasswordWritesNothing` |
| a javított mentés `200`, a hibaüzenet eltűnik | ✅ | ✅ | `AccountApiTest.java:287`; `Profile.test.tsx` |

**Ez a legfontosabb eltérés az egész futásban.** Az 1. körben az implementáló **`401`**-et
választott, mert a `plan.md` 4.3 ezt írta: *„a hitelesítési hibák szokásos kódja legyen, ahogy a
bejelentkezésnél is"*. A `401` pontosan az a hiba, amit a katalógus megjegyzése előre leír: a
kliens globális `401`-kezelője minden `401`-nél eldobja a munkamenetet.

Az implementáló **felismerte a következményt, és megkerülte** — `signalUnauthorized: false`-t
tett mindkét hívásra, amitől a felhasználó ténylegesen nem repült ki. A viselkedés így *majdnem*
helyes lett, de két áron:

1. a státuszkód `401` maradt, tehát a satisfaction kritérium első asszertálása bukott;
2. **új hiba keletkezett:** a `signalUnauthorized: false` egy **valóban lejárt** munkamenetet is
   némává tett ezen a két végponton — a felhasználó a lejárt munkamenetre is
   „`A jelenlegi jelszó hibás.`" üzenetet látott volna. A validátor ezt önállóan megtalálta és
   kimondta („Ára, amit a kód maga is kimond").

A 2. kör a specet élesítette (`400`, a `signalUnauthorized: false` tiltva), és mindkettő javult.

---

## Forgatókönyv 4: A jelszó-orákulum kizárja a tippelőt — de senki mást

**Teljesült-e?** 1. kör: [x] Igen · 2. kör: [x] Igen

| Asszertálás | Állapot | Bizonyíték |
|---|---|---|
| (1) a 11., **helyes** jelszót vivő kérés `429` + a katalógus szövege | ✅ | `AccountRateLimitTest.eleventhGuessIsRateLimitedAcrossBothEndpoints`, `lockoutRejectsEvenTheCorrectPassword` |
| (2) „B" jelszócseréje ugyanabban az ablakban, ugyanarról az IP-ről `200` | ✅ | `theCounterIsSeparatePerAccount` |
| (3) `POST /api/auth/login` ugyanarról az IP-ről `200` | ✅ | `theAccountCounterDoesNotBlockLogin` |
| külön mérés: a siker nullázza a saját számlálót | ✅ | `successfulCheckResetsTheCounter` |

**Ez a lánc legjobb önálló teljesítménye.** A `plan.md` 4.2 az 1. körben mindössze ennyit mondott:
*„A számláló kulcsát, a korlátot és az ablakot az implementáló a bejelentkezés mintájára veszi
át"* — ami a **rossz** megoldás felé terel (a bejelentkezés IP-kulcsot használ). Az implementáló
ennek ellenére a fiókhoz kötött kulcsot választotta, és **maga vezette le** ugyanazt az
indoklást, ami a katalógusban áll: *„ide csak érvényes tokennel lehet eljutni, tehát az IP-alapú
számlálás megkerülhető"*. Az `account:` előtag szükségességét is felismerte (közös névtérben egy
fiókadat-siker `clear()`-je törölné a bejelentkezési számlálót).

A kulcs neve `account:{userId}`, a katalógus `jelszocsere:{userId}`-t ír — a **név nem szerződés**,
a viselkedés az, és az minden asszertálásra teljesül.

A 2. kör ehhez a fordított szivárgási irányt is hozzátette
(`anAccountSuccessDoesNotClearTheLoginCounter`), amit a feladatlista akkor sem kért.

---

## Forgatókönyv 5: A névváltás nem írja át a régi rendeléseket

**Teljesült-e?** 1. kör: [x] Részben · 2. kör: [x] Igen

| Asszertálás | 1. kör | 2. kör | Bizonyíték (2. kör) |
|---|---|---|---|
| a `GET /api/orders` `customer` mezői a leadáskori értékek | ⚠️ nem mérve | ✅ | `AccountOrderSnapshotTest.profileChangeDoesNotRewritePastOrders` |
| …és **különböznek** a `GET /api/auth/me` mostani értékeitől | ⚠️ nem mérve | ✅ | ugyanott, mindhárom mezőre |
| a fejlécben az **új** felhasználónév látszik | ⚠️ nem mérve | ✅ | `auth.test.tsx:288-306` (a context `user`-e frissül, a token nem) |

**1. körös eltérés:** a viselkedés architekturálisan garantált volt (`OrderEntity.customer_name` /
`customer_email` **snapshot oszlop**, nem idegen kulcs — ADR-0001), de a feature **egyetlen
tesztje sem mérte**. A katalógus metrikája itt `Összehasonlító`: két értékkészlet **eltérését**
kell mérni, és pont ez hiányzott. A `requirements.md` a snapshotot csak megjegyzésként említette
(„ez így jó"), kész-kritériumot nem csinált belőle — ezért a láncnak nem volt mit teljesítenie.

**2. körös állapot:** a 2. kör spec-élesítése `FA-21` néven kritériumot csinált belőle, a
feladatlista `B3.4` munkaegységet, és megszületett az `AccountOrderSnapshotTest`, ami minden
előfeltételt a publikus API-n épít fel.

---

## Forgatókönyv 6: A saját nevét megtarthatja, a máséra nem válthat

**Teljesült-e?** 1. kör: [x] Igen · 2. kör: [x] Igen

| Asszertálás | 1. kör | 2. kör | Bizonyíték (2. kör) |
|---|---|---|---|
| (1) saját, változatlan névvel + új címmel → `200` | ✅ | ✅ | `keepingTheOwnUnchangedNameIsNotACollision` |
| (2) „B" nevével → `400` `Ez a felhasználónév már foglalt.` | ✅ | ✅ | `rejectsUsernameOrEmailTakenByAnother` |
| (3) „B" e-mailjével **más kis/nagybetűzéssel** → `400` `Ezzel az email címmel már regisztráltak.` | ⚠️ garantált, nem mérve | ✅ | **új:** `rejectsAnotherUsersEmailInDifferentCase` (`MaSiK@Example.COM`) |
| a bukott kérések után a profil **bitre azonos** az (1) utáni állapottal | ✅ | ✅ | `rejectsUsernameOrEmailTakenByAnother` + `wrongCurrentPasswordWritesNothing` |

**Ez a másik pont, ahol a lánc egy hamis spec ellenére talált el a helyesre.** A `plan.md` 1.1
`requireAvailable(username, email)`-t írt — **kétparaméteres** hívást. A valódi metódus
háromparaméteres, és a harmadik (`excludeUserId`) nélkül a felhasználó **saját, változatlan**
nevének megtartása is „foglalt névnek" látszana, azaz a puszta címmódosítás `400`-zal bukna.
Az implementáló a tényleges szignatúrát olvasta el, nem a specet hitte el, és jelentette az
eltérést.

A kis/nagybetű-függetlenséget az 1. körben a meglévő `findByEmailIgnoreCase` + a
`users_email_lower_uidx` egyedi index garantálta, de **teszt nem mérte**; a 2. kör pótolta.

---

## Forgatókönyv 7: A `role` mező némán lepattan

**Teljesült-e?** 1. kör: [x] Részben · 2. kör: [x] Igen

| Asszertálás | 1. kör | 2. kör | Bizonyíték (2. kör) |
|---|---|---|---|
| a válasz `200`, `role` = `customer` | ✅ | ✅ | `AccountApiTest.roleInBodyIsIgnored` |
| a `GET /api/auth/me` utána is `customer` | ✅ | ✅ | ugyanott |
| **ugyanazzal a tokennel** egy `/api/admin/**` hívás `403` | ❌ nem mérve | ✅ | ugyanott: `403` `Ehhez adminisztrátori jogosultság szükséges.` |
| a `users` tábla szerepkör-halmaza változatlan (`I-3`) | ✅ | ✅ | ugyanott (admin lista) |

**1. körös eltérés:** az 1. körös teszt az admin **listát** kérdezte le — de **admin tokennel**,
tehát azt igazolta, hogy a tárolt szerepkör `customer` maradt. Amit **nem** mért: hogy a
felhasználó a saját tokenjével tényleg `403`-at kap az admin névtéren. A kettő nem ugyanaz: az
első a tárolt adatot méri, a második a **jogosultsági kaput**. A 2. kör ezt pótolta.

---

## Forgatókönyv 8: Két lap, egy fiók — az elavult token

**Teljesült-e?** 1. kör: [x] Részben · 2. kör: [x] Részben

| Asszertálás | 1. kör | 2. kör | Megjegyzés |
|---|---|---|---|
| a második lap kérése `401`, törzse `Bejelentkezés szükséges.` | ✅ | ✅ | `changesPasswordAndRotatesTheToken` — a régi token `401` |
| a felületen megjelenik a munkamenet lejáratát magyarázó üzenet | ⚠️ | ⚠️ | a `SessionExpiredNotice` létezik és be van kötve, de **erre a folyamatra** nincs mérés |
| a felhasználó a `/login`-on köt ki | ⚠️ | ⚠️ | nincs böngészős mérés |
| az új jelszóval a második lap újra használható | ✅ | ✅ | `changesPasswordAndRotatesTheToken` (login az új jelszóval `200`) |
| az **első** lap végig működik, egyetlen kérése sem kap `401`-et | ⚠️ | ✅ | `auth.test.tsx:315-332` (az első lap átveszi az új tokent) |

**Miért maradt `Részben` a 2. körben is:** ez a katalógus egyetlen olyan forgatókönyve, amelynek
a lényege **kétlapos, böngészőszintű** viselkedés — két, egymástól független munkamenet-állapot
ugyanazzal a tokennel. Ezt sem integrációs teszt (nincs böngésző), sem komponensteszt (egy
providerpéldány) nem tudja megmérni. **Az egyetlen eszköz, ami mérné, az `E` csomag (`e2e/`)
volna — és az nem futott le egyik körben sem.** A `FA-18` mindkét körben eldöntetlen maradt.

A `401` → kiléptetés út maga tesztelt (`auth.test.tsx` meglévő 401-kezelő esetei), és a 2. körben
kifejezetten megerősödött: a `signalUnauthorized: false` eltávolításával a két új végpont
`401`-je **is** kilépteti a felhasználót. Ami hiányzik, az a folyamat végigmérése.

---

# 2. rész — Körönkénti napló

```
1. kör: 75%  (6/8)    becsült token-költség: ~500 000
2. kör: 94%  (7,5/8)  becsült token-költség: ~345 000
```

**A becslés forrása:** a subagent-futások jelentett `subagent_tokens` értékei + az orchestrátor
saját fogyasztásának becslése. Pontos szám a `/cost` paranccsal kérhető; a nagyságrend és a körök
közti arány a lényeg, nem a tizedesjegy.

| Kör | Satisfaction rate | Becsült token-költség | Mi javult ebben a körben |
|---|---|---|---|
| **1.** | **75%** (6/8) | **~500k** (B: 175k · F: 126k · validátor: 156k · orchestráció: ~45k) | A feature nulláról elkészült: két végpont, két űrlap, őr, útvonal, 21 backend + 23 kliens teszt. Zöld `mvn test` (5927), `npm test` (296), lint, build. A lánc **magától** megtalálta és megjavította a spec két hamis állítását (a `PROTECTED_PATTERNS` nem névtér; a `requireAvailable` háromparaméteres) és a tranzakciós csapdát (kétbean-es felépítés, különben a rate limit visszagördül). |
| **2.** | **94%** (7,5/8) | **~345k** (spec-élesítés: ~25k · javító implementáló: 180k · megszakadt validátor: 125k · saját ellenőrzés: ~15k) | `401` → **`400`** a rossz jelszóra + a `signalUnauthorized: false` eltávolítása (F3) · **valódi `AuthProvider`**-t renderelő tokenrotációs tesztek (F2) · rendelés-snapshot regressziós teszt (F5) · admin `403` a `role`-esethez (F7) · kis/nagybetűs e-mail-ütközés (F6) · szó szerinti hibaüzenet-asszertálás. Zöld: `mvn test` **5932**, `npm test` **302**, lint, build, JaCoCo-kapu. |
| **3.** | — | **nem futott** | Gazdasági döntés, lásd lent. |

**Változás:** +19 százalékpont, **kevesebb** tokenből, mint az 1. kör (a 2. kör az 1. kör
mérési eredményére épült, nem kellett újra felderítenie a kódbázist).

---

# 3. rész — Diminishing returns, leállás, early-stopping

## Hol állt be a diminishing returns?

**Nem állt be — a 2. kör után szakadt meg a mérés, gazdasági okból.** A 2. kör hozta az utolsó
érdemi javulást (+19 pont), és a görbe **nem lapult el**: nem azért álltam meg, mert a következő
kör keveset hozott volna arányaiban, hanem mert a **maradék hiány felső korlátja** kicsi lett.

A számszerű helyzet a leállás pillanatában:

| | Érték |
|---|---|
| Elért | 7,5 / 8 = 94% |
| Elérhető maradék | **0,5 pont = 6,25 százalékpont** (egyetlen `Részben`: 8. forgatókönyv) |
| A 3. kör becsült költsége | **~250–350k** (e2e-teszt-író + stack felhúzás + Playwright-futás + újravalidálás) |
| Költség / százalékpont, 2. kör | ~18k token / pont |
| Költség / százalékpont, 3. kör (várható) | **~40–56k token / pont**, azaz **2–3-szoros** |

Tehát: az utolsó érdemi javulást a **2. kör** hozta, és onnantól a token-költség a javuláshoz
képest **legalább a duplájára** nőtt volna. Ez a diminishing returns pontja — nem a javulás
elfogyásában, hanem az **egységköltség megugrásában**.

## Milyen leállási feltétel döntött?

**Gazdasági**, két okból, és ezt fontos őszintén kimondani:

1. **A 3. kör egyetlen forgatókönyvet célozna**, és annak is csak a felét (a 8. forgatókönyv négy
   asszertálásából kettő már teljesül). A maximálisan elérhető nyereség 6,25 pont — kevesebb,
   mint amit a 2. kör hozott a harmadáért.
2. **A 3. kör a leglassabb infrastruktúrát igényli**: Postgres-konténer + backend + Vite +
   Playwright-Chromium felhúzása, Gherkin + lépésdefiníciók írása, majd újravalidálás. A 2. kör
   validátora **már bele is futott a session-limitbe** (a futás megszakadt, a záró ellenőrzést
   magam végeztem el) — a 3. kör kockázata nem csak token, hanem a **befejezetlenség** is.

**Minőségi küszöböt nem értem el** abban az értelemben, hogy a 8. forgatókönyv nyitva maradt, és
a `FA-18` („futó stack ellen is működik") **egyik körben sem kapott ítéletet**. Ha a küszöb
„minden forgatókönyv `Igen`" lenne, a leállás korai. A gazdasági döntés tudatos és vállalt.

## Early-stopping szabály erre a feature-re

> **Állj meg, ha az elérhető maradék javulás felső korlátja kisebb, mint az utolsó kör tényleges
> javulásának a fele — vagy ha a következő kör becsült token-költsége meghaladja a
> százalékpontonkénti eddigi átlagköltség kétszeresét.**
>
> Kiegészítő, feature-specifikus feltételek:
> - **Állj meg**, ha két egymást követő kör javulása 5% alá esik.
> - **Ne állj meg** — a küszöbtől függetlenül —, amíg van olyan kész-kritérium, amely
>   **egyetlen** körben sem kapott ítéletet (itt: `FA-18`). Egy `[eldöntetlen]` nem ugyanaz,
>   mint egy megmért `[nem teljesül]`: az elsőről nem tudjuk, mennyibe kerülne.
> - **Ne számítsd javulásnak** azt, ami csak a spec élesítéséből jött, kód nélkül. Ha egy kör
>   mérőszáma úgy nő, hogy a viselkedés nem változott, a mérés élesedett, nem a termék.

Erre a futásra alkalmazva: az 1→2 javulás 19 pont, a fele 9,5 pont; az elérhető maradék 6,25 pont
< 9,5 → **a szabály leállást mond**. Ugyanakkor a második kiegészítő feltétel (`FA-18` sosem
kapott ítéletet) **egy** további kört indokolna, kizárólag az e2e-re szűkítve. A két szabály
ütközik, és ezt nem simítom el: a helyes döntés egy **szűkített** 3. kör lett volna (csak az `E`
csomag, implementáló nélkül), nem a teljes lánc újrafuttatása.

---

# 4. rész — A pipeline lépései

**Jelölés:** 🟢 az artefaktum emberi beavatkozás nélkül teljesítette a feladatát ·
🟡 emberi beavatkozást kért — és megkapta · 🔴 nem jelezte azt, amit kellett volna.

```
                            1. KÖR
  ┌──────────────────────────────────────────────────────────────┐
  │                                                              │
  │  spec/edit-user-data/  (szándékosan rontott bemenet)          │
  │            │                                                 │
  │            ├──▶ 🟡 spec-researcher .............. KIHAGYVA    │
  │            │        (orchestrátori döntés: a CLAUDE.md és a   │
  │            │         spec-konvenciok skill fedte a szerepét)  │
  │            │                                                  │
  │            ▼                                                  │
  │       🟢 spec-implementer (B) — backend + api.ts              │
  │            │   • megtalálta: /api/auth NINCS védve  ✔         │
  │            │   • megtalálta: requireAvailable 3 param ✔       │
  │            │   • megtalálta: tranzakciós csapda    ✔          │
  │            │   • 🔴 401-et választott a rossz jelszóra        │
  │            ▼                                                  │
  │       🟢 spec-implementer (F) — kliens                        │
  │            │   • jelentette: auth.test.tsx tulajdona vitás ✔  │
  │            │   • 🔴 nem írt tesztet a tokenrotációra          │
  │            ▼                                                  │
  │       🔴 e2e-test-writer (E) ..................... NEM FUTOTT │
  │       🔴 spec-implementer (S) .................... NEM FUTOTT │
  │            │                                                  │
  │            ▼                                                  │
  │       🟢 spec-validator (V)                                   │
  │            │   • FA-06, FA-11 → [ítélhetetlen]  ✔             │
  │            │   • FA-07, FA-10, FA-18 → [kétséges] ✔           │
  │            │   • megtalálta: a 401 ára ✔                      │
  │            │   • 🔴 a 401-et NEM mondta hibának               │
  │            │   • 10 spec-hibát tételesen jelentett ✔          │
  │            ▼                                        75%       │
  └────────────┬─────────────────────────────────────────────────┘
               │
          🟡 EMBERI BEAVATKOZÁS — spec-élesítés
               │  (a spec-guard.mjs blokkolja az agenteket a spec/-ben;
               │   a validátor 10 találata alapján, a katalógus nélkül)
               ▼
                            2. KÖR
  ┌──────────────────────────────────────────────────────────────┐
  │       🟢 spec-implementer (B+F) — javító kör                  │
  │            │   • 401 → 400 + signalUnauthorized eltávolítva ✔ │
  │            │   • valódi AuthProvider-tesztek ✔                │
  │            │   • FA-21/22/23 tesztek ✔                        │
  │            │   • 🟡 jelentette: 6 ELLENTMONDÁS az általam     │
  │            │        élesített specben — javítva ✔             │
  │            ▼                                                  │
  │       🟡 spec-validator (V) — MEGSZAKADT (session limit)      │
  │            │   • a záró ellenőrzést az orchestrátor futtatta: │
  │            │     mvn test 5932 ✔ · npm test 302 ✔ · lint ✔    │
  │            ▼                                        94%       │
  └──────────────────────────────────────────────────────────────┘
               │
          🛑 LEÁLLÁS — gazdasági döntés
```

## Melyik lépésnél állt meg a pipeline, és miért?

**Két helyen állt meg, és a kettő nem ugyanaz:**

1. **Az 1. körben az `E` és az `S` csomagnál** — ezek egyik körben sem futottak. Az `E` egy futó
   stacket igényel (Postgres + backend + Vite + Playwright), az `S` pedig a `spec/backend/`-et
   írná, **amit a `spec-guard.mjs` hookja minden agentnek megtilt** (`impl-write` mód: „a `spec/`
   mappa a norma — az agentek nem módosítják"). Az `S` csomag tehát **szerkezetileg**
   végrehajthatatlan az implementálóval; emberi szerkesztés kellene hozzá. Ezt a spec nem mondja
   ki — a `tasks.md` úgy osztja ki az `S1.1`–`S1.4`-et, mintha egy agent elvégezhetné.

2. **A 2. kör validátoránál** — a `spec-validator` futása **session-limitbe ütközött** és
   félbeszakadt (a kliensoldali mérésnél). A záró ellenőrzést (`mvn test`, `npm test`, lint,
   build) és a kritériumonkénti ítéletet az orchestrátor végezte el helyette. **Ez gyengébb
   bizonyíték, mint egy friss szemű validátorfutás**, és a riportban így is szerepel: a 2. kör
   satisfaction rate-je részben orchestrátori önértékelésen nyugszik, nem független átvételen.

## Mit talált a Planning Mode, és mit nem?

**Planning Mode ebben a futásban nem futott** — a szerepét a `plan.md`, azaz egy **előre
megírt, statikus terv** töltötte be. Amit ez a különbség jelent:

**Amit a terv megtalált (és jól):**
- a HTTP-szerződést: útvonalak, metódusok, kérés/válasz alakok, a `PublicUserResponse` és az
  `AuthResponse` **újrahasználata** új DTO helyett;
- a TypeScript-tükör pontos alakját (`ProfileInput`, `PasswordChangeInput`, két szignatúra) —
  ez hiánytalanul megérkezett az F csomagnak, ahogy az F implementálója jelentette is;
- a **fájltulajdon-táblázatot**, ami végig tartott: egyetlen csomag sem nyúlt máséhoz;
- a munkacsomagok sorrendjét és azt, **miért** nem párhuzamos a B és az F.

**Amit nem talált meg:**
- **a saját belső ellentmondásait.** A terv 1.1 szakasza `requireAvailable(username, email)`-t
  írt (a valódi metódus háromparaméteres), 4.6 egyetlen `@Transactional` osztályt (ami a rate
  limitet működésképtelenné tette volna), 4.3 pedig `401` felé terelt. **Mindhármat az
  implementáló találta meg**, a kódbázis tényleges olvasásával — a terv nem ellenőrizte magát a
  kódon.
- **a hamis premisszát**: „az `/api/auth` névtér már védett". Egy futó Planning Mode ezt egyetlen
  `Read`-del ellenőrizte volna (`WebConfig.java:36-49`); egy statikus terv nem ellenőriz semmit.
- **a hiányzó tiltólistát** (mihez nem nyúl senki). A 4.10 szakasz **hiányzott** — a számozás
  4.9-ről 4.11-re ugrott. A migrációs reflexet végül nem a terv fogta meg, hanem a
  `spec-guard.mjs` hookja, ami a Flyway-mappát mindenkinek tiltja. **Vak szerencse, nem tervezés.**
- **a mérhetőséget**: hat kész-kritérium („rendben van", „jól néz ki", „működik", „van rá teszt")
  olyan volt, hogy bármit el lehetett volna rájuk mondani. A validátor kettőt kifejezetten
  `[ítélhetetlen]`-nek minősített — ezt viszont **megtalálta**, ami a lánc egyik legjobb pontja.

**A tanulság:** egy statikus terv a **szerződést** jól rögzíti (mi az interfész, ki mihez nyúl),
de a **premisszáit** nem ellenőrzi. A premissza-ellenőrzés végül megtörtént — csak eggyel lejjebb,
az implementálónál, aki a specet nem hitte el, hanem elolvasta a kódot. Ez a lánc legértékesebb
tulajdonsága volt ebben a futásban.

## Mi az, amit a pipeline nem talált meg, és mi lett volna a megoldás?

| # | Amit nem talált meg | Miért csúszott át | Mi lett volna a megoldás |
|---|---|---|---|
| **1** | **A `401` a rossz jelszóra** (3. forgatókönyv) | A spec **kimondottan ezt írta elő** (`plan.md` 4.3), és a validátor is a specet mérte. Az implementáló felismerte a következményt, de a specet követte és kerülőúton (`signalUnauthorized: false`) kezelte — így a *tünet* eltűnt, a *hiba* megmaradt. A validátor jelentette az árát, de nem mondta hibának. | **Egy kimondott negatív követelmény a specben**: „a `401` ezen a végponton tiltott, mert a kliens globális kezelője kilépteti". Ezt egy futó Planning Mode is megtalálta volna, ha a `client/src/api.ts:186-199` kezelőt beolvassa. **Mechanikus fogás**: egy lint-szabály vagy konformancia-eset, ami tiltja a `signalUnauthorized: false`-t az új hívásokon. |
| **2** | **A tokenrotáció kliensoldali fele** (2. forgatókönyv) | A `Profile.test.tsx` **mockolta** azt a modult, amiben a mérendő logika van. A teszt zöld volt, a lefedettség nem létezett. Klasszikus „a mock elfedi a mérendőt". | A `FA-07` bizonyítéksorába **bele kell írni a mérés módját**: „valódi `AuthProvider`-t rendereljen, mockolt context nem bizonyíték". Pontosan ezt tettem a 2. körben, és azonnal megszületett a teszt. |
| **3** | **A rendelés-snapshot regresszió** (5. forgatókönyv) | A `requirements.md` a snapshotot **megjegyzésként** említette („ez így jó"), nem kész-kritériumként. Amiből nincs kritérium, arra nincs feladat, arra nincs teszt. | Minden „ez amúgy jó" mondatot **kritériummá** kell tenni, ha a feature hozzáérhet. Az összehasonlító metrikájú viselkedéseket (két értékkészlet **eltérése**) külön nevesíteni. |
| **4** | **A `role` → admin `403`** (7. forgatókönyv) | A teszt a **tárolt adatot** mérte (admin listából), nem a **jogosultsági kaput** (saját tokennel `403`). Két különböző dolog, ránézésre ugyanaz. | A `B3.1` **tételes esetlistája**, ami a 2. körben született meg — „`role: admin` némán lepattan **és ugyanazzal a tokennel** az admin névtér `403`". |
| **5** | **A 8. forgatókönyv egésze** — máig nyitva | Az `E` csomag egyik körben sem futott. Böngészőszintű, kétlapos viselkedést sem integrációs, sem komponensteszt nem mér. | Az `E` csomag futtatása futó stack ellen. **Szerkezeti megoldás**: az `FA-18`-at nem szabad az `E1.1`-hez („a forgatókönyvek le vannak írva") kötni, csak az `E1.2`-höz („zölden lefutott") — ezt a 2. kör spec-élesítése javította, de a kör már nem futott. |
| **6** | **Az `S` csomag végrehajthatatlansága** | A `spec-guard.mjs` minden agentnek tiltja a `spec/` írását, a `tasks.md` viszont `S1.1`–`S1.4` munkaegységeket oszt ki oda. **Senki nem jelezte, hogy ez a csomag nem delegálható.** | A `plan.md` 3. szakaszának fájltulajdon-táblázatában az `S` sort meg kellene jelölni: „**emberi szerkesztés** — a hook minden agentet blokkol". Következmény ma is él: a három új hibaüzenet **sehol nincs katalogizálva** a `spec/backend/hibakatalogus.md`-ben, és a végpontszám 22 maradt 24 helyett. |

---

# 5. rész — Reflexiós kérdések

## Ha a pipeline-t holnap újrafuttatom ugyanarra a spec-re: pontosan ugyanazt az eredményt kapom-e?

**Nem, és három különböző okból nem — ezek eltérő súlyúak.**

**1. A modell nem determinisztikus, és a spec pont a bizonytalan helyeken hallgat.**
A leglátványosabb példa a 4. forgatókönyv: a `plan.md` 4.2 az 1. körben mindössze annyit mondott,
hogy a korlátot „a bejelentkezés mintájára" kell átvenni — ami az **IP-kulcs** felé terel. Az
implementáló ennek ellenére a fiókhoz kötött kulcsot választotta, és maga vezette le, miért. **Ez
a döntés holnap könnyen máshogy eshet**, és akkor a 4. forgatókönyv `Igen`-ből `Nem`-be fordul,
mert az IP-kulcs a (2) és (3) asszertálást is bukná. Ugyanez áll a `PROTECTED_PATTERNS`
felismerésére és a kétbean-es felépítésre: mindhárom a lánc **saját érdeme** volt, nem a specé,
tehát mindhárom **megismételhetetlen**. A 2. körben ezért írtam be mindhármat a specbe — nem
azért, mert a kód rossz volt, hanem hogy a **következő** futás se rontsa el.

**2. A kiindulási állapot már nem ugyanaz.** A ma futtatott lánc egy üres kódbázisból indult; egy
holnapi futás a **kész** implementációt találná ott. A `spec-implementer` viselkedése ilyenkor
más: nem ír, hanem ellenőriz. A `spec` maga is más — a 2. kör előtti élesítés tíz ponton
megváltoztatta, ami ma már része a bemenetnek. **A mérés tehát nem ismételhető meg, csak
újrajátszható egy `git checkout` után.**

**3. Ami viszont stabil:** minden, ami mechanikusan van rögzítve. A `spec-guard.mjs` holnap is
blokkolja a `spec/` írását és a Flyway-mappát. A `jacoco:check` holnap is elbukna 90% alatt. A
`mvn test` holnap is 5932 esetet futtat. **A determinizmus ott van, ahová hookot vagy kaput
raktunk — nem ott, ahová prózát írtunk.** Ez a futás legfontosabb tanulsága: a spec élesítése
csökkenti a szórást, de csak a gépi kapu szünteti meg.

## Ha tízszer ennyi token-keret állna rendelkezésre, futtatnék-e több kört ezen a feature-ön?

**Több kört nem — más köröket igen.** A további körök hozama itt nem lineáris, mert a maradék
hiány **nem több ugyanabból**, hanem **egy másik fajta mérés**.

Konkrétan, 10× kerettel ezt csinálnám, ebben a sorrendben:

1. **Az `E` csomag, futó stack ellen** (~300k). Ez az egyetlen, ami a 8. forgatókönyvet és a
   `FA-18`-at megmérné, és ez a **legdrágább, de az egyetlen** út a 94% → 100%-hoz. Ez nem
   „még egy kör", hanem a lánc **hiányzó lépése**.
2. **Az `S` csomag, emberi szerkesztéssel** (~50k). Nem javítja a satisfaction rate-et, viszont
   ma él egy valós rés: a három hibaüzenet sehol nincs katalogizálva, tehát a projekt „szó
   szerinti hibaüzenet" szabálya ezen a feature-ön **nem érvényesül**.
3. **Egy független, friss szemű validátorfutás** (~150k), mert a 2. kör átvétele félbeszakadt, és
   a záró ítéletet az orchestrátor mondta ki magára. **Ez a riport leggyengébb pontja.**

**Ami alapján eldönteném, hogy a következő kör megéri-e** — három kérdés, ebben a sorrendben:

- **Van-e olyan kritérium, amely még egyetlen ítéletet sem kapott?** Ha igen, a kör **megéri**,
  a becsült javulástól függetlenül: egy `[eldöntetlen]`-ről nem tudjuk, mennyit ér, és pont ezért
  veszélyes. (Itt: `FA-18`.) Egy megmért `[nem teljesül]` **olcsóbb tudás**, mint egy nem mért
  `[kétséges]`.
- **A következő kör ugyanazt a mérőeszközt használná, mint az előző?** Ha igen, a hozam
  meredeken csökken — ugyanaz az eszköz nagyjából ugyanazt látja. Ha **más** mérőeszközt hoz be
  (böngésző a unit teszt helyett, futó stack a mock helyett), a hozam **ugrásszerű** lehet, mert
  új hibaosztályt tesz láthatóvá. Ez a futás ezt igazolta: a 2. kör azért hozott 19 pontot, mert
  **új mérési módot** írt elő (valódi `AuthProvider` a mock helyett), nem azért, mert több
  ugyanolyan tesztet kért.
- **A javulás a kódból jön vagy a spec élesítéséből?** Ha egy kör mérőszáma úgy nő, hogy a
  viselkedés nem változott, akkor **a mérés élesedett, nem a termék**. Ez is érték — de nem
  ugyanaz az érték, és nem szabad egy oszlopba írni vele. A 2. körben a 19 pontból kb. 6 pont
  ilyen volt (5., 6., 7. forgatókönyv: a viselkedés már 1. körben helyes volt, csak nem volt
  mérve), és kb. 13 pont valódi kódváltozás (2., 3. forgatókönyv).
