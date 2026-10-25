# language: hu
#
# A TÉMA MÁR AZ ELSŐ FESTÉS ELŐTT ELDŐL — és ezt csak innen lehet megmérni.
#
# MIÉRT VAN EZ A FÁJL. A `data-theme` induló értékét az index.html fejlécében
# futó apró, beágyazott script írja ki, mert a Reactre bízva a sötét témát
# választó látogató egy villanásnyi fehér oldalt látna, amíg a köteg letöltődik.
# Ez viszont azzal jár, hogy a `client/src/ui.tsx` `resolveTheme` szabálya KÉT
# helyen él, és a duplikáció elkerülhetetlen: az egyiknek minden köteg előtt kell
# futnia. A dokumentált duplikáció megromlik, a MÉRT duplikáció nem — ez a fájl a
# mérés. Ha a két szabály valaha széttart, itt bukik el, nem a felhasználónál.
#
# HOGYAN MÉRI. A szcenáriók a kliens JS-kötegét ELDOBJÁK (minden szkript-kérést
# megszakítunk). Ami ezek után a képernyőn eldől, azt bizonyíthatóan a beágyazott
# script döntötte el egyedül — a React el sem indul. Ezt a "React nem indult el"
# lépés minden szcenárióban ki is mondja: enélkül a zöld szcenárió akár azt is
# jelenthetné, hogy a React időben odaért, és a mérés semmit nem őriz.
#
# A SZERVER ÁLLAPOTÁT NEM VÁLTOZTATJA, és nem is olvassa: nincs fixture, nincs
# bejelentkezés. Az egyetlen bemenete a `webshop-theme` kulcs és a rendszer
# szín-preferenciája.
@tema
Jellemző: A téma az első festés előtt eldől

  # A három választás a `resolveTheme` három ága. A "system" azért kap sötétet,
  # mert a szcenárió sötét rendszer-preferenciát kér — ez az ág az, ami a
  # médiakérdést is használja, nem csak a tárolt értéket.
  Forgatókönyv vázlat: A mentett választás a köteg betöltése előtt érvényesül
    Adott a rendszer sötét témát kér
    És a mentett téma-választás "<valasztas>"
    Amikor a kliens kötege nélkül megnyitom a "/" útvonalat
    Akkor az oldal "<varhato>" témával indul
    És a React nem indult el

    Példák:
      | valasztas | varhato |
      | dark      | dark    |
      | light     | light   |
      | system    | dark    |

  # Választás nélkül a rendszer dönt. Ez a leggyakoribb eset: az első látogató
  # tárolt kulcs nélkül érkezik, és pont ő az, aki a villanást látná.
  Forgatókönyv: Mentett választás nélkül a rendszer beállítása dönt
    Adott a rendszer sötét témát kér
    És a látogató még nem választott témát
    Amikor a kliens kötege nélkül megnyitom a "/" útvonalat
    Akkor az oldal "dark" témával indul
    És a React nem indult el

  # Az ellenpróba: ugyanaz a script világos rendszeren világosat ad. Enélkül egy
  # olyan elrontás is zöld maradna, ami MINDIG sötétet ír ki.
  Forgatókönyv: Világos rendszeren világos témával indul az oldal
    Adott a rendszer világos témát kér
    És a látogató még nem választott témát
    Amikor a kliens kötege nélkül megnyitom a "/" útvonalat
    Akkor az oldal "light" témával indul
    És a React nem indult el
