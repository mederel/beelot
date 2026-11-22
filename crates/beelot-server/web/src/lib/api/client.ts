// The requests of the page. A request that gets no answer in 12 s is given up, so a bad connection never leaves the game
// waiting; reading is retried after 0.5, 1.5 and 3.5 s before the failure is shown (US-141). A signed-in player's requests
// that change state echo the CSRF token the server sets in a cookie. Errors carry the server's message code (US-170).
import { localized, t } from "$lib/i18n/i18n.svelte";
import { readOnlineResumes, readResume } from "$lib/models/home-status";
import { showConnectionTrouble } from "$lib/stores/connection.svelte";
import { local, readJson, SESSION_KEYS, session, writeJson } from "$lib/storage";
import { csrfToken } from "./csrf";
import type { Access, Action, Hint, Snapshot } from "./types";

export class ApiError extends Error {
  status?: number;
  network = false;
  body: any;
  constructor(message: string, { status, network = false, body = {} }: { status?: number; network?: boolean; body?: any } = {}) {
    super(message);
    this.status = status;
    this.network = network;
    this.body = body;
  }
}

export function withCsrfToken(options: RequestInit = {}): RequestInit {
  const method = (options.method ?? "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return options;
  const token = csrfToken(document.cookie);
  if (!token) return options;
  return { ...options, headers: { ...(options.headers as Record<string, string>), "X-XSRF-TOKEN": token } };
}

const REQUEST_TIMEOUT_MS = 12000;
const READ_RETRY_DELAYS = [500, 1500, 3500];

// Set by the table stream: an answer does not clear the note while the live link is still down (US-142).
let streamDropped = () => false;
export function watchStreamDrop(isDropped: () => boolean): void {
  streamDropped = isDropped;
}

// One try of a request: the CSRF echo, the timeout, and the error of a connection that fails. `read` takes what the caller
// needs from the answer, inside the timeout.
async function send<T>(url: string, options: RequestInit, read: (response: Response) => Promise<T>): Promise<{ response: Response; body: T }> {
  const control = new AbortController();
  const timer = window.setTimeout(() => control.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...withCsrfToken(options), signal: control.signal });
    return { response, body: await read(response) };
  } catch {
    throw new ApiError(t("The connection is slow or lost."), { network: true });
  } finally {
    window.clearTimeout(timer);
  }
}

async function once<T>(url: string, options: RequestInit): Promise<T> {
  const { response, body } = await send<any>(url, options, (answer) => answer.json().catch(() => ({})));
  if (!response.ok) {
    const message = body.code ? localized(body, body.message) : t("Something went wrong. Please try again.");
    // A gateway or a restarting server answering for the game is a connection problem too.
    throw new ApiError(message, { status: response.status, network: [502, 503, 504].includes(response.status), body });
  }
  return body as T;
}

// A JSON answer; a status that is not a success is an ApiError with the server's message.
export function apiJson<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  return withRetries(options, () => once<T>(url, options));
}

// The answer itself, whatever its status, for a download or a call whose status the caller reads (export, delete, sign-out,
// the passkey ceremony). Only a connection that fails is an ApiError.
export function apiResponse(url: string, options: RequestInit = {}): Promise<Response> {
  return withRetries(options, async () => (await send(url, options, async () => undefined)).response);
}

// A read is retried when the connection fails; the connection note follows the result.
async function withRetries<T>(options: RequestInit, attemptRequest: () => Promise<T>): Promise<T> {
  const readOnly = (options.method ?? "GET").toUpperCase() === "GET";
  for (let attempt = 0; ; attempt += 1) {
    try {
      const body = await attemptRequest();
      if (!streamDropped()) showConnectionTrouble(false);
      return body;
    } catch (error) {
      const failure = error as ApiError;
      if (failure.network) showConnectionTrouble(true);
      if (!failure.network || !readOnly || attempt >= READ_RETRY_DELAYS.length) throw failure;
      await new Promise((resolve) => window.setTimeout(resolve, READ_RETRY_DELAYS[attempt]));
    }
  }
}

export const jsonBody = (value: unknown): RequestInit => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });

// ---------------------------------------------------------------- tables
// The player token of each table this tab created or joined is kept for the tab only; a solo match (US-122) and an
// online seat (US-145) are also remembered on the device to be resumed.
const TABLE_TOKENS_KEY = SESSION_KEYS.tableTokens;
export const PRIVATE_SESSION_KEY = SESSION_KEYS.privateTableSession;

const isRecord = (value: unknown): value is Record<string, any> => typeof value === "object" && value !== null && !Array.isArray(value);

export function tableTokens(): Record<string, string> {
  return readJson(session, TABLE_TOKENS_KEY, {}, isRecord);
}

export function tableToken(tableId: string): string | null {
  const resume = readResume(local);
  return (
    tableTokens()[tableId] ??
    (resume?.tableId === tableId ? resume.playerToken : null) ??
    readOnlineResumes(local).find((record) => record.tableId === tableId)?.playerToken ??
    null
  );
}

function saveTableSession({ tableId, playerToken }: Access): void {
  const tokens = tableTokens();
  tokens[tableId] = playerToken;
  writeJson(session, TABLE_TOKENS_KEY, tokens);
}

export function forgetTableSession(tableId: string): void {
  const tokens = tableTokens();
  delete tokens[tableId];
  writeJson(session, TABLE_TOKENS_KEY, tokens);
}

export function getPrivateSession(): Access | null {
  return readJson(session, PRIVATE_SESSION_KEY, null, isRecord) as Access | null;
}

export function setPrivateSession(access: Access | null): void {
  if (access) writeJson(session, PRIVATE_SESSION_KEY, { tableId: access.tableId, playerToken: access.playerToken });
  else session.removeItem(PRIVATE_SESSION_KEY);
}

export function tableRequest(method: string, value?: unknown, tableId?: string): RequestInit {
  const token = tableId ? tableToken(tableId) : null;
  return {
    method,
    headers: {
      ...(value === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: value === undefined ? undefined : JSON.stringify(value)
  };
}

// The newest snapshot of each table, from the API's answers and the table's event stream.
export const latestSnapshots = new Map<string, Snapshot>();

export function rememberSnapshot(snapshot: Snapshot): Snapshot {
  const known = latestSnapshots.get(snapshot.tableId);
  if (!known || known.version <= snapshot.version) latestSnapshots.set(snapshot.tableId, snapshot);
  return snapshot;
}

async function access(url: string, body?: unknown): Promise<Access> {
  const granted = await apiJson<Access>(url, tableRequest("POST", body));
  saveTableSession(granted);
  return granted;
}

export const api = {
  createTable: (body: Record<string, unknown>) => access("/api/tables", body),
  join: (code: string, playerName: string) => access("/api/tables/join", { code, playerName }),
  watch: (code: string) => access("/api/tables/watch", { code }),
  quickMatch: (variant: string, playerName: string) => access("/api/matchmaking/quick-match", { variant, playerName }),
  startDaily: () => access("/api/daily"),
  async table(tableId: string): Promise<Snapshot> {
    return rememberSnapshot(await apiJson<Snapshot>(`/api/tables/${tableId}`, tableRequest("GET", undefined, tableId)));
  },
  hint: (tableId: string) => apiJson<Hint>(`/api/tables/${tableId}/hint`, tableRequest("GET", undefined, tableId)),
  explanations: (tableId: string) => apiJson<any[]>(`/api/tables/${tableId}/explanations`, tableRequest("GET", undefined, tableId)),
  analysis: (tableId: string) => apiJson<any>(`/api/tables/${tableId}/analysis`, tableRequest("GET", undefined, tableId)),
  streamTicket: (tableId: string) => apiJson<{ ticket: string }>(`/api/tables/${tableId}/stream-ticket`, tableRequest("POST", undefined, tableId)),
  async act(tableId: string, action: Action): Promise<Snapshot> {
    const known = latestSnapshots.get(tableId)?.version ?? -1;
    try {
      return rememberSnapshot(await apiJson<Snapshot>(`/api/tables/${tableId}/actions`, tableRequest("POST", action, tableId)));
    } catch (error) {
      if (!(error as ApiError).network) throw error;
      // No answer: the move may still have arrived. A newer table than the one known means it did (US-141).
      const fresh = await api.table(tableId).catch(() => null);
      if (fresh && fresh.version > known) return fresh;
      throw error;
    }
  }
};

export async function currentSnapshot(tableId: string): Promise<Snapshot> {
  return latestSnapshots.get(tableId) ?? api.table(tableId);
}
