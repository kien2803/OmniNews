import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from './crypto';

const KEY = 'a'.repeat(64); // 32 bytes hex

describe('encrypt/decrypt', () => {
  it('round-trips a token', async () => {
    const secret = 'ya29.mock-oauth-token-value';
    const ct = await encrypt(secret, KEY);
    expect(ct).not.toContain(secret);
    expect(await decrypt(ct, KEY)).toBe(secret);
  });

  it('produces iv:tag:ciphertext wire format', async () => {
    const parts = (await encrypt('x', KEY)).split(':');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toHaveLength(24); // 12-byte iv
    expect(parts[1]).toHaveLength(32); // 16-byte tag
  });

  it('never emits the same ciphertext twice (random iv)', async () => {
    expect(await encrypt('same', KEY)).not.toBe(await encrypt('same', KEY));
  });

  it('rejects a malformed payload', async () => {
    await expect(decrypt('dummy', KEY)).rejects.toThrow('Invalid encrypted payload format');
    await expect(decrypt('a:b', KEY)).rejects.toThrow('Invalid encrypted payload format');
  });

  it('rejects a wrong-length key', async () => {
    await expect(encrypt('x', 'a'.repeat(62))).rejects.toThrow('32 bytes');
  });

  it('fails to decrypt with a different key', async () => {
    const ct = await encrypt('secret', KEY);
    await expect(decrypt(ct, 'b'.repeat(64))).rejects.toThrow();
  });
});
