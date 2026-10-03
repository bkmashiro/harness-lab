# Verification record

Executed locally on macOS with Node 26.7.0. Model/runtime verification used local fixtures. No paid model calls or GitHub Actions were used.

## Gates executed

- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 51 tests passed across 9 files.
- `npm run test:e2e`: 21 Chromium browser tests passed against the production static build (Vite preview), including file Diff.
- `npm run build`: passed, producing a static `dist/` tree.
- `npm audit --omit=dev`: 0 vulnerabilities at dependency setup; lockfile is committed with the product.

Browser coverage includes both protocols' complete repair flow, no external requests in default mode, 390px document overflow, malformed tool arguments, provider errors, actual failed test output, trace export without the configured key, non-stream single-call JSON, cancellation and live confirmation without sending.

## Chapter-focused layout acceptance

The original 1280×800 page had document height 2064px. It now uses two viewport panels with a top chapter selector and persistent controls. Default chapter 1 projects exactly three real events; other chapters select their own event IDs without renumbering. Full trace is opt-in. Browser tests cover 1280×800, 1440×900, 1024×768, 390×844 and 320×720; document bounds fit the viewport and settings/experiment controls remain reachable. Large payloads scroll within panels. Tests also verify JSON/Diff reachability, all reading paragraphs, and that the footer does not overlap the learning panel.

## Regression findings and fixes

1. Failed-test fixture originally wrote correct addition while only narrating failure. Added a failing integration test (`expected true to be false`), then changed this fixture to write multiplication. The bounded executor now produces actual failing arithmetic results before the failure narration.
2. Demo request normalization originally changed content arrays before the transport capture. Removed it: the installed Pi serializer output goes directly into the transport. `onPayload` is a separate pre-fetch observation, not a second network request.
3. Raw live observation originally redacted each read independently, allowing a known credential split across fetch reads to be reconstructed. A new test reproduced the full credential in concatenated observations. The observer now retains a possible credential prefix across reads, removes known complete matches before emitting, and explicitly describes observation fragments as potentially delayed/merged. Original bytes sent to the Pi parser are unchanged.
4. Returned messages and event file snapshots are scrubbed of the configured credential. Runtime tests cover user-message and file-snapshot echoes as well as exported trace coverage in the browser.
5. A global `.workspace` layout selector also styled graph/legend elements bearing the workspace lane. Renamed the layout to `.workbench-layout`, keeping lane identities unchanged.

## First module sample

Six units provide objectives, prerequisites, field explanations, source excerpts, a read-only exercise, three graded questions and a summary. Browser tests cover wrong predictions, actual missing-file errors, empty-path schema rejection, quiz retry, completion and refresh persistence. Chat and Responses integration tests both execute exactly one read call without changing files. Course and exercise event collections remain separate, including file snapshots.

The three lesson excerpts were compared to fixed upstream source after removing common indentation and match lines 715–726, 829–840 and 922–935 of `packages/agent/src/agent-loop.ts`. Source inspection also confirmed that `tool_execution_start` precedes preparation/validation (lines 541–549); the diagram and lesson describe it as request processing, with execution occurring later.

Remaining eight chapters have concise explanations and projections, not the full six-unit teaching treatment.

## Chapter-specific design preview

`public/design/learning-layouts.html` is an isolated layout preview. It presents request fields, five recorded read-call events and before/after workspace content with fixed-size HTML text. The JSON capture was produced by the current Pi runtime with the default scripted provider. Request/result IDs and the write snapshot change were checked during capture. Two added browser tests cover field selection, local step controls, file comparison, no global slider, and visible code at least 14px with 390px reflow. Production course components are unchanged.

Browser verification uses a fresh Vite preview server with strict port selection; `HARNESS_TEST_PORT` can isolate it from other local applications.

## Scope and limits

- Provider responses are project-authored fixtures; installed Pi adapters handle the protocols, but no model inference occurs.
- The teaching executor supports bounded arithmetic only; it does not run arbitrary JavaScript.
- Mock-fetch tests cover live forwarding and authorization. Third-party compatibility and CORS remain untested.
- Tests cannot observe provider internals, network packets, token boundaries, or private reasoning.
- The session/compaction chapters explain a fixed upstream revision; this product does not run the complete coding-agent session/compaction implementation.

Screenshots under `docs/screenshots/` come from production-browser acceptance runs, not design mockups. All 13 unique fixed-revision source paths used by the curriculum/inspector were checked with HTTP HEAD and returned 200.
