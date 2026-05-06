/**
 * TOTP (Time-based One-Time Password) Module
 * 
 * Zero-Knowledge MFA Implementation:
 * 1. Secret is generated client-side
 * 2. Secret is encrypted with VaultKey before sending to backend
 * 3. TOTP codes are generated and verified client-side
 * 4. Backend NEVER sees the plaintext secret
 * 
 * Uses RFC 6238 TOTP with SHA-1, 6 digits, 30 second period
 */

import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import sodium from 'libsodium-wrappers';
import { initCrypto, encrypt, decrypt } from './encryption';
import type { EncryptedBlob, CryptoResult } from './types';

const TOTP_ISSUER = 'SecureVault';
const TOTP_ALGORITHM = 'SHA1';
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;

export interface TOTPSetupData {
  /** Base32-encoded secret (for authenticator apps) */
  secret: string;
  /** otpauth:// URI for QR code */
  uri: string;
  /** QR code as data URL */
  qrCodeDataUrl: string;
  /** Recovery codes (plain text, show once) */
  recoveryCodes: string[];
  /** Encrypted secret blob for backend storage */
  encryptedSecret: EncryptedBlob;
  /** Hashed recovery codes for backend storage */
  recoveryCodesHash: string[];
}

/**
 * Generate a random TOTP secret
 */
export async function generateTOTPSecret(): Promise<string> {
  await initCrypto();
  
  // Generate 20 random bytes (160 bits) for the secret
  const secretBytes = sodium.randombytes_buf(20);
  
  // Convert to base32 for TOTP compatibility
  return base32Encode(secretBytes);
}

/**
 * Create a TOTP instance from a secret
 */
function createTOTP(secret: string, accountName: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label: accountName,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

/**
 * Generate a current TOTP code from a secret
 */
export function generateTOTPCode(secret: string): string {
  const totp = new OTPAuth.TOTP({
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  
  return totp.generate();
}

/**
 * Verify a TOTP code against a secret
 * Allows for 1 period of clock drift in either direction
 */
export function verifyTOTPCode(secret: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  
  // Allow window of 1 for clock drift (checks current, -1, +1 periods)
  const delta = totp.validate({ token: code, window: 1 });
  
  return delta !== null;
}

/**
 * Generate recovery codes
 */
export async function generateRecoveryCodes(count: number = 10): Promise<string[]> {
  await initCrypto();
  
  const codes: string[] = [];
  
  for (let i = 0; i < count; i++) {
    // Generate 8 random bytes, encode as hex with dashes for readability
    const bytes = sodium.randombytes_buf(8);
    const hex = sodium.to_hex(bytes);
    // Format: XXXX-XXXX-XXXX-XXXX
    const formatted = `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`.toUpperCase();
    codes.push(formatted);
  }
  
  return codes;
}

/**
 * Hash recovery codes for backend storage
 */
export async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  await initCrypto();
  
  return codes.map(code => {
    // Remove formatting and hash
    const normalized = code.replace(/-/g, '').toLowerCase();
    const hash = sodium.crypto_hash(sodium.from_string(normalized));
    return sodium.to_hex(hash).slice(0, 64); // SHA-256 = 64 hex chars
  });
}

/**
 * Complete MFA setup: generate everything needed
 */
export async function setupMFA(
  accountEmail: string,
  vaultKey: Uint8Array
): Promise<CryptoResult<TOTPSetupData>> {
  try {
    await initCrypto();
    
    // Generate TOTP secret
    const secret = await generateTOTPSecret();
    
    // Create TOTP instance for URI
    const totp = createTOTP(secret, accountEmail);
    const uri = totp.toString();
    
    // Generate QR code
    const qrCodeDataUrl = await QRCode.toDataURL(uri, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 256,
    });
    
    // Generate recovery codes
    const recoveryCodes = await generateRecoveryCodes(10);
    
    // Hash recovery codes for backend
    const recoveryCodesHash = await hashRecoveryCodes(recoveryCodes);
    
    // Encrypt secret with VaultKey
    const secretBytes = sodium.from_string(secret);
    const encryptResult = await encrypt(secretBytes, vaultKey);
    
    if (!encryptResult.success || !encryptResult.data) {
      return { success: false, error: 'Failed to encrypt MFA secret' };
    }
    
    return {
      success: true,
      data: {
        secret,
        uri,
        qrCodeDataUrl,
        recoveryCodes,
        encryptedSecret: encryptResult.data,
        recoveryCodesHash,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'MFA setup failed',
    };
  }
}

/**
 * Decrypt MFA secret from storage
 */
export async function decryptMFASecret(
  encryptedSecret: EncryptedBlob,
  vaultKey: Uint8Array
): Promise<CryptoResult<string>> {
  try {
    const result = await decrypt(encryptedSecret, vaultKey);
    
    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'Decryption failed' };
    }
    
    const secret = new TextDecoder().decode(result.data);
    return { success: true, data: secret };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to decrypt MFA secret',
    };
  }
}

/**
 * Base32 encoding for TOTP secrets
 */
function base32Encode(data: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  let bits = 0;
  let value = 0;
  
  for (let i = 0; i < data.length; i++) {
    value = (value << 8) | data[i];
    bits += 8;
    
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  
  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 31];
  }
  
  return result;
}
