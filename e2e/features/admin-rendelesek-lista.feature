# language: hu
#
# AZ ADMIN RENDELÉSKEZELŐ NÉZETE — végponttól végpontig.
#
# MIT MÉR EZ A FÁJL: az AR-19 kritérium első két felét — „a lista betöltődik" és
# „a státusz-szűrő és a keresés a szerver válaszát tükrözi" —, valamint az
# AR-12 / AR-13 / AR-15 azon részét, ami CSAK a réteghatáron mérhető: hogy a
# szervertől jövő rendelés-adat végigér a böngészőig.
#
# MIÉRT NEM ÉRI EL EZT EGYIK MEGLÉVŐ RÉTEG SEM: a kliens komponenstesztjei
# (AR-13…AR-15) MOCKOLT `api` modullal futnak — a válasz alakját a teszt maga
# adja —, a backend-oldali mérések (AR-01…AR-11) pedig kliens nélkül. A kettő
# TALÁLKOZÁSÁT csak ez a réteg méri: böngésző → SPA → API → Postgres.
#
# AMIT SZÁNDÉKOSAN NEM MÉR — nem hiány, hanem határ:
#  · A mezőnkénti megjelenítés RÉSZLETEIT (dátumformátum, címke-szöveg
#    származtatása az ORDER_STATUS_LABELS-ből). Ez az AR-13 tárgya, és a mockolt
#    `api`-val futó komponensteszt olcsóbban és pontosabban méri. Itt csak az a
#    kérdés, hogy a szerver ÉRTÉKEI megjelennek-e.
#  · `expired` státuszú rendelést. Azt kizárólag a lejárati söprő ütemező hozza
#    létre; kivárni percek. Az `expired` ág a komponensteszt és a backend
#    integrációs teszt tárgya.
#  · Lapozást. Az alap lapméret 25 — egy második laphoz 26 rendelést kellene
#    HTTP-n leadni. A vágás viselkedése az AR-07 / AR-08 integrációs esete.
#  · A betöltés-jelzéseket („Rendelések betöltése…", „Frissítés…"). Ezek egy
#    helyi stacken egy villanásnyi ideig látszanak; megbízhatóan csak a válasz
#    késleltetésével lennének mérhetők, amire a mockolt `api` való. Egy ilyen
#    állítás itt billegne — billegő teszt pedig nem mérés.
#  · A betöltési hibaüzenetet („Hiba: …"). Előállításához a szervernek hibáznia
#    kellene; publikus API-n nem kikényszeríthető, teszt-hátsóajtót pedig a váz
#    nem nyit.
#  · Nyers 401 / 403 választ a végponttól. Az AR-10 / AR-11 a backend tesztjének
#    tárgya; itt a böngészőben LÁTHATÓ következmény számít.
#
# A SZERVER ÁLLAPOTA SOHA NEM ÁLL VISSZA, ezért egyetlen szcenárió sem állít
# darabszámot azelőtt, hogy egy egyedi (nonce-os) e-mailre vagy azonosítóra
# szűkített volna.
@admin-rendelesek
Jellemző: Admin rendeléskezelő — a lista

  Háttér:
    Adott egy regisztrált vásárló
    És egy raktáron lévő termék
    És a vásárló leadott egy rendelést a termékre

  Forgatókönyv: A most leadott rendelés megjelenik a rendeléskezelőben
    Amikor bejelentkezett adminként megnyitom az "/admin/orders" útvonalat
    Akkor megjelenik a "Rendelések kezelése" képernyő
    És a rendelés sora tartalmazza a rendelés azonosítóját
    És a rendelés sora tartalmazza a vásárló nevét és e-mail címét
    És a rendelés sora tartalmazza a megrendelt terméket a darabszámával
    És a rendelés sora tartalmazza a rendelés végösszegét
    És a rendelés sorának státusza "Feldolgozás alatt"

  # A GET /api/orders (saját rendelések) NÖVEKVŐ sorrendje változatlan; ez a
  # végpont az, ami megfordítja — az admin a friss rendeléseket keresi.
  Forgatókönyv: A legújabb rendelés van elöl
    Adott a vásárló leadott még egy rendelést a termékre
    Amikor bejelentkezett adminként megnyitom az "/admin/orders" útvonalat
    És a vásárló e-mail címére keresek
    Akkor a később leadott rendelés sora előrébb van a korábban leadottnál

  # A darabszám-állítás csak azért megengedett, mert az e-mail nonce-os: rajta
  # kívül más rendelés nem illeszkedhet rá.
  Forgatókönyv: Keresés a vevő e-mail címére
    Amikor bejelentkezett adminként megnyitom az "/admin/orders" útvonalat
    És a vásárló e-mail címére keresek
    Akkor a lista "1 rendelés" találatot jelez
    És a rendelés sora látszik

  Forgatókönyv: Keresés a rendelés azonosítójára
    Amikor bejelentkezett adminként megnyitom az "/admin/orders" útvonalat
    És a rendelés azonosítójára keresek
    Akkor a lista "1 rendelés" találatot jelez
    És a rendelés sora látszik

  # A keresés és a státusz-szűrő EGYÜTT szűkít. A keresés adja a determinizmust
  # (a nonce-os e-mail), a státusz-választó a mért viselkedés.
  #
  # Minden lépés VÁLTÁST mér: a sor eltűnik, majd újra megjelenik, majd megint
  # eltűnik. Ez a sorrend szándékos. Egy „nem látszik" állítás önmagában akkor is
  # igaz, ha a szűrt válasz még meg sem érkezett — ezért kezdődik a lánc azzal,
  # hogy a sor LÁTSZIK, és minden további állítás egy megelőző állapot
  # megfordítása.
  Forgatókönyv: A státusz-szűrő a szerver válaszát tükrözi
    Amikor bejelentkezett adminként megnyitom az "/admin/orders" útvonalat
    És a vásárló e-mail címére keresek
    Akkor a rendelés sora látszik
    Amikor a "Kiszállítva" státuszt választom a szűrőben
    Akkor a rendelés sora nem látszik
    És a lista az üres találathalmaz üzenetét mutatja
    Amikor a "Feldolgozás alatt" státuszt választom a szűrőben
    Akkor a rendelés sora látszik
    Amikor a "Kiszállítva" státuszt választom a szűrőben
    Akkor a rendelés sora nem látszik
    Amikor az "Összes" státuszt választom a szűrőben
    Akkor a rendelés sora látszik

  # AR-15: a képernyő nem számol saját hátralévő időt — a ReservationStatus
  # komponens dönti el, mit mutat. Itt az látszik, hogy a szervertől kapott
  # `reservedUntil` valóban végigér a felületig.
  Forgatókönyv: A függő rendelésnél látszik a foglalás visszaszámlálója
    Amikor bejelentkezett adminként megnyitom az "/admin/orders" útvonalat
    És a vásárló e-mail címére keresek
    Akkor a rendelés sora a foglalás hátralévő idejét mutatja

  # A RequireAdmin őr csak kényelmi funkció — az érdemi védelem szerveroldali.
  # Ez a szcenárió a kényelmi ágat méri: a vevő ne tévedjen használhatatlan
  # oldalra.
  #
  # A „nevével jelzi a belépést" lépés nem díszítés, hanem a HORGONY: enélkül a
  # rákövetkező „nem jelenik meg" állítás akkor is igaz lenne, ha az SPA még ki
  # sem rajzolódott. Előbb bizonyítjuk, hogy a felület betöltött ÉS a munkamenet
  # él, és csak utána állítjuk, hogy a képernyő hiányzik.
  Forgatókönyv: Vásárlóként nem érem el a rendeléskezelőt
    Amikor bejelentkezett munkamenettel megnyitom az "/admin/orders" útvonalat
    Akkor a felület a vásárló nevével jelzi a belépést
    És nem jelenik meg a "Rendelések kezelése" képernyő

  Forgatókönyv: A "Rendelések" menüpont csak adminnak látszik
    Amikor bejelentkezett munkamenettel megnyitom a "/" útvonalat
    Akkor a felület a vásárló nevével jelzi a belépést
    És nem látszik a "Rendelések" menüpont
    Amikor bejelentkezett adminként megnyitom a "/" útvonalat
    Akkor látszik a "Rendelések" menüpont
