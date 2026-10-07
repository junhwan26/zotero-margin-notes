"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../src/i18n.js"), "utf8");

function load(locale) {
  const sandbox = { Zotero: { locale } };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.MarginNotesI18n.create();
}

test("English is the default locale", () => {
  const i18n = load("fr-FR");
  assert.equal(i18n.language, "en");
  assert.equal(i18n.t("toggle"), "Margin Notes");
  assert.equal(i18n.t("overflow", { count: 2, plural: "s" }), "2 more comments");
});

test("Korean locale is selected from Zotero locale", () => {
  const i18n = load("ko-KR");
  assert.equal(i18n.language, "ko");
  assert.equal(i18n.t("toggle"), "여백 노트");
  assert.equal(i18n.t("overflow", { count: 2, plural: "s" }), "코멘트 2개 더 보기");
});
