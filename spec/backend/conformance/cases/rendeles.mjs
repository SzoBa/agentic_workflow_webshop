// K-20 … K-36 — Rendelés és készlet.
// A ⚙ jelű esetek (K-29, K-30, K-31, K-34) itt NEM szerepelnek: óraállítást
// vagy az ütemező kézi futtatását igénylik, amit a backend HTTP-n nem tesz
// elérhetővé. Lásd a konformancia.md "Használat" szakaszát és a README-t.
import { assert, assertEqual, assertErrorShape, assertStatus } from "../harness.mjs";

/** A vevői adatok minden rendelésnél azonosak — a tesztek nem ezt mérik. */
const VEVO = {
  name: "Konform Elek",
  email: "konform@example.com",
  address: "Konformancia u. 1.",
};

export const cases = [
  {
    id: "K-20",
    title: "A végösszeg a SZERVER áraiból számolódik, a klienstől kapott árat figyelmen kívül hagyva",
    async run({ client, boot }) {
      const product = await boot.createProduct({ price: 1000, stock: 5 });
      const customer = await boot.registerCustomer();

      const res = await client.post(
        "/api/orders",
        {
          // A kliens hamis egységárat küld; a szerver nem hiheti el.
          items: [{ productId: product.id, quantity: 2, unitPrice: 1, price: 1 }],
          customer: VEVO,
          expectedTotal: 2000,
        },
        { token: customer.token },
      );
      assertStatus(res, 201);
      assertEqual(res.body.total, 2000, "A rendelés végösszege");
    },
  },
  {
    id: "K-21",
    title: "Az expectedTotal mező hiánya 400",
    async run({ client, boot }) {
      const product = await boot.createProduct();
      const customer = await boot.registerCustomer();

      const res = await client.post(
        "/api/orders",
        { items: [{ productId: product.id, quantity: 1 }], customer: VEVO },
        { token: customer.token },
      );
      assertStatus(res, 400);
      assertErrorShape(res);
    },
  },
  {
    id: "K-22",
    title: "Az expectedTotal ELTÉRÉSE 409 (nem 400 — a kérés hibátlan, a világ változott)",
    async run({ client, boot }) {
      const product = await boot.createProduct({ price: 1000, stock: 5 });
      const customer = await boot.registerCustomer();

      const res = await client.post(
        "/api/orders",
        { items: [{ productId: product.id, quantity: 1 }], customer: VEVO, expectedTotal: 1 },
        { token: customer.token },
      );
      assertStatus(res, 409);
      assertErrorShape(res);
    },
  },
  {
    id: "K-23",
    title: "Fedezethiánynál 409, az üzenet megnevezi a terméket és az elérhető darabszámot",
    async run({ client, boot }) {
      const product = await boot.createProduct({ stock: 2 });
      const customer = await boot.registerCustomer();

      const res = await boot.placeOrder(customer, [{ product, quantity: 3 }]);
      assertStatus(res, 409);
      assertErrorShape(res);
      assert(
        res.body.error.includes(product.name),
        `A hibaüzenet nem nevezi meg a terméket: ${res.body.error}`,
      );
      assert(
        res.body.error.includes("2"),
        `A hibaüzenet nem közli az elérhető darabszámot: ${res.body.error}`,
      );
    },
  },
  {
    id: "K-24",
    title: "Mind-vagy-semmi: egyetlen fedezetlen tétel az EGÉSZ rendelést elutasítja",
    async run({ client, boot }) {
      const a = await boot.createProduct({ stock: 5 });
      const b = await boot.createProduct({ stock: 0 });
      const customer = await boot.registerCustomer();

      const res = await boot.placeOrder(customer, [
        { product: a, quantity: 1 },
        { product: b, quantity: 1 },
      ]);
      assertStatus(res, 409);

      const orders = await client.get("/api/orders", { token: customer.token });
      assertStatus(orders, 200);
      assertEqual(orders.body.length, 0, "A részlegesen teljesíthető rendelés mégis létrejött");
    },
  },
  {
    id: "K-25",
    title: "A leadás NEM csökkenti a fizikai készletet, csak foglal",
    async run({ client, boot }) {
      const token = await boot.adminToken();
      const product = await boot.createProduct({ stock: 5 });
      const customer = await boot.registerCustomer();
      assertStatus(await boot.placeOrder(customer, [{ product, quantity: 2 }]), 201);

      const res = await client.get(
        `/api/admin/products?search=${encodeURIComponent(product.name)}`,
        { token },
      );
      assertStatus(res, 200);
      const found = res.body.items.find((p) => p.id === product.id);
      assert(found, "A termék nem található az admin listában");
      assertEqual(found.stock, 5, "A stock a leadás után");
    },
  },
  {
    id: "K-26",
    title: "Fedezethiányos teljesítés 409, és a rendelés státusza MARAD pending",
    async run({ client, boot }) {
      const token = await boot.adminToken();
      const product = await boot.createProduct({ stock: 5 });
      const customer = await boot.registerCustomer();
      const placed = await boot.placeOrder(customer, [{ product, quantity: 2 }]);
      assertStatus(placed, 201);

      // A készletet 1-re visszük: a rendelés 2 db-ra szól, tehát nem fedezett.
      assertStatus(
        await client.put(
          `/api/admin/products/${product.id}`,
          { ...product, stock: 1 },
          { token },
        ),
        200,
      );

      const res = await client.patch(
        `/api/admin/orders/${placed.body.id}/status`,
        { status: "delivered" },
        { token },
      );
      assertStatus(res, 409);
      assertErrorShape(res);

      const orders = await client.get("/api/orders", { token: customer.token });
      const order = orders.body.find((o) => o.id === placed.body.id);
      assertEqual(order.status, "pending", "A rendelés státusza a sikertelen teljesítés után");
    },
  },
  {
    id: "K-27",
    title: "A vásárlói termékválasz a stockot ÉS a foglalásokkal csökkentett available-t is közli",
    async run({ client, boot }) {
      const product = await boot.createProduct({ stock: 5 });
      const customer = await boot.registerCustomer();
      assertStatus(await boot.placeOrder(customer, [{ product, quantity: 2 }]), 201);

      const res = await client.get(`/api/products/${product.id}`);
      assertStatus(res, 200);
      assertEqual(res.body.stock, 5, "stock");
      assertEqual(res.body.available, 3, "available");
    },
  },
  {
    id: "K-28",
    title: "A reservedUntil CSAK a pending rendelésen jelenik meg",
    async run({ client, boot }) {
      const product = await boot.createProduct({ stock: 10 });
      const customer = await boot.registerCustomer();

      const pending = await boot.placeOrder(customer, [{ product, quantity: 1 }]);
      assertStatus(pending, 201);
      assert(
        typeof pending.body.reservedUntil === "string",
        "A pending rendelésről hiányzik a reservedUntil",
      );

      const delivered = await boot.deliveredOrder(customer, product);
      assert(
        delivered.reservedUntil === undefined,
        "A delivered rendelésen megjelent a reservedUntil — nincs mit visszaszámolni",
      );
    },
  },
  {
    id: "K-32",
    title: "A felhasználó KIZÁRÓLAG a saját rendeléseit látja",
    async run({ client, boot }) {
      const product = await boot.createProduct({ stock: 10 });
      const egyik = await boot.registerCustomer();
      const masik = await boot.registerCustomer();

      const enyem = await boot.placeOrder(egyik, [{ product, quantity: 1 }]);
      const masike = await boot.placeOrder(masik, [{ product, quantity: 1 }]);
      assertStatus(enyem, 201);
      assertStatus(masike, 201);

      const res = await client.get("/api/orders", { token: egyik.token });
      assertStatus(res, 200);
      const ids = res.body.map((o) => o.id);
      assert(ids.includes(enyem.body.id), "A saját rendelés hiányzik a listából");
      assert(!ids.includes(masike.body.id), "A MÁSIK felhasználó rendelése is látszik");
      assertEqual(ids.length, 1, "A visszaadott rendelések száma");
    },
  },
  {
    id: "K-33",
    title: "Egyidejű fedezethiány és áreltérés esetén a KÉSZLET üzenete megy vissza",
    async run({ client, boot }) {
      const product = await boot.createProduct({ price: 1000, stock: 0 });
      const customer = await boot.registerCustomer();

      const res = await client.post(
        "/api/orders",
        { items: [{ productId: product.id, quantity: 1 }], customer: VEVO, expectedTotal: 1 },
        { token: customer.token },
      );
      assertStatus(res, 409);
      assertErrorShape(res);
      assert(
        res.body.error.includes(product.name),
        `A hibaüzenet nem a készlethiányról szól: ${res.body.error}`,
      );
      assert(
        !/ár/i.test(res.body.error),
        `Az áreltérés üzenete ment vissza a készlethiány helyett: ${res.body.error}`,
      );
    },
  },
  {
    id: "K-35",
    title: "A delivered VÉGÁLLAPOT: onnan pendingre váltani 409",
    async run({ client, boot }) {
      const token = await boot.adminToken();
      const product = await boot.createProduct({ stock: 10 });
      const customer = await boot.registerCustomer();
      const order = await boot.deliveredOrder(customer, product);

      const res = await client.patch(
        `/api/admin/orders/${order.id}/status`,
        { status: "pending" },
        { token },
      );
      assertStatus(res, 409);
      assertErrorShape(res);

      const orders = await client.get("/api/orders", { token: customer.token });
      const found = orders.body.find((o) => o.id === order.id);
      assertEqual(found.status, "delivered", "A rendelés státusza az elutasított visszalépés után");
    },
  },
  {
    id: "K-36",
    title: "A delivered → delivered váltás idempotens: a stock nem csökken újra",
    async run({ client, boot }) {
      const token = await boot.adminToken();
      const product = await boot.createProduct({ stock: 10 });
      const customer = await boot.registerCustomer();
      const order = await boot.deliveredOrder(customer, product, 2);

      async function stockOf() {
        const res = await client.get(
          `/api/admin/products?search=${encodeURIComponent(product.name)}`,
          { token },
        );
        return res.body.items.find((p) => p.id === product.id).stock;
      }

      const elso = await stockOf();
      assertEqual(elso, 8, "A stock az első teljesítés után");

      const res = await client.patch(
        `/api/admin/orders/${order.id}/status`,
        { status: "delivered" },
        { token },
      );
      assertStatus(res, 200);
      assertEqual(await stockOf(), 8, "A stock a megismételt teljesítés után");
    },
  },
];
