# Chapter layout preview

Open `/design/learning-layouts.html` on the deployed site. This preview is separate from the current course. Production components and the existing learning module are unchanged.

## Three chapter forms

- **Request fields**: select `id`, `name` or `arguments` to see the actual value and its explanation. The schema comes from the serialized Pi request.
- **Execution**: follow five recorded events, with data and local previous/next controls beside the example. `tool_execution_start` records request processing before tool lookup and schema validation. The trace has no separate validation event.
- **Workspace**: choose a virtual file and compare before/after snapshots or line differences. The displayed change belongs to a `write_file` call later in the same task, with its own call ID.

Body text uses 18px, values/code use at least 16px. The main content area can grow to 1840px on a landscape display. These are design choices. Text is not scaled with a canvas. Narrow screens reflow and can scroll normally; there is no global event slider.

## Data

`learning-layouts-data.json` was captured by running the current `runInProcess` implementation with `defaultSettings`, `INITIAL_FILES` and `DEFAULT_PROMPT`. The model responses are locally scripted; Pi core, parsing and file tools executed normally. The preview itself reads this capture rather than executing a new run.

Published Pi package revision: `a13d35a742c6ef8462812a28fbe1d8c8b7431c32`. Read request/result IDs were checked for equality. Workspace snapshots are the original event before the write and the write event itself.

## Verification

`tests/design-preview.spec.ts` exercises field selection, all five steps, workspace view switching and 390px reflow. It checks that visible code stays at least 16px, there is no horizontal document overflow, and no global range slider exists. Screenshots are under `docs/screenshots/design-*.png`.

The preview is for layout feedback. Course migration is deferred until the presentation direction is accepted.
