// K-60 … K-69 — Értékelés és moderáció.
import { assert, assertEqual, assertErrorShape, assertStatus } from "../harness.mjs";

/** Egy termék + egy vevő, akinek MÁR van teljesített rendelése rá (B-4). */
async function ellenorzottVasarlo(boot) {
  const product = await boot.createProduct({ stock: 10 });
  const customer = await boot.registerCustomer();
  await boot.deliveredOrder(customer, product);
  return { product, customer };
}

export const cases = [
  {
    id: "K-60",
    title: "Teljesített rendelés NÉLKÜL az értékelés 403",
    async run({ client, boot }) {
      const product = await boot.createProduct();
      const customer = await boot.registerCustomer();

      const res = await client.post(
        "/api/reviews",
        { productId: product.id, rating: 5 },
        { token: customer.token },
      );
      assertStatus(res, 403);
      assertErrorShape(res);
    },
  },
  {
    id: "K-61",
    title: "Az új értékelés pending, és a szerzőt a TOKEN dönti el",
    async run({ client, boot }) {
      const { product, customer } = await ellenorzottVasarlo(boot);

      const res = await client.post(
        "/api/reviews",
        // A törzsben küldött `author`-t a szervernek figyelmen kívül kell hagynia.
        { productId: product.id, rating: 5, author: "hamisitott-azonosito" },
        { token: customer.token },
      );
      assertStatus(res, 201);
      assertEqual(res.body.status, "pending", "Az új értékelés státusza");
      assertEqual(res.body.author, customer.user.id, "Az értékelés szerzője");
    },
  },
  {
    id: "K-62",
    title: "Ugyanarra a termékre a második értékelés 409",
    async run({ client, boot }) {
      const { product, customer } = await ellenorzottVasarlo(boot);
      assertStatus(
        await client.post(
          "/api/reviews",
          { productId: product.id, rating: 5 },
          { token: customer.token },
        ),
        201,
      );

      const res = await client.post(
        "/api/reviews",
        { productId: product.id, rating: 4 },
        { token: customer.token },
      );
      assertStatus(res, 409);
      assertErrorShape(res);
    },
  },
  {
    id: "K-63",
    title: "A removed státusz sem nyit utat új értékelésre (a moderáció nem kerülhető meg)",
    async run({ client, boot }) {
      const token = await boot.adminToken();
      const { product, customer } = await ellenorzottVasarlo(boot);
      const created = await client.post(
        "/api/reviews",
        { productId: product.id, rating: 5 },
        { token: customer.token },
      );
      assertStatus(created, 201);
      assertStatus(
        await client.patch(`/api/admin/reviews/${created.body.id}`, { status: "removed" }, { token }),
        200,
      );

      const res = await client.post(
        "/api/reviews",
        { productId: product.id, rating: 1 },
        { token: customer.token },
      );
      assertStatus(res, 409);
      assertErrorShape(res);
    },
  },
  {
    id: "K-64",
    title: "A pending értékelés NEM publikus",
    async run({ client, boot }) {
      const { product, customer } = await ellenorzottVasarlo(boot);
      assertStatus(
        await client.post(
          "/api/reviews",
          { productId: product.id, rating: 5 },
          { token: customer.token },
        ),
        201,
      );

      const res = await client.get(`/api/products/${product.id}/reviews`);
      assertStatus(res, 200);
      assertEqual(res.body.length, 0, "A publikus értékeléslista hossza");
    },
  },
  {
    id: "K-65",
    title: "A publikus listán KIZÁRÓLAG az approved értékelés szerepel",
    async run({ client, boot }) {
      const token = await boot.adminToken();
      const product = await boot.createProduct({ stock: 10 });
      const beadott = {};

      for (const status of ["approved", "rejected", "removed"]) {
        const customer = await boot.registerCustomer();
        await boot.deliveredOrder(customer, product);
        const created = await client.post(
          "/api/reviews",
          { productId: product.id, rating: 4 },
          { token: customer.token },
        );
        assertStatus(created, 201);
        assertStatus(
          await client.patch(`/api/admin/reviews/${created.body.id}`, { status }, { token }),
          200,
        );
        beadott[status] = created.body.id;
      }

      const res = await client.get(`/api/products/${product.id}/reviews`);
      assertStatus(res, 200);
      const ids = res.body.map((r) => r.id);
      assertEqual(ids.length, 1, "A publikus értékelések száma");
      assertEqual(ids[0], beadott.approved, "A publikus értékelés azonosítója");
    },
  },
  {
    id: "K-66",
    title: "A publikus listán a KÉSŐBBI értékelés áll elöl",
    async run({ client, boot }) {
      const token = await boot.adminToken();
      const product = await boot.createProduct({ stock: 10 });
      const sorrend = [];

      for (let i = 0; i < 2; i += 1) {
        const customer = await boot.registerCustomer();
        await boot.deliveredOrder(customer, product);
        const created = await client.post(
          "/api/reviews",
          { productId: product.id, rating: 5 },
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
        sorrend.push(created.body.id);
        // Elkülöníthető createdAt: az ISO időbélyeg ezredmásodperc felbontású.
        if (i === 0) await new Promise((r) => setTimeout(r, 1100));
      }

      const res = await client.get(`/api/products/${product.id}/reviews`);
      assertStatus(res, 200);
      assertEqual(res.body[0].id, sorrend[1], "A lista első eleme (a későbbi értékelésnek kell lennie)");
    },
  },
  {
    id: "K-67",
    title: "A publikus értékelésen NINCS author mező",
    async run({ client, boot }) {
      const token = await boot.adminToken();
      const { product, customer } = await ellenorzottVasarlo(boot);
      const created = await client.post(
        "/api/reviews",
        { productId: product.id, rating: 5 },
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

      const res = await client.get(`/api/products/${product.id}/reviews`);
      assertStatus(res, 200);
      assert(res.body.length > 0, "A publikus lista üres, pedig van jóváhagyott értékelés");
      for (const review of res.body) {
        assert(
          !("author" in review),
          `A publikus értékelésen megjelent az author mező: ${JSON.stringify(review).slice(0, 120)}`,
        );
      }
    },
  },
  {
    id: "K-68",
    title: "A moderáció NEM állíthat vissza pendingre",
    async run({ client, boot }) {
      const token = await boot.adminToken();
      const { product, customer } = await ellenorzottVasarlo(boot);
      const created = await client.post(
        "/api/reviews",
        { productId: product.id, rating: 5 },
        { token: customer.token },
      );
      assertStatus(created, 201);

      const res = await client.patch(
        `/api/admin/reviews/${created.body.id}`,
        { status: "pending" },
        { token },
      );
      assertStatus(res, 400);
      assertErrorShape(res);
    },
  },
  {
    id: "K-69",
    title: "A moderáció frissíti az updatedAt-et, a createdAt-et NEM",
    async run({ client, boot }) {
      const token = await boot.adminToken();
      const { product, customer } = await ellenorzottVasarlo(boot);
      const created = await client.post(
        "/api/reviews",
        { productId: product.id, rating: 5 },
        { token: customer.token },
      );
      assertStatus(created, 201);
      await new Promise((r) => setTimeout(r, 1100));

      const res = await client.patch(
        `/api/admin/reviews/${created.body.id}`,
        { status: "approved" },
        { token },
      );
      assertStatus(res, 200);
      assertEqual(res.body.createdAt, created.body.createdAt, "createdAt (nem változhat)");
      assert(
        res.body.updatedAt !== created.body.updatedAt,
        "Az updatedAt nem változott a moderációs lépéstől",
      );
    },
  },
];
