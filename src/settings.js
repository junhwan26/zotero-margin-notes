/* global Zotero */
(function (root) {
  'use strict';

  const PREFIX = 'extensions.margin-notes.';
  const choice = (...allowed) => value => allowed.includes(value) ? value : allowed[0];
  const flag = fallback => value => typeof value === 'boolean' ? value : fallback;
  const range = (fallback, minimum, maximum) => value => {
    const number = Number(value);
    return Number.isFinite(number) && number >= minimum && number <= maximum ? Math.round(number) : fallback;
  };
  // Each entry normalizes whatever the preference store returns, so a missing,
  // hand-edited, or out-of-range preference can never reach the layout.
  const SCHEMA = {
    enabled: flag(true),
    fontSize: range(13, 11, 18),
    // 0 keeps the 0.4.1 behavior: cards use the whole free outer margin.
    maxWidth: value => Number(value) === 0 ? 0 : range(0, 160, 520)(value),
    side: choice('auto', 'left', 'right'),
    surface: choice('paper', 'auto', 'dark'),
    quote: flag(true),
    connectors: flag(true),
    expand: flag(false),
    math: flag(true),
    addOnSelect: flag(true),
    hideNativePopup: flag(true),
    shortcut: flag(true),
  };

  function create() {
    const prefs = root.Zotero.Prefs;
    const observers = [];
    return {
      get(key) {
        let value;
        try { value = prefs.get(PREFIX + key, true); } catch (_) { value = undefined; }
        return SCHEMA[key](value);
      },
      all() {
        const values = {};
        for (const key of Object.keys(SCHEMA)) values[key] = this.get(key);
        return values;
      },
      set(key, value) { prefs.set(PREFIX + key, SCHEMA[key](value), true); },
      observe(callback) {
        if (typeof prefs.registerObserver !== 'function') return;
        for (const key of Object.keys(SCHEMA)) {
          observers.push(prefs.registerObserver(PREFIX + key, () => callback(key), true));
        }
      },
      stop() {
        for (const observer of observers.splice(0)) {
          try { prefs.unregisterObserver(observer); } catch (_) { /* already released */ }
        }
      },
    };
  }

  root.MarginNotesSettings = { PREFIX, keys: Object.keys(SCHEMA), create,
    normalize: (key, value) => SCHEMA[key](value) };
})(this);
