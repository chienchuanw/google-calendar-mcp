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
import { getCredentialsPath } from "./config.js";

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
        `No credentials.json found at ${getCredentialsPath()}. Place your Google OAuth client file there (see the README setup steps).`,
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
