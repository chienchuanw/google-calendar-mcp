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
