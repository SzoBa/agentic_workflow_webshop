// K-40 … K-55 — Felhasználók és hitelesítés.
// A ⚙ jelű esetek (K-47 párhuzamos regisztráció, K-52 újraindítás,
// K-53/K-54 token-élettartam) itt nem szerepelnek.
import {
  assert,
  assertEqual,
  assertErrorShape,
  assertStatus,
  nonce,
  SEED_ADMIN,
} from "../harness.mjs";

/** Érvényes regisztrációs törzs, amelyből az esetek egy-egy mezőt rontanak el. */
function ervenyesRegisztracio(over = {}) {
  const id = nonce();
  return {
    username: `konform-${id}`,
    email: `konform-${id}@example.com`,
    address: "Konformancia u. 1.",
    password: "konformancia123",
    ...over,
  };
}

/** A négy validációs eset (K-40…K-44) ugyanaz a minta, más elrontott mezővel. */
function validaciosEset(id, title, over) {
  return {
    id,
    title,
    async run({ client }) {
      const res = await client.post("/api/auth/register", ervenyesRegisztracio(over));
      assertStatus(res, 400);
      assertErrorShape(res);
    },
  };
}

export const cases = [
  validaciosEset("K-40", "A 8 karakternél rövidebb felhasználónév 400", { username: "rovid" }),
  validaciosEset("K-41", "Az 51 karakteres felhasználónév 400", { username: "a".repeat(51) }),
  validaciosEset("K-42", "Az érvénytelen e-mail cím 400", { email: "nem-email" }),
  validaciosEset("K-43", "A csak szóközből álló cím 400", { address: "   " }),
  validaciosEset("K-44", "A 7 karakteres jelszó 400", { password: "1234567" }),
  {
    id: "K-45",
    title: "Az admin szerkesztés UGYANAZT a névszabályt alkalmazza, mint a regisztráció",
    async run({ client, boot }) {
      const token = await boot.adminToken();
      const customer = await boot.registerCustomer();

      const res = await client.put(
        `/api/admin/users/${customer.user.id}`,
        { username: "rovid", email: customer.user.email, address: customer.user.address },
        { token },
      );
      assertStatus(res, 400);
      assertErrorShape(res);
    },
  },
  {
    id: "K-46",
    title: "A felhasználónév egyedisége kis-nagybetűtől független",
    async run({ client }) {
      const nev = `Teszt.Elek.${nonce()}`;
      assertStatus(
        await client.post("/api/auth/register", ervenyesRegisztracio({ username: nev })),
        201,
      );

      const res = await client.post(
        "/api/auth/register",
        ervenyesRegisztracio({ username: nev.toLowerCase() }),
      );
      assertStatus(res, 400);
      assertErrorShape(res);
    },
  },
  {
    id: "K-48",
    title: "Az UTOLSÓ admin nem törölhető",
    // Csak akkor értelmes, ha a seed admin tényleg az egyetlen admin.
    cleanStore: true,
    async run({ client, boot }) {
      const token = await boot.adminToken();
      const users = await client.get("/api/admin/users", { token });
      assertStatus(users, 200);
      const adminok = users.body.filter((u) => u.role === "admin");
      assertEqual(adminok.length, 1, "Az adminok száma (az eset egyetlen adminra épül)");

      const res = await client.del(`/api/admin/users/${adminok[0].id}`, { token });
      assertStatus(res, 400);
      assertErrorShape(res);

      const utana = await client.get("/api/admin/users", { token });
      assert(
        utana.body.some((u) => u.id === adminok[0].id),
        "Az utolsó admin mégis törlődött",
      );
    },
  },
  {
    id: "K-49",
    title: "Az UTOLSÓ admin nem fokozható le customerré",
    cleanStore: true,
    async run({ client, boot }) {
      const token = await boot.adminToken();
      const users = await client.get("/api/admin/users", { token });
      const adminok = users.body.filter((u) => u.role === "admin");
      assertEqual(adminok.length, 1, "Az adminok száma (az eset egyetlen adminra épül)");
      const admin = adminok[0];

      const res = await client.put(
        `/api/admin/users/${admin.id}`,
        { username: admin.username, email: admin.email, address: admin.address, role: "customer" },
        { token },
      );
      assertStatus(res, 400);
      assertErrorShape(res);

      const utana = await client.get("/api/admin/users", { token });
      assertEqual(
        utana.body.find((u) => u.id === admin.id).role,
        "admin",
        "Az utolsó admin szerepköre",
      );
    },
  },
  {
    id: "K-55",
    title: "Egyetlen válasz sem szivárogtat jelszóhasht, sót vagy idegen tokent",
    async run({ client, boot }) {
      const token = await boot.adminToken();
      const customer = await boot.registerCustomer();

      const valaszok = [
        await client.get("/api/auth/me", { token: customer.token }),
        await client.get("/api/admin/users", { token }),
        await client.post("/api/auth/register", ervenyesRegisztracio()),
      ];

      const tiltott = ["passwordHash", "passwordSalt", "password"];
      for (const res of valaszok) {
        const nyers = res.raw;
        for (const mezo of tiltott) {
          assert(
            !nyers.includes(mezo),
            `A(z) ${res.request} válasza tartalmazza a(z) "${mezo}" mezőt`,
          );
        }
        assert(
          !nyers.includes(customer.token) || res.request.startsWith("POST /api/auth/register"),
          `A(z) ${res.request} válasza kiadta egy másik felhasználó tokenjét`,
        );
      }
    },
  },
  {
    id: "K-50",
    title: "Az ismeretlen név és a rossz jelszó AZONOS 401-et ad (nincs fióklétezés-szivárgás)",
    // A rate limit vödrét fogyasztja, ezért a futás végén fut (lásd K-51).
    order: 10,
    rateLimit: true,
    async run({ client }) {
      const ismeretlen = await client.post("/api/auth/login", {
        username: `nincs-ilyen-${nonce()}`,
        password: "konformancia123",
      });
      const rosszJelszo = await client.post("/api/auth/login", {
        username: SEED_ADMIN.username,
        password: "biztosan-rossz-jelszo",
      });

      assertStatus(ismeretlen, 401);
      assertStatus(rosszJelszo, 401);
      assertEqual(
        JSON.stringify(rosszJelszo.body),
        JSON.stringify(ismeretlen.body),
        "A két 401 törzse eltér — ebből kiderülne, létezik-e a fiók",
      );
      // A válaszidők érdemi egyezését a spec is kéri, de statisztikailag
      // értelmes méréshez sok minta kellene — az pedig a rate limitbe futna
      // (K-51). Itt csak tájékoztatásul jelezzük a két mintát.
      return `válaszidők: ismeretlen ${ismeretlen.ms} ms · rossz jelszó ${rosszJelszo.ms} ms`;
    },
  },
  {
    id: "K-51",
    title: "10 sikertelen bejelentkezés után a 11. kérés 429",
    // FIGYELEM: ez az eset 15 percre kizárja a futtató IP-címét a
    // bejelentkezésből. Ezért fut LEGUTOLJÁRA, és ezért van --skip-rate-limit.
    order: 20,
    rateLimit: true,
    async run({ client }) {
      const username = `nincs-ilyen-${nonce()}`;
      let utolso = null;
      for (let i = 0; i < 11; i += 1) {
        utolso = await client.post("/api/auth/login", { username, password: "rossz-jelszo" });
      }
      assertStatus(utolso, 429);
      assertErrorShape(utolso);
    },
  },
];
