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
