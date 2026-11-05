# Kimenet — a lánc záró jelentésének sablonja

> A `feature-implement` skill kimenete. A lánc végén, a jelentés megírása előtt kötelező elolvasni.

A skill hivatalos kimenete a **validáló jelentése**. Elé tegyél egy rövid magyar összefoglalót:

```markdown
# Implementáció kész: {feature}

- Spec: `spec/{feature}/` — {egyszerű | összetett}, {N} fájl, {M} kész-kritérium
- Felbontás: {alapértelmezett lánc — nincs `Orchestrator.md` | nincs `Orchestrator.md`, a `*Gazda:*` sorok szerint csomagonként, szekvenciálisan | `docs/orchestration/{feature}/Orchestrator.md` szerint, logika {A | C | D}}
- Futás-azonosító: `{feature}-<ÉÉÉÉHHNN-ÓÓPP>` {| `FUTAS_AZONOSITO`={érték}} — futásjelző törölve: {igen | a `feature-full`-é}
- Delegálások: {N} — {ágakra bontva, pl. kutató 1 · implementáló 2 · e2e 1 · validáló 1}
- Modellek: kutató `{…}` · implementáló `{…}` · e2e `{…}` · validáló `{…}`
- Branch: `feature/{feature}` {megnyitva ebben a futásban | már létezett} · kiinduló commit `{hash}`
- Párhuzamos ágak: az implementálói munkafák `{impl-branch}` {D esetben: `{impl-X-branch}`, `{impl-Y-branch}`, … a merge sorrendjében} + az e2e ág `{e2e-branch}` — merge: {tiszta | ütközés: …}
  {vagy: „nincs kliens-felület, a párhuzamos ág kimaradt"}
- Egyesített fa (4/6.): build {…} · teszt {…} · lint {…} {· `mvn clean test` {…}}
- E2E: {N} szcenárió — {M} zöld / {K} piros, kilépési kód {…} (`npm run e2e -- --tags "@{címke}"`)
- Javító körök száma: N
- Mérleg: X teljesül / Y nem teljesül / Z kétséges
- Módosított fájlok: … (az implementálói ágak és az e2e ág jelentéséből)
- Futási napló: `docs/orchestration/{feature}/Running.md` — {kitöltve | nincs ilyen mappa}
- UI-kiválasztói szerződés: `docs/orchestration/{feature}/UiSelectors.md`
- Záró commit: `{hash}` — {fájllista} {vagy: „a `feature-full` 7. fázisáé"}
- Stack: {a lánc indította, leállítva | már futott, nem nyúltam hozzá}

---

{a validáló teljes jelentése}
```

Ha maradt `[nem teljesül]` pont a körkorlát után, azt **mondd ki nyíltan** — ne jelentsd késznek.
