// Közös beállítás a jsdom-ban futó komponenstesztekhez.
//
// Használat: a komponens-tesztfájl tetején `// @vitest-environment jsdom`
// docblock, majd `import "./dom-setup"`. Azért import és nem globális
// setupFile, hogy a szerver oldali (node környezetű) tesztek ne kapják meg
// feleslegesen a DOM matcher-eket.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  // A vi.spyOn egy MÁR kikémlelt metódusra a meglévő mockot adja vissza, a
  // korábbi hívásaival együtt. Visszaállítás nélkül tehát egy window.confirm
  // spy hívásszáma átszivárogna a következő tesztbe, és a fájlok sorrendje
  // döntené el, melyik bukik el.
  vi.restoreAllMocks();
  // A React fa leszerelése: enélkül az előző teszt DOM-ja bennmaradna, és a
  // screen lekérdezések több találatot adnának ("found multiple elements").
  cleanup();
  // A localStorage jsdom-ban a fájl összes tesztje között OSZTOTT állapot —
  // takarítás nélkül a kosár/auth tesztek sorrendfüggővé válnának.
  localStorage.clear();
});
