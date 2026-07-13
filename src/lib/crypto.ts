import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

// Server-only, symmetric encryption for secrets we must store but never want
// readable at rest — the user's Anthropic key, their Fitbit OAuth tokens. A DB
// dump or leaked backup then yields ciphertext, not live credentials.
//
// AES-256-GCM (authenticated: tampering fails the decrypt). The 32-byte key
// comes from SECRET_ENCRYPTION_KEY (base64 or hex). Generate one with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

const PREFIX = "enc.v1.";
const IV_LEN = 12; // GCM standard nonce length
const TAG_LEN = 16;

function key(): Buffer {
  const raw = process.env.SECRET_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "SECRET_ENCRYPTION_KEY is not set — cannot encrypt/decrypt secrets.",
    );
  }
  // Accept base64 or hex; both must decode to exactly 32 bytes.
  const buf = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      "SECRET_ENCRYPTION_KEY must decode to 32 bytes (a base64 or hex 256-bit key).",
    );
  }
  return buf;
}

// Encrypt a plaintext secret into a self-describing string:
//   enc.v1.<base64url(iv | authTag | ciphertext)>
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64url");
}

// True when a stored value is one of ours (vs. a legacy plaintext row written
// before encryption existed).
export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

// Decrypt a value produced by encryptSecret. A value WITHOUT our prefix is
// treated as legacy plaintext and returned unchanged, so rows written before
// this module keep working until their next write re-encrypts them.
export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored;
  const buf = Buffer.from(stored.slice(PREFIX.length), "base64url");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

// Deterministic hash of a bearer token, for a DB lookup by token without
// storing the token itself. Same input → same hash, so we can index and match
// on it (unlike the random-IV ciphertext above). Used for the Apple ingest
// token, which arrives as a bearer credential and must be looked up.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
