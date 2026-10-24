/* eslint-disable react-refresh/only-export-components -- application entry point with a lazy offline preview */
import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import BuyerErrorBoundary from "./BuyerErrorBoundary.tsx";
import BackendApp from "./BackendApp.tsx";
import "./index.css";
const MockApp = lazy(() => import("./App.tsx"));
const url = import.meta.env.VITE_CONVEX_URL;
const client = url ? new ConvexReactClient(url) : null;
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {location.pathname === "/mock" ? (
      <Suspense fallback={<p>Loading the explicit offline mock…</p>}>
        <MockApp />
      </Suspense>
    ) : client ? (
      <ConvexAuthProvider client={client}>
        <BuyerErrorBoundary>
          <BackendApp />
        </BuyerErrorBoundary>
      </ConvexAuthProvider>
    ) : (
      <div style={{ padding: 40 }}>
        <h1>Connect the buyer backend</h1>
        <p>
          Run Convex locally and restart Vite with VITE_CONVEX_URL configured.
          See the repository setup instructions.
        </p>
        <a href="/mock">Open the offline mock</a>
      </div>
    )}
  </StrictMode>,
);
