import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import BuyerApp from "./BuyerApp.tsx";
import "./index.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BuyerApp />
  </StrictMode>,
);
