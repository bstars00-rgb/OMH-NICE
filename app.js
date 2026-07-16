/* OMH Partner Risk Gate — MVP prototype (static, localStorage)
   Bilingual (KO/EN) via in-app language toggle. Internal data uses language-neutral
   canonical ids/values; only display strings are translated, so grades never change
   with language. Free-text seed fields are stored as {ko,en}. */
'use strict';

/* ---------- i18n language state ---------- */
const LANG_KEY = 'omh_prg_lang';
let LANG = (localStorage.getItem(LANG_KEY) === 'en') ? 'en' : 'ko';
const B = (ko, en) => ({ ko, en });                       // bilingual literal helper
function tt(v){ return (v && typeof v === 'object' && ('ko' in v || 'en' in v)) ? (v[LANG] ?? v.ko ?? v.en ?? '') : (v == null ? '' : v); }
function rawStr(v){ return (v && typeof v === 'object') ? `${v.ko||''} ${v.en||''}` : String(v == null ? '' : v); }
function T(k){ const d = I18N[LANG] || I18N.ko; return (k in d) ? d[k] : (I18N.ko[k] ?? k); }
function setLang(l){ if(l!==LANG){ LANG = l; localStorage.setItem(LANG_KEY, l); render(); } }

/* ---------- constants ---------- */
const ITEM_NAMES = [
  B('회사 신뢰도','Company credibility'), B('사업모델 명확성','Business model clarity'),
  B('엔드유저 보유','End-user base'), B('판매채널 차별성','Sales channel differentiation'),
  B('기존고객 중복도(낮을수록↑)','Existing-customer overlap (lower is better)'), B('유니크 인벤토리','Unique inventory'),
  B('예상 매출기여도','Expected revenue contribution'), B('정산 리스크','Settlement risk'),
  B('Deposit 충분성','Deposit sufficiency'), B('API/기술 안정성','API / tech stability'),
  B('운영 커뮤니케이션','Operational communication'), B('국가별 법무/정산','Country legal / settlement'),
  B('장기 성장성','Long-term growth'), B('담당자 코멘트 점수','Reviewer comment score')];
const DEFAULT_WEIGHTS = [12,8,8,6,6,6,8,12,12,6,5,6,5,10];
const DEFAULT_THRESHOLDS = { A:85, B:70, C:55, D:40 };
const REQUIRED_COVERAGE = { A:0, B:0.2, C:0.5, D:1, E:1 };

const DOC_DEFS = [
  {id:'bizLicense', ko:'사업자등록증', en:'Business license'},
  {id:'profile',    ko:'회사소개서',   en:'Company profile'},
  {id:'bank',       ko:'은행정보',     en:'Bank details'},
  {id:'contract',   ko:'계약서 초안',  en:'Draft contract'},
  {id:'settleAgree',ko:'정산조건 합의서', en:'Settlement-terms agreement'},
  {id:'refs',       ko:'파트너 레퍼런스', en:'Partner references'},
  {id:'financials', ko:'재무제표/매출자료', en:'Financials / revenue proof'},
  {id:'repId',      ko:'대표자 신분확인', en:'Representative ID verification'}];
const DOC_KEYS = DOC_DEFS.map(d=>d.id);
const DOCV_DEFS = [{id:'submitted',ko:'제출',en:'Submitted'},{id:'notSubmitted',ko:'미제출',en:'Not submitted'},{id:'na',ko:'불가',en:'N/A'}];

const PUBLIC_DEFS = [
  {id:'website',    ko:'공식 웹사이트',        en:'Official website'},
  {id:'linkedin',   ko:'LinkedIn/기업프로필',  en:'LinkedIn / company profile'},
  {id:'google',     ko:'Google 검색결과',      en:'Google search results'},
  {id:'negNews',    ko:'부정 뉴스',            en:'Negative news', neg:true},
  {id:'lawsuit',    ko:'소송/사기/미정산',     en:'Lawsuit / fraud / non-payment', neg:true},
  {id:'tradeRefs',  ko:'거래처/업계 레퍼런스', en:'Trade / industry references'},
  {id:'domainAge',  ko:'도메인 생성시점',      en:'Domain creation date'},
  {id:'addrExists', ko:'회사주소 실존',        en:'Company address exists'},
  {id:'repHistory', ko:'대표자 업계이력',      en:'Representative industry track record'}];
const PUBLIC_KEYS = PUBLIC_DEFS.map(d=>d.id);
const NEG_PUBLIC = PUBLIC_DEFS.filter(d=>d.neg).map(d=>d.id);
const YN_DEFS  = [{id:'Y',ko:'Y',en:'Y'},{id:'N',ko:'N',en:'N'},{id:'unknown',ko:'불명',en:'Unknown'}];
const YNP_DEFS = [{id:'Y',ko:'Y',en:'Y'},{id:'N',ko:'N',en:'N'},{id:'partial',ko:'부분',en:'Partial'}];
const MANUAL_DEFS = [{id:'N',ko:'N',en:'N'},{id:'Y',ko:'Y',en:'Y'},{id:'partial',ko:'부분',en:'Partial'}];
const CREDIT_DEFS = [{id:'N',ko:'N',en:'N'},{id:'Y',ko:'Y',en:'Y'}];
const RISK_DEFS = [{id:'low',ko:'낮음',en:'Low'},{id:'medium',ko:'보통',en:'Medium'},{id:'high',ko:'높음',en:'High'}];
const STATUS_DEFS = [{id:'new',ko:'신규',en:'New'},{id:'review',ko:'검토중',en:'Under review'},{id:'approved',ko:'승인',en:'Approved'},{id:'conditional',ko:'조건부승인',en:'Conditional'},{id:'hold',ko:'보류',en:'On hold'},{id:'rejected',ko:'거절',en:'Rejected'}];
const STAGE_DEFS = [{id:'sales',ko:'영업 1차입력',en:'Sales intake'},{id:'scm',ko:'SCM/운영 검토',en:'SCM / ops review'},{id:'finance',ko:'재무 정산검토',en:'Finance / settlement review'},{id:'dev',ko:'개발 API검토',en:'Dev / API review'},{id:'ceo',ko:'대표이사 승인',en:'CEO approval'},{id:'monitor',ko:'3개월 모니터링',en:'3-month monitoring'}];
const DECISION_DEFS = [{id:'proceed',ko:'진행',en:'Proceed'},{id:'hold',ko:'보류',en:'On hold'},{id:'reject',ko:'반려',en:'Reject'},{id:'approve',ko:'승인',en:'Approve'},{id:'conditional',ko:'조건부승인',en:'Conditional'}];
const COUNTRY_OPTS = { ko:['중국','두바이(UAE)','한국','일본','베트남','태국','기타'], en:['China','Dubai (UAE)','Korea','Japan','Vietnam','Thailand','Other'] };
const BIZTYPES = ['B2B','B2C','TMC','OTA','Wholesaler','B2B/TMC'];
const CURRENCIES = ['USD','KRW','CNY','AED'];

const GRADE_META = {
  A:{label:B('승인 추천','Approve (recommended)'), cls:'g-A'}, B:{label:B('조건부 승인','Conditional approval'), cls:'g-B'},
  C:{label:B('추가 확인 필요','Needs further review'), cls:'g-C'}, D:{label:B('보류','On hold'), cls:'g-D'}, E:{label:B('거절 추천','Reject (recommended)'), cls:'g-E'}
};
const RANK = {A:0,B:1,C:2,D:3,E:4};
const STORE_KEY = 'omh_prg_v20';
const UNVERIFIED_RE = /확인필요|unverified|tbc|to be confirmed/i;

/* def label/opts helpers */
function defLabel(defs,id){ const d=defs.find(x=>x.id===id); return d?d[LANG]:id; }
function optsDefs(defs,val){ return defs.map(d=>`<option value="${esc(d.id)}" ${d.id===val?'selected':''}>${esc(d[LANG])}</option>`).join(''); }
function optsPlain(list,val){ return list.map(o=>`<option value="${esc(o)}" ${o===val?'selected':''}>${esc(o)}</option>`).join(''); }

/* ---------- UI dictionary ---------- */
const I18N = {
  ko:{
    docTitle:'오마이나이스 · OMH-NICE', brandTitle:'오마이나이스', brandSub:'OMH-NICE · 파트너 거래 리스크 평가',
    footNote:'MVP 프로토타입 · 데이터는 브라우저에 저장됩니다',
    navDashboard:'대시보드', navCompanies:'업체 목록', navSettings:'설정(가중치)',
    tDashboard:'대시보드', tDashboardSub:'신규 B2B/TMC 파트너 리스크 표준 평가',
    tCompanies:'업체 목록', tCompaniesSub:'등록된 파트너 후보 전체',
    tSettings:'설정 · 가중치', tSettingsSub:'리스크 항목 가중치와 등급 임계값',
    tCompany:'업체 상세', tCompanySub:'정보 입력 · 리스크 평가 · 승인 요청서',
    back:'← 목록', blank:'(미입력)', none:'없음', noCompanies:'등록된 업체가 없습니다.',
    cardTotal:'전체 업체', cardApprove:'승인권 (최종 A·B)', cardHold:'확인·보류 (최종 C·D)', cardReject:'거절 추천 (최종 E)',
    dashHint:'※ 요약 카드와 판정은 <b>레드플래그가 반영된 ‘최종 판정’</b> 기준입니다. ‘점수등급’은 참고용이며, 레드플래그가 있으면 최종 판정이 강등됩니다(예: 점수 B라도 Deposit 부족 시 최종 C).',
    summaryTitle:'업체별 리스크 요약', copyFormatted:'📋 서식 복사',
    manual:'매뉴얼', manualTitle:'오마이나이스 사용 매뉴얼',
    thCompany:'업체', thCountry:'국가', thDeposit:'Deposit', thSettle:'정산주기', dayUnit:'일', thCoverage:'커버율', thWeighted:'가중점수',
    thScoreGrade:'점수등급', thScoreGradeSub:'(참고)', thFinal:'최종 판정', thFinalSub:'(레드플래그 반영)',
    thFlags:'레드플래그', thComment:'담당자 코멘트', thCommentSub:'(점수/5)',
    thType:'유형', thStatus:'상태',
    guideTitle:'사용 순서',
    guideBody:'1) <b>Document 폴더</b>에 업체 자료(사업자등록·회사소개서 등) 업로드 &nbsp;·&nbsp; 2) 담당자가 <b>리스크 평가</b> 13개 항목 입력<br>3) 가중점수·최종판정 <b>자동 산출</b> &nbsp;·&nbsp; 4) <b>승인 요청서</b> 자동 생성·인쇄로 대표이사 보고<br>※ 최종판정 = min(점수등급, 레드플래그 상한). 사업자·실체 확인불가/부정뉴스/소송 등은 자동 <b>D-보류</b>.',
    companiesTitle:'업체 목록',
    weightsTitle:'리스크 항목 가중치', weightSum:'가중치 합계',
    weightsHint:'가중점수 = Σ(항목점수 ÷ 5 × 가중치) ÷ 가중치합 × 100 — <b>100점 만점으로 자동 정규화</b>됩니다. 합계가 100이 아니어도 됩니다. ‘담당자 코멘트 점수’는 담당자가 리스크 평가 탭에서 1~5점으로 매기는 종합 주관 점수입니다.',
    thresholdsTitle:'등급 임계값 (가중점수 ≥)', gradeMin:'등급 하한',
    notFound:'업체를 찾을 수 없습니다.',
    tabInfo:'기본정보', tabDeal:'거래조건', tabDocs:'서류·공개정보', tabRisk:'리스크 평가', tabReport:'승인 요청서', tabHistory:'승인 이력',
    infoTitle:'01. 업체 기본정보',
    fName:'업체명', fCountry:'국가', fBizType:'사업유형', fMarket:'주요 시장', fCustomer:'주요 고객군(엔드유저)',
    fWebsite:'웹사이트', fWebsiteHint:'비어있거나 확인필요 → 자동 C 강등', fBizReg:'사업자등록번호', fBizRegHint:'비어있거나 확인필요 → 자동 D 강등',
    fFounded:'설립연도', fRep:'대표자/주요임원', fRepHint:'비어있거나 확인필요 → 자동 C 강등', fContact:'담당자', fEmail:'담당자 이메일', fStatus:'상태',
    dealTitle:'02. 거래조건', fDeposit:'Deposit (USD)', fSettle:'정산주기 (일)', fSettleHint:'30일 이상 → 자동 C 강등', fCurrency:'정산통화',
    fCredit:'Credit 요청', fCreditHint:'Y + Deposit 0 → 자동 D 강등', fGMV:'예상 월거래액 (USD)', fGMVHint:'커버율 계산의 핵심 값',
    fSalesRegion:'주요 판매지역', fProducts:'주요 상품', fApi:'API 연동', fManual:'수기 예약', fCancelRisk:'취소/노쇼 리스크',
    boxExposure:'정산주기 노출액', boxExposureHint:'월거래액 × 정산주기/30', boxReqDep:'요구 Deposit', boxReqDepHint:'노출 × 등급별 요구커버율(A0·B20·C50·D100%)',
    boxDepOk:'Deposit 충족', boxShort:'부족', boxSufficient:'충족', boxCurrent:'현재',
    folderTitle:'폴더 제출 자료', fromDocument:'Document/ 기준',
    folderHint:'이 플랫폼은 <b>Document 폴더에 올린 파일</b>을 근거로 평가 결과를 표시합니다. 아래는 이 업체에 연결된 자료입니다(클릭 시 열림).',
    noFiles:'폴더에 업로드된 자료가 없습니다. <code>Document/</code> 폴더에 파일을 넣으면 여기에 표시됩니다.',
    docsTitle:'03. 제출서류', notSubmittedN:'미제출', pubTitle:'04. 외부 공개정보 체크', negTag:'(Y=위험)',
    pubHint:'‘부정 뉴스=Y’·‘소송/사기/미정산=Y’·‘회사주소 실존=N’은 점수와 무관하게 <b>D-보류</b>로 강등됩니다.',
    riskTitle:'05. 내부 리스크 평가', riskPill:'각 1~5점 · 5=저위험/양호', weightLabel:'가중치',
    resultTitle:'평가 결과', commentsTitle:'보고용 코멘트',
    nComment:'담당자 코멘트', nCommentHint:'(담당자 코멘트 점수의 근거·종합 소견)', nExpect:'기대효과', nCheck:'주요 리스크 / 확인 필요사항', nOpinion:'종합 의견',
    boxWeighted:'가중점수', boxScoreGrade:'점수 등급', boxCoverage:'Deposit 커버율', boxFinal:'최종 판정', noFlags:'레드플래그 없음',
    copyText:'텍스트 복사', printPdf:'인쇄 / PDF 저장', reportH2:'■ 신규 파트너 승인 요청서', reportMeta:'대표이사 보고용 · 자동 생성',
    rMetaBy:'작성: OMH Global OPs',
    rCompany:'업체명', rCountryType:'국가 / 사업유형', rFoundedRep:'설립 / 대표', rDeposit:'Deposit', rSettle:'정산주기', rDays:'일',
    rGMV:'예상 월거래액', rCoverage:'커버율', rProducts:'주요 상품', rApiManual:'API / 수기', rEndUsers:'주요 엔드유저',
    rRiskScore:'리스크 점수', rScoreGrade:'점수등급', rFinal:'★ 최종 판정', rFlags:'레드플래그',
    secExpect:'기대효과', secCheck:'주요 리스크 / 확인 필요사항', secOpinion:'종합 의견', secComment:'담당자 코멘트', secCommentScore:'담당자 코멘트 점수',
    reportCond:'승인 요청 조건', reportCondBody:'□ Deposit 상향 (USD ___ → ___) &nbsp; □ 정산주기 단축 (___일)<br>□ 초기 3개월 Credit 미부여 &nbsp; □ 월 GMV 한도 설정 (USD ___)',
    reportSign:'결재&nbsp;&nbsp; 영업 □&nbsp;&nbsp; SCM □&nbsp;&nbsp; 재무 □&nbsp;&nbsp; 개발 □&nbsp;&nbsp; 대표이사 □ &nbsp;(승인 / 보류 / 반려)',
    histTitle:'07. 승인 워크플로우 이력', hStage:'단계', hReviewer:'검토자', hDecision:'결정', hComment:'코멘트', hDate:'일시', hDelete:'삭제',
    hNoRecords:'기록 없음', hReviewerPh:'이름/팀', hCommentPh:'코멘트', hAdd:'추가', alertReviewer:'검토자를 입력하세요.',
    deleteConfirm:'이 업체를 삭제할까요?', resetConfirm:'모든 데이터를 초기 예시로 되돌립니다. 계속할까요?',
    importOk:'가져오기 완료.', importInvalid:'올바른 JSON 파일이 아닙니다.',
    copyOk:'복사되었습니다.', copyFailManual:'복사 실패 — 표를 직접 선택해 복사하세요.',
    reportCopyOk:'승인 요청서가 클립보드에 복사되었습니다.', reportCopyFail:'복사 실패 — 브라우저 권한을 확인하세요.',
    reportTxtH:'■ 신규 파트너 승인 요청서', rtCompany:'업체명', rtCountry:'국가', rtBizType:'사업유형', rtDeal:'거래조건', rtSettle:'정산',
    rtEndUser:'주요 엔드유저', rtRiskScore:'리스크 점수', rtScoreGrade:'점수등급', rtFinal:'최종 판정', rtFlags:'레드플래그',
    rtExpect:'기대효과', rtCheck:'리스크/확인 필요', rtOpinion:'종합 의견', rtComment:'담당자 코멘트', rtScore:'점수',
  },
  en:{
    docTitle:'OMH-NICE · Partner Risk Assessment', brandTitle:'OMH-NICE', brandSub:'Oh My Nice · Partner Trade Risk Assessment',
    footNote:'MVP prototype · data is stored in your browser',
    navDashboard:'Dashboard', navCompanies:'Companies', navSettings:'Settings (weights)',
    tDashboard:'Dashboard', tDashboardSub:'Standardized risk assessment of new B2B/TMC partners',
    tCompanies:'Companies', tCompaniesSub:'All candidate partners',
    tSettings:'Settings · Weights', tSettingsSub:'Risk-item weights and grade thresholds',
    tCompany:'Company detail', tCompanySub:'Info · risk assessment · approval request',
    back:'← List', blank:'(blank)', none:'None', noCompanies:'No companies registered.',
    cardTotal:'Total companies', cardApprove:'Approval tier (final A·B)', cardHold:'Review·hold (final C·D)', cardReject:'Reject (final E)',
    dashHint:'※ Summary cards and verdicts use the <b>final verdict (with red flags applied)</b>. The score grade is for reference; any red flag downgrades the final verdict (e.g., score B but insufficient deposit → final C).',
    summaryTitle:'Partner risk summary', copyFormatted:'📋 Copy formatted',
    manual:'Manual', manualTitle:'OMH-NICE User Manual',
    thCompany:'Company', thCountry:'Country', thDeposit:'Deposit', thSettle:'Settlement', dayUnit:'d', thCoverage:'Coverage', thWeighted:'Weighted score',
    thScoreGrade:'Score grade', thScoreGradeSub:'(reference)', thFinal:'Final verdict', thFinalSub:'(red flags applied)',
    thFlags:'Red flags', thComment:'Reviewer comment', thCommentSub:'(score/5)',
    thType:'Type', thStatus:'Status',
    guideTitle:'How to use',
    guideBody:'1) Upload company docs (business license·company profile, etc.) to the <b>Document folder</b> &nbsp;·&nbsp; 2) Reviewer enters the <b>13 risk items</b><br>3) Weighted score·final verdict are <b>auto-computed</b> &nbsp;·&nbsp; 4) Auto-generate·print the <b>approval request</b> for the CEO<br>※ Final verdict = min(score grade, red-flag ceiling). Unverifiable entity/negative news/lawsuit etc. → automatic <b>D-hold</b>.',
    companiesTitle:'Companies',
    weightsTitle:'Risk-item weights', weightSum:'Weight sum',
    weightsHint:'Weighted score = Σ(item score ÷ 5 × weight) ÷ total weight × 100 — <b>auto-normalized to 100</b>. The sum need not equal 100. The "Reviewer comment score" is the reviewer\'s overall subjective 1-5 score entered on the Risk assessment tab.',
    thresholdsTitle:'Grade thresholds (weighted score ≥)', gradeMin:'grade minimum',
    notFound:'Company not found.',
    tabInfo:'Info', tabDeal:'Deal terms', tabDocs:'Docs · public info', tabRisk:'Risk assessment', tabReport:'Approval request', tabHistory:'Approval history',
    infoTitle:'01. Company info',
    fName:'Company name', fCountry:'Country', fBizType:'Business type', fMarket:'Primary market', fCustomer:'Primary end-users',
    fWebsite:'Website', fWebsiteHint:'Empty or unverified → auto C downgrade', fBizReg:'Business reg. no.', fBizRegHint:'Empty or unverified → auto D downgrade',
    fFounded:'Founded year', fRep:'Representative / key exec', fRepHint:'Empty or unverified → auto C downgrade', fContact:'Contact', fEmail:'Contact email', fStatus:'Status',
    dealTitle:'02. Deal terms', fDeposit:'Deposit (USD)', fSettle:'Settlement cycle (days)', fSettleHint:'≥30 days → auto C downgrade', fCurrency:'Settlement currency',
    fCredit:'Credit requested', fCreditHint:'Y + deposit 0 → auto D downgrade', fGMV:'Expected monthly volume (USD)', fGMVHint:'Key value for coverage calc',
    fSalesRegion:'Primary sales region', fProducts:'Primary products', fApi:'API integration', fManual:'Manual booking', fCancelRisk:'Cancel/no-show risk',
    boxExposure:'Settlement-cycle exposure', boxExposureHint:'Monthly volume × settlement/30', boxReqDep:'Required deposit', boxReqDepHint:'Exposure × required coverage by grade (A0·B20·C50·D100%)',
    boxDepOk:'Deposit sufficiency', boxShort:'Short', boxSufficient:'Sufficient', boxCurrent:'Current',
    folderTitle:'Folder-submitted materials', fromDocument:'from Document/',
    folderHint:'This platform shows results based on the <b>files uploaded to the Document folder</b>. Below are the materials linked to this company (click to open).',
    noFiles:'No files uploaded to the folder. Put files in the <code>Document/</code> folder to show them here.',
    docsTitle:'03. Submitted documents', notSubmittedN:'not submitted', pubTitle:'04. External public-info check', negTag:'(Y=risk)',
    pubHint:"'Negative news=Y'·'Lawsuit/fraud/non-payment=Y'·'Company address exists=N' downgrade to <b>D-hold</b> regardless of score.",
    riskTitle:'05. Internal risk assessment', riskPill:'each 1-5 · 5=low risk/good', weightLabel:'weight',
    resultTitle:'Assessment result', commentsTitle:'Reporting comments',
    nComment:'Reviewer comment', nCommentHint:'(basis for the reviewer comment score · overall opinion)', nExpect:'Expected benefit', nCheck:'Key risks / items to confirm', nOpinion:'Overall opinion',
    boxWeighted:'Weighted score', boxScoreGrade:'Score grade', boxCoverage:'Deposit coverage', boxFinal:'Final verdict', noFlags:'No red flags',
    copyText:'Copy text', printPdf:'Print / Save PDF', reportH2:'■ New Partner Approval Request', reportMeta:'For CEO reporting · auto-generated',
    rMetaBy:'by OMH Global OPs',
    rCompany:'Company', rCountryType:'Country / type', rFoundedRep:'Founded / rep', rDeposit:'Deposit', rSettle:'Settlement cycle', rDays:'days',
    rGMV:'Expected monthly volume', rCoverage:'coverage', rProducts:'Primary products', rApiManual:'API / manual', rEndUsers:'Primary end-users',
    rRiskScore:'Risk score', rScoreGrade:'score grade', rFinal:'★ Final verdict', rFlags:'Red flags',
    secExpect:'Expected benefit', secCheck:'Key risks / items to confirm', secOpinion:'Overall opinion', secComment:'Reviewer comment', secCommentScore:'reviewer comment score',
    reportCond:'Approval conditions', reportCondBody:'□ Raise deposit (USD ___ → ___) &nbsp; □ Shorten settlement cycle (___ days)<br>□ No credit for first 3 months &nbsp; □ Set monthly GMV cap (USD ___)',
    reportSign:'Sign-off&nbsp;&nbsp; Sales □&nbsp;&nbsp; SCM □&nbsp;&nbsp; Finance □&nbsp;&nbsp; Dev □&nbsp;&nbsp; CEO □ &nbsp;(Approve / Hold / Reject)',
    histTitle:'07. Approval workflow history', hStage:'Stage', hReviewer:'Reviewer', hDecision:'Decision', hComment:'Comment', hDate:'Date', hDelete:'Delete',
    hNoRecords:'No records', hReviewerPh:'Name/team', hCommentPh:'Comment', hAdd:'Add', alertReviewer:'Please enter a reviewer.',
    deleteConfirm:'Delete this company?', resetConfirm:'Reset all data to the initial examples? Continue?',
    importOk:'Import complete.', importInvalid:'Not a valid JSON file.',
    copyOk:'Copied.', copyFailManual:'Copy failed — select the table and copy manually.',
    reportCopyOk:'Approval request copied to clipboard.', reportCopyFail:'Copy failed — check browser permissions.',
    reportTxtH:'■ New Partner Approval Request', rtCompany:'Company', rtCountry:'Country', rtBizType:'Business type', rtDeal:'Deal terms', rtSettle:'Settlement',
    rtEndUser:'Primary end-users', rtRiskScore:'Risk score', rtScoreGrade:'score grade', rtFinal:'Final verdict', rtFlags:'Red flags',
    rtExpect:'Expected benefit', rtCheck:'Key risks / to confirm', rtOpinion:'Overall opinion', rtComment:'Reviewer comment', rtScore:'score',
  }
};

const FLAG_TXT = {
  bizMissing:B('사업자/실체 확인 불가','Entity/business unverifiable'),
  addrNo:B('회사주소 실존 확인 불가','Company address unverifiable'),
  negNews:B('부정 뉴스 발견','Negative news found'),
  lawsuit:B('소송/사기/미정산 이슈','Lawsuit/fraud/non-payment issue'),
  uncoveredCredit:B('Deposit 없이 Credit 요청','Credit requested without deposit'),
  websiteNo:B('웹사이트 없음/미확인','No/unverified website'),
  repMissing:B('대표자 정보 확인 불가','Representative info unverifiable'),
  slowSettle:B('정산주기 30일 이상','Settlement cycle ≥30 days')
};
function depositShortFlag(req){ const amt='$'+Math.round(req).toLocaleString('en-US'); return LANG==='en'?('Deposit short (need ≥'+amt+')'):('Deposit 부족(필요 ≥'+amt+')'); }

/* ---------- state ---------- */
let DATA = load();
let VIEW = 'dashboard';
let CURRENT = null;   // company id
let TAB = 'info';

/* ---------- storage ---------- */
function load(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(raw){ const d = JSON.parse(raw); if(d && d.companies) return migrate(d); }
  }catch(e){ console.warn(e); }
  return { settings:{weights:[...DEFAULT_WEIGHTS], thresholds:{...DEFAULT_THRESHOLDS}}, companies: seed() };
}
function migrate(d){
  d.settings = d.settings || {};
  d.settings.weights = d.settings.weights || [...DEFAULT_WEIGHTS];
  d.settings.thresholds = d.settings.thresholds || {...DEFAULT_THRESHOLDS};
  d.companies.forEach(normalizeCompany);
  return d;
}
function save(){ localStorage.setItem(STORE_KEY, JSON.stringify(DATA)); updateFoot(); }
function resetSeed(){
  if(!confirm(T('resetConfirm'))) return;
  DATA = { settings:{weights:[...DEFAULT_WEIGHTS], thresholds:{...DEFAULT_THRESHOLDS}}, companies: seed() };
  save(); VIEW='dashboard'; render();
}

/* ---------- model helpers ---------- */
function blankCompany(){
  return {
    id: nextId(), name:'', country:'', businessType:'', market:'', customerType:'',
    website:'', bizRegNo:'', foundedYear:'', representative:'', contact:'', email:'', status:'new',
    deposit:0, settlementDays:14, currency:'USD', creditRequired:'N', monthlyGMV:0,
    salesRegion:'', products:'', apiIntegration:'Y', manualBooking:'N', cancelNoshowRisk:'medium',
    docs:Object.fromEntries(DOC_KEYS.map(k=>[k,'notSubmitted'])),
    public:Object.fromEntries(PUBLIC_KEYS.map(k=>[k,'unknown'])),
    scores:new Array(ITEM_NAMES.length).fill(3),
    notes:{expect:'', check:'', opinion:'', comment:''},
    documents:[],
    history:[]
  };
}
function normalizeCompany(c){
  c.docs = c.docs || {}; DOC_KEYS.forEach(k=>{ if(!(k in c.docs)) c.docs[k]='notSubmitted'; });
  c.public = c.public || {}; PUBLIC_KEYS.forEach(k=>{ if(!(k in c.public)) c.public[k]='unknown'; });
  if(!Array.isArray(c.scores)) c.scores=[];
  while(c.scores.length < ITEM_NAMES.length) c.scores.push(3);
  if(c.scores.length > ITEM_NAMES.length) c.scores = c.scores.slice(0, ITEM_NAMES.length);
  c.notes = c.notes || {};
  ['expect','check','opinion','comment'].forEach(function(k){ if(!(k in c.notes)) c.notes[k]=''; });
  c.documents = c.documents || [];
  c.history = c.history || [];
  return c;
}
function nextId(){
  const nums = (DATA?DATA.companies:[]).map(c=>parseInt((c.id||'C0').replace(/\D/g,''))||0);
  const n = (nums.length?Math.max(...nums):0)+1;
  return 'C'+String(n).padStart(3,'0');
}
function getCompany(id){ return DATA.companies.find(c=>c.id===id); }

/* ---------- core risk engine (language-independent) ---------- */
function fieldMissing(v){ const s=rawStr(v).trim(); return s==='' || UNVERIFIED_RE.test(s); }
function compute(c){
  const s = DATA.settings;
  const gmv = Number(c.monthlyGMV)||0, days = Number(c.settlementDays)||0, dep = Number(c.deposit)||0;
  const exposure = gmv * days/30;
  const hasCov = dep>0 && exposure>0;
  const coverage = hasCov ? dep/exposure : (exposure>0 && dep===0 ? 0 : null);
  let acc=0, wsum=0;
  const n = Math.min(c.scores.length, s.weights.length);
  for(let i=0;i<n;i++){ const w=Number(s.weights[i])||0; acc += (Number(c.scores[i])||0)/5 * w; wsum += w; }
  const weighted = wsum>0 ? acc/wsum*100 : 0;
  const t = s.thresholds;
  const scoreGrade = weighted>=t.A?'A':weighted>=t.B?'B':weighted>=t.C?'C':weighted>=t.D?'D':'E';

  const bizMissing = fieldMissing(c.bizRegNo);
  const addrNo = c.public['addrExists']==='N';
  const negNews = c.public['negNews']==='Y';
  const lawsuit = c.public['lawsuit']==='Y';
  const uncoveredCredit = c.creditRequired==='Y' && dep===0;
  const websiteNo = c.public['website']==='N' || fieldMissing(c.website);
  const repMissing = fieldMissing(c.representative);
  const reqCov = (scoreGrade in REQUIRED_COVERAGE) ? REQUIRED_COVERAGE[scoreGrade] : 1;
  const requiredDeposit = exposure * reqCov;
  const depositShort = exposure>0 && reqCov>0 && dep < requiredDeposit - 1e-6;
  const slowSettle = days>=30;

  const dFlags=[], cFlags=[];
  if(bizMissing) dFlags.push(tt(FLAG_TXT.bizMissing));
  if(addrNo) dFlags.push(tt(FLAG_TXT.addrNo));
  if(negNews) dFlags.push(tt(FLAG_TXT.negNews));
  if(lawsuit) dFlags.push(tt(FLAG_TXT.lawsuit));
  if(uncoveredCredit) dFlags.push(tt(FLAG_TXT.uncoveredCredit));
  if(websiteNo) cFlags.push(tt(FLAG_TXT.websiteNo));
  if(repMissing) cFlags.push(tt(FLAG_TXT.repMissing));
  if(depositShort) cFlags.push(depositShortFlag(requiredDeposit));
  if(slowSettle) cFlags.push(tt(FLAG_TXT.slowSettle));

  let rank = RANK[scoreGrade];
  if(cFlags.length) rank = Math.max(rank, RANK.C);
  if(dFlags.length) rank = Math.max(rank, RANK.D);
  const finalGrade = Object.keys(RANK).find(k=>RANK[k]===rank);

  return { exposure, coverage, hasCov, weighted, scoreGrade, finalGrade, dFlags, cFlags,
           reqCov, requiredDeposit, depositShort,
           allFlags:[...dFlags, ...cFlags] };
}

/* ---------- small view helpers ---------- */
const esc = s => String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function badge(g){ const m=GRADE_META[g]; return `<span class="badge ${m.cls}"><span class="dot"></span>${g} · ${esc(tt(m.label))}</span>`; }
function fmtUSD(n){ n=Math.round(Number(n)||0); return '$'+n.toLocaleString('en-US'); }
function fmtCov(cov){ return cov==null?'—':cov.toFixed(2)+'x'; }
function updateFoot(){ const el=document.getElementById('foot-count'); if(el) el.textContent = LANG==='en' ? (DATA.companies.length+' companies registered') : (DATA.companies.length+'개 업체 등록됨'); }

/* ---------- chrome (static UI) ---------- */
function applyChrome(){
  document.documentElement.lang = LANG;
  document.title = T('docTitle');
  const set=(id,txt)=>{ const el=document.getElementById(id); if(el) el.textContent=txt; };
  set('brand-title', T('brandTitle')); set('brand-sub', T('brandSub')); set('foot-note', T('footNote'));
  const navMap = {dashboard:'navDashboard', companies:'navCompanies', settings:'navSettings'};
  document.querySelectorAll('#nav a').forEach(a=>{ const lab=a.querySelector('[data-navlabel]'); if(lab && navMap[a.dataset.view]) lab.textContent=T(navMap[a.dataset.view]); });
  document.querySelectorAll('#lang-toggle [data-lang]').forEach(b=>{ const on=b.dataset.lang===LANG; b.style.fontWeight=on?'700':'400'; b.style.opacity=on?'1':'.55'; b.style.textDecoration=on?'underline':'none'; });
}

/* ---------- render root ---------- */
function render(){
  applyChrome();
  document.querySelectorAll('#nav a').forEach(a=>a.classList.toggle('active', a.dataset.view===VIEW));
  const titleMap = {dashboard:['tDashboard','tDashboardSub'], companies:['tCompanies','tCompaniesSub'],
    settings:['tSettings','tSettingsSub'], company:['tCompany','tCompanySub']};
  const [tk,sk] = titleMap[VIEW]||['',''];
  document.getElementById('page-title').textContent = tk?T(tk):'';
  document.getElementById('page-sub').textContent = sk?T(sk):'';
  const _mbl=document.getElementById('manual-btn-label'); if(_mbl) _mbl.textContent=T('manual');
  const _mtt=document.getElementById('manual-title'); if(_mtt) _mtt.textContent='📖 '+T('manualTitle');
  const _mm=document.getElementById('manual-modal'); if(_mm && _mm.style.display!=='none'){ const _mb=document.getElementById('manual-body'); if(_mb) _mb.innerHTML=manualHTML(); }

  const acts = document.getElementById('top-actions');
  acts.innerHTML = (VIEW==='company') ? `<button class="btn" data-act="back">${T('back')}</button>` : '';

  const el = document.getElementById('content');
  if(VIEW==='dashboard') el.innerHTML = viewDashboard();
  else if(VIEW==='companies') el.innerHTML = viewCompanies();
  else if(VIEW==='settings') el.innerHTML = viewSettings();
  else if(VIEW==='company') el.innerHTML = viewCompany();
  updateFoot();
}

/* ---------- dashboard ---------- */
function viewDashboard(){
  const list = DATA.companies.map(c=>({c, r:compute(c)}));
  const count = g => list.filter(x=>x.r.finalGrade===g).length;
  const approve = list.filter(x=>['A','B'].includes(x.r.finalGrade)).length;
  const hold = list.filter(x=>['C','D'].includes(x.r.finalGrade)).length;
  const reject = count('E');
  const cards = `<div class="cards">
    <div class="card"><div class="k">${T('cardTotal')}</div><div class="v">${list.length}</div></div>
    <div class="card"><div class="k">${T('cardApprove')}</div><div class="v" style="color:var(--gA)">${approve}</div></div>
    <div class="card"><div class="k">${T('cardHold')}</div><div class="v" style="color:var(--gD)">${hold}</div></div>
    <div class="card"><div class="k">${T('cardReject')}</div><div class="v" style="color:var(--gE)">${reject}</div></div>
  </div>
  <p class="hint" style="margin:-10px 0 18px">${T('dashHint')}</p>`;
  const rows = list.map(({c,r})=>`
    <tr data-open="${c.id}">
      <td><b>${esc(tt(c.name)||T('blank'))}</b><div class="hint">${esc(c.id)} · ${esc(tt(c.businessType)||'-')}</div></td>
      <td class="ctr">${esc(tt(c.country)||'-')}</td>
      <td class="num">${fmtUSD(c.deposit)}</td>
      <td class="ctr">${Number(c.settlementDays)>0?esc(c.settlementDays)+T('dayUnit')+' · '+esc(c.currency):'—'}</td>
      <td class="ctr">${fmtCov(r.coverage)}</td>
      <td class="num">${r.weighted.toFixed(1)}</td>
      <td class="ctr">${badge(r.scoreGrade)}</td>
      <td class="ctr">${badge(r.finalGrade)}</td>
      <td><div class="flaglist">${r.allFlags.length? r.allFlags.map(f=>`<span class="flag">${esc(f)}</span>`).join('') : `<span class="flag ok">${T('none')}</span>`}</div></td>
      <td><div class="comment-cell"><span class="cscore">${esc(c.scores[13])}/5</span> ${esc(tt(c.notes.comment)||'-')}</div></td>
    </tr>`).join('');
  const table = list.length ? `<div class="panel"><h3 style="display:flex;align-items:center;justify-content:space-between;gap:12px">${T('summaryTitle')} <button class="btn sm" data-act="copysummary">${T('copyFormatted')}</button></h3>
    <div class="table-wrap"><table><thead><tr>
      <th>${T('thCompany')}</th><th class="ctr">${T('thCountry')}</th><th class="num">${T('thDeposit')}</th><th class="ctr">${T('thSettle')}</th><th class="ctr">${T('thCoverage')}</th>
      <th class="num">${T('thWeighted')}</th><th class="ctr">${T('thScoreGrade')}<br><span class="hint" style="font-weight:400">${T('thScoreGradeSub')}</span></th><th class="ctr">${T('thFinal')}<br><span class="hint" style="font-weight:400">${T('thFinalSub')}</span></th><th>${T('thFlags')}</th><th>${T('thComment')}<br><span class="hint" style="font-weight:400">${T('thCommentSub')}</span></th>
    </tr></thead><tbody>${rows}</tbody></table></div></div>`
    : `<div class="panel"><div class="empty">${T('noCompanies')}</div></div>`;
  const guide = `<div class="panel"><h3>${T('guideTitle')}</h3><div class="body" style="color:#54637a;font-size:13px;line-height:1.9">${T('guideBody')}</div></div>`;
  return cards + table + guide;
}

/* ---------- companies list ---------- */
function viewCompanies(){
  const rows = DATA.companies.map(c=>{ const r=compute(c); return `
    <tr data-open="${c.id}">
      <td><b>${esc(tt(c.name)||T('blank'))}</b><div class="hint">${esc(c.id)}</div></td>
      <td class="ctr">${esc(tt(c.country)||'-')}</td>
      <td class="ctr">${esc(tt(c.businessType)||'-')}</td>
      <td class="ctr"><span class="status-chip">${esc(defLabel(STATUS_DEFS,c.status)||'-')}</span></td>
      <td class="num">${r.weighted.toFixed(1)}</td>
      <td class="ctr">${badge(r.finalGrade)}</td>
    </tr>`; }).join('');
  if(!DATA.companies.length) return `<div class="panel"><div class="empty">${T('noCompanies')}</div></div>`;
  return `<div class="panel"><h3>${T('companiesTitle')}</h3>
    <table><thead><tr><th>${T('thCompany')}</th><th class="ctr">${T('thCountry')}</th><th class="ctr">${T('thType')}</th>
    <th class="ctr">${T('thStatus')}</th><th class="num">${T('thWeighted')}</th><th class="ctr">${T('thFinal')}</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

/* ---------- settings ---------- */
function viewSettings(){
  const s = DATA.settings;
  const sum = s.weights.reduce((a,b)=>a+(Number(b)||0),0);
  const wr = ITEM_NAMES.map((n,i)=>`
    <div class="field"><label>${esc(tt(n))}</label>
    <input type="number" min="0" data-weight="${i}" value="${s.weights[i]}"></div>`).join('');
  const tr = ['A','B','C','D'].map(g=>`
    <div class="field"><label>${g} ${T('gradeMin')} (${esc(tt(GRADE_META[g].label))})</label>
    <input type="number" data-threshold="${g}" value="${s.thresholds[g]}"></div>`).join('');
  return `
  <div class="panel"><h3>${T('weightsTitle')} <span class="pill">${T('weightSum')} ${sum}</span></h3>
    <div class="body"><div class="form-grid three">${wr}</div>
    <p class="hint" style="margin-top:14px">${T('weightsHint')}</p></div></div>
  <div class="panel"><h3>${T('thresholdsTitle')}</h3>
    <div class="body"><div class="form-grid">${tr}</div>
    <p class="hint" style="margin-top:14px">A≥${s.thresholds.A} · B≥${s.thresholds.B} · C≥${s.thresholds.C} · D≥${s.thresholds.D} · ${LANG==='en'?'below that E (reject). Any red flag downgrades to C or D regardless of score.':'그 미만 E(거절추천). 레드플래그 발견 시 점수와 무관하게 C 또는 D로 강등됩니다.'}</p></div></div>`;
}

/* ---------- company detail ---------- */
function viewCompany(){
  const c = getCompany(CURRENT);
  if(!c) return `<div class="empty">${T('notFound')}</div>`;
  const r = compute(c);
  const tabs = [['info',T('tabInfo')],['deal',T('tabDeal')],['docs',T('tabDocs')],['risk',T('tabRisk')],['report',T('tabReport')],['history',T('tabHistory')]];
  const tabBar = `<div class="tabs no-print">${tabs.map(([k,l])=>`<button data-tab="${k}" class="${TAB===k?'active':''}">${esc(l)}</button>`).join('')}</div>`;
  const head = `<div class="toolbar no-print">
      <div><span style="font-size:17px;font-weight:700">${esc(tt(c.name)||T('blank'))}</span>
      <span class="pill">${esc(c.id)}</span> <span class="status-chip">${esc(defLabel(STATUS_DEFS,c.status))}</span></div>
      <div class="spacer"></div>
      <div>${badge(r.finalGrade)}</div>
    </div>`;
  let body = '';
  if(TAB==='info') body = tabInfo(c);
  else if(TAB==='deal') body = tabDeal(c);
  else if(TAB==='docs') body = tabDocs(c);
  else if(TAB==='risk') body = tabRisk(c,r);
  else if(TAB==='report') body = tabReport(c,r);
  else if(TAB==='history') body = tabHistory(c);
  return head + tabBar + `<div style="margin-top:18px">${body}</div>`;
}

function fld(label,field,value,type='text',hint=''){
  return `<div class="field"><label>${label}</label>
    <input type="${type}" data-field="${field}" value="${esc(tt(value))}">${hint?`<span class="hint">${hint}</span>`:''}</div>`;
}
function selPlain(label,field,value,list,hint=''){
  return `<div class="field"><label>${label}</label>
    <select data-field="${field}">${optsPlain(list, tt(value))}</select>${hint?`<span class="hint">${hint}</span>`:''}</div>`;
}
function selDefs(label,field,value,defs,hint=''){
  return `<div class="field"><label>${label}</label>
    <select data-field="${field}">${optsDefs(defs,value)}</select>${hint?`<span class="hint">${hint}</span>`:''}</div>`;
}

function tabInfo(c){
  return `<div class="panel"><h3>${T('infoTitle')}</h3><div class="body"><div class="form-grid">
    ${fld(T('fName'),'name',c.name)}
    ${selPlain(T('fCountry'),'country',c.country,['',...COUNTRY_OPTS[LANG]])}
    ${selPlain(T('fBizType'),'businessType',c.businessType,['',...BIZTYPES])}
    ${fld(T('fMarket'),'market',c.market)}
    ${fld(T('fCustomer'),'customerType',c.customerType)}
    ${fld(T('fWebsite'),'website',c.website,'text',T('fWebsiteHint'))}
    ${fld(T('fBizReg'),'bizRegNo',c.bizRegNo,'text',T('fBizRegHint'))}
    ${fld(T('fFounded'),'foundedYear',c.foundedYear,'number')}
    ${fld(T('fRep'),'representative',c.representative,'text',T('fRepHint'))}
    ${fld(T('fContact'),'contact',c.contact)}
    ${fld(T('fEmail'),'email',c.email)}
    ${selDefs(T('fStatus'),'status',c.status,STATUS_DEFS)}
  </div></div></div>`;
}
function tabDeal(c){
  const r = compute(c);
  return `<div class="panel"><h3>${T('dealTitle')}</h3><div class="body"><div class="form-grid">
    ${fld(T('fDeposit'),'deposit',c.deposit,'number')}
    ${fld(T('fSettle'),'settlementDays',c.settlementDays,'number',T('fSettleHint'))}
    ${selPlain(T('fCurrency'),'currency',c.currency,CURRENCIES)}
    ${selDefs(T('fCredit'),'creditRequired',c.creditRequired,CREDIT_DEFS,T('fCreditHint'))}
    ${fld(T('fGMV'),'monthlyGMV',c.monthlyGMV,'number',T('fGMVHint'))}
    ${fld(T('fSalesRegion'),'salesRegion',c.salesRegion)}
    ${fld(T('fProducts'),'products',c.products)}
    ${selDefs(T('fApi'),'apiIntegration',c.apiIntegration,YNP_DEFS)}
    ${selDefs(T('fManual'),'manualBooking',c.manualBooking,MANUAL_DEFS)}
    ${selDefs(T('fCancelRisk'),'cancelNoshowRisk',c.cancelNoshowRisk,RISK_DEFS)}
  </div>
  <div class="result" style="margin-top:18px">
    <div class="box"><div class="k">${T('boxExposure')}</div><div class="v">${fmtUSD(r.exposure)}</div><div class="hint">${T('boxExposureHint')}</div></div>
    <div class="box"><div class="k">${T('boxReqDep')} (${LANG==='en'?'grade':'등급'} ${r.scoreGrade}·${Math.round(r.reqCov*100)}%)</div><div class="v">${fmtUSD(r.requiredDeposit)}</div><div class="hint">${T('boxReqDepHint')}</div></div>
    <div class="box"><div class="k">${T('boxDepOk')}</div><div class="v" style="color:${r.depositShort?'var(--gE)':'var(--gA)'}">${r.exposure>0?(r.depositShort?T('boxShort'):T('boxSufficient')):'—'}</div><div class="hint">${T('boxCurrent')} ${fmtUSD(c.deposit)} · ${T('thCoverage')} ${fmtCov(r.coverage)}</div></div>
  </div></div></div>`;
}
function tabDocs(c){
  const fileRows = c.documents.length
    ? c.documents.map(d=>`<a class="filecard" href="Document/${encodeURIComponent(d.file)}" target="_blank" rel="noopener">
        <span class="fico">${/\.pdf$/i.test(d.file)?'PDF':/\.(jpg|jpeg|png)$/i.test(d.file)?'IMG':'FILE'}</span>
        <span class="finfo"><b>${esc(tt(d.name))}</b><span class="hint">${esc(d.file)}</span></span></a>`).join('')
    : `<div class="hint" style="padding:6px 0">${T('noFiles')}</div>`;
  const folderPanel = `<div class="panel"><h3>${T('folderTitle')} <span class="pill">${T('fromDocument')}</span></h3>
    <div class="body">
      <p class="hint" style="margin:0 0 12px">${T('folderHint')}</p>
      <div class="filelist">${fileRows}</div>
    </div></div>`;
  const docRows = DOC_DEFS.map(d=>`<div class="field"><label>${esc(d[LANG])}</label>
    <select data-doc="${esc(d.id)}">${optsDefs(DOCV_DEFS,c.docs[d.id])}</select></div>`).join('');
  const pubRows = PUBLIC_DEFS.map(d=>`<div class="field"><label>${esc(d[LANG])}${d.neg?' <span class="hint">'+T('negTag')+'</span>':''}</label>
    <select data-public="${esc(d.id)}">${optsDefs(YN_DEFS,c.public[d.id])}</select></div>`).join('');
  const missing = DOC_KEYS.filter(k=>c.docs[k]==='notSubmitted').length;
  const missingPill = LANG==='en' ? (missing+' '+T('notSubmittedN')) : (T('notSubmittedN')+' '+missing+'건');
  return folderPanel + `<div class="panel"><h3>${T('docsTitle')} <span class="pill">${missingPill}</span></h3>
    <div class="body"><div class="form-grid three">${docRows}</div></div></div>
    <div class="panel"><h3>${T('pubTitle')}</h3>
    <div class="body"><div class="form-grid three">${pubRows}</div>
    <p class="hint" style="margin-top:12px">${T('pubHint')}</p>
    </div></div>`;
}
function tabRisk(c,r){
  const rows = ITEM_NAMES.map((n,i)=>`
    <div class="score-row">
      <div class="name">${esc(tt(n))}<span class="wt">${T('weightLabel')} ${DATA.settings.weights[i]}</span></div>
      <input type="range" min="1" max="5" step="1" data-score="${i}" value="${c.scores[i]}">
      <div class="val" data-scoreval="${i}">${c.scores[i]}</div>
    </div>`).join('');
  return `<div class="panel"><h3>${T('riskTitle')} <span class="pill">${T('riskPill')}</span></h3>
    <div class="body">${rows}</div></div>
    <div class="panel" id="risk-result"><h3>${T('resultTitle')}</h3><div class="body">${riskResultHTML(r)}</div></div>
    <div class="panel"><h3>${T('commentsTitle')}</h3><div class="body"><div class="form-grid">
      <div class="field full"><label>${T('nComment')} <span class="hint">${T('nCommentHint')}</span></label><textarea data-note="comment">${esc(tt(c.notes.comment))}</textarea></div>
      <div class="field full"><label>${T('nExpect')}</label><textarea data-note="expect">${esc(tt(c.notes.expect))}</textarea></div>
      <div class="field full"><label>${T('nCheck')}</label><textarea data-note="check">${esc(tt(c.notes.check))}</textarea></div>
      <div class="field full"><label>${T('nOpinion')}</label><textarea data-note="opinion">${esc(tt(c.notes.opinion))}</textarea></div>
    </div></div></div>`;
}
function riskResultHTML(r){
  const flags = r.allFlags.length
    ? r.allFlags.map(f=>`<span class="flag">${esc(f)}</span>`).join('')
    : `<span class="flag ok">${T('noFlags')}</span>`;
  return `<div class="result">
      <div class="box"><div class="k">${T('boxWeighted')}</div><div class="v">${r.weighted.toFixed(1)}<span style="font-size:13px;color:var(--muted)"> /100</span></div></div>
      <div class="box"><div class="k">${T('boxScoreGrade')}</div><div class="v">${badge(r.scoreGrade)}</div></div>
      <div class="box"><div class="k">${T('boxCoverage')}</div><div class="v">${fmtCov(r.coverage)}</div></div>
      <div class="box" style="background:#fff4ee;border-color:#f4d5c2"><div class="k">${T('boxFinal')}</div><div class="v">${badge(r.finalGrade)}</div></div>
    </div><div class="flags">${flags}</div>`;
}
function tabReport(c,r){
  const flags = r.allFlags.length ? r.allFlags.join(' · ') : T('none');
  const row = (k,v)=>`<tr><th>${k}</th><td>${v}</td></tr>`;
  const today = new Date().toISOString().slice(0,10);
  return `<div class="toolbar no-print"><div class="spacer"></div>
      <button class="btn" data-act="copyreport">${T('copyText')}</button>
      <button class="btn primary" data-act="print">${T('printPdf')}</button></div>
    <div class="report" id="report">
      <h2>${T('reportH2')}</h2>
      <div class="rmeta">${T('reportMeta')} · ${today} · ${T('rMetaBy')}</div>
      <table>
        ${row(T('rCompany'), esc(tt(c.name)||'-'))}
        ${row(T('rCountryType'), esc(tt(c.country)||'-')+' / '+esc(tt(c.businessType)||'-'))}
        ${row(T('rFoundedRep'), esc(tt(c.foundedYear)||'-')+' / '+esc(tt(c.representative)||'-'))}
        ${row(T('rDeposit'), fmtUSD(c.deposit)+' ('+esc(c.currency)+')')}
        ${row(T('rSettle'), esc(c.settlementDays)+' '+T('rDays'))}
        ${row(T('rGMV'), fmtUSD(c.monthlyGMV)+' · '+T('rCoverage')+' '+fmtCov(r.coverage))}
        ${row(T('rProducts'), esc(tt(c.products)||'-'))}
        ${row(T('rApiManual'), esc(defLabel(YNP_DEFS,c.apiIntegration))+' / '+esc(defLabel(MANUAL_DEFS,c.manualBooking)))}
        ${row(T('rEndUsers'), esc(tt(c.customerType)||'-'))}
        ${row(T('rRiskScore'), r.weighted.toFixed(1)+' / 100 ('+T('rScoreGrade')+' '+r.scoreGrade+')')}
        ${row(T('rFinal'), badge(r.finalGrade))}
        ${row(T('rFlags'), esc(flags))}
      </table>
      <div class="sec">${T('secExpect')}</div><div>${esc(tt(c.notes.expect)||'-')}</div>
      <div class="sec">${T('secCheck')}</div><div>${esc(tt(c.notes.check)||'-')}</div>
      <div class="sec">${T('secOpinion')}</div><div>${esc(tt(c.notes.opinion)||'-')}</div>
      <div class="sec">${T('secComment')} <span class="hint" style="font-weight:400">(${T('secCommentScore')} ${esc(c.scores[13])}/5)</span></div><div>${esc(tt(c.notes.comment)||'-')}</div>
      <div class="decision">
        <b>${T('reportCond')}</b><br>
        ${T('reportCondBody')}
      </div>
      <div class="sign">${T('reportSign')}</div>
    </div>`;
}
function tabHistory(c){
  const rows = c.history.map((h,i)=>`<tr>
      <td>${esc(defLabel(STAGE_DEFS,h.stage)||tt(h.stage))}</td><td>${esc(tt(h.reviewer))}</td>
      <td class="ctr"><span class="status-chip">${esc(defLabel(DECISION_DEFS,h.decision)||tt(h.decision))}</span></td>
      <td>${esc(tt(h.comment))}</td><td class="ctr">${esc(h.date)}</td>
      <td class="ctr"><button class="btn sm ghost" data-delhist="${i}">${T('hDelete')}</button></td>
    </tr>`).join('');
  return `<div class="panel"><h3>${T('histTitle')}</h3>
    <div class="body">
      <table><thead><tr><th>${T('hStage')}</th><th>${T('hReviewer')}</th><th class="ctr">${T('hDecision')}</th><th>${T('hComment')}</th><th class="ctr">${T('hDate')}</th><th></th></tr></thead>
      <tbody>${rows||`<tr><td colspan="6" class="hint" style="text-align:center;padding:20px">${T('hNoRecords')}</td></tr>`}</tbody></table>
      <div class="form-grid" style="margin-top:16px;grid-template-columns:repeat(5,1fr) auto;align-items:end">
        <div class="field"><label>${T('hStage')}</label><select id="h-stage">${optsDefs(STAGE_DEFS,STAGE_DEFS[0].id)}</select></div>
        <div class="field"><label>${T('hReviewer')}</label><input id="h-reviewer" placeholder="${T('hReviewerPh')}"></div>
        <div class="field"><label>${T('hDecision')}</label><select id="h-decision">${optsDefs(DECISION_DEFS,DECISION_DEFS[0].id)}</select></div>
        <div class="field"><label>${T('hComment')}</label><input id="h-comment" placeholder="${T('hCommentPh')}"></div>
        <div class="field"><label>${T('hDate')}</label><input id="h-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
        <button class="btn primary" data-act="addhist">${T('hAdd')}</button>
      </div>
    </div></div>`;
}

/* ---------- events ---------- */
document.getElementById('nav').addEventListener('click', e=>{
  const a = e.target.closest('a'); if(!a) return;
  VIEW = a.dataset.view; render();
});
const langToggle = document.getElementById('lang-toggle');
if(langToggle) langToggle.addEventListener('click', e=>{ const b=e.target.closest('[data-lang]'); if(b) setLang(b.dataset.lang); });
document.getElementById('top-actions').addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b) return; act(b.dataset.act);
});
function act(a){
  if(a==='add'){ const c=blankCompany(); DATA.companies.push(c); save(); CURRENT=c.id; TAB='info'; VIEW='company'; render(); }
  else if(a==='back'){ VIEW='companies'; render(); }
  else if(a==='delete'){ if(confirm(T('deleteConfirm'))){ DATA.companies=DATA.companies.filter(c=>c.id!==CURRENT); save(); VIEW='companies'; render(); } }
  else if(a==='reset'){ resetSeed(); }
  else if(a==='export'){ exportJSON(); }
  else if(a==='import'){ importJSON(); }
  else if(a==='print'){ window.print(); }
  else if(a==='copyreport'){ copyReport(); }
  else if(a==='addhist'){ addHist(); }
  else if(a==='copysummary'){ copySummary(); }
}

/* content-level delegation (inputs, tabs, row open) */
const content = document.getElementById('content');
content.addEventListener('click', e=>{
  const tab = e.target.closest('[data-tab]');
  if(tab){ TAB = tab.dataset.tab; render(); return; }
  const open = e.target.closest('[data-open]');
  if(open){ CURRENT = open.dataset.open; TAB='info'; VIEW='company'; render(); return; }
  const delh = e.target.closest('[data-delhist]');
  if(delh){ const c=getCompany(CURRENT); c.history.splice(Number(delh.dataset.delhist),1); save(); render(); return; }
  const b = e.target.closest('button[data-act]');
  if(b){ act(b.dataset.act); return; }
});
content.addEventListener('input', e=>{
  const t = e.target;
  if(t.dataset.score!==undefined){
    const c=getCompany(CURRENT); const i=Number(t.dataset.score);
    c.scores[i]=Number(t.value);
    const v=content.querySelector(`[data-scoreval="${i}"]`); if(v) v.textContent=t.value;
    liveRisk(); saveQuiet(); return;
  }
});
content.addEventListener('change', e=>{
  const t=e.target; const c = VIEW==='company'?getCompany(CURRENT):null;
  if(t.dataset.field!==undefined && c){ c[t.dataset.field]= t.type==='number'?Number(t.value):t.value; save(); if(['deposit','settlementDays','monthlyGMV','creditRequired','website','bizRegNo','representative'].includes(t.dataset.field)) softRefresh(); }
  else if(t.dataset.doc!==undefined && c){ c.docs[t.dataset.doc]=t.value; save(); }
  else if(t.dataset.public!==undefined && c){ c.public[t.dataset.public]=t.value; save(); softRefresh(); }
  else if(t.dataset.note!==undefined && c){ c.notes[t.dataset.note]=t.value; save(); }
  else if(t.dataset.weight!==undefined){ DATA.settings.weights[Number(t.dataset.weight)]=Number(t.value); save(); render(); }
  else if(t.dataset.threshold!==undefined){ DATA.settings.thresholds[t.dataset.threshold]=Number(t.value); save(); render(); }
  else if(t.dataset.score!==undefined && c){ c.scores[Number(t.dataset.score)]=Number(t.value); saveQuiet(); liveRisk(); }
});
function saveQuiet(){ localStorage.setItem(STORE_KEY, JSON.stringify(DATA)); }
function liveRisk(){
  const c=getCompany(CURRENT); const box=document.querySelector('#risk-result .body');
  if(box) box.innerHTML = riskResultHTML(compute(c));
  refreshHeaderBadge();
}
function softRefresh(){
  const c=getCompany(CURRENT); const r=compute(c);
  refreshHeaderBadge();
  const cov=document.querySelector('#risk-result .body'); if(cov) cov.innerHTML=riskResultHTML(r);
  if(TAB==='deal'||TAB==='docs') render();
}
function refreshHeaderBadge(){
  const c=getCompany(CURRENT); if(!c) return; const r=compute(c);
  const hb=document.querySelector('.toolbar .badge'); if(hb){ hb.outerHTML=badge(r.finalGrade); }
}

/* ---------- history add ---------- */
function addHist(){
  const c=getCompany(CURRENT);
  const stage=document.getElementById('h-stage').value;
  const reviewer=document.getElementById('h-reviewer').value.trim();
  const decision=document.getElementById('h-decision').value;
  const comment=document.getElementById('h-comment').value.trim();
  const date=document.getElementById('h-date').value;
  if(!reviewer){ alert(T('alertReviewer')); return; }
  c.history.push({stage,reviewer,decision,comment,date}); save(); render();
}

/* ---------- clipboard ---------- */
function gradeColor(g){ return {A:'#1e9e57',B:'#3aa6a0',C:'#e0a400',D:'#e6791f',E:'#d63b3b'}[g]||'#888'; }
function copyRich(html, text, okMsg){
  if(navigator.clipboard && window.ClipboardItem && window.isSecureContext){
    try{
      const item = new ClipboardItem({
        'text/html': new Blob([html], {type:'text/html'}),
        'text/plain': new Blob([text], {type:'text/plain'})
      });
      navigator.clipboard.write([item]).then(()=>alert(okMsg), ()=>fallbackRich(html, text, okMsg));
      return;
    }catch(e){}
  }
  fallbackRich(html, text, okMsg);
}
function fallbackRich(html, text, okMsg){
  const div=document.createElement('div');
  div.contentEditable='true'; div.innerHTML=html;
  div.style.position='fixed'; div.style.top='-1000px'; div.style.opacity='0';
  document.body.appendChild(div);
  const range=document.createRange(); range.selectNodeContents(div);
  const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  let ok=false; try{ ok=document.execCommand('copy'); }catch(e){}
  sel.removeAllRanges(); document.body.removeChild(div);
  alert(ok ? okMsg : T('copyFailManual'));
}

/* ---------- summary table copy (formatted HTML + TSV) ---------- */
function copySummary(){
  const clean = s => String(s==null?'':s).replace(/[\t\r\n]+/g,' ').trim();
  const cols = LANG==='en'
    ? ['Company','Country','Deposit(USD)','Settlement','Coverage','Weighted score','Score grade','Final verdict','Red flags','Reviewer comment(score)']
    : ['업체','국가','Deposit(USD)','정산주기','커버율','가중점수','점수등급','최종판정','레드플래그','담당자 코멘트(점수)'];
  const th = c => `<th style="border:1px solid #b9c2d0;padding:7px 10px;background:#1F4E78;color:#fff;text-align:left;white-space:nowrap">${c}</th>`;
  const td = (c,extra) => `<td style="border:1px solid #d6dce6;padding:6px 10px;vertical-align:top;${extra||''}">${c}</td>`;
  const badgeC = g => `<span style="display:inline-block;background:${gradeColor(g)};color:#fff;padding:2px 8px;border-radius:10px;font-weight:700;font-size:11px;white-space:nowrap">${g}·${esc(tt(GRADE_META[g].label))}</span>`;
  let html = `<table style="border-collapse:collapse;font-family:'Malgun Gothic',Arial,sans-serif;font-size:12px;color:#1e2632"><thead><tr>${cols.map(th).join('')}</tr></thead><tbody>`;
  const tlines = [cols.join('\t')];
  DATA.companies.forEach(c=>{
    const r = compute(c);
    const cov = r.coverage==null?'—':r.coverage.toFixed(2)+'x';
    const flags = r.allFlags.length? r.allFlags.join('; '):T('none');
    const dep = '$'+(Number(c.deposit)||0).toLocaleString('en-US');
    html += '<tr>'+
      td('<b>'+esc(tt(c.name))+'</b><br><span style="color:#7a869a">'+esc(c.id)+' · '+esc(tt(c.businessType))+'</span>')+
      td(esc(tt(c.country)),'white-space:nowrap')+
      td(dep,'text-align:right;white-space:nowrap')+
      td(Number(c.settlementDays)>0?esc(c.settlementDays+(LANG==='en'?'d':'일')+' · '+c.currency):'—','text-align:center;white-space:nowrap')+
      td(cov,'text-align:center;white-space:nowrap')+
      td(r.weighted.toFixed(1),'text-align:right')+
      td(badgeC(r.scoreGrade),'text-align:center')+
      td(badgeC(r.finalGrade),'text-align:center')+
      td(esc(flags),'color:#b23b3b')+
      td('<b>'+esc(c.scores[13])+'/5</b> '+esc(tt(c.notes.comment)||''),'min-width:260px;color:#54637a')+
      '</tr>';
    tlines.push([tt(c.name)+' ('+c.id+')', tt(c.country), dep, (Number(c.settlementDays)>0?c.settlementDays+(LANG==='en'?'d':'일')+' · '+c.currency:'—'), cov, r.weighted.toFixed(1), r.scoreGrade,
      r.finalGrade+'-'+tt(GRADE_META[r.finalGrade].label), flags, '('+c.scores[13]+'/5) '+(tt(c.notes.comment)||'')].map(clean).join('\t'));
  });
  html += '</tbody></table>';
  const okMsg = LANG==='en'
    ? (DATA.companies.length+' partner risk summaries copied with formatting. Paste into email · Word · Excel.')
    : (DATA.companies.length+'개 업체 리스크 요약이 서식 포함으로 복사되었습니다. 메일·Word·Excel에 붙여넣기 하세요.');
  copyRich(html, tlines.join('\n'), okMsg);
}

/* ---------- report copy ---------- */
function copyReport(){
  const c=getCompany(CURRENT); const r=compute(c);
  const txt =
`${T('reportTxtH')}
${T('rtCompany')}: ${tt(c.name)}
${T('rtCountry')}: ${tt(c.country)}
${T('rtBizType')}: ${tt(c.businessType)}
${T('rtDeal')}: Deposit ${fmtUSD(c.deposit)} / ${T('rtSettle')} ${c.settlementDays}${LANG==='en'?' days':'일'} / ${c.currency}
Deposit: ${fmtUSD(c.deposit)}
${T('rSettle')}: ${c.settlementDays}${LANG==='en'?' days':'일'}
${T('rGMV')}: ${fmtUSD(c.monthlyGMV)} (${T('rCoverage')} ${fmtCov(r.coverage)})
${T('rtEndUser')}: ${tt(c.customerType)}
${T('rtRiskScore')}: ${r.weighted.toFixed(1)}/100 (${T('rtScoreGrade')} ${r.scoreGrade})
${T('rtFinal')}: ${r.finalGrade} · ${tt(GRADE_META[r.finalGrade].label)}
${T('rtFlags')}: ${r.allFlags.length?r.allFlags.join(', '):T('none')}
${T('rtExpect')}: ${tt(c.notes.expect)}
${T('rtCheck')}: ${tt(c.notes.check)}
${T('rtOpinion')}: ${tt(c.notes.opinion)}
${T('rtComment')} (${T('rtScore')} ${c.scores[13]}/5): ${tt(c.notes.comment)}`;
  navigator.clipboard.writeText(txt).then(()=>alert(T('reportCopyOk')),
    ()=>alert(T('reportCopyFail')));
}

/* ---------- import / export ---------- */
function exportJSON(){
  const blob=new Blob([JSON.stringify(DATA,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download='omh_prg_data.json'; a.click(); URL.revokeObjectURL(url);
}
function importJSON(){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='.json,application/json';
  inp.onchange=()=>{ const f=inp.files[0]; if(!f) return; const rd=new FileReader();
    rd.onload=()=>{ try{ const d=JSON.parse(rd.result); if(!d.companies) throw 0;
      DATA=migrate(d); save(); VIEW='dashboard'; render(); alert(T('importOk')); }
      catch(e){ alert(T('importInvalid')); } };
    rd.readAsText(f); };
  inp.click();
}

/* ---------- seed data (6 companies · full evaluation record retained) ---------- */
function seed(){
  const mk = (o)=> normalizeCompany(Object.assign(blankCompanyRaw(), o));
  function blankCompanyRaw(){
    return { docs:Object.fromEntries(DOC_KEYS.map(k=>[k,'submitted'])),
      public:Object.fromEntries(PUBLIC_KEYS.map(k=>[k, NEG_PUBLIC.includes(k)?'N':'Y'])),
      notes:{}, history:[], settlementDays:14, currency:'USD', creditRequired:'N',
      apiIntegration:'Y', manualBooking:'N', cancelNoshowRisk:'medium', status:'review' };
  }
  const c1 = mk({ id:'C001', name:'Huamao', country:B('중국(홍콩법인)','China (HK entity)'), businessType:'B2B',
    market:B('중국 아웃바운드','China outbound'), customerType:B('라이브커머스(샤오홍슈·더우인)·OTA·여행사 + B2C sub-agent','Live-commerce (Xiaohongshu·Douyin)·OTA·agencies + B2C sub-agents'),
    website:'huamaoly@163.com (B2B platform)', bizRegNo:'73809897-000-02-26-8 (HK BR) / 海南华茂 2019', foundedYear:2019, representative:B('법인 등기 확인(대표자 성명 자료 추가 요청)','Entity registration confirmed (representative full name pending)'),
    contact:'Huamao', email:'huamaoly@163.com', deposit:10000, settlementDays:7, monthlyGMV:50000, salesRegion:B('일본·한국·베트남·글로벌','Japan·Korea·Vietnam·global'), products:B('일본·한국·베트남·글로벌 호텔','Japan·Korea·Vietnam·global hotels'),
    scores:[4,5,5,5,4,4,4,3,2,4,3,3,4,4], status:'review',
    docs:{bizLicense:'submitted',profile:'submitted',bank:'notSubmitted',contract:'notSubmitted',settleAgree:'submitted',refs:'submitted',financials:'notSubmitted',repId:'notSubmitted'},
    public:{website:'Y',linkedin:'unknown',google:'Y',negNews:'N',lawsuit:'N',tradeRefs:'Y',domainAge:'unknown',addrExists:'Y',repHistory:'Y'},
    documents:[{name:B('사업자등록증(홍콩 BR)','Business license (HK BR)'),file:'huamao_business license 1.pdf'},{name:B('회사소개서(15p)','Company profile (15p)'),file:'Huamao introduction file 1.pdf'}],
    notes:{expect:B('홍콩법인·하이난 본사(2019 설립) 실체 확인. 60만 호텔·직계약 2000+·연 58만 RN. B2B 주력이며 B2C 플랫폼(sub-agent)도 운영. 일본·한국·베트남은 일 100~200 RN 예측. 샤오홍슈·더우인 라이브커머스·숏폼 판매, 공급사 Hotelbeds·WebBeds·Expedia·Trip.com·Rakuten·Restel·Fliggy·Meituan 등 광범위.','HK entity / Hainan HQ (est. 2019) verified. 600k hotels, 2,000+ direct contracts, ~580k RN/yr. B2B-led, also runs a B2C platform (sub-agents). Japan·Korea·Vietnam projected at ~100-200 RN/day. Sells via Xiaohongshu·Douyin live-commerce/short-video; broad supply (Hotelbeds·WebBeds·Expedia·Trip.com·Rakuten·Restel·Fliggy·Meituan).'),
      check:B('은행정보·계약서·재무제표 미제출. 대표자 개인 성명/신분 자료 추가 필요. ※정산조건 1주(7일)·USD 확정, Deposit $10,000 유지 — 등급 B 요구커버율(20%) 대비 충족.','Bank details, contract and financials not submitted. Representative personal name/ID needed. *Settlement finalized at 1 week (7 days)·USD, deposit kept at $10,000 — meets grade-B required coverage (20%).'),
      opinion:B('실체·사업모델·엔드유저·공급망 검증됨(기존 D-보류 → 상향). Deposit 상향 또는 초기 GMV 한도(예: JP/KR/VN 일 100~200 RN) 설정 시 조건부 승인(B) 가능. 재무·은행 자료 보완 권고.','Entity, business model, end-users and supply chain verified (up from prior D-hold). Conditional approval (B) feasible with a higher deposit or an initial GMV cap (e.g., JP/KR/VN 100-200 RN/day). Financial/bank docs recommended.'),
      comment:B('실체·공급망 검증 완료로 신뢰도 높게 봄(4/5). Deposit 커버율만 보완되면 승인 추천 가능. 초기 JP/KR/VN RN 한도부터 시작 권장.','Entity and supply chain verified — high confidence (4/5). Once deposit coverage is topped up, recommendable for approval. Suggest starting with JP/KR/VN RN caps.')},
    history:[{stage:'sales',reviewer:'Global OPs',decision:'hold',comment:B('서류 미비·사업자 확인 필요','Docs incomplete · business verification needed'),date:'2026-06-28'},
      {stage:'scm',reviewer:'Global OPs',decision:'proceed',comment:B('폴더 자료 검토: HK BR·회사소개서 확인, 실체·엔드유저 검증 → 보류 해소','Folder review: HK BR·company profile confirmed, entity·end-user verified → hold cleared'),date:'2026-07-03'},
      {stage:'finance',reviewer:'Global OPs',decision:'proceed',comment:B('정산조건 2주(14일)·USD 정산 합의 완료','Settlement terms agreed: 2 weeks (14 days)·USD'),date:'2026-07-08'},
      {stage:'finance',reviewer:'Global OPs',decision:'proceed',comment:B('정산주기 1주(7일) 확정(2주→1주로 변경, 노출 축소). Deposit $10,000 유지','Settlement cycle finalized to 1 week (7 days) (2wk→1wk, lower exposure). Deposit kept at $10,000'),date:'2026-07-14'}] });
  const c2 = mk({ id:'C002', name:'Linkall Travel', country:B('중국(홍콩법인)','China (HK entity)'), businessType:'B2B',
    market:B('유럽·일본·태국','Europe·Japan·Thailand'), customerType:B('B2B 여행사(대표 개발자 출신·24/7 CS)','B2B agencies (developer-founder·24/7 CS)'),
    website:'http://linkalltravel.com', bizRegNo:'70069113 (HK BR · FUNTRIP HONGKONG LIMITED)', foundedYear:2019, representative:B('확인 완료(대표: 개발자 출신)','Confirmed (founder: ex-developer)'),
    deposit:10000, monthlyGMV:30000, salesRegion:B('유럽·일본·태국','Europe·Japan·Thailand'), products:B('글로벌 호텔(Expedia·Hotelbeds·WebBeds)','Global hotels (Expedia·Hotelbeds·WebBeds)'),
    scores:[4,4,3,3,2,2,5,3,2,5,4,3,5,5],
    docs:{bizLicense:'submitted',profile:'submitted',bank:'submitted',contract:'submitted',settleAgree:'submitted',refs:'submitted',financials:'notSubmitted',repId:'submitted'},
    notes:{expect:B('홍콩법인 FUNTRIP HONGKONG LIMITED(BR 70069113, 퀸즈로드센트럴 145-149) 실체 확인, 웹사이트 linkalltravel.com. 최근 연 TTV 9억 HKD(~1.15억 USD) 대규모 거래. 대표 개발자 출신(연동 2~3일), 일 5,000~6,000건 예약(일본 ~30%), 24/7 CS.',"HK entity FUNTRIP HONGKONG LIMITED (BR 70069113, 145-149 Queen's Road Central) verified; website linkalltravel.com. Recent annual TTV HKD 900M (~USD 115M), large scale. Developer-founder (2-3 day integration), 5,000-6,000 bookings/day (~30% Japan), 24/7 CS."),
      check:B('공급사가 Expedia·Hotelbeds·WebBeds 등 대형 애그리게이터 중심 → 유니크 인벤토리·기존 채널 중복도 확인 필요. 감사 재무제표 미제출(TTV 9억 HKD는 자기신고). Deposit 커버율 0.71x 부족.','Supply is aggregator-heavy (Expedia·Hotelbeds·WebBeds) → check unique inventory and overlap with existing channels. Audited financials not submitted (HKD 900M TTV is self-reported). Deposit coverage 0.71x — short.'),
      opinion:B('홍콩법인·대규모 TTV·기술력 확인으로 점수등급 B 수준(기존 C→상향). Deposit 상향 시 승인 가능. 인벤토리 차별성·재무제표만 보완 권고.','HK entity·large TTV·tech capability confirmed → score grade B (up from prior C). Approvable with a higher deposit. Recommend only shoring up inventory differentiation and financials.'),
      comment:B('홍콩법인·9억 HKD TTV로 실체·규모 확인, 신뢰도 상향(5/5). 남은 과제는 애그리게이터 리셀 중복과 Deposit 부족 → Deposit 보완 시 승인 추천.','HK entity·HKD 900M TTV confirm scale — confidence raised (5/5). Remaining items: aggregator resale overlap and deposit shortfall → recommendable once deposit is topped up.')},
    history:[{stage:'finance',reviewer:'Global OPs',decision:'proceed',comment:B('정산조건 2주(14일)·USD 정산 합의 완료','Settlement terms agreed: 2 weeks (14 days)·USD'),date:'2026-07-08'}] });
  const c3 = mk({ id:'C003', name:'Wingpulse (WINGSPULSE TECH)', country:B('홍콩(중국계)','Hong Kong (China-based)'), businessType:'B2B/TMC',
    market:B('호텔 직계약+LCC 항공 (Travel Tech)','Hotel direct-contract + LCC air (Travel Tech)'), customerType:B('DMC·여행사·OTA·TMC','DMC·agencies·OTA·TMC'),
    website:'www.wingspulse.com / info@wingspulse.com', bizRegNo:'51588485 (HK BR)', foundedYear:2025, representative:B('HE PENG(贺鹏), 단독이사','HE PENG (贺鹏), sole director'),
    contact:'WingsPulse', email:'info@wingspulse.com', deposit:10000, monthlyGMV:40000, salesRegion:B('동남아·한국·중국(HK·대만·마카오)','SE Asia·Korea·China (HK·Taiwan·Macau)'), products:B('역내 호텔 260+ 직계약 · LCC 항공','260+ direct-contract regional hotels · LCC air'),
    scores:[2,4,3,4,3,4,3,2,2,4,3,2,4,3], status:'review',
    docs:{bizLicense:'submitted',profile:'submitted',bank:'notSubmitted',contract:'notSubmitted',settleAgree:'submitted',refs:'submitted',financials:'submitted',repId:'notSubmitted'},
    public:{website:'Y',linkedin:'unknown',google:'Y',negNews:'N',lawsuit:'N',tradeRefs:'Y',domainAge:'unknown',addrExists:'Y',repHistory:'Y'},
    documents:[{name:B('사업자등록·감사 재무제표(17p)','Business license · audited financials (17p)'),file:'Business license wingpulse 1.pdf'},{name:B('회사소개서(영문)','Company profile (English)'),file:'Wing pulse intro-English 1.jpg'}],
    notes:{expect:B('AI·시맨틱 태깅 기반 데이터 정확성·거래효율 중심 Travel Tech(홍콩·선전 거점). 동남아·한국·중국(홍콩·대만·마카오) 직계약 호텔 260+ 및 현지 DMC 협력, LCC 항공(NDC·100+ 항공사) dual-track. 밀리초 API·실시간 재고.','AI/semantic-tagging Travel Tech focused on data accuracy and transaction efficiency (HK·Shenzhen). 260+ direct-contract hotels across SE Asia·Korea·China (HK·Taiwan·Macau) plus local DMC partners; LCC air (NDC·100+ airlines) dual-track. Millisecond API·real-time inventory.'),
      check:B('★회사 제공 정보상 260+ 직계약·운영 거점이 있으나, 제출된 감사 재무제표(2026.3)는 무영업(inactive)·매출 0으로 상충. 2025.5 사명 변경(ALFA→WINGSPULSE), 자산 대부분 이사·주주 대여금. 실거래·매출 증빙 필수. Deposit 커버율 0.54x 부족.','★Company claims 260+ direct contracts and operating bases, but the submitted audited financials (Mar 2026) show inactive/zero revenue — a contradiction. Renamed May 2025 (ALFA→WINGSPULSE); assets mostly director/shareholder loans. Real-transaction·revenue proof required. Deposit coverage 0.54x — short.'),
      opinion:B('기술력·직계약 인벤토리는 긍정적이나 감사보고서상 실적 부재가 핵심 리스크 → 추가 확인(기존 보류 → 상향). 실거래 파일럿·매출 증빙 및 Deposit 상향 확인 시 조건부 승인 검토.',"Tech and direct-contract inventory are positive, but the audit's lack of results is the core risk → needs further review (up from prior hold). Consider conditional approval after a live-transaction pilot·revenue proof and a higher deposit."),
      comment:B('기술·260 직계약은 인상적이나 감사상 무영업이 마음에 걸려 신중(3/5). 소규모 실거래 파일럿으로 매출·정산 실적부터 확인 후 확대 권장.','Tech·260 direct contracts are impressive, but the inactive audit gives pause — cautious (3/5). Recommend confirming revenue/settlement track record via a small live-transaction pilot before scaling.')},
    history:[{stage:'sales',reviewer:'Global OPs',decision:'proceed',comment:B('TMC/커넥티비티 기술 파트너 후보','TMC/connectivity tech partner candidate'),date:'2026-06-27'},
      {stage:'finance',reviewer:'Global OPs',decision:'hold',comment:B('폴더 자료 검토: 감사보고서상 무영업·매출0, 사명변경 → 실적 증빙까지 보류','Folder review: audit shows inactive·zero revenue, renamed → hold pending revenue proof'),date:'2026-07-03'},
      {stage:'scm',reviewer:'Global OPs',decision:'proceed',comment:B('추가정보(260+ 직계약·DMC 협력) 반영해 상향, 단 감사상 무영업과 상충 → 실거래 증빙 조건 추가확인','Raised on added info (260+ direct contracts·DMC partners); conflicts with inactive audit → conditional, needs live-transaction proof'),date:'2026-07-03'},
      {stage:'finance',reviewer:'Global OPs',decision:'proceed',comment:B('정산조건 2주(14일)·USD 정산 합의 완료','Settlement terms agreed: 2 weeks (14 days)·USD'),date:'2026-07-08'}] });
  // Happy Travel (C004): CEO approval completed (2026-07-06) — retained per the full-record-retention policy
  const c4 = mk({ id:'C004', name:'Happy Travel', country:B('두바이(UAE)','Dubai (UAE)'), businessType:'B2B/TMC',
    market:B('중동','Middle East'), customerType:B('중동 기업/여행사(태국 호텔 수요)','Middle East corporates/agencies (Thailand hotel demand)'),
    website:'https://happytravel.example', bizRegNo:'AE-DXB-xxxxx', foundedYear:2018, representative:B('확인 완료','Confirmed'),
    deposit:30000, monthlyGMV:60000, salesRegion:B('태국','Thailand'), products:B('태국 호텔','Thailand hotels'), manualBooking:'Y', apiIntegration:'partial',
    scores:[4,4,4,4,4,3,5,4,3,3,3,3,4,4], status:'approved',
    notes:{expect:B('중동 고객사 통한 태국 호텔 볼륨 증가 기대, Deposit USD 30,000로 상대적 견고','Expected Thailand hotel volume growth via Middle East clients; relatively solid with a USD 30,000 deposit'),
      check:B('수기예약 비중·중동 정산/법무 리스크 확인 필요','Confirm manual-booking share and Middle East settlement/legal risk'),
      opinion:B('종합 리스크 낮음. 초기 3개월 GMV 한도·모니터링 조건부 승인 추천 → 대표이사 승인 완료(2026-07-06).','Overall low risk. Conditional approval recommended with an initial 3-month GMV cap·monitoring → CEO approval completed (2026-07-06).'),
      comment:B('Deposit 30k로 커버율 견고, 태국 볼륨 목적 명확(4/5). 초기 3개월 모니터링 조건으로 승인 추천.','Solid coverage with the 30k deposit, clear Thailand-volume purpose (4/5). Recommend approval with initial 3-month monitoring.')},
    history:[
      {stage:'sales',reviewer:'Global OPs',decision:'proceed',comment:B('중동 태국호텔 볼륨 목적, Deposit 30k','Middle East → Thailand hotel volume, deposit 30k'),date:'2026-06-25'},
      {stage:'scm',reviewer:B('SCM팀','SCM team'),decision:'proceed',comment:B('엔드유저·인벤토리 적정','End-users·inventory appropriate'),date:'2026-06-27'},
      {stage:'finance',reviewer:B('재무팀','Finance team'),decision:'proceed',comment:B('커버율 1.07x, GMV 한도 조건','Coverage 1.07x, GMV cap condition'),date:'2026-06-29'},
      {stage:'ceo',reviewer:B('대표이사','CEO'),decision:'approve',comment:B('대표이사 컨펌 완료·진행 확정 (초기 3개월 GMV 한도·모니터링 조건)','CEO confirmed·go decision (initial 3-month GMV cap·monitoring conditions)'),date:'2026-07-06'}] });
  const c5 = mk({ id:'C005', name:B('Ohmyhotel (오마이호텔앤코) · 자체평가','Ohmyhotel (Oh My Hotel & Co) · self-assessment'), country:B('싱가포르 본사(한·일·베 법인)','Singapore HQ (KR·JP·VN entities)'), businessType:'B2B/B2C/SaaS',
    market:B('아시아(한·일·베·태)+글로벌','Asia (KR·JP·VN·TH) + global'), customerType:B('B2B 파트너 + B2C(ohmyhotel.com) 엔드유저','B2B partners + B2C (ohmyhotel.com) end-users'),
    website:'ohmyhotel.com / ohmyhotel.biz', bizRegNo:B('주식회사 오마이호텔앤코 (2012 설립 · DART/나이스 조회)','Oh My Hotel & Co., Ltd. (est. 2012 · DART/NICE lookup)'), foundedYear:2012, representative:B('이미순 대표(前 Vicotrip)','CEO Misoon Lee (ex-Vicotrip)'),
    contact:'Global OPs', email:'Global_OPs@ohmyhotel.com', deposit:0, settlementDays:0, currency:'KRW', creditRequired:'N', monthlyGMV:0, salesRegion:B('아시아·글로벌','Asia·global'), products:B('일·베·태·한 호텔 3,700+ 직계약','3,700+ direct-contract hotels (JP·VN·TH·KR)'), apiIntegration:'Y', manualBooking:'N', cancelNoshowRisk:'low',
    scores:[5,5,5,4,5,5,5,4,4,5,4,4,5,5], status:'approved',
    docs:{bizLicense:'submitted',profile:'submitted',bank:'submitted',contract:'submitted',settleAgree:'submitted',refs:'submitted',financials:'notSubmitted',repId:'submitted'},
    public:{website:'Y',linkedin:'Y',google:'Y',negNews:'N',lawsuit:'N',tradeRefs:'Y',domainAge:'Y',addrExists:'Y',repHistory:'Y'},
    notes:{expect:B('2012 설립, 싱가포르 본사·한/일/베 법인, 100+ 임직원. B2B(ohmyhotel.biz, 2023 오픈)·B2C(ohmyhotel.com)·OHMY SaaS 올인원 플랫폼. 아시아 3,700+ 직계약 호텔(일·베·태·한). 2024 관광진흥 국무총리상·외화 3천만 USD 유치탑, 2025 한국관광공사 글로벌챌린지 선정.',"Est. 2012; Singapore HQ with KR/JP/VN entities, 100+ staff. B2B (ohmyhotel.biz, launched 2023)·B2C (ohmyhotel.com)·OHMY SaaS all-in-one platform. 3,700+ direct-contract hotels across Asia (JP·VN·TH·KR). 2024 Prime Minister's Tourism Award·top foreign-currency earner (USD 30M), 2025 KTO Global Challenge selection."),
      check:B('자체 평가 — Deposit·정산주기 항목은 플랫폼 특성상 해당 없음(0 표기). 감사 재무제표·투자단계는 DART/나이스 조회 필요. Jobplanet 평점 2.8(내부 문화 참고).','Self-assessment — deposit/settlement items N/A by platform nature (shown as 0). Audited financials·funding stage require DART/NICE lookup. Jobplanet rating 2.8 (internal-culture reference).'),
      opinion:B('설립 이력·다국적 법인·직계약 인벤토리·수상 실적으로 신뢰도 최상위 → 프레임 기준 A(승인추천). 신규 파트너 평가의 벤치마크(기준선)로 활용.','Founding history·multinational entities·direct-contract inventory·awards put credibility at the top → grade A (recommended) per the framework. Use as the benchmark (baseline) for new-partner assessments.'),
      comment:B('우리 회사 자체 벤치마크. 실체·사업모델·인벤토리·성장성 최상위(5/5). Deposit/정산은 플랫폼 특성상 해당 없음.','Our own benchmark. Entity·business model·inventory·growth all top-tier (5/5). Deposit/settlement N/A by platform nature.')},
    documents:[] });
  const c6 = mk({ id:'C006', name:B('小云智能 (Xiaoyun AI · 샤오윈 AI)','Xiaoyun AI (小云智能)'), country:B('중국','China'), businessType:B('B2B/OTA(플랫폼)','B2B/OTA (platform)'),
    market:B('중국 아웃바운드·맞춤여행(定制游)','China outbound·customized travel (定制游)'), customerType:B('여행자·현지 가이드·맞춤여행 사업자(양면 AI 마켓플레이스)','Travelers·local guides·customized-travel merchants (two-sided AI marketplace)'),
    website:B('www.yundijie.com (云滴解 Yundijie · 구 黄包车 기반)','www.yundijie.com (Yundijie · ex-Huangbaoche)'), bizRegNo:B('미확인(확인필요) — 온보딩 시 사업자등록증·회사 포트폴리오 제공 예정','Unverified (TBC) — business license·portfolio to be provided at onboarding'), foundedYear:'', representative:B('미확인(확인필요) — ex-Go Global(GGT) 출신 창업자, 핵심팀 정보 미확보','Unverified (TBC) — ex-Go Global (GGT) founder; core team info not provided'),
    contact:'Global Sales', email:'', deposit:0, settlementDays:14, currency:'USD', monthlyGMV:0, salesRegion:B('중국·글로벌(91개국·1,823개 도시)','China·global (91 countries·1,823 cities)'), products:B('맞춤여행·가이드/현지서비스, 호텔 추천엔진(Booking·Expedia·Ctrip·道旅 연동)','Customized travel·guides/local services; hotel recommendation engine (Booking·Expedia·Ctrip·Didatravel integrated)'), apiIntegration:'Y', manualBooking:'N',
    scores:[3,4,4,4,3,3,3,2,2,4,3,3,4,3], status:'review',
    docs:{bizLicense:'notSubmitted',profile:'submitted',bank:'notSubmitted',contract:'notSubmitted',settleAgree:'notSubmitted',refs:'submitted',financials:'notSubmitted',repId:'notSubmitted'},
    public:{website:'Y',linkedin:'unknown',google:'Y',negNews:'N',lawsuit:'N',tradeRefs:'Y',domainAge:'unknown',addrExists:'unknown',repHistory:'unknown'},
    documents:[{name:B('투자유치 피치덱(중문, 12p)','Investor pitch deck (Chinese, 12p)'),file:'Xiaoyun_AI_pitch_deck_CN.pdf'},{name:B('내부 요약(국문, 1p)','Internal summary (Korean, 1p)'),file:'Xiaoyun_AI_summary_KR.pdf'},{name:B('맞춤여행 요약 보고서(영문, 2026-07-01)','Customized Travel Summary (EN, 2026-07-01)'),file:'2026-07-01_Xiaoyun_AI_Customized_Travel_Summary_EN.pdf'}],
    notes:{expect:B('AI 에이전트 기반 양면 맞춤여행 마켓플레이스("贝壳+airbnb"형). 누적 등록 가이드 108,734명(주문 수행 20,588명)·맞춤여행 사업자 20,492곳(거래 7,533곳)·91개국 1,823개 도시. 호텔 추천엔진을 운영하며 Booking·Expedia·Ctrip·道旅(Didatravel) 연동 → 오마이호텔 호텔 재고·요금의 신규 유통 채널(특히 중국 아웃바운드+맞춤여행 수요) 가능성. 노출 파트너 U-tour·CITS·飞猪·Hi Guides·샤오훙수. 맞춤여행 시장 2026~28년 4,500~6,000억 위안(비중 >20%) 성장 논리.','AI-agent two-sided customized-travel marketplace ("Beike + Airbnb" model). Cumulative 108,734 registered guides (20,588 fulfilled orders)·20,492 customized-travel merchants (7,533 transacting)·91 countries, 1,823 cities. Operates a hotel recommendation engine integrated with Booking·Expedia·Ctrip·Didatravel → potential new distribution channel for Ohmyhotel inventory·rates (esp. China outbound + customized-travel demand). Exposure partners U-tour·CITS·Feizhu·Hi Guides·Xiaohongshu. Market thesis: customized travel CNY 450-600B by 2026-28 (>20% share).'),
      check:B('★실사 서류 여전히 미비(사업자등록증·감사재무제표·대표자 실명·설립연도 미확인) — 온보딩 시 사업자등록증·회사 포트폴리오 제공 예정. [정산조건 확정] 격주(2주)·USD·결제기한 5~7일·Credit line 1:3~1:5, 분쟁 주문은 당기 청구 제외 후 후처리(싱가포르 본사 인보이스, 베트남 기술/CS팀·영어 자정까지). 초기 Deposit 요구 $30,000 — 한국 재고 경쟁력이 낮아 과다, 하향 협상 필요. OTA(Fliggy·Meituan·Elong) 1개월 전 라이브라 실물량 미발생·B2B 9월 오픈 예정. 계약서·신용조건 템플릿 법무 검토 대기. 호텔 인벤토리는 대형 애그리게이터 리셀 → 채널 중복 확인.','★Due-diligence docs still missing (business license·audited financials·representative·founding year) — to be provided at onboarding. [Settlement confirmed] biweekly·USD·5-7 day payment term·credit line 1:3-1:5; disputed orders excluded from the current billing cycle and settled later (Singapore HQ invoicing; Vietnam tech/CS team, English until midnight). Initial deposit ask USD 30,000 — high given low Korea inventory competitiveness; negotiate down. OTA (Fliggy·Meituan·Elong) went live ~1 month ago → no real volume yet; B2B launch in September. Contract·credit-terms template pending legal review. Hotel inventory resold from large aggregators → check channel overlap.'),
      opinion:B('사업모델·기술(LLM 매트릭스·호텔 추천엔진)·성장성은 매력적이나, 실사 서류 부재로 법인 실체·재무 검증 불가 → 자동 D(보류). 다음 단계: ①사업자등록증·재무제표·대표자 확인 ②요금·재고 연동방식/수익모델/정산조건 협의 ③회사 단계·투자 상태 확인. 서류 보완 시 재평가.','Business model·tech (LLM matrix·hotel recommendation engine)·growth are attractive, but entity/financials cannot be verified without due-diligence docs → automatic D (on hold). Next steps: ① confirm business license·financials·representative ② discuss rate/inventory integration/revenue model/settlement terms ③ confirm company stage·funding status. Re-assess once docs are provided.'),
      comment:B('유통 채널로서 잠재력은 크나 실사 서류가 전혀 없어 현재는 보류(3/5). 사업자·재무·대표자 확인과 정산/연동 조건 협의 후 재평가 권장.','Strong potential as a distribution channel, but with no due-diligence docs it is on hold for now (3/5). Recommend re-assessment after confirming entity·financials·representative and agreeing settlement/integration terms.')},
    history:[
      {stage:'sales',reviewer:'Global Sales',decision:'hold',comment:B('투자유치 피치덱만 확보 — 실사 서류(사업자·재무·대표자) 미비, 요금·재고 연동/정산 조건 미협의','Only an investor pitch deck on hand — due-diligence docs (business·financials·representative) missing, rate/inventory integration·settlement terms not discussed'),date:'2026-07-09'},
      {stage:'finance',reviewer:'Park Changbae (Aiden)',decision:'hold',comment:B('보고(2026-07-01): 정산 격주·USD·결제 5~7일·Credit 1:3~1:5 확인. 초기 Deposit $30k 요구 → 한국 경쟁력 대비 높아 하향 협상, 우선 연동 후 진행. 사업자등록증·포트폴리오·계약서 확보 대기.','Report (2026-07-01): biweekly·USD·5-7day·credit 1:3-1:5 confirmed. Initial $30k deposit ask → high vs Korea competitiveness; negotiate down, integrate first. Awaiting business license·portfolio·contract.'),date:'2026-07-01'}] });
  const c7 = mk({ id:'C007', name:B('돌하루팡 (주식회사 제주페이)','Dolharupang (Jeju Pay Inc.)'), country:B('한국(제주)','Korea (Jeju)'), businessType:B('B2C','B2C'),
    market:B('한국 국내 B2C(제주 예약)','Korea domestic B2C (Jeju booking)'), customerType:B('한국 여행자(B2C 엔드유저)','Korean travelers (B2C end users)'),
    website:B('www.dolharupang.com','www.dolharupang.com'), bizRegNo:B('사업자등록증 제출·확인(주식회사 제주페이)','Business license submitted·verified (Jeju Pay Inc.)'), foundedYear:2012, representative:B('사업자등록증 상 대표자 확인','Representative per business license'),
    contact:'Global Sales', email:'', deposit:30000, settlementDays:14, currency:'KRW', creditRequired:'N', monthlyGMV:0, salesRegion:B('한국(KR)','Korea (KR)'), products:B('제주 항공권·렌트카·숙소·여행티켓 통합 B2C','Jeju air·car·hotel·ticket integrated B2C'), apiIntegration:'Y', manualBooking:'N', cancelNoshowRisk:'low',
    scores:[4,4,5,4,4,3,4,3,4,4,4,4,4,4], status:'review',
    docs:{bizLicense:'submitted',profile:'submitted',bank:'notSubmitted',contract:'notSubmitted',settleAgree:'notSubmitted',refs:'submitted',financials:'notSubmitted',repId:'notSubmitted'},
    public:{website:'Y',linkedin:'unknown',google:'Y',negNews:'N',lawsuit:'N',tradeRefs:'unknown',domainAge:'unknown',addrExists:'Y',repHistory:'unknown'},
    documents:[{name:B('사업자등록증(주식회사 제주페이)','Business license (Jeju Pay Inc.)'),file:'제주페이_사업자등록증_25.09.10 (5).pdf'},{name:B('회사소개서(2025)','Company profile (2025)'),file:'2025_회사소개서.pdf'}],
    notes:{expect:B('제주 최대규모 B2C 여행 예약·가격비교 플랫폼 "돌하루팡"(주식회사 제주페이) — 2012 설립(13년 업력), "국내최초 제주 가격비교" No.1. 제주 항공권·렌트카·숙소·여행티켓 통합. 누적 이용 고객 약 930만 명, 자체 앱(iOS·Android)·네이버페이 연동, 여행 인플루언서 마케팅 활발. 제주공식 우수관광사업체·착한기업 인증. Direct API로 오마이호텔 제주·국내 호텔 재고의 대형 국내 B2C 유통 채널 가능. Deposit USD 30,000(견고), 격주(2주) 정산·통화 KRW.','Largest Jeju B2C travel booking·price-comparison platform "Dolharupang" (Jeju Pay Inc.) — founded 2012 (13 yrs), "Korea-first Jeju price comparison", No.1. Integrates Jeju air·car rental·hotels·tickets. ~9.3M cumulative customers, own apps (iOS·Android)·NaverPay, active influencer marketing. Certified Jeju official tourism operator. Via Direct API, a large domestic B2C distribution channel for Ohmyhotel Jeju·domestic hotel inventory. Deposit USD 30,000 (solid), biweekly settlement in KRW.'),
      check:B('회사소개서로 실체·규모·트래픽 검증됨(사업자등록증+회사소개서 확보). 남은 확인: 재무제표·은행정보, 계약서·정산조건 합의서(승인일), 오마이호텔向 예상 월거래액(GMV)·연동 상품범위, Deposit USD/정산 KRW 환처리 방식. 제주 특화 채널이라 국내 호텔 위주 — 글로벌 인벤토리 기여도는 별도 확인.','Company profile verifies entity·scale·traffic (business license + profile secured). Remaining: financials·bank details, contract·settlement agreement (approval date), Ohmyhotel-bound expected GMV·product scope, FX handling (USD deposit / KRW settlement). Jeju-focused channel skews domestic hotels — global inventory contribution to be assessed separately.'),
      opinion:B('2012 설립·누적 930만 고객·제주 1등 규모가 확인되어 C→B 상향(78점대). B·조건부 승인. 조건: 계약·정산조건 확정, 초기 GMV 한도 설정, 초기 3개월 모니터링, 환처리 방식 합의. 재무제표 확보 시 신뢰도 추가 상향 여지.','Verified 2012 founding·9.3M cumulative customers·#1 in Jeju → upgraded C→B (~78). B, conditional approval. Conditions: finalize contract·settlement terms, set initial GMV cap, 3-month monitoring, agree FX handling. Room for further upgrade once financials are provided.'),
      comment:B('회사소개서로 실체·규모(930만 고객·13년) 확인 → 신뢰도·엔드유저 대폭 상향(4/5). 계약·정산·GMV 확정 시 조건부 승인 권고.','Company profile confirms entity·scale (9.3M customers·13 yrs) → credibility·end-user sharply up (4/5). Recommend conditional approval once contract·settlement·GMV are finalized.')},
    history:[{stage:'sales',reviewer:'Global Sales',decision:'proceed',comment:B('신규 업체 등록 — 돌하루팡(제주페이): B2C·Direct API·Deposit USD 30k·격주 KRW 정산. 사업자등록증 확인. 예상 월거래액·계약 승인일 미정 → 검토 진행.','New partner intake — Dolharupang (Jeju Pay): B2C·Direct API·USD 30k deposit·biweekly KRW settlement. Business license verified. Expected GMV·approval date pending → proceeding to review.'),date:'2026-07-14'},
      {stage:'scm',reviewer:'Global OPs',decision:'proceed',comment:B('회사소개서(2025) 검토: 2012 설립·제주 1등·누적 930만 고객·앱/네이버페이·우수관광사업체 확인 → 실체·규모 검증, C→B 상향. 계약·정산·GMV 확정 조건.','Company profile (2025) review: est. 2012·#1 in Jeju·9.3M cumulative customers·app/NaverPay·certified operator → entity·scale verified, C→B. Pending contract·settlement·GMV.'),date:'2026-07-14'}] });
  return [c1,c2,c3,c4,c5,c6,c7];
}

/* ---------- 사용 매뉴얼 ---------- */
function manualHTML(){
  const L=(ko,en)=>LANG==='en'?en:ko;
  const s=DATA.settings, t=s.thresholds;
  const items = ITEM_NAMES.map((n,i)=>`<tr><td>${i+1}. ${esc(tt(n))}</td><td style="text-align:center">${s.weights[i]}</td></tr>`).join('');
  const gRow=(g,ko,en)=>`<tr><td><span class="mbadge" style="background:${gradeColor(g)}">${g}</span></td><td>${L(ko,en)}</td></tr>`;
  return `
  <h4>1. ${L('오마이나이스란?','What is OMH-NICE?')}</h4>
  <p>${L('신규 B2B/TMC 파트너의 거래 리스크를 표준 점수·등급으로 평가해, 대표이사 승인 전에 <b>승인/추가확인/보류/거절</b>을 빠르고 일관되게 판단하도록 돕는 내부 도구입니다. 공식 신용등급이 아니라 <b>내부 의사결정 보조용</b>입니다.','An internal tool that scores new B2B/TMC partners into a standard risk grade so decisions — <b>approve / check / hold / reject</b> — are fast and consistent before CEO sign-off. It is a decision aid, not an official credit rating.')}</p>

  <h4>2. ${L('평가 항목 & 점수','Scoring items & points')}</h4>
  <p>${L('담당자가 <b>14개 항목</b>을 각 <b>1~5점</b>(5=저위험/양호)으로 매깁니다. 항목마다 가중치가 다르며, 가중치 합계를 <b>100점 만점으로 정규화</b>합니다.','A reviewer rates <b>14 items</b> each <b>1–5</b> (5 = low risk/best). Items are weighted and <b>normalized to a 100-point scale</b>.')}</p>
  <p><code>${L('가중점수 = Σ(항목점수 ÷ 5 × 가중치) ÷ 가중치합 × 100','Weighted = Σ(item ÷ 5 × weight) ÷ Σweights × 100')}</code></p>
  <table><thead><tr><th>${L('항목','Item')}</th><th style="text-align:center;width:72px">${L('가중치','Weight')}</th></tr></thead><tbody>${items}</tbody></table>
  <p style="color:var(--muted);font-size:12px">${L('※ ‘기존고객 중복도’는 낮을수록 높은 점수(중복 적을수록 좋음). ‘담당자 코멘트 점수’는 담당자의 종합 주관 평가입니다.','* ‘Existing-customer overlap’ scores higher when lower. ‘Reviewer comment score’ is the reviewer’s overall subjective rating.')}</p>

  <h4>3. ${L('등급 기준','Grade thresholds')}</h4>
  <table><thead><tr><th style="width:64px">${L('등급','Grade')}</th><th>${L('가중점수 / 의미','Weighted score / meaning')}</th></tr></thead><tbody>
    ${gRow('A',`≥ ${t.A} · 승인 추천`,`≥ ${t.A} · Approve`)}
    ${gRow('B',`≥ ${t.B} · 조건부 승인`,`≥ ${t.B} · Conditional`)}
    ${gRow('C',`≥ ${t.C} · 추가 확인 필요`,`≥ ${t.C} · Needs check`)}
    ${gRow('D',`≥ ${t.D} · 보류`,`≥ ${t.D} · Hold`)}
    ${gRow('E',`< ${t.D} · 거절 추천`,`< ${t.D} · Reject`)}
  </tbody></table>

  <h4>4. ${L('레드플래그 — 자동 강등','Red flags — automatic downgrade')}</h4>
  <p>${L('점수가 좋아도 아래에 걸리면 <b>최종 판정이 강등</b>됩니다. <b>최종 판정 = min(점수등급, 레드플래그 상한)</b>.','Even with a good score, these <b>downgrade the final verdict</b>. <b>Final = min(score grade, red-flag cap)</b>.')}</p>
  <p><b>${L('자동 D-보류','Auto D — Hold')}</b></p>
  <ul>
    <li>${L('사업자·실체 확인 불가','Business entity unverifiable')}</li>
    <li>${L('회사주소 실존 확인 불가','Company address not verifiable')}</li>
    <li>${L('부정 뉴스 발견','Negative news found')}</li>
    <li>${L('소송/사기/미정산 이슈','Lawsuit / fraud / non-settlement issue')}</li>
    <li>${L('Deposit 없이 Credit 요청','Credit requested with no deposit')}</li>
  </ul>
  <p><b>${L('자동 C-추가확인','Auto C — Needs check')}</b></p>
  <ul>
    <li>${L('웹사이트 없음/미확인','No/unverified website')}</li>
    <li>${L('대표자 정보 확인 불가','Representative not verifiable')}</li>
    <li>${L('Deposit 부족(등급별 요구커버율 미달)','Deposit short (below required coverage)')}</li>
    <li>${L('정산주기 30일 이상','Settlement cycle ≥ 30 days')}</li>
  </ul>

  <h4>5. ${L('Deposit(보증금) 판정 — 신용도 기반','Deposit assessment — credit-based')}</h4>
  <p>${L('Deposit은 노출 전액을 담보하지 않고 <b>신용도(등급)</b>에 따라 요구량이 달라집니다. 대형·고신뢰 파트너는 오픈 크레딧으로 Deposit이 낮거나 0입니다.','Deposit does not cover full exposure; the requirement scales with <b>credit (grade)</b>. Large, trusted partners trade on open credit with little/no deposit.')}</p>
  <p><code>${L('정산주기 노출액 = 예상 월거래액 × 정산주기 ÷ 30','Cycle exposure = monthly volume × settlement ÷ 30')}</code><br>
  <code>${L('필요 Deposit = 노출액 × 등급별 요구커버율','Required deposit = exposure × required coverage')}</code></p>
  <table><thead><tr><th style="width:64px">${L('등급','Grade')}</th><th>${L('요구커버율','Required coverage')}</th></tr></thead><tbody>
    <tr><td>A</td><td>0% (${L('오픈 크레딧','open credit')})</td></tr>
    <tr><td>B</td><td>20%</td></tr>
    <tr><td>C</td><td>50%</td></tr>
    <tr><td>D · E</td><td>100% (${L('전액/선입금','full/prepay')})</td></tr>
  </tbody></table>
  <p style="color:var(--muted);font-size:12px">${L('예: 등급 B·월 $50,000·정산 1주 → 노출 $11,667 × 20% = 필요 Deposit 약 $2,333. 현재 Deposit이 이보다 많으면 ‘충족’.','E.g. B · $50k/mo · 1-week → exposure $11,667 × 20% = ~$2,333 required. If current deposit exceeds it → ‘sufficient’.')}</p>

  <h4>6. ${L('사용 흐름','How to use')}</h4>
  <ul>
    <li>${L('① <code>Document</code> 폴더에 업체 자료(사업자등록·소개서 등) 업로드','① Upload partner files (license, profile…) into the <code>Document</code> folder')}</li>
    <li>${L('② 업체 상세에서 13개 항목 + 담당자 코멘트 입력','② Enter the 13 items + reviewer comment in the company detail')}</li>
    <li>${L('③ 가중점수·최종판정 자동 산출(레드플래그 반영)','③ Weighted score & final verdict auto-computed (with red flags)')}</li>
    <li>${L('④ 승인 요청서 자동 생성·인쇄/PDF로 대표이사 보고','④ Auto-generate the approval report; print/PDF for the CEO')}</li>
    <li>${L('⑤ 승인 이력에 단계별 결정 기록','⑤ Log stage decisions in the approval history')}</li>
  </ul>

  <h4>7. ${L('유의사항','Notes')}</h4>
  <ul>
    <li>${L('요약 카드·판정은 <b>최종 판정</b> 기준(점수등급은 참고).','Summary cards/verdict use the <b>final verdict</b> (score grade is reference).')}</li>
    <li>${L('가중치·임계값은 <b>설정</b> 화면에서 조정 가능.','Weights/thresholds are adjustable in <b>Settings</b>.')}</li>
    <li>${L('데이터는 접속한 브라우저에 저장됩니다(localStorage). 공유는 서식 복사/보고서 활용.','Data is stored in your browser (localStorage). Share via formatted copy/report.')}</li>
  </ul>`;
}
(function(){
  const btn=document.getElementById('manual-btn'), modal=document.getElementById('manual-modal'), closeB=document.getElementById('manual-close');
  const open=()=>{ document.getElementById('manual-body').innerHTML=manualHTML(); modal.style.display='flex'; };
  const hide=()=>{ modal.style.display='none'; };
  if(btn) btn.addEventListener('click', open);
  if(closeB) closeB.addEventListener('click', hide);
  if(modal) modal.addEventListener('click', e=>{ if(e.target===modal) hide(); });
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') hide(); });
})();

/* ---------- boot ---------- */
render();
