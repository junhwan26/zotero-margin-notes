# Isolated Zotero runtime smoke test

Run from the project directory:

```sh
python3 scripts/runtime-smoke.py
```

The harness uses the installed `/Applications/Zotero.app` (override with `--app`),
a new temporary profile, a separate temporary data directory, and a test-only
XPI containing the current production bootstrap and sources. It generates a
synthetic two-page, two-column PDF and creates annotations in that temporary
library. It never opens the user's profile or existing PDFs. Temporary profile
and library files are removed on completion. `--keep-profile` retains the
synthetic test files for diagnosis; `--visible` opts into a visible test window.
`--visible --visual-hold 60` pauses at the checked baseline for native app visual
review, recording `visual-ready` and the isolated process ID in its live JSON
report. It does not capture screenshots or inspect any other app window.

The JSON evidence is written to `dist/runtime-smoke-report.json`. Each geometry
snapshot records the actual Zotero PDF viewport, page rectangles, card
rectangles, and overflow count. The test checks:

- Production bootstrap loading and toolbar mounting.
- Left/right placement on a real two-column PDF, non-overlap, and blank comments.
- A persisted Zotero comment edit appearing in its margin card.
- Annotation preservation while Delete, Backspace, Shift+Arrow, and Command+Z
  are dispatched from the focused comment.
- Zoom, page rotation, page navigation, crowded comments, and a narrow viewport.
- Toggle behavior, overlay/toolbar removal, and restoring the keyboard guard.

The disposable test XPI follows Zotero's installed extension loader; it does not
run against a mocked reader. Production sources are loaded through their own
bootstrap scope, preserving Zotero's cross-scope script-loader behavior.

On macOS, sandboxed process launching can terminate Zotero with signal 6 before
extension startup. Run this isolated harness with the environment's approved
application-launch permission when needed. A timeout, launch failure, or skipped
assertion is not a successful runtime result.

Zotero 9.0.6's installed `modules/Extension.sys.mjs` explicitly requires
`applications.zotero.id`, `applications.zotero.update_url`, and
`applications.zotero.strict_max_version`; a missing update URL rejects the XPI
before bootstrap startup. The runtime test deliberately uses the production
manifest, so that this class of packaging problem is caught.

## Verified run

On 2026-10-07, Zotero 9.0.6 completed all **50 checks** in a visible, isolated
profile. At the 1600 × 871 baseline, four comments appeared in the two outer
margins with no card/page or card/card overlap. With 18 additional comments,
12 cards and one overflow control were displayed. A 620 px viewport reported
insufficient space without covering the document; pressing Fit restored five
cards and an overflow control. All test profiles and test processes were
removed after the run; the JSON report preserves the geometry evidence.

The native screenshot tool resolved the user's existing Zotero instance instead
of the disposable process, so no screenshot is presented as evidence for this
run. Runtime checks use the actual PDF reader DOM and bounding rectangles.
