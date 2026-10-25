// Vitest konfiguráció a kliens tesztjeihez.
//
// A backend tesztjei NEM itt futnak: a szerveroldal Java/Spring Boot
// (`server-java/`), a tesztjeit a `mvn test` futtatja valódi Postgresszel.
// A két oldal közös mércéje a nyelvfüggetlen konformancia-katalógus
// (`spec/backend/conformance/`), ami kizárólag HTTP-n mér, és egyik
// build-láncra sem támaszkodik.
//
// Ezért tűnt el innen a korábbi `resolve-nodenext-js` plugin is: az a
// Node-backend NodeNext-stílusú, ".js" végű helyi importjait oldotta fel a
// ".ts" párjukra. A kliens Vite-resolverrel fordul, ilyen importja nincs.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Alapértelmezetten node: az api-réteg és a kosár unit tesztjei ilyenek.
    // A komponenstesztek fájlonként kérnek jsdom-ot a
    // `// @vitest-environment jsdom` docblockkal — így a node környezetű
    // tesztek nem fizetik meg a DOM felépítésének árát.
    environment: "node",
    // A .tsx is kell: a komponenstesztek JSX-et tartalmaznak.
    include: ["client/test/**/*.test.{ts,tsx}"],
  },
});
