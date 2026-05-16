import { describe, it, expect } from "vitest";
import { createServer } from "./server.js";

describe("createServer", () => {
  it("constructs an MCP Server instance", () => {
    const s = createServer({ store: { list: () => [] } as any, registry: {} as any });
    expect(s).toBeTruthy();
    expect(typeof (s as any).setRequestHandler).toBe("function");
  });
});
