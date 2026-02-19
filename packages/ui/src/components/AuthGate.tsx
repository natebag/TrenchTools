/**
 * AuthGate stub for self-hosted mode.
 * In self-hosted mode, no auth is needed — renders children directly.
 */

import type { ReactNode } from 'react';

export function AuthGate({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
