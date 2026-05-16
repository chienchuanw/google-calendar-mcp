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
