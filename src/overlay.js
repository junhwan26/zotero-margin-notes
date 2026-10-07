/* global Zotero */
(function (root) {
  'use strict';

  const ID = 'margin-notes@local';
  const PREF = 'extensions.margin-notes.enabled';
  const STYLE = `
    .mn-layer { position:fixed; inset:0; z-index:5; pointer-events:none;
      overflow:hidden; font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      color:#353329; --mn-bg:#fffdf3; --mn-border:#dedbd0; --mn-muted:#777265; }
    .mn-layer [hidden] { display:none!important; }
    .mn-layer[data-theme="dark"] { color:#eeeadd; --mn-bg:#302f2a;
      --mn-border:#59564b; --mn-muted:#bbb6a5; }
    .mn-lines { position:absolute; inset:0; width:100%; height:100%; overflow:hidden; }
    .mn-card { position:absolute; box-sizing:border-box; pointer-events:auto;
      background:var(--mn-bg); border:1px solid var(--mn-border);
      border-left:3px solid var(--mn-color,#e4bd5a); border-radius:3px 9px 9px 3px;
      box-shadow:0 2px 7px #0000000d; padding:0; overflow:hidden; }
    .mn-card.mn-selected { outline:2px solid var(--mn-color,#b58d34); outline-offset:2px; }
    .mn-card button, .mn-overflow, .mn-tray button, .mn-editor textarea {
      font:inherit; color:inherit; }
    .mn-open { border:0; background:transparent; display:flex; width:100%;
      align-items:center; justify-content:space-between; gap:8px; text-align:left;
      padding:8px 10px 5px; cursor:pointer; font-size:11px!important; color:var(--mn-muted)!important; }
    .mn-open:hover { background:#88888812; }
    .mn-card-actions { display:flex; gap:4px; align-items:center; padding:0 8px 8px; }
    .mn-card-actions button { border:1px solid var(--mn-border); border-radius:4px;
      background:#8888880d; padding:1px 6px; cursor:pointer; font-size:11px!important; }
    .mn-card-actions button:hover { background:#88888818; }
    .mn-editor { padding:0 8px 8px; display:flex; flex-direction:column; gap:6px; }
    .mn-editor textarea { width:100%; min-height:72px; max-height:140px; resize:none;
      box-sizing:border-box; background:#ffffff99; border:1px solid var(--mn-border);
      border-radius:4px; padding:6px; color:#24231f; }
    .mn-layer[data-theme="dark"] .mn-editor textarea { background:#1e1e1bcc; color:#eeeadd; }
    .mn-editor-actions { display:flex; gap:5px; justify-content:flex-end; }
    .mn-editor-actions button { border:1px solid var(--mn-border); border-radius:4px;
      background:#8888880d; padding:2px 7px; cursor:pointer; font-size:11px!important; }
    .mn-error { color:#a44435; font-size:11px; line-height:1.35; padding:0 10px 8px; }
    .mn-layer[data-theme="dark"] .mn-error { color:#ffb4a8; }
    .mn-open:focus-visible, .mn-overflow:focus-visible, .mn-tray button:focus-visible,
    .mn-card-actions button:focus-visible, .mn-editor button:focus-visible,
    .mn-editor textarea:focus-visible, .mn-comment:focus-visible { outline:2px solid #538bd5; outline-offset:-2px; }
    .mn-quote { margin:0 10px 6px; opacity:.68; font-size:11px; line-height:1.4;
      display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
      overflow-wrap:anywhere; }
    .mn-comment { padding:0 10px 10px; white-space:pre-wrap; overflow-wrap:anywhere;
      overflow-y:auto; max-height:148px; box-sizing:border-box; scrollbar-width:thin; }
    .mn-overflow { position:absolute; pointer-events:auto; border:1px solid var(--mn-border);
      border-radius:6px; background:var(--mn-bg); font-size:12px; cursor:pointer; }
    .mn-tray { position:absolute; pointer-events:auto; background:var(--mn-bg);
      border:1px solid var(--mn-border); border-radius:8px; box-shadow:0 4px 16px #0003;
      box-sizing:border-box; display:flex; flex-direction:column; overflow:hidden; }
    .mn-tray-heading { padding:9px; display:flex; justify-content:space-between; align-items:center; }
    .mn-tray-heading button { background:none; border:0; cursor:pointer; }
    .mn-tray-list { overflow:auto; padding:0 8px 8px; }
    .mn-tray-row { border-top:1px solid var(--mn-border); padding:7px 0; }
    .mn-tray-list button { display:block; width:100%; text-align:left; border:0;
      border-top:1px solid var(--mn-border); padding:10px 3px; background:none; cursor:pointer;
      white-space:pre-wrap; overflow-wrap:anywhere; }
    .mn-tray-row > button { border-top:0; padding:3px; }
    .mn-tray-row .mn-card-actions { padding:4px 3px 0; }
    .mn-tray-row .mn-editor { padding:4px 3px 0; }
    @media print { .mn-layer { display:none!important; } }
  `;

  function element(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Parse rich comments in an inert document; never put annotation HTML in the live DOM.
  function plainText(doc, value) {
    if (!value) return '';
    const source = String(value);
    const hasFormatting = /<\/?(?:i|b|sub|sup|br|p|div|li)\b/i.test(source);
    if (!hasFormatting) return source.trim();
    const parsed = new doc.defaultView.DOMParser().parseFromString(
      source.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n'), 'text/html');
    for (const node of parsed.querySelectorAll('script,style,iframe,object')) node.remove();
    return (parsed.body.textContent || '').trim();
  }

  function richComment(value) {
    return /<\/?(?:i|b|sub|sup)\b/i.test(String(value || ''));
  }

  function color(value) {
    return /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#e4bd5a';
  }

  function rectOf(node) {
    const r = node.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  }

  function setRect(node, r) {
    node.style.left = `${r.x}px`;
    node.style.top = `${r.y}px`;
    node.style.width = `${r.width}px`;
    if (r.height !== undefined) node.style.height = `${r.height}px`;
  }

  class FrameOverlay {
    constructor(owner, view, win, app) {
      this.owner = owner;
      this.view = view;
      this.win = win;
      this.app = app;
      this.doc = win.document;
      this.cards = new Map();
      this.edits = new Map();
      this.cleanups = [];
      this.destroyed = false;
      this.pending = 0;
      this.trayPage = null;
      this.style = element(this.doc, 'style');
      this.style.textContent = STYLE;
      this.doc.head.append(this.style);
      this.layer = element(this.doc, 'div', 'mn-layer');
      this.layer.setAttribute('aria-label', this.owner.i18n.t('layerLabel'));
      this.lines = this.doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.lines.classList.add('mn-lines');
      this.lines.setAttribute('aria-hidden', 'true');
      this.layer.append(this.lines);
      this.doc.body.append(this.layer);
      // PDFView listens to keydown in window capture, before card handlers.
      // Extend its existing text-focus exemption so reading/copying a comment
      // cannot delete, resize, or undo a selected Zotero annotation.
      const originalFocusGuard = view._textAnnotationFocused;
      if (typeof originalFocusGuard === 'function') {
        const layer = this.layer;
        const focusGuard = function () {
          return layer.contains(layer.ownerDocument.activeElement) || originalFocusGuard.call(view);
        };
        // PDFView runs in the reader's content compartment. Export the hook and
        // call the original without a privileged argument array: Function.apply
        // in content cannot read that array's length, breaking native drag/keys.
        view._textAnnotationFocused = root.Cu.exportFunction(focusGuard, view);
        // Read back through the same wrapper used by cleanup for identity checks.
        const installedGuard = view._textAnnotationFocused;
        this.cleanups.push(() => {
          if (view._textAnnotationFocused === installedGuard) view._textAnnotationFocused = originalFocusGuard;
        });
      }
      const schedule = () => this.schedule();
      const container = this.doc.getElementById('viewerContainer');
      this.container = container;
      for (const [target, type] of [[container, 'scroll'], [win, 'resize']]) {
        target.addEventListener(type, schedule, { passive: true });
        this.cleanups.push(() => target.removeEventListener(type, schedule));
      }
      for (const type of ['pagerendered', 'textlayerrendered', 'updateviewarea',
        'scalechanging', 'rotationchanging', 'pagesinit', 'spreadmodechanged', 'scrollmodechanged']) {
        app.eventBus.on(type, schedule);
        this.cleanups.push(() => app.eventBus.off(type, schedule));
      }
      if (win.ResizeObserver) {
        const observer = new win.ResizeObserver(schedule);
        observer.observe(container);
        this.cleanups.push(() => observer.disconnect());
      }
      this.schedule();
    }

    schedule() {
      if (this.destroyed || this.pending) return;
      this.pending = this.win.requestAnimationFrame(() => {
        this.pending = 0;
        try { this.render(); }
        catch (error) { this.owner.report(error); }
      });
    }

    snapshot() {
      const state = this.owner.reader._internalReader?._state;
      const annotations = state?.annotations;
      const selected = state?.selectedAnnotationIDs;
      const show = state?.showAnnotations;
      const theme = state?.colorScheme;
      const readOnly = !!(state?.readOnly || this.owner.reader._internalReader?._readOnly);
      if (this.annotations !== annotations || this.selected !== selected ||
        this.show !== show || this.theme !== theme || this.readOnly !== readOnly) {
        this.annotations = annotations;
        this.selected = selected;
        this.show = show;
        this.theme = theme;
        this.readOnly = readOnly;
        this.schedule();
      }
    }

    makeCard(annotation, pageIndex) {
      const key = `${pageIndex}:${annotation.id}`;
      let card = this.cards.get(key);
      if (!card) {
        card = element(this.doc, 'article', 'mn-card');
        card.dataset.annotationId = annotation.id;
        card.dataset.pageIndex = pageIndex;
        card.open = element(this.doc, 'button', 'mn-open');
        card.open.type = 'button';
        card.open.title = this.owner.i18n.t('openTitle');
        card.open.addEventListener('click', () => this.owner.navigate(card.currentAnnotation?.id));
        card.quote = element(this.doc, 'div', 'mn-quote');
        card.comment = element(this.doc, 'div', 'mn-comment');
        card.comment.tabIndex = 0;
        card.comment.setAttribute('aria-label', this.owner.i18n.t('commentLabel'));
        card.actions = element(this.doc, 'div', 'mn-card-actions');
        card.edit = element(this.doc, 'button', 'mn-edit', this.owner.i18n.t('edit'));
        card.edit.type = 'button';
        card.edit.title = this.owner.i18n.t('editTitle');
        card.edit.addEventListener('click', () => this.beginEdit(card.currentAnnotation));
        card.actions.append(card.edit);
        card.error = element(this.doc, 'div', 'mn-error');
        card.error.hidden = true;
        card.editor = element(this.doc, 'div', 'mn-editor');
        card.input = element(this.doc, 'textarea', 'mn-input');
        card.input.setAttribute('aria-label', this.owner.i18n.t('editorLabel'));
        card.input.addEventListener('input', () => this.updateDraft(card.currentAnnotation?.id, card.input.value));
        card.input.addEventListener('keydown', event => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            this.saveEdit(card.currentAnnotation);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            this.cancelEdit(card.currentAnnotation?.id);
          }
        });
        const editorActions = element(this.doc, 'div', 'mn-editor-actions');
        card.save = element(this.doc, 'button', 'mn-save', this.owner.i18n.t('save'));
        card.save.type = 'button';
        card.save.addEventListener('click', () => this.saveEdit(card.currentAnnotation));
        card.cancel = element(this.doc, 'button', 'mn-cancel', this.owner.i18n.t('cancel'));
        card.cancel.type = 'button';
        card.cancel.addEventListener('click', () => this.cancelEdit(card.currentAnnotation?.id));
        editorActions.append(card.cancel, card.save);
        card.editor.append(card.input, editorActions);
        card.append(card.open, card.quote, card.comment, card.actions, card.error, card.editor);
        // Avoid handing note interaction to the PDF's selection/annotation tools.
        for (const type of ['pointerdown', 'mousedown', 'dblclick', 'keydown']) {
          card.addEventListener(type, event => event.stopPropagation());
        }
        this.cards.set(key, card);
        this.layer.append(card);
      }
      card.currentAnnotation = annotation;
      card.open.title = this.owner.i18n.t('openTitle');
      card.comment.setAttribute('aria-label', this.owner.i18n.t('commentLabel'));
      card.input.setAttribute('aria-label', this.owner.i18n.t('editorLabel'));
      card.edit.textContent = this.owner.i18n.t('edit');
      card.save.textContent = this.owner.i18n.t('save');
      card.cancel.textContent = this.owner.i18n.t('cancel');
      if (card.rawComment !== annotation.comment) {
        card.rawComment = annotation.comment;
      }
      if (card.rawQuote !== annotation.text) {
        card.rawQuote = annotation.text;
        card.quote.textContent = plainText(this.doc, annotation.text);
        card.quote.hidden = !card.quote.textContent;
      }
      this.renderCardEditState(card, annotation);
      card.style.setProperty('--mn-color', color(annotation.color));
      card.classList.toggle('mn-selected', (this.selected || []).includes(annotation.id));
      return card;
    }

    renderCardEditState(card, annotation) {
      const edit = this.edits.get(annotation.id);
      const canDirectEdit = !richComment(annotation.comment);
      card.comment.textContent = plainText(this.doc, annotation.comment);
      card.edit.hidden = !!edit;
      card.edit.disabled = this.owner.isReadOnly() || !!annotation.readOnly;
      card.edit.textContent = this.owner.i18n.t(canDirectEdit ? 'edit' : 'edit');
      card.edit.title = this.owner.i18n.t(canDirectEdit ? 'editTitle' : 'rich');
      card.editor.hidden = !edit;
      card.comment.hidden = !!edit;
      card.actions.hidden = !!edit;
      if (edit) {
        if (card.input.value !== edit.draft) card.input.value = edit.draft;
        card.error.hidden = !edit.error;
        card.error.textContent = edit.error || '';
        card.save.disabled = edit.saving || this.owner.isReadOnly();
        card.cancel.disabled = !!edit.saving;
        if (edit.focus) {
          this.win.requestAnimationFrame(() => {
            if (!card.editor.hidden && card.input.isConnected) {
              card.input.focus();
              card.input.select();
              edit.focus = false;
            }
          });
        }
      } else {
        const error = this.errors?.get(annotation.id) || '';
        card.error.hidden = !error;
        card.error.textContent = error;
      }
    }

    beginEdit(annotation) {
      if (!annotation?.id) return;
      if (this.owner.isReadOnly() || annotation.readOnly) {
        this.setError(annotation.id, this.owner.i18n.t('readOnly'));
        return;
      }
      if (richComment(annotation.comment)) {
        this.setError(annotation.id, this.owner.i18n.t('rich'));
        this.owner.openAnnotationEditor(annotation.id);
        return;
      }
      this.clearError(annotation.id);
      this.edits.set(annotation.id, {
        original: annotation.comment || '',
        draft: String(annotation.comment || ''),
        error: '',
        saving: false,
        focus: true,
      });
      this.schedule();
    }

    updateDraft(id, value) {
      if (!id) return;
      const edit = this.edits.get(id);
      if (edit) edit.draft = value;
    }

    cancelEdit(id) {
      if (!id) return;
      this.edits.delete(id);
      this.schedule();
    }

    saveEdit(annotation) {
      if (!annotation?.id) return;
      const edit = this.edits.get(annotation.id);
      if (!edit || edit.saving) return;
      edit.saving = true;
      edit.error = '';
      const result = this.owner.updateComment(annotation.id, edit.original, edit.draft);
      edit.saving = false;
      if (result.ok) {
        this.edits.delete(annotation.id);
        this.clearError(annotation.id);
      } else {
        edit.error = result.message;
      }
      this.schedule();
    }

    setError(id, message) {
      if (!this.errors) this.errors = new Map();
      this.errors.set(id, message);
      this.schedule();
    }

    clearError(id) {
      this.errors?.delete(id);
    }

    render() {
      const active = this.owner.enabled && this.show !== false;
      this.layer.hidden = !active;
      if (!active) { this.clearCards(); return; }
      this.layer.dataset.theme = this.theme === 'dark' ||
        (!this.theme && this.win.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
      const boundsRect = rectOf(this.container);
      const bounds = { left: Math.max(0, boundsRect.left), top: Math.max(0, boundsRect.top),
        right: Math.min(this.win.innerWidth, boundsRect.left + this.container.clientWidth),
        bottom: Math.min(this.win.innerHeight, boundsRect.top + this.container.clientHeight) };
      const pdfViewer = this.app.pdfViewer;
      const pages = [];
      // PDF.js keeps page divs even when canvases are unloaded; use the DOM as the visibility filter.
      for (const div of this.doc.querySelectorAll('#viewer .page[data-page-number]')) {
        const box = rectOf(div);
        if (box.bottom <= bounds.top || box.top >= bounds.bottom ||
          box.right <= bounds.left || box.left >= bounds.right) continue;
        const index = Number(div.dataset.pageNumber) - 1;
        const pageView = pdfViewer.getPageView(index);
        if (pageView?.viewport && box.right > box.left) pages.push({ index, box, pageView, div });
      }
      const used = new Set();
      let crowded = 0;
      let noSpace = 0;
      this.lines.replaceChildren();
      for (const node of this.layer.querySelectorAll('.mn-overflow')) node.remove();
      let traySpec = null;
      const occupied = [];
      for (const page of pages) {
        const { index, box, pageView, div } = page;
        const annotations = [];
        for (const annotation of this.annotations || []) {
          const hasDraft = this.edits.has(annotation.id);
          if (!['highlight', 'underline'].includes(annotation.type) || annotation._hidden ||
            (!hasDraft && (!annotation.comment || !plainText(this.doc, annotation.comment)))) continue;
          const position = annotation.position;
          const rects = position?.pageIndex === index ? position.rects :
            position?.pageIndex + 1 === index ? position.nextPageRects : null;
          if (!Array.isArray(rects) || !rects.length) continue;
          const viewport = pageView.viewport;
          // clientWidth excludes the PDF page border; DOM position supplies viewport translation.
          const sx = div.clientWidth / viewport.width;
          const sy = div.clientHeight / viewport.height;
          let anchor;
          for (const rect of rects) {
            if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isFinite)) continue;
            const a = viewport.convertToViewportPoint(rect[0], rect[1]);
            const b = viewport.convertToViewportPoint(rect[2], rect[3]);
            const x = box.left + div.clientLeft + (a[0] + b[0]) / 2 * sx;
            const y = box.top + div.clientTop + (a[1] + b[1]) / 2 * sy;
            if (Number.isFinite(x) && Number.isFinite(y) && y >= bounds.top - 24 && y <= bounds.bottom + 24) {
              anchor = { x, y };
              break;
            }
          }
          if (anchor) annotations.push({ annotation, anchor });
        }
        if (!annotations.length) continue;
        const input = { page: box, bounds,
          obstacles: pages.filter(p => p !== page).map(p => p.box).concat(occupied), notes: [] };
        const space = root.MarginNotesLayout.layoutPage(input);
        const widths = Object.values(space.lanes).filter(Boolean).map(lane => lane.width);
        if (!widths.length) { noSpace += annotations.length; continue; }
        const measureWidth = Math.min(...widths);
        for (const { annotation, anchor } of annotations) {
          const card = this.makeCard(annotation, index);
          card.hidden = false;
          card.style.width = `${measureWidth}px`;
          card.style.height = '';
          card.open.textContent = this.owner.i18n.t('openLabel', { page: annotation.pageLabel || index + 1 });
          const height = Math.ceil(card.getBoundingClientRect().height);
          input.notes.push({ id: annotation.id, anchorX: anchor.x, anchorY: anchor.y, height });
        }
        const result = root.MarginNotesLayout.layoutPage(input);
        for (const p of result.placements) {
          const key = `${index}:${p.id}`;
          const card = this.cards.get(key);
          used.add(key);
          setRect(card, p);
          occupied.push({ left: p.x, right: p.x + p.width, top: p.y, bottom: p.y + p.height });
          card.dataset.side = p.side;
          const entry = annotations.find(a => a.annotation.id === p.id);
          const edgeX = p.side === 'left' ? box.left - 2 : box.right + 2;
          const cardX = p.side === 'left' ? p.x + p.width : p.x;
          const line = this.doc.createElementNS('http://www.w3.org/2000/svg', 'path');
          const cy = p.y + Math.min(22, p.height / 2);
          const ay = Math.max(bounds.top + 2, Math.min(bounds.bottom - 2, entry.anchor.y));
          line.setAttribute('d', `M ${edgeX} ${ay} C ${(edgeX + cardX) / 2} ${ay}, ${(edgeX + cardX) / 2} ${cy}, ${cardX} ${cy}`);
          line.setAttribute('stroke', color(entry.annotation.color));
          line.setAttribute('stroke-width', '1.5');
          line.setAttribute('fill', 'none');
          this.lines.append(line);
        }
        crowded += result.hidden.length;
        if (result.overflow && result.hidden.length) {
          const button = element(this.doc, 'button', 'mn-overflow',
            this.owner.i18n.t('overflow', {
              count: result.hidden.length,
              plural: result.hidden.length === 1 ? '' : 's',
            }));
          button.type = 'button';
          button.setAttribute('aria-expanded', String(this.trayPage === index));
          setRect(button, result.overflow);
          occupied.push({ left: result.overflow.x, right: result.overflow.x + result.overflow.width,
            top: result.overflow.y, bottom: result.overflow.y + result.overflow.height });
          button.addEventListener('click', () => { this.trayPage = index; this.schedule(); });
          this.layer.append(button);
          if (this.trayPage === index) {
            const lane = Object.values(result.lanes).find(l => l && Math.abs(l.x - result.overflow.x) < 1);
            if (lane) {
              traySpec = { index, lane, annotations: annotations.filter(a => result.hidden.includes(a.annotation.id)) };
              occupied.push({ left: lane.x, right: lane.x + lane.width,
                top: Math.max(lane.top, lane.bottom - 420), bottom: lane.bottom });
            }
          }
        }
      }
      for (const [key, card] of this.cards) {
        if (!used.has(key)) { card.remove(); this.cards.delete(key); }
      }
      this.renderTray(traySpec);
      this.noSpace = noSpace;
      this.crowded = crowded;
      this.owner.updateStatus();
    }

    renderTray(spec) {
      const old = this.layer.querySelector('.mn-tray');
      if (!spec) { old?.remove(); this.trayPage = null; return; }
      const focused = old?.contains(this.doc.activeElement) && this.doc.activeElement?.classList?.contains('mn-input')
        ? {
          id: this.doc.activeElement.closest('[data-annotation-id]')?.dataset.annotationId,
          start: this.doc.activeElement.selectionStart,
          end: this.doc.activeElement.selectionEnd,
        } : null;
      const signature = JSON.stringify([spec.index, spec.lane, spec.annotations.map(a => {
        const edit = this.edits.get(a.annotation.id);
        return [a.annotation.id, a.annotation.comment, edit?.draft, edit?.error, edit?.saving];
      })]);
      if (old?.dataset.signature === signature) return;
      const tray = element(this.doc, 'section', 'mn-tray');
      tray.dataset.signature = signature;
      tray.setAttribute('aria-label', this.owner.i18n.t('trayLabel'));
      const height = Math.min(420, spec.lane.bottom - spec.lane.top);
      setRect(tray, { x: spec.lane.x, y: spec.lane.bottom - height, width: spec.lane.width, height });
      const heading = element(this.doc, 'div', 'mn-tray-heading', this.owner.i18n.t('trayHeading'));
      const close = element(this.doc, 'button', '', this.owner.i18n.t('close'));
      close.type = 'button';
      close.addEventListener('click', () => { this.trayPage = null; this.schedule(); });
      heading.append(close);
      const list = element(this.doc, 'div', 'mn-tray-list');
      for (const { annotation } of spec.annotations) {
        const row = element(this.doc, 'div', 'mn-tray-row');
        row.dataset.annotationId = annotation.id;
        const button = element(this.doc, 'button', 'mn-open-tray', plainText(this.doc, annotation.comment));
        button.type = 'button';
        button.addEventListener('click', () => this.owner.navigate(annotation.id));
        row.append(button);
        const edit = this.edits.get(annotation.id);
        const actions = element(this.doc, 'div', 'mn-card-actions');
        const editButton = element(this.doc, 'button', 'mn-edit', this.owner.i18n.t('edit'));
        editButton.type = 'button';
        editButton.disabled = this.owner.isReadOnly() || !!annotation.readOnly;
        editButton.hidden = !!edit;
        editButton.addEventListener('click', () => this.beginEdit(annotation));
        actions.append(editButton);
        actions.hidden = !!edit;
        const error = element(this.doc, 'div', 'mn-error');
        error.hidden = !(edit?.error || this.errors?.get(annotation.id));
        error.textContent = edit?.error || this.errors?.get(annotation.id) || '';
        const editor = element(this.doc, 'div', 'mn-editor');
        editor.hidden = !edit;
        const input = element(this.doc, 'textarea', 'mn-input');
        input.setAttribute('aria-label', this.owner.i18n.t('editorLabel'));
        input.value = edit?.draft || '';
        input.addEventListener('input', () => this.updateDraft(annotation.id, input.value));
        input.addEventListener('keydown', event => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            this.saveEdit(annotation);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            this.cancelEdit(annotation.id);
          }
        });
        const editorActions = element(this.doc, 'div', 'mn-editor-actions');
        const cancel = element(this.doc, 'button', 'mn-cancel', this.owner.i18n.t('cancel'));
        cancel.type = 'button';
        cancel.addEventListener('click', () => this.cancelEdit(annotation.id));
        const save = element(this.doc, 'button', 'mn-save', this.owner.i18n.t('save'));
        save.type = 'button';
        save.disabled = edit?.saving || this.owner.isReadOnly();
        save.addEventListener('click', () => this.saveEdit(annotation));
        editorActions.append(cancel, save);
        editor.append(input, editorActions);
        row.append(actions, error, editor);
        list.append(row);
        if (edit?.focus) {
          this.win.requestAnimationFrame(() => {
            if (!editor.hidden && input.isConnected) {
              input.focus();
              input.select();
              edit.focus = false;
            }
          });
        }
      }
      tray.append(heading, list);
      for (const type of ['pointerdown', 'mousedown', 'dblclick', 'keydown']) {
        tray.addEventListener(type, event => event.stopPropagation());
      }
      tray.addEventListener('keydown', event => {
        if (event.key === 'Escape') { this.trayPage = null; this.schedule(); }
        event.stopPropagation();
      });
      if (old) old.replaceWith(tray); else this.layer.append(tray);
      if (focused?.id) {
        const input = tray.querySelector(`[data-annotation-id="${focused.id}"] .mn-input`);
        if (input) {
          input.focus();
          input.setSelectionRange(focused.start ?? input.value.length, focused.end ?? input.value.length);
        }
      }
      if (!old && !spec.annotations.some(({ annotation }) => this.edits.get(annotation.id)?.focus)) close.focus();
    }

    fit() {
      const viewer = this.app.pdfViewer;
      const page = viewer.getPageView(Math.max(0, viewer.currentPageNumber - 1));
      if (!page?.viewport) return;
      const width = this.container.clientWidth;
      // PDF.js centers a single page: space must be reserved on both sides.
      const reserve = 2 * (width >= 1000 ? 200 : 168) + 48;
      const spread = page.div?.closest('.spread');
      const spreadPages = spread ? Array.from(spread.children).filter(node => node.classList.contains('page')) : [];
      const spreadRects = spreadPages.map(rectOf);
      const currentWidth = spreadRects.length > 1
        ? Math.max(...spreadRects.map(r => r.right)) - Math.min(...spreadRects.map(r => r.left))
        : page.viewport.width;
      const scale = viewer.currentScale * Math.max(220, width - reserve) / currentWidth;
      if (Number.isFinite(scale) && scale > 0) viewer.currentScaleValue = String(Math.min(3, scale));
      this.schedule();
    }

    clearCards() {
      for (const card of this.cards.values()) card.remove();
      this.cards.clear();
      this.lines.replaceChildren();
      for (const node of this.layer.querySelectorAll('.mn-overflow,.mn-tray')) node.remove();
      this.noSpace = 0;
      this.crowded = 0;
      this.owner.updateStatus();
    }

    destroy() {
      this.destroyed = true;
      if (this.pending) this.win.cancelAnimationFrame(this.pending);
      for (const cleanup of this.cleanups) { try { cleanup(); } catch (_) { /* frame already closed */ } }
      this.layer.remove();
      this.style.remove();
      this.cards.clear();
    }
  }

  class ReaderController {
    constructor(reader, app) {
      this.reader = reader;
      this.app = app;
      this.frames = new Map();
      this.enabled = app.enabled;
      this.i18n = app.i18n;
      this.toolbar = null;
      this.lastError = '';
    }

    report(error) {
      const message = String(error);
      if (this.lastError !== message) { root.Zotero.logError(error); this.lastError = message; }
    }

    mountToolbar(doc, append) {
      if (this.toolbar?.isConnected) return;
      this.toolbar?.remove();
      const toolbar = element(doc, 'span', 'mn-toolbar');
      toolbar.style.cssText = 'display:inline-flex;align-items:center;gap:5px;margin-inline:5px;font-size:11px;';
      const toggle = element(doc, 'button', 'mn-toggle', this.i18n.t('toggle'));
      toggle.type = 'button';
      toggle.title = this.i18n.t('toggleTitle');
      toggle.addEventListener('click', () => this.app.setEnabled(!this.app.enabled));
      const fit = element(doc, 'button', 'mn-fit', this.i18n.t('fit'));
      fit.type = 'button';
      fit.title = this.i18n.t('fitTitle');
      fit.addEventListener('click', () => {
        this.app.setEnabled(true);
        for (const frame of this.frames.values()) frame.fit();
      });
      for (const button of [toggle, fit]) {
        button.style.cssText = 'font:inherit;color:inherit;white-space:nowrap;min-height:24px;padding:2px 7px;border:1px solid #8885;border-radius:5px;background:transparent;cursor:pointer;';
      }
      const status = element(doc, 'span', 'mn-status');
      status.style.cssText = 'max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.7;';
      toolbar.append(toggle, fit, status);
      append(toolbar);
      this.toolbar = toolbar;
      this.toggle = toggle;
      this.status = status;
      this.updateStatus();
    }

    updateStatus() {
      if (!this.toolbar) return;
      this.toggle.setAttribute('aria-pressed', String(this.enabled));
      this.toggle.style.background = this.enabled ? '#b9ab7430' : 'transparent';
      const noSpace = [...this.frames.values()].reduce((sum, frame) => sum + (frame.noSpace || 0), 0);
      let message = '';
      if (this.enabled && !this.frames.size) message = this.i18n.t('preparing');
      else if (this.enabled && noSpace) message = this.i18n.t('noSpace', { count: noSpace });
      this.status.textContent = message;
      this.status.title = noSpace ? this.i18n.t('noSpaceTitle') : message;
    }

    sync() {
      const inner = this.reader._internalReader;
      const live = new Set();
      for (const view of [inner?._primaryView, inner?._secondaryView]) {
        const raw = view?._iframeWindow;
        const win = raw?.wrappedJSObject || raw;
        const app = win?.PDFViewerApplication;
        if (!win || win.closed || !app?.pdfViewer || !app.eventBus?.on ||
          !win.document?.getElementById('viewerContainer')) continue;
        live.add(view);
        const existing = this.frames.get(view);
        if (existing && existing.doc !== win.document) {
          existing.destroy(); this.frames.delete(view);
        }
        if (!this.frames.has(view)) this.frames.set(view, new FrameOverlay(this, view, win, app));
        this.frames.get(view).snapshot();
      }
      for (const [view, frame] of this.frames) {
        if (!live.has(view)) { frame.destroy(); this.frames.delete(view); }
      }
      // renderToolbar may already have fired before the extension was enabled.
      if (!this.toolbar?.isConnected) {
        const doc = this.reader._iframeWindow?.document;
        const target = doc?.querySelector('.toolbar .end') || doc?.querySelector('.toolbar');
        if (target) this.mountToolbar(doc, node => target.append(node));
      }
      this.updateStatus();
    }

    navigate(id) {
      try { this.reader.navigate({ annotationID: id }); }
      catch (error) { this.report(error); }
    }

    openAnnotationEditor(id) {
      try {
        this.navigate(id);
        const inner = this.reader._internalReader;
        inner?.toggleSidebar?.(true);
        inner?.setSidebarView?.('annotations');
        const payload = [id];
        const target = this.reader._iframeWindow || this.reader._iframeWindow?.wrappedJSObject;
        const ids = root.Cu?.cloneInto && target ? root.Cu.cloneInto(payload, target) : payload;
        inner?.setSelectedAnnotations?.(ids);
      } catch (error) {
        this.report(error);
      }
    }

    isReadOnly() {
      const state = this.reader._internalReader?._state;
      return !!(state?.readOnly || this.reader._internalReader?._readOnly);
    }

    updateComment(id, original, comment) {
      const inner = this.reader._internalReader;
      const state = inner?._state;
      const annotation = (state?.annotations || []).find(item => item.id === id);
      if (this.isReadOnly() || annotation?.readOnly) return { ok: false, message: this.i18n.t('readOnly') };
      if (!annotation) return { ok: false, message: this.i18n.t('missing') };
      if ((annotation.comment || '') !== (original || '')) {
        return { ok: false, message: this.i18n.t('changed') };
      }
      try {
        const payload = [{ id, comment }];
        const target = this.reader._iframeWindow || this.reader._iframeWindow?.wrappedJSObject;
        const changes = root.Cu?.cloneInto && target ? root.Cu.cloneInto(payload, target) : payload;
        inner._annotationManager.updateAnnotations(changes);
        return { ok: true };
      } catch (error) {
        this.report(error);
        return { ok: false, message: this.i18n.t('saveFailed') };
      }
    }

    destroy() {
      for (const frame of this.frames.values()) frame.destroy();
      this.frames.clear();
      this.toolbar?.remove();
    }
  }

  const MarginNotes = {
    controllers: new Map(),
    running: false,
    start() {
      if (this.running) return;
      this.running = true;
      this.i18n = root.MarginNotesI18n.create();
      this.enabled = root.Zotero.Prefs.get(PREF, true) !== false;
      this.onToolbar = event => {
        if (!this.running || event.reader.type !== 'pdf') return;
        this.ensure(event.reader).mountToolbar(event.doc, event.append);
      };
      root.Zotero.Reader.registerEventListener('renderToolbar', this.onToolbar, ID);
      this.interval = root.setInterval(() => this.sync(), 400);
      this.sync();
    },
    ensure(reader) {
      if (!this.controllers.has(reader)) this.controllers.set(reader, new ReaderController(reader, this));
      return this.controllers.get(reader);
    },
    sync() {
      if (!this.running) return;
      const readers = root.Zotero.Reader._readers || [];
      for (const reader of readers) {
        if (reader.type !== 'pdf') continue;
        const controller = this.ensure(reader);
        try { controller.sync(); } catch (error) { controller.report(error); }
      }
      for (const [reader, controller] of this.controllers) {
        if (!readers.includes(reader)) { controller.destroy(); this.controllers.delete(reader); }
      }
    },
    setEnabled(enabled) {
      this.enabled = !!enabled;
      root.Zotero.Prefs.set(PREF, this.enabled, true);
      for (const controller of this.controllers.values()) {
        controller.enabled = this.enabled;
        for (const frame of controller.frames.values()) frame.schedule();
        controller.updateStatus();
      }
    },
    stop() {
      this.running = false;
      root.clearInterval(this.interval);
      // Zotero 9.0.6's public unregisterEventListener has an inverted filter.
      // This plugin-ID cleanup is also used by Zotero's own plugin shutdown path.
      root.Zotero.Reader._unregisterEventListenerByPluginID?.(ID);
      for (const controller of this.controllers.values()) controller.destroy();
      this.controllers.clear();
    }
  };
  root.MarginNotes = MarginNotes;
})(this);
