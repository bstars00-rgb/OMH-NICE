# 오마이나이스 (OMH-NICE) — 프로젝트 이관 문서 (OPS → CEO Office)

> **한 줄 요약**: 신규 B2B/TMC 파트너 거래 리스크를 표준 점수·등급으로 평가해 대표이사 승인 판단을 돕는 내부 웹 도구(백엔드 없는 정적 SPA). GitHub Pages로 배포 중.
> **점검일**: 2026-07-08 · **처음 보는 담당자도 이 문서만으로 이해하고 바로 이어서 작업할 수 있도록 작성함.**

---

## 1. 프로젝트명
- **오마이나이스 (OMH-NICE)** — 구 명칭 "OMH Partner Risk Gate"
- GitHub 저장소명: `OMH-NICE`

## 2. 프로젝트 목적
- 신규 파트너(B2B/TMC 등)가 급증하는 상황에서, **대표이사 최종 승인 전에 업체별 리스크를 표준화**하여 검토.
- 13개 리스크 항목 + 1개 담당자 코멘트 점수의 **가중점수**와 **레드플래그**로 `A 승인추천 / B 조건부 / C 추가확인 / D 보류 / E 거절추천`을 자동 산출.
- 목적은 공식 신용등급 부여가 아니라 **내부 의사결정 보조·표준화·속도 향상**.

## 3. 현재 진행 상태
- **운영 중(프로토타입 MVP, 공개 배포 완료)**. 라이브: https://bstars00-rgb.github.io/OMH-NICE/
- 실제 파트너 3곳(Huamao·Linkall·Wingpulse) + 자체 벤치마크(Ohmyhotel, A등급) 평가 데이터가 코드 시드에 반영됨.
- Happy Travel(구 C004)은 대표이사 컨펌·진행 확정으로 플랫폼에서 삭제(그래듀에이션).
- 최신 저장 키(시드 버전): `omh_prg_v8`.

## 4. 주요 기능
- **대시보드**: 요약 카드(전체/승인권 A·B/확인·보류 C·D/거절 E) + 업체별 리스크 요약표 + **서식 복사(HTML 표 + TSV)** 버튼.
- **업체 상세(7탭)**: 기본정보 · 거래조건(Deposit 커버율 자동계산) · 서류·공개정보(`Document/` 폴더 자료 링크) · 리스크 평가(슬라이더 14개, 담당자 코멘트 점수 포함) · 승인 요청서(자동 생성·인쇄/PDF·텍스트 복사) · 승인 이력.
- **설정**: 14개 항목 가중치 + 등급 임계값 조정.
- **자동 리스크 엔진**: 가중점수(가중치 합 기준 **100점 정규화**) + **레드플래그 오버라이드**.
  - 자동 D-보류: 사업자·실체 확인불가 / 부정뉴스 / 소송·미정산 / 무담보 Credit.
  - 자동 C-추가확인: 웹사이트 없음 / 대표자 확인불가 / **Deposit 부족(등급별 요구 커버율 미달)** / 정산주기 30일+.
  - **Deposit 요구는 신용도 기반**: 필요 Deposit = 2주 노출(월거래액×정산주기/30) × 등급별 요구커버율(`REQUIRED_COVERAGE` = A 0% · B 20% · C 50% · D·E 100%). 고신뢰 대형 파트너는 요구 Deposit이 낮음/0(오픈 크레딧). (구 버전의 "커버율 1.0 전액담보" 규칙은 대형 파트너에 비현실적이라 폐기)
- **폴더 기반 결과 뷰어**: 데이터 입력·관리 버튼은 제거됨. 파트너 자료는 `Document/` 폴더에 넣고 결과만 표시하는 구조(담당자가 코드/시드에서 관리).

## 5. 기술 스택
- **순수 정적 웹앱**: HTML + CSS + Vanilla JavaScript. **프레임워크·번들러·빌드 과정 없음.**
- **데이터 저장**: 브라우저 `localStorage`(키 `omh_prg_v8`). **서버/DB 없음.**
- **배포**: GitHub Pages(`.nojekyll`로 Jekyll 비활성화, main 브랜치 루트 서빙).
- 로컬 서버(선택): `python -m http.server`.

## 6. 폴더 구조
```
OMH-NICE/
├─ index.html            # 앱 셸(사이드바·상단바·컨테이너) [git 추적]
├─ styles.css            # 스타일·등급 배지·반응형·인쇄 CSS [git 추적]
├─ app.js                # ★핵심: 데이터 모델·리스크 엔진·렌더링·localStorage·복사기능 [git 추적]
├─ README.md             # 소개 + GitHub Pages 배포 가이드 [git 추적]
├─ .gitignore            # Document/ 와 *.pdf 등 제외 [git 추적]
├─ .nojekyll             # GitHub Pages Jekyll 비활성화 [git 추적]
├─ OMH_Partner_Risk_Gate_MVP.xlsx  # 초기 엑셀 버전(웹앱으로 대체됨, 참고용) [git 추적]
├─ bundle_artifact.html  # index+styles+app 인라인 단일 파일(Claude Artifacts용) [미추적]
├─ handover.md           # 본 이관 문서 [미추적]
├─ .claude/              # 로컬 Claude Code 설정(launch.json, settings.local.json) [미추적]
└─ Document/             # ⚠ 파트너 제출 기밀 원본 4건 [.gitignore로 git 미포함]
```

## 7. 주요 파일 설명
- **app.js** (핵심): 
  - `ITEM_NAMES` / `DEFAULT_WEIGHTS` — 14개 평가 항목과 가중치.
  - `DEFAULT_THRESHOLDS` — 등급 임계값(A85/B70/C55/D40).
  - `compute()` — 가중점수·커버율·레드플래그·최종등급 계산 엔진.
  - `seed()` — 업체 시드(초기 표시) 데이터. **시드를 수정하면 반드시 `STORE_KEY` 버전을 올려야**(예: v8→v9) 기존 방문자 브라우저에 갱신이 반영됨.
  - `copySummary()` — 대시보드 표 서식 복사(HTML+TSV).
- **index.html**: 앱 골격. `<title>`·사이드바 브랜드("오마이나이스").
- **styles.css**: 등급 색상(A 초록/B 청록/C 주황/D 오렌지/E 빨강), 인쇄 CSS, 반응형(≤820px 상단 가로 내비).
- **README.md**: 리스크 로직 설명 + GitHub Pages 배포 순서.
- **bundle_artifact.html**: 소스 3파일을 한 파일로 인라인한 산출물(파일 하나로 공유/아티팩트용). 소스 수정 시 재생성 필요(§8).
- **OMH_Partner_Risk_Gate_MVP.xlsx**: 웹앱 이전의 엑셀 버전. 현재는 웹앱이 정본이며 이 파일은 참고용.
- **Document/**: 파트너 실사 원본(사업자등록증·감사 재무제표·회사소개서 등). 앱의 "서류·공개정보" 탭에서 상대경로로 링크. ⚠ 기밀.

## 8. 실행 방법
```bash
# 로컬 실행 (정적 파일이라 브라우저로 index.html 직접 열어도 됨)
cd OMH-NICE
python -m http.server 8000
# → http://localhost:8000

# 배포 (변경 후)
git add -A && git commit -m "..." && git push origin main
# → 1~2분 후 GitHub Pages 자동 반영. 브라우저 Ctrl+F5로 캐시 갱신.
```
**bundle_artifact.html 재생성**(소스 3파일 수정 후, 선택):
```bash
python -c "import re; h=open('index.html',encoding='utf-8').read(); c=open('styles.css',encoding='utf-8').read(); j=open('app.js',encoding='utf-8').read(); h=re.sub(r'<link[^>]*styles\.css[^>]*>',lambda m:'<style>\n'+c+'\n</style>',h); h=re.sub(r'<script src=\"app\.js\"></script>',lambda m:'<script>\n'+j+'\n</script>',h); open('bundle_artifact.html','w',encoding='utf-8').write(h)"
```

## 9. 환경변수 / 설정값
- **환경변수 없음**. `.env` 파일 없음. 시크릿·API 키 **없음**(정적 사이트).
- 조정 가능한 설정값(코드 상수 또는 앱 "설정" 화면):
  - `DEFAULT_WEIGHTS`(가중치 14개, 합 110 → 100점 정규화), `DEFAULT_THRESHOLDS`(등급 임계값), `STORE_KEY`(시드 버전).

## 10. 외부 서비스 연동 정보
- **GitHub**: https://github.com/bstars00-rgb/OMH-NICE — ⚠ **공개(public) 저장소** (현재 소유 계정: `bstars00-rgb`).
- **배포(GitHub Pages)**: https://bstars00-rgb.github.io/OMH-NICE/ (Settings → Pages → main / root).
- 그 외 외부 연동 **없음**.

## 11. 데이터베이스 / Supabase / GitHub / API 연동 여부
| 항목 | 연동 여부 | 비고 |
|---|:---:|---|
| 데이터베이스(RDB 등) | ❌ 없음 | 데이터는 브라우저 localStorage |
| Supabase | ❌ 없음 | |
| 외부 API | ❌ 없음 | 네트워크 호출 없음(오프라인 동작) |
| GitHub | ✅ 있음 | 소스 저장 + Pages 배포. 소유권 이전 필요 |

## 12. 완료된 작업
- 웹 프로토타입 MVP 구축(정적 SPA) 및 GitHub Pages 공개 배포.
- 리스크 엔진(가중점수 정규화 + 레드플래그 오버라이드) 구현·검증.
- 대시보드 요약표/카드, 최종판정 라벨 명확화, 레드플래그 레이아웃 정리, 화면 폭 확대.
- 파트너 폴더 자료(Document/) 기반 재평가: Huamao(D→C), Wingpulse(D→C), Linkall(홍콩법인·TTV 반영, 점수등급 B) 등.
- 14번째 항목 "담당자 코멘트 점수" + 서술형 "담당자 코멘트" 필드(리스크평가·승인요청서·대시보드 칼럼) 추가.
- 대시보드 표 **서식 복사(HTML+TSV)** 기능.
- 자체 벤치마크 Ohmyhotel(오마이호텔앤코) 평가 추가(A·92.5).
- Happy Travel 삭제(그래듀에이션).
- 브랜드 변경 → "오마이나이스".
- 데이터 관리 버튼 제거(내보내기·가져오기·초기화·신규·삭제) → 폴더 기반 결과 뷰어化.

## 13. 미완료 작업
- 승인 후 **모니터링 탭**(월거래액·미정산·취소율·API오류율·3개월 재평가) 미구현.
- **다중 사용자 동시 편집** 불가(브라우저별 localStorage). 팀 공유는 서식 복사/수동에 의존.
- 일부 실데이터 플레이스홀더: 사업자등록번호·감사재무제표(예: Ohmyhotel "DART 조회" 표기), Linkall TTV는 자기신고값.
- `bundle_artifact.html`은 수동 재생성(자동 빌드 파이프라인 없음).

## 14. CEO Office 계정에서 이어서 해야 할 다음 작업
1. **GitHub 저장소 접근권 확보**: `bstars00-rgb/OMH-NICE`를 CEO Office 계정으로 **소유권 이전(Transfer)** 또는 협업자 추가. 이전 시 Pages URL이 새 계정 기준으로 바뀌므로 공유 링크 갱신.
2. **공개/비공개 정책 결정**: 현재 public이라 실명 파트너 리스크 소견이 인터넷에 노출됨. 필요 시 Private 전환(무료 요금제는 Private Pages 미지원 → Pages 중단하고 로컬/사내 운영) 또는 익명화 버전 운영.
3. **`Document/` 기밀 원본을 안전 채널로 별도 전달**(공개 저장소에 올리지 말 것). 로컬 폴더 이동 시에도 안전 경로 사용.
4. 실데이터 보강(사업자번호·재무), 신규 파트너 추가 시 `seed()` 갱신 + `STORE_KEY` 버전업.
5. (선택) 모니터링 탭·백엔드(Supabase 등) 연동으로 다중 사용자화.

## 15. 이관 시 주의사항 및 리스크
- ⚠ **공개 저장소 + 실명 파트너 부정 소견**: git 히스토리·검색 캐시로 남아 되돌리기 어려움. 이전과 동시에 공개 여부 재검토 권장.
- ⚠ **Document/ 기밀**: 파트너 사업자등록증·감사 재무제표(대표자명·재무수치 포함). `.gitignore`로 보호 중이나 폴더 자체는 로컬에 존재 → 안전 채널로만 전달.
- **localStorage 종속**: 사용자가 앱에서 직접 입력·수정한 값은 계정/기기 이동 시 함께 옮겨지지 않음(코드 시드 데이터만 이전됨). 필요 데이터는 사전에 "서식 복사" 등으로 백업.
- **시드 갱신 시 버전업 누락 주의**: `STORE_KEY`를 올리지 않으면 기존 방문자 화면이 갱신되지 않음.
- `.claude/`(로컬 Claude Code 설정)는 개인/도구 설정이므로 이관 필수 아님.

## 16. 이관 준비 체크리스트 (누락·확인 필요 항목 포함)
- [x] README 존재(배포 가이드 포함)
- [x] 앱 소스 3파일(index.html/styles.css/app.js) 존재
- [x] 의존성 없음(정적) — 설치 불필요, `package.json` 불필요
- [x] `.env` 없음(시크릿 없음) — `.env.example` 불필요
- [x] 샘플 데이터 존재 — `app.js`의 `seed()`에 예시 업체 내장(별도 파일 불필요)
- [x] 본 `handover.md` 작성 완료
- [ ] **GitHub 저장소 소유권/협업자 이전 필요** (bstars00-rgb → CEO Office)
- [x] DB/Supabase/API 없음 — 접근정보 이전 불필요
- [ ] **미커밋 변경 커밋 필요**: `handover.md`, `bundle_artifact.html`(git 미추적 상태)
- [ ] **`Document/` 기밀 원본 별도 전달 방법 확정** (공개 저장소 금지)
- [ ] 저장소 공개/비공개 정책 확정

## 17. 정리 필요 항목 (삭제하지 않고 표시만 — CEO Office에서 판단)
- **`OMH_Partner_Risk_Gate_MVP.xlsx`**: 웹앱 이전의 엑셀 버전. 현재 참고용이며 중복 성격 → 유지/보관 여부 판단 필요. (공개 저장소에 포함되어 있음)
- **`bundle_artifact.html`**: 소스 3파일에서 생성되는 파생 산출물(중복). git 미추적. 커밋할지, `.gitignore`로 빌드 산출물 처리할지 정책 결정 필요.
- **`.claude/`**: 로컬 도구 설정(launch.json, settings.local.json). 이관 대상 아님 — 필요 시 제외.
- 임시/테스트 파일: 별도 없음(정적 프로젝트라 test-results·node_modules 등 미존재).
