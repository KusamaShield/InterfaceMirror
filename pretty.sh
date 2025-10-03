#!/bin/bash
# Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.

echo "formating ts"
npx prettier --write src/*.tsx
npx prettier --write src/*/*.ts
echo "done"
