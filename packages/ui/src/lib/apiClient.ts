/**
 * Authenticated API client stub for self-hosted mode.
 * In self-hosted mode this is never used — exists only so imports resolve.
 */

export function setAccessToken(_token: string | null) {}
export function getAccessToken(): string | null { return null; }

export const apiClient = {
  async get<T = any>(_path: string): Promise<T> { throw new Error('Not available in self-hosted mode'); },
  async post<T = any>(_path: string, _body: unknown): Promise<T> { throw new Error('Not available in self-hosted mode'); },
  async put<T = any>(_path: string, _body: unknown): Promise<T> { throw new Error('Not available in self-hosted mode'); },
};
