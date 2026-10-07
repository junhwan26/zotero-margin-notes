/* global Zotero, Services */
(function (root) {
  'use strict';

  const EN = {
    layerLabel: 'Highlight margin notes',
    openTitle: 'Open this highlight and comment in Zotero',
    editTitle: 'Edit this comment in the margin note',
    editRichTitle: 'Open rich-text comments in Zotero to preserve formatting',
    commentLabel: 'Highlight comment',
    editorLabel: 'Edit highlight comment',
    commentHeading: 'Comment',
    pageComment: 'p. {page} · Comment',
    openLabel: 'p. {page} · Comment ↗',
    save: 'Save',
    saving: 'Saving...',
    cancel: 'Cancel',
    edit: 'Edit',
    open: 'Open',
    more: '{count} more comments',
    overflow: '{count} more comments',
    moreHeading: 'More comments',
    trayLabel: 'More comments',
    trayHeading: 'More comments',
    close: 'Close',
    readOnly: 'Read-only',
    changed: 'This comment changed in Zotero. Reopen edit mode before saving.',
    missing: 'This annotation is no longer available.',
    richComment: 'Rich text: open in Zotero',
    rich: 'Rich text: open in Zotero',
    emptyComment: 'Empty comments are hidden after saving.',
    saveError: 'Could not save',
    saveFailed: 'Could not save',
    toolbarToggle: 'Margin Notes',
    toggle: 'Margin Notes',
    toolbarToggleTitle: 'Show highlight comments in the outer PDF margins',
    toggleTitle: 'Show highlight comments in the outer PDF margins',
    toolbarFit: 'Fit Notes',
    fit: 'Fit Notes',
    toolbarFitTitle: 'Adjust PDF zoom to make room for margin notes',
    fitTitle: 'Adjust PDF zoom to make room for margin notes',
    preparing: 'Preparing PDF',
    noSpace: 'No margin ({count})',
    noSpaceTitle: 'Use Fit Notes, zoom out, or widen the window. Comments remain in Zotero.',
  };

  const KO = {
    layerLabel: '하이라이트 여백 노트',
    openTitle: 'Zotero에서 이 하이라이트와 코멘트 열기',
    editTitle: '여백 노트에서 이 코멘트 수정',
    editRichTitle: '서식을 보존하려면 Zotero에서 코멘트 열기',
    commentLabel: '하이라이트 코멘트',
    editorLabel: '하이라이트 코멘트 수정',
    commentHeading: '코멘트',
    pageComment: 'p. {page} · 코멘트',
    openLabel: 'p. {page} · 코멘트 ↗',
    save: '저장',
    saving: '저장 중...',
    cancel: '취소',
    edit: '수정',
    open: '열기',
    more: '코멘트 {count}개 더 보기',
    overflow: '코멘트 {count}개 더 보기',
    moreHeading: '추가 코멘트',
    trayLabel: '추가 코멘트',
    trayHeading: '추가 코멘트',
    close: '닫기',
    readOnly: '읽기 전용',
    changed: 'Zotero에서 이 코멘트가 바뀌었습니다. 다시 수정 모드를 열고 저장하세요.',
    missing: '이 주석을 더 이상 찾을 수 없습니다.',
    richComment: '서식 있음: Zotero에서 열기',
    rich: '서식 있음: Zotero에서 열기',
    emptyComment: '빈 코멘트는 저장 후 숨겨집니다.',
    saveError: '저장 실패',
    saveFailed: '저장 실패',
    toolbarToggle: '여백 노트',
    toggle: '여백 노트',
    toolbarToggleTitle: '하이라이트 코멘트를 논문 바깥 여백에 표시',
    toggleTitle: '하이라이트 코멘트를 논문 바깥 여백에 표시',
    toolbarFit: '노트에 맞춤',
    fit: '노트에 맞춤',
    toolbarFitTitle: '노트 공간이 생기도록 PDF 배율 조정',
    fitTitle: '노트 공간이 생기도록 PDF 배율 조정',
    preparing: 'PDF 준비 중',
    noSpace: '여백 부족 ({count})',
    noSpaceTitle: '노트에 맞춤을 누르거나 PDF를 축소하거나 창을 넓히세요. 코멘트는 Zotero에 그대로 있습니다.',
  };

  function locale() {
    return String(root.Zotero?.locale || root.Services?.locale?.appLocaleAsBCP47 ||
      root.navigator?.language || 'en-US');
  }

  function t(key, values = {}) {
    return translate(/^ko\b/i.test(locale()) ? KO : EN, key, values);
  }

  function translate(dictionary, key, values = {}) {
    return (dictionary[key] || EN[key] || key).replace(/\{(\w+)\}/g, (_, name) =>
      values[name] === undefined ? '' : String(values[name]));
  }

  function create() {
    const language = /^ko\b/i.test(locale()) ? 'ko' : 'en';
    const dictionary = language === 'ko' ? KO : EN;
    return { language, t: (key, values = {}) => translate(dictionary, key, values) };
  }

  root.MarginNotesI18n = { t, locale, create, strings: { en: EN, ko: KO } };
})(this);
