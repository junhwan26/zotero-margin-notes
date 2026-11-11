const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function load(stored = {}, observable = true) {
  const prefs = new Map(Object.entries(stored).map(([key, value]) => ['extensions.margin-notes.' + key, value]));
  const observers = new Map();
  const Prefs = { get: key => prefs.get(key), set: (key, value) => prefs.set(key, value) };
  if (observable) {
    Prefs.registerObserver = (name, handler) => { const id = Symbol(name); observers.set(id, { name, handler }); return id; };
    Prefs.unregisterObserver = id => observers.delete(id);
  }
  const sandbox = { Zotero: { Prefs } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'src/settings.js'), 'utf8'), sandbox);
  return { api: sandbox.MarginNotesSettings, settings: sandbox.MarginNotesSettings.create(), prefs, observers };
}

test('unset preferences keep the 0.4 appearance and placement', () => {
  const { settings } = load();
  assert.deepEqual({ ...settings.all() }, { enabled: true, fontSize: 13, maxWidth: 0, side: 'auto',
    surface: 'paper', quote: true, connectors: true, expand: false, math: true, addOnSelect: true, shortcut: true });
});

test('hand-edited or out-of-range preferences fall back instead of reaching the layout', () => {
  const { settings } = load({ fontSize: 400, maxWidth: 12, side: 'top', surface: 7, quote: 'yes', enabled: false });
  assert.equal(settings.get('fontSize'), 13);
  assert.equal(settings.get('maxWidth'), 0);
  assert.equal(settings.get('side'), 'auto');
  assert.equal(settings.get('surface'), 'paper');
  assert.equal(settings.get('quote'), true);
  assert.equal(settings.get('enabled'), false);
  const valid = load({ fontSize: 15.4, maxWidth: 320, side: 'left', surface: 'auto' }).settings;
  assert.deepEqual([valid.get('fontSize'), valid.get('maxWidth'), valid.get('side'), valid.get('surface')],
    [15, 320, 'left', 'auto']);
});

test('default preference file declares exactly the settings the code reads', () => {
  const { api } = load();
  const declared = [...fs.readFileSync(path.join(root, 'prefs.js'), 'utf8')
    .matchAll(/^pref\("extensions\.margin-notes\.(\w+)", (.+)\);$/gm)];
  assert.deepEqual(declared.map(match => match[1]).sort(), [...api.keys].sort());
  for (const [, key, literal] of declared) assert.equal(api.normalize(key, JSON.parse(literal)), JSON.parse(literal), key);
  const pane = fs.readFileSync(path.join(root, 'prefs/preferences.xhtml'), 'utf8');
  const bound = [...pane.matchAll(/preference="extensions\.margin-notes\.(\w+)"/g)].map(match => match[1]);
  assert.deepEqual(bound.sort(), [...api.keys].sort(), 'Every setting has exactly one control in the settings pane');
});

test('settings pane strings exist in both shipped languages', () => {
  const pane = fs.readFileSync(path.join(root, 'prefs/preferences.xhtml'), 'utf8');
  const ids = [...pane.matchAll(/data-l10n-id="([\w-]+)"/g)].map(match => match[1]).sort();
  for (const locale of ['en-US', 'ko-KR']) {
    const messages = [...fs.readFileSync(path.join(root, `locale/${locale}/margin-notes.ftl`), 'utf8')
      .matchAll(/^([\w-]+) =/gm)].map(match => match[1]).sort();
    assert.deepEqual(messages, ids, locale);
  }
});

test('observers cover every setting and are all released on stop', () => {
  const { settings, observers, api } = load();
  const changed = [];
  settings.observe(key => changed.push(key));
  assert.equal(observers.size, api.keys.length);
  for (const { handler } of observers.values()) handler();
  assert.deepEqual(changed.sort(), [...api.keys].sort());
  settings.stop();
  assert.equal(observers.size, 0);
  const plain = load({}, false).settings;
  plain.observe(() => {});
  plain.stop();
});
