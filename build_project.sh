#!/bin/bash
# Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.

wasm-pack build --target web
npm install -f
echo "run npm run dev"
