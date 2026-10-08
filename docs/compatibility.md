# Dependencies & compatibility evidence

[한국어](compatibility.ko.md)

**Checked on 2026-10-08 · Margin Notes 0.3.0 · Zotero 9.0.6 / 10.0.6 matrix · macOS**

Margin Notes declares support for Zotero 9.0 through 10.0.*. It does **not** require another Zotero add-on or an npm runtime package. The release XPI includes its implementation, and comments are stored in Zotero annotations.

This report records dependency inspection, automated regression coverage, and installed add-ons observed in local Zotero 9 and Zotero 10 environments. An add-on being enabled alongside Margin Notes does not establish that all of its workflows have been tested.

## Dependency audit

| Component | Required to use the plugin? | Evidence |
| --- | --- | --- |
| Zotero 9.0-10.0.* | Yes | [Manifest compatibility range](../manifest.json); CI is configured for Zotero 9.0.6 and 10.0.6. |
| Other Zotero add-ons | No | No required add-on is declared or loaded by the [manifest](../manifest.json) or [bootstrap](../bootstrap.js). |
| npm runtime packages | No | [package.json](../package.json) declares no runtime dependencies; the [build](../scripts/build.py) packages the project's own sources. |
| Node.js and Python 3 | Development only | Used for tests and building the XPI. End users install the XPI directly. |

The bootstrap loads the bundled localization, layout, and overlay scripts. Its timer import comes from Zotero's built-in Gecko runtime. There is no external application service needed to display or edit comments. Zotero's normal annotation synchronization and the GitHub plugin-update endpoint remain available.

Zotero's official [Zotero 10 for Developers](https://www.zotero.org/support/dev/zotero_10_for_developers) guide says plugins should update `strict_max_version` to `10.0.*` after confirming compatibility. Zotero's [version history](https://www.zotero.org/support/changelog) lists Zotero 10.0.6 as released on 2026-10-07.

## Completed checks

| Check | 0.3.0 result | Scope |
| --- | --- | --- |
| Node test suite | **26 / 26 passed** | Layout, localization, lifecycle, version matrix metadata, Reading Mode draft preservation, and packaging contracts. |
| Update metadata, syntax checks, and build | **Passed** | `updates.json` metadata, JavaScript syntax, and reproducible XPI build. |
| Native Zotero 9.0.6 regression suite | **219 / 219 passed** | Real Zotero 9.0.6, synthetic two-column PDF, temporary profile and separate test library. |
| Native Zotero 10.0.6 regression suite | **236 / 236 passed** | Real Zotero 10.0.6, synthetic two-column PDF, temporary profile and separate test library. |
| Zotero 10 Reading Mode handling | **17 additional native assertions passed** | Margin notes suspend per reader pane while Reading Mode is active, Fit Notes ignores hidden PDF panes, notes resume after returning to PDF view, and unsaved drafts survive temporary suspension. The automated coverage drives Zotero's PDF-reader Reading Mode state and iframe visibility in the real reader; it is not a full end-to-end exercise of Zotero's separate Reading Mode UI. |
| Draft safety during suspension | **Passed** | Restored draft UI, overflow editing, unsaved draft preservation, and Cancel-without-DB-change behavior are covered by regression tests. |
| Other toolbar listener preserved | **Passed** | Repeated start/stop preserves a mocked listener registered by `another-plugin`. This is a contract test, not an integration test for a named add-on. |
| Current XPI integrity | **Passed** | Current build SHA-256 is `a9a6ef4e1017c3a862c402a0be6995a86dac2b3a935d8c48bc791096e27e7449`; the XPI installed in the actual Zotero 10.0.6 UI matched that build hash. |

0.3.0 public evidence:

- [Public 0.3.0 evidence snapshot](evidence/compatibility-0.3.0.json): exact versions, artifact hash, local validation results, and native check counts.
- [Check workflow](https://github.com/junhwan26/zotero-margin-notes/actions/workflows/ci.yml): workflow definition for the two-version native matrix.

Historical 0.2.3 evidence remains available:

- [Passing 0.2.3 GitHub Actions run](https://github.com/junhwan26/zotero-margin-notes/actions/runs/37580613959), including its downloadable `runtime-smoke-report` artifact.
- [Public 0.2.3 evidence snapshot](evidence/compatibility-0.2.3.json): exact versions, artifact hash, and all 218 Zotero 9.0.6 native check names and results. Profile paths, library content, and runtime logs are omitted.
- [Lifecycle contract test](../tests/lifecycle.test.cjs), [native harness](../tests/runtime-harness.js), and [test isolation setup](../scripts/runtime-smoke.py).
- [Runtime test details](runtime-test-notes.md).

The native suite covers text-selection popups, highlighting, underlining, sidebar and margin comment editing, double-click gestures, selected-text visibility, white note surfaces in both themes, deletion, undo/redo, search, zoom, navigation, and persistence after reopening the PDF. The copy check uses a synthetic event to verify PDF text conversion; it does not exercise the shared operating-system clipboard.

**The native suite runs without the named third-party add-ons below.** It establishes that Margin Notes works independently and preserves the covered Zotero reader behaviors. It does not certify third-party add-on combinations.

## Observed alongside other add-ons

The local installed-add-on registry showed these versions on 2026-10-08 in the actual Zotero 10.0.6 UI with Margin Notes 0.3.0 active. These are **installed-state observations**, not complete integration-test results.

| Add-on | Observed version | Observation | Required by Margin Notes? |
| --- | --- | --- | --- |
| Better BibTeX for Zotero | 9.0.70 | Enabled alongside Margin Notes 0.3.0; full workflows not tested. | No |
| Translate for Zotero | 2.4.8 | Enabled alongside Margin Notes 0.3.0; full workflows not tested. | No |
| Ethereal Style | 6.0.86 | Enabled alongside Margin Notes 0.3.0; full workflows not tested. | No |
| Research Vault Bridge | 0.2.0 | Disabled; observed as incompatible with Zotero 10 because it is Zotero 9-only. | No |
| ZotMoov | 1.2.32 | Disabled; coexistence was not tested. | No |

Historical Zotero 9.0.6 observation from 2026-10-07: Better BibTeX 9.0.70, Translate for Zotero 2.4.8, Ethereal Style 6.0.86, and Research Vault Bridge 0.2.0 were active alongside Margin Notes 0.2.3; ZotMoov 1.2.32 was installed but disabled. That record is not reclassified as Zotero 10 compatibility.

## Compatibility boundaries

- Supported manifest range: Zotero **9.0-10.0.\***. The configured native matrix is **9.0.6** and **10.0.6**.
- PDF reader only. EPUB and web snapshots are ignored.
- Local native validation used macOS. Windows and Linux have not been included in these runs.
- Zotero 10 Reading Mode keeps the PDF iframe alive underneath the reading view. Margin Notes 0.3.0 suspends that pane so cards do not cover Reading Mode and Fit Notes cannot zoom a hidden PDF pane. The automated regression covers that behavior through the real PDF reader's Reading Mode state and iframe visibility, not through the full separate Reading Mode UI.
- The overlay uses internal PDF-reader annotation and viewport APIs and temporarily extends the reader's text-focus guard. Other add-ons that replace those same internals or alter PDF-reader styling need combination testing. Wrapper-chain combinations with named add-ons have not been automated.

If you encounter an interaction problem, [open an issue](https://github.com/junhwan26/zotero-margin-notes/issues/new) with the Zotero version, Margin Notes version, other add-on names and versions, whether Reading Mode was active, and the steps that reproduce it. Include whether the behavior also occurs when Margin Notes is disabled.

## Development checks

```sh
npm test
npm run check
npm run build
```

The native runner creates and removes its own profile, library, and synthetic PDF. It does not test against your existing library or install the other add-ons from your profile. CI runs the native test once for Zotero 9.0.6 and once for Zotero 10.0.6, downloading official Zotero DMGs and verifying their SHA-256 hashes before launch. See [runtime-test-notes.md](runtime-test-notes.md) for setup details.
