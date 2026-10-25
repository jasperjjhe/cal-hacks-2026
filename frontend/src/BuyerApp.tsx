import { lazy, Suspense } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import BuyerErrorBoundary from "./BuyerErrorBoundary.tsx";
import BackendApp from "./BackendApp.tsx";
const MockApp = lazy(() => import("./App.tsx"));
const url = import.meta.env.VITE_CONVEX_URL;
const client = url ? new ConvexReactClient(url) : null;
export default function BuyerApp() {
  return (
    <>
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
    </>
  );
}
