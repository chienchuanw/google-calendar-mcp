import { describe, it, expect, vi } from "vitest";
import { handleListTools, handleCallTool } from "./handlers.js";

function deps(client: any, accounts: any[] = [{ alias: "work", email: "w@x.com" }]) {
  return {
    store: { list: () => accounts } as any,
    registry: { getClient: vi.fn().mockResolvedValue(client) } as any,
  };
}

describe("handlers", () => {
  it("handleListTools returns the tool list", () => {
    expect(handleListTools().tools.length).toBeGreaterThan(0);
  });

  it("calendar_list_accounts does not need the registry", async () => {
    const r = await handleCallTool("calendar_list_accounts", {}, deps(null));
    expect(JSON.parse(r.content[0].text)).toEqual([{ alias: "work", email: "w@x.com" }]);
  });

  it("routes calendar_list_events to the client", async () => {
    const client = { listEvents: vi.fn().mockResolvedValue([{ id: "1" }]) };
    const r = await handleCallTool(
      "calendar_list_events",
      { account: "work", timeMin: "a", timeMax: "b" },
      deps(client),
    );
    expect(client.listEvents).toHaveBeenCalledWith({ calendarIds: undefined, timeMin: "a", timeMax: "b", query: undefined, maxResults: undefined, singleEvents: undefined, showDeleted: undefined });
    expect(JSON.parse(r.content[0].text)).toEqual([{ id: "1" }]);
  });

  it("routes create with default sendUpdates to client", async () => {
    const client = { createEvent: vi.fn().mockResolvedValue({ id: "n", sendUpdates: "none" }) };
    await handleCallTool("calendar_create_event", { account: "work", event: { summary: "x" } }, deps(client));
    expect(client.createEvent).toHaveBeenCalledWith("primary", { summary: "x" }, "none");
  });

  it("returns isError on unknown tool", async () => {
    const r = await handleCallTool("nope", {}, deps(null));
    expect(r.isError).toBe(true);
  });

  it("returns isError when the client throws", async () => {
    const client = { getEvent: vi.fn().mockRejectedValue(new Error("404 Not Found")) };
    const r = await handleCallTool("calendar_get_event", { account: "work", eventId: "x" }, deps(client));
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/404 Not Found/);
  });
});
