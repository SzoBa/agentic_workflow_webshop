// @vitest-environment jsdom
// A ProductReviews komponens (client/src/ProductReviews.tsx) tesztjei.
//
// A komponens két szerződést tart: (1) a listán CSAK az jelenik meg, amit a
// szerver publikusnak adott ki, és a frissen beküldött (moderálatlan) vélemény
// nem kerül közéjük — különben a beküldő azt hinné, hogy már publikus; (2) a
// beküldés jogosultságát a szerver dönti el, ezért a 403/409 hibaüzenetét
// szó szerint meg kell mutatni.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "./dom-setup";
import type { PublicReview, Review, User } from "../src/api";

vi.mock("../src/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/api")>();
  return { ...actual, getProductReviews: vi.fn(), createReview: vi.fn() };
});

// Az auth állapotát közvetlenül állítjuk be: itt a ProductReviews saját
// logikája a tárgy, nem a context működése (azt az auth.test.tsx fedi).
let currentUser: User | null = null;
vi.mock("../src/auth", () => ({ useAuth: () => ({ user: currentUser }) }));

const api = await import("../src/api");
const { ProductReviews } = await import("../src/ProductReviews");

const PRODUCT_ID = "p1";

function review(over: Partial<PublicReview> = {}): PublicReview {
  return {
    id: "r1",
    productId: PRODUCT_ID,
    rating: 5,
    body: "Nagyon jó minőség.",
    status: "approved",
    createdAt: "2026-07-20T10:00:00.000Z",
    updatedAt: "2026-07-20T10:00:00.000Z",
    ...over,
  };
}

const USER: User = {
  id: "u1",
  username: "felhasznalo",
  email: "u@example.com",
  address: "Teszt utca 1",
  role: "customer",
};

const renderReviews = () =>
  render(
    <MemoryRouter>
      <ProductReviews productId={PRODUCT_ID} />
    </MemoryRouter>,
  );

const submit = () =>
  fireEvent.click(screen.getByRole("button", { name: /Értékelés beküldése/ }));

beforeEach(() => {
  currentUser = null;
  vi.mocked(api.getProductReviews).mockReset();
  vi.mocked(api.getProductReviews).mockResolvedValue([]);
  vi.mocked(api.createReview).mockReset();
});

describe("ProductReviews - véleménylista", () => {
  it("a termék azonosítójával kéri le a véleményeket", async () => {
    renderReviews();
    await waitFor(() =>
      expect(api.getProductReviews).toHaveBeenCalledWith(PRODUCT_ID),
    );
  });

  it("kilistázza a publikus véleményeket", async () => {
    vi.mocked(api.getProductReviews).mockResolvedValue([
      review(),
      review({ id: "r2", rating: 3, body: "Elmegy." }),
    ]);
    renderReviews();

    expect(await screen.findByText("Nagyon jó minőség.")).toBeInTheDocument();
    expect(screen.getByText("Elmegy.")).toBeInTheDocument();
  });

  it("szöveg nélküli véleménynél is kiírja a csillagokat", async () => {
    vi.mocked(api.getProductReviews).mockResolvedValue([
      review({ body: undefined, rating: 4 }),
    ]);
    renderReviews();

    expect(
      await screen.findByLabelText("4 csillag az 5-ből"),
    ).toBeInTheDocument();
  });

  it("vélemény nélkül érthető üzenetet ad (nem üres szekciót)", async () => {
    renderReviews();
    expect(
      await screen.findByText("Ehhez a termékhez még nincs közzétett vélemény."),
    ).toBeInTheDocument();
  });

  it("a lista hibáját megmutatja", async () => {
    vi.mocked(api.getProductReviews).mockRejectedValue(
      new Error("Elromlott a szerver"),
    );
    renderReviews();
    expect(
      await screen.findByText(/Elromlott a szerver/),
    ).toBeInTheDocument();
  });
});

describe("ProductReviews - beküldő űrlap", () => {
  it("kijelentkezve nem mutat űrlapot, hanem bejelentkezésre hív", async () => {
    renderReviews();
    await screen.findByText("Ehhez a termékhez még nincs közzétett vélemény.");

    expect(screen.getByRole("link", { name: /Bejelentkezés/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Értékelés beküldése/ }),
    ).not.toBeInTheDocument();
  });

  it("csillag választása nélkül nem küldhető be", async () => {
    currentUser = USER;
    renderReviews();

    expect(
      await screen.findByRole("button", { name: /Értékelés beküldése/ }),
    ).toBeDisabled();
  });

  it("a választott csillagot és a szöveget küldi el", async () => {
    currentUser = USER;
    vi.mocked(api.createReview).mockResolvedValue({} as Review);
    renderReviews();

    fireEvent.click(await screen.findByLabelText(/4 csillag/));
    fireEvent.change(screen.getByLabelText(/Vélemény/), {
      target: { value: "  Jó vétel volt.  " },
    });
    submit();

    await waitFor(() =>
      // A körülvevő szóközöket levágjuk — a szerver is trimmel.
      expect(api.createReview).toHaveBeenCalledWith(
        PRODUCT_ID,
        4,
        "Jó vétel volt.",
      ),
    );
  });

  it("üres szöveg esetén szöveg nélkül küld (a body opcionális)", async () => {
    currentUser = USER;
    vi.mocked(api.createReview).mockResolvedValue({} as Review);
    renderReviews();

    fireEvent.click(await screen.findByLabelText(/5 csillag/));
    submit();

    await waitFor(() =>
      expect(api.createReview).toHaveBeenCalledWith(PRODUCT_ID, 5, undefined),
    );
  });

  it("siker után köszönő üzenetet mutat, de a listát NEM bővíti", async () => {
    // A beküldött vélemény `pending` — moderálásig nem publikus.
    currentUser = USER;
    vi.mocked(api.createReview).mockResolvedValue({} as Review);
    renderReviews();

    fireEvent.click(await screen.findByLabelText(/5 csillag/));
    submit();

    expect(await screen.findByText(/Köszönjük az értékelésed/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Értékelés beküldése/ }),
    ).not.toBeInTheDocument();
    // A lista változatlanul üres marad.
    expect(
      screen.getByText("Ehhez a termékhez még nincs közzétett vélemény."),
    ).toBeInTheDocument();
  });

  it("a szerver elutasításának üzenetét szó szerint kiírja", async () => {
    // 403: nincs kiszállított rendelése a termékre.
    currentUser = USER;
    vi.mocked(api.createReview).mockRejectedValue(
      new Error("Csak olyan terméket értékelhetsz, amelyet már megrendeltél"),
    );
    renderReviews();

    fireEvent.click(await screen.findByLabelText(/3 csillag/));
    submit();

    expect(
      await screen.findByText(/Csak olyan terméket értékelhetsz/),
    ).toBeInTheDocument();
    // A hiba után az űrlap marad, hogy javítható legyen.
    expect(
      screen.getByRole("button", { name: /Értékelés beküldése/ }),
    ).toBeInTheDocument();
  });

  it("beküldés közben tiltja a gombot (nem lehet duplán elküldeni)", async () => {
    currentUser = USER;
    vi.mocked(api.createReview).mockReturnValue(new Promise(() => {}));
    renderReviews();

    fireEvent.click(await screen.findByLabelText(/5 csillag/));
    submit();

    expect(
      await screen.findByRole("button", { name: "Küldés…" }),
    ).toBeDisabled();
  });
});
