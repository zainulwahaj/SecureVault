/**
 * Thin WebAuthn helper functions for the browser.
 *
 * Converts between server-sent base64url-encoded option payloads and the
 * Uint8Array shapes the WebAuthn API expects, then back to plain JSON for
 * the server complete endpoints.
 */

function b64urlToBytes(value: string): Uint8Array {
  const padded = value + '='.repeat((-value.length & 3) === 0 ? 0 : 4 - (value.length & 3));
  const bin = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToB64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < view.length; i += 1) bin += String.fromCharCode(view[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

type RegistrationOptions = {
  challenge: string;
  user: { id: string; name: string; displayName: string };
  rp: { id: string; name: string };
  pubKeyCredParams: PublicKeyCredentialParameters[];
  timeout?: number;
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  excludeCredentials?: { id: string; type: 'public-key'; transports?: AuthenticatorTransport[] }[];
  attestation?: AttestationConveyancePreference;
};

type AuthenticationOptions = {
  challenge: string;
  rpId?: string;
  allowCredentials?: { id: string; type: 'public-key'; transports?: AuthenticatorTransport[] }[];
  timeout?: number;
  userVerification?: UserVerificationRequirement;
};

export async function createWebAuthnCredential(options: RegistrationOptions): Promise<PublicKeyCredential> {
  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: b64urlToBytes(options.challenge),
    rp: options.rp,
    user: {
      id: b64urlToBytes(options.user.id),
      name: options.user.name,
      displayName: options.user.displayName,
    },
    pubKeyCredParams: options.pubKeyCredParams,
    timeout: options.timeout,
    authenticatorSelection: options.authenticatorSelection,
    attestation: options.attestation,
    excludeCredentials: options.excludeCredentials?.map((c) => ({
      id: b64urlToBytes(c.id),
      type: c.type,
      transports: c.transports,
    })),
  };
  const credential = await navigator.credentials.create({ publicKey });
  if (!credential) throw new Error('WebAuthn registration cancelled');
  return credential as PublicKeyCredential;
}

export async function getWebAuthnAssertion(options: AuthenticationOptions): Promise<PublicKeyCredential> {
  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: b64urlToBytes(options.challenge),
    rpId: options.rpId,
    timeout: options.timeout,
    userVerification: options.userVerification,
    allowCredentials: options.allowCredentials?.map((c) => ({
      id: b64urlToBytes(c.id),
      type: c.type,
      transports: c.transports,
    })),
  };
  const credential = await navigator.credentials.get({ publicKey });
  if (!credential) throw new Error('WebAuthn authentication cancelled');
  return credential as PublicKeyCredential;
}

export function serializeAttestation(credential: PublicKeyCredential): Record<string, unknown> {
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: bytesToB64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bytesToB64url(response.clientDataJSON),
      attestationObject: bytesToB64url(response.attestationObject),
      transports:
        typeof (response as unknown as { getTransports?: () => string[] }).getTransports === 'function'
          ? (response as unknown as { getTransports: () => string[] }).getTransports()
          : undefined,
    },
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
  };
}

export function serializeAssertion(credential: PublicKeyCredential): Record<string, unknown> {
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: bytesToB64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bytesToB64url(response.clientDataJSON),
      authenticatorData: bytesToB64url(response.authenticatorData),
      signature: bytesToB64url(response.signature),
      userHandle: response.userHandle ? bytesToB64url(response.userHandle) : undefined,
    },
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
  };
}

export function webauthnAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential;
}
