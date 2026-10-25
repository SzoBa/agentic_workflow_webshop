# Konformancia-futtató

A [`konformancia.md`](../konformancia.md) `K-xx` eseteinek végrehajtója. Egy megadott
base URL ellen fut, **kizárólag HTTP-n keresztül** — nincs adatbázis-hozzáférés és nincs
teszt-hátsóajtó.

## Futtatás

```bash
# a szerver külön terminálban fusson
cd server-java && docker compose up -d && mvn spring-boot:run
# vagy a repó gyökeréből, kliens nélkül:  ./start.sh --no-client

node spec/backend/conformance/run.mjs --base-url http://localhost:3001 --clean-store
```

| Kapcsoló | Mit csinál |
|---|---|
| `--base-url <url>` | A vizsgált backend gyökere (alap: `http://localhost:3001`, vagy a `CONFORMANCE_BASE_URL` env-változó) |
| `--clean-store` | Jelzi, hogy a backend **friss, üres** adattárolóval indult |
| `--skip-rate-limit` | Kihagyja a K-50 / K-51 eseteket |
| `--only K-01,K-20` | Csak a felsorolt esetek (hibakereséshez) |

Kilépési kód: `0` = minden futtatott eset zöld · `1` = van bukott eset · `2` = a futtató
nem tudott elindulni (nem érhető el a backend, vagy a seed admin bejelentkezése bukik).

## Miért nem TypeScript

A katalógus **nyelvfüggetlen**: nem az implementáció kódját méri, hanem a HTTP-szerződést.
Ezért a futtató sem támaszkodhat egyik oldal build-láncára sem — sima ESM JavaScript, nulla
függőséggel, Node beépített `fetch`-ével. Ez tette lehetővé, hogy a migráció alatt ugyanaz a
katalógus fusson a Node- és a Java-backend ellen (ld. [ADR-0006](../../../docs/adr/0006-atvaltas-a-java-backendre.md)),
és ugyanezért maradt használható a Java modul mellett is: a `mvn` és az `npm` világából
egyaránt indítható.

## Lefedettség

A katalógus 70 esetéből **54 futtatható HTTP-n**. A maradék 16 a `⚙` jelűek halmaza:
óraállítást, újraindítást, konfigurációs felülírást, az adatbázis közvetlen olvasását vagy
hibainjektálást igényelnek — a K-56 pedig azért nem futtatható itt, mert a K-51-gyel
**ugyanazt a rate limit vödröt** fogyasztja (K-29, K-30, K-31, K-34, K-47, K-52, K-53, K-54,
K-56, K-57, K-58, K-72, K-73, K-74, K-75, K-76). Ezek nyilvántartása a
[`cases/kornyezetfuggo.mjs`](./cases/kornyezetfuggo.mjs)-ben van, és a riport is beszámol
róluk — egy néma `54/54` ugyanis azt hazudná, hogy minden le van fedve.

Megvalósításukhoz a backendnek tesztidejű vezérlést kellene kínálnia (óra előreállítása
vagy az ütemező kézi futtatása). Ez új felület a termelési szerveren, saját biztonsági
megfontolással — külön döntés, külön munka.

Ezért mind a 16-ot **integrációs teszt** fedi a `server-java/` modulban: a
Testcontainers-környezet pont azt a beavatkozást engedi meg, amit a katalógus kér (óraállítás,
második példány indítása, hibainjektálás, közvetlen SQL-olvasás, és a rate limit vödrének
ürítése tesztenként). A leképezés a [`konformancia.md`](../konformancia.md) `⚙`-táblázatában
van. A két mérés együtt adja ki a teljes 70-et:

| Honnan | Esetek |
|---|---|
| Ez a futtató (HTTP) | 54 |
| `cd server-java && mvn test` | 16 (`⚙`) |

**Mérés (2026-07-26, friss adattárolóval):** 54 / 54 zöld.

## Két csapda, amivel számolni kell

**1. A K-51 15 percre kizárja a futtató IP-címét a bejelentkezésből.** Az eset tíz
sikertelen bejelentkezést végez, hogy a 11. 429-et adjon — a korlát pedig *perzisztens*,
tehát szerver-újraindítást is túlél (ez maga a K-52). Ezért:

- a K-50 és a K-51 a futás **végén** fut (`order: 10` / `20`),
- közvetlen újrafuttatás előtt használd a `--skip-rate-limit` kapcsolót,
- ha mégis bezárult a korlát, a futtató **egyetlen** beszédes üzenettel áll le, nem
  negyven azonos hibával.

**2. A darabszám-érzékeny esetek tiszta adattárolót kívánnak.** A futtató nem tud
adattárolót üríteni (csak HTTP-t használ), ezért minden eset egyedi nevű termékekkel és
felhasználókkal dolgozik. Négy eset viszont abszolút darabszámot állít — K-77 (a seed 8
terméke), K-05 (12-es lapméret, 2 lap), K-48 és K-49 (egyetlen admin) —, ezek csak
`--clean-store` mellett futnak, és a futás **legelején** (`order: -20` / `-10`), mielőtt
a többi eset terméket venne fel. `--clean-store` nélkül kimaradnak, a riportban
megnevezve.

## Szerkezet

```
run.mjs                     belépési pont: argumentumok, sorrend, riport
harness.mjs                 HTTP-kliens, állítások, bootstrap (B-1…B-4)
cases/katalogus.mjs         K-01 … K-15
cases/rendeles.mjs          K-20 … K-36 (a ⚙ jelűek nélkül)
cases/felhasznalok.mjs      K-40 … K-58 (a ⚙ jelűek nélkül)
cases/ertekeles.mjs         K-60 … K-69
cases/jogosultsag.mjs       K-70, K-71
cases/uzemeltetes.mjs       K-77, K-78
cases/kornyezetfuggo.mjs    a 16 ⚙ eset nyilvántartása, okkal
```

Új eset felvétele: a megfelelő `cases/*.mjs` tömbjébe egy objektum, `{ id, title, run }`
mezőkkel. A `run({ client, boot })` a `harness.mjs` állításait használja; hiba esetén
`ConformanceError`-t dob (ezt az `assert*` függvények intézik), minden más kivétel
futtatóhibaként jelenik meg a riportban.

## Eltérések a katalógus szó szerinti szövegétől

A `konformancia.md` néhány esete konkrét kategórianevet említ (`Otthon`, `Iroda`). A
futtató ezek helyett **egyedi** neveket használ (`Otthon-<nonce>`), mert nem tud
adattárolót üríteni, és a seed katalógusban is lehetnek ilyen kategóriák. Az eset
lényege — a szóköz-levágás, illetve hogy a csak inaktív terméket tartalmazó kategória
kimarad a `categories` listából — változatlan.

A K-50 válaszidő-összehasonlítását a futtató **tájékoztatásként** írja ki, nem
állításként: statisztikailag értelmes méréshez sok minta kellene, ami a bejelentkezési
rate limitbe (K-51) futna. Az eset normatív magja — a két 401 **azonos törzse** — szigorú
állítás.

---

# `compare.mjs` — válasz-összehasonlítás két példány között

A `run.mjs` azt méri, **teljesíti-e** egy backend a katalógust. A `compare.mjs` mást kérdez:
ugyanazt **válaszolja-e** két futó példány. Attól még eltérhetnek, hogy mindkettő zöld — a
katalógus nem rögzít minden mezőnevet, kulcssorrendet és fejlécet.

Erre a migráció alatt volt szükség (`tasks.md` **B7.2**: Node vs. Java), de a szkript nem
kötődik egyik implementációhoz sem: **bármely két**, ezt a szerződést kiszolgáló példányt
összeveti. Tipikus mai használat egy kockázatos átalakítás előtt/után:

```bash
# a régi csomagolt változat az egyik porton…
java -jar target/webshop-server-1.0.0.jar --server.port=3010 …
# …az új a másikon, majd:
node spec/backend/conformance/compare.mjs \
  --reference http://localhost:3010 --candidate http://localhost:3001
```

| Kapcsoló | Mit csinál |
|---|---|
| `--reference <url>` | A mérvadó példány (alap: `http://localhost:3010`) |
| `--candidate <url>` | A vizsgált példány (alap: `http://localhost:3001`) |

Egy 58 lépéses forgatókönyv fut le mindkét oldalon, és a válaszok **státuszkódja,
`Content-Type`-ja és törzse** áll szembe egymással. A futásspecifikus értékeket (azonosítók,
időbélyegek, tokenek, a fixture-nevek nonce-a) a futtató helyettesíti; **minden mást**
érintetlenül hagy — a kulcssorrendet, a szám/szöveg típuskülönbséget és a `null` vs. hiányzó
mező különbséget is, mert pont ezek a csendes eltérések.

Az eltérések **két súlyban** jelennek meg:

- `✗ törzs` — **érdemi**: más az adat. A kilépési kód csak ettől lesz 1.
- `~ kulcssorrend` — ugyanaz az adat más sorrendben. Nem szerződés (a JSON-objektum
  kulcssorrendje nem hordoz jelentést, és a referencia maga sem következetes), ezért nem
  buktatja a futást — de kiírjuk, mert elhallgatni sem helyes.

**Két tudnivaló:**

1. **Tiszta adattároló kell mindkét oldalon** — és a kettő NE ugyanaz az adatbázis legyen. A
   forgatókönyv abszolút darabszámot is összevet (a seed katalógus 8 terméke), és a
   bejelentkezési korlát perzisztens.
2. **A két URL nem mutathat ugyanarra a példányra.** A két futás közös nonce-ot használ, hogy a
   két tároló szimmetrikusan öregedjen; ugyanazon a példányon a második futás regisztrációja
   ütközne.

**Utolsó mérés a Node-referencia ellen (2026-07-26, közvetlenül az átváltás előtt):** 58 lépés,
**0 érdemi eltérés**, 6 kulcssorrend-eltérés. Ez a mérés már nem megismételhető — a
referenciaimplementáció azóta törölve lett; a jegyzőkönyve az
[ADR-0006](../../../docs/adr/0006-atvaltas-a-java-backendre.md).
