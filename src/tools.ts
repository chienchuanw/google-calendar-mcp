export interface JsonSchemaProperty {
  type: string;
  description?: string;
  items?: { type: string };
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, JsonSchemaProperty>;
    required: string[];
  };
}

const ACCOUNT: JsonSchemaProperty = {
  type: "string",
  description: "Configured account alias to act on (e.g. 'work'). See calendar_list_accounts.",
};
const CALENDAR_ID: JsonSchemaProperty = {
  type: "string",
  description: "Calendar id. Defaults to the account's primary calendar. See calendar_list_calendars.",
};
const SEND_UPDATES: JsonSchemaProperty = {
  type: "string",
  enum: ["none", "all", "externalOnly"],
  description:
    "Who to email about this change. Defaults to 'none' (no attendee notifications). Set 'all' to notify everyone.",
};
const STR = (description: string): JsonSchemaProperty => ({ type: "string", description });
const NUM = (description: string): JsonSchemaProperty => ({ type: "number", description });
const BOOL = (description: string): JsonSchemaProperty => ({ type: "boolean", description });
const STR_ARR = (description: string): JsonSchemaProperty => ({
  type: "array",
  items: { type: "string" },
  description,
});

function tool(
  name: string,
  description: string,
  properties: Record<string, JsonSchemaProperty>,
  required: string[],
): ToolDefinition {
  return { name, description, inputSchema: { type: "object", properties, required } };
}

export const tools: ToolDefinition[] = [
  tool("calendar_list_accounts", "List configured Google accounts (alias -> email).", {}, []),
  tool(
    "calendar_list_calendars",
    "List all calendars visible to an account (id, summary, primary, accessRole, timeZone).",
    { account: ACCOUNT },
    ["account"],
  ),
  tool(
    "calendar_list_events",
    "List events in a time window across one or more calendars (merged, sorted by start).",
    {
      account: ACCOUNT,
      calendarIds: STR_ARR("Calendar ids to query. Defaults to ['primary']."),
      timeMin: STR("RFC3339 lower bound (inclusive), e.g. 2026-05-16T00:00:00Z."),
      timeMax: STR("RFC3339 upper bound (exclusive)."),
      query: STR("Optional free-text search over event fields."),
      maxResults: NUM("Max events per calendar (default 250)."),
      singleEvents: BOOL("Expand recurring events into instances (default true)."),
      showDeleted: BOOL("Include cancelled events (default false)."),
    },
    ["account", "timeMin", "timeMax"],
  ),
  tool(
    "calendar_get_event",
    "Get a single event by id.",
    { account: ACCOUNT, calendarId: CALENDAR_ID, eventId: STR("Event id.") },
    ["account", "eventId"],
  ),
  tool(
    "calendar_freebusy",
    "Query busy blocks across one or more calendars in a time window.",
    {
      account: ACCOUNT,
      calendarIds: STR_ARR("Calendar ids. Defaults to ['primary']."),
      timeMin: STR("RFC3339 lower bound."),
      timeMax: STR("RFC3339 upper bound."),
    },
    ["account", "timeMin", "timeMax"],
  ),
  tool(
    "calendar_create_event",
    "Create an event. Pass a Google Calendar event resource as `event`.",
    {
      account: ACCOUNT,
      calendarId: CALENDAR_ID,
      event: {
        type: "object",
        description: "Google Calendar event resource (summary, start, end, attendees, ...).",
      },
      sendUpdates: SEND_UPDATES,
    },
    ["account", "event"],
  ),
  tool(
    "calendar_update_event",
    "Patch an existing event. Only fields present in `patch` change.",
    {
      account: ACCOUNT,
      calendarId: CALENDAR_ID,
      eventId: STR("Event id."),
      patch: {
        type: "object",
        description: "Partial event resource; only included fields are modified.",
      },
      sendUpdates: SEND_UPDATES,
    },
    ["account", "eventId", "patch"],
  ),
  tool(
    "calendar_delete_event",
    "Delete an event. Returns the deleted event body. Refuses events with attendees unless confirm=true.",
    {
      account: ACCOUNT,
      calendarId: CALENDAR_ID,
      eventId: STR("Event id."),
      sendUpdates: SEND_UPDATES,
      confirm: BOOL("Required true to delete an event that has attendees."),
    },
    ["account", "eventId"],
  ),
];
