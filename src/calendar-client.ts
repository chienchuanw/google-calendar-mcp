import type { calendar_v3 } from "googleapis";

export interface CalendarSummary {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string;
  timeZone: string;
}

export interface NormalizedEvent {
  id: string;
  calendarId: string;
  summary: string;
  status: string;
  start: string;
  end: string;
  location?: string;
  htmlLink?: string;
  attendees: { email: string; responseStatus: string }[];
}

export interface ListEventsParams {
  calendarIds?: string[];
  timeMin?: string;
  timeMax?: string;
  query?: string;
  maxResults?: number;
  singleEvents?: boolean;
  showDeleted?: boolean;
}

export interface FreeBusyParams {
  calendarIds?: string[];
  timeMin: string;
  timeMax: string;
}

export type SendUpdates = "all" | "externalOnly" | "none";

function whenOf(p?: calendar_v3.Schema$EventDateTime): string {
  return p?.dateTime ?? p?.date ?? "";
}

function normalizeEvent(calendarId: string, e: calendar_v3.Schema$Event): NormalizedEvent {
  return {
    id: e.id ?? "",
    calendarId,
    summary: e.summary ?? "(no title)",
    status: e.status ?? "confirmed",
    start: whenOf(e.start ?? undefined),
    end: whenOf(e.end ?? undefined),
    location: e.location ?? undefined,
    htmlLink: e.htmlLink ?? undefined,
    attendees: (e.attendees ?? []).map((a) => ({
      email: a.email ?? "",
      responseStatus: a.responseStatus ?? "needsAction",
    })),
  };
}

export class CalendarClient {
  constructor(private readonly api: calendar_v3.Calendar) {}

  async listCalendars(): Promise<CalendarSummary[]> {
    const res = await this.api.calendarList.list();
    return (res.data.items ?? []).map((c) => ({
      id: c.id ?? "",
      summary: c.summary ?? "",
      primary: c.primary === true,
      accessRole: c.accessRole ?? "",
      timeZone: c.timeZone ?? "",
    }));
  }

  async listEvents(params: ListEventsParams): Promise<NormalizedEvent[]> {
    const calendarIds = params.calendarIds?.length ? params.calendarIds : ["primary"];
    const perCalendar = await Promise.all(
      calendarIds.map(async (calendarId) => {
        const res = await this.api.events.list({
          calendarId,
          timeMin: params.timeMin,
          timeMax: params.timeMax,
          q: params.query,
          maxResults: params.maxResults ?? 250,
          singleEvents: params.singleEvents ?? true,
          showDeleted: params.showDeleted ?? false,
          orderBy: "startTime",
        });
        return (res.data.items ?? []).map((e) => normalizeEvent(calendarId, e));
      }),
    );
    return perCalendar.flat().sort((a, b) => a.start.localeCompare(b.start));
  }

  async getEvent(calendarId: string, eventId: string): Promise<NormalizedEvent> {
    const res = await this.api.events.get({ calendarId, eventId });
    return normalizeEvent(calendarId, res.data);
  }

  async freeBusy(params: FreeBusyParams): Promise<Record<string, { start: string; end: string }[]>> {
    const calendarIds = params.calendarIds?.length ? params.calendarIds : ["primary"];
    const res = await this.api.freebusy.query({
      requestBody: {
        timeMin: params.timeMin,
        timeMax: params.timeMax,
        items: calendarIds.map((id) => ({ id })),
      },
    });
    const calendars = res.data.calendars ?? {};
    const out: Record<string, { start: string; end: string }[]> = {};
    for (const [id, info] of Object.entries(calendars)) {
      out[id] = (info.busy ?? []).map((b) => ({ start: b.start ?? "", end: b.end ?? "" }));
    }
    return out;
  }

  async createEvent(
    calendarId: string,
    event: calendar_v3.Schema$Event,
    sendUpdates: SendUpdates = "none",
  ): Promise<{ id: string; htmlLink?: string; sendUpdates: SendUpdates }> {
    const res = await this.api.events.insert({ calendarId, sendUpdates, requestBody: event });
    return { id: res.data.id ?? "", htmlLink: res.data.htmlLink ?? undefined, sendUpdates };
  }

  async updateEvent(
    calendarId: string,
    eventId: string,
    patch: calendar_v3.Schema$Event,
    sendUpdates: SendUpdates = "none",
  ): Promise<{ id: string; htmlLink?: string; sendUpdates: SendUpdates }> {
    const res = await this.api.events.patch({ calendarId, eventId, sendUpdates, requestBody: patch });
    return { id: res.data.id ?? "", htmlLink: res.data.htmlLink ?? undefined, sendUpdates };
  }

  async deleteEvent(
    calendarId: string,
    eventId: string,
    sendUpdates: SendUpdates = "none",
    confirm = false,
  ): Promise<{ deleted: NormalizedEvent; sendUpdates: SendUpdates }> {
    const existing = await this.api.events.get({ calendarId, eventId });
    const deleted = normalizeEvent(calendarId, existing.data);
    if (deleted.attendees.length > 0 && !confirm) {
      throw new Error(
        `Event "${deleted.summary}" (${eventId}) has attendees; deleting will affect them. ` +
          `Re-call with confirm=true to proceed.`,
      );
    }
    await this.api.events.delete({ calendarId, eventId, sendUpdates });
    return { deleted, sendUpdates };
  }
}
