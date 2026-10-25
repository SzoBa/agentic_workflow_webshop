// K-70 … K-72 — Jogosultság és hibakezelés.
// A K-72 ⚙ (hibainjektálás egy kéréskezelési útvonalon) nem futtatható tisztán
// HTTP-n keresztül, ezért itt nem szerepel.
import { ADMIN_ENDPOINTS, assertErrorShape, assertStatus } from "../harness.mjs";

export const cases = [
  {
    id: "K-70",
    title: "MINDEN /api/admin/* végpont 401 token nélkül",
    async run({ client }) {
      for (const [method, path] of ADMIN_ENDPOINTS) {
        const res = await client.request(method, path, { body: {} });
        assertStatus(res, 401, `${method} ${path} (token nélkül)`);
        assertErrorShape(res);
      }
      return `${ADMIN_ENDPOINTS.length} admin végpont ellenőrizve`;
    },
  },
  {
    id: "K-71",
    title: "MINDEN /api/admin/* végpont 403 customer tokennel",
    async run({ client, boot }) {
      const customer = await boot.registerCustomer();
      for (const [method, path] of ADMIN_ENDPOINTS) {
        const res = await client.request(method, path, { token: customer.token, body: {} });
        assertStatus(res, 403, `${method} ${path} (customer tokennel)`);
        assertErrorShape(res);
      }
      return `${ADMIN_ENDPOINTS.length} admin végpont ellenőrizve`;
    },
  },
];
