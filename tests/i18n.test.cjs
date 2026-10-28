"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../src/i18n.js"), "utf8");

function load(globals = {}) {
  const sandbox = { ...globals };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.MarginNotesI18n;
}

test("English is the default locale", () => {
  const i18n = load({ Zotero: { locale: "fr-FR" } }).create();
  assert.equal(i18n.language, "en");
  for (const [key, label] of Object.entries({
    toggle: "Margin Notes",
    fit: "Fit Notes",
    editorLabel: "Edit annotation comment",
    save: "Save",
    cancel: "Cancel",
    readOnly: "Read-only",
    missing: "This annotation is no longer available.",
    changed: "This comment changed in Zotero. Reopen edit mode before saving.",
    saveFailed: "Could not save",
  })) assert.equal(i18n.t(key), label, key);
});

test("Korean locale is selected from Zotero locale", () => {
  const i18n = load({ Zotero: { locale: "ko-KR" } }).create();
  assert.equal(i18n.language, "ko");
  for (const [key, label] of Object.entries({
    toggle: "여백 노트",
    fit: "노트에 맞춤",
    editorLabel: "주석 코멘트 수정",
    save: "저장",
    cancel: "취소",
    readOnly: "읽기 전용",
    missing: "이 주석을 더 이상 찾을 수 없습니다.",
    changed: "Zotero에서 이 코멘트가 바뀌었습니다. 다시 수정 모드를 열고 저장하세요.",
    saveFailed: "저장 실패",
  })) assert.equal(i18n.t(key), label, key);
});

test("locale selection prefers Zotero, then application, then browser language", () => {
  const cases = [
    [{ Zotero: { locale: "ko-KR" }, Services: { locale: { appLocaleAsBCP47: "en-US" } }, navigator: { language: "en-US" } }, "ko-KR", "ko"],
    [{ Zotero: { locale: "fr-FR" }, Services: { locale: { appLocaleAsBCP47: "ko-KR" } } }, "fr-FR", "en"],
    [{ Zotero: { locale: "" }, Services: { locale: { appLocaleAsBCP47: "ko-KR" } }, navigator: { language: "en-US" } }, "ko-KR", "ko"],
    [{ Services: { locale: { appLocaleAsBCP47: "en-US" } }, navigator: { language: "ko-KR" } }, "en-US", "en"],
    [{ Services: { locale: { appLocaleAsBCP47: "" } }, navigator: { language: "ko-KR" } }, "ko-KR", "ko"],
    [{ navigator: { language: "ko" } }, "ko", "ko"],
    [{}, "en-US", "en"],
  ];
  for (const [globals, locale, language] of cases) {
    const api = load(globals);
    assert.equal(api.locale(), locale);
    assert.equal(api.create().language, language);
  }
});

test("count placeholders preserve zero and remove missing values in both languages", () => {
  const english = load({ Zotero: { locale: "en-US" } }).create();
  const korean = load({ Zotero: { locale: "ko-KR" } }).create();
  assert.equal(english.t("overflow", { count: 2 }), "2 more comments");
  assert.equal(korean.t("overflow", { count: 2 }), "코멘트 2개 더 보기");
  assert.equal(english.t("noSpace", { count: 0 }), "No margin (0)");
  assert.equal(korean.t("noSpace", { count: 0 }), "여백 부족 (0)");
  assert.equal(english.t("openLabel"), "p.  · Comment ↗");
  assert.equal(korean.t("openLabel"), "p.  · 코멘트 ↗");
});

test("missing translations fall back to English and unknown keys remain readable", () => {
  const api = load({ Zotero: { locale: "ko-KR" } });
  delete api.strings.ko.readOnly;
  assert.equal(api.create().t("readOnly"), "Read-only");
  for (const locale of ["en-US", "ko-KR"]) {
    assert.equal(load({ Zotero: { locale } }).create().t("untranslatedLabel"), "untranslatedLabel");
  }
});

test("English and Korean dictionaries expose matching nonempty translations", () => {
  const { strings } = load();
  assert.deepEqual(Object.keys(strings.ko).sort(), Object.keys(strings.en).sort());
  for (const dictionary of Object.values(strings)) {
    for (const [key, value] of Object.entries(dictionary)) {
      assert.equal(typeof value, "string", key);
      assert.ok(value.trim(), key);
    }
  }
});
