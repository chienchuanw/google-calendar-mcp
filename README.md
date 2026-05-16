# google-calendar-mcp

Multi-account Google Calendar MCP server — list, read, create, update, delete, and analyze events across several Google accounts from Claude. Every tool takes an `account` alias; event tools take an optional `calendarId` (defaults to the account's primary calendar).

## Setup

1. **Create a Google OAuth client**: Google Cloud Console → new project → enable the **Google Calendar API** → configure the **OAuth consent screen** (External) and add scopes:
   ```
   https://www.googleapis.com/auth/calendar
   https://www.googleapis.com/auth/calendar.events
   ```
   Add your Google address(es) under **Test users**. Then **Credentials → Create credentials → OAuth client ID → Desktop app → Download JSON**.

2. **Install and place credentials:**
   ```bash
   npm install && npm run build
   mkdir -p ~/.gcal-mcp
   cp /path/to/downloaded-credentials.json ~/.gcal-mcp/credentials.json
   ```

3. **Add one or more accounts** (opens a browser each time; port 3000 must be free):
   ```bash
   node dist/index.js auth add work
   node dist/index.js auth add personal
   node dist/index.js auth list
   ```

4. **Register with Claude Code:**
   ```bash
   claude mcp add gcal -- node /absolute/path/to/google-calendar-mcp/dist/index.js
   ```

## Tools

`calendar_list_accounts`, `calendar_list_calendars`, `calendar_list_events`, `calendar_get_event`, `calendar_freebusy`, `calendar_create_event`, `calendar_update_event`, `calendar_delete_event`.

Writes never notify attendees unless you pass `sendUpdates: "all"` (default `"none"`). `calendar_delete_event` refuses events with attendees unless `confirm: true`, and returns the deleted event body.

## Storage

```
~/.gcal-mcp/
├── credentials.json      # shared Google OAuth client (never commit)
└── accounts/
    ├── work.json         # { alias, email, token }  (never commit)
    └── personal.json
```

Override the directory with `GCAL_MCP_CONFIG_DIR`. Tokens auto-refresh; if refresh fails, re-run `gcal-mcp auth add <alias> --force`.

## Development

```bash
npm test           # vitest
npm run build      # tsc -> dist/
npm run typecheck  # tsc --noEmit
```

## Packaging (MCPB)

`bash scripts/build-mcpb.sh` produces `build/google-calendar-mcp.mcpb`. OAuth setup (`credentials.json` + `gcal-mcp auth add <alias>`) must still be done from a terminal.
