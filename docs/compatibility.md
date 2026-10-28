# Dependencies & compatibility evidence

[한국어](compatibility.ko.md)

**Checked on 2026-10-28 · Margin Notes 0.4.2 · Zotero 9.0.6 / 10.0.6 matrix · macOS**

Margin Notes declares support for Zotero 9.0 through 10.0.*. It does **not** require another Zotero add-on or an npm runtime package. The release XPI includes its implementation, and comments are stored in Zotero annotations.

This report records dependency inspection and 0.4.2 validation in isolated macOS profiles. Earlier validation and installed-add-on observations are retained in clearly dated historical sections. An add-on being enabled alongside Margin Notes does not establish that all of its workflows have been tested.

## 0.4.2 cleanup checks

The cleanup removes unused translations, unused crowding state, duplicate card-label writes, and repeated fenced-code expression construction. Comment saving and rich-editor selection use Zotero's reader-window cloning bridge directly; a missing or failed bridge is reported without dispatching a raw privileged array. Teardown records the original cleanup error and continues with later cleanup and overlay removal. UI, fixed font size, responsive placement, and stored annotation comments are unchanged. No dependency was added.

| Check | 0.4.2 result | Scope |
| --- | --- | --- |
| Node test suite | **56 / 56 passed** | 20 layout, 18 Markdown, 12 lifecycle/bridge, and 6 localization tests. |
| Native Zotero 9.0.6 regression suite | **294/294 passed** | Isolated macOS runtime, including teardown error reporting and continued cleanup. |
| Native Zotero 10.0.6 regression suite | **311/311 passed** | Same suite plus controlled Reading Mode coverage. |
| Release artifact | **SHA-256 recorded** | `zotero-margin-notes-0.4.2.xpi`: `a0d05f1a8bae8888989fed738d15ba2488a6226b62779700b95c18fe1b8a2b43`. |

The [public 0.4.2 evidence](evidence/compatibility-0.4.2.json) records all 605 native check name/result pairs and the artifact hash without private paths, fixture text, or logs. The untouched 0.4.1 baseline passed 49 Node tests and 292/309 native checks before cleanup. The new bridge-failure test exposed an incorrectly reported save success before the raw-array path was removed. See the [cleanup report](cleanup-0.4.2.md) for fallback classifications, preserved compatibility boundaries, and quality gates.

## Historical 0.4.1 responsive-width checks — 2026-10-26

Margin Notes 0.4.1 uses the full available outer margin without increasing text size, fitting more words per line as space grows. Each annotation is measured at the actual left and right widths before placement, so unequal margins use the correct card heights. Responsive layout retains editor focus, selected editor text, and unsaved drafts. No dependency was added.

| Check | 0.4.1 result | Scope |
| --- | --- | --- |
| Node test suite | **49 / 49 passed** | Existing Markdown, layout, lifecycle, and localization tests plus responsive-width and per-side height placement regressions. |
| Native Zotero 9.0.6 regression suite | **292 / 292 passed** | Final isolated macOS runtime, including responsive wrapping, unchanged font size, placement safety, and editor draft/focus/selection preservation. |
| Native Zotero 10.0.6 regression suite | **309 / 309 passed** | The same coverage with 17 additional controlled Reading Mode assertions. |
| Release artifact | **SHA-256 recorded** | `zotero-margin-notes-0.4.1.xpi`: `6183a1aefafc68766516b49b361d6af4136a37304497c699dd7dcf61fc726ec5`. |

Both Zotero versions rewrapped the same synthetic paragraph from six lines in a 180px card to three lines in a 340px card, with the font unchanged at 13px. The [public 0.4.1 evidence](evidence/compatibility-0.4.1.json) records exact native check names/results and the artifact hash without private paths, fixture text, or runtime logs. These isolated runs do not certify third-party add-on combinations or the user's installed UI.

## Historical 0.4.0 checks — 2026-10-26

Margin Notes 0.4.0 renders Markdown in margin cards and overflow comments while keeping the saved annotation comment unchanged. Supported syntax includes headings, emphasis, lists, task markers, blockquotes, tables, code, and links. Double-click editing exposes the raw Markdown; Save/Cancel, native sidebar synchronization, and reopen persistence remain covered.

| Check | 0.4.0 result | Scope |
| --- | --- | --- |
| Node test suite | **44 / 44 passed** | Includes 18 Markdown tests covering syntax, safe URLs, inert HTML/images, code literals, native-rich compatibility, oversized input, and script-loader exports, plus existing layout, lifecycle, and localization tests. |
| Syntax checks, diff check, and XPI build | **Passed** | JavaScript syntax, clean diff whitespace, and the packaged 0.4.0 XPI. |
| Native Zotero 9.0.6 regression suite | **271 / 271 passed** | Real Zotero 9.0.6, synthetic two-column PDF, temporary profile, and separate test library on macOS. |
| Native Zotero 10.0.6 regression suite | **288 / 288 passed** | Real Zotero 10.0.6 with the same isolation, including 17 additional Reading Mode assertions. |
| Markdown editing and synchronization | **Passed** | Formatted card/overflow display, exact raw-source editing, Save/Cancel, sidebar/cache/SQLite synchronization, preserved display selection, and raw Markdown after reopening. |
| Markdown safety and native preservation | **Passed** | Safe external-link dispatch without PDF navigation; inert images, raw HTML, and unsafe URLs; literal HTML in code even when mixed with native rich text; existing native reader regression coverage. |
| Release artifact | **SHA-256 recorded** | `zotero-margin-notes-0.4.0.xpi`: `9282e7e44152982c840f4132cc1de747e93e662ac6756f8f17f7025b88419d8c`. |

Links permit `http`, `https`, and `mailto` and open through Zotero's external URL launcher. Images remain literal text; arbitrary raw HTML is not executed. Existing Zotero rich-text tags retain native-editor delegation and compatible display conversion, while HTML inside Markdown code stays literal. No Markdown package or other runtime dependency was added. This is a compact Markdown subset, without full CommonMark or mathematical notation support.

The [public 0.4.0 evidence snapshot](evidence/compatibility-0.4.0.json) records exact versions, the artifact hash, and every completed native check name/result. It omits private profile paths, library content, and runtime logs. These results are isolated runtime checks, not a screenshot review of the user's installed Markdown UI or a new third-party add-on integration test.

## Dependency audit

| Component | Required to use the plugin? | Evidence |
| --- | --- | --- |
| Zotero 9.0-10.0.* | Yes | [Manifest compatibility range](../manifest.json); CI is configured for Zotero 9.0.6 and 10.0.6. |
| Other Zotero add-ons | No | No required add-on is declared or loaded by the [manifest](../manifest.json) or [bootstrap](../bootstrap.js). |
| npm runtime packages | No | [package.json](../package.json) declares no runtime dependencies; the [build](../scripts/build.py) packages the project's own sources. |
| Node.js and Python 3 | Development only | Used for tests and building the XPI. End users install the XPI directly. |

The bootstrap loads the bundled localization, layout, Markdown, and overlay scripts. Its timer import comes from Zotero's built-in Gecko runtime. There is no external application service needed to display or edit comments. Zotero's normal annotation synchronization and the GitHub plugin-update endpoint remain available.

Zotero's official [Zotero 10 for Developers](https://www.zotero.org/support/dev/zotero_10_for_developers) guide says plugins should update `strict_max_version` to `10.0.*` after confirming compatibility. Zotero's [version history](https://www.zotero.org/support/changelog) lists Zotero 10.0.6 as released on 2026-10-07.

## Historical 0.3.1 checks — 2026-10-08

Margin Notes 0.3.1 expands the margin-card display scope from highlight and underline annotations to Zotero note annotations. Note annotations do not carry selected-text quotes, so the card hides the empty quote area and displays the annotation comment only.

| Check | 0.3.1 result | Scope |
| --- | --- | --- |
| Node test suite | **26 / 26 passed** | Layout, localization, lifecycle, version matrix metadata, note annotation behavior, Reading Mode draft preservation, and packaging contracts. |
| Update metadata, syntax checks, diff check, and build | **Passed** | `updates.json` metadata, JavaScript syntax, clean diff whitespace, and reproducible XPI build. |
| Native Zotero 9.0.6 regression suite | **246 / 246 passed** | Real Zotero 9.0.6, synthetic two-column PDF, temporary profile and separate test library. |
| Native Zotero 10.0.6 regression suite | **263 / 263 passed** | Real Zotero 10.0.6, synthetic two-column PDF, temporary profile and separate test library. |
| Native note annotations | **Passed** | Displays comments from native note annotations, hides the empty quote area, supports double-click editing, uses white note/editor surfaces with readable selection colors, saves and cancels through sidebar/cache/SQLite, excludes hidden and unsupported annotations, persists after reopen, and preserves native PDF text selection. |
| Zotero 10 Reading Mode handling | **Passed** | Margin notes suspend per reader pane while Reading Mode is active, Fit Notes ignores hidden PDF panes, notes resume after returning to PDF view, and unsaved drafts survive temporary suspension. The automated coverage drives Zotero's PDF-reader Reading Mode state and iframe visibility in the real reader; it is not a full end-to-end exercise of Zotero's separate Reading Mode UI. |
| Draft safety during suspension | **Passed** | Restored draft UI, including the overflow editor, unsaved draft preservation, and Cancel-without-DB-change behavior are covered by regression tests. |
| Other toolbar listener preserved | **Passed** | Repeated start/stop preserves a mocked listener registered by `another-plugin`. This is a contract test, not an integration test for a named add-on. |
| Historical 0.3.1 XPI integrity | **Passed** | The 0.3.1 build SHA-256 was `9648934bc1566ac7557bd6701ec54288c786a6ec02aa2752e749ecfc7db6922f`; the XPI installed in the actual Zotero 10.0.6 UI during that check matched the 0.3.1 build hash. |
| Historical user Zotero 10 UI spot check | **Observed** | Zotero 10.0.6 Plugin Manager showed Margin Notes 0.3.1 enabled. Page 7 of an actual PDF with existing native note annotations exposed two note cards through the macOS accessibility tree. This was not a screenshot or pixel-certification pass. |

0.3.1 public evidence:

- [Public 0.3.1 evidence snapshot](evidence/compatibility-0.3.1.json): exact versions, artifact hash, local validation results, native check counts, installed add-on observation, and recorded limitations.
- [Check workflow](https://github.com/junhwan26/zotero-margin-notes/actions/workflows/ci.yml): workflow definition for the two-version native matrix.

Historical 0.3.0 evidence remains available:

- [Public 0.3.0 evidence snapshot](evidence/compatibility-0.3.0.json): Zotero 9.0.6 and Zotero 10.0.6 native check counts, artifact hash, and installed-state observation for that build.

Historical 0.2.3 evidence remains available:

- [Passing 0.2.3 GitHub Actions run](https://github.com/junhwan26/zotero-margin-notes/actions/runs/37580613959), including its downloadable `runtime-smoke-report` artifact.
- [Public 0.2.3 evidence snapshot](evidence/compatibility-0.2.3.json): exact versions, artifact hash, and all 218 Zotero 9.0.6 native check names and results. Profile paths, library content, and runtime logs are omitted.
- [Lifecycle contract test](../tests/lifecycle.test.cjs), [native harness](../tests/runtime-harness.js), and [test isolation setup](../scripts/runtime-smoke.py).
- [Runtime test details](runtime-test-notes.md).

The native suite covers text-selection popups, highlighting, underlining, native note annotations, sidebar and margin comment editing, double-click gestures, selected-text visibility, white note surfaces in both themes, deletion, undo/redo, search, zoom, navigation, and persistence after reopening the PDF. The copy check uses a synthetic event to verify PDF text conversion; it does not exercise the shared operating-system clipboard.

**The native suite runs without the named third-party add-ons below.** It establishes that Margin Notes works independently and preserves the covered Zotero reader behaviors. It does not certify third-party add-on combinations.

## Historical observations alongside other add-ons

The local installed-add-on registry showed these versions on 2026-10-08 in the actual Zotero 10.0.6 UI with Margin Notes 0.3.1 active. These are **historical installed-state observations**, not complete integration-test results; these combinations were not retested for 0.4.0, 0.4.1, or 0.4.2.

| Add-on | Observed version | Observation | Required by Margin Notes? |
| --- | --- | --- | --- |
| Better BibTeX for Zotero | 9.0.70 | Enabled alongside Margin Notes 0.3.1; full workflows not tested. | No |
| Translate for Zotero | 2.4.8 | Enabled alongside Margin Notes 0.3.1; full workflows not tested. | No |
| Ethereal Style | 6.0.86 | Enabled alongside Margin Notes 0.3.1; full workflows not tested. | No |
| Research Vault Bridge | 0.2.1 | Enabled alongside Margin Notes 0.3.1; full workflows not tested. | No |
| ZotMoov | 1.2.32 | User-disabled; coexistence was not tested. | No |

Historical Zotero 10.0.6 observation from the earlier 0.3.0 check on 2026-10-08: Research Vault Bridge 0.2.0 was disabled and observed as Zotero 9-only. That record is separate from the historical 0.3.1 observation of Research Vault Bridge 0.2.1 active.

Historical Zotero 9.0.6 observation from 2026-10-07: Better BibTeX 9.0.70, Translate for Zotero 2.4.8, Ethereal Style 6.0.86, and Research Vault Bridge 0.2.0 were active alongside Margin Notes 0.2.3; ZotMoov 1.2.32 was installed but disabled. That record is not reclassified as Zotero 10 compatibility.

## Compatibility boundaries

- Supported manifest range: Zotero **9.0-10.0.\***. The configured native matrix is **9.0.6** and **10.0.6**.
- PDF reader only. EPUB and web snapshots are ignored.
- Local native validation used macOS. Windows and Linux have not been included in these runs.
- Zotero 10 Reading Mode keeps the PDF iframe alive underneath the reading view. Margin Notes suspends that pane so cards do not cover Reading Mode and Fit Notes cannot zoom a hidden PDF pane. The automated regression covers that behavior through the real PDF reader's Reading Mode state and iframe visibility, not through the full separate Reading Mode UI.
- The historical 0.3.1 installed PDF note-card presence was checked through macOS accessibility state because the screenshot tool was unavailable; no screenshot or pixel-level visual certification was made. Isolated runtime results do not establish installation or a screenshot review of the user's current UI.
- The overlay uses internal PDF-reader annotation and viewport APIs and temporarily extends the reader's text-focus guard. Other add-ons that replace those same internals or alter PDF-reader styling need combination testing. Wrapper-chain combinations with named add-ons have not been automated.

If you encounter an interaction problem, [open an issue](https://github.com/junhwan26/zotero-margin-notes/issues/new) with the Zotero version, Margin Notes version, other add-on names and versions, whether Reading Mode was active, and the steps that reproduce it. Include whether the behavior also occurs when Margin Notes is disabled.

## Development checks

```sh
npm test
npm run check
npm run build
```

The native runner creates and removes its own profile, library, and synthetic PDF. It does not test against your existing library or install the other add-ons from your profile. CI runs the native test once for Zotero 9.0.6 and once for Zotero 10.0.6, downloading official Zotero DMGs and verifying their SHA-256 hashes before launch. See [runtime-test-notes.md](runtime-test-notes.md) for setup details.
