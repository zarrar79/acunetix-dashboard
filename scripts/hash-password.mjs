#!/usr/bin/env node
/**
 * Usage: node scripts/hash-password.mjs "your-password"
 * Prints DASHBOARD_PASSWORD_HASH=pbkdf2$...
 */
import { webcrypto } from "node:crypto";

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-password.mjs \"your-password\"");
  process.exit(1);
}

const encoder = new TextEncoder();
const iterations = 210_000;
const salt = webcrypto.getRandomValues(new Uint8Array(16));
const key = await webcrypto.subtle.importKey(
  "raw",
  encoder.encode(password),
  "PBKDF2",
  false,
  ["deriveBits"],
);
const derived = await webcrypto.subtle.deriveBits(
  { name: "PBKDF2", hash: "SHA-256", salt, iterations },
  key,
  256,
);
const toHex = (buf) =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const hash = `pbkdf2$${iterations}$${toHex(salt)}$${toHex(derived)}`;
console.log(`DASHBOARD_PASSWORD_HASH=${hash}`);
