## Question ot AI

At the moment there is only a list of activities in the plan for any day. What I need is for there to be a scheduling state for the planning. When in this state, the local guide and candidate activities panels are hidden and day gets an underlay of  hour slots by, by default, from 07:00 to 21:00. The activities on the day can be moved into hour slots and can be extended to cover more than an hour. In this way the  scheduling and be seen to be coming into the planning.

## Response from AI

This is a well-known pattern too — it's the same interaction model as a day-view calendar / time-grid scheduler (the pattern behind Google Calendar's day view, Outlook's day view, Fantastical, etc.), technically called a time-block grid or timeline view, where items are represented as blocks positioned and sized by time rather than as rows in a list. Below is a full spec for how it'd apply to your planner.

Two view states for a day

List state (what exists now)

Local Guide panel + Candidates panel + ordered "Your plan" list, all visible
Items have position (ordering) but no time

Schedule state (new)

Local Guide and Candidates panels hidden — full width given to the day
A time-grid underlay appears: hour rows from 07:00–21:00 by default (configurable range)
Plan items render as time blocks positioned/sized against that grid instead of as list rows
A toggle control (e.g. "List / Schedule" segmented switch) at the top of the day panel switches between the two — this is the core mechanism, not a separate page
The time-grid mechanism itself

Structure

Vertical axis = time, one row per hour (07:00, 08:00 … 21:00), each row a fixed pixel height (e.g. 60px = 1hr, giving you a 15px-per-15-min unit for snapping)
Each unscheduled plan item (no startTime) sits in a small tray above or beside the grid — an "unscheduled" bucket, so nothing gets lost when you enter Schedule state
Each scheduled item becomes a block: positioned at top = (startTime - 07:00) × pxPerMinute, height = duration × pxPerMinute

Interactions

Move into a slot — drag an unscheduled item from the tray onto the grid; drop position snaps to the nearest 15/30-min increment and sets startTime. This reuses the same drag-handle (⠿) mechanism already in your candidates/plan lists — good consistency.
Extend duration — a resize handle on the block's bottom edge; drag down extends endTime in snap increments. This is the same affordance as Google Calendar's bottom-edge drag.
Reposition a scheduled block — drag the block body (not the resize handle) to a new time; both start and end shift together, preserving duration.
Return to list — dragging a block back onto "unscheduled" (or a dedicated action in its ⋮ menu) clears startTime/endTime, same as your existing "Return to candidates."
Overlap handling — decide explicitly: do you allow two activities in the same slot (side-by-side columns, like Calendar does), or block/warn on overlap? For a family holiday planner, allowing overlap with a visual side-by-side split is probably friendlier than hard-blocking, since e.g. "packed lunch" and "walk" might co-occur.

Data model implications

You already have startTime/endTime fields in the item JSON (visible in the blob you showed me earlier — "endTime":null,...,"startTime":null), so the data model is already ready for this. This state is really just: (a) a UI mode toggle, (b) reading/writing those two fields via drag instead of a form, (c) a positioning/rendering layer on top.
Unscheduled items just have startTime: null — no schema change needed, which is a good sign this is additive.
Naming for a dev handoff
Overall pattern: time-grid scheduler / day-view timeline / calendar block view
The toggle between your current mode and this one: a view-mode switch (List view ↔ Schedule/Timeline view)
Individual items-as-blocks: time blocks or event blocks
The vertical hour markers: time-grid or hour ruler
The resize-by-dragging-the-edge interaction: duration handle / resize handle
The "not yet on the grid" holding area: unscheduled tray (parallel to your existing "Candidate activities" concept — you could even reuse that panel for this purpose, just re-labeled, so items that aren't yet timed stay visible without disappearing)
A few product decisions worth pinning down before building
Does entering Schedule state require every item to get a time, or can some stay permanently untimed (e.g. a loose "buy postcards" item with no fixed slot)? I'd lean toward allowing both — the unscheduled tray handles this.
Minimum block size — if someone drags a 15-min resize on a 1hr-tall grid, does a block collapse to something unreadably thin? Worth a minimum visual height with the label truncating/overflowing gracefully.
Does the 07:00–21:00 range need per-day override (e.g. an early ferry crossing at 6am)? Since you said "by default," I'm assuming yes — a per-day or per-booking configurable range makes sense to add now rather than retrofit later.
Status vs. schedule — you already have a status field (idea/proposed/agreed/booked/…). Worth deciding whether dropping something onto the grid auto-promotes its status (e.g. idea → proposed), since scheduling it is itself a signal of increasing commitment.

## Initial feature definition

The booking-linked guest planner will present two complementary views of the selected holiday day: **List** for choosing and ordering activities, and **Schedule** for assigning those activities to times. Scheduling is an additive view of the existing plan and does not change an activity's planning status.

### Agreed page structure

The guest planning workspace is ordered as follows:

1. **Your daily planner** — combines the existing Holiday days strip and Your plan panel. The selected day's activities appear beneath the horizontally scrollable day tabs. A List/Schedule segmented control replaces the former Holiday days heading.
2. **Candidate activities** — remains the ordered holding list and appears immediately below the daily planner.
3. **Local Guide** — appears below Candidate activities and retains its category browsing and add-to-candidates behaviour.

Candidate rows use compact inline links. When a candidate has a source URL, its name opens that website in a new tab. A Local Guide source is represented by an inline **LG** link to the guide entry. A candidate without a source URL has a non-linked name.

When an activity is selected from the Local Guide, its published external website URL is copied into the candidate as well as retaining the canonical Local Guide reference. This applies to individual and whole-category additions. Existing Local Guide candidates and scheduled activities are backfilled where their published guide entry has a valid HTTP or HTTPS external link.

Activities in the daily plan show an inline **WS ↗** link after the name when a source URL is available. Selecting the activity name continues to open its planner detail editor.

### Initial scheduling behaviour

Schedule view hides Candidate activities and Local Guide, gives the selected day the full workspace width, and displays its activities against a default 07:00–21:00 time grid. The grid expands to include activities already timed outside that range. Untimed activities already assigned to that day remain available in an unscheduled area.

Dropping an untimed activity onto the grid assigns a one-hour duration. Drops and resizing snap to 30-minute increments. Moving a scheduled block preserves its duration where the visible grid permits it. A bottom duration handle resizes a block, while the activity editor remains the precise touch and keyboard alternative. A scheduled activity can be returned to the untimed area through its action menu.

Schedule changes update `startTime` and `endTime` without changing activity status. Timed activities in List view are ordered by their start time so the List retains the same earlier-to-later meaning as Schedule view; untimed activities follow them while retaining their relative order. Each completed drop or resize is persisted as one revision-checked update; pointer movement itself is not saved.

A scheduled activity can be dragged onto another day tab. It moves to that day without changing its start or end time and is inserted into the target day's List according to its retained scheduled time. Both native desktop dragging and a pointer-driven grip interaction are provided.

On touch devices, the scheduled-event grip is a minimum 44px target and the event follows the pointer as visible drag feedback. The day strip remains sticky while the timeline scrolls. The same grip can reposition an event within the timeline or move it onto another day tab. The event action menu also offers a day selector so cross-day movement never depends exclusively on dragging.

Overlap visualisation and finer-grained touch dragging remain candidates for refinement after the initial grid has been exercised on real mobile devices.
