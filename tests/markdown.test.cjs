"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { parse, render, safeURL, hasRichText } = require("../src/markdown.js");

// The renderer only needs text nodes and allowed element creation. This stub
// deliberately rejects HTML sinks, so tests exercise that boundary directly.
class Node {
  constructor(tagName, value) {
    this.tagName = tagName;
    this.value = value;
    this.childNodes = [];
    this.attributes = {};
  }
  appendChild(node) { this.childNodes.push(node); return node; }
  setAttribute(name, value) { this.attributes[name] = value; }
  set textContent(value) { this.childNodes = [new Node("#text", String(value))]; }
  get textContent() { return this.tagName === "#text" ? this.value : this.childNodes.map(node => node.textContent).join(""); }
  set innerHTML(value) { throw new Error("Untrusted HTML must never enter the live DOM: " + value); }
}
const doc = {
  createElement: tagName => new Node(tagName),
  createTextNode: value => new Node("#text", value),
  createDocumentFragment: () => new Node("#fragment"),
};
function all(node, tagName) {
  return (node.tagName === tagName ? [node] : []).concat(node.childNodes.flatMap(child => all(child, tagName)));
}
function formatted(source) { return render(doc, source); }

test("headings, paragraphs and readable line breaks retain Korean text", () => {
  const result = formatted("# 제목\n\n첫 번째 줄\n둘째 줄\n\n## 작은 제목 ##\n\nSetext\n======");
  assert.equal(all(result, "h1").length, 2);
  assert.equal(all(result, "h2")[0].textContent, "작은 제목");
  assert.equal(all(result, "p")[0].textContent, "첫 번째 줄둘째 줄");
  assert.equal(all(result, "br").length, 1);
});

test("emphasis supports combined and nested delimiters without modifying words", () => {
  const result = formatted("**굵게 *기울임***, *기울임 **굵게***, ***둘 다***, ~~취소~~, snake_case_value");
  assert.deepEqual(all(result, "strong").map(node => node.textContent), ["굵게 기울임", "굵게", "둘 다"]);
  assert.deepEqual(all(result, "em").map(node => node.textContent), ["기울임", "기울임 굵게", "둘 다"]);
  assert.equal(all(result, "del")[0].textContent, "취소");
  assert.match(result.textContent, /snake_case_value/);
});

test("ordered, nested and task lists keep semantic structure", () => {
  const result = formatted("3. 첫째\n   - 하위 **강조**\n   - 둘째\n4. 다음\n\n- [ ] 확인 전\n- [x] 확인 완료");
  assert.equal(all(result, "ol")[0].attributes.start, "3");
  assert.equal(all(result, "ol")[0].childNodes.length, 2);
  assert.equal(all(all(result, "ol")[0], "ul").length, 1);
  assert.equal(all(result, "strong")[0].textContent, "강조");
  assert.deepEqual(all(result, "span").map(node => node.textContent), ["☐ ", "☑ "]);
  assert.equal(all(result, "input").length, 0, "tasks never add interactive controls to the PDF");
});

test("blockquotes, thematic rules and indented code render as blocks", () => {
  const result = formatted("> 인용 **강조**\n>\n> - 목록\n\n---\n\n    <b>literal</b>\n    **code**");
  assert.equal(all(result, "blockquote").length, 1);
  assert.equal(all(result, "hr").length, 1);
  assert.equal(all(result, "pre")[0].textContent, "<b>literal</b>\n**code**");
  assert.equal(all(result, "b").length, 0);
  assert.equal(all(result, "strong").length, 1);
});

test("inline and fenced code preserve HTML, Markdown and indentation literally", () => {
  const source = "Use `<b>**literal**</b>` and ``a `tick` b``.\n\n```html\n  <script>alert(1)</script>\n**not bold** & <i>text</i>\n```";
  const result = formatted(source);
  assert.equal(all(result, "code")[0].textContent, "<b>**literal**</b>");
  assert.equal(all(result, "code")[1].textContent, "a `tick` b");
  assert.equal(all(result, "pre")[0].textContent, "  <script>alert(1)</script>\n**not bold** & <i>text</i>");
  assert.equal(all(result, "code")[2].className, "language-html");
  assert.equal(all(result, "script").length, 0);
  assert.equal(all(result, "strong").length, 0);
  assert.equal(hasRichText(source), false);
});

test("fences require a matching marker and preserve unclosed code", () => {
  assert.equal(all(formatted("~~~~\n```\ntext\n~~~~"), "pre")[0].textContent, "```\ntext");
  assert.equal(all(formatted("```\nlast line"), "pre")[0].textContent, "last line");
  assert.equal(all(formatted("`````\n```\n`````"), "pre")[0].textContent, "```");
});

test("tables preserve cell emphasis, code pipes, alignment and missing cells", () => {
  const result = formatted("| Left | Center | Right |\n| :--- | :---: | ---: |\n| **A** | `a|b` | C |\n| D | E |");
  assert.equal(all(result, "table").length, 1);
  assert.deepEqual(all(result, "th").map(node => node.attributes.align), ["left", "center", "right"]);
  assert.equal(all(result, "strong")[0].textContent, "A");
  assert.equal(all(result, "code")[0].textContent, "a|b");
  assert.equal(all(result, "td").length, 6);
  assert.equal(all(result, "td")[5].textContent, "");
});

test("links allow deliberate external protocols and support nested emphasis and parentheses", () => {
  const result = formatted('[**reference**](https://example.org/a_(b) "Read it") and <https://example.org> and [mail](mailto:a@example.org)');
  const links = all(result, "a");
  assert.equal(links.length, 3);
  assert.equal(links[0].attributes.href, "https://example.org/a_(b)");
  assert.equal(links[0].attributes.title, "Read it");
  assert.equal(links[0].attributes.rel, "noopener noreferrer");
  assert.equal(all(links[0], "strong")[0].textContent, "reference");
  assert.equal(links[2].attributes.href, "mailto:a@example.org");
});

test("unsafe and obfuscated URL schemes never create anchors", () => {
  for (const destination of [
    "javascript:alert(1)", "data:text/html,payload", "file:///private/data", "chrome://zotero/content/", "resource://gre/",
    "zotero://open-pdf/library/items/KEY", "//example.org", "https:\\example.org", "https://", "https:///path",
    "jAvAsCrIpT:alert(1)", "java\tscript:alert(1)", "java\nscript:alert(1)", "&#106;avascript:alert(1)",
    "javascript&colon;alert(1)", "%6aavascript:alert(1)", "https://example.org/\u0000bad", "https://example.org/\u0085bad",
  ]) {
    assert.equal(safeURL(destination), null, destination);
    assert.equal(all(formatted(`[label](${destination})`), "a").length, 0, destination);
  }
  assert.equal(safeURL("HTTPS://example.org/path?q=1&x=2#part"), "HTTPS://example.org/path?q=1&x=2#part");
});

test("raw HTML and remote images remain inert visible text", () => {
  const source = '<script>alert(1)</script>\n<img src="https://tracker.invalid/pixel" onerror="alert(1)">\n![remote](https://tracker.invalid/pixel)\n<iframe src="https://example.org"></iframe>\n<b>native text</b>';
  const result = formatted(source);
  for (const tag of ["script", "img", "iframe", "b", "object", "style"]) assert.equal(all(result, tag).length, 0);
  assert.equal(all(result, "a").length, 0);
  assert.equal(result.textContent, source.replace(/\n/g, ""));
  assert.equal(hasRichText(source, true), true, "native rich-text detection does not require live HTML");
});

test("native rich-text detection excludes code and escaped tags", () => {
  assert.equal(hasRichText("**Markdown** with `<b>x</b>`"), false);
  assert.equal(hasRichText("```html\n<p><i>x</i></p>\n```"), false);
  assert.equal(hasRichText("\\<b>x\\</b>"), false);
  assert.equal(hasRichText("<b>x</b>", true), true);
  assert.equal(hasRichText("<i>x</i>", true), true);
  assert.equal(hasRichText("<sub>x</sub>", true), true);
  assert.equal(hasRichText("<sup>x</sup>", true), true);
  assert.equal(hasRichText("<p>x</p>"), true);
  assert.equal(hasRichText("<p>x</p>", true), false);
  assert.equal(hasRichText("<br>"), true);
  assert.equal(hasRichText("<script>x</script>"), false);
  assert.equal(hasRichText("| Code |\n| --- |\n| `<b>x</b>` |"), false);
});

test("Markdown escapes, malformed syntax and unsupported constructs retain readable content", () => {
  const source = "\\*literal\\* \\[link] \\`code\\` & < >\n[]() [missing](https://example.org [open **unclosed";
  const result = formatted(source);
  assert.equal(all(result, "a").length, 0);
  assert.equal(all(result, "strong").length, 0);
  assert.equal(all(result, "code").length, 0);
  assert.match(result.textContent, /\*literal\* \[link] `code` & < >/);
  assert.match(result.textContent, /\[open \*\*unclosed/);
  assert.deepEqual(parse(null), []);
  assert.deepEqual(parse(""), []);
});

test("rendering preserves its raw source and repeated renders are deterministic", () => {
  const source = "# 원문\r\n\r\n- **강조**\r\n  - `코드`\r\n";
  const before = source;
  assert.deepEqual(parse(source), parse(source));
  assert.equal(formatted(source).textContent, formatted(source).textContent);
  assert.equal(source, before);
});

test("oversized and delimiter-heavy comments finish with their text intact", { timeout: 2500 }, () => {
  for (const source of ["[".repeat(200000), "<".repeat(200000), "[a](<".repeat(30000), "*a ".repeat(66000)]) {
    assert.equal(formatted(source).textContent, source);
  }
  const oversized = "**" + "x".repeat(200000) + "**";
  assert.equal(formatted(oversized).textContent, oversized);
  assert.equal(all(formatted(oversized), "strong").length, 0, "very large notes use a bounded plain-text fallback");
});

test("loadSubScript exports onto its supplied target instead of another globalThis", () => {
  const target = { globalThis: {} };
  const script = fs.readFileSync(path.join(__dirname, "../src/markdown.js"), "utf8");
  vm.runInNewContext(script, target);
  assert.equal(typeof target.MarginNotesMarkdown.render, "function");
  assert.equal(typeof target.MarginNotesMarkdown.hasRichText, "function");
  assert.equal(target.globalThis.MarginNotesMarkdown, undefined);
});

test("legacy HTML conversion removes native tags while preserving literal HTML inside code", () => {
  const source = '<p><b>actual</b> &amp; prose</p>\nwith `<b>literal</b> &amp;`<br>\n\n```html\n<i>fenced</i> &amp;\n```\n\n<img src="https://tracker.invalid/pixel" onerror="alert(1)">';
  const decoded = [];
  const result = render(doc, source, {
    legacyHTML: true,
    decodeText: value => { decoded.push(value); return value.replace(/&amp;/g, "&"); },
  });
  assert.match(result.textContent, /^actual & prose/);
  assert.equal(all(result, "code")[0].textContent, "<b>literal</b> &amp;");
  assert.equal(all(result, "pre")[0].textContent, "<i>fenced</i> &amp;");
  assert.ok(all(result, "br").length >= 2, "native paragraph endings and br tags retain breaks");
  assert.match(result.textContent, /<img src="https:\/\/tracker.invalid\/pixel" onerror="alert\(1\)">/);
  assert.ok(decoded.includes(" &amp; prose"));
  assert.ok(decoded.every(value => !value.includes("<b>") && !value.includes("<i>") && !value.includes("<img")), "decoder receives only ordinary text nodes");
  for (const tag of ["b", "i", "img", "script"]) assert.equal(all(result, tag).length, 0);
  assert.match(formatted(source).textContent, /^<p><b>actual<\/b>/, "default rendering still preserves raw HTML literally");
});

test("legacy options recurse through quotes, lists and table cells without decoding code", () => {
  const decoded = [];
  const source = '> <i>quote &amp;</i>\n\n- <sup>list &amp;</sup>\n\n| Native | Code |\n| --- | --- |\n| <sub>cell &amp;</sub> | `<b>&amp;</b>` |';
  const result = render(doc, source, {
    legacyHTML: true,
    decodeText: value => { decoded.push(value); return value.replace(/&amp;/g, "&"); },
  });
  assert.equal(all(result, "blockquote")[0].textContent, "quote &");
  assert.equal(all(result, "li")[0].textContent, "list &");
  assert.equal(all(result, "td")[0].textContent, "cell &");
  assert.equal(all(result, "code")[0].textContent, "<b>&amp;</b>");
  assert.ok(!decoded.includes("<b>&amp;</b>"));
});

test("oversized rich comments conservatively retain native rich-text editing", () => {
  assert.equal(hasRichText("<b>" + "x".repeat(200000) + "</b>", true), true);
  assert.equal(hasRichText("<p>" + "x".repeat(200000) + "</p>"), true);
  assert.equal(hasRichText("<p>" + "x".repeat(200000) + "</p>", true), false);
  assert.equal(hasRichText("`<i>" + "x".repeat(200000) + "</i>`", true), true, "bounded fallback favors preserving native editing");
  assert.equal(hasRichText("x".repeat(200001)), false);
});
