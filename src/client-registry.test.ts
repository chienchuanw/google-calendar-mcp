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
