#!/usr/bin/env node
// Válasz-összehasonlító két backend-implementáció között (tasks.md B7.2).
//
// A `run.mjs` azt méri, hogy egy backend teljesíti-e a katalógust — ítéletet mond,
// esetenként. Ez a szkript MÁST mér: ugyanazt a forgatókönyvet lefuttatja mindkét
// implementáció ellen, és a válaszokat MEZŐSZINTEN veti össze. Két backend attól
// még eltérhet, hogy mindkettő zöld: a katalógus nem rögzít minden mezőnevet,
// kulcssorrendet és fejlécet.
//
// Ugyanaz a tervezési döntés, mint a futtatónál: nulla függőségű ESM JavaScript,
// kizárólag HTTP — se adatbázis, se teszt-hátsóajtó (lásd README.md).
//
// Használat:
//   node spec/backend/conformance/compare.mjs \
//     --reference http://localhost:3010 --candidate http://localhost:3001
//
// MINDKÉT backendnek TISZTA adattárolóval kell indulnia: a forgatókönyv abszolút
// darabszámokat is összevet (a seed katalógus 8 terméke), és a bejelentkezési
// korlát perzisztens.
//
// Kilépési kód: 0 = nincs eltérés · 1 = van eltérés · 2 = a futtató nem indult el.

import { createClient } from "./harness.mjs";

const SEED_ADMIN = { username: "adminisztrator", password: "admin123" };

// --- Argumentumok ----------------------------------------------------------

function parseArgs(argv) {
  const args = { reference: "http://localhost:3010", candidate: "http://localhost:3001" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--reference") args.reference = argv[++i];
    else if (argv[i] === "--candidate") args.candidate = argv[++i];
    else if (argv[i] === "--verbose") args.verbose = true;
  }
  return args;
}

// --- Normalizálás ----------------------------------------------------------
//
// Két futás soha nem ad bájtazonos választ: az azonosítók, az időbélyegek és a
// tokenek futásonként mások. Ezeket helyettesítjük, MINDENT MÁST érintetlenül
// hagyunk — beleértve a kulcsok sorrendjét, a szám/szöveg típuskülönbséget és a
// null vs. hiányzó mező különbséget, mert pont ezek a csendes eltérések.

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ISO_TS = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;

/**
 * A munkamenet-token alakja: 32 véletlen bájt hexben, azaz PONTOSAN 64 hex karakter.
 *
 * SZŰKEN van megfogalmazva, szándékosan. A csábító `[A-Za-z0-9_-]{32,}` minden hosszú
 * alfanumerikus futamot elnyelne — hosszú URL-szegmenseket, base64-részleteket, hosszú
 * szavakat is. Ha a két implementáció épp egy ilyen mezőben térne el, a helyettesítés
 * ELTAKARNÁ az eltérést: hamis negatív egy olyan eszközben, amelynek egyetlen dolga az
 * eltérések megtalálása. A `token` KULCS értékét amúgy is a `replaceVolatileKeys` kezeli;
 * ez a minta csak a törzsbe ágyazva előforduló tokent fogja meg.
 */
const SESSION_TOKEN = /\b[0-9a-f]{64}\b/g;

/** A futásspecifikus értékek helyettesítése; a `nonce` a fixture-nevek egyedi utótagja. */
function normalize(value, nonce, { sortKeys = false } = {}) {
  const json = JSON.stringify(sortKeys ? canonicalize(value) : value, replaceVolatileKeys);
  if (json === undefined) return json;
  return json
    .split(nonce)
    .join("<nonce>")
    .replace(UUID, "<uuid>")
    .replace(ISO_TS, "<ts>")
    .replace(SESSION_TOKEN, "<token>");
}

/**
 * A kulcsok ábécésorrendbe rendezése, rekurzívan.
 *
 * Miért van rá szükség: a JSON-objektum kulcssorrendje a szabvány szerint nem
 * hordoz jelentést, és egyik kliens sem olvas pozíció alapján. A két
 * implementáció mégis másképp sorrendez (a lowdb a létrehozáskori mezősorrendet
 * őrzi meg — ezért a REFERENCIA is másképp sorrendez egy seed és egy adminként
 * felvett terméknél —, a Jackson pedig az osztály deklarációs sorrendjét
 * követi). Ha ezt nem választanánk szét az adateltéréstől, a valódi különbségek
 * elvesznének a zajban.
 */
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

/** A token értéke sosem hasonlítható; a mező LÉTE viszont igen, ezért nem töröljük. */
function replaceVolatileKeys(key, value) {
  if (key === "token") return "<token>";
  return value;
}

// --- Forgatókönyv ----------------------------------------------------------
//
// A lépések a teljes végpontfelületet érintik (22 végpont). Minden lépés egy
// címkézett válasz; a címke a két futásban azonos, ez a párosítás alapja.

async function runScenario(baseUrl, nonce) {
  const client = createClient(baseUrl);
  const steps = [];
  /** Egy lépés rögzítése. A `note` csak a riportban jelenik meg. */
  const record = (label, res) =>
    steps.push({
      label,
      status: res.status,
      contentType: (res.headers.get("content-type") || "").split(";")[0].trim(),
      body: res.body,
    });

  // --- Üzemeltetés és katalógus (hitelesítés nélkül) ---
  record("GET /api/health", await client.get("/api/health"));
  record("GET /api/products (seed, 1. lap)", await client.get("/api/products"));
  record("GET /api/products?pageSize=500", await client.get("/api/products?pageSize=500"));
  record("GET /api/products?page=99", await client.get("/api/products?page=99"));
  record("GET /api/products/p1", await client.get("/api/products/p1"));
  record("GET /api/products/p1/reviews", await client.get("/api/products/p1/reviews"));
  record("GET /api/products/nincsilyen (404)", await client.get("/api/products/nincsilyen"));
  record(
    "GET /api/products?category=<szóközös>",
    await client.get("/api/products?category=%20Ruh%C3%A1zat%20"),
  );
  record(
    "GET /api/products?minPrice&maxPrice",
    await client.get("/api/products?minPrice=4000&maxPrice=6000"),
  );
  record("GET /api/products?search=PÓLÓ", await client.get("/api/products?search=P%C3%93L%C3%93"));
  record("GET /api/products?inStock=true", await client.get("/api/products?inStock=true"));

  // --- Hitelesítés ---
  const registration = {
    username: `osszevet${nonce}`,
    email: `osszevet${nonce}@example.com`,
    address: "Összevetés u. 1.",
    password: "osszevetes123",
  };
  const registered = await client.post("/api/auth/register", registration);
  record("POST /api/auth/register (201)", registered);
  const customerToken = registered.body?.token;

  record(
    "POST /api/auth/register (rövid név, 400)",
    await client.post("/api/auth/register", { ...registration, username: "rovid" }),
  );
  record(
    "POST /api/auth/register (rossz e-mail, 400)",
    await client.post("/api/auth/register", { ...registration, email: "nem-email" }),
  );
  record(
    "POST /api/auth/register (rövid jelszó, 400)",
    await client.post("/api/auth/register", { ...registration, password: "1234567" }),
  );
  record("POST /api/auth/register (ütköző név, 400)", await client.post("/api/auth/register", registration));
  record("POST /api/auth/register (üres törzs, 400)", await client.post("/api/auth/register", {}));

  const adminLogin = await client.post("/api/auth/login", SEED_ADMIN);
  record("POST /api/auth/login (seed admin, 200)", adminLogin);
  const adminToken = adminLogin.body?.token;
  if (!adminToken) {
    throw new Error(
      `A seed admin bejelentkezése meghiúsult a(z) ${baseUrl} ellen: ${adminLogin.status} ` +
        `${JSON.stringify(adminLogin.body)?.slice(0, 200)}. Ha 429: a bejelentkezési korlát ` +
        "még aktív egy korábbi futásból — tiszta adattároló kell.",
    );
  }

  record(
    "POST /api/auth/login (rossz jelszó, 401)",
    await client.post("/api/auth/login", { ...SEED_ADMIN, password: "rosszjelszo" }),
  );
  record(
    "POST /api/auth/login (ismeretlen név, 401)",
    await client.post("/api/auth/login", { username: "nincsilyenfelhasznalo", password: "akarmi123" }),
  );
  record("GET /api/auth/me (customer)", await client.get("/api/auth/me", { token: customerToken }));
  record("GET /api/auth/me (token nélkül, 401)", await client.get("/api/auth/me"));
  record(
    "GET /api/auth/me (rossz token, 401)",
    await client.get("/api/auth/me", { token: "ervenytelen-token" }),
  );

  // --- Admin katalógus ---
  record("GET /api/admin/products (admin)", await client.get("/api/admin/products", { token: adminToken }));
  record(
    "GET /api/admin/products (customer, 403)",
    await client.get("/api/admin/products", { token: customerToken }),
  );
  record("GET /api/admin/products (token nélkül, 401)", await client.get("/api/admin/products"));
  record(
    "GET /api/admin/products?status=inactive",
    await client.get("/api/admin/products?status=inactive", { token: adminToken }),
  );

  const productPayload = {
    name: `Összevetés ${nonce}`.slice(0, 50),
    description: "Válasz-összehasonlító termék",
    price: 2500,
    stock: 4,
    category: `Osszevetes-${nonce}`,
    imageUrl: "https://example.com/osszevetes.png",
    active: true,
  };
  const created = await client.post("/api/admin/products", productPayload, { token: adminToken });
  record("POST /api/admin/products (201)", created);
  const productId = created.body?.id;

  record(
    "POST /api/admin/products (érvénytelen ár, 400)",
    await client.post("/api/admin/products", { ...productPayload, price: 0 }, { token: adminToken }),
  );
  record(
    "POST /api/admin/products (hiányzó név, 400)",
    await client.post("/api/admin/products", { ...productPayload, name: "" }, { token: adminToken }),
  );
  record(
    "PUT /api/admin/products/{id} (200)",
    await client.put(
      `/api/admin/products/${productId}`,
      { ...productPayload, price: 2600 },
      { token: adminToken },
    ),
  );
  record(
    "PUT /api/admin/products/nincsilyen (404)",
    await client.put("/api/admin/products/nincsilyen", productPayload, { token: adminToken }),
  );
  record(
    "PATCH /api/admin/products/{id}/active (200)",
    await client.patch(`/api/admin/products/${productId}/active`, { active: true }, { token: adminToken }),
  );
  record("GET /api/admin/users (admin)", await client.get("/api/admin/users", { token: adminToken }));

  // --- Rendelés és készlet ---
  const orderBody = (over = {}) => ({
    items: [{ productId, quantity: 2 }],
    customer: { name: "Összevető Elek", email: "osszevet@example.com", address: "Összevetés u. 1." },
    expectedTotal: 2600 * 2,
    ...over,
  });

  record(
    "POST /api/orders (expectedTotal nélkül, 400)",
    await client.post("/api/orders", orderBody({ expectedTotal: undefined }), { token: customerToken }),
  );
  record(
    "POST /api/orders (eltérő expectedTotal, 409)",
    await client.post("/api/orders", orderBody({ expectedTotal: 1 }), { token: customerToken }),
  );
  record(
    "POST /api/orders (fedezethiány, 409)",
    await client.post(
      "/api/orders",
      orderBody({ items: [{ productId, quantity: 99 }], expectedTotal: 2600 * 99 }),
      { token: customerToken },
    ),
  );
  record(
    "POST /api/orders (üres tétellista, 400)",
    await client.post("/api/orders", orderBody({ items: [], expectedTotal: 0 }), { token: customerToken }),
  );
  record(
    "POST /api/orders (token nélkül, 401)",
    await client.post("/api/orders", orderBody()),
  );

  const placed = await client.post("/api/orders", orderBody(), { token: customerToken });
  record("POST /api/orders (201)", placed);
  const orderId = placed.body?.id;

  record("GET /api/orders (customer)", await client.get("/api/orders", { token: customerToken }));
  record("GET /api/products/{id} foglalás után", await client.get(`/api/products/${productId}`));

  record(
    "PATCH /api/admin/orders/{id}/status (érvénytelen érték, 400)",
    await client.patch(
      `/api/admin/orders/${orderId}/status`,
      { status: "nincsilyen" },
      { token: adminToken },
    ),
  );
  record(
    "PATCH /api/admin/orders/{id}/status → delivered (200)",
    await client.patch(
      `/api/admin/orders/${orderId}/status`,
      { status: "delivered" },
      { token: adminToken },
    ),
  );
  record(
    "PATCH /api/admin/orders/{id}/status → pending (409)",
    await client.patch(
      `/api/admin/orders/${orderId}/status`,
      { status: "pending" },
      { token: adminToken },
    ),
  );
  record("GET /api/products/{id} teljesítés után", await client.get(`/api/products/${productId}`));

  // --- Értékelés és moderáció ---
  const reviewBody = { productId, rating: 5, comment: "Összehasonlító értékelés." };
  const review = await client.post("/api/reviews", reviewBody, { token: customerToken });
  record("POST /api/reviews (201)", review);
  const reviewId = review.body?.id;

  record(
    "POST /api/reviews (második, 409)",
    await client.post("/api/reviews", reviewBody, { token: customerToken }),
  );
  record(
    "POST /api/reviews (érvénytelen rating, 400)",
    await client.post("/api/reviews", { ...reviewBody, rating: 9 }, { token: customerToken }),
  );
  record("GET /api/products/{id}/reviews (pending nem publikus)", await client.get(`/api/products/${productId}/reviews`));
  record("GET /api/admin/reviews", await client.get("/api/admin/reviews", { token: adminToken }));
  record(
    "PATCH /api/admin/reviews/{id} → pending (400)",
    await client.patch(`/api/admin/reviews/${reviewId}`, { status: "pending" }, { token: adminToken }),
  );
  record(
    "PATCH /api/admin/reviews/{id} → approved (200)",
    await client.patch(`/api/admin/reviews/${reviewId}`, { status: "approved" }, { token: adminToken }),
  );
  record("GET /api/products/{id}/reviews (approved)", await client.get(`/api/products/${productId}/reviews`));
  record("GET /api/products/{id} értékelés után", await client.get(`/api/products/${productId}`));

  // --- Lezárás: törlés és kijelentkezés ---
  record(
    "DELETE /api/admin/products/{id} (200)",
    await client.del(`/api/admin/products/${productId}`, { token: adminToken }),
  );
  record(
    "DELETE /api/admin/products/nincsilyen (404)",
    await client.del("/api/admin/products/nincsilyen", { token: adminToken }),
  );
  record("POST /api/auth/logout", await client.post("/api/auth/logout", {}, { token: customerToken }));

  return steps;
}

// --- Összevetés ------------------------------------------------------------

function compare(referenceSteps, candidateSteps, nonces) {
  const differences = [];
  const byLabel = new Map(candidateSteps.map((step) => [step.label, step]));

  for (const reference of referenceSteps) {
    const candidate = byLabel.get(reference.label);
    if (!candidate) {
      differences.push({ label: reference.label, field: "lépés", reference: "megvan", candidate: "hiányzik" });
      continue;
    }
    if (reference.status !== candidate.status) {
      differences.push({
        label: reference.label,
        field: "státuszkód",
        reference: reference.status,
        candidate: candidate.status,
      });
    }
    if (reference.contentType !== candidate.contentType) {
      differences.push({
        label: reference.label,
        field: "Content-Type",
        reference: reference.contentType,
        candidate: candidate.contentType,
      });
    }
    const referenceBody = normalize(reference.body, nonces.reference);
    const candidateBody = normalize(candidate.body, nonces.candidate);
    if (referenceBody === candidateBody) continue;

    // Az eltérés SÚLYA a kérdés: ugyanaz az adat más sorrendben, vagy más adat?
    // A kulcssorrend nem szerződés (lásd `canonicalize`), az adat viszont az.
    const sortedReference = normalize(reference.body, nonces.reference, { sortKeys: true });
    const sortedCandidate = normalize(candidate.body, nonces.candidate, { sortKeys: true });
    differences.push({
      label: reference.label,
      field: sortedReference === sortedCandidate ? "kulcssorrend" : "törzs",
      reference: referenceBody,
      candidate: candidateBody,
    });
  }
  return differences;
}

// --- Riport ----------------------------------------------------------------

function report(args, steps, differences) {
  console.log(`Válasz-összehasonlítás · ${steps} lépés`);
  console.log(`  referencia: ${args.reference}`);
  console.log(`  jelölt:     ${args.candidate}\n`);

  if (differences.length === 0) {
    console.log("  ✓ Nincs eltérés: minden lépés státuszkódja, Content-Type-ja és törzse azonos.");
  } else {
    for (const diff of differences) {
      console.log(`  ${diff.field === "kulcssorrend" ? "~" : "✗"} ${diff.label} — ${diff.field}`);
      console.log(`      referencia: ${truncate(diff.reference)}`);
      console.log(`      jelölt:     ${truncate(diff.candidate)}`);
    }
  }

  const cosmetic = differences.filter((diff) => diff.field === "kulcssorrend").length;
  const substantive = differences.length - cosmetic;

  console.log("\n" + "─".repeat(70));
  console.log(`Egyező lépés:  ${steps - new Set(differences.map((d) => d.label)).size} / ${steps}`);
  console.log(`Érdemi eltérés: ${substantive}`);
  console.log(`Kulcssorrend:   ${cosmetic} (~ — nem szerződéses, lásd compare.mjs canonicalize)`);
  return substantive;
}

function truncate(value) {
  const text = String(value);
  return text.length > 400 ? `${text.slice(0, 400)}…` : text;
}

// --- Belépési pont ---------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // KÖZÖS nonce a két futásnak. Csábító lenne futásonként külön nonce-ot adni,
  // de akkor a két adattároló története szétcsúszik: az egyik futás fixture-jei
  // a MÁSIK oldalon nem jönnek létre, és a listázó végpontok (pl.
  // `GET /api/admin/users`) örökre eltérést jelentenének — a nonce-helyettesítés
  // ugyanis csak az AKTUÁLIS futás nonce-át ismeri. Közös nonce mellett a két
  // tároló szimmetrikusan öregszik, a régebbi futások maradékai mindkét oldalon
  // szó szerint ugyanazok.
  //
  // Ára: a két URL nem mutathat UGYANARRA a backendre — a második futás
  // regisztrációja ütközne. Ez nem is értelmes használat.
  const nonce = Date.now().toString(36);
  const nonces = { reference: nonce, candidate: nonce };

  const referenceSteps = await runScenario(args.reference, nonce);
  const candidateSteps = await runScenario(args.candidate, nonce);

  const differences = compare(referenceSteps, candidateSteps, nonces);
  // A kilépési kód CSAK az érdemi eltérésre bukik: a kulcssorrend nem szerződés,
  // egy piros build miatta félrevezetne.
  const substantive = report(args, referenceSteps.length, differences);
  process.exit(substantive === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nA futtató nem tudott végigmenni: ${error.message}`);
  process.exit(2);
});
