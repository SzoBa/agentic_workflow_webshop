// ESLint (flat config) — CSAK a JS/TS oldalt lintel: a `client/` workspace-t és
// a repóban lévő Node-szkripteket. A `server-java/` Maven modulhoz semmi köze,
// ahogy az npm lánc egészének sem.
//
// Típusinformációt igénylő szabályok (`recommended-type-checked`) SZÁNDÉKOSAN
// nincsenek bekapcsolva: a típushibákat a `tsc --noEmit` fogja meg (a CI lint
// jobja azt is futtatja), így a lint gyors marad és nem duplikálja a fordítót.
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "client/dist/**",
      "server-java/**",
      ".scratch/**",
      ".claude/worktrees/**",
      ".run/**",
      "e2e/reports/**",
    ],
  },

  // --- Kliens: React + TypeScript ---
  {
    files: ["client/src/**/*.{ts,tsx}", "client/test/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // A tsconfig ES2020-ra fordít, ezért az ES2022-es kényelmi metódusok
      // (Array#at, Object.hasOwn, String#replaceAll, .findLast) elhasalnak a
      // buildben. A tsc ezt már jelzi; ez a szabály a szerkesztőben is korán szól.
      "no-restricted-properties": [
        "error",
        { object: "Object", property: "hasOwn", message: "ES2020 cél: használj Object.prototype.hasOwnProperty.call()-t." },
      ],
      // A nem használt függvényargumentum gyakran szándékos (aláhúzás-előtag),
      // a nem használt változó viszont majdnem mindig maradék.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],

      // --- Szándékosan kikapcsolt szabályok ---

      // DEFERRED — a többi kikapcsolással ellentétben ez NEM a projekt egy tényét
      // rögzíti (mint az ES2020-cél vagy a conformance-szignatúra), hanem elhalasztott
      // adósság: a szabály elvben ránk is érvényes, csak most drágább betartani.
      //
      // A react-hooks 7 új, React Compiler-ihlette szabálya. A repó minden
      // adatlekérő effektje a `setLoading(true); fetch().then(...)` mintát
      // követi, ami itt helyes: a betöltésjelzőt épp az effektus indítja el.
      // A szabály betartása 7 komponens átírását kívánná — az nem lint-kérdés.
      //
      // Visszakapcsolás feltétele: a 7 komponens adatlekérése átkerül egy közös
      // hookba (pl. `useFetch`), ahol a betöltésállapot nem effektusban, hanem a
      // lekérés indításakor áll be. Onnantól ez a sor törölhető — ha nem az,
      // akkor a szabály valódi találatot rejt, nem stílusvitát.
      "react-hooks/set-state-in-effect": "off",

      // A "később úgyis felülírjuk" típusú kezdőértéket olvashatósági okból
      // meghagyjuk (pl. `let totalPages = 1` a lapozó ciklusban).
      "no-useless-assignment": "off",
    },
  },

  // A tesztek Vitest-globálisokat nem használnak (mindent importálnak), de
  // jsdom környezetben futnak és Node-oldali segédeket is hívnak.
  {
    files: ["client/test/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },

  // --- Node-szkriptek: konformancia-futtató és a build-konfigurációk ---
  {
    files: ["spec/backend/conformance/**/*.mjs", "*.config.ts", "client/*.config.ts"],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: "module",
    },
    rules: {
      // A konformancia-esetek futtató-szignatúrája a katalógus szerződése
      // (`async run({ client, boot })` vagy `async run({ client })`): a destrukturált
      // argumentum nem maradék kód, akkor sem, ha egy eset nem használja. Ezért az
      // argumentumok itt nincsenek ellenőrizve; a nem használt VÁLTOZÓ viszont
      // továbbra is hiba.
      "no-unused-vars": ["error", { args: "none" }],
      "no-useless-assignment": "off",
    },
  },

  // --- E2E teszt-váz: Cucumber + Playwright, sima ESM JavaScript ---
  //
  // Külön blokk, nem a fenti Node-szkriptekhez csapva: ott az `args: "none"` a
  // konformancia-esetek FIX szignatúrája miatt kell, itt viszont a nem használt
  // lépés-argumentum valódi maradék — hadd szóljon érte a linter.
  //
  // A `page.evaluate` / `addInitScript` visszahívásai a BÖNGÉSZŐBEN futnak, nem
  // Node-ban, ezért a böngésző-globálisok is kellenek.
  {
    files: ["e2e/**/*.mjs"],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  // --- A .claude/ gépi fele és a regressziós tesztjei ---
  //
  // A hookok (spec-guard, a két mérő) a lánc biztonsági és költségkapui: egy
  // elgépelt változónév bennük nem lint-hiba, hanem egy némán kieső őr. Ezért
  // ugyanaz a recommended szabálykészlet fut rájuk, mint a többi Node-szkriptre.
  {
    files: [".claude/hooks/**/*.mjs", ".claude/skills/**/scripts/**/*.mjs", "test/hooks/**/*.mjs"],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      // Ugyanaz a döntés, mint a kliensnél: a „később úgyis felülírjuk” kezdőérték marad.
      "no-useless-assignment": "off",
    },
  },
);
