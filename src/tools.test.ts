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
