import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth";
import { CartProvider } from "./cart";
import { UiProvider } from "./ui";
import { App } from "./App";
import "./index.css";

// A providerek sorrendje függőség szerint: a kosár kulcsa a belépett
// felhasználóé (CartProvider → useAuth), a UiProvider viszont egyiktől sem függ.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <UiProvider>
        <AuthProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </AuthProvider>
      </UiProvider>
    </BrowserRouter>
  </StrictMode>,
);
