# Task Plan

## Done

- [x] Design spec + implementation plan (committed under `docs/superpowers/`)
- [x] Issue #1 → branch `issues/1` → PR #2 → merged to `main`
- [x] All 18 plan tasks implemented test-first (44 tests, typecheck, build, CLI smoke green)
- [x] `simplify` cleanup pass committed
- [x] README, MCPB manifest, packaging script, LICENSE

## Open (manual / future)

- [ ] Live OAuth verification: create a Google Cloud OAuth desktop client, enable Calendar API, `gcal-mcp auth add <alias>`, then exercise `calendar_list_calendars` / `calendar_list_events` against a real account
- [ ] Manually confirm `calendar_delete_event` refuses an attendee event without `confirm: true` end-to-end
- [ ] Build and validate the `.mcpb` bundle (`bash scripts/build-mcpb.sh`) and test-install in Claude Desktop
- [ ] Optionally harden token-file permissions and ensure `refresh_token` is preserved across refreshes (see findings)
