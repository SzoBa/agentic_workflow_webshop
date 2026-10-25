# language: hu
#
# A TESZT-VÁZ ÖNELLENŐRZÉSE — ez NEM terméki szcenárió.
#
# Nem a webshop viselkedéséről állít semmit: azt méri, hogy maga a váz működik-e.
# Elindul-e a böngésző, feloldódik-e a base URL, betölt-e az SPA, elérhető-e az
# API ugyanarról az origin-ről, és készül-e riport. Váz nélküli váz esetén a
# "működik" állítás ellenőrizhetetlen lenne — ezért van itt ez az egy fájl.
#
# Az első VALÓDI szcenáriók külön feature-fájlokba kerülnek. Ez a fájl marad, és
# maradjon is ilyen rövid: ha egy termékre vagy egy üzleti szabályra kezd
# hivatkozni, akkor már nem a vázat méri.
@onteszt
Jellemző: A teszt-váz önellenőrzése

  Forgatókönyv: A böngésző eléri a futó alkalmazást
    Amikor megnyitom a "/" útvonalat
    Akkor megjelenik a terméklista
    És a backend egészséges

  Forgatókönyv: A szcenáriók külön böngésző-munkamenetet kapnak
    Amikor megnyitom a "/" útvonalat
    Akkor kijelentkezve és üres kosárral indulok

  # Ez a szcenárió a váz LEGTÖRÉKENYEBB kapcsolatát őrzi: a `bejelentkezveMint`
  # kézzel írja a `webshop-auth` kulcsot a client/src/auth.tsx alakjában. Ha az
  # ott megváltozik, enélkül minden későbbi szcenárió csendben kijelentkezve
  # futna — itt viszont azonnal kiderül.
  Forgatókönyv: Az API-n át beültetett munkamenetet elfogadja a felület
    Adott egy regisztrált vásárló
    Amikor bejelentkezett munkamenettel megnyitom a "/" útvonalat
    Akkor a felület a vásárló nevével jelzi a belépést
