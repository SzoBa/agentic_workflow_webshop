// A teszt-váz konfigurációja és az indulás előtti környezet-ellenőrzés.
//
// A váz SZÁNDÉKOSAN nem indít semmit: sem Postgrest, sem backendet, sem Vite-ot.
// Ugyanaz a szerződés, mint a konformancia-futtatóé (spec/backend/conformance/):
// a stacket a fejlesztő indítja (./start.sh vagy .\start.cmd), a futtató pedig
// egy megadott base URL ellen mér. Az indítás logikája egy helyen, a start.sh-ban
// él — ott van megírva a portfoglalás-ellenőrzés, a health-várakozás és a
// folyamatfa-leállítás, ami Windowson a legnehezebb rész.

// A seed admin (requirements.md 8. fejezet) — fejlesztői hitelesítő adat, a
// `docker compose` seed adatbázisáé. Beírva azért lehet, mert a lentebbi
// `hitelesitoAdatHibaja()` gépi garanciát ad rá, hogy csak helyi kiszolgáló ellen
// használhatjuk: egy git-be írt jelszó örökre a gitben marad, tehát a
// biztonságosságát nem szabad egy megjegyzésre bízni.
//
// Nem seedelt (pl. staging) környezethez a két env-változóval írható felül —
// ugyanaz a minta, mint az `E2E_BASE_URL`-nél.
const BEEPITETT_ADMIN = { username: "adminisztrator", password: "admin123" };

export const SEED_ADMIN = {
  username: process.env.E2E_ADMIN_USER ?? BEEPITETT_ADMIN.username,
  password: process.env.E2E_ADMIN_PASSWORD ?? BEEPITETT_ADMIN.password,
};

/** Ahol a beépített fejlesztői hitelesítő adat használata megengedett. */
const HELYI_HOSTOK = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);

const ALAP_BASE_URL = "http://localhost:5173";

/**
 * A futás konfigurációja környezeti változókból.
 *
 * A kapcsolókat a `run.mjs` fordítja át környezeti változókra, mielőtt elindítja
 * a cucumber-js-t — így a horgok (`horgok.mjs`) egyetlen forrásból olvasnak,
 * függetlenül attól, hogy a futás kapcsolóval vagy env-változóval indult.
 */
export function konfiguracio() {
  const baseUrl = (process.env.E2E_BASE_URL ?? ALAP_BASE_URL).replace(/\/+$/, "");
  return {
    baseUrl,
    headed: process.env.E2E_HEADED === "1",
    slowMo: Number(process.env.E2E_SLOWMO ?? 0),
    // Egy lépés időkerete. A Playwright saját várakozásai ennél rövidebbek,
    // így a Cucumber időtúllépése csak akkor üt be, ha tényleg beragadt valami.
    lepesTimeout: Number(process.env.E2E_TIMEOUT ?? 30000),
  };
}

/**
 * A beépített fejlesztői hitelesítő adat őre.
 *
 * A `SEED_ADMIN` jelszava a repóban áll. Ez csak addig ártalmatlan, amíg
 * garantált, hogy soha nem lehet egy VALÓDI környezet jelszava — ezt a garanciát
 * adja ez a függvény, megjegyzés helyett: nem helyi base URL ellen a váz el sem
 * indul, amíg a hitelesítő adatot env-változóval felül nem írják.
 *
 * A `run.mjs` a `--skip-check`-től FÜGGETLENÜL hívja: a stack elérhetősége
 * kényelmi ellenőrzés, ez viszont nem az.
 *
 * @returns {string|null} a hibaüzenet, vagy `null`, ha a hitelesítő adat rendben.
 */
export function hitelesitoAdatHibaja(baseUrl) {
  if (SEED_ADMIN.password !== BEEPITETT_ADMIN.password) return null;

  let host;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    return `A base URL nem értelmezhető: ${baseUrl}`;
  }
  if (HELYI_HOSTOK.has(host)) return null;

  return (
    `A váz a beépített seed admin jelszavával indulna a(z) ${host} ellen.\n` +
    `Ez a hitelesítő adat a repóban áll, ezért CSAK helyi vagy CI-beli seed\n` +
    `adatbázishoz használható. Nem helyi kiszolgálóhoz add meg a sajátodat:\n` +
    `    E2E_ADMIN_USER=...  E2E_ADMIN_PASSWORD=...  npm run e2e -- --base-url ${baseUrl}`
  );
}

/** Egy kérés rövid időkerettel — a környezet-ellenőrzés nem várhat percekig. */
async function probal(url, ms = 5000) {
  const megszakit = AbortSignal.timeout(ms);
  try {
    const res = await fetch(url, { signal: megszakit });
    return { ok: true, status: res.status, contentType: res.headers.get("content-type") ?? "" };
  } catch (hiba) {
    return { ok: false, hiba: hiba.message };
  }
}

/**
 * Fut-e a stack a megadott base URL-en.
 *
 * Két dolgot mér külön, mert a két hiba oka és javítása is más:
 *   1. válaszol-e egyáltalán a base URL (a kiszolgált SPA),
 *   2. válaszol-e az /api/health ugyanazon az origin-en (dev módban ez a Vite
 *      proxy + a backend együtt).
 *
 * Így a hibaüzenet meg tudja mondani, hogy a frontend vagy a backend hiányzik —
 * egy közös "nem érem el" üzenet ezt elfedné.
 *
 * @returns {Promise<string|null>} a hibaüzenet, vagy `null`, ha minden rendben.
 */
export async function kornyezetHibaja(baseUrl) {
  const gyoker = await probal(`${baseUrl}/`);
  if (!gyoker.ok) {
    return (
      `A ${baseUrl} nem válaszol (${gyoker.hiba}).\n` +
      `A teszt-váz nem indítja a stacket — előbb indítsd el:\n` +
      `    .\\start.cmd          (Windows)\n` +
      `    ./start.sh           (Linux / macOS / Git Bash)\n` +
      `Ha a backend a saját portján szolgálja ki a klienst:\n` +
      `    npm run build  &&  npm run e2e -- --base-url http://localhost:3001`
    );
  }

  const health = await probal(`${baseUrl}/api/health`);
  if (!health.ok) {
    return (
      `A ${baseUrl} válaszol, de a ${baseUrl}/api/health nem (${health.hiba}).\n` +
      `A frontend fut, a backend viszont nem — indítsd el:\n` +
      `    cd server-java && docker compose up -d && mvn spring-boot:run\n` +
      `vagy a repó gyökeréből:  ./start.sh --no-client`
    );
  }
  if (health.status !== 200) {
    return (
      `A ${baseUrl}/api/health ${health.status} státusszal válaszolt (200 helyett).\n` +
      `A backend fut, de nem egészséges — nézd meg a naplóját (.run/backend.log).`
    );
  }
  // Dev módban a Vite az ismeretlen útvonalakra is index.html-t ad. Ha az
  // /api/health HTML-lel tér vissza, akkor a proxy nem él: a kérés nem jutott
  // el a backendig. Ezt a 200-as státusz önmagában elfedné.
  if (health.contentType.includes("text/html")) {
    return (
      `A ${baseUrl}/api/health HTML-lel válaszolt, nem JSON-nal.\n` +
      `Ez azt jelenti, hogy az /api kérések nem jutnak el a backendhez — dev módban\n` +
      `a Vite proxyja (client/vite.config.ts) irányítja őket a 3001-es portra.\n` +
      `Fut a backend?  ./start.sh --no-client`
    );
  }
  return null;
}
