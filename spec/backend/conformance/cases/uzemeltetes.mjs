// K-73 … K-78 — Üzemeltetés.
// A K-73 … K-76 ⚙ (hiányzó/hibás e-mail konfiguráció, CORS) környezeti
// beavatkozást igényel, ezért itt nem szerepel.
import { assert, assertEqual, assertStatus, SEED_ADMIN } from "../harness.mjs";

export const cases = [
  {
    id: "K-77",
    title: "Az induló állapot 8 aktív terméket hoz létre",
    // Számérzékeny: bármely korábbi futás termékei elrontanák a 8-as darabszámot.
    cleanStore: true,
    // A futás LEGELSŐ esete: utána már a saját eseteink is vesznek fel terméket.
    order: -20,
    async run({ client }) {
      const res = await client.get("/api/products?pageSize=100");
      assertStatus(res, 200);
      assertEqual(res.body.total, 8, "Az aktív termékek száma az induló állapotban");
      for (const product of res.body.items) {
        assert(product.active !== false, `A(z) ${product.name} termék nem aktív`);
      }
    },
  },
  {
    id: "K-78",
    title: "Az induló állapot bejelentkezhető admin fiókot hoz létre",
    async run({ client }) {
      const res = await client.post("/api/auth/login", SEED_ADMIN);
      assertStatus(res, 200);
      assertEqual(res.body.user.role, "admin", "A seed felhasználó szerepköre");
    },
  },
];
