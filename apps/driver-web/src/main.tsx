import { StrictMode } from "react";
import * as ReactDOMClient from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import App from "./App";
import { registerPwa } from "./pwa";

const container = document.getElementById("root");
if (container) {
  const createRootFn =
    typeof (ReactDOMClient as any).createRoot === "function"
      ? (ReactDOMClient as any).createRoot
      : (ReactDOMClient as any).default?.createRoot;

  if (typeof createRootFn === "function") {
    const root = createRootFn(container);
    root.render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>,
    );
  }
}

registerPwa("Chalo-X Driver");
