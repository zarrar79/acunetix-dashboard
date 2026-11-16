const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toB64(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of view) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(value: string) {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(secret: string) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function sealJson(secret: string, payload: unknown) {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(payload));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return `${toB64(iv)}.${toB64(cipher)}`;
}

export async function openJson<T>(secret: string, sealed: string): Promise<T> {
  const [ivB64, dataB64] = sealed.split(".");
  if (!ivB64 || !dataB64) throw new Error("Invalid sealed payload");
  const key = await deriveKey(secret);
  const iv = fromB64(ivB64);
  const data = fromB64(dataB64);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    data as BufferSource,
  );
  return JSON.parse(decoder.decode(plain)) as T;
}
