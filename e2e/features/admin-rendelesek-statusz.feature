# language: hu
#
# A STÁTUSZVÁLTÁS A RENDELÉSKEZELŐBŐL — végponttól végpontig.
#
# MIT MÉR EZ A FÁJL: az AR-19 harmadik felét — „egy státuszváltás végigmegy" —,
# és az AR-14 azon részét, ami csak a réteghatáron mérhető: hogy a szerver
# magyar hibaüzenete VÁLTOZTATÁS NÉLKÜL jut-e el az adminhoz, és hogy a siker
# valóban a szerveren történt-e meg, nem csak a kliens állapotában.
#
# A `delivered`-re váltás az EGYETLEN mód arra, hogy a készlet ténylegesen
# csökkenjen. A státuszgép maga a szerveren él és ott tesztelt; ez a fájl nem azt
# méri újra, hanem a felületről KIINDULÓ láncot.
#
# A várt hibaüzenetek SZÓ SZERINT a spec/backend/hibakatalogus.md-ből valók. Ha
# egy szcenárió azon bukik, hogy a szöveg nem egyezik, az vagy a katalógus, vagy
# a kliens hibája — nem a szcenárióé, és NEM a szcenárió szövegét kell igazítani.
#
# AMIT SZÁNDÉKOSAN NEM MÉR — nem hiány, hanem határ:
#  · A 409-es „A kiszállított rendelés státusza már nem módosítható." üzenetet.
#    Az a VISSZALÉPÉSÉ (delivered → pending/expired), a rendeléskezelő egyetlen
#    művelete viszont a `delivered`. Ezt az ágat a képernyőről nem lehet
#    kiváltani — a backend státuszváltás-tesztjének tárgya.
#  · A `delivered → delivered` váltás IDEMPOTENCIÁJÁT (K-36). A kiszállított soron
#    a gomb az AR-20 óta nem jelenik meg, tehát a második váltást a képernyőről
#    nem lehet elindítani — a backend státuszváltás-tesztjének tárgya. Ami innen
#    mérhető és mérve is van: hogy a gomb valóban eltűnik, és hogy a készlet
#    pontosan egyszer csökkent.
#  · A 401 / 403 üzenetét nyers válaszként. Böngészőből az admin munkamenettel
#    dolgozik; a jogosultság látható következményét az AR-12 szcenáriói mérik a
#    lista-feature-ben.
#  · A „Mentés…" gombfeliratot mentés közben: egy helyi stacken villanásnyi, a
#    megbízható méréshez a választ késleltetni kellene (a mockolt `api` dolga).
#
# EZ A FÁJL MEGVÁLTOZTATJA A SZERVER ÁLLAPOTÁT (a készlet csökken). Minden
# fixture nonce-os, ezért ez más szcenáriót nem érint — de a saját termékén és
# rendelésén kívül semmit nem feltételez.
@admin-rendelesek
Jellemző: Admin rendeléskezelő — státuszváltás

  Háttér:
    Adott egy regisztrált vásárló
    És egy raktáron lévő termék
    És a vásárló leadott egy rendelést a termékre
    És bejelentkezett adminként megnyitom az "/admin/orders" útvonalat
    És a vásárló e-mail címére keresek

  # Az újratöltés a szcenárió lényege, nem ráadás: a kattintás utáni sor önmagában
  # a KLIENS állapotát mutatja. Csak az újratöltés után látott „Kiszállítva"
  # bizonyítja, hogy a váltás a szerveren is megtörtént — ez az AR-19 „végigmegy".
  Forgatókönyv: A rendelés kiszállítottá tétele végigmegy a szerverig
    Amikor a rendelés során a "Kiszállítottá tétel" gombra kattintok
    Akkor a rendelés sorának státusza "Kiszállítva"
    És a rendelés sora nem mutat foglalás-szöveget
    Amikor újratöltöm a rendeléskezelőt
    És a vásárló e-mail címére keresek
    Akkor a rendelés sorának státusza "Kiszállítva"

  # A státusz-szűrő a szerveré: ha a rendelés már nem a "Feldolgozás alatt"
  # halmazban jön vissza, hanem a "Kiszállítva"-ban, akkor a váltás az
  # adatbázisig ért. Mindkét lépés VÁLTÁST mér (látszik → eltűnik → megjelenik).
  Forgatókönyv: A kiszállított rendelést a szerver már a másik szűrőben adja vissza
    Adott a rendelés során a "Kiszállítottá tétel" gombra kattintottam
    Amikor a "Feldolgozás alatt" státuszt választom a szűrőben
    Akkor a rendelés sora nem látszik
    Amikor a "Kiszállítva" státuszt választom a szűrőben
    Akkor a rendelés sora látszik
    És a rendelés sorának státusza "Kiszállítva"

  # A `delivered` VÉGÁLLAPOT, ezért a kiszállított soron a státuszváltó gomb már
  # NEM jelenik meg (AR-20) — a kliens nem az átmenettáblát másolja, hanem azt
  # ismeri fel, hogy egy végállapotú soron nincs mit felkínálni.
  #
  # Az újratöltés itt is a lényeg: a gomb hiányát a SZERVER által visszaadott
  # soron mérjük, nem azon, amit a kliens a sikeres PATCH után a saját
  # állapotában átírt.
  #
  # A készletre vonatkozó állítás SZÁNDÉKOSAN az API-ra megy: a képernyőn látott
  # státusz önmagában nem mondja meg, mennyivel csökkent a készlet.
  Forgatókönyv: A kiszállított rendelés során a felület már nem kínál státuszváltást
    Adott a rendelés során a "Kiszállítottá tétel" gombra kattintottam
    Amikor újratöltöm a rendeléskezelőt
    És a vásárló e-mail címére keresek
    Akkor a rendelés sorának státusza "Kiszállítva"
    És a rendelés során nem jelenik meg a "Kiszállítottá tétel" gomb
    És a rendelés sorában nem jelenik meg hibaüzenet
    És a termék készlete pontosan egyszer csökkent a rendelt darabszámmal

  # A készletcsökkentés az API-n történik, nem a felületen: a szcenárió tárgya a
  # rendeléskezelő, nem a termékszerkesztő. Így áll elő a fedezethiány anélkül,
  # hogy egy másik képernyő működése is feltétel lenne.
  Forgatókönyv: Fedezethiánynál a szerver üzenete jelenik meg a soron
    Adott az admin a rendeltnél kevesebbre csökkentette a termék készletét
    Amikor a rendelés során a "Kiszállítottá tétel" gombra kattintok
    Akkor a rendelés sorában megjelenik a készlethiányra figyelmeztető hibaüzenet
    És a hibaüzenet megnevezi a terméket és az elérhető darabszámot
    És a rendelés sorának státusza "Feldolgozás alatt"
