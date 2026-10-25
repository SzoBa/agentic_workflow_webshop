// K-01 … K-15 — Katalógus.
import {
  assert,
  assertEqual,
  assertErrorShape,
  assertStatus,
  nonce,
} from "../harness.mjs";

export const cases = [
  {
    id: "K-01",
    title: "Az inaktivált termék nincs a vásárlói listában",
    async run({ client, boot }) {
      const token = await boot.adminToken();
      const product = await boot.createProduct();
      assertStatus(
        await client.patch(`/api/admin/products/${product.id}/active`, { active: false }, { token }),
        200,
      );

      const res = await client.get(`/api/products?category=${encodeURIComponent(product.category)}`);
      assertStatus(res, 200);
      assert(
        !res.body.items.some((p) => p.id === product.id),
        "Az inaktivált termék megjelent a vásárlói listában",
      );
    },
  },
  {
    id: "K-02",
    title: "Az inaktivált termék részletes nézete 404",
    async run({ client, boot }) {
      const token = await boot.adminToken();
      const product = await boot.createProduct();
      await client.patch(`/api/admin/products/${product.id}/active`, { active: false }, { token });

      const res = await client.get(`/api/products/${product.id}`);
      assertStatus(res, 404);
      assertErrorShape(res);
    },
  },
  {
    id: "K-03",
    title: "Az inaktivált termék értékelés-listája 404",
    async run({ client, boot }) {
      const token = await boot.adminToken();
      const product = await boot.createProduct();
      await client.patch(`/api/admin/products/${product.id}/active`, { active: false }, { token });

      assertStatus(await client.get(`/api/products/${product.id}/reviews`), 404);
    },
  },
  {
    id: "K-04",
    title: "A nem létező és az inaktivált termék válasza AZONOS (nincs létezés-szivárgás)",
    async run({ client, boot }) {
      const token = await boot.adminToken();
      const product = await boot.createProduct();
      await client.patch(`/api/admin/products/${product.id}/active`, { active: false }, { token });

      const inaktiv = await client.get(`/api/products/${product.id}`);
      const nemletezo = await client.get("/api/products/nemletezik");

      assertStatus(inaktiv, 404);
      assertStatus(nemletezo, 404);
      assertEqual(
        JSON.stringify(nemletezo.body),
        JSON.stringify(inaktiv.body),
        "A két 404 törzse eltér — ez elárulná, hogy a termék létezik-e",
      );
    },
  },
  {
    id: "K-05",
    title: "Alapértelmezett lapméret 12, a lapszám ehhez igazodik",
    // Számérzékeny: 13 aktív termék felvétele után a TELJES aktív halmaznak
    // 13 és 24 közé kell esnie, hogy a totalPages pontosan 2 legyen. Ezt csak
    // tiszta adattárolón lehet garantálni — és csak akkor, ha az eset a
    // K-77 után, de minden más (terméket felvevő) eset ELŐTT fut.
    cleanStore: true,
    order: -10,
    async run({ client, boot }) {
      // A seed 8 aktív terméke mellé 13 → 21 aktív termék, két lap.
      for (let i = 0; i < 13; i += 1) await boot.createProduct();

      const res = await client.get("/api/products");
      assertStatus(res, 200);
      assertEqual(res.body.items.length, 12, "items.length");
      assertEqual(res.body.pageSize, 12, "pageSize");
      assertEqual(res.body.totalPages, 2, "totalPages");
    },
  },
  {
    id: "K-06",
    title: "A túl nagy lapméret 100-ra korlátozódik",
    async run({ client }) {
      const res = await client.get("/api/products?pageSize=500");
      assertStatus(res, 200);
      assertEqual(res.body.pageSize, 100, "pageSize");
    },
  },
  {
    id: "K-07",
    title: "A tartományon túli lapszám az utolsó lapra esik vissza",
    async run({ client }) {
      const res = await client.get("/api/products?page=99");
      assertStatus(res, 200);
      assertEqual(res.body.page, res.body.totalPages, "page");
      assert(res.body.items.length > 0, "Az utolsó lap üres — a felhasználó üres oldalt kapna");
    },
  },
  {
    id: "K-08",
    title: "A kategóriaszűrő levágja a körülvevő szóközöket",
    async run({ client, boot }) {
      // A spec "Otthon" / "Iroda" neveket használ; itt egyedi neveket kell
      // adni, mert a futtató nem üríti az adattárolót (lásd harness/nonce).
      const suffix = nonce();
      const otthon = `Otthon-${suffix}`;
      const iroda = `Iroda-${suffix}`;
      const cel = await boot.createProduct({ category: otthon });
      const masik = await boot.createProduct({ category: iroda });

      const res = await client.get(`/api/products?category=${encodeURIComponent(`  ${otthon}  `)}`);
      assertStatus(res, 200);
      assert(
        res.body.items.some((p) => p.id === cel.id),
        "A szóközökkel körülvett kategórianév nem talált rá a termékre",
      );
      assert(
        !res.body.items.some((p) => p.id === masik.id),
        "A szűrő más kategóriájú terméket is visszaadott",
      );
    },
  },
  {
    id: "K-09",
    title: "Az ársáv mindkét vége INKLUZÍV",
    async run({ client, boot }) {
      const category = `Arsav-${nonce()}`;
      const also = await boot.createProduct({ category, price: 2000 });
      const felso = await boot.createProduct({ category, price: 3000 });
      await boot.createProduct({ category, price: 1000 });

      const res = await client.get(
        `/api/products?minPrice=2000&maxPrice=3000&category=${encodeURIComponent(category)}`,
      );
      assertStatus(res, 200);
      const ids = res.body.items.map((p) => p.id);
      assert(ids.includes(also.id), "A sáv alsó határán lévő termék kimaradt");
      assert(ids.includes(felso.id), "A sáv felső határán lévő termék kimaradt");
      assertEqual(ids.length, 2, "A sávba eső termékek száma");
    },
  },
  {
    id: "K-10",
    title: "A keresés kis-nagybetűtől függetlenül a névben ÉS a leírásban is talál",
    async run({ client, boot }) {
      const kulcs = `Kulacs${nonce()}`;
      const category = `Kereses-${nonce()}`;
      const nevben = await boot.createProduct({ category, name: kulcs.slice(0, 50) });
      const leirasban = await boot.createProduct({
        category,
        description: `Praktikus ${kulcs}os palack`,
      });

      const res = await client.get(
        `/api/products?search=${encodeURIComponent(kulcs.toUpperCase())}`,
      );
      assertStatus(res, 200);
      const ids = res.body.items.map((p) => p.id);
      assert(ids.includes(nevben.id), "A NÉVBEN egyező termék kimaradt a találatokból");
      assert(ids.includes(leirasban.id), "A LEÍRÁSBAN egyező termék kimaradt a találatokból");
    },
  },
  {
    id: "K-11",
    title: "Az inStock szűrő az ELÉRHETŐ mennyiséggel dolgozik, nem a stockkal",
    async run({ client, boot }) {
      const product = await boot.createProduct({ stock: 1 });
      const customer = await boot.registerCustomer();
      assertStatus(await boot.placeOrder(customer, [{ product, quantity: 1 }]), 201);

      const res = await client.get(
        `/api/products?inStock=true&category=${encodeURIComponent(product.category)}`,
      );
      assertStatus(res, 200);
      assert(
        !res.body.items.some((p) => p.id === product.id),
        "A teljesen lefoglalt termék benne maradt az inStock listában (available = 0)",
      );
    },
  },
  {
    id: "K-12",
    title: "A csak inaktív termékeket tartalmazó kategória nincs a categories listában",
    async run({ client, boot }) {
      // A spec "Otthon"-t ír; egyedi név kell, különben a seed kategóriáiba ütköznénk.
      const category = `Otthon-${nonce()}`;
      const token = await boot.adminToken();
      const product = await boot.createProduct({ category });
      assertStatus(
        await client.patch(`/api/admin/products/${product.id}/active`, { active: false }, { token }),
        200,
      );

      const res = await client.get("/api/products");
      assertStatus(res, 200);
      assert(
        !res.body.categories.includes(category),
        `A(z) ${category} kategória megjelent, pedig csak inaktív terméke van`,
      );
    },
  },
  {
    id: "K-13",
    title: "Az értékelési átlag a jóváhagyott értékelésekből, egy tizedesre kerekítve",
    async run({ client, boot }) {
      const token = await boot.adminToken();
      const product = await boot.createProduct({ stock: 10 });

      // Terméken­ként és felhasználón­ként egy értékelés — három külön vevő kell.
      for (const rating of [5, 4, 4]) {
        const customer = await boot.registerCustomer();
        await boot.deliveredOrder(customer, product);
        const created = await client.post(
          "/api/reviews",
          { productId: product.id, rating },
          { token: customer.token },
        );
        assertStatus(created, 201);
        assertStatus(
          await client.patch(
            `/api/admin/reviews/${created.body.id}`,
            { status: "approved" },
            { token },
          ),
          200,
        );
      }

      const res = await client.get(`/api/products/${product.id}`);
      assertStatus(res, 200);
      // (5 + 4 + 4) / 3 = 4.333… → 4.3
      assertEqual(res.body.ratingAvg, 4.3, "ratingAvg");
      assertEqual(res.body.ratingCount, 3, "ratingCount");
    },
  },
  {
    id: "K-14",
    title: "Értékelés nélkül az átlag és a darabszám 0 (nem null, nem hiányzó mező)",
    async run({ client, boot }) {
      const product = await boot.createProduct();
      const res = await client.get(`/api/products/${product.id}`);
      assertStatus(res, 200);
      assertEqual(res.body.ratingAvg, 0, "ratingAvg");
      assertEqual(res.body.ratingCount, 0, "ratingCount");
    },
  },
  {
    id: "K-15",
    title: "Az admin terméklista NEM számol értékelési aggregátumot",
    async run({ client, boot }) {
      const token = await boot.adminToken();
      await boot.createProduct();

      const res = await client.get("/api/admin/products", { token });
      assertStatus(res, 200);
      for (const item of res.body.items) {
        assert(
          !("ratingAvg" in item) && !("ratingCount" in item),
          `Az admin listán megjelent az értékelési aggregátum: ${JSON.stringify(item).slice(0, 120)}`,
        );
      }
    },
  },
];
