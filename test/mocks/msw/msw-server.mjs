/**
 * MSW `setupServer` a Node oldali tesztekhez.
 *
 * Használat (Vitest / node:test):
 *
 *   import { twinServer, twin } from './msw-server.mjs';
 *   before(() => twinServer.listen({ onUnhandledRequest: 'error' }));
 *   beforeEach(() => twin.reset());
 *   after(() => twinServer.close());
 *
 * A `onUnhandledRequest: 'error'` szándékos ajánlás: ha a kód olyan Google-végpontot
 * hív, amit az iker nem fed le, azt hibaként akarod látni, nem valódi hálózatként.
 */

import { setupServer } from 'msw/node';
import { createGmailTwinHandlers } from './handlers.mjs';

/**
 * @param {object} [options] – lásd `createGmailTwinHandlers`.
 */
export function setupGmailTwin(options = {}) {
  const { handlers, twin } = createGmailTwinHandlers(options);
  return { server: setupServer(...handlers), twin };
}

// Alapértelmezett példány. Tesztben inkább a `setupGmailTwin()`-t hívd saját
// seeddel: attól lesz a futás reprodukálható és a párhuzamos fájlok függetlenek.
const _default = setupGmailTwin();
export const twinServer = _default.server;
export const twin = _default.twin;
