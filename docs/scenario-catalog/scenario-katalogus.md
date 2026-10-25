# Scenario-katalógus: vásárlási folyamat  

A katalógus tárgya a vásárlási folyamat: kosárba tétel → kosár → pénztár → visszaigazolás.

## Forgatókönyv 1: A vevő végigviszi a rendelést

**Kontextus:**
Bejelentkezett vásárló, aki még nem rendelt. Van egy aktív, raktáron lévő
termék, elérhető készlettel.

**Akció:**
A terméken a „Kosárba" gombra kattint, megnyitja a kosárfiókot,
onnan a „Tovább a fizetéshez" gombbal a pénztárra lép, és leadja a rendelést.

**Elvárt viselkedés:**
A kosár jelvénye 1 tételt mutat, a kosárfiók a termék nevét és a termék árával egyező
végösszeget jeleníti meg. A leadás után visszaigazoló képernyő jelenik meg rendelésazonosítóval és fizetendő összeggel, a kosár pedig kiürül.  

**Satisfaction kritérium:**
A vevő tokenjével lekért `GET /api/orders` válasza tartalmaz egy olyan rendelést, amelynek
azonosítója megegyezik a visszaigazoláson megjelenttel, és a `total`-ja a visszaigazoláson
mutatott fizetendő összeggel.

**Metrika típus:** [x] Bináris  [ ] Skálázott  [ ] Összehasonlító

**Prioritás:** [x] Kritikus  [ ] Magas  [ ] Közepes  [ ] Alacsony

---

## Forgatókönyv 2: A kosárban módosított mennyiség végigmegy a rendelésen

**Kontextus:**
Bejelentkezett vásárló, a kosarában egy darab van a termékből, a készlet legalább 2 darabot
fedez.

**Akció:**
A kosároldalon a termék mennyiség-mezőjét 2-re állítja, majd a pénztáron leadja a rendelést.

**Elvárt viselkedés:**
A kosár végösszege azonnal a két terméknek megfelelően változik, a pénztár ugyanezt az
összeget kínálja fizetendőként, és a szerver elfogadja a rendelést.

**Satisfaction kritérium:**
A `GET /api/orders` válaszában a rendelés tételének `quantity`-je 2, és a válasz `total`
mezője megegyezik a visszaigazoláson megjelenített összeggel. Ez a forgatókönyv nem egy értéket
mér, hanem **két érték egyezését**: a kliens által számolt és a szerver által számolt
összegét.

**Metrika típus:** [ ] Bináris  [ ] Skálázott  [x] Összehasonlító

**Prioritás:** [ ] Kritikus  [x] Magas  [ ] Közepes  [ ] Alacsony

---

## Forgatókönyv 3: Az időközben megváltozott ár elutasítja a rendelést

**Kontextus:**
Bejelentkezett vásárló, a termék a kosarában van. A kosár a termék teljes pillanatképét
tárolja a localStorage-ban, árastul. Az admin időközben megemeli a termék árát, a vevő
böngészőjében viszont a régi ár marad.

**Akció:**
A vevő a pénztáron leadja a rendelést. A kliens a régi árakból számolt végösszeget küldi
`expectedTotal` gyanánt, a szerver viszont a DB aktuális árából számol.

**Elvárt viselkedés:**
A szerver elutasít, a pénztár pedig a szerver hibaüzenetét mutatja meg.

**Satisfaction kritérium:**
Két feltétel együtt. (1) A képernyőn megjelenik a `spec/backend/hibakatalogus.md`-ből szó
szerint vett szöveg (a kódrészlet egyetlen sor, hogy a sortörés ne mossa el a keresett
sztring határát):
`A kosárban lévő termékek ára időközben megváltozott. Kérjük, frissítsd az oldalt és ellenőrizd a végösszeget.`
(2) A vevő tokenjével lekért `GET /api/orders` válasza pontosan annyi rendelést tartalmaz,
mint a leadási kísérlet előtt — a szerver a hibaág mellé nem írt ki `pending` rendelést.

**Metrika típus:** [x] Bináris  [ ] Skálázott  [ ] Összehasonlító

**Prioritás:** [x] Kritikus  [ ] Magas  [ ] Közepes  [ ] Alacsony

---

## Forgatókönyv 4: A fedezethiány elutasítja a rendelést

**Kontextus:**
Bejelentkezett vásárló, a kosarában két darab van a termékből. Az admin időközben a rendelt
darabszám alá csökkenti a készletet (2 helyett 1). A termék ára változatlan.

**Akció:**
A vevő leadja a rendelést.

**Elvárt viselkedés:**
A szerver elutasít, a teljes rendelés elbukik, részleges teljesítés nincs. A pénztár a szerver üzenetét mutatja, benne az elérhető darabszámmal.

**Satisfaction kritérium:**
Két feltétel együtt. (1) A képernyőn megjelenik a hibakatalógus üzenete:
`A(z) {terméknév} termékből jelenleg {n} db érhető el, ezért a rendelés nem adható le.`
(2) A vevő tokenjével lekért `GET /api/orders` válasza pontosan annyi rendelést tartalmaz,
mint a leadási kísérlet előtt.

**Metrika típus:** [x] Bináris  [ ] Skálázott  [ ] Összehasonlító

**Prioritás:** [x] Kritikus  [ ] Magas  [ ] Közepes  [ ] Alacsony

---

## Forgatókönyv 5: A pénztár űrlapja a fiók adataiból töltődik elő

**Kontextus:**
Bejelentkezett vásárló, akinek a fiókjában név, e-mail cím és szállítási cím is szerepel.
A kosarában van legalább egy tétel.

**Akció:**
Megnyitja a pénztárt, és megnézi az űrlapot.

**Elvárt viselkedés:**
Mindhárom mező előre kitöltve érkezik a fiók adataiból, de szerkeszthető marad.

**Satisfaction kritérium:**
Két feltétel együtt. (1) A három mező megjelenített értéke megegyezik a fiók megfelelő
értékeivel. (2) Mindhárom mező szerkeszthető marad: egyiken sincs `readonly` és `disabled`
attribútum, és egy beírt karakter után a mező értéke ténylegesen megváltozik. A második
felét azért mérjük külön, mert az előtöltés bekötése közben elhelyezett `readOnly` az
elsőt nem bukná meg.

**Metrika típus:** [ ] Bináris  [ ] Skálázott  [x] Összehasonlító

**Prioritás:** [ ] Kritikus  [ ] Magas  [x] Közepes  [ ] Alacsony

## Megjegyzés:  

A Kategorizálás és szelekció feladatot nem tudom megfelelően értelmezni, mivel az volt a feladat, hogy E2E scenario-kat írjunk. Szerintem ezek B-k.  
Hány forgatókönyvet írtam önállóan? 5  
Hányat törölt a kategorizálás? Nem töröltem  
Hányat adott hozzá az AI? 5  
Hányat fogadtam el az AI javaslataiból? 5 Nem kérdezte, hogy megfelelő-e nekem :)  

## Reflexiós kérdés  

Szerintem egyik sem. Nem újdonság számomra a tesztelés, max E2E (igazából már csak API) teszteket régen írtam, mert jó ideje delegált manuál tesztelők vannak erre a munkahelyen.  

## Prompt  

Ehhez a feature-hez scenario-katalógust építek: vásárlási folyamat 

Eddig a következő forgatókönyveket azonosítottam: lásd a fenti forgatókönyveket

Azonosíts 3–5 olyan viselkedési forgatókönyvet, amelyet valószínűleg kihagytam.
Különösen figyelj:
- Konkurens műveletek
- Jogosultság-határesetek
- Adatintegritás-problémák
- Hibaállapotból való visszatérés

Minden javaslatnál add meg a satisfaction kritériumot is, és vedd fel őket a Readme végére, azzal a főcímmel, hogy generált tartalom


## Generált tartalom

A meglévő öt forgatókönyv közös vakfoltja, hogy mind **egy vevőt, egy kérést és egy
pillanatot** mér. Az alábbi öt azt a négy tengelyt fedi le, ahol a rendszer viselkedése
nem egyetlen kérésből következik: párhuzamosság, jogosultság, időbeli állandóság és a
hiba utáni második próbálkozás.

---

## Forgatókönyv 6: Két vevő egyszerre kéri az utolsó darabot

**Kontextus:**
Egy termékből az elérhető mennyiség (`available` = `stock` − aktív `pending` foglalások)
pontosan 1 darab. Két különböző bejelentkezett vásárló kosarában is ott van ugyanez a
termék, mindkettőnél 1 darabbal, mindkettő a pénztáron áll.

**Akció:**
A két vevő gyakorlatilag egyszerre nyomja meg a „Rendelés leadása" gombot — a két
`POST /api/orders` kérés átfedésben ér a szerverre.

**Elvárt viselkedés:**
Pontosan az egyik rendelés jön létre, a másik elutasul. Nincs olyan kimenet, amelyben
mindkettő sikerül, és olyan sem, amelyben egyik sem. A vesztes vevő a készlethiány
üzenetét kapja, nem szerverhibát, és a kosara megmarad.

**Satisfaction kritérium:**
A két válasz közül pontosan egy `201`, pontosan egy `409`, és a `409` szövege
`A(z) {terméknév} termék elfogyott, ezért a rendelés nem adható le.` A művelet után a
`GET /api/products/{id}` válaszában az `available` mező `0` — az invariánst nem az
adatbázison, hanem ezen a mezőn olvassuk le, mert a szerver pontosan ezt a
`stock − aktív foglalások` különbséget teszi ki a HTTP-felületre.
Ugyanez a mérés 10 párhuzamos kéréssel 3 elérhető darabra: pontosan három válasz `201`, a
`201`-ek `items[].quantity` összege nem haladja meg a kiindulási `available` értéket, és a
futás végén az `available` `0` — soha nem negatív.

**Megjegyzés:** ez az `OrderService.place` sorzárolásának (I-5, ADR-0003) az egyetlen
igazi próbája; szekvenciális teszttel nem mérhető. Rokon, de külön eset, hogy egy **lejárt**
foglalás az ütemező söprése előtt még mindig foglal (ADR-0005, K-2) — ott a vállalt
viselkedés az alul-értékesítés, nem a túlértékesítés.

**Metrika típus:** [x] Bináris  [ ] Skálázott  [ ] Összehasonlító

**Prioritás:** [x] Kritikus  [ ] Magas  [ ] Közepes  [ ] Alacsony

---

## Forgatókönyv 7: A munkamenet a pénztáron áll le

**Kontextus:**
Bejelentkezett vásárló, tele kosárral, nyitott pénztár-űrlappal. A tokenje időközben
lejár (vagy az admin törli a felhasználót) — a böngésző viszont még bejelentkezettnek
látja magát, mert a munkamenet a localStorage-ban van.

**Akció:**
A vevő kitölti az űrlapot, és leadja a rendelést. A `POST /api/orders` `401`-et kap.

**Elvárt viselkedés:**
A felület nem „némán felejt": megmagyarázza a kiléptetést, a bejelentkezés után pedig
oda vezet vissza, ahonnan a vevő kiesett, változatlan kosárral. Rendelés nem keletkezik.

**Satisfaction kritérium:**
Három feltétel együtt: (1) a szerver válasza `401`, szövege `Bejelentkezés szükséges.`, és
az újbóli bejelentkezés utáni `GET /api/orders` válasza pontosan annyi rendelést tartalmaz,
mint a lejárat előtti — új rendelés **nem** keletkezett; (2) a képernyőn megjelenik a
`A munkameneted lejárt, ezért kiléptettünk.` kezdetű üzenet, a vevő a `/login`-on köt ki;
(3) újbóli bejelentkezés után a kosár tételszáma és végösszege azonos a lejárat előttivel,
és a rendelés második nekifutásra sikerrel leadható.

**Metrika típus:** [x] Bináris  [ ] Skálázott  [ ] Összehasonlító

**Prioritás:** [ ] Kritikus  [x] Magas  [ ] Közepes  [ ] Alacsony

---

## Forgatókönyv 8: Elutasítás utáni javító kör — pontosan egy rendelés

**Kontextus:**
Az 3. vagy 4. forgatókönyv utáni állapot: a vevő a pénztáron áll, a képernyőn ott a hiba
(áreltérés vagy fedezethiány), a kosár érintetlen. Az akadály időközben elhárul — a vevő
frissíti az oldalt (így friss árat kap), vagy csökkenti a mennyiséget a ténylegesen
elérhető darabszámra.

**Akció:**
A vevő újra megnyomja a „Rendelés leadása" gombot. Egy változatban türelmetlenül,
kétszer egymás után kattint.

**Elvárt viselkedés:**
A javított rendelés átmegy, a korábbi hibaüzenet eltűnik, a kosár kiürül, és a
visszaigazolás egyetlen azonosítót mutat. A dupla kattintás nem hoz létre két rendelést.

**Satisfaction kritérium:**
A vevő rendeléslistája **pontosan eggyel** hosszabb, mint a hibás próbálkozás előtt volt —
sem nullával (a sikertelen kísérlet nem hagyott hátra félkész rendelést), sem kettővel
(a dupla kattintás nem duplikált). A visszaigazoláson szereplő azonosítójú rendelés
összege megegyezik a képernyőn utoljára mutatott „Fizetendő" értékkel, és a hibaüzenet
már nem látszik.

**Megjegyzés:** ez méri, hogy a hibaág **nem** hagy szemetet (a `stock` egyik ágon sem
mozdul, foglalás sem marad hátra), és hogy a leadás gomb a kérés idejére letiltódik.

**Metrika típus:** [x] Bináris  [ ] Skálázott  [ ] Összehasonlító

**Prioritás:** [x] Kritikus  [ ] Magas  [ ] Közepes  [ ] Alacsony

---

## Forgatókönyv 9: A leadott rendelés nem változik meg utólag

**Kontextus:**
A vevőnek van egy sikeresen leadott, `pending` állapotú rendelése egy termékre. Az admin
ezután **átnevezi** a terméket, **megemeli az árát**, és **inaktiválja**.

**Akció:**
A vevő megnyitja a „Rendeléseim" oldalt, és megnézi a korábbi rendelését.

**Elvárt viselkedés:**
A rendelés a **leadáskori** terméknevet és egységárat mutatja, a végösszege változatlan.
A rendelés önhordó dokumentum: az azóta történt katalógus-változások nem írják át
visszamenőleg. A termék inaktiválása sem tünteti el a tételt a rendelésből.

**Satisfaction kritérium:**
Két értékkészlet egyezését mérjük, mindkettőt HTTP-válaszból. A leadáskor kapott
`POST /api/orders` `201`-es válasz `items[].name`, `items[].unitPrice` és `total` mezőit
eltesszük; a katalógus módosítása után a `GET /api/orders` válaszában az azonosítója
alapján megkeressük ugyanazt a rendelést, és a három mező értéke **mezőnként egyenlő** az
eltett értékekkel. Ugyanezek **eltérnek** a `GET /api/products/{id}` aktuális `name` és
`price` mezőitől. A `total` továbbra is a tételek `unitPrice × quantity` összege.

**Metrika típus:** [ ] Bináris  [ ] Skálázott  [x] Összehasonlító

**Prioritás:** [ ] Kritikus  [x] Magas  [ ] Közepes  [ ] Alacsony

---

## Forgatókönyv 10: Egy másik vevő rendelése és kosara nem szivárog át

**Kontextus:**
Két vásárló, „A" és „B", ugyanazt a böngészőt használja egymás után. „A" tett dolgokat a
kosarába és leadott egy rendelést, majd kijelentkezett. „A" rendelése tartalmazza a
leadáskori nevét, e-mail címét és szállítási címét.

**Akció:**
„B" bejelentkezik ugyanabban a böngészőben, megnézi a kosarát és a „Rendeléseim" oldalt,
majd megpróbálja közvetlenül lekérni „A" rendelését az azonosítójával.

**Elvárt viselkedés:**
„B" kosara üres (nem örökli „A" tételeit), a rendeléslistája nem tartalmazza „A"
rendelését, és a közvetlen lekérés sem adja vissza. Ha „B" kijelentkezik és „A" visszalép,
„A" a saját kosarát kapja vissza.

**Satisfaction kritérium:**
„B" `GET /api/orders` válaszában **egyetlen** olyan rendelés sincs, amelynek azonosítója
„A" rendeléséé, és a válasz sehol nem tartalmazza „A" e-mail címét vagy szállítási címét.
A böngésző kosara „B" belépése után 0 tételt mutat. A visszaváltás után „A" kosarának
tételszáma azonos a kijelentkezés előttivel.

**Megjegyzés:** két külön mechanizmus egy forgatókönyvben — a szerveroldali
tulajdonos-szűrés és a felhasználónkénti kosárkulcs. Érdemes lehet két scenárióra bontani,
ha a lépésdefiníciók külön hibaokot akarnak jelezni.

**Metrika típus:** [x] Bináris  [ ] Skálázott  [ ] Összehasonlító

**Prioritás:** [x] Kritikus  [ ] Magas  [ ] Közepes  [ ] Alacsony

---

## Szimulált felhasználói session alapján felvett forgatókönyvek

A 11–13. forgatókönyv nem a fenti kategorizálási körből származik, hanem egy szimulált
felhasználós session (Patkó Béla perszóna) találataiból. A levezetést — hogy melyik
megfigyelésből lett forgatókönyv, és melyikből hibajegy — lásd:
[`../user-simulation/szimulalt-felhasznalo-riport.md`](../user-simulation/szimulalt-felhasznalo-riport.md),
3.1 szakasz. A fentebbi „Megjegyzés" alatti darabszámok az akkori állapotra vonatkoznak; ez a
három nem számít beléjük.

A közös vonásuk, hogy mind a hármat ugyanaz a vakfolt engedte át: az 1–10. forgatókönyv
**eredményeket** ír le („a vevő 2-re állítja a mennyiséget", „a vevő megnyitja a kosárfiókot"),
nem **mozdulatokat** — így az a rés esik ki, ahogy egy gyakorlatlan kéz odajut az eredményhez.

---

## Forgatókönyv 11: Az anonim kosár túléli a bejelentkezést

**Kontextus:**
Kijelentkezett (anonim) látogató, aki már tett terméket a kosarába: a kosárjelvény 1 tételt mutat,
a kosárfiók végösszege a termék árával egyezik. Rendelést csak bejelentkezve lehet leadni, ezért a
pénztárról a bejelentkezésre kerül.

**Akció:**
Bejelentkezik egy létező fiókba, és a belépés utáni átirányítás után megnézi a kosarát.

**Elvárt viselkedés:**
Ez a forgatókönyv szándékosan **nem a jelenlegi viselkedést rögzíti, hanem döntést kényszerít ki**.
Két ág megengedett: a rendszer vagy **(A)** átviszi az anonim kosarat a belépett munkamenetbe,
vagy **(B)** a bejelentkezés **előtt** kimondja, hogy a kosár tartalma nem marad meg. Amit a
forgatókönyv tilt, az a ma megfigyelt harmadik ág: a kosár szó nélkül eltűnik, és a felhasználó a
pénztáron „A kosarad üres" üzenettel szembesül anélkül, hogy bármi jelezte volna. A találat nem az,
hogy a kosár elveszik — az lehet szándékos —, hanem hogy **némán** veszik el.

**Satisfaction kritérium:**
A két megengedett ág közül pontosan az egyik áll.
**(A) Összefésülés:** a belépés után a kosárjelvény tételszáma és a kosárfiók végösszege azonos a
belépés előttivel, és a rendelés ebből az állapotból leadható — a `POST /api/orders` `201`-es
válaszának `items[].quantity` és `total` mezője a belépés előtt látott kosarat tükrözi.
**(B) Explicit figyelmeztetés:** a bejelentkezési képernyő már a hitelesítés elküldése **előtt**
megjeleníti, hogy a jelenlegi kosár tartalma nem marad meg, és a szöveg megnevezi a tételszámot.
**Bukott az eset**, ha egyik sem teljesül: a belépés után a kosár 0 tételt mutat, és a folyamat
egyetlen pontján sem jelent meg erre utaló üzenet.

**Megjegyzés:** a **7. forgatókönyv** ugyanezt a szabályt már kimondja a munkamenet-lejárat utáni
visszatérésre („a kosár tételszáma és végösszege azonos a lejárat előttivel"); ez annak a másik
fele, az anonim → belépett átmenetre. A **10. forgatókönyv** pedig ugyanennek a mechanizmusnak
(felhasználónkénti kosárkulcs) az *adatvédelmi* oldalát méri. A kettő nem mond ellent egymásnak, de
az (A) ág megvalósítása közben pont a 10. a regressziós kockázat: „A" kosara nem szivároghat át
„B"-hez azért, mert az anonim kosarat összefésüljük.

**Metrika típus:** [x] Bináris  [ ] Skálázott  [ ] Összehasonlító

**Prioritás:** [x] Kritikus  [ ] Magas  [ ] Közepes  [ ] Alacsony

---

## Forgatókönyv 12: A mennyiség-mező bevitelének épsége

**Kontextus:**
Bejelentkezett vásárló, a kosarában egy termékből 2 darab van, a készlet legalább 3 darabot fedez.
A kosársoron a mennyiség szerkeszthető számmező.

**Akció:**
Három bevitel, egymástól függetlenül, mindegyik a nyers billentyű- és egérműveletek szintjén — nem
kész értékként:
(1) dupla kattintás a mennyiség-mezőn, majd az `1` leütése;
(2) a mező tartalmának kitörlése `Backspace`-szel, majd — **külön lépésben**, a köztes üres állapot
után — a `3` leütése;
(3) `0`, illetve nem szám (`abc`) beírása.

**Elvárt viselkedés:**
A mező azt veszi fel, amit a felhasználó beírt, és a köztes állapotot nem tekinti végleges
szándéknak. (1) A dupla kattintás kijelöli a mező tartalmát, ahogy minden más beviteli mezőben,
tehát az `1` leütése 1-et eredményez, nem 21-et. (2) Az üres mező nem törli a tételt: a sor
megmarad, amíg a felhasználó be nem fejezi a gépelést. (3) A `0` és a nem szám nem visz érvénytelen
kosárállapotba.

**Satisfaction kritérium:**
Bináris, mindhárom bevitelre külön, és mindhárom feltétel kell.
(1) A művelet után a kosársor mennyisége `1`, a végösszeg a termék egyszeres ára — nem `21`, nem
`31 290 Ft`.
(2) A `Backspace` után a kosársor **még létezik** (a terméknév a kosárfiókban látszik), és a `3`
leütése után a mennyiség `3`.
(3) `0` vagy `abc` beírása után a kosár állapota érvényes: a mennyiség egész és legalább 1, vagy a
tétel törlése kifejezett megerősítés után történt meg.

**Megjegyzés:** ezt az esetet a **2. forgatókönyv nem helyettesíti**, és ez a besorolás lényege.
A 2. metrikája **összehasonlító** — a kliens és a szerver által számolt összeg egyezését méri —,
ezért egy 21 darabos, 31 290 Ft-os félrerendelésen **zölden megy át**: mindkét oldal ugyanazt a
rossz számot számolja ki, tehát egyeznek. Egy összehasonlító metrika elvből nem tudja megfogni azt,
ami mindkét oldalon egyformán hibás; ahhoz külön, **bináris**, konkrét várt értéket rögzítő eset
kell. A második különbség ugyanilyen fontos: a 2. a mennyiséget kész értékként kezeli, ez pedig
azt méri, ahogyan az érték a mezőbe **kerül**.

**Metrika típus:** [x] Bináris  [ ] Skálázott  [ ] Összehasonlító

**Prioritás:** [x] Kritikus  [ ] Magas  [ ] Közepes  [ ] Alacsony

---

## Forgatókönyv 13: Ismételt kattintás a „Kosárba" gombon

**Kontextus:**
Bejelentkezett vásárló a terméklistán, üres kosárral. Az aktív, raktáron lévő terméken ott a
„Kosárba" gomb.

**Akció:**
Gyors egymásutánban kétszer kattint a „Kosárba" gombra, majd — a kosárfiók megnyitása **nélkül** —
megnézi, mit lát a képernyőn.

**Elvárt viselkedés:**
A követelmény **nem** az, hogy pontosan 1 darab kerüljön a kosárba: két kattintás két darab kérése
is lehet, ez védhető termékdöntés. A követelmény a **láthatóság** — a felhasználónak a kosárfiók
megnyitása előtt látnia kell, mi történt.

**Satisfaction kritérium:**
Két feltétel együtt. (1) A második kattintás után a kosárjelvény a kosár **tényleges** darabszámát
mutatja (akár 1, akár 2 — a termékdöntéstől függően), és ez az érték megegyezik azzal, amit a
kosárfiók megnyitása után látunk: a jelvény soha nem marad le a kosár mögött. (2) Minden egyes
kosárba tétel kap észlelhető, a kattintás helyén vagy ahhoz közel megjelenő visszajelzést (a gomb
állapotváltása vagy értesítés) — a felhasználó nem a kosárfiókból tudja meg, hogy két darab lett.

**Megjegyzés:** a **8. forgatókönyv** ugyanezt az elvet már kimondta a „Rendelés leadása" gombra, és
a védelem ott meg is épült — a dupla kattintás valóban nem duplázza a rendelést. Ez annak a
kiterjesztése a katalógus deklarált tárgyának többi felületére. A tanulság, ami a 8.-at szűkké
tette: a türelmetlen dupla kattintás nem egy gomb tulajdonsága, hanem a felhasználóé, tehát a
kritériumát végig kell vinni minden felületen, ahol az a minta előfordulhat.

**Metrika típus:** [x] Bináris  [ ] Skálázott  [ ] Összehasonlító

**Prioritás:** [ ] Kritikus  [x] Magas  [ ] Közepes  [ ] Alacsony