/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

import { Buffer } from "buffer";

// Polyfill for the global Buffer object
if (typeof window !== "undefined") {
  (window as any).Buffer = Buffer;
}

import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";

import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
