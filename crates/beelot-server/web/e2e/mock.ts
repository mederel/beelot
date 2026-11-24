// The server's answers, served from the page's side, for the checks that look at a screen and not at the game behind it: the
// recorded snapshots of tests/contract (the contract the server and the page share) are what a table shows, so a screen is
// reached in one step instead of a dozen tricks of play. Any other API call finds nothing, as it does for a table without it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

export const TABLE_ID = "01234567-89ab-cdef-0123-456789abcdef";

export type Snapshot = Record<string, any>;

/** A recorded snapshot of tests/contract, as a fresh copy that a test may change. */
export function fixture(name: string): Snapshot {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../../tests/contract/${name}.json`, import.meta.url)), "utf8"));
}

export interface Answers {
  /** The snapshot of the table the page opens. */
  table?: Snapshot;
  /** The account: a guest by default. */
  account?: Record<string, unknown>;
  /** Other answers by path (and query), e.g. `"/api/friends": { … }`; a status other than 200 as `{ status, json }`. */
  routes?: Record<string, unknown | { status: number; json?: unknown }>;
}

export async function serveApi(page: Page, answers: Answers = {}): Promise<void> {
  // Playwright tries the routes last-registered first, so the catch-all goes first.
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route) => route.fulfill({ status: 404, json: {} })
  );
  const serve = (match: (url: URL) => boolean, json: unknown) =>
    page.route(
      (url) => url.pathname.startsWith("/api/") && match(url),
      (route) => {
        const answer = json as { status?: number; json?: unknown } | undefined;
        if (answer && typeof answer === "object" && "status" in answer && typeof answer.status === "number")
          return route.fulfill({ status: answer.status, json: answer.json ?? {} });
        return route.fulfill({ json });
      }
    );
  for (const [path, json] of Object.entries(answers.routes ?? {})) await serve((url) => url.pathname + url.search === path || url.pathname === path, json);
  await serve((url) => url.pathname === "/api/account", answers.account ?? { signedIn: false });
  if (answers.table) {
    const id = answers.table.tableId ?? TABLE_ID;
    await serve((url) => url.pathname === `/api/tables/${id}`, answers.table);
  }
}
