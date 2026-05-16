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
