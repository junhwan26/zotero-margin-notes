# Dependencies & compatibility evidence

[한국어](compatibility.ko.md)

**Checked on 2026-10-07 · Margin Notes 0.2.3 · Zotero 9.0.6 · macOS**

Margin Notes requires Zotero 9.0.x. It does **not** require another Zotero add-on or an npm runtime package. The release XPI includes its implementation, and comments are stored in Zotero annotations.

This report records dependency inspection, automated regression coverage, and the installed add-ons observed in one local environment. An add-on being enabled alongside Margin Notes does not establish that all of its workflows have been tested.

## Dependency audit

| Component | Required to use the plugin? | Evidence |
| --- | --- | --- |
| Zotero 9.0.x | Yes | [Manifest compatibility range](../manifest.json); tested with Zotero 9.0.6. |
| Other Zotero add-ons | No | No required add-on is declared or loaded by the [manifest](../manifest.json) or [bootstrap](../bootstrap.js). |
| npm runtime packages | No | [package.json](../package.json) declares no runtime dependencies; the [build](../scripts/build.py) packages the project's own sources. |
| Node.js and Python 3 | Development only | Used for tests and building the XPI. End users install the XPI directly. |

The bootstrap loads the bundled localization, layout, and overlay scripts. Its timer import comes from Zotero's built-in Gecko runtime. There is no external application service needed to display or edit comments. Zotero's normal annotation synchronization and the GitHub plugin-update endpoint remain available.

## Completed checks

| Check | Result | Scope |
| --- | --- | --- |
| Native Zotero regression suite | **218 / 218 passed** | Real Zotero 9.0.6, synthetic two-column PDF, temporary profile and separate test library. |
| Node test suite | **23 / 23 passed** | Layout, localization, lifecycle, and packaging contracts. |
| Other toolbar listener preserved | **Passed** | Repeated start/stop preserves a mocked listener registered by `another-plugin`. This is a contract test, not an integration test for a named add-on. |
| Native reader restored on shutdown | **Passed** | Removes the overlay and toolbar, restores the exact native focus guard, and repeats native PDF text selection. |
| Release artifact integrity | **Passed** | Published XPI, installed XPI, and tested build have the same SHA-256. |

The native suite covers text-selection popups, highlighting, underlining, sidebar and margin comment editing, double-click gestures, selected-text visibility, white note surfaces in both themes, deletion, undo/redo, search, zoom, navigation, and persistence after reopening the PDF. The copy check uses a synthetic event to verify PDF text conversion; it does not exercise the shared operating-system clipboard.

**The native suite runs without the named third-party add-ons below.** It establishes that Margin Notes works independently and preserves the covered Zotero reader behaviors. It does not certify third-party add-on combinations.

Evidence:

- [Passing 0.2.3 GitHub Actions run](https://github.com/junhwan26/zotero-margin-notes/actions/runs/37580613959), including its downloadable `runtime-smoke-report` artifact.
- [Public evidence snapshot](evidence/compatibility-0.2.3.json): exact versions, artifact hash, and all 218 native check names and results. Profile paths, library content, and runtime logs are omitted.
- [Lifecycle contract test](../tests/lifecycle.test.cjs), [native harness](../tests/runtime-harness.js), and [test isolation setup](../scripts/runtime-smoke.py).
- [Runtime test details](runtime-test-notes.md).

## Observed alongside other add-ons

The local installed-add-on registry showed these versions on 2026-10-07. Margin Notes 0.2.3 was active. These are **installed-state observations**, not complete integration-test results.

| Add-on | Observed version | Observation | Required by Margin Notes? |
| --- | --- | --- | --- |
| Better BibTeX for Zotero | 9.0.70 | Enabled alongside Margin Notes; full workflows not tested. | No |
| Translate for Zotero | 2.4.8 | Enabled alongside Margin Notes; full workflows not tested. | No |
| Ethereal Style | 6.0.86 | Enabled alongside Margin Notes; full workflows not tested. | No |
| Research Vault Bridge | 0.2.0 | Enabled alongside Margin Notes; full workflows not tested. | No |
| ZotMoov | 1.2.32 | Disabled; coexistence was not tested. | No |

## Compatibility boundaries

- Supported manifest range: Zotero **9.0–9.0.\***. The verified baseline is **9.0.6**.
- PDF reader only. EPUB and web snapshots are ignored.
- Local and CI native validation used macOS. Windows and Linux have not been included in these runs.
- The overlay uses internal PDF-reader annotation and viewport APIs and temporarily extends the reader's text-focus guard. Other add-ons that replace those same internals or alter PDF-reader styling need combination testing. Wrapper-chain combinations with named add-ons have not been automated.

If you encounter an interaction problem, [open an issue](https://github.com/junhwan26/zotero-margin-notes/issues/new) with the Zotero version, Margin Notes version, other add-on names and versions, and the steps that reproduce it. Include whether the behavior also occurs when Margin Notes is disabled.

## Reproduce the checks

```sh
npm test
npm run check
npm run build
npm run test:native
```

The native runner creates and removes its own profile, library, and synthetic PDF. It does not test against your existing library or install the other add-ons from your profile. See [runtime-test-notes.md](runtime-test-notes.md) for options and CI setup.
