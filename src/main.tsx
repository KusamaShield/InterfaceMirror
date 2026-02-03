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
import Web3Provider from "./context/Web3Provider";

import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Web3Provider>
      <App />
    </Web3Provider>
  </React.StrictMode>,
);
