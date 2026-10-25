# Scenario-katalógus: saját fiókadatok szerkesztése és jelszóváltás

A katalógus tárgya a [`spec/edit-user-data/`](../../spec/edit-user-data/requirements.md) feature:
az `Adataim` képernyő → profilmentés (`PUT /api/auth/me`) → jelszócsere
(`POST /api/auth/password`) → tokenrotáció.

A forgatókönyvek a spec kész-kritériumaira (`FA-01`…`FA-30`) hivatkoznak vissza, de nem
egy-az-egyben tükrözik őket: egy forgatókönyv **egy viselkedést** mér végponttól végpontig,
akkor is, ha ahhoz több DoD-pont is tartozik. A hibaüzenetek szó szerint a
[`hibakatalogus.md`](../../spec/backend/hibakatalogus.md)-ból (illetve a specet bővítő
4. szakaszból) valók — a szövegek szerződések, nem illusztrációk.

---

## Forgatókönyv 1: A felhasználó átírja a szállítási címét

**Kontextus:**
Bejelentkezett vásárló, akinek a fiókjában név, e-mail cím és szállítási cím is ki van töltve.
Ismeri a jelenlegi jelszavát.

**Akció:**
A fejlécben a felhasználónevére kattint, ezzel az `Adataim` oldalra jut, a profilűrlapon
átírja a szállítási címét, megadja a jelenlegi jelszavát, és ment.

**Elvárt viselkedés:**
A profilűrlap a jelenlegi értékekkel előtöltve érkezik. A mentés sikeres, az oldal a mentett
adatokat mutatja, és a felhasználó **belépve marad** — a profilmentés nem cserél tokent.

**Satisfaction kritérium:**
A `PUT /api/auth/me` válasza `200`, és pontosan `id`, `username`, `email`, `address`, `role`
kulcsot tartalmaz — `token`-t és jelszómezőt **nem**. A mentés előtt használt tokennel a
`GET /api/auth/me` utána is `200`-at ad, és az `address` az új értéket mutatja.
*(DoD: `FA-01`, `FA-06`, `FA-19`, `FA-20`)*

**Metrika típus:** [x] Bináris  [ ] Skálázott  [ ] Összehasonlító

**Prioritás:** [x] Kritikus  [ ] Magas  [ ] Közepes  [ ] Alacsony

---

## Forgatókönyv 2: A jelszócsere kicseréli a munkamenetet is

**Kontextus:**
Bejelentkezett felhasználó nyitott `Adataim` oldalon. A böngészőben ott az aktuális
munkamenet-tokenje. Az új jelszó legalább 8 karakter, és eltér a jelenlegitől.

**Akció:**
A jelszóűrlapon megadja a jelenlegi jelszavát, kétszer az újat, és cserél. Utána kijelentkezik,
és az **új** jelszóval próbál újra belépni.

**Elvárt viselkedés:**
A csere sikeres, a felhasználó **nem repül ki** — a kliens a válaszban kapott új tokenre vált,
és belépve marad. A régi token azonnal halott. Az új jelszóval a bejelentkezés megy, a régivel
nem.

**Satisfaction kritérium:**
Négy feltétel együtt: (1) a `POST /api/auth/password` válasza `200`, `user` és `token` mezővel;
(2) a **válaszban kapott** tokennel a `GET /api/auth/me` `200`; (3) a csere **előtti** tokennel
ugyanez `401`; (4) a `POST /api/auth/login` az új jelszóval sikeres, a régivel `401`
`Hibás felhasználónév vagy jelszó.` A felületen nem jelenik meg a `SessionExpiredNotice`.
*(DoD: `FA-08`, `FA-09`, `FA-10`, `FA-22`)*

**Megjegyzés:** ez a forgatókönyv a feature egyetlen olyan pontja, ahol a helyes viselkedés
**két, egymásnak látszólag ellentmondó** dolog egyszerre: a régi token érvénytelenítése és a
felhasználó bejelentkezve tartása. Egy naiv implementáció vagy kilépteti a felhasználót
(rotál, de nem tárolja az új tokent), vagy nem érvényteleníti a régit (nem rotál). A
(2) és (3) feltétel együtt ezt a két hibát zárja ki.

**Metrika típus:** [x] Bináris  [ ] Skálázott  [ ] Összehasonlító

**Prioritás:** [x] Kritikus  [ ] Magas  [ ] Közepes  [ ] Alacsony

---

## Forgatókönyv 3: Az elgépelt jelszó nem lépteti ki a felhasználót

**Kontextus:**
Bejelentkezett felhasználó az `Adataim` oldalon. Kitölti a profilűrlapot, de a jelenlegi
jelszót elgépeli — **és** egyúttal érvénytelen e-mail címet is ír be (`nem-email`).

**Akció:**
Ment. Majd — a hibaüzenet után, ugyanazon az oldalon — javítja a jelszót és az e-mailt, és
újra ment.

**Elvárt viselkedés:**
A szerver a **jelszó** hibáját jelenti, nem az e-mailét: akit nem tudunk hitelesíteni, az ne
kapjon visszajelzést arról, mi van a fiókon. A felhasználó a hibaüzenet után is **belépve
marad** — a `400` nem kiléptetés —, a profilja változatlan, és a javított mentés átmegy.

**Satisfaction kritérium:**
Az első válasz `400`, törzse pontosan `A jelenlegi jelszó hibás.` — az `Érvénytelen email cím.`
**nem** jelenik meg sehol. A képernyőn a szerver magyar üzenete látszik változtatás nélkül, a
felhasználó nem kerül a `/login`-ra, és a visszaolvasott profil azonos a mentés előttivel.
A második, javított mentés `200`, és a hibaüzenet eltűnik.
*(DoD: `FA-05`, `FA-18`, `FA-23`)*

**Megjegyzés:** ez az az eset, ahol a `400` **nem** ízléskérdés. A kliens `api.ts`-ének
`handle()` függvénye minden `401`-re kilépteti a felhasználót; ha ez a végpont `401`-gyel
válaszolna a hibás jelszóra, egy elgépeléstől a felhasználó „lejárt a munkameneted"
magyarázattal kirepülne — lásd a `requirements.md` 4.1 szakaszát.

**Metrika típus:** [x] Bináris  [ ] Skálázott  [ ] Összehasonlító

**Prioritás:** [x] Kritikus  [ ] Magas  [ ] Közepes  [ ] Alacsony

---

## Forgatókönyv 4: A jelszó-orákulum kizárja a tippelőt — de senki mást

**Kontextus:**
Két bejelentkezett felhasználó, „A" és „B", ugyanarról az IP-címről. „A" tokenje egy támadó
kezében van, aki a jelszócsere végponton próbálja kitalálni „A" jelenlegi jelszavát.

**Akció:**
A támadó 10 hibás `currentPassword`-del próbálkozik „A" tokenjével. A 11. kérésben — mondjuk
mert eltalálta — a **helyes** jelszót küldi. Közben „B" is jelszót cserél, és „A" egy harmadik
böngészőből megpróbál **bejelentkezni**.

**Elvárt viselkedés:**
A 11. kérés `429`-cel elhal, **a helyes jelszó ellenére is** — különben a támadó pont a találat
pillanatában csúszna ki a korlát alól. A zárolás ugyanakkor **felhasználónkénti**: „B" cseréje
és „A" bejelentkezése ugyanarról az IP-ről változatlanul működik.

**Satisfaction kritérium:**
Három asszerció együtt: (1) a 11., **helyes** jelszót vivő kérés `429`,
`Túl sok sikertelen próbálkozás. Kérjük, próbáld újra később.`; (2) „B" jelszócseréje
ugyanabban az ablakban, ugyanarról az IP-ről `200`; (3) a `POST /api/auth/login` ugyanarról az
IP-ről `200`. Külön mérés: 9 hibás próbálkozás → egy **sikeres** csere → újabb 9 hibás
próbálkozás **nem** vezet `429`-hez, mert a siker nullázta a saját számlálóját.
*(DoD: `FA-16`, `FA-17`)*

**Megjegyzés:** ez a feature egyetlen olyan döntése, amely szembemegy a `LoginAttemptService`
saját osztálydokumentációjával (az kifejezetten elutasítja a fiókhoz kötött zárolást). Az
indoklás — a végponthoz **érvényes token** kell, tehát idegent nem lehet vele kizárni — a
`requirements.md` 5.1 szakaszában áll. A (2) és (3) feltétel pontosan azt méri, hogy a
`jelszocsere:{userId}` kulcs nem szivárog át a bejelentkezési, IP-alapú számlálóba.

**Metrika típus:** [x] Bináris  [ ] Skálázott  [ ] Összehasonlító

**Prioritás:** [x] Kritikus  [ ] Magas  [ ] Közepes  [ ] Alacsony

---

## Forgatókönyv 5: A névváltás nem írja át a régi rendeléseket

**Kontextus:**
Vásárló, akinek van egy korábban leadott rendelése. A rendelés `customer` blokkja a leadáskori
nevét, e-mail címét és szállítási címét hordozza. A vásárló ezután megnősül, elköltözik, és
mindhárom adatát átírja a profilján.

**Akció:**
Ment a profilűrlapon, majd megnyitja a „Rendeléseim" oldalt, és megnézi a régi rendelését.

**Elvárt viselkedés:**
A fejlécben és az `Adataim` oldalon az **új** név látszik — a kliens hitelesítési állapota
frissül, nem csak az űrlap. A régi rendelés viszont a **leadáskori** nevet, e-mailt és címet
mutatja: a rendelés önhordó dokumentum, a profilváltozás nem írja át visszamenőleg.

**Satisfaction kritérium:**
Két értékkészlet **eltérését** mérjük: a `GET /api/orders` válaszában a rendelés `customer`
mezői bitre azonosak a leadáskori visszaigazolás értékeivel, és **különböznek** a
`GET /api/auth/me` jelenlegi értékeitől. Ezzel egyidejűleg a fejlécben megjelenő felhasználónév
az új értéket mutatja.
*(DoD: `FA-21`, `FA-25`; a mögötte álló döntés:
[ADR-0001](../../docs/adr/0001-rendelesi-tetel-snapshot.md))*

**Metrika típus:** [ ] Bináris  [ ] Skálázott  [x] Összehasonlító

**Prioritás:** [ ] Kritikus  [x] Magas  [ ] Közepes  [ ] Alacsony

---

## Forgatókönyv 6: A saját nevét megtarthatja, a máséra nem válthat

**Kontextus:**
Két regisztrált felhasználó: „A" (`teszt_vasarlo_a`) és „B" (`teszt_vasarlo_b`, e-mail:
`b@pelda.hu`). „A" csak a szállítási címét akarja átírni, a nevéhez és e-mailjéhez nem nyúl.

**Akció:**
Három mentés „A" nevében: (1) a **saját, változatlan** nevével és e-mailjével, új címmel;
(2) „B" felhasználónevével; (3) „B" e-mail címével — de más kis/nagybetűzéssel
(`B@Pelda.HU`).

**Elvárt viselkedés:**
Az első mentés sikeres: a saját, változatlan név megtartása **nem** ütközés. A második és a
harmadik elbukik — az egyediség kis/nagybetűtől független, tehát a `B@Pelda.HU` ugyanúgy
foglalt, mint a `b@pelda.hu`. Egyik bukott kérés sem hagy hátra részleges változást.

**Satisfaction kritérium:**
(1) `200`, és a visszaolvasott profilon az új cím, változatlan névvel; (2) `400`
`Ez a felhasználónév már foglalt.`; (3) `400` `Ezzel az email címmel már regisztráltak.`
A (2) és (3) után visszaolvasott profil **bitre azonos** az (1) utáni állapottal — a
címmódosítás nem veszett el, és részlegesen sem íródott felül.
*(DoD: `FA-03`; a validáció azonossága a regisztrációéval: `FA-02`)*

**Metrika típus:** [x] Bináris  [ ] Skálázott  [ ] Összehasonlító

**Prioritás:** [ ] Kritikus  [x] Magas  [ ] Közepes  [ ] Alacsony

---

## Forgatókönyv 7: A `role` mező némán lepattan

**Kontextus:**
`customer` szerepkörű, bejelentkezett felhasználó, érvényes tokennel és a jelszava
birtokában. Kézzel összeállított kérést küld — nem a felületről, hanem közvetlenül a
végpontra.

**Akció:**
A `PUT /api/auth/me` törzsébe a négy szabályos mező mellé beteszi a `"role": "admin"` mezőt is,
és elküldi. Utána lekéri a `GET /api/auth/me`-t, majd megpróbál egy admin végpontot elérni.

**Elvárt viselkedés:**
A kérés **sikeres** — a `role` nem hibás bemenet, hanem **nem bemenet**: némán elhagyjuk,
ugyanúgy, ahogy a regisztráció is teszi. A profil mentett mezői frissülnek, a szerepkör nem.
Az admin névtér zárva marad.

**Satisfaction kritérium:**
A válasz `200`, a `role` mezője `customer`. A `GET /api/auth/me` utána is `customer`-t ad, és
egy `/api/admin/**` hívás ugyanazzal a tokennel `403`-at. A `users` táblában a szerepkörök
halmaza változatlan — az `I-3` invariánst (mindig van legalább egy admin) ez a végpont
egyáltalán nem tudja megsérteni.
*(DoD: `FA-04`)*

**Megjegyzés:** szándékos eltérés a `PUT /api/admin/users/{id}` viselkedésétől, ahol az
érvénytelen `role` **hiba**. Ott a mező értelmes bemenet, itt egyáltalán nem az — a
`plan.md` 1.1 szakasza rögzíti. Egy „konzisztenciát teremtő" refaktor, ami itt is `400`-at
adna, ezt a forgatókönyvet buktatná.

**Metrika típus:** [x] Bináris  [ ] Skálázott  [ ] Összehasonlító

**Prioritás:** [ ] Kritikus  [x] Magas  [ ] Közepes  [ ] Alacsony

---

## Forgatókönyv 8: Két lap, egy fiók — az elavult token

**Kontextus:**
A felhasználó **két böngészőlapon** van bejelentkezve ugyanazzal a fiókkal (ugyanaz a token,
`I-6`: egy felhasználóhoz egy munkamenet). Az egyik lapon nyitva az `Adataim` oldal, a másikon
a katalógus.

**Akció:**
Az első lapon jelszót cserél. Ettől a második lap tokenje elavul. A második lapon ezután
megpróbál rendelést leadni vagy a saját rendeléseit megnyitni.

**Elvárt viselkedés:**
A második lap `401`-et kap, és ez itt **valóban** lejárt munkamenetet jelent — a felület
kilépteti a felhasználót és megmagyarázza, miért. Ez nem hiba, hanem a rotáció ára és
egyben a bizonyítéka: a régi token tényleg halott, bárhol is használják. Az **új** jelszóval
a második lapon is vissza lehet lépni.

**Satisfaction kritérium:**
A második lap kérése `401`, törzse `Bejelentkezés szükséges.`, a felületen megjelenik a
munkamenet lejáratát magyarázó üzenet, és a felhasználó a `/login`-on köt ki. Az új jelszóval
indított bejelentkezés után a második lap újra használható. Az első lap **végig** működik,
egyetlen kérése sem kap `401`-et.
*(A `FA-09` szerveroldali felének kliensoldali párja; a kliens `401`-kezelése:
`plan.md` 2. szakasz — ez a hívás nem kap `signalUnauthorized: false`-t.)*

**Megjegyzés:** ez a katalógus egyetlen forgatókönyve, ahol a **kiléptetés** a helyes kimenet.
A 3. forgatókönyvvel párban olvasandó: ott a `401` hiba lenne, itt a hiánya lenne az. A kettő
együtt írja körül, mikor kiléptető és mikor nem a hibaválasz.

**Metrika típus:** [x] Bináris  [ ] Skálázott  [ ] Összehasonlító

**Prioritás:** [ ] Kritikus  [x] Magas  [ ] Közepes  [ ] Alacsony
