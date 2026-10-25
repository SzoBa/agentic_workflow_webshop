# Az OpenAPI-leíró — a 2. fázis

A leíró a **munkafa gyökerében** él, `openapi.yaml` néven (a leltár a `.yml` és a `.json`
alakot is elfogadja, de az új fájl legyen `.yaml` — ez az OpenAPI-ökoszisztéma alapértelmezése,
és az egyetlen alak, amit a szerkesztők kérés nélkül felismernek).

## Miért kézzel írt, statikus fájl

Ebben a projektben **nincs generátor**, és ez nem hiányosság:

- A `springdoc-openapi` új Maven-függőség lenne, azt pedig a projekt szabálya előzetes
  egyeztetéshez köti. Generátort **javasolni** szabad a jelentésben, telepíteni nem.
- A generált leíró csak azt tudja, amit az annotációk mondanak. A projekt lényegi szerződései
  — a **szó szerinti magyar hibaszövegek**, a `stock` és az `available` különbsége, a
  végösszeg-jóváhagyás — egyik annotációban sincsenek benne.

Ennek az ára, hogy a fájl magától elavul. Ezt **egyedül a leltár-kapu** tartja vissza; ha a
kaput megkerülöd, a leíró attól a perctől fikció.

## A hat forrás, és melyik mit dönt el

| Amit írsz | Honnan veszed | Vigyázz |
|---|---|---|
| útvonal, HTTP-metódus | a controllerek leképezés-annotációi | a teljes útvonal az osztály **és** a metódus annotációjából áll össze |
| kérés- és válaszmezők | a Java DTO-k **és** a kliens tükrözött típusai | a kettő külön van definiálva; ha eltérnek, az valódi hiba — jelentsd |
| státuszkódok | a kód `ApiException`/`HttpStatus` helyei | a hibakatalógus is felsorolja őket, de a kód az igazság |
| hibaszövegek | a hibakatalógus és a `Messages` osztály | **szó szerint**, magyarul, fordítás és rövidítés nélkül |
| jogosultság | az útvonalminta-alapú őrök | az admin-névtér minden végpontja 401/403 — végpontonként ne ismételd, `security`-vel fejezd ki |
| lekérdezési paraméterek | a controller paraméterei | `String`-ként kötődnek, és az értelmezésük szerződés (nem szám érték kihagyása) — ezt írd le, ne `integer` típust adj meg |

A kódtérképet — hol laknak a controllerek, mi a hibaszerződés alakja, hol a hibakatalógus —
a betöltött `spec-konvenciok` skill adja (1., 2. és 4. szakasz). Itt szándékosan nem
ismételjük meg: egy két helyen élő útvonal előbb-utóbb szétcsúszik.

## A váz

A blokkok sorrendje kötelező (`openapi` → `info` → `servers` → `tags` → `paths` →
`components`), mert a leltár szűk olvasója a **nulla behúzású** `paths:` kulcsot keresi, és a
blokk végét a következő nulla behúzású kulcs jelzi.

```yaml
openapi: 3.1.0

info:
  title: <a projekt neve>
  version: <a backend csomagverziója, a build-fájlból>
  description: |
    Magyar nyelvű, 3–6 mondat: mit csinál az API, mi a hibaválasz alakja,
    és mi a pénznem-konvenció.

servers:
  - url: /api-val kezdődő útvonalak relatívak; a szerver a fejlesztői porton figyel
    description: fejlesztői backend

tags:
  - name: <funkció szerinti csoport, a csomagfelosztást követve>

paths:
  /api/...:
    get:
      tags: [...]
      summary: <egy magyar mondat>
      security: []          # nyilvános végpontnál KIÍRVA, nem elhagyva
      parameters: [...]
      responses:
        "200": { ... }
        "404": { $ref: "#/components/responses/Hiba404" }

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
  schemas:
    Hiba:
      type: object
      required: [error]
      properties:
        error: { type: string, description: magyar hibaszöveg }
```

Öt megkötés, mind a leltár vagy a szerződés miatt:

1. **Egy útvonal egy kulcs.** A leltár az útvonalkulcsokat azonos behúzási szinten várja.
   Horgony (`&`/`*`), útvonal-szintű `$ref` és folyó (`{...}`) alak alulméréshez vezet — a
   `components` alatt viszont a `$ref` szabad és kívánatos.
2. **Az útvonalparaméter `{id}`**, nem `:id`. A `:id` a spec és a README jelölése; a leltár
   összevetéskor egységesíti a kettőt, de a leíró OpenAPI-alakot ír.
3. **A `security: []` nyilvános végpontnál is kiírandó.** Elhagyva a globális
   követelményt örökli, és a leíró azt fogja állítani, hogy a terméklista tokent kér.
4. **Az árak egész számok**, tizedes nélkül — `type: integer`, és a leírásában a pénznem.
5. **A hibaválasz egyetlen sémára hivatkozik.** A szövegek a válasz `examples`-ébe mennek, nem
   külön sémákba: ugyanaz az alak, más tartalom.

## Amit tilos beleírni

- **Meg nem figyelt választ.** Ha egy hibaágat nem találtál meg a kódban, az a végpont
  `responses` blokkjából **kimarad**, és a jelentésbe kerül. Egy kitalált `422` rosszabb, mint
  egy hiányzó.
- **Belső részletet.** Táblanév, oszlopnév, osztálynév, kivételtípus, verem. A hibaválasz maga
  sem tartalmazhat ilyet — a leíró se sugallja.
- **Hitelesítő adatot.** Példaértékbe sem kerül valódi token, jelszó vagy kulcs. A seed
  fejlesztői belépő a README-ben van a helyén, figyelmeztetéssel; a leíróban nincs.
- **Élesnek szánt `servers` URL-t.** A projektnek nincs publikált éles címe; egy kitalált
  domain a leíró legkárosabb mezője, mert működőnek látszik.
- **Jövő időt.** Ami még nincs megvalósítva, az nem kerül a leíróba. A tervezett végpont a
  spec dolga, nem a dokumentációé.

## Bővítéskor

Meglévő leírónál a feature végpontjait veszed fel, és **semmi mást nem rendezel át**. A
mezősorrend, a `tags` felosztás és a séma-nevek adottak: aki utána diffet néz, a feature
változását akarja látni, nem egy újraformázott fájlt.

Ha bővítés közben a meglévő részben találsz hibát (elavult mező, rossz státuszkód), azt
**javítod** — de a jelentés külön szakaszában mondod ki, hogy ez nem a feature-höz tartozott.
