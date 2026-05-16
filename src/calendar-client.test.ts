import { describe, it, expect, vi } from "vitest";
import { CalendarClient } from "./calendar-client.js";

function mockApi(overrides: any = {}) {
  return {
    calendarList: { list: vi.fn(), get: vi.fn(), ...overrides.calendarList },
    events: { list: vi.fn(), get: vi.fn(), insert: vi.fn(), patch: vi.fn(), delete: vi.fn(), ...overrides.events },
    freebusy: { query: vi.fn(), ...overrides.freebusy },
  };
}

describe("CalendarClient.listCalendars", () => {
  it("returns normalized calendar summaries", async () => {
    const api = mockApi({
      calendarList: {
        list: vi.fn().mockResolvedValue({
          data: {
            items: [
              { id: "me@x.com", summary: "Me", primary: true, accessRole: "owner", timeZone: "UTC" },
              { id: "team@x.com", summary: "Team", accessRole: "reader", timeZone: "UTC" },
            ],
          },
        }),
      },
    });
    const c = new CalendarClient(api as any);
    expect(await c.listCalendars()).toEqual([
      { id: "me@x.com", summary: "Me", primary: true, accessRole: "owner", timeZone: "UTC" },
      { id: "team@x.com", summary: "Team", primary: false, accessRole: "reader", timeZone: "UTC" },
    ]);
  });
});

describe("CalendarClient.listEvents", () => {
  it("defaults to primary, normalizes events", async () => {
    const list = vi.fn().mockResolvedValue({
      data: { items: [{ id: "1", summary: "A", start: { dateTime: "2026-05-16T10:00:00Z" }, end: { dateTime: "2026-05-16T11:00:00Z" } }] },
    });
    const c = new CalendarClient(mockApi({ events: { list } }) as any);
    const out = await c.listEvents({ timeMin: "2026-05-16T00:00:00Z", timeMax: "2026-05-17T00:00:00Z" });
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ calendarId: "primary", singleEvents: true, showDeleted: false, orderBy: "startTime" }),
    );
    expect(out).toEqual([
      { id: "1", calendarId: "primary", summary: "A", status: "confirmed", start: "2026-05-16T10:00:00Z", end: "2026-05-16T11:00:00Z", location: undefined, htmlLink: undefined, attendees: [] },
    ]);
  });

  it("merges multiple calendars and sorts by start", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ data: { items: [{ id: "late", start: { dateTime: "2026-05-16T15:00:00Z" }, end: { dateTime: "2026-05-16T16:00:00Z" } }] } })
      .mockResolvedValueOnce({ data: { items: [{ id: "early", start: { dateTime: "2026-05-16T09:00:00Z" }, end: { dateTime: "2026-05-16T10:00:00Z" } }] } });
    const c = new CalendarClient(mockApi({ events: { list } }) as any);
    const out = await c.listEvents({ calendarIds: ["a", "b"], timeMin: "x", timeMax: "y" });
    expect(out.map((e) => e.id)).toEqual(["early", "late"]);
    expect(out.map((e) => e.calendarId)).toEqual(["b", "a"]);
  });
});

describe("CalendarClient.getEvent", () => {
  it("returns normalized event for given calendar", async () => {
    const get = vi.fn().mockResolvedValue({ data: { id: "e1", summary: "Sync", start: { date: "2026-05-16" }, end: { date: "2026-05-17" }, attendees: [{ email: "a@x.com", responseStatus: "accepted" }] } });
    const c = new CalendarClient(mockApi({ events: { get } }) as any);
    const out = await c.getEvent("team@x.com", "e1");
    expect(get).toHaveBeenCalledWith({ calendarId: "team@x.com", eventId: "e1" });
    expect(out).toEqual({ id: "e1", calendarId: "team@x.com", summary: "Sync", status: "confirmed", start: "2026-05-16", end: "2026-05-17", location: undefined, htmlLink: undefined, attendees: [{ email: "a@x.com", responseStatus: "accepted" }] });
  });
});

describe("CalendarClient.freeBusy", () => {
  it("queries freebusy across calendars and returns busy blocks", async () => {
    const query = vi.fn().mockResolvedValue({ data: { calendars: { "primary": { busy: [{ start: "2026-05-16T10:00:00Z", end: "2026-05-16T11:00:00Z" }] } } } });
    const c = new CalendarClient(mockApi({ freebusy: { query } }) as any);
    const out = await c.freeBusy({ timeMin: "2026-05-16T00:00:00Z", timeMax: "2026-05-17T00:00:00Z" });
    expect(query).toHaveBeenCalledWith({
      requestBody: { timeMin: "2026-05-16T00:00:00Z", timeMax: "2026-05-17T00:00:00Z", items: [{ id: "primary" }] },
    });
    expect(out).toEqual({ primary: [{ start: "2026-05-16T10:00:00Z", end: "2026-05-16T11:00:00Z" }] });
  });
});

describe("CalendarClient.createEvent", () => {
  it("inserts with sendUpdates=none by default and echoes it", async () => {
    const insert = vi.fn().mockResolvedValue({ data: { id: "new1", htmlLink: "http://l" } });
    const c = new CalendarClient(mockApi({ events: { insert } }) as any);
    const out = await c.createEvent("primary", { summary: "Hi" });
    expect(insert).toHaveBeenCalledWith({ calendarId: "primary", sendUpdates: "none", requestBody: { summary: "Hi" } });
    expect(out).toEqual({ id: "new1", htmlLink: "http://l", sendUpdates: "none" });
  });

  it("honors explicit sendUpdates", async () => {
    const insert = vi.fn().mockResolvedValue({ data: { id: "n2" } });
    const c = new CalendarClient(mockApi({ events: { insert } }) as any);
    const out = await c.createEvent("primary", { summary: "Hi" }, "all");
    expect(insert).toHaveBeenCalledWith({ calendarId: "primary", sendUpdates: "all", requestBody: { summary: "Hi" } });
    expect(out.sendUpdates).toBe("all");
  });
});

describe("CalendarClient.updateEvent", () => {
  it("patches only provided fields, sendUpdates=none by default", async () => {
    const patch = vi.fn().mockResolvedValue({ data: { id: "e1", htmlLink: "http://l" } });
    const c = new CalendarClient(mockApi({ events: { patch } }) as any);
    const out = await c.updateEvent("primary", "e1", { summary: "Renamed" });
    expect(patch).toHaveBeenCalledWith({ calendarId: "primary", eventId: "e1", sendUpdates: "none", requestBody: { summary: "Renamed" } });
    expect(out).toEqual({ id: "e1", htmlLink: "http://l", sendUpdates: "none" });
  });
});

describe("CalendarClient.deleteEvent", () => {
  it("refuses to delete an event with attendees unless confirm=true", async () => {
    const get = vi.fn().mockResolvedValue({ data: { id: "e1", summary: "Mtg", start: { dateTime: "t" }, end: { dateTime: "t2" }, attendees: [{ email: "a@x.com" }] } });
    const del = vi.fn();
    const c = new CalendarClient(mockApi({ events: { get, delete: del } }) as any);
    await expect(c.deleteEvent("primary", "e1")).rejects.toThrow(/has attendees.*confirm/i);
    expect(del).not.toHaveBeenCalled();
  });

  it("deletes and returns the prior event body when confirmed", async () => {
    const get = vi.fn().mockResolvedValue({ data: { id: "e1", summary: "Mtg", start: { dateTime: "t" }, end: { dateTime: "t2" }, attendees: [{ email: "a@x.com", responseStatus: "accepted" }] } });
    const del = vi.fn().mockResolvedValue({});
    const c = new CalendarClient(mockApi({ events: { get, delete: del } }) as any);
    const out = await c.deleteEvent("primary", "e1", "none", true);
    expect(del).toHaveBeenCalledWith({ calendarId: "primary", eventId: "e1", sendUpdates: "none" });
    expect(out.deleted.id).toBe("e1");
    expect(out.deleted.attendees).toEqual([{ email: "a@x.com", responseStatus: "accepted" }]);
    expect(out.sendUpdates).toBe("none");
  });

  it("deletes attendee-less event without confirm", async () => {
    const get = vi.fn().mockResolvedValue({ data: { id: "e2", summary: "Solo", start: { dateTime: "t" }, end: { dateTime: "t2" } } });
    const del = vi.fn().mockResolvedValue({});
    const c = new CalendarClient(mockApi({ events: { get, delete: del } }) as any);
    const out = await c.deleteEvent("primary", "e2");
    expect(del).toHaveBeenCalled();
    expect(out.deleted.id).toBe("e2");
  });
});
