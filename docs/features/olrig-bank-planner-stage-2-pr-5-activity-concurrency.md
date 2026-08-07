# Proposed PR — Stage 2.5: Activity history and concurrency handling

## Objective

Make collaborative changes understandable and make concurrent editing conflicts explicit and recoverable.

## Scope

- Show recent plan activity to the Booker and every authorized participant.
- Resolve revision actors to an administrator, Booker or invited participant display name.
- Keep structured revision details server-side while presenting concise, safe summaries.
- Return the current server revision with stale-write responses.
- Present a visible conflict notice and an explicit “Reload latest plan” recovery action.
- Record structured, content-free diagnostics for concurrency conflicts without logging credentials.
- Preserve the existing transaction lock and optimistic revision checks for every mutation.

## Acceptance criteria

- Recent activity is newest first and identifies who performed each meaningful change.
- Owner permission changes and participant proposals appear in the same history.
- A stale mutation remains atomic and returns HTTP 409 with both the conflict code and current revision.
- The UI never silently replaces newer work and gives the user a keyboard-operable reload action.
- Booker and participant credentials and private plan content are absent from conflict logs.

## Out of scope

- Comments and proposal approval UI.
- Diffing or automatically merging conflicting form fields.
- Long-term revision retention controls.
- Guest Local Guide contribution consent.
