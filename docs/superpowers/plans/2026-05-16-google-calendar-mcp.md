# google-calendar-mcp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standalone multi-account Google Calendar MCP server that lets an agent list/read/create/update/delete events and query free/busy across several connected Google accounts.

**Architecture:** Fork of `gmail-mcp`'s module layout. Reuse OAuth loopback flow, per-account token store, client registry, MCPB packaging verbatim or with mechanical renames; replace the Gmail API layer with a Google Calendar layer (`calendar-client.ts`), rewrite `tools.ts`/`handlers.ts` for calendar operations.

**Tech Stack:** TypeScript (ESM, NodeNext), `@modelcontextprotocol/sdk`, `googleapis`, `open`, `vitest`.

Reference source (read-only): `/Users/chienchuanw/Documents/gmail-mcp/src/`.

---

## File structure

| File | Responsibility |
|---|---|
| `src/index.ts` | Entry: route `auth` → CLI, else stdio server |
| `src/server.ts` | MCP server wiring |
| `src/config.ts` | `~/.gcal-mcp` dir resolution, `GCAL_MCP_CONFIG_DIR` |
| `src/accounts.ts` | Per-account token JSON store |
| `src/oauth.ts` | OAuth2 client + calendar scopes + token refresh |
| `src/auth-flow.ts` | Interactive loopback auth; email via primary calendar id |
| `src/client-registry.ts` | Cache authed `CalendarClient` per account |
| `src/calendar-client.ts` | Google Calendar API wrapper (the novel layer) |
| `src/tools.ts` | MCP tool schemas |
| `src/handlers.ts` | Dispatch tool → `CalendarClient` method |
| `src/cli.ts` | `auth add/list/remove <alias>` |
| `manifest.json`, `scripts/build-mcpb.sh`, `README.md` | Packaging & docs |

Each `src/*.ts` has a sibling `*.test.ts`.

---

### Task 0: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `.gitignore`, `vitest.config.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "google-calendar-mcp",
  "version": "0.1.0",
  "description": "Multi-account Google Calendar MCP server — read, create, update, delete and analyze calendars across several Google accounts.",
  "license": "MIT",
  "type": "module",
  "bin": { "gcal-mcp": "dist/index.js" },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "start": "node dist/index.js",
    "dev": "npm run build && node dist/index.js",
    "auth": "node dist/index.js auth",
    "prepare": "npm run build"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "googleapis": "^144.0.0",
    "open": "^10.1.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  },
  "engines": { "node": ">=18.0.0" }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": false,
    "sourceMap": false
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules
dist
build
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: completes, creates `node_modules/` and `package-lock.json`.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json tsconfig.build.json .gitignore vitest.config.ts package-lock.json
git commit -m "chore: scaffold google-calendar-mcp project"
```

---

### Task 1: config.ts

**Files:**
- Create: `src/config.ts`, `src/config.test.ts`

- [ ] **Step 1: Write the failing test**

`src/config.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import * as os from "os";
import * as path from "path";
import { getConfigDir, getCredentialsPath, getAccountsDir, getAccountPath } from "./config.js";

describe("config", () => {
  const orig = process.env.GCAL_MCP_CONFIG_DIR;
  afterEach(() => {
    if (orig === undefined) delete process.env.GCAL_MCP_CONFIG_DIR;
    else process.env.GCAL_MCP_CONFIG_DIR = orig;
  });

  it("defaults to ~/.gcal-mcp", () => {
    delete process.env.GCAL_MCP_CONFIG_DIR;
    expect(getConfigDir()).toBe(path.join(os.homedir(), ".gcal-mcp"));
  });

  it("honors GCAL_MCP_CONFIG_DIR and expands ~", () => {
    process.env.GCAL_MCP_CONFIG_DIR = "~/custom-gcal";
    expect(getConfigDir()).toBe(path.join(os.homedir(), "custom-gcal"));
  });

  it("derives credentials, accounts dir and account path", () => {
    process.env.GCAL_MCP_CONFIG_DIR = "/tmp/gcal";
    expect(getCredentialsPath()).toBe("/tmp/gcal/credentials.json");
    expect(getAccountsDir()).toBe("/tmp/gcal/accounts");
    expect(getAccountPath("work")).toBe("/tmp/gcal/accounts/work.json");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config.test.ts`
Expected: FAIL — cannot resolve `./config.js`.

- [ ] **Step 3: Write `src/config.ts`**

```ts
import * as os from "os";
import * as path from "path";

function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function getConfigDir(): string {
  const fromEnv = process.env.GCAL_MCP_CONFIG_DIR;
  return fromEnv && fromEnv.length > 0 ? expandHome(fromEnv) : path.join(os.homedir(), ".gcal-mcp");
}

export function getCredentialsPath(): string {
  return path.join(getConfigDir(), "credentials.json");
}

export function getAccountsDir(): string {
  return path.join(getConfigDir(), "accounts");
}

export function getAccountPath(alias: string): string {
  return path.join(getAccountsDir(), `${alias}.json`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat: add config dir resolution"
```

---

### Task 2: accounts.ts

**Files:**
- Create: `src/accounts.ts`, `src/accounts.test.ts`

- [ ] **Step 1: Write the failing test**

`src/accounts.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AccountStore } from "./accounts.js";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gcal-acc-"));
}

describe("AccountStore", () => {
  let dir: string;
  let store: AccountStore;
  beforeEach(() => {
    dir = path.join(tmpDir(), "accounts");
    store = new AccountStore(dir);
  });

  it("returns empty list when dir missing", () => {
    expect(store.list()).toEqual([]);
  });

  it("adds, gets, lists and removes accounts", () => {
    store.add({ alias: "work", email: "w@x.com", token: { access_token: "a" } });
    expect(store.has("work")).toBe(true);
    expect(store.get("work")?.email).toBe("w@x.com");
    expect(store.list()).toEqual([{ alias: "work", email: "w@x.com" }]);
    store.remove("work");
    expect(store.has("work")).toBe(false);
  });

  it("saveToken updates token of existing account", () => {
    store.add({ alias: "p", email: "p@x.com", token: { access_token: "old" } });
    store.saveToken("p", { access_token: "new" });
    expect(store.get("p")?.token.access_token).toBe("new");
  });

  it("saveToken throws for unknown account", () => {
    expect(() => store.saveToken("nope", {})).toThrow(/No such account/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/accounts.test.ts`
Expected: FAIL — cannot resolve `./accounts.js`.

- [ ] **Step 3: Write `src/accounts.ts`**

```ts
import * as fs from "fs";
import * as path from "path";

export interface TokenData {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
  id_token?: string;
}

export interface AccountRecord {
  alias: string;
  email: string;
  token: TokenData;
}

export interface AccountSummary {
  alias: string;
  email: string;
}

export class AccountStore {
  constructor(private readonly accountsDir: string) {}

  private fileFor(alias: string): string {
    return path.join(this.accountsDir, `${alias}.json`);
  }

  list(): AccountSummary[] {
    if (!fs.existsSync(this.accountsDir)) return [];
    return fs
      .readdirSync(this.accountsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const rec = JSON.parse(fs.readFileSync(path.join(this.accountsDir, f), "utf-8")) as AccountRecord;
        return { alias: rec.alias, email: rec.email };
      });
  }

  get(alias: string): AccountRecord | null {
    const p = this.fileFor(alias);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8")) as AccountRecord;
  }

  has(alias: string): boolean {
    return fs.existsSync(this.fileFor(alias));
  }

  add(record: AccountRecord): void {
    fs.mkdirSync(this.accountsDir, { recursive: true });
    fs.writeFileSync(this.fileFor(record.alias), JSON.stringify(record, null, 2));
  }

  remove(alias: string): void {
    const p = this.fileFor(alias);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  saveToken(alias: string, token: TokenData): void {
    const rec = this.get(alias);
    if (!rec) throw new Error(`No such account: ${alias}`);
    rec.token = token;
    this.add(rec);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/accounts.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/accounts.ts src/accounts.test.ts
git commit -m "feat: add per-account token store"
```

---

### Task 3: oauth.ts

**Files:**
- Create: `src/oauth.ts`, `src/oauth.test.ts`

- [ ] **Step 1: Write the failing test**

`src/oauth.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { CALENDAR_SCOPES, OAUTH_REDIRECT_URI, createOAuth2Client, refreshIfExpired } from "./oauth.js";

describe("oauth", () => {
  it("requests calendar scopes", () => {
    expect(CALENDAR_SCOPES).toContain("https://www.googleapis.com/auth/calendar");
    expect(CALENDAR_SCOPES).toContain("https://www.googleapis.com/auth/calendar.events");
  });

  it("uses loopback redirect on port 3000", () => {
    expect(OAUTH_REDIRECT_URI).toBe("http://127.0.0.1:3000/oauth2callback");
  });

  it("createOAuth2Client throws on malformed credentials", () => {
    expect(() => createOAuth2Client({} as any)).toThrow(/installed.*web/);
  });

  it("refreshIfExpired refreshes and reports new token when expired", async () => {
    const onRefresh = vi.fn();
    const fake: any = {
      credentials: { expiry_date: Date.now() - 1000 },
      refreshAccessToken: vi.fn().mockResolvedValue({ credentials: { access_token: "new" } }),
      setCredentials: vi.fn(),
    };
    await refreshIfExpired(fake, onRefresh);
    expect(onRefresh).toHaveBeenCalledWith({ access_token: "new" });
  });

  it("refreshIfExpired does nothing when token still valid", async () => {
    const onRefresh = vi.fn();
    const fake: any = { credentials: { expiry_date: Date.now() + 60000 }, refreshAccessToken: vi.fn() };
    await refreshIfExpired(fake, onRefresh);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/oauth.test.ts`
Expected: FAIL — cannot resolve `./oauth.js`.

- [ ] **Step 3: Write `src/oauth.ts`**

```ts
import * as fs from "fs";
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { getCredentialsPath } from "./config.js";
import type { TokenData } from "./accounts.js";

export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
];

/** Port the interactive auth flow's local callback server listens on. */
export const OAUTH_CALLBACK_PORT = 3000;

/**
 * Loopback redirect URI for the interactive auth flow. We always use this
 * address/port/path because that is exactly what the local callback server
 * (auth-flow.ts) listens on. We deliberately ignore `redirect_uris` in
 * credentials.json — a downloaded "Desktop app" client lists `http://localhost`
 * (port 80, no path), which would never reach our server. Google permits any
 * loopback redirect for Desktop clients, so this works.
 */
export const OAUTH_REDIRECT_URI = `http://127.0.0.1:${OAUTH_CALLBACK_PORT}/oauth2callback`;

export interface OAuthClientConfig {
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
}

export interface OAuthCredentialsFile {
  installed?: OAuthClientConfig;
  web?: OAuthClientConfig;
}

export function loadOAuthCredentials(credentialsPath: string = getCredentialsPath()): OAuthCredentialsFile | null {
  if (!fs.existsSync(credentialsPath)) return null;
  return JSON.parse(fs.readFileSync(credentialsPath, "utf-8")) as OAuthCredentialsFile;
}

export function createOAuth2Client(creds: OAuthCredentialsFile): OAuth2Client {
  const cfg = creds.installed ?? creds.web;
  if (!cfg) throw new Error("Invalid credentials.json: expected an 'installed' or 'web' key");
  return new google.auth.OAuth2(cfg.client_id, cfg.client_secret, OAUTH_REDIRECT_URI);
}

/** If the client's token has expired, refresh it and invoke onRefresh with the new token. */
export async function refreshIfExpired(client: OAuth2Client, onRefresh: (token: TokenData) => void): Promise<void> {
  const expiry = client.credentials.expiry_date;
  if (expiry && expiry <= Date.now()) {
    const { credentials } = await client.refreshAccessToken();
    client.setCredentials(credentials);
    onRefresh(credentials as TokenData);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/oauth.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/oauth.ts src/oauth.test.ts
git commit -m "feat: add OAuth2 client with calendar scopes"
```

---

### Task 4: auth-flow.ts

**Files:**
- Create: `src/auth-flow.ts`, `src/auth-flow.test.ts`

Note: unlike gmail-mcp (which read the email from the Gmail profile), the account
email here is the **id of the `primary` calendar** (`calendar.calendarList.get`),
which avoids requesting any extra userinfo scope.

- [ ] **Step 1: Write the failing test**

`src/auth-flow.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { buildAuthUrl, exchangeCodeForToken, runInteractiveAuth } from "./auth-flow.js";

describe("auth-flow", () => {
  it("buildAuthUrl requests offline access and consent", () => {
    const client: any = { generateAuthUrl: vi.fn().mockReturnValue("https://auth") };
    const url = buildAuthUrl(client);
    expect(url).toBe("https://auth");
    const arg = client.generateAuthUrl.mock.calls[0][0];
    expect(arg.access_type).toBe("offline");
    expect(arg.prompt).toBe("consent");
    expect(arg.scope).toContain("https://www.googleapis.com/auth/calendar");
  });

  it("exchangeCodeForToken sets credentials and returns tokens", async () => {
    const client: any = {
      getToken: vi.fn().mockResolvedValue({ tokens: { access_token: "t" } }),
      setCredentials: vi.fn(),
    };
    const tok = await exchangeCodeForToken(client, "code123");
    expect(tok).toEqual({ access_token: "t" });
    expect(client.setCredentials).toHaveBeenCalledWith({ access_token: "t" });
  });

  it("runInteractiveAuth wires url -> code -> token -> email", async () => {
    const client: any = {
      generateAuthUrl: vi.fn().mockReturnValue("https://auth"),
      getToken: vi.fn().mockResolvedValue({ tokens: { access_token: "t" } }),
      setCredentials: vi.fn(),
    };
    const result = await runInteractiveAuth(client, {
      openBrowser: () => {},
      waitForCode: async () => "code123",
      fetchEmail: async () => "me@x.com",
    });
    expect(result).toEqual({ email: "me@x.com", token: { access_token: "t" } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/auth-flow.test.ts`
Expected: FAIL — cannot resolve `./auth-flow.js`.

- [ ] **Step 3: Write `src/auth-flow.ts`**

```ts
import * as http from "http";
import { URL } from "url";
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { CALENDAR_SCOPES, OAUTH_CALLBACK_PORT } from "./oauth.js";
import type { TokenData } from "./accounts.js";

export function buildAuthUrl(client: OAuth2Client): string {
  return client.generateAuthUrl({ access_type: "offline", scope: CALENDAR_SCOPES, prompt: "consent" });
}

export async function exchangeCodeForToken(client: OAuth2Client, code: string): Promise<TokenData> {
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  return tokens as TokenData;
}

/** The account email is the id of the primary calendar. */
export async function fetchAccountEmail(client: OAuth2Client): Promise<string> {
  const calendar = google.calendar({ version: "v3", auth: client });
  const res = await calendar.calendarList.get({ calendarId: "primary" });
  return res.data.id ?? "";
}

/** Start a one-shot HTTP server on `port` and resolve with the OAuth `code`. */
export function waitForAuthCode(port = OAUTH_CALLBACK_PORT): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "", `http://127.0.0.1:${port}`);
      if (url.pathname !== "/oauth2callback") {
        res.writeHead(404);
        res.end();
        return;
      }
      const code = url.searchParams.get("code");
      if (code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><h1>Authenticated.</h1><p>You can close this window.</p></body></html>");
        server.close();
        resolve(code);
      } else {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<html><body><h1>No authorization code received.</h1></body></html>");
        server.close();
        reject(new Error("No authorization code received"));
      }
    });
    server.on("error", reject);
    server.listen(port, "127.0.0.1");
  });
}

export interface InteractiveAuthOpts {
  openBrowser?: (url: string) => void;
  port?: number;
  waitForCode?: (port: number) => Promise<string>;
  fetchEmail?: (client: OAuth2Client) => Promise<string>;
}

/** Full interactive flow: open the browser, capture the code, exchange it, fetch the email. */
export async function runInteractiveAuth(
  client: OAuth2Client,
  opts: InteractiveAuthOpts = {},
): Promise<{ email: string; token: TokenData }> {
  const port = opts.port ?? OAUTH_CALLBACK_PORT;
  const authUrl = buildAuthUrl(client);
  const openBrowser =
    opts.openBrowser ??
    ((url: string) => {
      void import("open").then((m) => m.default(url));
    });
  const waitForCode = opts.waitForCode ?? waitForAuthCode;
  const fetchEmail = opts.fetchEmail ?? fetchAccountEmail;
  console.error(`\nAuthorize this app by visiting:\n${authUrl}\n`);
  openBrowser(authUrl);
  const code = await waitForCode(port);
  const token = await exchangeCodeForToken(client, code);
  const email = await fetchEmail(client);
  return { email, token };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/auth-flow.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/auth-flow.ts src/auth-flow.test.ts
git commit -m "feat: add interactive OAuth loopback flow"
```

---

### Task 5: calendar-client.ts — listCalendars

**Files:**
- Create: `src/calendar-client.ts`, `src/calendar-client.test.ts`

The client wraps a `calendar_v3.Calendar`-shaped object so tests can inject a
mock with `{ calendarList, events, freebusy }`.

- [ ] **Step 1: Write the failing test**

`src/calendar-client.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { CalendarClient } from "./calendar-client.js";

function mockApi(overrides: any = {}) {
  return {
    calendarList: { list: vi.fn(), get: vi.fn(), ...overrides.calendarList },
    events: { list: vi.fn(), get: vi.fn(), insert: vi.fn(), patch: vi.fn(), delete: vi.fn(), ...overrides.events },
    freebusy: { query: vi.fn(), ...overrides.freebusy },
  };
}

describe("CalendarClient.listCalendars", () => {
  it("returns normalized calendar summaries", async () => {
    const api = mockApi({
      calendarList: {
        list: vi.fn().mockResolvedValue({
          data: {
            items: [
              { id: "me@x.com", summary: "Me", primary: true, accessRole: "owner", timeZone: "UTC" },
              { id: "team@x.com", summary: "Team", accessRole: "reader", timeZone: "UTC" },
            ],
          },
        }),
      },
    });
    const c = new CalendarClient(api as any);
    expect(await c.listCalendars()).toEqual([
      { id: "me@x.com", summary: "Me", primary: true, accessRole: "owner", timeZone: "UTC" },
      { id: "team@x.com", summary: "Team", primary: false, accessRole: "reader", timeZone: "UTC" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/calendar-client.test.ts`
Expected: FAIL — cannot resolve `./calendar-client.js`.

- [ ] **Step 3: Write `src/calendar-client.ts`**

```ts
import type { calendar_v3 } from "googleapis";

export interface CalendarSummary {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string;
  timeZone: string;
}

export interface NormalizedEvent {
  id: string;
  calendarId: string;
  summary: string;
  status: string;
  start: string;
  end: string;
  location?: string;
  htmlLink?: string;
  attendees: { email: string; responseStatus: string }[];
}

export interface ListEventsParams {
  calendarIds?: string[];
  timeMin?: string;
  timeMax?: string;
  query?: string;
  maxResults?: number;
  singleEvents?: boolean;
  showDeleted?: boolean;
}

export interface FreeBusyParams {
  calendarIds?: string[];
  timeMin: string;
  timeMax: string;
}

export type SendUpdates = "all" | "externalOnly" | "none";

function whenOf(p?: calendar_v3.Schema$EventDateTime): string {
  return p?.dateTime ?? p?.date ?? "";
}

function normalizeEvent(calendarId: string, e: calendar_v3.Schema$Event): NormalizedEvent {
  return {
    id: e.id ?? "",
    calendarId,
    summary: e.summary ?? "(no title)",
    status: e.status ?? "confirmed",
    start: whenOf(e.start ?? undefined),
    end: whenOf(e.end ?? undefined),
    location: e.location ?? undefined,
    htmlLink: e.htmlLink ?? undefined,
    attendees: (e.attendees ?? []).map((a) => ({
      email: a.email ?? "",
      responseStatus: a.responseStatus ?? "needsAction",
    })),
  };
}

export class CalendarClient {
  constructor(private readonly api: calendar_v3.Calendar) {}

  async listCalendars(): Promise<CalendarSummary[]> {
    const res = await this.api.calendarList.list();
    return (res.data.items ?? []).map((c) => ({
      id: c.id ?? "",
      summary: c.summary ?? "",
      primary: c.primary === true,
      accessRole: c.accessRole ?? "",
      timeZone: c.timeZone ?? "",
    }));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/calendar-client.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/calendar-client.ts src/calendar-client.test.ts
git commit -m "feat: add CalendarClient.listCalendars"
```

---

### Task 6: calendar-client.ts — listEvents (multi-calendar merge)

**Files:**
- Modify: `src/calendar-client.ts`, `src/calendar-client.test.ts`

- [ ] **Step 1: Add the failing test** (append to `describe`s in `src/calendar-client.test.ts`)

```ts
describe("CalendarClient.listEvents", () => {
  it("defaults to primary, normalizes events", async () => {
    const list = vi.fn().mockResolvedValue({
      data: { items: [{ id: "1", summary: "A", start: { dateTime: "2026-05-16T10:00:00Z" }, end: { dateTime: "2026-05-16T11:00:00Z" } }] },
    });
    const c = new CalendarClient(mockApi({ events: { list } }) as any);
    const out = await c.listEvents({ timeMin: "2026-05-16T00:00:00Z", timeMax: "2026-05-17T00:00:00Z" });
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ calendarId: "primary", singleEvents: true, showDeleted: false, orderBy: "startTime" }),
    );
    expect(out).toEqual([
      { id: "1", calendarId: "primary", summary: "A", status: "confirmed", start: "2026-05-16T10:00:00Z", end: "2026-05-16T11:00:00Z", location: undefined, htmlLink: undefined, attendees: [] },
    ]);
  });

  it("merges multiple calendars and sorts by start", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ data: { items: [{ id: "late", start: { dateTime: "2026-05-16T15:00:00Z" }, end: { dateTime: "2026-05-16T16:00:00Z" } }] } })
      .mockResolvedValueOnce({ data: { items: [{ id: "early", start: { dateTime: "2026-05-16T09:00:00Z" }, end: { dateTime: "2026-05-16T10:00:00Z" } }] } });
    const c = new CalendarClient(mockApi({ events: { list } }) as any);
    const out = await c.listEvents({ calendarIds: ["a", "b"], timeMin: "x", timeMax: "y" });
    expect(out.map((e) => e.id)).toEqual(["early", "late"]);
    expect(out.map((e) => e.calendarId)).toEqual(["b", "a"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/calendar-client.test.ts`
Expected: FAIL — `listEvents is not a function`.

- [ ] **Step 3: Add `listEvents` to `CalendarClient`** (insert after `listCalendars`)

```ts
  async listEvents(params: ListEventsParams): Promise<NormalizedEvent[]> {
    const calendarIds = params.calendarIds?.length ? params.calendarIds : ["primary"];
    const perCalendar = await Promise.all(
      calendarIds.map(async (calendarId) => {
        const res = await this.api.events.list({
          calendarId,
          timeMin: params.timeMin,
          timeMax: params.timeMax,
          q: params.query,
          maxResults: params.maxResults ?? 250,
          singleEvents: params.singleEvents ?? true,
          showDeleted: params.showDeleted ?? false,
          orderBy: "startTime",
        });
        return (res.data.items ?? []).map((e) => normalizeEvent(calendarId, e));
      }),
    );
    return perCalendar.flat().sort((a, b) => a.start.localeCompare(b.start));
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/calendar-client.test.ts`
Expected: PASS (3 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/calendar-client.ts src/calendar-client.test.ts
git commit -m "feat: add CalendarClient.listEvents with multi-calendar merge"
```

---

### Task 7: calendar-client.ts — getEvent

**Files:**
- Modify: `src/calendar-client.ts`, `src/calendar-client.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
describe("CalendarClient.getEvent", () => {
  it("returns normalized event for given calendar", async () => {
    const get = vi.fn().mockResolvedValue({ data: { id: "e1", summary: "Sync", start: { date: "2026-05-16" }, end: { date: "2026-05-17" }, attendees: [{ email: "a@x.com", responseStatus: "accepted" }] } });
    const c = new CalendarClient(mockApi({ events: { get } }) as any);
    const out = await c.getEvent("team@x.com", "e1");
    expect(get).toHaveBeenCalledWith({ calendarId: "team@x.com", eventId: "e1" });
    expect(out).toEqual({ id: "e1", calendarId: "team@x.com", summary: "Sync", status: "confirmed", start: "2026-05-16", end: "2026-05-17", location: undefined, htmlLink: undefined, attendees: [{ email: "a@x.com", responseStatus: "accepted" }] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/calendar-client.test.ts`
Expected: FAIL — `getEvent is not a function`.

- [ ] **Step 3: Add `getEvent`** (after `listEvents`)

```ts
  async getEvent(calendarId: string, eventId: string): Promise<NormalizedEvent> {
    const res = await this.api.events.get({ calendarId, eventId });
    return normalizeEvent(calendarId, res.data);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/calendar-client.test.ts`
Expected: PASS (4 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/calendar-client.ts src/calendar-client.test.ts
git commit -m "feat: add CalendarClient.getEvent"
```

---

### Task 8: calendar-client.ts — freeBusy

**Files:**
- Modify: `src/calendar-client.ts`, `src/calendar-client.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
describe("CalendarClient.freeBusy", () => {
  it("queries freebusy across calendars and returns busy blocks", async () => {
    const query = vi.fn().mockResolvedValue({ data: { calendars: { "primary": { busy: [{ start: "2026-05-16T10:00:00Z", end: "2026-05-16T11:00:00Z" }] } } } });
    const c = new CalendarClient(mockApi({ freebusy: { query } }) as any);
    const out = await c.freeBusy({ timeMin: "2026-05-16T00:00:00Z", timeMax: "2026-05-17T00:00:00Z" });
    expect(query).toHaveBeenCalledWith({
      requestBody: { timeMin: "2026-05-16T00:00:00Z", timeMax: "2026-05-17T00:00:00Z", items: [{ id: "primary" }] },
    });
    expect(out).toEqual({ primary: [{ start: "2026-05-16T10:00:00Z", end: "2026-05-16T11:00:00Z" }] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/calendar-client.test.ts`
Expected: FAIL — `freeBusy is not a function`.

- [ ] **Step 3: Add `freeBusy`** (after `getEvent`)

```ts
  async freeBusy(params: FreeBusyParams): Promise<Record<string, { start: string; end: string }[]>> {
    const calendarIds = params.calendarIds?.length ? params.calendarIds : ["primary"];
    const res = await this.api.freebusy.query({
      requestBody: {
        timeMin: params.timeMin,
        timeMax: params.timeMax,
        items: calendarIds.map((id) => ({ id })),
      },
    });
    const calendars = res.data.calendars ?? {};
    const out: Record<string, { start: string; end: string }[]> = {};
    for (const [id, info] of Object.entries(calendars)) {
      out[id] = (info.busy ?? []).map((b) => ({ start: b.start ?? "", end: b.end ?? "" }));
    }
    return out;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/calendar-client.test.ts`
Expected: PASS (5 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/calendar-client.ts src/calendar-client.test.ts
git commit -m "feat: add CalendarClient.freeBusy"
```

---

### Task 9: calendar-client.ts — createEvent (sendUpdates defaults to none)

**Files:**
- Modify: `src/calendar-client.ts`, `src/calendar-client.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
describe("CalendarClient.createEvent", () => {
  it("inserts with sendUpdates=none by default and echoes it", async () => {
    const insert = vi.fn().mockResolvedValue({ data: { id: "new1", htmlLink: "http://l" } });
    const c = new CalendarClient(mockApi({ events: { insert } }) as any);
    const out = await c.createEvent("primary", { summary: "Hi" });
    expect(insert).toHaveBeenCalledWith({ calendarId: "primary", sendUpdates: "none", requestBody: { summary: "Hi" } });
    expect(out).toEqual({ id: "new1", htmlLink: "http://l", sendUpdates: "none" });
  });

  it("honors explicit sendUpdates", async () => {
    const insert = vi.fn().mockResolvedValue({ data: { id: "n2" } });
    const c = new CalendarClient(mockApi({ events: { insert } }) as any);
    const out = await c.createEvent("primary", { summary: "Hi" }, "all");
    expect(insert).toHaveBeenCalledWith({ calendarId: "primary", sendUpdates: "all", requestBody: { summary: "Hi" } });
    expect(out.sendUpdates).toBe("all");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/calendar-client.test.ts`
Expected: FAIL — `createEvent is not a function`.

- [ ] **Step 3: Add `createEvent`** (after `freeBusy`)

```ts
  async createEvent(
    calendarId: string,
    event: calendar_v3.Schema$Event,
    sendUpdates: SendUpdates = "none",
  ): Promise<{ id: string; htmlLink?: string; sendUpdates: SendUpdates }> {
    const res = await this.api.events.insert({ calendarId, sendUpdates, requestBody: event });
    return { id: res.data.id ?? "", htmlLink: res.data.htmlLink ?? undefined, sendUpdates };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/calendar-client.test.ts`
Expected: PASS (7 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/calendar-client.ts src/calendar-client.test.ts
git commit -m "feat: add CalendarClient.createEvent (notifications opt-in)"
```

---

### Task 10: calendar-client.ts — updateEvent (patch semantics)

**Files:**
- Modify: `src/calendar-client.ts`, `src/calendar-client.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
describe("CalendarClient.updateEvent", () => {
  it("patches only provided fields, sendUpdates=none by default", async () => {
    const patch = vi.fn().mockResolvedValue({ data: { id: "e1", htmlLink: "http://l" } });
    const c = new CalendarClient(mockApi({ events: { patch } }) as any);
    const out = await c.updateEvent("primary", "e1", { summary: "Renamed" });
    expect(patch).toHaveBeenCalledWith({ calendarId: "primary", eventId: "e1", sendUpdates: "none", requestBody: { summary: "Renamed" } });
    expect(out).toEqual({ id: "e1", htmlLink: "http://l", sendUpdates: "none" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/calendar-client.test.ts`
Expected: FAIL — `updateEvent is not a function`.

- [ ] **Step 3: Add `updateEvent`** (after `createEvent`)

```ts
  async updateEvent(
    calendarId: string,
    eventId: string,
    patch: calendar_v3.Schema$Event,
    sendUpdates: SendUpdates = "none",
  ): Promise<{ id: string; htmlLink?: string; sendUpdates: SendUpdates }> {
    const res = await this.api.events.patch({ calendarId, eventId, sendUpdates, requestBody: patch });
    return { id: res.data.id ?? "", htmlLink: res.data.htmlLink ?? undefined, sendUpdates };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/calendar-client.test.ts`
Expected: PASS (8 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/calendar-client.ts src/calendar-client.test.ts
git commit -m "feat: add CalendarClient.updateEvent (patch semantics)"
```

---

### Task 11: calendar-client.ts — deleteEvent (attendee guard, echo body)

**Files:**
- Modify: `src/calendar-client.ts`, `src/calendar-client.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
describe("CalendarClient.deleteEvent", () => {
  it("refuses to delete an event with attendees unless confirm=true", async () => {
    const get = vi.fn().mockResolvedValue({ data: { id: "e1", summary: "Mtg", start: { dateTime: "t" }, end: { dateTime: "t2" }, attendees: [{ email: "a@x.com" }] } });
    const del = vi.fn();
    const c = new CalendarClient(mockApi({ events: { get, delete: del } }) as any);
    await expect(c.deleteEvent("primary", "e1")).rejects.toThrow(/has attendees.*confirm/i);
    expect(del).not.toHaveBeenCalled();
  });

  it("deletes and returns the prior event body when confirmed", async () => {
    const get = vi.fn().mockResolvedValue({ data: { id: "e1", summary: "Mtg", start: { dateTime: "t" }, end: { dateTime: "t2" }, attendees: [{ email: "a@x.com", responseStatus: "accepted" }] } });
    const del = vi.fn().mockResolvedValue({});
    const c = new CalendarClient(mockApi({ events: { get, delete: del } }) as any);
    const out = await c.deleteEvent("primary", "e1", "none", true);
    expect(del).toHaveBeenCalledWith({ calendarId: "primary", eventId: "e1", sendUpdates: "none" });
    expect(out.deleted.id).toBe("e1");
    expect(out.deleted.attendees).toEqual([{ email: "a@x.com", responseStatus: "accepted" }]);
    expect(out.sendUpdates).toBe("none");
  });

  it("deletes attendee-less event without confirm", async () => {
    const get = vi.fn().mockResolvedValue({ data: { id: "e2", summary: "Solo", start: { dateTime: "t" }, end: { dateTime: "t2" } } });
    const del = vi.fn().mockResolvedValue({});
    const c = new CalendarClient(mockApi({ events: { get, delete: del } }) as any);
    const out = await c.deleteEvent("primary", "e2");
    expect(del).toHaveBeenCalled();
    expect(out.deleted.id).toBe("e2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/calendar-client.test.ts`
Expected: FAIL — `deleteEvent is not a function`.

- [ ] **Step 3: Add `deleteEvent`** (after `updateEvent`)

```ts
  async deleteEvent(
    calendarId: string,
    eventId: string,
    sendUpdates: SendUpdates = "none",
    confirm = false,
  ): Promise<{ deleted: NormalizedEvent; sendUpdates: SendUpdates }> {
    const existing = await this.api.events.get({ calendarId, eventId });
    const deleted = normalizeEvent(calendarId, existing.data);
    if (deleted.attendees.length > 0 && !confirm) {
      throw new Error(
        `Event "${deleted.summary}" (${eventId}) has attendees; deleting will affect them. ` +
          `Re-call with confirm=true to proceed.`,
      );
    }
    await this.api.events.delete({ calendarId, eventId, sendUpdates });
    return { deleted, sendUpdates };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/calendar-client.test.ts`
Expected: PASS (11 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/calendar-client.ts src/calendar-client.test.ts
git commit -m "feat: add CalendarClient.deleteEvent with attendee guard"
```

---

### Task 12: client-registry.ts

**Files:**
- Create: `src/client-registry.ts`, `src/client-registry.test.ts`

- [ ] **Step 1: Write the failing test**

`src/client-registry.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { ClientRegistry } from "./client-registry.js";
import { AccountStore } from "./accounts.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

function storeWith(alias?: string): AccountStore {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gcal-reg-")), "accounts");
  const s = new AccountStore(dir);
  if (alias) s.add({ alias, email: `${alias}@x.com`, token: { access_token: "t", expiry_date: Date.now() + 60000 } });
  return s;
}

describe("ClientRegistry", () => {
  it("throws a helpful error for unknown alias", async () => {
    const reg = new ClientRegistry(storeWith(), {
      loadCredentials: () => ({ installed: { client_id: "i", client_secret: "s", redirect_uris: [] } }),
    });
    await expect(reg.getClient("ghost")).rejects.toThrow(/Unknown account "ghost"/);
  });

  it("throws when credentials.json missing", async () => {
    const reg = new ClientRegistry(storeWith("work"), { loadCredentials: () => null });
    await expect(reg.getClient("work")).rejects.toThrow(/No credentials.json/);
  });

  it("builds, caches and reuses a CalendarClient", async () => {
    const built = { tag: "calendar-client" };
    const buildCalendar = vi.fn().mockReturnValue(built);
    const reg = new ClientRegistry(storeWith("work"), {
      loadCredentials: () => ({ installed: { client_id: "i", client_secret: "s", redirect_uris: [] } }),
      createClient: () => ({ setCredentials: vi.fn() }) as any,
      refreshIfExpired: async () => {},
      buildCalendar: buildCalendar as any,
    });
    const a = await reg.getClient("work");
    const b = await reg.getClient("work");
    expect(a).toBe(built);
    expect(b).toBe(a);
    expect(buildCalendar).toHaveBeenCalledTimes(1);
  });

  it("maps refresh failure to a re-auth instruction", async () => {
    const reg = new ClientRegistry(storeWith("work"), {
      loadCredentials: () => ({ installed: { client_id: "i", client_secret: "s", redirect_uris: [] } }),
      createClient: () => ({ setCredentials: vi.fn() }) as any,
      refreshIfExpired: async () => {
        throw new Error("boom");
      },
    });
    await expect(reg.getClient("work")).rejects.toThrow(/gcal-mcp auth add work --force/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/client-registry.test.ts`
Expected: FAIL — cannot resolve `./client-registry.js`.

- [ ] **Step 3: Write `src/client-registry.ts`**

```ts
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { AccountStore, type TokenData } from "./accounts.js";
import { CalendarClient } from "./calendar-client.js";
import {
  loadOAuthCredentials,
  createOAuth2Client,
  refreshIfExpired,
  type OAuthCredentialsFile,
} from "./oauth.js";

export interface RegistryDeps {
  loadCredentials: () => OAuthCredentialsFile | null;
  createClient: (creds: OAuthCredentialsFile) => OAuth2Client;
  refreshIfExpired: (client: OAuth2Client, onRefresh: (token: TokenData) => void) => Promise<void>;
  buildCalendar: (auth: OAuth2Client) => CalendarClient;
}

const DEFAULT_DEPS: RegistryDeps = {
  loadCredentials: () => loadOAuthCredentials(),
  createClient: createOAuth2Client,
  refreshIfExpired,
  buildCalendar: (auth) => new CalendarClient(google.calendar({ version: "v3", auth })),
};

export class ClientRegistry {
  private readonly cache = new Map<string, CalendarClient>();
  private readonly deps: RegistryDeps;

  constructor(private readonly store: AccountStore, deps: Partial<RegistryDeps> = {}) {
    this.deps = { ...DEFAULT_DEPS, ...deps };
  }

  async getClient(alias: string): Promise<CalendarClient> {
    const cached = this.cache.get(alias);
    if (cached) return cached;

    const record = this.store.get(alias);
    if (!record) {
      const available = this.store.list().map((a) => a.alias);
      throw new Error(
        `Unknown account "${alias}". Available: ${available.length ? available.join(", ") : "(none)"}. ` +
          `Add one with: gcal-mcp auth add <alias>`,
      );
    }

    const creds = this.deps.loadCredentials();
    if (!creds) {
      throw new Error(
        "No credentials.json found. Place your Google OAuth client file at ~/.gcal-mcp/credentials.json (see the README setup steps).",
      );
    }

    const oauth = this.deps.createClient(creds);
    oauth.setCredentials(record.token);
    try {
      await this.deps.refreshIfExpired(oauth, (token) => this.store.saveToken(alias, token));
    } catch {
      throw new Error(`Account "${alias}" needs re-authentication. Run: gcal-mcp auth add ${alias} --force`);
    }

    const client = this.deps.buildCalendar(oauth);
    this.cache.set(alias, client);
    return client;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/client-registry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/client-registry.ts src/client-registry.test.ts
git commit -m "feat: add per-account CalendarClient registry"
```

---

### Task 13: tools.ts

**Files:**
- Create: `src/tools.ts`, `src/tools.test.ts`

- [ ] **Step 1: Write the failing test**

`src/tools.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { tools } from "./tools.js";

describe("tools", () => {
  it("exposes the expected calendar tools", () => {
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "calendar_create_event",
        "calendar_delete_event",
        "calendar_freebusy",
        "calendar_get_event",
        "calendar_list_accounts",
        "calendar_list_calendars",
        "calendar_list_events",
        "calendar_update_event",
      ].sort(),
    );
  });

  it("every tool except list_accounts requires account", () => {
    for (const t of tools) {
      expect(t.inputSchema.type).toBe("object");
      if (t.name !== "calendar_list_accounts") {
        expect(t.inputSchema.required).toContain("account");
      }
    }
  });

  it("create/update/delete expose sendUpdates with none default documented", () => {
    for (const n of ["calendar_create_event", "calendar_update_event", "calendar_delete_event"]) {
      const t = tools.find((x) => x.name === n)!;
      expect(t.inputSchema.properties.sendUpdates.description).toMatch(/none/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tools.test.ts`
Expected: FAIL — cannot resolve `./tools.js`.

- [ ] **Step 3: Write `src/tools.ts`**

```ts
export interface JsonSchemaProperty {
  type: string;
  description?: string;
  items?: { type: string };
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, JsonSchemaProperty>;
    required: string[];
  };
}

const ACCOUNT: JsonSchemaProperty = {
  type: "string",
  description: "Configured account alias to act on (e.g. 'work'). See calendar_list_accounts.",
};
const CALENDAR_ID: JsonSchemaProperty = {
  type: "string",
  description: "Calendar id. Defaults to the account's primary calendar. See calendar_list_calendars.",
};
const SEND_UPDATES: JsonSchemaProperty = {
  type: "string",
  enum: ["none", "all", "externalOnly"],
  description: "Who to email about this change. Defaults to 'none' (no attendee notifications). Set 'all' to notify everyone.",
};
const STR = (description: string): JsonSchemaProperty => ({ type: "string", description });
const NUM = (description: string): JsonSchemaProperty => ({ type: "number", description });
const BOOL = (description: string): JsonSchemaProperty => ({ type: "boolean", description });
const STR_ARR = (description: string): JsonSchemaProperty => ({ type: "array", items: { type: "string" }, description });

function tool(
  name: string,
  description: string,
  properties: Record<string, JsonSchemaProperty>,
  required: string[],
): ToolDefinition {
  return { name, description, inputSchema: { type: "object", properties, required } };
}

export const tools: ToolDefinition[] = [
  tool("calendar_list_accounts", "List configured Google accounts (alias -> email).", {}, []),
  tool(
    "calendar_list_calendars",
    "List all calendars visible to an account (id, summary, primary, accessRole, timeZone).",
    { account: ACCOUNT },
    ["account"],
  ),
  tool(
    "calendar_list_events",
    "List events in a time window across one or more calendars (merged, sorted by start).",
    {
      account: ACCOUNT,
      calendarIds: STR_ARR("Calendar ids to query. Defaults to ['primary']."),
      timeMin: STR("RFC3339 lower bound (inclusive), e.g. 2026-05-16T00:00:00Z."),
      timeMax: STR("RFC3339 upper bound (exclusive)."),
      query: STR("Optional free-text search over event fields."),
      maxResults: NUM("Max events per calendar (default 250)."),
      singleEvents: BOOL("Expand recurring events into instances (default true)."),
      showDeleted: BOOL("Include cancelled events (default false)."),
    },
    ["account", "timeMin", "timeMax"],
  ),
  tool(
    "calendar_get_event",
    "Get a single event by id.",
    { account: ACCOUNT, calendarId: CALENDAR_ID, eventId: STR("Event id.") },
    ["account", "eventId"],
  ),
  tool(
    "calendar_freebusy",
    "Query busy blocks across one or more calendars in a time window.",
    {
      account: ACCOUNT,
      calendarIds: STR_ARR("Calendar ids. Defaults to ['primary']."),
      timeMin: STR("RFC3339 lower bound."),
      timeMax: STR("RFC3339 upper bound."),
    },
    ["account", "timeMin", "timeMax"],
  ),
  tool(
    "calendar_create_event",
    "Create an event. Pass a Google Calendar event resource as `event`.",
    {
      account: ACCOUNT,
      calendarId: CALENDAR_ID,
      event: { type: "object", description: "Google Calendar event resource (summary, start, end, attendees, ...)." } as JsonSchemaProperty,
      sendUpdates: SEND_UPDATES,
    },
    ["account", "event"],
  ),
  tool(
    "calendar_update_event",
    "Patch an existing event. Only fields present in `patch` change.",
    {
      account: ACCOUNT,
      calendarId: CALENDAR_ID,
      eventId: STR("Event id."),
      patch: { type: "object", description: "Partial event resource; only included fields are modified." } as JsonSchemaProperty,
      sendUpdates: SEND_UPDATES,
    },
    ["account", "eventId", "patch"],
  ),
  tool(
    "calendar_delete_event",
    "Delete an event. Returns the deleted event body. Refuses events with attendees unless confirm=true.",
    {
      account: ACCOUNT,
      calendarId: CALENDAR_ID,
      eventId: STR("Event id."),
      sendUpdates: SEND_UPDATES,
      confirm: BOOL("Required true to delete an event that has attendees."),
    },
    ["account", "eventId"],
  ),
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tools.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools.ts src/tools.test.ts
git commit -m "feat: add MCP tool schemas"
```

---

### Task 14: handlers.ts

**Files:**
- Create: `src/handlers.ts`, `src/handlers.test.ts`

- [ ] **Step 1: Write the failing test**

`src/handlers.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { handleListTools, handleCallTool } from "./handlers.js";

function deps(client: any, accounts: any[] = [{ alias: "work", email: "w@x.com" }]) {
  return {
    store: { list: () => accounts } as any,
    registry: { getClient: vi.fn().mockResolvedValue(client) } as any,
  };
}

describe("handlers", () => {
  it("handleListTools returns the tool list", () => {
    expect(handleListTools().tools.length).toBeGreaterThan(0);
  });

  it("calendar_list_accounts does not need the registry", async () => {
    const r = await handleCallTool("calendar_list_accounts", {}, deps(null));
    expect(JSON.parse(r.content[0].text)).toEqual([{ alias: "work", email: "w@x.com" }]);
  });

  it("routes calendar_list_events to the client", async () => {
    const client = { listEvents: vi.fn().mockResolvedValue([{ id: "1" }]) };
    const r = await handleCallTool(
      "calendar_list_events",
      { account: "work", timeMin: "a", timeMax: "b" },
      deps(client),
    );
    expect(client.listEvents).toHaveBeenCalledWith({ calendarIds: undefined, timeMin: "a", timeMax: "b", query: undefined, maxResults: undefined, singleEvents: undefined, showDeleted: undefined });
    expect(JSON.parse(r.content[0].text)).toEqual([{ id: "1" }]);
  });

  it("routes create with default sendUpdates to client", async () => {
    const client = { createEvent: vi.fn().mockResolvedValue({ id: "n", sendUpdates: "none" }) };
    await handleCallTool("calendar_create_event", { account: "work", event: { summary: "x" } }, deps(client));
    expect(client.createEvent).toHaveBeenCalledWith("primary", { summary: "x" }, "none");
  });

  it("returns isError on unknown tool", async () => {
    const r = await handleCallTool("nope", {}, deps(null));
    expect(r.isError).toBe(true);
  });

  it("returns isError when the client throws", async () => {
    const client = { getEvent: vi.fn().mockRejectedValue(new Error("404 Not Found")) };
    const r = await handleCallTool("calendar_get_event", { account: "work", eventId: "x" }, deps(client));
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/404 Not Found/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/handlers.test.ts`
Expected: FAIL — cannot resolve `./handlers.js`.

- [ ] **Step 3: Write `src/handlers.ts`**

```ts
import { tools } from "./tools.js";
import type { AccountStore } from "./accounts.js";
import type { ClientRegistry } from "./client-registry.js";
import type { CalendarClient, SendUpdates } from "./calendar-client.js";

export interface ToolDeps {
  store: AccountStore;
  registry: ClientRegistry;
}

interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

function text(body: string): ToolResult {
  return { content: [{ type: "text", text: body }] };
}

function json(value: unknown): ToolResult {
  return text(JSON.stringify(value, null, 2));
}

function err(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

export function handleListTools(): { tools: typeof tools } {
  return { tools };
}

async function dispatch(
  client: CalendarClient,
  name: string,
  args: Record<string, any>,
): Promise<ToolResult> {
  const calId: string = args.calendarId ?? "primary";
  const send: SendUpdates = (args.sendUpdates as SendUpdates) ?? "none";
  switch (name) {
    case "calendar_list_calendars":
      return json(await client.listCalendars());
    case "calendar_list_events":
      return json(
        await client.listEvents({
          calendarIds: args.calendarIds,
          timeMin: args.timeMin,
          timeMax: args.timeMax,
          query: args.query,
          maxResults: args.maxResults,
          singleEvents: args.singleEvents,
          showDeleted: args.showDeleted,
        }),
      );
    case "calendar_get_event":
      return json(await client.getEvent(calId, args.eventId));
    case "calendar_freebusy":
      return json(
        await client.freeBusy({ calendarIds: args.calendarIds, timeMin: args.timeMin, timeMax: args.timeMax }),
      );
    case "calendar_create_event":
      return json(await client.createEvent(calId, args.event, send));
    case "calendar_update_event":
      return json(await client.updateEvent(calId, args.eventId, args.patch, send));
    case "calendar_delete_event":
      return json(await client.deleteEvent(calId, args.eventId, send, args.confirm === true));
    default:
      return err(`Unknown tool: ${name}`);
  }
}

export async function handleCallTool(
  name: string,
  args: Record<string, any>,
  deps: ToolDeps,
): Promise<ToolResult> {
  try {
    if (name === "calendar_list_accounts") {
      return json(deps.store.list());
    }
    const known = tools.some((t) => t.name === name);
    if (!known) return err(`Unknown tool: ${name}`);
    if (!args.account) return err(`Missing required "account" argument for ${name}.`);
    const client = await deps.registry.getClient(args.account);
    return await dispatch(client, name, args);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/handlers.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/handlers.ts src/handlers.test.ts
git commit -m "feat: add tool dispatch handlers"
```

---

### Task 15: server.ts + index.ts

**Files:**
- Create: `src/server.ts`, `src/index.ts`, `src/server.test.ts`

- [ ] **Step 1: Write the failing test**

`src/server.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createServer } from "./server.js";

describe("createServer", () => {
  it("constructs an MCP Server instance", () => {
    const s = createServer({ store: { list: () => [] } as any, registry: {} as any });
    expect(s).toBeTruthy();
    expect(typeof (s as any).setRequestHandler).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server.test.ts`
Expected: FAIL — cannot resolve `./server.js`.

- [ ] **Step 3: Write `src/server.ts`**

```ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { AccountStore } from "./accounts.js";
import { ClientRegistry } from "./client-registry.js";
import { getAccountsDir } from "./config.js";
import { handleCallTool, handleListTools } from "./handlers.js";

export function createServer(deps?: { store?: AccountStore; registry?: ClientRegistry }): Server {
  const store = deps?.store ?? new AccountStore(getAccountsDir());
  const registry = deps?.registry ?? new ClientRegistry(store);

  const server = new Server({ name: "google-calendar-mcp", version: "0.1.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => handleListTools() as unknown as { tools: unknown[] });

  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    handleCallTool(request.params.name, (request.params.arguments ?? {}) as Record<string, any>, { store, registry }) as unknown as { content: unknown[] },
  );

  return server;
}

export async function startStdioServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("google-calendar-mcp server running on stdio");
}
```

- [ ] **Step 4: Write `src/index.ts`**

```ts
#!/usr/bin/env node
import { startStdioServer } from "./server.js";
import { runCli } from "./cli.js";

async function main(): Promise<void> {
  if (process.argv[2] === "auth") {
    await runCli(process.argv.slice(3));
  } else {
    await startStdioServer();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

(Note: `index.ts` imports `./cli.js`, created in Task 16. Build/typecheck is deferred to Task 17; the server test below does not import `index.ts`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/server.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add src/server.ts src/index.ts src/server.test.ts
git commit -m "feat: add MCP server wiring and entry point"
```

---

### Task 16: cli.ts

**Files:**
- Create: `src/cli.ts`, `src/cli.test.ts`

- [ ] **Step 1: Write the failing test**

`src/cli.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { runCli } from "./cli.js";

function baseDeps(over: any = {}) {
  return {
    store: {
      has: vi.fn().mockReturnValue(false),
      add: vi.fn(),
      list: vi.fn().mockReturnValue([]),
      remove: vi.fn(),
      ...over.store,
    },
    loadCredentials: over.loadCredentials ?? (() => ({ installed: { client_id: "i", client_secret: "s", redirect_uris: [] } })),
    createClient: over.createClient ?? (() => ({}) as any),
    doAuth: over.doAuth ?? vi.fn().mockResolvedValue({ email: "e@x.com", token: { access_token: "t" } }),
  };
}

describe("runCli", () => {
  it("add: authenticates and stores the account", async () => {
    const deps = baseDeps();
    await runCli(["add", "work"], deps as any);
    expect(deps.store.add).toHaveBeenCalledWith({ alias: "work", email: "e@x.com", token: { access_token: "t" } });
  });

  it("add: refuses existing alias without --force", async () => {
    const deps = baseDeps({ store: { has: vi.fn().mockReturnValue(true) } });
    await expect(runCli(["add", "work"], deps as any)).rejects.toThrow(/already exists/);
  });

  it("remove: deletes a known account", async () => {
    const deps = baseDeps({ store: { has: vi.fn().mockReturnValue(true) } });
    await runCli(["remove", "work"], deps as any);
    expect(deps.store.remove).toHaveBeenCalledWith("work");
  });

  it("rejects unknown subcommand", async () => {
    await expect(runCli(["frobnicate"], baseDeps() as any)).rejects.toThrow(/Unknown auth subcommand/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cli.test.ts`
Expected: FAIL — cannot resolve `./cli.js`.

- [ ] **Step 3: Write `src/cli.ts`**

```ts
import { AccountStore } from "./accounts.js";
import { loadOAuthCredentials, createOAuth2Client } from "./oauth.js";
import { runInteractiveAuth } from "./auth-flow.js";
import { getAccountsDir, getCredentialsPath } from "./config.js";

export interface CliDeps {
  store: AccountStore;
  loadCredentials: typeof loadOAuthCredentials;
  createClient: typeof createOAuth2Client;
  doAuth: typeof runInteractiveAuth;
}

function resolveDeps(partial: Partial<CliDeps>): CliDeps {
  return {
    store: partial.store ?? new AccountStore(getAccountsDir()),
    loadCredentials: partial.loadCredentials ?? loadOAuthCredentials,
    createClient: partial.createClient ?? createOAuth2Client,
    doAuth: partial.doAuth ?? runInteractiveAuth,
  };
}

export async function runCli(argv: string[], depsOverride: Partial<CliDeps> = {}): Promise<void> {
  const deps = resolveDeps(depsOverride);
  const [subcommand, ...rest] = argv;

  if (subcommand === "add") {
    const force = rest.includes("--force");
    const alias = rest.find((a) => !a.startsWith("--"));
    if (!alias) throw new Error("Usage: gcal-mcp auth add <alias> [--force]");
    if (deps.store.has(alias) && !force) {
      throw new Error(`Account "${alias}" already exists. Use --force to overwrite, or remove it first: gcal-mcp auth remove ${alias}`);
    }
    const creds = deps.loadCredentials();
    if (!creds) {
      throw new Error(`No credentials.json found at ${getCredentialsPath()}. Place your Google OAuth client file there (see the README setup steps).`);
    }
    const client = deps.createClient(creds);
    const { email, token } = await deps.doAuth(client);
    deps.store.add({ alias, email, token });
    console.error(`Added account "${alias}" (${email}).`);
    return;
  }

  if (subcommand === "list") {
    const accounts = deps.store.list();
    if (accounts.length === 0) {
      console.error("No accounts configured. Add one with: gcal-mcp auth add <alias>");
      return;
    }
    for (const a of accounts) console.error(`${a.alias}\t${a.email}`);
    return;
  }

  if (subcommand === "remove") {
    const alias = rest[0];
    if (!alias) throw new Error("Usage: gcal-mcp auth remove <alias>");
    if (!deps.store.has(alias)) throw new Error(`No such account: ${alias}`);
    deps.store.remove(alias);
    console.error(`Removed account "${alias}".`);
    return;
  }

  throw new Error(`Unknown auth subcommand: ${subcommand ?? "(none)"}. Use one of: add | list | remove`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/cli.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/cli.test.ts
git commit -m "feat: add auth CLI (add/list/remove)"
```

---

### Task 17: Full build, typecheck, test suite

**Files:** none (verification task)

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: exits 0, no errors.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all suites pass (config, accounts, oauth, auth-flow, calendar-client, client-registry, tools, handlers, server, cli).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `dist/index.js` and siblings produced, exit 0.

- [ ] **Step 4: Smoke-run the CLI**

Run: `node dist/index.js auth list`
Expected: prints `No accounts configured. Add one with: gcal-mcp auth add <alias>` (to stderr) and exits 0.

- [ ] **Step 5: Commit (only if any fixups were needed)**

```bash
git add -A
git commit -m "chore: full build/typecheck/test green" || echo "nothing to commit"
```

---

### Task 18: Packaging & README

**Files:**
- Create: `manifest.json`, `scripts/build-mcpb.sh`, `README.md`, `LICENSE`

- [ ] **Step 1: Create `manifest.json`**

```json
{
  "$schema": "https://raw.githubusercontent.com/anthropics/mcpb/main/schemas/mcpb-manifest-v0.4.schema.json",
  "manifest_version": "0.4",
  "name": "google-calendar-mcp",
  "version": "0.1.0",
  "description": "Multi-account Google Calendar MCP server — read, create, update, delete and analyze calendars across several Google accounts. Every tool takes an `account` alias.",
  "author": { "name": "chienchuanw" },
  "license": "MIT",
  "keywords": ["google-calendar", "calendar", "google", "mcp"],
  "server": {
    "type": "node",
    "entry_point": "server/index.js",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/server/index.js"],
      "env": { "GCAL_MCP_CONFIG_DIR": "${user_config.config_dir}" }
    }
  },
  "user_config": {
    "config_dir": {
      "type": "directory",
      "title": "Config directory",
      "description": "Directory holding credentials.json and the accounts/ folder (default: ~/.gcal-mcp). Before this bundle is useful you must: (1) create a Google OAuth \"Desktop app\" client, enable the Google Calendar API, and save the downloaded credentials.json into this directory; (2) run `gcal-mcp auth add <alias>` from a terminal once per account. See the project README.",
      "default": "${HOME}/.gcal-mcp",
      "required": false
    }
  },
  "compatibility": {
    "platforms": ["darwin", "win32", "linux"],
    "runtimes": { "node": ">=18.0.0" }
  }
}
```

- [ ] **Step 2: Create `scripts/build-mcpb.sh`**

```bash
#!/usr/bin/env bash
# Build the distributable .mcpb bundle (node server/index.js stdio mode).
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
BUNDLE_DIR="$ROOT/build/mcpb"

echo "==> Compiling TypeScript (tsconfig.build.json -> dist/)"
npm run build

echo "==> Assembling bundle at $BUNDLE_DIR"
rm -rf "$ROOT/build"
mkdir -p "$BUNDLE_DIR/server"
cp "$ROOT/manifest.json" "$BUNDLE_DIR/manifest.json"
cp "$ROOT"/dist/*.js "$BUNDLE_DIR/server/"

node -e '
const p = require("./package.json");
const fs = require("fs");
const out = {
  name: p.name + "-bundled",
  version: p.version,
  private: true,
  type: "module",
  main: "index.js",
  dependencies: p.dependencies,
};
fs.writeFileSync(process.argv[1], JSON.stringify(out, null, 2) + "\n");
' "$BUNDLE_DIR/server/package.json"

echo "==> Installing production dependencies into the bundle"
( cd "$BUNDLE_DIR/server" && npm install --omit=dev --no-audit --no-fund --loglevel=error )

echo "==> Validating manifest"
( cd "$BUNDLE_DIR" && npx --yes @anthropic-ai/mcpb validate manifest.json )

echo "==> Packing"
( cd "$BUNDLE_DIR" && npx --yes @anthropic-ai/mcpb pack . "$ROOT/build/google-calendar-mcp.mcpb" )

echo "==> Done."
ls -lh "$ROOT/build/google-calendar-mcp.mcpb"
```

Then: `chmod +x scripts/build-mcpb.sh`

- [ ] **Step 3: Create `LICENSE`** (MIT, copyright `2026 chienchuanw`)

```
MIT License

Copyright (c) 2026 chienchuanw

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 4: Create `README.md`**

```markdown
# google-calendar-mcp

Multi-account Google Calendar MCP server — list, read, create, update, delete, and analyze events across several Google accounts from Claude. Every tool takes an `account` alias; event tools take an optional `calendarId` (defaults to the account's primary calendar).

## Setup

1. **Create a Google OAuth client**: Google Cloud Console → new project → enable the **Google Calendar API** → configure the **OAuth consent screen** (External) and add scopes:
   ```
   https://www.googleapis.com/auth/calendar
   https://www.googleapis.com/auth/calendar.events
   ```
   Add your Google address(es) under **Test users**. Then **Credentials → Create credentials → OAuth client ID → Desktop app → Download JSON**.

2. **Install and place credentials:**
   ```bash
   npm install && npm run build
   mkdir -p ~/.gcal-mcp
   cp /path/to/downloaded-credentials.json ~/.gcal-mcp/credentials.json
   ```

3. **Add one or more accounts** (opens a browser each time; port 3000 must be free):
   ```bash
   node dist/index.js auth add work
   node dist/index.js auth add personal
   node dist/index.js auth list
   ```

4. **Register with Claude Code:**
   ```bash
   claude mcp add gcal -- node /absolute/path/to/google-calendar-mcp/dist/index.js
   ```

## Tools

`calendar_list_accounts`, `calendar_list_calendars`, `calendar_list_events`, `calendar_get_event`, `calendar_freebusy`, `calendar_create_event`, `calendar_update_event`, `calendar_delete_event`.

Writes never notify attendees unless you pass `sendUpdates: "all"` (default `"none"`). `calendar_delete_event` refuses events with attendees unless `confirm: true`, and returns the deleted event body.

## Storage

```
~/.gcal-mcp/
├── credentials.json      # shared Google OAuth client (never commit)
└── accounts/
    ├── work.json         # { alias, email, token }  (never commit)
    └── personal.json
```

Override the directory with `GCAL_MCP_CONFIG_DIR`. Tokens auto-refresh; if refresh fails, re-run `gcal-mcp auth add <alias> --force`.

## Development

```bash
npm test           # vitest
npm run build      # tsc -> dist/
npm run typecheck  # tsc --noEmit
```

## Packaging (MCPB)

`bash scripts/build-mcpb.sh` produces `build/google-calendar-mcp.mcpb`. OAuth setup (`credentials.json` + `gcal-mcp auth add <alias>`) must still be done from a terminal.
```

- [ ] **Step 5: Commit**

```bash
git add manifest.json scripts/build-mcpb.sh README.md LICENSE
git commit -m "docs: add README, MCPB manifest, packaging script and license"
```

---

## Self-Review

**Spec coverage:**
- Multi-account OAuth, `~/.gcal-mcp`, `GCAL_MCP_CONFIG_DIR` → Tasks 1–4, 16. ✓
- Calendar scopes (separate project) → Task 3. ✓
- Addressing: `account` + optional `calendarId` default primary → Tasks 13, 14. ✓
- Tools: list_accounts, list_calendars, list_events (multi-cal merge), get_event, freebusy, create, update (patch), delete (attendee guard + echo body) → Tasks 5–14. ✓
- Writes notifications off by default (`sendUpdates: "none"`) → Tasks 9–11, 13, 14. ✓
- No conflict/time-accounting tools → not built. ✓
- Error handling (unknown alias, refresh failure, API errors surfaced, delete guard) → Tasks 12, 14, 11. ✓
- Testing mirrors gmail-mcp → every module has a `.test.ts`; Task 17 runs full suite. ✓
- Packaging MCPB → Task 18. ✓

**Placeholder scan:** No TBD/TODO; all code blocks complete. ✓

**Type consistency:** `CalendarClient` method names (`listCalendars`, `listEvents`, `getEvent`, `freeBusy`, `createEvent`, `updateEvent`, `deleteEvent`) consistent across Tasks 5–14. `SendUpdates` type defined in Task 9 and reused in handlers (Task 14). `RegistryDeps.buildCalendar` consistent between Task 12 impl and its test. ✓

Cross-task note: `src/index.ts` (Task 15) imports `./cli.js` created in Task 16; first full typecheck/build is Task 17, after both exist. Server test in Task 15 does not import `index.ts`, so Task 15 passes standalone.
