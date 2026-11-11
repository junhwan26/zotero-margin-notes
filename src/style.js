(function (root) {
  'use strict';

  // Injected into each PDF iframe. Every color is a token on .mn-layer so the
  // paper and dark surfaces share one set of rules.
  const LAYER = `
    .mn-layer { position:fixed; inset:0; z-index:5; pointer-events:none; overflow:hidden;
      font:var(--mn-font-size,13px)/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      --mn-bg:#fff; --mn-fg:#1f2328; --mn-muted:#5f6772; --mn-border:#d3d8de; --mn-soft:#f0f2f5;
      --mn-link:#175db1; --mn-accent:#2f6fde; --mn-danger:#a8372a;
      --mn-shadow:0 1px 2px #1018280f,0 4px 14px #1018281f;
      --mn-shadow-raised:0 1px 3px #10182814,0 8px 22px #1018282e;
      color:var(--mn-fg); }
    .mn-layer[data-surface="dark"] { --mn-bg:#2a2c30; --mn-fg:#e8eaed; --mn-muted:#a6adb7;
      --mn-border:#474b53; --mn-soft:#383b41; --mn-link:#8ab4f8; --mn-accent:#6ea0f5; --mn-danger:#f2938c;
      --mn-shadow:0 1px 2px #0006,0 6px 16px #0007; --mn-shadow-raised:0 1px 3px #0007,0 10px 26px #0009; }
    .mn-layer [hidden] { display:none!important; }

    .mn-lines { position:absolute; inset:0; width:100%; height:100%; overflow:hidden; }
    .mn-lines path { fill:none; stroke-width:1.25; stroke-linecap:round; opacity:.55; }
    .mn-lines circle { opacity:.8; }
    .mn-lines .mn-selected { stroke-width:2; opacity:1; }
    .mn-layer[data-connectors="off"] .mn-lines { display:none; }

    .mn-card { position:absolute; box-sizing:border-box; pointer-events:auto;
      background:var(--mn-bg); color:var(--mn-fg); border:1px solid var(--mn-border);
      border-radius:10px; box-shadow:var(--mn-shadow); padding:0; overflow:hidden;
      animation:mn-in .14s ease-out; transition:box-shadow .12s ease; }
    /* The color bar sits on the edge that faces the page and its highlight. */
    .mn-card::before { content:""; position:absolute; top:0; bottom:0; left:0; width:3px;
      background:var(--mn-color,#e4bd5a); }
    .mn-card[data-side="left"]::before { left:auto; right:0; }
    .mn-card:hover, .mn-card:focus-within { box-shadow:var(--mn-shadow-raised); }
    .mn-card.mn-selected { border-color:var(--mn-color,#b58d34);
      box-shadow:0 0 0 2px color-mix(in srgb,var(--mn-color,#b58d34) 40%,transparent),var(--mn-shadow-raised); }
    @keyframes mn-in { from { opacity:0; } to { opacity:1; } }
    @media (prefers-reduced-motion: reduce) { .mn-card { animation:none; transition:none; } }

    .mn-card button, .mn-overflow, .mn-tray button, .mn-editor textarea {
      font:inherit; color:inherit; }
    .mn-open { border:0; background:transparent; display:flex; width:100%; box-sizing:border-box;
      align-items:center; gap:6px; text-align:left; padding:8px 12px 5px; cursor:pointer;
      font-size:11px!important; font-weight:600; letter-spacing:.02em; color:var(--mn-muted)!important; }
    .mn-open::before { content:""; flex:none; width:7px; height:7px; border-radius:50%;
      background:var(--mn-color,#e4bd5a); }
    .mn-open::after { content:"↗"; margin-left:auto; opacity:0; transition:opacity .12s ease; }
    .mn-open:hover::after, .mn-open:focus-visible::after { opacity:1; }
    .mn-open:hover { color:var(--mn-fg)!important; }

    .mn-quote { margin:0 12px 6px; padding-left:8px; color:var(--mn-muted); font-size:.85em; line-height:1.4;
      border-left:2px solid color-mix(in srgb,var(--mn-color,#e4bd5a) 60%,transparent);
      display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
      overflow-wrap:anywhere; }
    .mn-layer[data-quote="off"] .mn-quote { display:none; }

    .mn-comment { padding:0 12px 10px; white-space:normal; overflow-wrap:anywhere;
      overflow-y:auto; max-height:calc(var(--mn-font-size,13px) * 11.4); box-sizing:border-box;
      scrollbar-width:thin; }
    .mn-layer[data-expand="on"] .mn-card .mn-comment { max-height:none; }
    .mn-comment p { margin:0 0 .55em; }
    .mn-comment > :last-child { margin-bottom:0; }
    .mn-comment h1, .mn-comment h2, .mn-comment h3, .mn-comment h4,
    .mn-comment h5, .mn-comment h6 { margin:.6em 0 .3em; line-height:1.3; font-weight:700; }
    .mn-comment > :first-child { margin-top:0; }
    .mn-comment h1 { font-size:1.4em; }
    .mn-comment h2 { font-size:1.25em; }
    .mn-comment h3 { font-size:1.1em; }
    .mn-comment h4, .mn-comment h5, .mn-comment h6 { font-size:1em; }
    .mn-comment ul, .mn-comment ol { margin:.35em 0 .55em; padding-left:1.5em; }
    .mn-comment ul { list-style:disc outside; }
    .mn-comment ol { list-style:decimal outside; }
    .mn-comment li { margin:.15em 0; }
    .mn-comment li > p { margin:0; }
    .mn-comment .mn-task-item { list-style:none; }
    .mn-comment .mn-task-item > p:first-of-type { display:inline; }
    .mn-comment blockquote { margin:.45em 0; padding-left:.65em;
      border-left:3px solid var(--mn-border); color:var(--mn-muted); }
    .mn-comment code { font: .92em/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;
      white-space:pre-wrap; background:var(--mn-soft); padding:.1em .3em; border-radius:4px; }
    .mn-comment pre { margin:.5em 0; padding:7px 8px; background:var(--mn-soft);
      border-radius:6px; white-space:pre; overflow:auto; max-height:120px; scrollbar-width:thin; }
    .mn-comment pre code { white-space:pre; padding:0; background:none; }
    .mn-comment a { color:var(--mn-link); text-decoration:underline; text-underline-offset:2px; cursor:pointer; }
    .mn-comment hr { border:0; border-top:1px solid var(--mn-border); margin:.6em 0; }
    .mn-comment table { border-collapse:collapse; font-size:.92em; margin:.5em 0; }
    .mn-comment th, .mn-comment td { border:1px solid var(--mn-border); padding:3px 6px; }
    .mn-comment th { background:var(--mn-soft); }
    .mn-comment .mn-math { font-size:1.08em; }
    .mn-comment .mn-math-display { display:block; margin:.5em 0; overflow-x:auto; scrollbar-width:thin; }

    .mn-add { display:block; box-sizing:border-box; width:calc(100% - 20px); margin:0 10px 10px;
      padding:6px 9px; border:1px dashed var(--mn-border); border-radius:7px; background:transparent;
      color:var(--mn-muted)!important; text-align:left; cursor:pointer; font-size:.92em!important; }
    .mn-add:hover { border-color:var(--mn-accent); color:var(--mn-fg)!important; background:var(--mn-soft); }

    .mn-editor { padding:0 10px 10px; display:flex; flex-direction:column; gap:7px; }
    .mn-editor textarea { width:100%; min-height:72px; max-height:140px; resize:none;
      box-sizing:border-box; background:var(--mn-bg); border:1px solid var(--mn-border);
      border-radius:7px; padding:7px 8px; line-height:1.45; color:inherit;
      transition:border-color .12s ease, box-shadow .12s ease; }
    .mn-editor textarea:focus { border-color:var(--mn-accent);
      box-shadow:0 0 0 3px color-mix(in srgb,var(--mn-accent) 24%,transparent); outline:none; }
    /* Zotero's PDF viewer makes selection backgrounds transparent globally.
       Notes contain real text, so restore readable selection colors here. */
    .mn-layer textarea::selection, .mn-layer .mn-comment::selection,
    .mn-layer .mn-comment *::selection, .mn-layer .mn-quote::selection {
      color:#172b4d; background-color:#b4d6ff; }
    .mn-layer[data-theme="dark"] textarea::selection,
    .mn-layer[data-theme="dark"] .mn-comment::selection,
    .mn-layer[data-theme="dark"] .mn-comment *::selection,
    .mn-layer[data-theme="dark"] .mn-quote::selection,
    .mn-layer[data-surface="dark"] textarea::selection,
    .mn-layer[data-surface="dark"] .mn-comment::selection,
    .mn-layer[data-surface="dark"] .mn-comment *::selection,
    .mn-layer[data-surface="dark"] .mn-quote::selection {
      color:#fff; background-color:#365d8a; }
    .mn-editor-actions { display:flex; gap:6px; align-items:center; justify-content:flex-end; }
    .mn-editor-hint { margin-right:auto; color:var(--mn-muted); font-size:10.5px; line-height:1.3;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
    .mn-editor-actions button { flex:none; border:1px solid var(--mn-border); border-radius:6px;
      background:transparent; padding:3px 10px; cursor:pointer; font-size:11px!important; }
    .mn-editor-actions button:hover { background:var(--mn-soft); }
    .mn-editor-actions .mn-save { background:var(--mn-accent); border-color:var(--mn-accent);
      color:#fff!important; font-weight:600; }
    .mn-layer[data-surface="dark"] .mn-editor-actions .mn-save { color:#10131a!important; }
    .mn-editor-actions .mn-save:hover { background:var(--mn-accent); filter:brightness(1.08); }
    .mn-editor-actions button:disabled { opacity:.5; cursor:default; filter:none; }
    .mn-error { color:var(--mn-danger); font-size:11px; line-height:1.35; padding:0 12px 8px; }

    .mn-open:focus-visible, .mn-add:focus-visible, .mn-overflow:focus-visible,
    .mn-tray button:focus-visible, .mn-editor button:focus-visible, .mn-comment:focus-visible,
    .mn-comment a:focus-visible { outline:2px solid #538bd5; outline-offset:-2px; }

    .mn-overflow { position:absolute; box-sizing:border-box; pointer-events:auto;
      border:1px solid var(--mn-border); border-radius:999px; background:var(--mn-bg);
      color:var(--mn-muted)!important; box-shadow:var(--mn-shadow); font-size:12px!important;
      font-weight:600; text-align:center; cursor:pointer; overflow:hidden; text-overflow:ellipsis;
      white-space:nowrap; }
    .mn-overflow:hover { color:var(--mn-fg)!important; box-shadow:var(--mn-shadow-raised); }
    .mn-tray { position:absolute; pointer-events:auto; background:var(--mn-bg); color:var(--mn-fg);
      border:1px solid var(--mn-border); border-radius:12px; box-shadow:var(--mn-shadow-raised);
      box-sizing:border-box; display:flex; flex-direction:column; overflow:hidden; }
    .mn-tray-heading { padding:9px 8px 9px 12px; display:flex; justify-content:space-between;
      align-items:center; font-weight:600; border-bottom:1px solid var(--mn-border); }
    .mn-tray-heading button { background:none; border:0; border-radius:6px; cursor:pointer;
      padding:2px 7px; font-size:11px!important; font-weight:400; color:var(--mn-muted)!important; }
    .mn-tray-heading button:hover { background:var(--mn-soft); color:var(--mn-fg)!important; }
    .mn-tray-list { overflow:auto; padding:0 10px 8px; scrollbar-width:thin; }
    .mn-tray-row { border-top:1px solid var(--mn-border); padding:7px 0; }
    .mn-tray-row:first-child { border-top:0; }
    .mn-open-tray { display:block; width:100%; text-align:left; border:0; border-radius:5px;
      padding:3px; background:none; cursor:pointer; font-size:11px!important; font-weight:600;
      color:var(--mn-muted)!important; }
    .mn-open-tray:hover { color:var(--mn-fg)!important; }
    .mn-tray-row .mn-comment { padding:3px; }
    .mn-tray-row .mn-editor { padding:4px 3px 0; }
    .mn-tray-row .mn-error { padding:0 3px 4px; }
    @media print { .mn-layer { display:none!important; } }
  `;

  // Hover and pressed states for the reader toolbar. The buttons also carry
  // inline base styles, so they stay usable if this sheet cannot be applied.
  const TOOLBAR = `
    .mn-toolbar button:hover { background:color-mix(in srgb,currentColor 10%,transparent)!important; }
    .mn-toolbar button:active { background:color-mix(in srgb,currentColor 16%,transparent)!important; }
    .mn-toolbar .mn-toggle[aria-pressed="true"] {
      background:color-mix(in srgb,#e4bd5a 28%,transparent)!important;
      border-color:color-mix(in srgb,#b58d34 55%,transparent)!important; }
    .mn-toolbar button:focus-visible { outline:2px solid #538bd5; outline-offset:-1px; }
  `;

  root.MarginNotesStyle = { LAYER, TOOLBAR };
})(this);
