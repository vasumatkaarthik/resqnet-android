"use strict";

const { createServer } = require("node:http");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 5500;
const HOST = process.env.HOST || "127.0.0.1";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const ROOT = __dirname;
const MAX_BODY_BYTES = 16_000;
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 1_500;
const CONTENT_TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8", ".svg": "image/svg+xml" };
const ALLOWED_ORIGINS = new Set([
  "https://localhost",
  "capacitor://localhost",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  ...(process.env.CAPACITOR_ALLOWED_ORIGINS || "").split(",").map(origin => origin.trim()).filter(Boolean)
]);
const SYSTEM_PROMPT = "You are RESQNET's AI-assisted emergency waiting guide. Be calm, concise, and practical. This is a prototype and you cannot call emergency services, access location, dispatch responders, track teams, or know whether help is coming. For immediate danger, tell the user to contact their local emergency number now; 112 is the emergency number in India. Do not assume the user is in India. Offer general, low-risk safety steps only, not diagnosis or treatment plans. For medical emergencies, encourage following the emergency operator's instructions. Never suggest entering a dangerous area, moving an injured person unless there is immediate danger, or taking avoidable risks. Ask one short question if needed to understand the immediate safety situation. Reply in the language the user uses when possible. Do not claim to have contacted anyone.";

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Request is too large."), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Invalid JSON request."), { status: 400 });
  }
}

async function handleChat(request, response) {
  if (!process.env.GOOGLE_API_KEY) {
    sendJson(response, 503, { error: "Gemini is not configured. Set GOOGLE_API_KEY and restart the server." });
    return;
  }
  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    sendJson(response, error.status || 400, { error: error.message });
    return;
  }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
  const validMessages = messages
    .filter(message => message && ["user", "assistant"].includes(message.role) && typeof message.content === "string")
    .map(message => ({ role: message.role, content: message.content.trim().slice(0, MAX_MESSAGE_CHARS) }))
    .filter(message => message.content);
  if (!validMessages.length || validMessages[validMessages.length - 1].role !== "user") {
    sendJson(response, 400, { error: "Send a message to start the chat." });
    return;
  }

  try {
    const contents = validMessages.map(message => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }]
    }));
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": process.env.GOOGLE_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { maxOutputTokens: 350 }
      }),
      signal: AbortSignal.timeout(25_000)
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error(`Gemini returned HTTP ${upstream.status}.`);
      sendJson(response, 502, { error: "Gemini could not answer. Check the server's model/API configuration and try again." });
      return;
    }
    const reply = payload.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("");
    if (typeof reply !== "string" || !reply.trim()) {
      sendJson(response, 502, { error: "Gemini returned no text response. Please try again." });
      return;
    }
    sendJson(response, 200, { reply: reply.trim(), model: MODEL });
  } catch (error) {
    console.error(`Gemini request failed: ${error.name}.`);
    sendJson(response, 502, { error: "Could not reach Gemini. Check your connection and try again." });
  }
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/") && request.headers.origin) {
    if (!ALLOWED_ORIGINS.has(request.headers.origin)) {
      sendJson(response, 403, { error: "This app origin is not allowed by the API server." });
      return;
    }
    response.setHeader("access-control-allow-origin", request.headers.origin);
    response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    response.setHeader("access-control-allow-headers", "content-type");
    response.setHeader("vary", "Origin");
  }
  if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { configured: Boolean(process.env.GOOGLE_API_KEY), model: MODEL });
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/chat") {
    await handleChat(request, response);
    return;
  }
  const publicFiles = { "/": "index.html", "/index.html": "index.html", "/app.js": "app.js", "/styles.css": "styles.css", "/geolocation-bridge.js": "geolocation-bridge.js", "/manifest.webmanifest": "manifest.webmanifest", "/sw.js": "sw.js", "/icons/resqnet.svg": "icons/resqnet.svg" };
  const filename = request.method === "GET" ? publicFiles[url.pathname] : null;
  if (!filename) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }
  try {
    const content = await readFile(path.join(ROOT, filename));
    response.writeHead(200, { "content-type": CONTENT_TYPES[path.extname(filename)], "cache-control": "no-store", "x-content-type-options": "nosniff" });
    response.end(content);
  } catch {
    sendJson(response, 500, { error: "Could not read application files." });
  }
}

createServer((request, response) => {
  handleRequest(request, response).catch(() => {
    if (!response.headersSent) sendJson(response, 500, { error: "Unexpected server error." });
    else response.destroy();
  });
}).listen(PORT, HOST, () => console.log(`RESQNET running at http://${HOST}:${PORT}`));
