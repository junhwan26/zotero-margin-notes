/* global Zotero */
(function (root) {
  'use strict';

  const ID = 'margin-notes@local';
  const SVG = 'http://www.w3.org/2000/svg';
  const Reader = root.MarginNotesReader;

  function element(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(doc, className, text) {
    const node = element(doc, 'button', className, text);
    node.type = 'button';
    return node;
  }

  function icon(doc, paths) {
    const svg = doc.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'width:14px;height:14px;flex:none;';
    const path = doc.createElementNS(SVG, 'path');
    path.setAttribute('d', paths);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.3');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
    return svg;
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
    return root.MarginNotesMarkdown.hasRichText(String(value || ''), true);
  }

  function decodeEntities(doc, value) {
    if (!value.includes('&')) return value;
    // Escape tag openings first: this inert document can only decode text.
    const parsed = new doc.defaultView.DOMParser().parseFromString(
      '<body>' + value.replace(/</g, '&lt;') + '</body>', 'text/html');
    return parsed.body.textContent || '';
  }

  function color(value) {
    return /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#e4bd5a';
  }

  const COMMENT_ANNOTATION_TYPES = new Set(['highlight', 'underline', 'note']);

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
    constructor(owner, view, win, app, edits = new Map()) {
      this.owner = owner;
      this.view = view;
      this.win = win;
      this.app = app;
      this.doc = win.document;
      this.cards = new Map();
      this.edits = edits;
      this.cleanups = [];
      this.destroyed = false;
      this.pending = 0;
      this.trayPage = null;
      // Bumped when a setting changes how a stored comment is displayed.
      this.epoch = 0;
      this.style = element(this.doc, 'style');
      this.style.textContent = root.MarginNotesStyle.LAYER;
      this.doc.head.append(this.style);
      this.layer = element(this.doc, 'div', 'mn-layer');
      this.layer.setAttribute('aria-label', this.owner.i18n.t('layerLabel'));
      this.lines = this.doc.createElementNS(SVG, 'svg');
      this.lines.classList.add('mn-lines');
      this.lines.setAttribute('aria-hidden', 'true');
      this.layer.append(this.lines);
      this.doc.body.append(this.layer);
      const releaseGuard = Reader.guardTextFocus(view, this.layer);
      if (releaseGuard) this.cleanups.push(releaseGuard);
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
      // Selecting or creating an annotation ends with one of these events, so
      // the reader state is re-read right away instead of at the next poll.
      const refresh = () => this.owner.app.refreshSoon();
      for (const type of ['pointerup', 'keyup']) {
        win.addEventListener(type, refresh, { capture: true, passive: true });
        this.cleanups.push(() => win.removeEventListener(type, refresh, { capture: true }));
      }
      const shortcut = event => this.owner.app.handleShortcut(event);
      win.addEventListener('keydown', shortcut, true);
      this.cleanups.push(() => win.removeEventListener('keydown', shortcut, true));
      this.applySettings();
      this.schedule();
    }

    applySettings() {
      const config = this.owner.app.config;
      this.layer.style.setProperty('--mn-font-size', `${config.fontSize}px`);
      this.layer.dataset.quote = config.quote ? 'on' : 'off';
      this.layer.dataset.connectors = config.connectors ? 'on' : 'off';
      this.layer.dataset.expand = config.expand ? 'on' : 'off';
      if (this.math !== config.math) {
        this.math = config.math;
        this.epoch++;
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
      const { annotations, selected, show, theme, readOnly } = Reader.snapshot(this.owner.reader);
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

    hasComment(annotation) {
      return !!annotation.comment && !!plainText(this.doc, annotation.comment);
    }

    // A selected highlight without a comment gets a card that offers to add one.
    canAddComment(annotation) {
      return this.owner.app.config.addOnSelect && !this.owner.isReadOnly() && !annotation.readOnly &&
        (this.selected || []).includes(annotation.id);
    }

    // One editor implementation serves both margin cards and overflow rows.
    makeEditor(getAnnotation) {
      const i18n = this.owner.i18n;
      const editor = element(this.doc, 'div', 'mn-editor');
      const input = element(this.doc, 'textarea', 'mn-input');
      input.setAttribute('aria-label', i18n.t('editorLabel'));
      input.addEventListener('input', () => this.updateDraft(getAnnotation()?.id, input.value));
      input.addEventListener('keydown', event => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          this.saveEdit(getAnnotation());
        } else if (event.key === 'Escape') {
          event.preventDefault();
          this.cancelEdit(getAnnotation()?.id);
        }
      });
      const actions = element(this.doc, 'div', 'mn-editor-actions');
      const hint = element(this.doc, 'span', 'mn-editor-hint',
        i18n.t('editorHint', { key: root.Zotero.isMac ? '⌘' : 'Ctrl+' }));
      const cancel = button(this.doc, 'mn-cancel', i18n.t('cancel'));
      cancel.addEventListener('click', () => this.cancelEdit(getAnnotation()?.id));
      const save = button(this.doc, 'mn-save', i18n.t('save'));
      save.addEventListener('click', () => this.saveEdit(getAnnotation()));
      actions.append(hint, cancel, save);
      editor.append(input, actions);
      return { editor, input, save, cancel };
    }

    focusEditor(edit, editor, input) {
      if (!edit?.focus) return;
      this.win.requestAnimationFrame(() => {
        if (!editor.hidden && input.isConnected) {
          input.focus();
          input.select();
          edit.focus = false;
        }
      });
    }

    makeCard(annotation, pageIndex) {
      const key = `${pageIndex}:${annotation.id}`;
      let card = this.cards.get(key);
      if (!card) {
        card = element(this.doc, 'article', 'mn-card');
        card.dataset.annotationId = annotation.id;
        card.dataset.pageIndex = pageIndex;
        card.open = button(this.doc, 'mn-open');
        card.open.addEventListener('click', () => this.owner.navigate(card.currentAnnotation?.id));
        card.quote = element(this.doc, 'div', 'mn-quote');
        card.comment = element(this.doc, 'div', 'mn-comment');
        card.comment.tabIndex = 0;
        card.add = button(this.doc, 'mn-add');
        card.add.addEventListener('click', () => this.beginEdit(card.currentAnnotation));
        card.error = element(this.doc, 'div', 'mn-error');
        card.error.hidden = true;
        Object.assign(card, this.makeEditor(() => card.currentAnnotation));
        card.append(card.open, card.quote, card.comment, card.add, card.error, card.editor);
        this.bindEditGesture(card, () => card.currentAnnotation);
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
      card.add.textContent = this.owner.i18n.t('add');
      const quote = annotation.text || '';
      if (card.rawQuote !== quote) {
        card.rawQuote = quote;
        card.quote.textContent = plainText(this.doc, quote);
        card.quote.hidden = !card.quote.textContent;
      }
      this.renderCardEditState(card, annotation);
      card.style.setProperty('--mn-color', color(annotation.color));
      card.classList.toggle('mn-selected', (this.selected || []).includes(annotation.id));
      return card;
    }

    renderCardEditState(card, annotation) {
      const edit = this.edits.get(annotation.id);
      const hasComment = this.hasComment(annotation);
      this.renderComment(card.comment, annotation);
      this.describeEditGesture(card.comment, annotation);
      card.editor.hidden = !edit;
      card.comment.hidden = !!edit || !hasComment;
      card.add.hidden = !!edit || hasComment;
      if (edit) {
        if (card.input.value !== edit.draft) card.input.value = edit.draft;
        card.error.hidden = !edit.error;
        card.error.textContent = edit.error || '';
        card.save.disabled = edit.saving || this.owner.isReadOnly();
        card.cancel.disabled = !!edit.saving;
        this.focusEditor(edit, card.editor, card.input);
      } else {
        const error = this.errors?.get(annotation.id) || '';
        card.error.hidden = !error;
        card.error.textContent = error;
      }
    }

    describeEditGesture(comment, annotation) {
      const readOnly = this.owner.isReadOnly() || !!annotation.readOnly;
      comment.setAttribute('aria-readonly', String(readOnly));
      comment.title = this.owner.i18n.t(readOnly ? 'readOnly' :
        richComment(annotation.comment) ? 'editRichTitle' : 'editTitle');
    }

    renderComment(comment, annotation) {
      const source = String(annotation.comment || '');
      if (comment.mnSource === source && comment.mnEpoch === this.epoch) return;
      const legacyHTML = root.MarginNotesMarkdown.hasRichText(source);
      const math = this.math && root.MarginNotesMath.available();
      comment.replaceChildren(root.MarginNotesMarkdown.render(this.doc, source, {
        legacyHTML,
        decodeText: legacyHTML ? value => decodeEntities(this.doc, value) : undefined,
        renderMath: math ? (value, display) => root.MarginNotesMath.render(this.doc, value, display) : undefined,
      }));
      comment.mnSource = source;
      comment.mnEpoch = this.epoch;
      if (comment.mnLinksBound) return;
      comment.mnLinksBound = true;
      const openLink = event => {
        const link = event.target.closest('a');
        if (!link || !comment.contains(link)) return;
        event.preventDefault();
        event.stopPropagation();
        const url = root.MarginNotesMarkdown.safeURL(link.getAttribute('href'));
        if (url && (event.button === 0 || event.button === 1)) {
          try { root.Zotero.launchURL(url); }
          catch (error) { this.owner.report(error); }
        }
      };
      comment.addEventListener('click', openLink);
      comment.addEventListener('auxclick', openLink);
    }

    bindEditGesture(note, getAnnotation) {
      note.addEventListener('dblclick', event => {
        // Keep native button actions and text selection inside an active editor.
        if (event.target.closest('button, a, .mn-editor')) return;
        event.preventDefault();
        this.beginEdit(getAnnotation());
      });
      note.addEventListener('keydown', event => {
        if (!event.target.classList.contains('mn-comment') ||
          !['Enter', 'F2'].includes(event.key) || event.metaKey || event.ctrlKey || event.altKey) return;
        event.preventDefault();
        this.beginEdit(getAnnotation());
      });
    }

    beginEdit(annotation) {
      if (!annotation?.id || this.edits.has(annotation.id)) return;
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
        // A whitespace-only comment is an empty note: start from a clean field.
        draft: this.hasComment(annotation) ? String(annotation.comment) : '',
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
        this.owner.app.refreshSoon();
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
      const config = this.owner.app.config;
      const dark = this.theme === 'dark' ||
        (!this.theme && this.win.matchMedia('(prefers-color-scheme: dark)').matches);
      this.layer.dataset.theme = dark ? 'dark' : 'light';
      this.layer.dataset.surface = config.surface === 'dark' || (config.surface === 'auto' && dark)
        ? 'dark' : 'paper';
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
      let noSpace = 0;
      this.lines.replaceChildren();
      for (const node of this.layer.querySelectorAll('.mn-overflow')) node.remove();
      let traySpec = null;
      const occupied = [];
      for (const page of pages) {
        const { index, box, pageView, div } = page;
        const annotations = [];
        for (const annotation of this.annotations || []) {
          if (!COMMENT_ANNOTATION_TYPES.has(annotation.type) || annotation._hidden ||
            (!this.edits.has(annotation.id) && !this.hasComment(annotation) &&
              !this.canAddComment(annotation))) continue;
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
        const input = { page: box, bounds, side: config.side, maxWidth: config.maxWidth || undefined,
          obstacles: pages.filter(p => p !== page).map(p => p.box).concat(occupied), notes: [] };
        const space = root.MarginNotesLayout.layoutPage(input);
        if (!Object.values(space.lanes).some(Boolean)) { noSpace += annotations.length; continue; }
        for (const { annotation, anchor } of annotations) {
          const card = this.makeCard(annotation, index);
          card.hidden = false;
          card.style.height = '';
          card.open.textContent = this.owner.i18n.t('openLabel', { page: annotation.pageLabel || index + 1 });
          const heights = {};
          const measured = new Map();
          for (const [side, lane] of Object.entries(space.lanes)) {
            if (!lane) continue;
            if (!measured.has(lane.width)) {
              card.style.width = `${lane.width}px`;
              measured.set(lane.width, Math.ceil(card.getBoundingClientRect().height));
            }
            heights[side] = measured.get(lane.width);
          }
          input.notes.push({ id: annotation.id, anchorX: anchor.x, anchorY: anchor.y, heights });
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
          const cy = p.y + Math.min(22, p.height / 2);
          const ay = Math.max(bounds.top + 2, Math.min(bounds.bottom - 2, entry.anchor.y));
          const stroke = color(entry.annotation.color);
          const selected = card.classList.contains('mn-selected');
          const line = this.doc.createElementNS(SVG, 'path');
          line.setAttribute('d', `M ${edgeX} ${ay} C ${(edgeX + cardX) / 2} ${ay}, ${(edgeX + cardX) / 2} ${cy}, ${cardX} ${cy}`);
          line.setAttribute('stroke', stroke);
          const dot = this.doc.createElementNS(SVG, 'circle');
          dot.setAttribute('cx', edgeX);
          dot.setAttribute('cy', ay);
          dot.setAttribute('r', '2.25');
          dot.setAttribute('fill', stroke);
          if (selected) line.classList.add('mn-selected');
          this.lines.append(line, dot);
        }
        if (result.overflow && result.hidden.length) {
          const more = button(this.doc, 'mn-overflow',
            this.owner.i18n.t('overflow', {
              count: result.hidden.length,
              plural: result.hidden.length === 1 ? '' : 's',
            }));
          more.setAttribute('aria-expanded', String(this.trayPage === index));
          setRect(more, result.overflow);
          occupied.push({ left: result.overflow.x, right: result.overflow.x + result.overflow.width,
            top: result.overflow.y, bottom: result.overflow.y + result.overflow.height });
          more.addEventListener('click', () => { this.trayPage = index; this.schedule(); });
          this.layer.append(more);
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
      const signature = JSON.stringify([spec.index, spec.lane, this.epoch, spec.annotations.map(a => {
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
      const close = button(this.doc, '', this.owner.i18n.t('close'));
      close.addEventListener('click', () => { this.trayPage = null; this.schedule(); });
      heading.append(close);
      const list = element(this.doc, 'div', 'mn-tray-list');
      for (const { annotation } of spec.annotations) {
        const row = element(this.doc, 'div', 'mn-tray-row');
        row.dataset.annotationId = annotation.id;
        row.style.setProperty('--mn-color', color(annotation.color));
        const open = button(this.doc, 'mn-open-tray',
          this.owner.i18n.t('openLabel', { page: annotation.pageLabel || spec.index + 1 }));
        open.title = this.owner.i18n.t('openTitle');
        open.addEventListener('click', () => this.owner.navigate(annotation.id));
        const comment = element(this.doc, 'div', 'mn-comment');
        this.renderComment(comment, annotation);
        comment.tabIndex = 0;
        comment.setAttribute('aria-label', this.owner.i18n.t('commentLabel'));
        this.describeEditGesture(comment, annotation);
        const edit = this.edits.get(annotation.id);
        const hasComment = this.hasComment(annotation);
        comment.hidden = !!edit || !hasComment;
        const add = button(this.doc, 'mn-add', this.owner.i18n.t('add'));
        add.hidden = !!edit || hasComment;
        add.addEventListener('click', () => this.beginEdit(annotation));
        row.append(open, comment, add);
        this.bindEditGesture(row, () => annotation);
        const error = element(this.doc, 'div', 'mn-error');
        error.hidden = !(edit?.error || this.errors?.get(annotation.id));
        error.textContent = edit?.error || this.errors?.get(annotation.id) || '';
        const { editor, input, save } = this.makeEditor(() => annotation);
        editor.hidden = !edit;
        input.value = edit?.draft || '';
        save.disabled = edit?.saving || this.owner.isReadOnly();
        row.append(error, editor);
        list.append(row);
        this.focusEditor(edit, editor, input);
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
      this.owner.updateStatus();
    }

    destroy() {
      this.destroyed = true;
      if (this.pending) this.win.cancelAnimationFrame(this.pending);
      for (const cleanup of this.cleanups) {
        try { cleanup(); }
        catch (error) { this.owner.report(error); }
      }
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
      this.suspendedDrafts = new Map();
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
      this.unmountToolbar();
      const toolbar = element(doc, 'span', 'mn-toolbar');
      toolbar.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin-inline:6px;font-size:11px;';
      const toggle = button(doc, 'mn-toggle');
      toggle.append(icon(doc, 'M3.2 2.5h5.6a.7.7 0 0 1 .7.7v9.6a.7.7 0 0 1-.7.7H3.2a.7.7 0 0 1-.7-.7V3.2a.7.7 0 0 1 .7-.7ZM11.6 5h2.4M11.6 8h2.4M11.6 11h2.4'),
        element(doc, 'span', '', this.i18n.t('toggle')));
      toggle.addEventListener('click', () => this.app.setEnabled(!this.app.enabled));
      const fit = button(doc, 'mn-fit');
      fit.append(icon(doc, 'M1.8 8h3.6M5.4 8 3.8 6.4M5.4 8 3.8 9.6M14.2 8h-3.6M10.6 8l1.6-1.6M10.6 8l1.6 1.6M8 3v10'),
        element(doc, 'span', '', this.i18n.t('fit')));
      fit.title = this.i18n.t('fitTitle');
      fit.addEventListener('click', () => {
        this.sync();
        this.app.setEnabled(true);
        for (const frame of this.frames.values()) frame.fit();
      });
      for (const control of [toggle, fit]) {
        control.style.cssText = 'display:inline-flex;align-items:center;gap:5px;font:inherit;color:inherit;white-space:nowrap;min-height:26px;padding:2px 8px;border:1px solid transparent;border-radius:6px;background:transparent;cursor:pointer;';
      }
      const status = element(doc, 'span', 'mn-status');
      status.style.cssText = 'max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.7;';
      toolbar.append(toggle, fit, status);
      append(toolbar);
      // Decorative only: the inline styles above already give usable buttons.
      try {
        this.toolbarStyle = element(doc, 'style', '', root.MarginNotesStyle.TOOLBAR);
        doc.head.append(this.toolbarStyle);
      } catch (_) { this.toolbarStyle = null; }
      const shortcut = event => this.app.handleShortcut(event);
      const win = doc.defaultView;
      win?.addEventListener('keydown', shortcut, true);
      this.releaseShortcut = () => win?.removeEventListener('keydown', shortcut, true);
      this.toolbar = toolbar;
      this.toggle = toggle;
      this.status = status;
      this.updateStatus();
    }

    unmountToolbar() {
      this.toolbar?.ownerDocument?.documentElement?.removeAttribute('data-mn-native-popup');
      this.toolbar?.remove();
      this.toolbarStyle?.remove();
      try { this.releaseShortcut?.(); } catch (error) { this.report(error); }
      this.toolbar = this.toolbarStyle = this.releaseShortcut = null;
    }

    // Zotero's own comment popup repeats the margin card for the same annotation.
    // It stays hidden while every open popup has a placed card, including the
    // moment before the next popup opens, so it never flashes over the card;
    // annotations without a card (image, ink, no room) keep the native popup.
    updateNativePopup() {
      const root = this.toolbar?.ownerDocument?.documentElement;
      if (!root) return;
      const placed = id => [...this.frames.values()].some(frame => [...frame.cards.values()]
        .some(card => card.dataset.annotationId === id && card.isConnected && !card.hidden));
      const hide = this.enabled && this.app.config.hideNativePopup &&
        Reader.annotationPopups(this.reader).every(placed);
      if (hide) root.setAttribute('data-mn-native-popup', 'hide');
      else root.removeAttribute('data-mn-native-popup');
    }

    updateStatus() {
      if (!this.toolbar) return;
      this.updateNativePopup();
      this.toggle.setAttribute('aria-pressed', String(this.enabled));
      this.toggle.title = this.i18n.t('toggleTitle') +
        (this.app.config.shortcut ? ` (${root.Zotero.isMac ? '⌥M' : 'Alt+M'})` : '');
      const noSpace = [...this.frames.values()].reduce((sum, frame) => sum + (frame.noSpace || 0), 0);
      let message = '';
      if (this.enabled && this.readingModeOnly) message = this.i18n.t('readingMode');
      else if (this.enabled && !this.frames.size) message = this.i18n.t('preparing');
      else if (this.enabled && noSpace) message = this.i18n.t('noSpace', { count: noSpace });
      this.status.textContent = message;
      this.status.title = noSpace ? this.i18n.t('noSpaceTitle') : message;
    }

    sync() {
      const live = new Set();
      const panes = Reader.panes(this.reader);
      const openPanes = panes.filter(pane => pane.view);
      for (const view of this.suspendedDrafts.keys()) {
        if (!openPanes.some(pane => pane.view === view)) this.suspendedDrafts.delete(view);
      }
      this.readingModeOnly = openPanes.length > 0 && openPanes.every(pane => pane.readingMode);
      for (const { view, readingMode } of panes) {
        // Suspend a Reading Mode pane so Fit Notes cannot zoom the hidden PDF view.
        if (readingMode) continue;
        const pdf = Reader.pdfWindow(view);
        if (!pdf) continue;
        live.add(view);
        const existing = this.frames.get(view);
        if (existing && existing.doc !== pdf.win.document) {
          existing.destroy(); this.frames.delete(view);
        }
        if (!this.frames.has(view)) {
          this.frames.set(view, new FrameOverlay(this, view, pdf.win, pdf.app, this.suspendedDrafts.get(view)));
          this.suspendedDrafts.delete(view);
        }
        this.frames.get(view).snapshot();
      }
      for (const [view, frame] of this.frames) {
        if (!live.has(view)) {
          if (panes.some(pane => pane.view === view && pane.readingMode)) {
            this.suspendedDrafts.set(view, frame.edits);
          }
          frame.destroy(); this.frames.delete(view);
        }
      }
      // renderToolbar may already have fired before the extension was enabled.
      if (!this.toolbar?.isConnected) {
        const doc = Reader.outerWindow(this.reader)?.document;
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
        Reader.openInSidebar(this.reader, id);
      } catch (error) {
        this.report(error);
      }
    }

    isReadOnly() {
      return Reader.isReadOnly(this.reader);
    }

    updateComment(id, original, comment) {
      const annotation = Reader.annotation(this.reader, id);
      if (this.isReadOnly() || annotation?.readOnly) return { ok: false, message: this.i18n.t('readOnly') };
      if (!annotation) return { ok: false, message: this.i18n.t('missing') };
      if ((annotation.comment || '') !== (original || '')) {
        return { ok: false, message: this.i18n.t('changed') };
      }
      try {
        // Only the item-API fallback is asynchronous; surface its late failure.
        Reader.updateComment(this.reader, id, comment)?.catch(error => this.report(error));
        return { ok: true };
      } catch (error) {
        this.report(error);
        return { ok: false, message: this.i18n.t('saveFailed') };
      }
    }

    destroy() {
      for (const frame of this.frames.values()) frame.destroy();
      this.frames.clear();
      this.suspendedDrafts.clear();
      this.unmountToolbar();
    }
  }

  const MarginNotes = {
    controllers: new Map(),
    running: false,
    start() {
      if (this.running) return;
      this.running = true;
      this.i18n = root.MarginNotesI18n.create();
      this.settings = root.MarginNotesSettings.create();
      this.config = this.settings.all();
      this.enabled = this.config.enabled;
      this.settings.observe(() => this.applySettings());
      this.onToolbar = event => {
        if (!this.running || event.reader.type !== 'pdf') return;
        this.ensure(event.reader).mountToolbar(event.doc, event.append);
      };
      root.Zotero.Reader.registerEventListener('renderToolbar', this.onToolbar, ID);
      // Item changes arrive through the notifier and reader input through DOM
      // events; this interval only catches what neither reports, such as a
      // reader opening or a pane entering Reading Mode.
      this.interval = root.setInterval(() => this.sync(), 400);
      this.notifier = root.Zotero.Notifier?.registerObserver?.(
        { notify: () => this.refreshSoon() }, ['item'], 'margin-notes');
      this.registerPreferences();
      this.sync();
    },
    // Optional: the notes work without a settings pane, so a failure here is
    // logged for diagnosis rather than reported as a plugin error.
    registerPreferences() {
      const base = root.MarginNotesRoot;
      if (!base || typeof root.Zotero.PreferencePanes?.register !== 'function') return;
      const failed = error => root.Zotero.debug?.('Margin Notes: settings pane unavailable: ' + error);
      const registration = {};
      this.paneRegistration = registration;
      try {
        Promise.resolve(root.Zotero.PreferencePanes.register({
          pluginID: ID,
          src: base + 'prefs/preferences.xhtml',
          label: this.i18n.t('toggle'),
        })).then(id => {
          // Registration awaits Zotero's plugin metadata. A shutdown or newer
          // startup can finish first; release only this obsolete registration.
          if (!this.running || this.paneRegistration !== registration) {
            root.Zotero.PreferencePanes.unregister(id);
            return;
          }
          this.pane = id;
        }).catch(failed);
      } catch (error) { failed(error); }
    },
    ensure(reader) {
      if (!this.controllers.has(reader)) this.controllers.set(reader, new ReaderController(reader, this));
      return this.controllers.get(reader);
    },
    sync() {
      if (!this.running) return;
      const readers = Reader.readers();
      for (const reader of readers) {
        if (reader.type !== 'pdf') continue;
        const controller = this.ensure(reader);
        try { controller.sync(); } catch (error) { controller.report(error); }
      }
      for (const [reader, controller] of this.controllers) {
        if (!readers.includes(reader)) { controller.destroy(); this.controllers.delete(reader); }
      }
    },
    // Coalesce bursts of events; the reader applies its own state change first.
    refreshSoon() {
      if (!this.running || this.refresh || typeof root.setTimeout !== 'function') return;
      this.refresh = root.setTimeout(() => {
        this.refresh = null;
        this.sync();
      }, 30);
    },
    applySettings() {
      if (!this.running) return;
      this.config = this.settings.all();
      this.enabled = this.config.enabled;
      for (const controller of this.controllers.values()) {
        controller.enabled = this.enabled;
        for (const frame of controller.frames.values()) frame.applySettings();
        controller.updateStatus();
      }
    },
    setEnabled(enabled) {
      this.settings.set('enabled', !!enabled);
      this.applySettings();
    },
    // Alt+M toggles the notes from the PDF or the reader toolbar. It stays out
    // of text fields, where Option+M types a character on macOS.
    handleShortcut(event) {
      if (!this.running || !this.config.shortcut || event.code !== 'KeyM' || !event.altKey ||
        event.metaKey || event.ctrlKey || event.shiftKey) return;
      if (event.target?.closest?.('textarea, input, [contenteditable]:not([contenteditable="false"])')) return;
      event.preventDefault();
      event.stopPropagation();
      this.setEnabled(!this.enabled);
    },
    stop() {
      this.running = false;
      this.paneRegistration = null;
      root.clearInterval(this.interval);
      if (this.refresh) root.clearTimeout?.(this.refresh);
      this.refresh = null;
      if (this.notifier) {
        try { root.Zotero.Notifier.unregisterObserver(this.notifier); }
        catch (error) { root.Zotero.logError(error); }
        this.notifier = null;
      }
      this.settings?.stop();
      if (this.pane) {
        try { root.Zotero.PreferencePanes.unregister(this.pane); } catch (_) { /* released with the plugin */ }
        this.pane = null;
      }
      Reader.removeListeners(ID);
      for (const controller of this.controllers.values()) controller.destroy();
      this.controllers.clear();
    }
  };
  root.MarginNotes = MarginNotes;
})(this);
