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
