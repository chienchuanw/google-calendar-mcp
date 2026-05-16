# Findings

## Architecture

`google-calendar-mcp` is a deliberate fork of the `gmail-mcp` module layout. OAuth loopback flow, per-account token store, client registry, and MCPB packaging are mechanical adaptations of a vetted parent; only `calendar-client.ts` is novel. Not sharing code with gmail-mcp is intentional (independent server, separate OAuth client and config dir).

## Key design decisions

- Tools take an `account` alias; event tools take optional `calendarId` defaulting to `primary`.
- Writes default to `sendUpdates: "none"` — attendees are never notified unless explicitly opted in.
- `calendar_delete_event` returns the event body before deleting and refuses attendee events without `confirm: true`.
- Primitives-only tool surface: no conflict-detection or time-accounting tools; the agent reasons over `list_events`/`freebusy` output.
- Account email is derived from the primary calendar id, avoiding an extra userinfo scope.
- `SendUpdates` value set is single-sourced (`calendar-client.ts`) and consumed by the tool schema to prevent drift.

## Non-blocking review notes (deferred)

1. **`refresh_token` preservation across refresh** — inherited pattern parity with gmail-mcp; Google may omit `refresh_token` on refresh responses. Revisit if re-auth loops appear in practice.
2. **Token file permissions** — account JSON written with default mode; consider `0600`.
3. **`orderBy: "startTime"` with `singleEvents: false`** — the Calendar API rejects this combination; current default is `singleEvents: true`, so only an issue if a caller explicitly passes `singleEvents:false`. Low likelihood on a primitive surface.

None block release; all are either parent-pattern parity or low-likelihood edges.
