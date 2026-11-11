const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parse, render } = require('../src/markdown.js');
const root = path.resolve(__dirname, '..');
const MATHML = 'http://www.w3.org/1998/Math/MathML';

// Load KaTeX the way bootstrap.js does: into a holder that is also `self`.
function mathScope(withKatex = true) {
  const sandbox = { MarginNotesVendor: {} };
  vm.createContext(sandbox);
  if (withKatex) {
    const holder = sandbox.MarginNotesVendor;
    holder.self = holder;
    vm.compileFunction(fs.readFileSync(path.join(root, 'vendor/katex.min.js'), 'utf8'), ['self'], { parsingContext: sandbox })
      .call(holder, holder);
  }
  vm.runInContext(fs.readFileSync(path.join(root, 'src/math.js'), 'utf8'), sandbox);
  return sandbox;
}

const inlineNodes = (source, options) => parse(source, options)[0].children;

test('formula syntax is parsed only when the host asks for it', () => {
  assert.deepEqual(inlineNodes('energy $E=mc^2$ here'), [{ type: 'text', value: 'energy $E=mc^2$ here' }]);
  const nodes = inlineNodes('energy $E=mc^2$ here', { math: true });
  assert.deepEqual(nodes[1], { type: 'math', value: 'E=mc^2', display: false, source: '$E=mc^2$' });
  // A later parse without the option must not inherit the earlier mode.
  assert.equal(inlineNodes('$x$').length, 1);
});

test('prices, escaped dollars, and code are never mistaken for formulas', () => {
  for (const source of ['costs $5 or $10 today', 'a $ b $ c', 'escaped \\$x\\$ stays', 'only one $x here', '$ x$', '$x $y']) {
    assert.ok(inlineNodes(source, { math: true }).every(node => node.type !== 'math'), source);
  }
  assert.deepEqual(inlineNodes('`$x$`', { math: true }), [{ type: 'code', value: '$x$' }]);
  assert.equal(inlineNodes('$a_1$ and $b_2$', { math: true }).filter(node => node.type === 'math').length, 2);
});

test('display formulas may span lines and keep TeX backslashes', () => {
  const [node] = inlineNodes('$$\n\\frac{a}{b} \\$\n$$', { math: true });
  assert.deepEqual(node, { type: 'math', value: '\\frac{a}{b} \\$', display: true, source: '$$\n\\frac{a}{b} \\$\n$$' });
  assert.ok(inlineNodes('$$ $$', { math: true }).every(item => item.type !== 'math'));
});

test('a formula the renderer rejects is shown as its exact source', () => {
  class Node {
    constructor(tagName, value) { this.tagName = tagName; this.value = value; this.childNodes = []; }
    appendChild(node) { this.childNodes.push(node); return node; }
    setAttribute() {}
    set textContent(value) { this.childNodes = [new Node('#text', String(value))]; }
    get textContent() { return this.tagName === '#text' ? this.value : this.childNodes.map(node => node.textContent).join(''); }
  }
  const doc = { createElement: tag => new Node(tag), createTextNode: value => new Node('#text', value),
    createDocumentFragment: () => new Node('#fragment') };
  const calls = [];
  const rendered = new Node('math');
  const result = render(doc, 'ok $x^2$ bad $\\oops{$', {
    renderMath: (value, display) => { calls.push([value, display]); return value === 'x^2' ? rendered : null; },
  });
  const paragraph = result.childNodes[0];
  assert.deepEqual(calls, [['x^2', false], ['\\oops{', false]]);
  assert.equal(paragraph.childNodes[1], rendered);
  assert.equal(paragraph.childNodes[3].tagName, 'code');
  assert.equal(paragraph.childNodes[3].className, 'mn-math-source');
  assert.equal(paragraph.childNodes[3].textContent, '$\\oops{$');
});

test('bundled KaTeX loads into the vendor holder and emits MathML only', () => {
  const { MarginNotesMath, MarginNotesVendor } = mathScope();
  assert.equal(MarginNotesMath.available(), true);
  assert.equal(typeof MarginNotesVendor.katex.renderToString, 'function');
  const inline = MarginNotesMath.markup('\\frac{a}{b}', false);
  assert.match(inline, /<math xmlns="http:\/\/www\.w3\.org\/1998\/Math\/MathML"/);
  assert.match(inline, /<mfrac>/);
  assert.doesNotMatch(inline, /katex-html|style=/, 'HTML output would need KaTeX fonts and CSS');
  assert.match(MarginNotesMath.markup('x', true), /display="block"/);
  for (const invalid of ['\\oops{', '', '   ', 'x'.repeat(2001), null]) assert.equal(MarginNotesMath.markup(invalid, false), null);
  // KaTeX refuses untrusted commands: no link attribute is ever produced.
  assert.doesNotMatch(MarginNotesMath.markup('\\href{javascript:alert(1)}{x}', false) || '', /href=|<a\b/);
});

test('missing KaTeX leaves formulas as text instead of failing', () => {
  const { MarginNotesMath } = mathScope(false);
  assert.equal(MarginNotesMath.available(), false);
  assert.equal(MarginNotesMath.markup('x^2', false), null);
});

test('formula nodes are rebuilt from allowlisted MathML, dropping everything else', () => {
  const { MarginNotesMath } = mathScope();
  const node = (localName, attributes = {}, childNodes = [], namespaceURI = MATHML) => ({ nodeType: 1, localName, namespaceURI,
    attributes: Object.entries(attributes).map(([name, value]) => ({ name, value })), childNodes });
  const text = nodeValue => ({ nodeType: 3, nodeValue });
  const parsedMath = node('math', { display: 'block', onclick: 'steal()' }, [
    node('semantics', {}, [
      node('mi', { mathvariant: 'normal', href: 'javascript:alert(1)', style: 'position:fixed' }, [text('x')]),
      node('script', {}, [text('alert(1)')], 'http://www.w3.org/1999/xhtml'),
      node('annotation', { encoding: 'application/x-tex' }, [text('x')]),
    ]),
  ]);
  class Built {
    constructor(namespace, name) { this.namespace = namespace; this.name = name; this.attributes = {}; this.children = []; }
    setAttribute(name, value) { this.attributes[name] = value; }
    appendChild(child) { this.children.push(child); return child; }
  }
  const doc = {
    createElementNS: (namespace, name) => new Built(namespace, name),
    createTextNode: value => ({ text: value }),
    defaultView: { DOMParser: class { parseFromString() { return { querySelector: () => parsedMath }; } } },
  };
  const built = MarginNotesMath.render(doc, 'x', true);
  assert.equal(built.namespace, MATHML);
  assert.deepEqual(built.attributes, { display: 'block', class: 'mn-math mn-math-display' });
  const semantics = built.children[0];
  assert.deepEqual(semantics.children.map(child => child.name), ['mi']);
  assert.deepEqual(semantics.children[0].attributes, { mathvariant: 'normal' });
  assert.deepEqual(semantics.children[0].children, [{ text: 'x' }]);
});
