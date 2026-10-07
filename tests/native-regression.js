/* global Components */
// Loaded only by the disposable-profile test extension, never by the release XPI.
(function (root) {
  'use strict';

  function create(context) {
    const { reader, pdfWindow: win, check, waitFor, sleep, mark, Zotero } = context;
    const inner = reader._internalReader;
    const view = inner._primaryView;
    const doc = win.document;
    const outer = reader._iframeWindow.wrappedJSObject || reader._iframeWindow;
    const outerDoc = outer.document;
    const pdf = win.PDFViewerApplication.pdfViewer;
    const Cc = Components.classes;
    const Ci = Components.interfaces;
    const mac = Zotero.isMac;
    const settle = () => sleep(220);
    const diagnostics = () => ({
      tool: inner._state.tool.type,
      readOnly: inner._state.readOnly,
      pointerDownTriggered: view._pointerDownTriggered,
      action: view.action?.type,
      ranges: view._selectionRanges?.map(r => ({ text: r.text, collapsed: r.collapsed })),
      popup: !!inner._state.primaryViewSelectionPopup,
      activeElement: doc.activeElement?.className,
      viewport: [win.innerWidth, win.innerHeight],
      scale: pdf.currentScale,
    });
    const utils = target => Components.utils.unwaiveXrays(target).windowUtils;
    const mouse = (target, type, x, y, buttons = 0, count = 1) => {
      // Match Gecko EventUtils: route trusted events through widget hit testing.
      utils(target).sendMouseEvent(type, x, y, 0, count, 0, false, 0,
        target.MouseEvent.MOZ_SOURCE_MOUSE, true, false, buttons);
    };
    const click = async element => {
      if (!element) throw new Error('Missing native control');
      const target = element.ownerDocument.defaultView;
      const r = element.getBoundingClientRect();
      if (!r.width || !r.height || element.disabled) throw new Error('Native control is hidden or disabled: ' + element.className);
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      mouse(target, 'mousemove', x, y);
      mouse(target, 'mousedown', x, y, 1);
      mouse(target, 'mouseup', x, y, 0);
      await settle();
    };
    const key = async (target, name, modifiers = []) => {
      const tip = Cc['@mozilla.org/text-input-processor;1'].createInstance(Ci.nsITextInputProcessor);
      if (!tip.beginInputTransactionForTests(target)) throw new Error('Cannot start trusted keyboard input');
      const definitions = {
        Meta: ['MetaLeft', 224], Control: ['ControlLeft', 17], Shift: ['ShiftLeft', 16],
        Escape: ['Escape', 27], Delete: ['Delete', 46], Backspace: ['Backspace', 8],
        Enter: ['Enter', 13], ArrowRight: ['ArrowRight', 39], ArrowLeft: ['ArrowLeft', 37],
      };
      const event = value => {
        const definition = definitions[value] || ['Key' + value.toUpperCase(), value.toUpperCase().charCodeAt(0)];
        const KeyboardEvent = Components.utils.unwaiveXrays(target).KeyboardEvent;
        return new KeyboardEvent('', { key: value, code: definition[0], keyCode: definition[1] });
      };
      const flags = value => value.length > 1 ? tip.KEY_NON_PRINTABLE_KEY : 0;
      for (const modifier of modifiers) tip.keydown(event(modifier), flags(modifier));
      tip.keydown(event(name), flags(name));
      tip.keyup(event(name), flags(name));
      for (const modifier of modifiers.slice().reverse()) tip.keyup(event(modifier), flags(modifier));
      await settle();
    };
    const typeText = async (element, text) => {
      await click(element);
      const target = element.ownerDocument.defaultView;
      await key(target, 'a', [mac ? 'Meta' : 'Control']);
      utils(target).sendContentCommandEvent('insertText', null, text);
      await settle();
    };
    const pointerTool = async () => {
      const type = inner._state.tool.type;
      if (type !== 'pointer') {
        const button = outerDoc.querySelector('.toolbar button.' + (type === 'image' ? 'area' : type));
        await click(button);
      }
      await waitFor('native pointer tool', () => inner._state.tool.type === 'pointer');
    };
    const textLine = async (line = 6) => {
      const suffix = 'line ' + String(line).padStart(2, '0') + '.';
      const span = await waitFor('synthetic PDF text layer', () =>
        Array.from(doc.querySelectorAll('.page[data-page-number="1"] .textLayer span'))
          .find(node => node.textContent.startsWith('LEFT column:') && node.textContent.endsWith(suffix)));
      const container = doc.getElementById('viewerContainer');
      container.scrollTop += span.getBoundingClientRect().top - win.innerHeight * 0.45;
      await sleep(500);
      await waitFor('PDF scrolling settled before pointer input', () => !view._scrolling);
      const range = doc.createRange();
      range.setStart(span.firstChild, 0);
      range.setEnd(span.firstChild, 18);
      const r = range.getBoundingClientRect();
      return { x1: r.left + 1, x2: r.right - 1, y: r.top + r.height / 2 };
    };
    const dragText = async (label, line = 6, expectPopup = true) => {
      const p = await textLine(line);
      let trusted = false;
      let nativeDrag = null;
      const observeDrag = event => {
        nativeDrag = { trusted: event.isTrusted, prevented: event.defaultPrevented };
      };
      const trace = [];
      const observe = event => {
        if (event.isTrusted && event.target.closest?.('#viewerContainer')) trusted = true;
        trace.push({ type: event.type, buttons: event.buttons, x: event.clientX, y: event.clientY,
          position: view.pointerEventToPosition(event), action: view.action?.type });
      };
      for (const type of ['mousedown', 'mousemove', 'mouseup']) win.addEventListener(type, observe, true);
      win.addEventListener('dragstart', observeDrag, true);
      try {
        const hit = doc.elementFromPoint(p.x1, p.y);
        check(label + ': PDF text receives pointer input', !!hit?.closest('#viewerContainer'), { target: hit?.className });
        mouse(win, 'mousemove', p.x1, p.y);
        mouse(win, 'mousedown', p.x1, p.y, 1);
        for (let step = 1; step <= 6; step++) {
          mouse(win, 'mousemove', p.x1 + (p.x2 - p.x1) * step / 6, p.y, 1);
          await sleep(65);
        }
        mouse(win, 'mouseup', p.x2, p.y, 0);
      } finally {
        for (const type of ['mousedown', 'mousemove', 'mouseup']) win.removeEventListener(type, observe, true);
        win.removeEventListener('dragstart', observeDrag, true);
      }
      check(label + ': selection used trusted pointer events', trusted, trusted ? undefined : { p, trace, ...diagnostics() });
      check(label + ': native text drag cancellation remains intact', nativeDrag?.trusted && nativeDrag.prevented, nativeDrag);
      if (expectPopup) {
        try {
          await waitFor(label + ' selection popup', () => {
            const popup = outerDoc.querySelector('.selection-popup');
            return inner._state.primaryViewSelectionPopup?.annotation?.text && popup?.getBoundingClientRect().width > 0;
          }, 4500);
        } catch (error) {
          check(label + ': selection popup is visible', false, { ...diagnostics(), p, trace });
        }
        check(label + ': selection popup is visible', true);
      }
      return p;
    };
    const dismissSelection = async () => {
      const page = doc.querySelector('.page[data-page-number="1"]').getBoundingClientRect();
      mouse(win, 'mousedown', page.left + 16, Math.max(20, page.top + 35), 1);
      mouse(win, 'mouseup', page.left + 16, Math.max(20, page.top + 35), 0);
      await settle();
    };
    const annotationAt = async (annotation, label) => {
      const page = pdf.getPageView(annotation.position.pageIndex);
      const r = annotation.position.rects[0];
      const p = page.viewport.convertToViewportPoint((r[0] + r[2]) / 2, (r[1] + r[3]) / 2);
      const box = page.div.getBoundingClientRect();
      const x = box.left + page.div.clientLeft + p[0] * page.div.clientWidth / page.viewport.width;
      const y = box.top + page.div.clientTop + p[1] * page.div.clientHeight / page.viewport.height;
      mouse(win, 'mousedown', x, y, 1);
      mouse(win, 'mouseup', x, y, 0);
      await waitFor(label + ' native annotation selected', () => inner._state.selectedAnnotationIDs.includes(annotation.id));
    };
    const removeAnnotation = async (annotation, label) => {
      await pointerTool();
      await annotationAt(annotation, label);
      win.focus();
      doc.activeElement?.blur();
      await key(win, 'Delete');
      await waitFor(label + ' annotation deleted', () => !inner._state.annotations.some(a => a.id === annotation.id));
    };

    async function protectedKeys(element, label, editable = false) {
      const annotations = JSON.stringify(inner._state.annotations);
      const shortcuts = [
        ['Delete', []], ['Backspace', []], ['ArrowRight', ['Shift']],
        ['z', [mac ? 'Meta' : 'Control']],
      ];
      for (const [name, modifiers] of shortcuts) {
        check(label + ': control has focus before ' + name,
          !!doc.activeElement?.isSameNode(element), {
            activeElement: doc.activeElement?.className, expected: element.className,
          });
        if (editable) {
          const caret = name === 'Backspace' ? element.value.length : 0;
          element.setSelectionRange(caret, caret);
        }
        const beforeText = editable ? element.value : null;
        let received;
        const observe = event => {
          if (event.key === name) received = {
            trusted: event.isTrusted, target: event.target?.isSameNode(element),
            shift: event.shiftKey, accelerator: mac ? event.metaKey : event.ctrlKey,
            targetClass: event.target?.className, activeElement: doc.activeElement?.className,
          };
        };
        win.addEventListener('keydown', observe, true);
        try { await key(win, name, modifiers); }
        finally { win.removeEventListener('keydown', observe, true); }
        check(label + ': ' + name + ' reaches the focused control as trusted input',
          received?.trusted && received.target &&
          received.shift === modifiers.includes('Shift') &&
          received.accelerator === modifiers.includes(mac ? 'Meta' : 'Control'), received);
        check(label + ': ' + name + ' preserves native annotations',
          JSON.stringify(inner._state.annotations) === annotations);
        if (editable && ['Delete', 'Backspace'].includes(name)) {
          check(label + ': ' + name + ' edits only the unsaved draft', element.value.length === beforeText.length - 1);
        } else if (editable && name === 'ArrowRight') {
          check(label + ': Shift+Arrow selects draft text', element.selectionEnd > element.selectionStart);
        }
      }
    }

    async function runSelection(label, line = 25) {
      await mark(label);
      await pointerTool();
      await dragText(label, line);
      const before = inner._state.primaryViewSelectionPopup.annotation.text;
      win.focus();
      await key(win, 'ArrowRight', ['Shift']);
      const after = inner._state.primaryViewSelectionPopup?.annotation?.text;
      check(label + ': trusted keyboard extends selected PDF text', !!after && after !== before, diagnostics());
      await dismissSelection();
    }

    async function runCore(label) {
      await mark(label);
      await waitFor('PDF viewport has finished mounting', () => win.innerWidth > 500 && win.innerHeight > 500);
      await sleep(800);
      pdf.currentScaleValue = '0.85';
      await sleep(500);
      await waitFor('PDF characters ready for native interaction', () => view._pdfPages?.[0]?.chars?.length);
      await pointerTool();
      const originalIDs = new Set(inner._state.annotations.map(a => a.id));
      await dragText(label + ' pointer', 6);
      const selectionBefore = inner._state.primaryViewSelectionPopup.annotation.text;
      win.focus();
      await key(win, 'ArrowRight', ['Shift']);
      check(label + ': keyboard extends the PDF text selection', inner._state.primaryViewSelectionPopup?.annotation?.text !== selectionBefore, diagnostics());
      const colorButton = outerDoc.querySelectorAll('.selection-popup .color-button')[1];
      await click(colorButton);
      const highlighted = await waitFor(label + ' highlight creation', () => inner._state.annotations.find(a => !originalIDs.has(a.id) && a.type === 'highlight'));
      check(label + ': popup color creates a native highlight', highlighted.color === '#ff6666' && highlighted.text.includes('LEFT'));
      await dismissSelection();
      await annotationAt(highlighted, label);
      const annotationPopup = await waitFor(label + ' annotation popup', () => outerDoc.querySelector('.annotation-popup .comment .content'));
      check(label + ': clicking a highlight opens its native comment popup', annotationPopup.isContentEditable);
      const comment = label + ': native popup comment';
      await typeText(annotationPopup, comment);
      await waitFor(label + ' native comment input', () => inner._state.annotations.find(a => a.id === highlighted.id)?.comment === comment);
      check(label + ': native popup comment editing works', true);
      await dismissSelection();
      await removeAnnotation(inner._state.annotations.find(a => a.id === highlighted.id), label);
      check(label + ': Delete removes the selected native highlight', true);
      await key(win, 'z', [mac ? 'Meta' : 'Control']);
      const restored = await waitFor(label + ' undo restores deleted highlight', () => inner._state.annotations.find(a => !originalIDs.has(a.id) && a.comment === comment));
      check(label + ': native Undo restores the highlight and comment', restored.type === 'highlight');
      await key(win, 'z', [mac ? 'Meta' : 'Control', 'Shift']);
      await waitFor(label + ' redo deletes restored highlight', () => !inner._state.annotations.some(a => a.comment === comment));
      check(label + ': native Redo repeats deletion', true);
      await click(outerDoc.querySelector('.toolbar .highlight'));
      await waitFor('native highlight tool', () => inner._state.tool.type === 'highlight');
      await dragText(label + ' highlight tool', 8, false);
      const directHighlight = await waitFor(label + ' direct highlight creation', () => inner._state.annotations.find(a => !originalIDs.has(a.id) && a.type === 'highlight'));
      check(label + ': native highlight toolbar creates a highlight', directHighlight.text.includes('LEFT'));
      await removeAnnotation(directHighlight, label);
      await click(outerDoc.querySelector('.toolbar .underline'));
      await waitFor('native underline tool', () => inner._state.tool.type === 'underline');
      await dragText(label + ' underline tool', 10, false);
      const underlined = await waitFor(label + ' underline creation', () => inner._state.annotations.find(a => !originalIDs.has(a.id) && a.type === 'underline'));
      check(label + ': native underline tool creates an underline', underlined.text.includes('LEFT'));
      await removeAnnotation(underlined, label);
      const beforeZoom = pdf.currentScale;
      await click(outerDoc.querySelector('#zoomIn'));
      await waitFor('native zoom increase', () => pdf.currentScale > beforeZoom);
      check(label + ': native Zoom In button changes PDF scale', true);
      await click(outerDoc.querySelector('#zoomOut'));
      await waitFor('native zoom decrease', () => pdf.currentScale < beforeZoom * 1.2);
      await click(outerDoc.querySelector('#next'));
      await waitFor('native next-page navigation', () => pdf.currentPageNumber === 2);
      await click(outerDoc.querySelector('#previous'));
      await waitFor('native previous-page navigation', () => pdf.currentPageNumber === 1);
      check(label + ': native page navigation works in both directions', true);
      await key(outer, 'f', [mac ? 'Meta' : 'Control']);
      const find = await waitFor('native find input', () => outerDoc.querySelector('.find-popup input'));
      await typeText(find, label.includes('without') ? 'synthetic' : 'research');
      try {
        await waitFor(label + ' find results', () => inner._state.primaryViewFindState?.result?.total > 0);
      } catch (_) {
        check(label + ': native search finds PDF text', false, { value: find.value, state: inner._state.primaryViewFindState, active: outerDoc.activeElement?.className });
      }
      check(label + ': native search finds PDF text', true);
      await click(outerDoc.querySelector('.find-popup .close'));
      await pointerTool();
      // Native copy conversion is tested without touching the shared OS clipboard.
      await dragText(label + ' copy selection', 6);
      const xwin = Components.utils.unwaiveXrays(win);
      const copied = new xwin.DataTransfer();
      const copyEvent = new xwin.ClipboardEvent('copy', { clipboardData: copied, bubbles: true, cancelable: true });
      view._handleCopy(copyEvent);
      check(label + ': native copy handler exports selected PDF text', copyEvent.defaultPrevented && copyEvent.clipboardData.getData('text/plain').includes('LEFT'), { prevented: copyEvent.defaultPrevented, text: copyEvent.clipboardData.getData('text/plain'), types: [...copyEvent.clipboardData.types] });

      check(label + ': native tests preserve pre-existing annotations',
        originalIDs.size === inner._state.annotations.length && inner._state.annotations.every(a => originalIDs.has(a.id)));
      await dismissSelection();
    }

    async function runFocusTransitions({ card, id, toggle }) {
      await mark('native pointer selection after margin interactions');
      await pointerTool();
      const annotation = inner._state.annotations.find(item => item.id === id);
      await annotationAt(annotation, 'before margin keyboard protection');
      const comment = card(id).querySelector('.mn-comment');
      await click(comment);
      await protectedKeys(comment, 'focused margin comment');
      // Selecting the existing highlight opened Zotero's outer comment popup.
      // Use an unobstructed line lower on the page for the next PDF gesture.
      await dragText('after margin comment focus', 18);
      await dismissSelection();
      await annotationAt(annotation, 'before margin editor keyboard protection');
      await click(card(id).querySelector('.mn-edit'));
      const editor = await waitFor('margin editor for native regression', () => {
        const element = card(id)?.querySelector('textarea');
        return element && !element.closest('.mn-editor').hidden && element;
      });
      await typeText(editor, 'UNSAVED scratch for trusted keyboard protection');
      await protectedKeys(editor, 'focused margin textarea', true);
      const beforeHighlight = new Set(inner._state.annotations.map(item => item.id));
      await dragText('after margin editor focus', 18);
      await click(outerDoc.querySelector('.selection-popup .color-button'));
      const highlight = await waitFor('highlight after margin editor interaction', () =>
        inner._state.annotations.find(item => !beforeHighlight.has(item.id) && item.type === 'highlight'));
      check('native highlighting works after typing in a margin editor', highlight.text.includes('LEFT'));
      await removeAnnotation(highlight, 'after margin editor interaction');
      await dismissSelection();
      await click(card(id).querySelector('.mn-cancel'));
      check('cancelling keyboard scratch preserves the original native comment',
        inner._state.annotations.find(item => item.id === id)?.comment === annotation.comment);
      await click(toggle);
      await dragText('margin notes toggled off', 6);
      await dismissSelection();
      await click(toggle);
      await waitFor('margin card after toggle', () => card(id));
      await click(card(id).querySelector('.mn-open'));
      // Native Open shows the sidebar; close it through its toolbar control before re-testing.
      if (inner._state.sidebarOpen) await click(outerDoc.querySelector('#sidebarToggle'));
      await dragText('after native Open from margin and toggle on', 6);
      await dismissSelection();
    }

    return { runCore, runFocusTransitions, runSelection, dragText, diagnostics };
  }

  root.NativeRegression = { create };
})(this);
