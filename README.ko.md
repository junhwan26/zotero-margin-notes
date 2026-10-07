<h1 align="center">Zotero 여백 노트</h1>

<p align="center">PDF 하이라이트 코멘트를 논문 바깥 여백에 띄우고, 두 단 논문에서는 왼쪽/오른쪽 위치를 자동으로 고릅니다.</p>

<p align="center">
  <a href="https://github.com/junhwan26/zotero-margin-notes/actions/workflows/ci.yml"><img alt="Check" src="https://github.com/junhwan26/zotero-margin-notes/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/junhwan26/zotero-margin-notes/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/junhwan26/zotero-margin-notes?label=release"></a>
  <img alt="Zotero 9.0.x" src="https://img.shields.io/badge/Zotero-9.0.x-CC2936">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.ko.md">한국어</a> ·
  <a href="https://github.com/junhwan26/zotero-margin-notes/releases/latest">Download</a> ·
  <a href="#빠른-시작">빠른 시작</a> ·
  <a href="#호환성">호환성</a>
</p>

![두 단 PDF 옆에 흰색 노트 카드를 배치하는 Margin Notes 개념도](docs/assets/overview.svg)

<p align="center"><sub>개념도입니다. 실제 UI는 Zotero PDF 리더 안에서 현재 PDF 화면 크기에 맞춰 표시됩니다.</sub></p>

## 왜 쓰나

| 기능 | 설명 |
| --- | --- |
| 여백 노트 카드 | PDF 하이라이트나 밑줄의 코멘트를 페이지 바깥 흰색 카드로 보여 줍니다. |
| 두 단 배치 | 주석 좌표, 남은 여백, 주변 카드 혼잡도를 보고 왼쪽 또는 오른쪽 바깥 여백을 고릅니다. |
| Zotero 편집 보존 | 일반 텍스트는 더블클릭으로 바로 수정하고, 서식 있는 코멘트는 Zotero 기본 편집기로 열어 서식을 보존합니다. |
| 기존 리더 동작 보존 | 텍스트 선택, 선택 팝업, 주석 도구, 키보드 선택, 검색, 확대/축소, 페이지 이동, 삭제, 실행 취소/다시 실행, 사이드바 수정을 계속 사용할 수 있습니다. |

## 빠른 시작

1. [최신 릴리스](https://github.com/junhwan26/zotero-margin-notes/releases/latest)에서 `zotero-margin-notes-0.2.3.xpi`를 내려받습니다.
2. Zotero에서 **Tools -> Plugins**를 엽니다.
3. 톱니바퀴 메뉴에서 **Install Plugin From File...**을 누르고 XPI를 선택합니다.
4. PDF를 열고 하이라이트나 밑줄에 코멘트를 단 뒤, 리더 도구막대의 **Margin Notes** 또는 **여백 노트**를 사용합니다.

<details>
<summary>0.1.0에서 업그레이드</summary>

`0.1.0` 빌드는 업데이트 주소가 임시 값이었습니다. `0.2.0` 이상을 한 번 수동 설치하면 이후에는 이 저장소의 `updates.json` 릴리스 메타데이터를 사용할 수 있습니다.

</details>

## 조작법

| 동작 | 방법 |
| --- | --- |
| 여백 노트 켜기/끄기 | Zotero PDF 리더 도구막대에서 **Margin Notes** 또는 **여백 노트**를 누릅니다. |
| 노트 공간 만들기 | 창이 좁을 때 **Fit Notes** 또는 **노트에 맞춤**을 누릅니다. |
| 일반 텍스트 수정 | 여백 노트나 추가 코멘트 목록을 더블클릭합니다. |
| 키보드로 수정 | Tab으로 코멘트에 초점을 맞춘 뒤 **Enter** 또는 **F2**를 누릅니다. |
| 저장 또는 취소 | 인라인 편집기의 **Save/저장** 또는 **Cancel/취소**를 사용합니다. |
| 원래 주석 열기 | 노트 머리글의 페이지 링크를 누릅니다. |

빈 코멘트로 저장하면 해당 카드는 여백 보기에서 사라집니다. 이 플러그인은 코멘트가 있는 주석만 표시합니다. 활성 편집기 안에서 더블클릭하면 일반적인 단어 선택이 유지됩니다. 서식 있는 코멘트는 서식을 일반 텍스트로 잃지 않도록 Zotero 기본 편집기로 넘깁니다.

흰색 노트와 편집창은 밝은·어두운 PDF 테마 모두에서 읽을 수 있습니다. 코멘트는 Zotero 주석에 저장합니다. 기본 화면 언어는 영어이며, 한국어 Zotero에서는 한국어를 자동으로 선택합니다.

## 호환성

Margin Notes는 필수로 설치해야 하는 다른 Zotero 플러그인이 없고, npm 런타임 패키지 의존성도 없습니다. 대상은 Zotero `9.0`부터 `9.0.*`까지이며, Zotero `9.0.6`에서 실제 Zotero 자동 검사를 통과했습니다. PDF 전용 플러그인이므로 EPUB와 웹 스냅샷에는 적용되지 않습니다.

`0.2.3` 릴리스는 [실제 Zotero 검사 218개](https://github.com/junhwan26/zotero-margin-notes/actions/runs/37580613959)와 Node 테스트 23개를 통과했습니다. 실제 Zotero 검사는 Margin Notes 검사 도구만 설치한 독립 프로필에서 수행합니다. 검사에 포함된 기본 리더와 시작·종료 동작을 확인하며, 개별 플러그인의 전체 기능은 검사 범위에 포함하지 않습니다. 시작·종료 검사에는 가상의 다른 플러그인이 등록한 도구막대 이벤트 처리를 보존하는 항목도 들어 있습니다.

2026-10-07 개발자의 로컬 Zotero 설치 환경에서 관찰한 상태: Better BibTeX `9.0.70`, Translate for Zotero `2.4.8`, Ethereal Style `6.0.86`, Research Vault Bridge `0.2.0`이 Margin Notes `0.2.3`과 함께 활성화되어 있었습니다. ZotMoov `1.2.32`는 설치되어 있었지만 비활성화 상태였습니다. 이 플러그인들의 전체 기능을 사용하는 통합 검사는 수행하지 않았습니다.

의존성 확인, 검사 목록, 관찰한 플러그인 상태는 [호환성 검사 기록](docs/compatibility.ko.md)과 [0.2.3 공개 검사 요약](docs/evidence/compatibility-0.2.3.json)에서 확인할 수 있습니다.

## 지원

문제가 있으면 [GitHub issue](https://github.com/junhwan26/zotero-margin-notes/issues)에 Zotero 버전, 플러그인 버전, 운영체제, 재현 절차, 그리고 Margin Notes만 켰을 때도 같은 문제가 나는지 적어 주세요. Zotero 리더의 내부 동작은 버전에 따라 바뀔 수 있어서 정확한 버전 정보가 중요합니다.

## 참고한 문서

README 구성은 공개 Zotero 플러그인 문서인 [Zotero PDF Translate](https://github.com/windingwind/zotero-pdf-translate/blob/main/README.md), [Better Notes for Zotero](https://github.com/windingwind/zotero-better-notes/blob/master/README.md), [Zotero Style](https://github.com/MuiseDestiny/zotero-style/blob/master/README.md), [Better BibTeX](https://github.com/retorquere/zotero-better-bibtex/blob/master/README.md)를 참고했습니다. 이는 문서 구조 참고이며, 해당 프로젝트의 보증이나 호환성 주장으로 해석하면 안 됩니다.

<details>
<summary>개발</summary>

이 저장소에는 npm 런타임 의존성이 없습니다. 개발에는 Node.js 기반 단위·문법 검사와 Python 3 기반 재현 가능한 XPI 빌드를 사용합니다.

```sh
npm test
npm run check
npm run build
```

실제 Zotero 회귀 검사는 임시 프로필, 합성 PDF, Zotero 9.0.6을 사용합니다. CI는 공식 Zotero 릴리스 호스트에서 Zotero 9.0.6을 내려받고 DMG SHA-256을 확인한 뒤 검사 환경의 임시 폴더에 설치합니다. 실행 결과는 `dist/runtime-smoke-report.json` 결과 파일로 업로드됩니다.

</details>
