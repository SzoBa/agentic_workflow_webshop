// HTTP-kliens az előfeltételek felépítéséhez.
//
// Miért van erre szükség egy böngészős vázban: az előfeltételeket NEM a felületen
// keresztül kattintjuk össze. Egy "adott egy raktáron lévő termék" lépés
// admin-bejelentkezésből, termékfelvitelből és mentésből állna a felületen — tíz
// másodperc és öt olyan képernyő, aminek a szcenárióhoz semmi köze, és ami minden
// más szcenáriót is elbuktat, ha elromlik. API-n keresztül ugyanez egy kérés.
//
// A felület akkor és csak akkor jön képbe, amikor a szcenárió TÁRGYA a felület.

/** Best-effort JSON. Nem dob: a nem-JSON válasz `null`-ként jut el a hívóhoz. */
function jsonVagyNull(text) {
  if (text === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Egyszerű HTTP-kliens. A válasz törzsét best-effort JSON-ként olvassa: egy
 * nem-JSON válasz nem dob, hanem `body: null`-lal jut el a hívóhoz, így a
 * "nem is JSON-nal válaszolt" hiba ott derül ki, ahol értelmezni lehet — a
 * nyers szöveg ilyenkor is megvan a `raw` mezőben.
 */
export function createClient(baseUrl) {
  const root = baseUrl.replace(/\/+$/, "");

  async function request(method, path, { token, body, headers = {} } = {}) {
    const kuldhetoTorzs = body !== undefined && method !== "GET" && method !== "HEAD";
    const res = await fetch(`${root}${path}`, {
      method,
      headers: {
        ...(kuldhetoTorzs ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: kuldhetoTorzs ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: jsonVagyNull(text), raw: text, request: `${method} ${path}` };
  }

  return {
    request,
    get: (path, opts) => request("GET", path, opts),
    post: (path, body, opts) => request("POST", path, { ...opts, body }),
    put: (path, body, opts) => request("PUT", path, { ...opts, body }),
    patch: (path, body, opts) => request("PATCH", path, { ...opts, body }),
    del: (path, opts) => request("DELETE", path, opts),
  };
}

/** Kérés-hiba, ami a válasz státuszát és törzsét is elmondja. */
export class ApiError extends Error {
  constructor(res, mit) {
    super(`${mit} meghiúsult: ${res.request} → ${res.status} ${JSON.stringify(res.body)?.slice(0, 200)}`);
    this.name = "ApiError";
    this.res = res;
  }
}

export function elvarStatusz(res, vart, mit) {
  if (res.status !== vart) throw new ApiError(res, mit);
  return res.body;
}
