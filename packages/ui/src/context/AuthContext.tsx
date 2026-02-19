/**
 * Authentication context for hosted mode.
 * Supports Phantom wallet sign-in (primary) and email/password (fallback).
 *
 * Only active when IS_HOSTED is true.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { API_BASE_URL } from '@/lib/env';
import { setAccessToken } from '@/lib/apiClient';

// Inline base58 encoder (avoids adding bs58 dependency)
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Encode(bytes: Uint8Array): string {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let result = '';
  for (const byte of bytes) {
    if (byte !== 0) break;
    result += '1';
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }
  return result;
}

interface AuthUser {
  userId: number;
  walletAddress?: string;
  email?: string;
  username?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Phantom sign-in
  loginWithPhantom: () => Promise<void>;

  // Email/password
  signup: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;

  // Username
  setUsername: (username: string) => Promise<void>;

  // Logout
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

function storeTokens(accessToken: string, refreshToken?: string) {
  setAccessToken(accessToken);
  if (refreshToken) localStorage.setItem('trench_refresh_token', refreshToken);
  // Store user info for UI display (decoded from JWT)
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    sessionStorage.setItem('trench_user_info', JSON.stringify({
      email: payload.email || null,
      walletAddress: payload.walletAddress || null,
      username: payload.username || null,
    }));
  } catch { /* ignore decode errors */ }
}

function clearTokens() {
  setAccessToken(null);
  localStorage.removeItem('trench_refresh_token');
  sessionStorage.removeItem('trench_user_info');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Auto-restore session on mount ──
  useEffect(() => {
    const refreshToken = localStorage.getItem('trench_refresh_token');
    if (!refreshToken) {
      setIsLoading(false);
      return;
    }

    // Try to refresh the access token
    fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (resp) => {
        if (!resp.ok) throw new Error('Session expired');
        const data = await resp.json();
        setAccessToken(data.accessToken);

        // Decode JWT payload to get user info (base64url → JSON)
        try {
          const payload = JSON.parse(atob(data.accessToken.split('.')[1]));
          storeTokens(data.accessToken);
          setUser({
            userId: payload.userId,
            walletAddress: payload.walletAddress,
            email: payload.email,
            username: payload.username,
          });
        } catch {
          // If decode fails, still set authenticated with minimal info
          setUser({ userId: 0 });
        }
      })
      .catch(() => {
        clearTokens();
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  // ── Phantom Sign-In ──
  const loginWithPhantom = useCallback(async () => {
    setError(null);

    // Check if Phantom is installed
    const phantom = (window as any).solana;
    if (!phantom?.isPhantom) {
      setError('Phantom wallet not found. Please install Phantom.');
      return;
    }

    try {
      // Connect to Phantom
      const resp = await phantom.connect();
      const walletAddress = resp.publicKey.toString();

      // Step 1: Request nonce from backend
      const nonceResp = await fetch(`${API_BASE_URL}/auth/phantom/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      });

      if (!nonceResp.ok) {
        const data = await nonceResp.json();
        throw new Error(data.error || 'Failed to get nonce');
      }

      const { nonce } = await nonceResp.json();

      // Step 2: Sign the nonce with Phantom
      const encodedMessage = new TextEncoder().encode(nonce);
      const signedMessage = await phantom.signMessage(encodedMessage, 'utf8');

      // Convert signature to base58
      const signatureBase58 = base58Encode(signedMessage.signature);

      // Step 3: Verify with backend
      const verifyResp = await fetch(`${API_BASE_URL}/auth/phantom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, signature: signatureBase58, nonce }),
      });

      if (!verifyResp.ok) {
        const data = await verifyResp.json();
        throw new Error(data.error || 'Signature verification failed');
      }

      const tokens = await verifyResp.json();
      storeTokens(tokens.accessToken, tokens.refreshToken);
      setUser({ userId: tokens.userId, walletAddress });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Phantom sign-in failed');
    }
  }, []);

  // ── Email Signup ──
  const signup = useCallback(async (email: string, password: string) => {
    setError(null);

    try {
      const resp = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error || 'Signup failed');
      }

      const tokens = await resp.json();
      storeTokens(tokens.accessToken, tokens.refreshToken);
      setUser({ userId: tokens.userId, email });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    }
  }, []);

  // ── Email Login ──
  const login = useCallback(async (email: string, password: string) => {
    setError(null);

    try {
      const resp = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error || 'Login failed');
      }

      const tokens = await resp.json();
      storeTokens(tokens.accessToken, tokens.refreshToken);
      setUser({ userId: tokens.userId, email });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }, []);

  // ── Set Username ──
  const setUsername = useCallback(async (username: string) => {
    setError(null);
    try {
      const { apiClient } = await import('@/lib/apiClient');
      const resp: { username: string; accessToken: string } = await apiClient.put('/auth/username', { username });
      storeTokens(resp.accessToken);
      setUser(prev => prev ? { ...prev, username: resp.username } : prev);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to set username';
      setError(msg);
      throw err;
    }
  }, []);

  // ── Logout ──
  const logout = useCallback(() => {
    const refreshToken = localStorage.getItem('trench_refresh_token');
    if (refreshToken) {
      // Best-effort server logout (don't await)
      fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    }
    clearTokens();
    setUser(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // Listen for logout events from other components (e.g. Settings page)
  useEffect(() => {
    const handleLogout = () => logout();
    window.addEventListener('trench-logout', handleLogout);
    return () => window.removeEventListener('trench-logout', handleLogout);
  }, [logout]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        error,
        loginWithPhantom,
        signup,
        login,
        setUsername,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
