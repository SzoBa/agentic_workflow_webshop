# Saját fiókadatok szerkesztése

## Miről van szó

A bejelentkezett felhasználó ma semmit nem tud állítani magán. Ha elköltözik vagy elírta az
e-mailjét, adminhoz kell fordulnia, a jelszavát meg egyáltalán senki nem tudja megváltoztatni,
még az admin sem.

Kell egy „Adataim" képernyő, ahol a user átírja a nevét, e-mailjét, címét, és külön ott tud
jelszót is cserélni.

## Mit lehet szerkeszteni

- felhasználónév
- e-mail
- szállítási cím
- jelszó (ez külön van, lásd lentebb)

A szerepkört értelemszerűen nem lehet állítani magának, azt hagyjuk figyelmen kívül, ha mégis
beküldi.

A validáció ugyanaz legyen, mint a regisztrációnál — ne írjunk új szabályokat, elég a meglévő
validátort meghívni. Az egyediségnél figyelni kell, hogy a saját nevét meg tudja tartani.

## Jelszócsere

Külön végpont, mert ez más jellegű művelet. A kérésben jön a jelenlegi jelszó, az új jelszó,
és az új jelszó még egyszer megerősítésként.

A tokennel kezdeni kell valamit csere után — a régi token elvileg nem maradhat érvényes, de
nem akarjuk kiléptetni a usert sem. Új tokent kell adni a válaszban, a kliens meg
lecseréli.

## Hibaüzenetek

Magyarul, ahogy a többi. Kb. ezek kellenek:

- rossz jelenlegi jelszó → `A jelenlegi jelszó hibás.`
- az új jelszó ugyanaz, mint a régi → valami olyasmi, hogy nem lehet azonos
- a megerősítés nem stimmel → erre is kell egy üzenet

A rövid jelszóra és a profilmezőkre a meglévő katalógusszövegek jók, azokat ne duplikáljuk.

## Brute force

Elvileg valaki ellopott tokennel addig tippelgetheti a jelenlegi jelszót, amíg el nem találja.
Erre valami korlátot rá kell tenni, a `LoginAttemptService` már megvan, azt lehetne használni.
Nem akarom, hogy a login rate limitjével összeakadjon, szóval valahogy külön kell számolni.

## Definition of Done

- [ ] **FA-01** — A felhasználó be tudja állítani a saját adatait, és utána tényleg azt látja,
      amit beírt.
- [ ] **FA-02** — A validáció rendesen működik, hibás adatra értelmes hibaüzenet jön vissza.
- [ ] **FA-03** — Nem lehet más nevét vagy e-mailjét elvenni.
- [ ] **FA-04** — A szerepkört nem tudja magának átírni.
- [ ] **FA-05** — A jelszócsere működik: az új jelszóval be lehet lépni.
- [ ] **FA-06** — A régi jelszó a csere után már nem jó.
- [ ] **FA-07** — A tokenkezelés a csere után korrekt (lásd fent).
- [ ] **FA-08** — Bejelentkezés nélkül egyik végpont sem érhető el.
- [ ] **FA-09** — A találgatás néhány próbálkozás után le van tiltva egy ideig.
- [ ] **FA-10** — Van egy `/profile` oldal, ahonnan mindez elérhető, és a fejlécből is el lehet
      jutni rá.
- [ ] **FA-11** — Az oldal jól néz ki, és a hibák megjelennek rajta.
- [ ] **FA-12** — Van rá teszt.
- [ ] **FA-13** — A meglévő tesztek nem törnek el.
- [ ] **FA-14** — Zöld a build.

## Egyéb megjegyzések

- A `spec/backend/vegpontok.md` jelenleg azt írja, hogy a jelszó nem módosítható — ezt majd
  frissíteni kell, ha ez a feature kész.
- Migráció szerintem nem kell hozzá, a `users` táblában minden mező megvan.
- A régi rendelésekben lévő név nem változik meg utólag, az snapshot (ADR-0001), ez így jó.
