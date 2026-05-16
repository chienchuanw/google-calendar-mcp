# google-calendar-mcp — Design

Date: 2026-05-16
Status: Approved (design)

## Summary

A standalone, multi-account Model Context Protocol (MCP) server that lets an agent
read, create, update, delete, and analyze Google Calendar data across several
connected Google accounts. It is structurally a fork of the existing
`gmail-mcp` project (`/Users/chienchuanw/Documents/gmail-mcp`), reusing its
multi-account OAuth, token storage, client-registry, and MCPB packaging, with the
Gmail API layer replaced by a Google Calendar layer.

## Goals

- Connect multiple Google accounts via OAuth, addressed by a short alias.
- Read calendars and events; create/update/delete events; query free/busy.
- Keep the tool surface small and primitive: expose API capabilities, let the
  agent perform higher-level analysis (conflict detection, time accounting).
- Safe-by-default writes: never notify attendees unless explicitly requested.

## Non-goals

- No dedicated conflict-detection or time-accounting tools (agent reasons over
  read tool output instead).
- No shared infrastructure with `gmail-mcp` — independent OAuth client/config.
- No web UI; this is a stdio/MCPB MCP server.

## Architecture

Fork of the `gmail-mcp` module layout:

| Module | Role | Origin |
|---|---|---|
| `index.ts` | Entry: route CLI vs stdio server | reuse ~as-is |
| `cli.ts` | `auth add/list/remove <alias>` | reuse ~as-is |
| `auth-flow.ts`, `oauth.ts` | Loopback OAuth (port 3000), token refresh | reuse, calendar scopes |
| `config.ts` | Config dir resolution | rename → `~/.gcal-mcp`, env `GCAL_MCP_CONFIG_DIR` |
| `accounts.ts` | Per-account token JSON store | reuse as-is |
| `client-registry.ts` | Cache authenticated API client per account | reuse (Calendar client) |
| `calendar-client.ts` | Google Calendar API wrapper | **new**, replaces `gmail-client.ts` |
| `tools.ts` | MCP tool schemas | rewritten for calendar |
| `handlers.ts` | Dispatch tool → client method | rewritten for calendar |
| `server.ts` | MCP server wiring | reuse ~as-is |
| `scripts/build-mcpb.sh` | `.mcpb` bundle | reuse ~as-is |

**OAuth:** separate Google Cloud project and OAuth client. Scopes:
`https://www.googleapis.com/auth/calendar`,
`https://www.googleapis.com/auth/calendar.events`.
Credentials at `~/.gcal-mcp/credentials.json`; per-account tokens at
`~/.gcal-mcp/accounts/<alias>.json`. Override dir via `GCAL_MCP_CONFIG_DIR`.

## Addressing model

Every tool takes `account` (the alias). Event/freebusy tools take an optional
`calendarId` that defaults to the account's `primary` calendar.
`calendar_list_calendars` discovers calendar IDs.

## Tools

Discovery:
- `calendar_list_accounts` — configured aliases → email.
- `calendar_list_calendars` — calendars in an account: id, summary, primary,
  accessRole, timeZone.

Read:
- `calendar_list_events` — date-range query. Supports one or more `calendarId`s
  (results merged and sorted by start), `query` free-text, `maxResults`,
  `singleEvents` (expand recurring), `showDeleted` (default false). Returns
  compact JSON: id, summary, start, end, status, attendees (email +
  responseStatus), calendarId.
- `calendar_get_event` — full event by id.
- `calendar_freebusy` — `freebusy.query` across one or more calendars in a
  window; returns busy blocks. "Find open slots" is the agent reasoning over
  this output.

Write — `sendUpdates` defaults to `'none'` (no attendee email) and must be set
explicitly to `'all'` or `'externalOnly'` to notify. Every write echoes the
`sendUpdates` value actually used.
- `calendar_create_event` — summary, start, end, optional attendees, location,
  description, recurrence, reminders.
- `calendar_update_event` — patch semantics; only provided fields change.
- `calendar_delete_event` — returns the full event body in the response
  *before* deleting (recoverable from agent context). Refuses when the event
  has attendees unless `confirm: true` is passed.

No conflict-detection or time-accounting tools by design.

## Data flow

tool call → `handlers.dispatch` resolves `account` via `AccountStore` →
`ClientRegistry` returns a cached, token-refreshed Calendar API client →
`CalendarClient` method calls googleapis → result normalized to compact JSON →
returned as MCP text content.

## Error handling

- Unknown `account` alias → error listing configured aliases.
- Token refresh failure → error instructing `gcal-mcp auth add <alias> --force`.
- Google API errors (403/404/409) → surface HTTP status + message, not raw
  stack traces.
- `calendar_delete_event` on an event with attendees without `confirm: true` →
  refuse, returning the event summary so the agent can re-confirm.
- Write tools always report the effective `sendUpdates` so the agent knows
  whether attendees were notified.

## Testing

vitest, mirroring `gmail-mcp`:
- Unit: `accounts`, `config`, `oauth`, `client-registry`, tool-schema validity.
- `calendar-client.test.ts` + `handlers.test.ts` with the googleapis Calendar
  client mocked. Assert: `sendUpdates` default `'none'`; `calendarId` default
  `primary`; delete-with-attendees guard; multi-calendar merge/sort ordering;
  API error surfacing.
- `cli.test.ts`, `auth-flow.test.ts` reused from gmail-mcp.

## Packaging

`bash scripts/build-mcpb.sh` → `build/google-calendar-mcp.mcpb`, self-contained
stdio bundle. OAuth setup (`credentials.json` + `gcal-mcp auth add <alias>`)
done from a terminal. Bundle `config_dir` setting maps to `GCAL_MCP_CONFIG_DIR`.
