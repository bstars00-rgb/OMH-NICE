# OMH Partner Risk Gate

Ohmyhotel 신규 **B2B/TMC 파트너 거래 리스크 평가 플랫폼** — MVP 프로토타입.

대표이사 최종 승인 전, 신규 업체별 리스크를 표준 점수·등급으로 정규화하여
**승인 / 보류 / 거절** 판단을 빠르고 일관되게 돕는 내부 의사결정 보조 도구입니다.
(공식 신용등급 부여가 아님)

## 특징

- **백엔드 없음** — 순수 정적 웹앱(HTML/CSS/JS). 데이터는 브라우저 `localStorage`에 저장.
- **자동 리스크 엔진** — 13개 항목 가중 점수 + 레드플래그 자동 등급 강등.
- **자동 승인 요청서** — 대표이사 보고용 문서 생성 · 인쇄 / PDF 저장 · 텍스트 복사.
- **JSON 내보내기/가져오기** — 기기·팀원 간 데이터 이동, 백업.
- 초기 예시 4개 업체(Huamao / Linkall / Wingplus / Happy Travel) 내장.

## 리스크 로직

- **가중점수** = Σ(항목점수 ÷ 5 × 가중치), 가중치 합 100 → 만점 100점
- **등급 임계값**: A≥85 승인추천 · B≥70 조건부 · C≥55 추가확인 · D≥40 보류 · 그 미만 E 거절추천
- **최종 판정 = min(점수등급, 레드플래그 상한)**
  - 자동 **D-보류**: 사업자/실체 확인불가 · 회사주소 실존 확인불가 · 부정뉴스 · 소송/미정산 · 무담보 Credit
  - 자동 **C-추가확인**: 웹사이트 없음 · 대표자 확인불가 · Deposit 커버율<1.0 · 정산주기 30일 이상
- 가중치·임계값은 **설정** 화면에서 조정 가능

## 로컬 실행

파일을 브라우저로 직접 열면 됩니다. (또는 간단한 정적 서버)

```bash
# Python 정적 서버
python -m http.server 8000
# → http://localhost:8000
```

## GitHub Pages 배포

1. 이 폴더를 GitHub 저장소로 푸시합니다.
   ```bash
   git init
   git add .
   git commit -m "OMH Partner Risk Gate MVP"
   git branch -M main
   git remote add origin https://github.com/<계정>/<저장소>.git
   git push -u origin main
   ```
2. GitHub 저장소 → **Settings → Pages**
3. **Source: Deploy from a branch** → Branch: `main` / `/ (root)` → Save
4. 1~2분 후 `https://<계정>.github.io/<저장소>/` 에서 접속

> `.nojekyll` 파일이 포함되어 있어 Jekyll 빌드를 건너뜁니다(정적 파일 그대로 서빙).

## 파일 구성

| 파일 | 설명 |
|---|---|
| `index.html` | 앱 셸(사이드바·상단바·컨테이너) |
| `styles.css` | 스타일 · 등급 배지 · 인쇄 CSS |
| `app.js` | 데이터 모델 · 리스크 엔진 · 화면 렌더링 · localStorage |
| `.nojekyll` | GitHub Pages Jekyll 비활성화 |

## 데이터 저장 주의

데이터는 **접속한 브라우저에만** 저장됩니다. 다른 기기/팀원과 공유하려면
**JSON 내보내기**로 파일을 만들어 전달하고, 상대는 **가져오기**로 불러옵니다.
운영 단계에서는 Airtable / Google Sheet / DB 백엔드 연동을 권장합니다.

## 로드맵

- 승인 이후 모니터링(월 거래액·미정산·취소율·API 오류율·3개월 재평가)
- 역할별 로그인·전자결재, 이메일 알림
- Airtable / Supabase 백엔드 연동(다중 사용자 동시 편집)
