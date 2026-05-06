'use client';

/**
 * Authentication Context Provider - Zero-Knowledge Implementation
 * 
 * SECURITY ARCHITECTURE:
 * - VaultKey is held in memory only (React state)
 * - VaultKey is NEVER persisted to localStorage/sessionStorage
 * - Page refresh requires re-login (by design)
 * - Logout clears VaultKey from memory
 * 
 * ZERO-KNOWLEDGE FLOW:
 * Registration:
 * 1. Generate salt + VaultKey client-side
 * 2. Encrypt VaultKey with KEK (derived from password)
 * 3. Send encrypted data to backend (password never sent)
 * 
 * Login:
 * 1. Fetch encrypted data from backend
 * 2. Derive KEK from password + salt
 * 3. Decrypt VaultKey (proves password correct)
 * 4. Send proof to backend for session creation
 */

import React, { 
  createContext, 
  useContext, 
  useState, 
  useEffect, 
  useCallback,
  useRef,
  type ReactNode 
} from 'react';
import type { User, AuthState } from '@/types';
import type { EncryptedBlob, VaultKey } from '@/lib/crypto/types';
import * as api from '@/lib/api';
import { 
  prepareRegistration, 
  attemptLogin, 
  generateLoginProof,
  clearSensitiveData,
  initCrypto,
  signLoginChallenge,
  generateEncryptedAuthSigningKeyPair,
} from '@/lib/crypto';

interface AuthContextValue extends AuthState {
  /** 
   * Register with zero-knowledge authentication.
   * Password is processed locally and never sent to server.
   */
  register: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  
  /** 
   * Login with zero-knowledge authentication.
   * Password is used locally to decrypt VaultKey.
   */
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; requiresMfa?: boolean }>;
  
  /**
   * Unlock vault when session exists but VaultKey is lost (page refresh).
   * Only requires password since user is already known.
   */
  unlock: (password: string) => Promise<{ success: boolean; error?: string; requiresMfa?: boolean }>;
  
  /** 
   * Logout and clear VaultKey from memory.
   */
  logout: () => Promise<void>;
  
  /**
   * Get the VaultKey for cryptographic operations.
   * Returns null if not authenticated.
   * 
   * SECURITY: VaultKey should be used immediately and not stored.
   */
  getVaultKey: () => VaultKey | null;
  
  /**
   * The VaultKey directly (for MFA setup and other operations).
   * SECURITY: Should only be used when necessary.
   */
  vaultKey: VaultKey | null;

  /**
   * True when user has valid session but VaultKey needs to be unlocked.
   * This happens after page refresh.
   */
  needsUnlock: boolean;
  
  /**
   * True when user needs to complete MFA verification after login.
   */
  pendingMfa: boolean;
  
  /**
   * Complete MFA verification after login.
   */
  completeMfaVerification: () => void;
  
  /**
   * Cancel MFA verification and logout.
   */
  cancelMfaVerification: () => void;

  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Session timeout: 15 minutes of inactivity
const SESSION_TIMEOUT_MS = 15 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingMfa, setPendingMfa] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingAuthKeyUpgradeRef = useRef<{
    authPublicKey: string;
    encryptedAuthPrivateKey: EncryptedBlob;
  } | null>(null);
  
  /**
   * SECURITY CRITICAL: VaultKey storage
   * 
   * Using useRef instead of useState to avoid React DevTools exposure.
   * The key is NEVER serialized or persisted.
   */
  const vaultKeyRef = useRef<VaultKey | null>(null);
  const [hasVaultKey, setHasVaultKey] = useState(false);

  // Initialize crypto on mount
  useEffect(() => {
    initCrypto().catch(() => {});
  }, []);

  // Check for existing session on mount
  // Note: Session may exist but VaultKey won't (requires re-login)
  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await api.getCurrentUser();
        if (response.success && response.data) {
          if (response.data.mfaRequired || response.data.authLevel === 'pending_mfa') {
            await api.logout();
            return;
          }
          setUser(response.data);
          // User has session but no VaultKey until they login again
          // This is by design - page refresh requires re-authentication
        }
      } catch {
        // No valid session
      } finally {
        setIsLoading(false);
      }
    }
    checkAuth();
  }, []);

  /**
   * Session timeout - clear VaultKey after inactivity
   */
  const resetActivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // Set up activity listeners and timeout checker
  useEffect(() => {
    if (!hasVaultKey) return;

    const handleActivity = () => {
      resetActivityTimer();
    };

    // Listen for user activity
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Check for timeout every minute
    const checkTimeout = () => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= SESSION_TIMEOUT_MS && hasVaultKey) {
        // Clear vault key due to inactivity
        if (vaultKeyRef.current) {
          clearSensitiveData(vaultKeyRef.current);
        }
        vaultKeyRef.current = null;
        setHasVaultKey(false);
        // Keep user logged in but require unlock
      }
    };

    timeoutRef.current = setInterval(checkTimeout, 60000);

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      if (timeoutRef.current) {
        clearInterval(timeoutRef.current);
      }
    };
  }, [hasVaultKey, resetActivityTimer]);

  /**
   * Store VaultKey securely in memory.
   * 
   * SECURITY:
   * - Key is stored in ref (not serialized by React)
   * - Previous key is cleared before storing new one
   */
  const setVaultKey = useCallback((key: VaultKey | null) => {
    // Clear previous key if exists
    if (vaultKeyRef.current) {
      clearSensitiveData(vaultKeyRef.current);
    }
    vaultKeyRef.current = key;
    setHasVaultKey(key !== null);
    resetActivityTimer();
  }, [resetActivityTimer]);

  /**
   * Get VaultKey for crypto operations.
   * 
   * SECURITY: Caller should use key immediately and not store it.
   */
  const getVaultKey = useCallback((): VaultKey | null => {
    return vaultKeyRef.current;
  }, []);

  /**
   * Zero-Knowledge Registration
   * 
   * 1. Generate salt + VaultKey locally
   * 2. Encrypt VaultKey with KEK (from password)
   * 3. Send encrypted data to backend
   * 4. Store VaultKey in memory for session
   */
  const register = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      // Step 1-2: Prepare registration data (all crypto client-side)
      const prepResult = await prepareRegistration(email, password);
      if (!prepResult.success || !prepResult.data) {
        return { success: false, error: prepResult.error || 'Registration preparation failed' };
      }
      
      const { registrationData, vaultKey } = prepResult.data;
      
      // Step 3: Generate login proof (hash of VaultKey)
      const loginProof = await generateLoginProof(vaultKey);
      
      // Step 4: Send to backend (no password!)
      const response = await api.register(registrationData, loginProof);
      
      if (response.success && response.data) {
        // Step 5: Store user and VaultKey in memory
        setUser({
          ...response.data.user,
          authLevel: response.data.authLevel,
          mfaRequired: response.data.mfaRequired,
        });
        setVaultKey(vaultKey);
        return { success: true };
      }
      
      // Registration failed - clear VaultKey
      clearSensitiveData(vaultKey);
      return { success: false, error: response.error };
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Registration failed' 
      };
    } finally {
      setIsLoading(false);
    }
  }, [setVaultKey]);

  /**
   * Zero-Knowledge Login
   * 
   * 1. Fetch encrypted data from backend
   * 2. Derive KEK from password + salt
   * 3. Attempt to decrypt VaultKey
   * 4. If successful, send proof to backend
   * 5. Check if MFA is required
   * 6. Store VaultKey in memory
   */
  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      // Step 1: Get login challenge from backend
      const challengeResponse = await api.getLoginChallenge(email);
      if (!challengeResponse.success || !challengeResponse.data) {
        return { success: false, error: challengeResponse.error || 'Invalid credentials' };
      }
      
      const challenge = challengeResponse.data;
      
      // Step 2-3: Attempt to decrypt VaultKey (proves password is correct)
      const loginResult = await attemptLogin(
        password,
        challenge.salt,
        challenge.kdfParams,
        challenge.encryptedVaultKey
      );
      
      if (!loginResult.success || !loginResult.data) {
        // Decryption failed = wrong password
        return { success: false, error: 'Invalid password' };
      }
      
      const vaultKey = loginResult.data;
      
      let verifyPayload: { challengeId?: string; signature?: string; proof?: string };

      if (challenge.authKeyRequired) {
        if (!challenge.encryptedAuthPrivateKey) {
          clearSensitiveData(vaultKey);
          return { success: false, error: 'Account auth key is missing. Please contact support.' };
        }

        const signatureResult = await signLoginChallenge(
          challenge.authChallenge,
          challenge.encryptedAuthPrivateKey,
          vaultKey
        );
        if (!signatureResult.success || !signatureResult.data) {
          clearSensitiveData(vaultKey);
          return { success: false, error: signatureResult.error || 'Login challenge signing failed' };
        }

        verifyPayload = {
          challengeId: challenge.authChallengeId,
          signature: signatureResult.data,
        };
      } else {
        // Legacy fallback for users created before challenge-signing keys.
        const proof = await generateLoginProof(vaultKey);
        verifyPayload = { proof };
      }

      // Step 4: Verify challenge signature with backend
      const verifyResponse = await api.verifyLogin(email, verifyPayload);
      
      if (verifyResponse.success && verifyResponse.data) {
        if (!challenge.authKeyRequired) {
          const authKeyResult = await generateEncryptedAuthSigningKeyPair(vaultKey);
          if (authKeyResult.success && authKeyResult.data) {
            if (verifyResponse.data.authLevel === 'full') {
              await api.upgradeAuthKey(authKeyResult.data);
            } else {
              pendingAuthKeyUpgradeRef.current = authKeyResult.data;
            }
          }
        }

        // Step 5: Store user and VaultKey
        setUser({
          ...verifyResponse.data.user,
          authLevel: verifyResponse.data.authLevel,
          mfaRequired: verifyResponse.data.mfaRequired,
        });
        setVaultKey(vaultKey);
        
        // Step 6: Server issued a pending-MFA session
        if (verifyResponse.data.mfaRequired || verifyResponse.data.authLevel === 'pending_mfa') {
          setPendingMfa(true);
          return { success: true, requiresMfa: true };
        }
        
        return { success: true };
      }
      
      // Verification failed - clear VaultKey
      clearSensitiveData(vaultKey);
      return { success: false, error: verifyResponse.error || 'Login verification failed' };
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Login failed' 
      };
    } finally {
      setIsLoading(false);
    }
  }, [setVaultKey]);

  /**
   * Logout - Clear session and VaultKey
   * 
   * SECURITY CRITICAL: Must clear VaultKey from memory
   */
  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await api.logout();
    } finally {
      // Always clear local state, even if API call fails
      setUser(null);
      setVaultKey(null); // SECURITY: Clear VaultKey from memory
      setIsLoading(false);
    }
  }, [setVaultKey]);

  /**
   * Unlock vault after page refresh.
   * 
   * When user has valid session but VaultKey is lost (page refresh),
   * they only need to enter password to unlock.
   * 
   * SECURITY: Same crypto flow as login, but user email is already known.
   */
  const unlock = useCallback(async (password: string) => {
    if (!user) {
      return { success: false, error: 'No active session' };
    }
    
    // Use the existing login flow with known email
    return login(user.email, password);
  }, [user, login]);

  /**
   * Complete MFA verification after successful 2FA code entry.
   */
  const completeMfaVerification = useCallback(() => {
    setPendingMfa(false);
    setUser(prev => prev ? { ...prev, authLevel: 'full', mfaRequired: false } : prev);
    const pendingUpgrade = pendingAuthKeyUpgradeRef.current;
    if (pendingUpgrade) {
      pendingAuthKeyUpgradeRef.current = null;
      api.upgradeAuthKey(pendingUpgrade).catch(() => {});
    }
  }, []);

  /**
   * Cancel MFA verification and logout.
   */
  const cancelMfaVerification = useCallback(async () => {
    setPendingMfa(false);
    pendingAuthKeyUpgradeRef.current = null;
    setUser(null);
    setVaultKey(null);
    await api.logout();
  }, [setVaultKey]);

  const refreshUser = useCallback(async () => {
    const result = await api.getCurrentUser();
    if (result.success && result.data) {
      setUser(result.data);
    }
  }, []);

  // Determine if user needs to unlock (has session but no VaultKey)
  const needsUnlock = !!user && !hasVaultKey && !pendingMfa;

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: !!user && hasVaultKey && !pendingMfa,
    hasVaultKey,
    needsUnlock,
    pendingMfa,
    login,
    register,
    logout,
    unlock,
    getVaultKey,
    vaultKey: vaultKeyRef.current,
    completeMfaVerification,
    cancelMfaVerification,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
