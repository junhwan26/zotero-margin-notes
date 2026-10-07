# Zotero 여백 노트

[English](README.md)

Zotero 여백 노트는 PDF 하이라이트와 밑줄 코멘트를 논문 바깥 여백에 카드처럼 보여 주는 Zotero 9 플러그인입니다. 두 단 논문에서도 하이라이트 위치와 여백 혼잡도를 보고 왼쪽 또는 오른쪽에 자동 배치합니다.

## 기능

- 코멘트가 있는 하이라이트와 밑줄을 PDF 바깥 여백에 표시합니다.
- 왼쪽/오른쪽 배치를 하이라이트 좌표, 여백 너비, 기존 카드와의 충돌 가능성으로 계산합니다.
- 여백 카드에서 일반 텍스트 코멘트를 바로 수정하고 저장/취소할 수 있습니다.
- 서식 있는 코멘트는 서식 손실을 막기 위해 Zotero의 원래 편집기로 엽니다.
- Zotero 언어가 한국어이면 UI가 한국어로 표시되고, 그 외에는 영어가 기본입니다.
- 외부 서비스나 런타임 의존성이 없습니다.

## 설치

1. [최신 GitHub 릴리스](https://github.com/junhwan26/zotero-margin-notes/releases/latest)에서 `zotero-margin-notes-0.2.0.xpi`를 내려받습니다.
2. Zotero에서 **Tools → Plugins**를 엽니다.
3. 톱니바퀴 메뉴에서 **Install Plugin From File...**을 선택하고 XPI를 고릅니다.
4. PDF를 열고 상단 도구막대의 **Margin Notes** 또는 **여백 노트** 버튼으로 켜고 끕니다.

`v0.1.0`은 업데이트 주소가 임시 값이어서 `v0.2.0`으로 한 번은 수동 설치해야 합니다. 이후 버전은 `updates.json`을 통해 GitHub 릴리스에서 업데이트를 받을 수 있습니다.

## 사용

코멘트가 있는 하이라이트를 만들면 여백 카드가 나타납니다. 카드의 **Edit/수정**을 누르면 일반 텍스트 코멘트를 바로 바꿀 수 있고, **Save/저장**은 Zotero annotation에 저장합니다. 코멘트를 비워 저장하면 해당 하이라이트는 더 이상 여백에 표시되지 않습니다.

서식 있는 코멘트는 여백에서 직접 편집하지 않고 Zotero의 기본 코멘트 편집기를 엽니다. 이 방식은 굵게, 기울임, 위첨자 같은 서식을 일반 텍스트로 잃지 않기 위한 선택입니다.

## 호환성과 한계

- Zotero `9.0`부터 `9.0.*`까지를 대상으로 합니다. 실제 검증 기준은 Zotero `9.0.6`입니다.
- PDF 리더에만 적용됩니다. EPUB와 웹 스냅샷에는 적용하지 않습니다.
- Zotero의 공개 toolbar 이벤트와 PDF 리더 내부 annotation/viewport API를 함께 사용합니다. Zotero 내부 API가 바뀌면 수정이 필요할 수 있습니다.

## 개발

Node.js와 Python 3만 필요합니다.

```sh
npm test
npm run check
npm run build
```

실제 Zotero smoke test는 별도 임시 프로필과 합성 PDF를 사용합니다.

```sh
python3 scripts/runtime-smoke.py
```
