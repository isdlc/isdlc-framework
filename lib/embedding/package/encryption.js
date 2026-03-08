/**
 * AES-256-GCM encryption/decryption for .emb packages.
 *
 * REQ-0045 / FR-006 / AC-006-03 / M5 Package
 * @module lib/embedding/package/encryption
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt a buffer using AES-256-GCM with a random IV.
 *
 * Output format: [12-byte IV][16-byte auth tag][ciphertext]
 *
 * @param {Buffer} data - Plaintext data to encrypt
 * @param {Buffer} key - 32-byte encryption key
 * @returns {Buffer} Encrypted data with IV and auth tag prepended
 */
export function encrypt(data, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error('Encryption key must be a 32-byte Buffer');
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * Decrypt a buffer that was encrypted with encrypt().
 *
 * @param {Buffer} encrypted - Data produced by encrypt()
 * @param {Buffer} key - 32-byte encryption key (must match the key used to encrypt)
 * @returns {Buffer} Decrypted plaintext
 * @throws {Error} If key is wrong or data is corrupted
 */
export function decrypt(encrypted, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error('Decryption key must be a 32-byte Buffer');
  }

  if (encrypted.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Encrypted data is too short to contain IV and auth tag');
  }

  const iv = encrypted.subarray(0, IV_LENGTH);
  const authTag = encrypted.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = encrypted.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error('Decryption failed: wrong key or corrupted data');
  }
}
