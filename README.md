<h1 align="center">Margin Notes for Zotero</h1>

<p align="center">Read and edit PDF highlight comments in the left or right outer margin, chosen automatically for two-column papers.</p>

<p align="center">
  <a href="https://github.com/junhwan26/zotero-margin-notes/actions/workflows/ci.yml"><img alt="Check" src="https://github.com/junhwan26/zotero-margin-notes/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/junhwan26/zotero-margin-notes/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/junhwan26/zotero-margin-notes?label=release"></a>
  <img alt="Zotero 9.0.x" src="https://img.shields.io/badge/Zotero-9.0.x-CC2936">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.ko.md">한국어</a> ·
  <a href="https://github.com/junhwan26/zotero-margin-notes/releases/latest">Download</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#compatibility">Compatibility</a>
</p>

![Conceptual illustration of Margin Notes placing white note cards beside a two-column PDF](docs/assets/overview.svg)

<p align="center"><sub>Conceptual illustration. The real UI appears inside Zotero's PDF reader and follows the current PDF viewport.</sub></p>

## Why Use It

| Feature | What it does |
| --- | --- |
| Margin note cards | Shows comments from highlighted or underlined PDF text as white cards outside the page. |
| Two-column placement | Chooses the left or right outer margin from annotation coordinates, available room, and nearby card congestion. |
| Edit comments | Double-click a plain-text note to edit it; rich-text comments open in Zotero's native editor so formatting is preserved. |
| Zotero workflow preservation | Keeps text selection, selection popups, annotation tools, keyboard selection, search, zoom, page navigation, deletion, undo/redo, and sidebar edits working. |

## Quick Start

1. Download `zotero-margin-notes-0.2.3.xpi` from the [latest release](https://github.com/junhwan26/zotero-margin-notes/releases/latest).
2. In Zotero, open **Tools -> Plugins**.
3. Open the gear menu, choose **Install Plugin From File...**, and select the XPI.
4. Open a PDF, add a comment to a highlight or underline, then use **Margin Notes** in the reader toolbar.

<details>
<summary>Upgrading from 0.1.0</summary>

The `0.1.0` build used a placeholder update URL. Install `0.2.0` or later manually once; after that, Zotero can use this repository's `updates.json` release metadata.

</details>

## Gestures

| Action | Gesture |
| --- | --- |
| Toggle margin notes | Click **Margin Notes** in the Zotero PDF reader toolbar. |
| Make room for notes | Click **Fit Notes** when the window is too narrow. |
| Edit plain text | Double-click a margin note or overflow comment. |
| Keyboard edit | Focus the comment with Tab, then press **Enter** or **F2**. |
| Save or cancel | Use **Save** or **Cancel** in the inline editor. |
| Open the source annotation | Click the page link in a note header. |

Saving an empty comment removes that card from the margin view because the plugin displays annotations that contain comments. Double-clicking inside an active editor keeps normal word selection. Comments containing rich text delegate to Zotero's native editor instead of flattening formatting.

White notes and editors remain readable in both PDF themes. Comments are saved in Zotero annotations. English is the default interface language; Korean Zotero locales select Korean automatically.

## Compatibility

Margin Notes has no required third-party Zotero add-on and no npm runtime package dependency. It targets Zotero `9.0` through `9.0.*`, with Zotero `9.0.6` validated in native CI. The plugin is PDF-only; EPUB and web snapshots are ignored.

The `0.2.3` release passed [218 native Zotero runtime checks](https://github.com/junhwan26/zotero-margin-notes/actions/runs/37580613959) and 23 Node tests. The native run uses an isolated Zotero profile with the Margin Notes harness installed, so it verifies the covered Zotero reader and start/stop behaviors. Named third-party add-on workflows are outside that test suite. The lifecycle test also preserves a mocked toolbar listener belonging to another plugin.

Observed on 2026-10-07 in the maintainer's Zotero profile: Better BibTeX `9.0.70`, Translate for Zotero `2.4.8`, Ethereal Style `6.0.86`, and Research Vault Bridge `0.2.0` were active together with Margin Notes `0.2.3`; ZotMoov `1.2.32` was installed but disabled. Full workflow testing with those named add-ons was not performed.

Read the [compatibility notes](docs/compatibility.md) and [public 0.2.3 evidence](docs/evidence/compatibility-0.2.3.json) for the dependency audit, native check inventory, and observed add-on state.

## Support

Open a [GitHub issue](https://github.com/junhwan26/zotero-margin-notes/issues) with your Zotero version, plugin version, operating system, a small reproduction, and whether the problem still happens with only Margin Notes enabled. Reader internals can change between Zotero releases, so exact version details matter.

## Acknowledgments

The README structure was informed by public Zotero plugin documentation from [Zotero PDF Translate](https://github.com/windingwind/zotero-pdf-translate/blob/main/README.md), [Better Notes for Zotero](https://github.com/windingwind/zotero-better-notes/blob/master/README.md), [Zotero Style](https://github.com/MuiseDestiny/zotero-style/blob/master/README.md), and [Better BibTeX](https://github.com/retorquere/zotero-better-bibtex/blob/master/README.md). This is a documentation reference, not an endorsement or compatibility claim.

<details>
<summary>Development</summary>

This repository has no npm runtime dependencies. Development uses Node.js for unit tests and syntax checks, and Python 3 for the reproducible XPI build.

```sh
npm test
npm run check
npm run build
```

The native Zotero smoke test uses a temporary profile, a synthetic PDF, and Zotero 9.0.6. CI downloads Zotero 9.0.6 from the official Zotero release host, verifies the DMG SHA-256, installs it into the runner's temporary directory, and uploads `dist/runtime-smoke-report.json`.

</details>
