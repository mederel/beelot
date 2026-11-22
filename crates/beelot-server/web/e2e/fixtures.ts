// The server limits requests per client address (300 a window), and every test here comes from one machine. The server is
// started with BEELOT_TRUST_FORWARDED_HEADERS=true, and each test is a client of its own through X-Forwarded-For.
let nextClient = 1;

// Every test starts in English, at the quick pace, and fails on a script error or a content security policy violation.
import { expect, test as base } from "@playwright/test";

export const test = base.extend<{ problems: string[] }>({
  problems: [
    async ({ page, context }, use) => {
      const problems: string[] = [];
      const client = nextClient++ + Math.floor(Math.random() * 60000) * 256;
      await context.setExtraHTTPHeaders({ "X-Forwarded-For": `10.${(client >> 16) & 255}.${(client >> 8) & 255}.${client & 255}` });
      await context.addInitScript(() => {
        try {
          localStorage.setItem("beelot.language", "en");
          localStorage.setItem("beelot.pace", "quick");
        } catch {
          /* storage is blocked: the defaults apply */
        }
      });
      page.on("pageerror", (error) => problems.push(`script error: ${error.message}`));
      page.on("response", (response) => {
        if (response.status() === 429) problems.push(`rate limited (start the server with BEELOT_TRUST_FORWARDED_HEADERS=true): ${response.url()}`);
      });
      page.on("console", (message) => {
        if (/Content Security Policy|violat/i.test(message.text())) problems.push(`policy: ${message.text()}`);
      });
      await use(problems);
      expect(problems).toEqual([]);
    },
    { auto: true }
  ]
});

export { expect };
