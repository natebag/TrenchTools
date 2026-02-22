/**
 * In-memory session manager for long-running MCP operations.
 *
 * The MCP server process stays alive between tool calls, so we can
 * store session state (timers, stats, wallet lists) in module-level maps.
 */

export type SessionType = 'volume' | 'bot' | 'activity';

export interface SessionStats {
  tradesExecuted: number;
  tradesSuccessful: number;
  tradesFailed: number;
  volumeSol: number;
  startedAt: Date;
}

export interface Session {
  id: string;
  type: SessionType;
  tokenMint: string;
  stats: SessionStats;
  running: boolean;
  timers: NodeJS.Timeout[];
  walletAddresses: string[];
  // Bot group specific
  botName?: string;
  // Activity specific
  durationHours?: number;
  endTime?: Date;
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

const sessions = new Map<string, Session>();
let nextId = 1;

function generateId(type: SessionType): string {
  return `${type}-${nextId++}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createSession(
  type: SessionType,
  tokenMint: string,
  walletAddresses: string[],
  extra?: Partial<Session>,
): Session {
  const id = generateId(type);
  const session: Session = {
    id,
    type,
    tokenMint,
    stats: {
      tradesExecuted: 0,
      tradesSuccessful: 0,
      tradesFailed: 0,
      volumeSol: 0,
      startedAt: new Date(),
    },
    running: true,
    timers: [],
    walletAddresses,
    ...extra,
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function getSessionsByType(type: SessionType): Session[] {
  const result: Session[] = [];
  for (const s of sessions.values()) {
    if (s.type === type) result.push(s);
  }
  return result;
}

export function stopSession(id: string): void {
  const session = sessions.get(id);
  if (!session) return;
  for (const t of session.timers) clearTimeout(t);
  session.timers = [];
  session.running = false;
}

export function removeSession(id: string): void {
  stopSession(id);
  sessions.delete(id);
}

export function getAllSessions(): Session[] {
  return Array.from(sessions.values());
}
