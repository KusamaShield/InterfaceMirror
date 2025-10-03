#!/bin/bash
# Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.

rm -rf pkg/ target/ node_modules/ public/pkg/
wasm-pack build --target web
cp -r pkg/ public/
npm install -f
npm run dev
