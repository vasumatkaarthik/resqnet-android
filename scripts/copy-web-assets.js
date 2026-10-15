"use strict";

const { mkdir, copyFile } = require("node:fs/promises");
const path = require("node:path");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "..");
const webDir = path.join(root, "www");
const assets = ["index.html", "app.js", "styles.css", "manifest.webmanifest", "sw.js", "icons/resqnet.svg"];

async function copyWebAssets() {
  await mkdir(webDir, { recursive: true });
  await Promise.all(assets.map(async asset => {
    const destination = path.join(webDir, asset);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(root, asset), destination);
  }));
  await esbuild.build({
    entryPoints: [path.join(root, "scripts", "geolocation-bridge.js")],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2020",
    outfile: path.join(webDir, "geolocation-bridge.js")
  });
  console.log(`Copied ${assets.length} web assets to www/.`);
}

copyWebAssets().catch(error => {
  console.error(`Could not prepare Android web assets: ${error.message}`);
  process.exitCode = 1;
});
