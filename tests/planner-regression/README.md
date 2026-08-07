# Replayable local Docker planner regression

This state-changing Playwright suite exercises the Holiday Planner and database-backed Local Guide against the local Docker application. It covers planner creation, editing, sharing and AI proposal acceptance; all 39 migrated Local Guide entries and the complete example plan; and a disposable consented contribution through draft, publication, stable-ID planner selection, slug aliasing and unpublication.

The suite refuses non-loopback origins, requires explicit mutation consent and removes its booking, administrator and Local Guide fixtures after every run. Cascading database relationships remove the associated plan, participants, links, capabilities, proposals, contributions and revisions.

Start the migrated Docker stack, expose its database to the host, and run:

```bash
PLANNER_REGRESSION_ALLOW_MUTATION=yes \
DATABASE_URL=postgresql://soccotash:password@127.0.0.1:5432/soccotash \
npm run test:planner-regression
```

The application defaults to `http://127.0.0.1:8080`. Override it only with another loopback origin through `PLANNER_REGRESSION_BASE_URL`.

Use `npm run test:planner-regression:headed` for an interactive run and `npm run show:planner-regression-report` to replay its trace and video. These artifacts contain disposable private links and must not be published or retained as public artifacts.
