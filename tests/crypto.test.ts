import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  hashToken,
  isEncrypted,
} from "@/lib/crypto";

// This module holds the user's Anthropic key and their Fitbit tokens. A silent
// break here doesn't show up as a crash — it shows up as everyone's saved key
// no longer working, or (worse) a secret written to the database in the clear.

const KEY_B64 = Buffer.alloc(32, 7).toString("base64");
const KEY_HEX = Buffer.alloc(32, 9).toString("hex");

let saved: string | undefined;

beforeEach(() => {
  saved = process.env.SECRET_ENCRYPTION_KEY;
  process.env.SECRET_ENCRYPTION_KEY = KEY_B64;
});

afterEach(() => {
  if (saved === undefined) delete process.env.SECRET_ENCRYPTION_KEY;
  else process.env.SECRET_ENCRYPTION_KEY = saved;
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a secret", () => {
    const secret = "sk-ant-api03-not-a-real-key";
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it("does not leave the plaintext in the stored value", () => {
    const stored = encryptSecret("sk-ant-super-secret");
    expect(stored).not.toContain("super-secret");
    expect(stored.startsWith("enc.v1.")).toBe(true);
  });

  it("produces a different ciphertext each time (fresh nonce)", () => {
    // A repeated nonce in GCM is a real break, not a style point.
    const a = encryptSecret("same input");
    const b = encryptSecret("same input");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same input");
    expect(decryptSecret(b)).toBe("same input");
  });

  it("round-trips unicode and empty strings", () => {
    expect(decryptSecret(encryptSecret(""))).toBe("");
    expect(decryptSecret(encryptSecret("clé—privée 🔐"))).toBe("clé—privée 🔐");
  });

  it("accepts a hex key as well as base64", () => {
    process.env.SECRET_ENCRYPTION_KEY = KEY_HEX;
    expect(decryptSecret(encryptSecret("hex-keyed"))).toBe("hex-keyed");
  });

  it("refuses to decrypt a tampered value", () => {
    // GCM is authenticated: flipping a byte must fail loudly, not hand back
    // garbage that we'd go on to send to Anthropic as someone's key.
    const stored = encryptSecret("sk-ant-original");
    const body = stored.slice("enc.v1.".length);
    const bytes = Buffer.from(body, "base64url");
    bytes[bytes.length - 1] ^= 0xff; // corrupt the last byte of ciphertext
    const tampered = "enc.v1." + bytes.toString("base64url");

    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("cannot be decrypted with a different key", () => {
    const stored = encryptSecret("sk-ant-original");
    process.env.SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    expect(() => decryptSecret(stored)).toThrow();
  });

  it("fails loudly when no key is configured", () => {
    delete process.env.SECRET_ENCRYPTION_KEY;
    expect(() => encryptSecret("x")).toThrow(/SECRET_ENCRYPTION_KEY/);
  });

  it("rejects a key that isn't 32 bytes", () => {
    process.env.SECRET_ENCRYPTION_KEY = Buffer.alloc(16, 3).toString("base64");
    expect(() => encryptSecret("x")).toThrow(/32 bytes/);
  });
});

describe("isEncrypted", () => {
  it("recognises our own values", () => {
    expect(isEncrypted(encryptSecret("x"))).toBe(true);
  });

  it("treats anything else as legacy plaintext", () => {
    expect(isEncrypted("sk-ant-plain-old-key")).toBe(false);
    expect(isEncrypted("")).toBe(false);
  });
});

describe("decryptSecret on legacy rows", () => {
  it("passes an unencrypted value straight through", () => {
    // Rows written before this module existed hold the raw key. They have to
    // keep working until their next write re-encrypts them.
    expect(decryptSecret("sk-ant-written-before-encryption")).toBe(
      "sk-ant-written-before-encryption",
    );
  });
});

describe("hashToken", () => {
  it("is deterministic, so a token can be looked up by its hash", () => {
    expect(hashToken("apple-ingest-token")).toBe(hashToken("apple-ingest-token"));
  });

  it("gives different tokens different hashes", () => {
    expect(hashToken("token-a")).not.toBe(hashToken("token-b"));
  });

  it("does not contain the token", () => {
    const h = hashToken("apple-ingest-token");
    expect(h).not.toContain("apple");
    expect(h).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });

  it("does not need the encryption key", () => {
    // It's a hash, not a cipher — it must keep working for the ingest endpoint
    // even if the encryption key is unavailable.
    delete process.env.SECRET_ENCRYPTION_KEY;
    expect(() => hashToken("x")).not.toThrow();
  });
});
