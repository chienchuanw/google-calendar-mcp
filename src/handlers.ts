import { tools } from "./tools.js";
import type { AccountStore } from "./accounts.js";
import type { ClientRegistry } from "./client-registry.js";
import type { CalendarClient, SendUpdates } from "./calendar-client.js";

export interface ToolDeps {
  store: AccountStore;
  registry: ClientRegistry;
}

interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

function text(body: string): ToolResult {
  return { content: [{ type: "text", text: body }] };
}

function json(value: unknown): ToolResult {
  return text(JSON.stringify(value, null, 2));
}

function err(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

export function handleListTools(): { tools: typeof tools } {
  return { tools };
}

async function dispatch(
  client: CalendarClient,
  name: string,
  args: Record<string, any>,
): Promise<ToolResult> {
  const calId: string = args.calendarId ?? "primary";
  const send: SendUpdates = (args.sendUpdates as SendUpdates) ?? "none";
  switch (name) {
    case "calendar_list_calendars":
      return json(await client.listCalendars());
    case "calendar_list_events":
      return json(
        await client.listEvents({
          calendarIds: args.calendarIds,
          timeMin: args.timeMin,
          timeMax: args.timeMax,
          query: args.query,
          maxResults: args.maxResults,
          singleEvents: args.singleEvents,
          showDeleted: args.showDeleted,
        }),
      );
    case "calendar_get_event":
      return json(await client.getEvent(calId, args.eventId));
    case "calendar_freebusy":
      return json(
        await client.freeBusy({ calendarIds: args.calendarIds, timeMin: args.timeMin, timeMax: args.timeMax }),
      );
    case "calendar_create_event":
      return json(await client.createEvent(calId, args.event, send));
    case "calendar_update_event":
      return json(await client.updateEvent(calId, args.eventId, args.patch, send));
    case "calendar_delete_event":
      return json(await client.deleteEvent(calId, args.eventId, send, args.confirm === true));
    default:
      return err(`Unknown tool: ${name}`);
  }
}

export async function handleCallTool(
  name: string,
  args: Record<string, any>,
  deps: ToolDeps,
): Promise<ToolResult> {
  try {
    if (name === "calendar_list_accounts") {
      return json(deps.store.list());
    }
    const known = tools.some((t) => t.name === name);
    if (!known) return err(`Unknown tool: ${name}`);
    if (!args.account) return err(`Missing required "account" argument for ${name}.`);
    const client = await deps.registry.getClient(args.account);
    return await dispatch(client, name, args);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
