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
