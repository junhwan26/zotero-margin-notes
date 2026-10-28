# AI SLOP CLEANUP REPORT

Scope: Margin Notes 0.4.2; `src/overlay.js`, `src/i18n.js`, `src/markdown.js`, and their regression tests. No dependency or architecture changes. Production source has 34 fewer lines: 28 in localization and six in the overlay; the Markdown file has no net line change.

Behavior Lock: Before production edits, 0.4.1 passed 49 Node tests plus 292 Zotero 9.0.6 and 309 Zotero 10.0.6 isolated runtime checks. New unavailable-bridge assertions reproduced an incorrect save success before the repair, then passed. Current Node suite: 56/56. Final isolated native runs: 294/294 for Zotero 9.0.6 and 311/311 for Zotero 10.0.6. The two new teardown assertions per version pass.

Cleanup Plan: Inventory/classify fallbacks; lock behavior; repair the two masking paths; delete dead entries/state and duplicate label writes; move the fence expression outside its line loop; review and verify. Independent plan and code reviewers found no architectural escalation or actionable defect; the code reviewer also passed 36 focused tests.

Fallback Findings: Broad teardown exception suppression and raw privileged-array dispatch were masking fallbacks. Both were repaired within the existing boundary; no escalation was required. Scoped Zotero/version and parser safeguards remain.

UI/Design Findings: No visual redesign. The fixed 13px body text follows the user's explicit requirement. White surfaces, selected-text contrast, modest card shadows, and smaller metadata controls retain their established purpose.

## Passes Completed

- Fallback resolution gate: log the original teardown error while continuing cleanup; require `Cu.cloneInto` for save and native-editor selection, with existing error feedback on failure.
1. Dead code deletion: remove 28 unused English/Korean entries, the unused `crowded` state, and redundant creation-time card labels.
2. Duplicate removal: construct one closing expression per code fence and use the existing marker directly.
3. Naming/error handling: remove an unreachable window-target arm and preserve original clone/cleanup diagnostic objects.
4. Test reinforcement: add locale/fallback, primary clone, absent bridge, failed clone, and teardown-continuation coverage.

## Quality Gates

- Regression tests: Node **56/56 PASS** (20 layout, 18 Markdown, 12 lifecycle/bridge, 6 localization); native Zotero 9.0.6 **294/294 PASS**, Zotero 10.0.6 **311/311 PASS**. The [public evidence](evidence/compatibility-0.4.2.json) contains all 605 native name/result pairs.
- JavaScript syntax: **PASS** (`npm run check`).
- Diff whitespace: **PASS** (`git diff --check`).
- XPI build: **PASS**; `zotero-margin-notes-0.4.2.xpi` SHA-256 `a0d05f1a8bae8888989fed738d15ba2488a6226b62779700b95c18fe1b8a2b43`.
- Lint: **N/A**; no dedicated linter configured.
- Typecheck: **N/A**; no type checker configured.
- Static/security scan: **N/A**; no scanner configured. Manual review found no new HTML execution sink, runtime dependency, or raw reader-array dispatch path.

## Changed Files

- [src/overlay.js](../src/overlay.js): remove unused state/duplicate initialization and repair reader/teardown boundaries.
- [src/i18n.js](../src/i18n.js): remove unused translation entries; visible strings and exported API remain.
- [src/markdown.js](../src/markdown.js): reuse each code fence's closing expression.
- [tests/i18n.test.cjs](../tests/i18n.test.cjs): protect visible labels, locale priority, interpolation, and translation fallbacks.
- [tests/lifecycle.test.cjs](../tests/lifecycle.test.cjs): protect cloning and explicit bridge-failure behavior.
- [tests/runtime-harness.js](../tests/runtime-harness.js): verify teardown diagnostics and continuation in real Zotero.
- Release metadata, bilingual README/compatibility notes, runtime notes, and the public evidence snapshot record 0.4.2 and its validation.

## Fallback Review

- Findings: swallowed cleanup exceptions; clone-or-raw-array alternate dispatch; unreachable target selection arm.
- Classification: masking error/boundary fallback paths, repaired without replacing the architecture.
- Preserved grounded safeguards: exported cross-compartment focus guard, Zotero 9 plugin-ID listener cleanup, Zotero 10 Reading Mode suspension, native-rich editor delegation, parser limits, scalar layout heights, metadata and locale fallbacks.
- Escalation status: none; independent review confirmed a bounded repair.

## Remaining Risks

- Deferred cleanup: retained exported localization API and other parser allocation optimizations; neither is needed for this pass.
- Native validation covers isolated macOS profiles and synthetic PDFs. Windows/Linux, named third-party add-on combinations, full Reading Mode UI, and the operating-system clipboard are not certified.
- No installation or screenshot verification is claimed by this report.
