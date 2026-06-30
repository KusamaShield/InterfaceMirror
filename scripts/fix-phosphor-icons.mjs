/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Fix @phosphor-icons/webcomponents for npm (non-pnpm) installs.
 * After npm install, the bundled .mjs icon files reference internal .pnpm store
 * paths that are missing files, and the appkit-ui references some icons not
 * present in v2.1.5.
 *
 * Run after every `npm install`:
 *   node scripts/fix-phosphor-icons.mjs
 */

import { existsSync, mkdirSync, copyFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PHOSPHOR_DIR = resolve(
  __dirname,
  "..",
  "node_modules",
  "@phosphor-icons",
  "webcomponents",
);
const PNPM_DIR = resolve(PHOSPHOR_DIR, "dist", "node_modules", ".pnpm");
const ICONS_DIR = resolve(PHOSPHOR_DIR, "dist", "icons");

const MISSING_ICONS = [
  "PhSealCheck",
  "PhSignOut",
  "PhSpinner",
  "PhTrash",
  "PhVault",
  "PhWallet",
  "PhWarning",
  "PhWarningCircle",
  "PhX",
  "PhUser",
];

// Maps missing lit files: [pnpm relative path, source from top-level node_modules]
const MISSING_LIT_FILES = [
  [
    "@lit_reactive-element@2.0.4/node_modules/@lit/reactive-element/reactive-element.mjs",
    "@lit/reactive-element/reactive-element.js",
  ],
  [
    "@lit_reactive-element@2.0.4/node_modules/@lit/reactive-element/reactive-element.js",
    "@lit/reactive-element/reactive-element.js",
  ],
  [
    "@lit_reactive-element@2.0.4/node_modules/@lit/reactive-element/css-tag.js",
    "@lit/reactive-element/css-tag.js",
  ],
  [
    "@lit_reactive-element@2.0.4/node_modules/@lit/reactive-element/decorators/property.mjs",
    "@lit/reactive-element/decorators/property.js",
  ],
  [
    "@lit_reactive-element@2.0.4/node_modules/@lit/reactive-element/decorators/property.js",
    "@lit/reactive-element/decorators/property.js",
  ],
];

const missingIcons = MISSING_ICONS.filter(
  (icon) => !existsSync(resolve(ICONS_DIR, `${icon}.mjs`)),
);

if (missingIcons.length > 0) {
  // Pick any existing icon as a template stub
  const existingIcons = MISSING_ICONS.filter((icon) =>
    existsSync(resolve(ICONS_DIR, `${icon}.mjs`)),
  );
  const template = existingIcons[0]; // use first already-existing stub
  const srcFile = resolve(ICONS_DIR, `${template}.mjs`);

  if (!existsSync(srcFile)) {
    // Fallback: find any real icon file
    const { readdirSync } = await import("fs");
    const all = readdirSync(ICONS_DIR).filter((f) => f.endsWith(".mjs"));
    if (all.length === 0) {
      console.error(
        "No icon files found in @phosphor-icons/webcomponents - cannot create stubs",
      );
      process.exit(1);
    }
    const anyIcon = resolve(ICONS_DIR, all[0]);
    missingIcons.forEach((icon) => {
      copyFileSync(anyIcon, resolve(ICONS_DIR, `${icon}.mjs`));
      console.log(`  Created stub: ${icon}.mjs`);
    });
  } else {
    missingIcons.forEach((icon) => {
      copyFileSync(srcFile, resolve(ICONS_DIR, `${icon}.mjs`));
      console.log(`  Created stub: ${icon}.mjs`);
    });
  }
} else {
  console.log("  All icon stubs already exist");
}

// Fix missing lit files in the .pnpm store
for (const [relPath, sourceRelPath] of MISSING_LIT_FILES) {
  const target = resolve(PNPM_DIR, relPath);
  if (!existsSync(target)) {
    const source = resolve(
      __dirname,
      "..",
      "node_modules",
      sourceRelPath,
    );
    if (!existsSync(source)) {
      console.warn(`  Source not found: ${sourceRelPath}`);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    console.log(`  Copied: ${sourceRelPath} → ${relPath}`);
  }
}

console.log("Done - @phosphor-icons patched for npm");
