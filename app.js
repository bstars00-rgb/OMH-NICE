/* OMH Partner Risk Gate — MVP prototype (static, localStorage) */
'use strict';

/* ---------- constants ---------- */
const ITEM_NAMES = ['회사 신뢰도','사업모델 명확성','엔드유저 보유','판매채널 차별성','기존고객 중복도(낮을수록↑)',
  '유니크 인벤토리','예상 매출기여도','정산 리스크','Deposit 충분성','API/기술 안정성','운영 커뮤니케이션','국가별 법무/정산','장기 성장성',
  '담당자 코멘트 점수'];
const DEFAULT_WEIGHTS = [12,8,8,6,6,6,8,12,12,6,5,6,5,10];
const DEFAULT_THRESHOLDS = { A:85, B:70, C:55, D:40 };
// 등급별 요구커버율: 신용도 높을수록 Deposit 요구 낮음(오픈 크레딧). 필요 Deposit = 2주 노출 × 요구커버율
const REQUIRED_COVERAGE = { A:0, B:0.2, C:0.5, D:1, E:1 };
const DOC_KEYS = ['사업자등록증','회사소개서','은행정보','계약서 초안','정산조건 합의서','파트너 레퍼런스','재무제표/매출자료','대표자 신분확인'];
const PUBLIC_KEYS = ['공식 웹사이트','LinkedIn/기업프로필','Google 검색결과','부정 뉴스','소송/사기/미정산','거래처/업계 레퍼런스','도메인 생성시점','회사주소 실존','대표자 업계이력'];
const NEG_PUBLIC = ['부정 뉴스','소송/사기/미정산']; // Y = bad
const COUNTRIES = ['중국','두바이(UAE)','한국','일본','베트남','태국','기타'];
const BIZTYPES = ['B2B','B2C','TMC','OTA','Wholesaler','B2B/TMC'];
const STATUSES = ['신규','검토중','승인','조건부승인','보류','거절'];
const YN = ['Y','N','불명'];
const YNP = ['Y','N','부분'];
const DOCV = ['제출','미제출','불가'];
const STAGES = ['영업 1차입력','SCM/운영 검토','재무 정산검토','개발 API검토','대표이사 승인','3개월 모니터링'];
const DECISIONS = ['진행','보류','반려','승인','조건부승인'];
const GRADE_META = {
  A:{label:'승인 추천', cls:'g-A'}, B:{label:'조건부 승인', cls:'g-B'},
  C:{label:'추가 확인 필요', cls:'g-C'}, D:{label:'보류', cls:'g-D'}, E:{label:'거절 추천', cls:'g-E'}
};
const RANK = {A:0,B:1,C:2,D:3,E:4};
const STORE_KEY = 'omh_prg_v10';

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
  if(!confirm('모든 데이터를 초기 예시(4개 업체)로 되돌립니다. 계속할까요?')) return;
  DATA = { settings:{weights:[...DEFAULT_WEIGHTS], thresholds:{...DEFAULT_THRESHOLDS}}, companies: seed() };
  save(); VIEW='dashboard'; render();
}

/* ---------- model helpers ---------- */
function blankCompany(){
  return {
    id: nextId(), name:'', country:'', businessType:'', market:'', customerType:'',
    website:'', bizRegNo:'', foundedYear:'', representative:'', contact:'', email:'', status:'신규',
    deposit:0, settlementDays:14, currency:'USD', creditRequired:'N', monthlyGMV:0,
    salesRegion:'', products:'', apiIntegration:'Y', manualBooking:'N', cancelNoshowRisk:'보통',
    docs:Object.fromEntries(DOC_KEYS.map(k=>[k,'미제출'])),
    public:Object.fromEntries(PUBLIC_KEYS.map(k=>[k,'불명'])),
    scores:new Array(ITEM_NAMES.length).fill(3),
    notes:{expect:'', check:'', opinion:'', comment:''},
    documents:[],
    history:[]
  };
}
function normalizeCompany(c){
  c.docs = c.docs || {}; DOC_KEYS.forEach(k=>{ if(!(k in c.docs)) c.docs[k]='미제출'; });
  c.public = c.public || {}; PUBLIC_KEYS.forEach(k=>{ if(!(k in c.public)) c.public[k]='불명'; });
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

/* ---------- core risk engine ---------- */
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

  const bizMissing = !c.bizRegNo || c.bizRegNo.trim()==='' || /확인필요/.test(c.bizRegNo);
  const addrNo = c.public['회사주소 실존']==='N';
  const negNews = c.public['부정 뉴스']==='Y';
  const lawsuit = c.public['소송/사기/미정산']==='Y';
  const uncoveredCredit = c.creditRequired==='Y' && dep===0;
  const websiteNo = c.public['공식 웹사이트']==='N' || !c.website || c.website.trim()==='' || /확인필요/.test(c.website);
  const repMissing = !c.representative || c.representative.trim()==='' || /확인필요/.test(c.representative);
  const reqCov = (scoreGrade in REQUIRED_COVERAGE) ? REQUIRED_COVERAGE[scoreGrade] : 1;
  const requiredDeposit = exposure * reqCov;
  const depositShort = exposure>0 && reqCov>0 && dep < requiredDeposit - 1e-6;
  const slowSettle = days>=30;

  const dFlags=[], cFlags=[];
  if(bizMissing) dFlags.push('사업자/실체 확인 불가');
  if(addrNo) dFlags.push('회사주소 실존 확인 불가');
  if(negNews) dFlags.push('부정 뉴스 발견');
  if(lawsuit) dFlags.push('소송/사기/미정산 이슈');
  if(uncoveredCredit) dFlags.push('Deposit 없이 Credit 요청');
  if(websiteNo) cFlags.push('웹사이트 없음/미확인');
  if(repMissing) cFlags.push('대표자 정보 확인 불가');
  if(depositShort) cFlags.push('Deposit 부족(필요 ≥$'+Math.round(requiredDeposit).toLocaleString('en-US')+')');
  if(slowSettle) cFlags.push('정산주기 30일 이상');

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
function badge(g){ const m=GRADE_META[g]; return `<span class="badge ${m.cls}"><span class="dot"></span>${g} · ${m.label}</span>`; }
function opts(list, val){ return list.map(o=>`<option ${o===val?'selected':''}>${esc(o)}</option>`).join(''); }
function fmtUSD(n){ n=Math.round(Number(n)||0); return '$'+n.toLocaleString('en-US'); }
function fmtCov(cov){ return cov==null?'—':cov.toFixed(2)+'x'; }
function updateFoot(){ const el=document.getElementById('foot-count'); if(el) el.textContent = DATA.companies.length+'개 업체 등록됨'; }

/* ---------- render root ---------- */
function render(){
  document.querySelectorAll('#nav a').forEach(a=>a.classList.toggle('active', a.dataset.view===VIEW));
  const titleMap = {dashboard:['대시보드','신규 B2B/TMC 파트너 리스크 표준 평가'],
    companies:['업체 목록','등록된 파트너 후보 전체'],
    settings:['설정 · 가중치','리스크 항목 가중치와 등급 임계값'],
    company:['업체 상세','정보 입력 · 리스크 평가 · 승인 요청서']};
  const [t,sub] = titleMap[VIEW]||['',''];
  document.getElementById('page-title').textContent = t;
  document.getElementById('page-sub').textContent = sub;

  const acts = document.getElementById('top-actions');
  if(VIEW==='company'){
    acts.innerHTML = `<button class="btn" data-act="back">← 목록</button>`;
  } else acts.innerHTML = '';

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
    <div class="card"><div class="k">전체 업체</div><div class="v">${list.length}</div></div>
    <div class="card"><div class="k">승인권 (최종 A·B)</div><div class="v" style="color:var(--gA)">${approve}</div></div>
    <div class="card"><div class="k">확인·보류 (최종 C·D)</div><div class="v" style="color:var(--gD)">${hold}</div></div>
    <div class="card"><div class="k">거절 추천 (최종 E)</div><div class="v" style="color:var(--gE)">${reject}</div></div>
  </div>
  <p class="hint" style="margin:-10px 0 18px">※ 요약 카드와 판정은 <b>레드플래그가 반영된 ‘최종 판정’</b> 기준입니다. ‘점수등급’은 참고용이며, 레드플래그가 있으면 최종 판정이 강등됩니다(예: 점수 B라도 Deposit 부족 시 최종 C).</p>`;
  const rows = list.map(({c,r})=>`
    <tr data-open="${c.id}">
      <td><b>${esc(c.name||'(미입력)')}</b><div class="hint">${esc(c.id)} · ${esc(c.businessType||'-')}</div></td>
      <td class="ctr">${esc(c.country||'-')}</td>
      <td class="num">${fmtUSD(c.deposit)}</td>
      <td class="ctr">${fmtCov(r.coverage)}</td>
      <td class="num">${r.weighted.toFixed(1)}</td>
      <td class="ctr">${badge(r.scoreGrade)}</td>
      <td class="ctr">${badge(r.finalGrade)}</td>
      <td><div class="flaglist">${r.allFlags.length? r.allFlags.map(f=>`<span class="flag">${esc(f)}</span>`).join('') : '<span class="flag ok">없음</span>'}</div></td>
      <td><div class="comment-cell"><span class="cscore">${esc(c.scores[13])}/5</span> ${esc(c.notes.comment||'-')}</div></td>
    </tr>`).join('');
  const table = list.length ? `<div class="panel"><h3 style="display:flex;align-items:center;justify-content:space-between;gap:12px">업체별 리스크 요약 <button class="btn sm" data-act="copysummary">📋 서식 복사</button></h3>
    <div class="table-wrap"><table><thead><tr>
      <th>업체</th><th class="ctr">국가</th><th class="num">Deposit</th><th class="ctr">커버율</th>
      <th class="num">가중점수</th><th class="ctr">점수등급<br><span class="hint" style="font-weight:400">(참고)</span></th><th class="ctr">최종 판정<br><span class="hint" style="font-weight:400">(레드플래그 반영)</span></th><th>레드플래그</th><th>담당자 코멘트<br><span class="hint" style="font-weight:400">(점수/5)</span></th>
    </tr></thead><tbody>${rows}</tbody></table></div></div>`
    : `<div class="panel"><div class="empty">등록된 업체가 없습니다.</div></div>`;
  const guide = `<div class="panel"><h3>사용 순서</h3><div class="body" style="color:#54637a;font-size:13px;line-height:1.9">
    1) <b>Document 폴더</b>에 업체 자료(사업자등록·회사소개서 등) 업로드 &nbsp;·&nbsp; 2) 담당자가 <b>리스크 평가</b> 13개 항목 입력<br>
    3) 가중점수·최종판정 <b>자동 산출</b> &nbsp;·&nbsp; 4) <b>승인 요청서</b> 자동 생성·인쇄로 대표이사 보고<br>
    ※ 최종판정 = min(점수등급, 레드플래그 상한). 사업자·실체 확인불가/부정뉴스/소송 등은 자동 <b>D-보류</b>.
  </div></div>`;
  return cards + table + guide;
}

/* ---------- companies list ---------- */
function viewCompanies(){
  const rows = DATA.companies.map(c=>{ const r=compute(c); return `
    <tr data-open="${c.id}">
      <td><b>${esc(c.name||'(미입력)')}</b><div class="hint">${esc(c.id)}</div></td>
      <td class="ctr">${esc(c.country||'-')}</td>
      <td class="ctr">${esc(c.businessType||'-')}</td>
      <td class="ctr"><span class="status-chip">${esc(c.status||'-')}</span></td>
      <td class="num">${r.weighted.toFixed(1)}</td>
      <td class="ctr">${badge(r.finalGrade)}</td>
    </tr>`; }).join('');
  if(!DATA.companies.length) return `<div class="panel"><div class="empty">등록된 업체가 없습니다.</div></div>`;
  return `<div class="panel"><h3>업체 목록</h3>
    <table><thead><tr><th>업체</th><th class="ctr">국가</th><th class="ctr">유형</th>
    <th class="ctr">상태</th><th class="num">가중점수</th><th class="ctr">최종 판정</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

/* ---------- settings ---------- */
function viewSettings(){
  const s = DATA.settings;
  const sum = s.weights.reduce((a,b)=>a+(Number(b)||0),0);
  const wr = ITEM_NAMES.map((n,i)=>`
    <div class="field"><label>${esc(n)}</label>
    <input type="number" min="0" data-weight="${i}" value="${s.weights[i]}"></div>`).join('');
  const tr = ['A','B','C','D'].map(g=>`
    <div class="field"><label>${g} 등급 하한 (${GRADE_META[g].label})</label>
    <input type="number" data-threshold="${g}" value="${s.thresholds[g]}"></div>`).join('');
  return `
  <div class="panel"><h3>리스크 항목 가중치 <span class="pill">가중치 합계 ${sum}</span></h3>
    <div class="body"><div class="form-grid three">${wr}</div>
    <p class="hint" style="margin-top:14px">가중점수 = Σ(항목점수 ÷ 5 × 가중치) ÷ 가중치합 × 100 — <b>100점 만점으로 자동 정규화</b>됩니다. 합계가 100이 아니어도 됩니다. ‘담당자 코멘트 점수’는 담당자가 리스크 평가 탭에서 1~5점으로 매기는 종합 주관 점수입니다.</p></div></div>
  <div class="panel"><h3>등급 임계값 (가중점수 ≥)</h3>
    <div class="body"><div class="form-grid">${tr}</div>
    <p class="hint" style="margin-top:14px">A≥${s.thresholds.A} · B≥${s.thresholds.B} · C≥${s.thresholds.C} · D≥${s.thresholds.D} · 그 미만 E(거절추천). 레드플래그 발견 시 점수와 무관하게 C 또는 D로 강등됩니다.</p></div></div>`;
}

/* ---------- company detail ---------- */
function viewCompany(){
  const c = getCompany(CURRENT);
  if(!c) return `<div class="empty">업체를 찾을 수 없습니다.</div>`;
  const r = compute(c);
  const tabs = [['info','기본정보'],['deal','거래조건'],['docs','서류·공개정보'],['risk','리스크 평가'],['report','승인 요청서'],['history','승인 이력']];
  const tabBar = `<div class="tabs no-print">${tabs.map(([k,l])=>`<button data-tab="${k}" class="${TAB===k?'active':''}">${l}</button>`).join('')}</div>`;
  const head = `<div class="toolbar no-print">
      <div><span style="font-size:17px;font-weight:700">${esc(c.name||'(미입력)')}</span>
      <span class="pill">${esc(c.id)}</span> <span class="status-chip">${esc(c.status)}</span></div>
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
    <input type="${type}" data-field="${field}" value="${esc(value)}">${hint?`<span class="hint">${hint}</span>`:''}</div>`;
}
function sel(label,field,value,list,hint=''){
  return `<div class="field"><label>${label}</label>
    <select data-field="${field}">${opts(list,value)}</select>${hint?`<span class="hint">${hint}</span>`:''}</div>`;
}

function tabInfo(c){
  return `<div class="panel"><h3>01. 업체 기본정보</h3><div class="body"><div class="form-grid">
    ${fld('업체명','name',c.name)}
    ${sel('국가','country',c.country,['',...COUNTRIES])}
    ${sel('사업유형','businessType',c.businessType,['',...BIZTYPES])}
    ${fld('주요 시장','market',c.market)}
    ${fld('주요 고객군(엔드유저)','customerType',c.customerType)}
    ${fld('웹사이트','website',c.website,'text','비어있거나 확인필요 → 자동 C 강등')}
    ${fld('사업자등록번호','bizRegNo',c.bizRegNo,'text','비어있거나 확인필요 → 자동 D 강등')}
    ${fld('설립연도','foundedYear',c.foundedYear,'number')}
    ${fld('대표자/주요임원','representative',c.representative,'text','비어있거나 확인필요 → 자동 C 강등')}
    ${fld('담당자','contact',c.contact)}
    ${fld('담당자 이메일','email',c.email)}
    ${sel('상태','status',c.status,STATUSES)}
  </div></div></div>`;
}
function tabDeal(c){
  const r = compute(c);
  return `<div class="panel"><h3>02. 거래조건</h3><div class="body"><div class="form-grid">
    ${fld('Deposit (USD)','deposit',c.deposit,'number')}
    ${fld('정산주기 (일)','settlementDays',c.settlementDays,'number','30일 이상 → 자동 C 강등')}
    ${sel('정산통화','currency',c.currency,['USD','KRW','CNY','AED'])}
    ${sel('Credit 요청','creditRequired',c.creditRequired,['N','Y'],'Y + Deposit 0 → 자동 D 강등')}
    ${fld('예상 월거래액 (USD)','monthlyGMV',c.monthlyGMV,'number','커버율 계산의 핵심 값')}
    ${fld('주요 판매지역','salesRegion',c.salesRegion)}
    ${fld('주요 상품','products',c.products)}
    ${sel('API 연동','apiIntegration',c.apiIntegration,YNP)}
    ${sel('수기 예약','manualBooking',c.manualBooking,['N','Y','부분'])}
    ${sel('취소/노쇼 리스크','cancelNoshowRisk',c.cancelNoshowRisk,['낮음','보통','높음'])}
  </div>
  <div class="result" style="margin-top:18px">
    <div class="box"><div class="k">2주 노출액</div><div class="v">${fmtUSD(r.exposure)}</div><div class="hint">월거래액 × 정산주기/30</div></div>
    <div class="box"><div class="k">요구 Deposit (등급 ${r.scoreGrade}·${Math.round(r.reqCov*100)}%)</div><div class="v">${fmtUSD(r.requiredDeposit)}</div><div class="hint">노출 × 등급별 요구커버율(A0·B20·C50·D100%)</div></div>
    <div class="box"><div class="k">Deposit 충족</div><div class="v" style="color:${r.depositShort?'var(--gE)':'var(--gA)'}">${r.exposure>0?(r.depositShort?'부족':'충족'):'—'}</div><div class="hint">현재 ${fmtUSD(c.deposit)} · 커버율 ${fmtCov(r.coverage)}</div></div>
  </div></div></div>`;
}
function tabDocs(c){
  const fileRows = c.documents.length
    ? c.documents.map(d=>`<a class="filecard" href="Document/${encodeURIComponent(d.file)}" target="_blank" rel="noopener">
        <span class="fico">${/\.pdf$/i.test(d.file)?'PDF':/\.(jpg|jpeg|png)$/i.test(d.file)?'IMG':'FILE'}</span>
        <span class="finfo"><b>${esc(d.name)}</b><span class="hint">${esc(d.file)}</span></span></a>`).join('')
    : `<div class="hint" style="padding:6px 0">폴더에 업로드된 자료가 없습니다. <code>Document/</code> 폴더에 파일을 넣으면 여기에 표시됩니다.</div>`;
  const folderPanel = `<div class="panel"><h3>폴더 제출 자료 <span class="pill">Document/ 기준</span></h3>
    <div class="body">
      <p class="hint" style="margin:0 0 12px">이 플랫폼은 <b>Document 폴더에 올린 파일</b>을 근거로 평가 결과를 표시합니다. 아래는 이 업체에 연결된 자료입니다(클릭 시 열림).</p>
      <div class="filelist">${fileRows}</div>
    </div></div>`;
  const docRows = DOC_KEYS.map(k=>`<div class="field"><label>${esc(k)}</label>
    <select data-doc="${esc(k)}">${opts(DOCV,c.docs[k])}</select></div>`).join('');
  const pubRows = PUBLIC_KEYS.map(k=>{
    const isNeg = NEG_PUBLIC.includes(k);
    return `<div class="field"><label>${esc(k)}${isNeg?' <span class="hint">(Y=위험)</span>':''}</label>
    <select data-public="${esc(k)}">${opts(YN,c.public[k])}</select></div>`; }).join('');
  const missing = DOC_KEYS.filter(k=>c.docs[k]==='미제출').length;
  return folderPanel + `<div class="panel"><h3>03. 제출서류 <span class="pill">미제출 ${missing}건</span></h3>
    <div class="body"><div class="form-grid three">${docRows}</div></div></div>
    <div class="panel"><h3>04. 외부 공개정보 체크</h3>
    <div class="body"><div class="form-grid three">${pubRows}</div>
    <p class="hint" style="margin-top:12px">‘부정 뉴스=Y’·‘소송/사기/미정산=Y’·‘회사주소 실존=N’은 점수와 무관하게 <b>D-보류</b>로 강등됩니다.</p>
    </div></div>`;
}
function tabRisk(c,r){
  const rows = ITEM_NAMES.map((n,i)=>`
    <div class="score-row">
      <div class="name">${esc(n)}<span class="wt">가중치 ${DATA.settings.weights[i]}</span></div>
      <input type="range" min="1" max="5" step="1" data-score="${i}" value="${c.scores[i]}">
      <div class="val" data-scoreval="${i}">${c.scores[i]}</div>
    </div>`).join('');
  return `<div class="panel"><h3>05. 내부 리스크 평가 <span class="pill">각 1~5점 · 5=저위험/양호</span></h3>
    <div class="body">${rows}</div></div>
    <div class="panel" id="risk-result"><h3>평가 결과</h3><div class="body">${riskResultHTML(r)}</div></div>
    <div class="panel"><h3>보고용 코멘트</h3><div class="body"><div class="form-grid">
      <div class="field full"><label>담당자 코멘트 <span class="hint">(담당자 코멘트 점수의 근거·종합 소견)</span></label><textarea data-note="comment">${esc(c.notes.comment)}</textarea></div>
      <div class="field full"><label>기대효과</label><textarea data-note="expect">${esc(c.notes.expect)}</textarea></div>
      <div class="field full"><label>주요 리스크 / 확인 필요사항</label><textarea data-note="check">${esc(c.notes.check)}</textarea></div>
      <div class="field full"><label>종합 의견</label><textarea data-note="opinion">${esc(c.notes.opinion)}</textarea></div>
    </div></div></div>`;
}
function riskResultHTML(r){
  const flags = r.allFlags.length
    ? r.allFlags.map(f=>`<span class="flag">${esc(f)}</span>`).join('')
    : `<span class="flag ok">레드플래그 없음</span>`;
  return `<div class="result">
      <div class="box"><div class="k">가중점수</div><div class="v">${r.weighted.toFixed(1)}<span style="font-size:13px;color:var(--muted)"> /100</span></div></div>
      <div class="box"><div class="k">점수 등급</div><div class="v">${badge(r.scoreGrade)}</div></div>
      <div class="box"><div class="k">Deposit 커버율</div><div class="v">${fmtCov(r.coverage)}</div></div>
      <div class="box" style="background:#fff4ee;border-color:#f4d5c2"><div class="k">최종 판정</div><div class="v">${badge(r.finalGrade)}</div></div>
    </div><div class="flags">${flags}</div>`;
}
function tabReport(c,r){
  const flags = r.allFlags.length ? r.allFlags.join(' · ') : '없음';
  const row = (k,v)=>`<tr><th>${k}</th><td>${v}</td></tr>`;
  const today = new Date().toISOString().slice(0,10);
  return `<div class="toolbar no-print"><div class="spacer"></div>
      <button class="btn" data-act="copyreport">텍스트 복사</button>
      <button class="btn primary" data-act="print">인쇄 / PDF 저장</button></div>
    <div class="report" id="report">
      <h2>■ 신규 파트너 승인 요청서</h2>
      <div class="rmeta">대표이사 보고용 · 자동 생성 · ${today} · 작성: OMH Global OPs</div>
      <table>
        ${row('업체명', esc(c.name||'-'))}
        ${row('국가 / 사업유형', esc(c.country||'-')+' / '+esc(c.businessType||'-'))}
        ${row('설립 / 대표', esc(c.foundedYear||'-')+' / '+esc(c.representative||'-'))}
        ${row('Deposit', fmtUSD(c.deposit)+' ('+esc(c.currency)+')')}
        ${row('정산주기', esc(c.settlementDays)+'일')}
        ${row('예상 월거래액', fmtUSD(c.monthlyGMV)+' · 커버율 '+fmtCov(r.coverage))}
        ${row('주요 상품', esc(c.products||'-'))}
        ${row('API / 수기', esc(c.apiIntegration)+' / '+esc(c.manualBooking))}
        ${row('주요 엔드유저', esc(c.customerType||'-'))}
        ${row('리스크 점수', r.weighted.toFixed(1)+' / 100 (점수등급 '+r.scoreGrade+')')}
        ${row('★ 최종 판정', badge(r.finalGrade))}
        ${row('레드플래그', esc(flags))}
      </table>
      <div class="sec">기대효과</div><div>${esc(c.notes.expect||'-')}</div>
      <div class="sec">주요 리스크 / 확인 필요사항</div><div>${esc(c.notes.check||'-')}</div>
      <div class="sec">종합 의견</div><div>${esc(c.notes.opinion||'-')}</div>
      <div class="sec">담당자 코멘트 <span class="hint" style="font-weight:400">(담당자 코멘트 점수 ${esc(c.scores[13])}/5)</span></div><div>${esc(c.notes.comment||'-')}</div>
      <div class="decision">
        <b>승인 요청 조건</b><br>
        □ Deposit 상향 (USD ___ → ___) &nbsp; □ 정산주기 단축 (___일)<br>
        □ 초기 3개월 Credit 미부여 &nbsp; □ 월 GMV 한도 설정 (USD ___)
      </div>
      <div class="sign">결재&nbsp;&nbsp; 영업 □&nbsp;&nbsp; SCM □&nbsp;&nbsp; 재무 □&nbsp;&nbsp; 개발 □&nbsp;&nbsp; 대표이사 □ &nbsp;(승인 / 보류 / 반려)</div>
    </div>`;
}
function tabHistory(c){
  const rows = c.history.map((h,i)=>`<tr>
      <td>${esc(h.stage)}</td><td>${esc(h.reviewer)}</td>
      <td class="ctr"><span class="status-chip">${esc(h.decision)}</span></td>
      <td>${esc(h.comment)}</td><td class="ctr">${esc(h.date)}</td>
      <td class="ctr"><button class="btn sm ghost" data-delhist="${i}">삭제</button></td>
    </tr>`).join('');
  return `<div class="panel"><h3>07. 승인 워크플로우 이력</h3>
    <div class="body">
      <table><thead><tr><th>단계</th><th>검토자</th><th class="ctr">결정</th><th>코멘트</th><th class="ctr">일시</th><th></th></tr></thead>
      <tbody>${rows||'<tr><td colspan="6" class="hint" style="text-align:center;padding:20px">기록 없음</td></tr>'}</tbody></table>
      <div class="form-grid" style="margin-top:16px;grid-template-columns:repeat(5,1fr) auto;align-items:end">
        <div class="field"><label>단계</label><select id="h-stage">${opts(STAGES,STAGES[0])}</select></div>
        <div class="field"><label>검토자</label><input id="h-reviewer" placeholder="이름/팀"></div>
        <div class="field"><label>결정</label><select id="h-decision">${opts(DECISIONS,DECISIONS[0])}</select></div>
        <div class="field"><label>코멘트</label><input id="h-comment" placeholder="코멘트"></div>
        <div class="field"><label>일시</label><input id="h-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
        <button class="btn primary" data-act="addhist">추가</button>
      </div>
    </div></div>`;
}

/* ---------- events ---------- */
document.getElementById('nav').addEventListener('click', e=>{
  const a = e.target.closest('a'); if(!a) return;
  VIEW = a.dataset.view; render();
});
document.getElementById('top-actions').addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b) return; act(b.dataset.act);
});
function act(a){
  if(a==='add'){ const c=blankCompany(); DATA.companies.push(c); save(); CURRENT=c.id; TAB='info'; VIEW='company'; render(); }
  else if(a==='back'){ VIEW='companies'; render(); }
  else if(a==='delete'){ if(confirm('이 업체를 삭제할까요?')){ DATA.companies=DATA.companies.filter(c=>c.id!==CURRENT); save(); VIEW='companies'; render(); } }
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
function softRefresh(){ // update deal/docs computed panels + header badge without losing focus
  const c=getCompany(CURRENT); const r=compute(c);
  refreshHeaderBadge();
  const cov=document.querySelector('#risk-result .body'); if(cov) cov.innerHTML=riskResultHTML(r);
  // deal tab live boxes
  const boxes=document.querySelectorAll('.result .box');
  // simplest: if on deal or risk tab, re-render just that tab body region is complex; re-render whole view is fine on change (blur already happened)
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
  if(!reviewer){ alert('검토자를 입력하세요.'); return; }
  c.history.push({stage,reviewer,decision,comment,date}); save(); render();
}

/* ---------- clipboard ---------- */
function copyText(text, okMsg){
  const done=()=>alert(okMsg||'복사되었습니다.');
  if(navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(text).then(done, ()=>fallbackCopy(text, okMsg));
  } else fallbackCopy(text, okMsg);
}
function fallbackCopy(text, okMsg){
  const ta=document.createElement('textarea'); ta.value=text;
  ta.style.position='fixed'; ta.style.top='-1000px'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.focus(); ta.select();
  let ok=false; try{ ok=document.execCommand('copy'); }catch(e){}
  document.body.removeChild(ta);
  alert(ok ? (okMsg||'복사되었습니다.') : '복사 실패 — 표를 직접 선택해 복사하세요.');
}

/* ---------- rich (formatted) clipboard ---------- */
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
  alert(ok ? okMsg : '복사 실패 — 표를 직접 선택해 복사하세요.');
}

/* ---------- summary table copy (formatted HTML + TSV) ---------- */
function copySummary(){
  const clean = s => String(s==null?'':s).replace(/[\t\r\n]+/g,' ').trim();
  const cols = ['업체','국가','Deposit(USD)','커버율','가중점수','점수등급','최종판정','레드플래그','담당자 코멘트(점수)'];
  const th = c => `<th style="border:1px solid #b9c2d0;padding:7px 10px;background:#1F4E78;color:#fff;text-align:left;white-space:nowrap">${c}</th>`;
  const td = (c,extra) => `<td style="border:1px solid #d6dce6;padding:6px 10px;vertical-align:top;${extra||''}">${c}</td>`;
  const badge = g => `<span style="display:inline-block;background:${gradeColor(g)};color:#fff;padding:2px 8px;border-radius:10px;font-weight:700;font-size:11px;white-space:nowrap">${g}·${GRADE_META[g].label}</span>`;
  let html = `<table style="border-collapse:collapse;font-family:'Malgun Gothic',Arial,sans-serif;font-size:12px;color:#1e2632"><thead><tr>${cols.map(th).join('')}</tr></thead><tbody>`;
  const tlines = [cols.join('\t')];
  DATA.companies.forEach(c=>{
    const r = compute(c);
    const cov = r.coverage==null?'—':r.coverage.toFixed(2)+'x';
    const flags = r.allFlags.length? r.allFlags.join('; '):'없음';
    const dep = '$'+(Number(c.deposit)||0).toLocaleString('en-US');
    html += '<tr>'+
      td('<b>'+esc(c.name)+'</b><br><span style="color:#7a869a">'+esc(c.id)+' · '+esc(c.businessType)+'</span>')+
      td(esc(c.country),'white-space:nowrap')+
      td(dep,'text-align:right;white-space:nowrap')+
      td(cov,'text-align:center;white-space:nowrap')+
      td(r.weighted.toFixed(1),'text-align:right')+
      td(badge(r.scoreGrade),'text-align:center')+
      td(badge(r.finalGrade),'text-align:center')+
      td(esc(flags),'color:#b23b3b')+
      td('<b>'+esc(c.scores[13])+'/5</b> '+esc(c.notes.comment||''),'min-width:260px;color:#54637a')+
      '</tr>';
    tlines.push([c.name+' ('+c.id+')', c.country, dep, cov, r.weighted.toFixed(1), r.scoreGrade,
      r.finalGrade+'-'+GRADE_META[r.finalGrade].label, flags, '('+c.scores[13]+'/5) '+(c.notes.comment||'')].map(clean).join('\t'));
  });
  html += '</tbody></table>';
  copyRich(html, tlines.join('\n'), DATA.companies.length+'개 업체 리스크 요약이 서식 포함으로 복사되었습니다. 메일·Word·Excel에 붙여넣기 하세요.');
}

/* ---------- report copy ---------- */
function copyReport(){
  const c=getCompany(CURRENT); const r=compute(c);
  const txt =
`■ 신규 파트너 승인 요청서
업체명: ${c.name}
국가: ${c.country}
사업유형: ${c.businessType}
거래조건: Deposit ${fmtUSD(c.deposit)} / 정산 ${c.settlementDays}일 / ${c.currency}
Deposit: ${fmtUSD(c.deposit)}
정산주기: ${c.settlementDays}일
예상 월거래액: ${fmtUSD(c.monthlyGMV)} (커버율 ${fmtCov(r.coverage)})
주요 엔드유저: ${c.customerType}
리스크 점수: ${r.weighted.toFixed(1)}/100 (점수등급 ${r.scoreGrade})
최종 판정: ${r.finalGrade} · ${GRADE_META[r.finalGrade].label}
레드플래그: ${r.allFlags.length?r.allFlags.join(', '):'없음'}
기대효과: ${c.notes.expect}
리스크/확인 필요: ${c.notes.check}
종합 의견: ${c.notes.opinion}
담당자 코멘트(점수 ${c.scores[13]}/5): ${c.notes.comment}`;
  navigator.clipboard.writeText(txt).then(()=>alert('승인 요청서가 클립보드에 복사되었습니다.'),
    ()=>alert('복사 실패 — 브라우저 권한을 확인하세요.'));
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
      DATA=migrate(d); save(); VIEW='dashboard'; render(); alert('가져오기 완료.'); }
      catch(e){ alert('올바른 JSON 파일이 아닙니다.'); } };
    rd.readAsText(f); };
  inp.click();
}

/* ---------- seed data (4 examples) ---------- */
function seed(){
  const mk = (o)=> normalizeCompany(Object.assign(blankCompanyRaw(), o));
  function blankCompanyRaw(){
    return { docs:Object.fromEntries(DOC_KEYS.map(k=>[k,'제출'])),
      public:Object.fromEntries(PUBLIC_KEYS.map(k=>[k, NEG_PUBLIC.includes(k)?'N':'Y'])),
      notes:{}, history:[], settlementDays:14, currency:'USD', creditRequired:'N',
      apiIntegration:'Y', manualBooking:'N', cancelNoshowRisk:'보통', status:'검토중' };
  }
  const c1 = mk({ id:'C001', name:'Huamao', country:'중국(홍콩법인)', businessType:'B2B',
    market:'중국 아웃바운드', customerType:'라이브커머스(샤오홍슈·더우인)·OTA·여행사 + B2C sub-agent',
    website:'huamaoly@163.com (B2B 플랫폼 보유)', bizRegNo:'73809897-000-02-26-8 (HK BR) / 海南华茂 2019', foundedYear:2019, representative:'법인 등기 확인(대표자 성명 자료 추가 요청)',
    contact:'Huamao', email:'huamaoly@163.com', deposit:10000, monthlyGMV:50000, salesRegion:'일본·한국·베트남·글로벌', products:'일본·한국·베트남·글로벌 호텔',
    scores:[4,5,5,5,4,4,4,3,2,4,3,3,4,4], status:'검토중',
    docs:{'사업자등록증':'제출','회사소개서':'제출','은행정보':'미제출','계약서 초안':'미제출','정산조건 합의서':'제출','파트너 레퍼런스':'제출','재무제표/매출자료':'미제출','대표자 신분확인':'미제출'},
    public:{'공식 웹사이트':'Y','LinkedIn/기업프로필':'불명','Google 검색결과':'Y','부정 뉴스':'N','소송/사기/미정산':'N','거래처/업계 레퍼런스':'Y','도메인 생성시점':'불명','회사주소 실존':'Y','대표자 업계이력':'Y'},
    documents:[{name:'사업자등록증(홍콩 BR)',file:'huamao_business license 1.pdf'},{name:'회사소개서(15p)',file:'Huamao introduction file 1.pdf'}],
    notes:{expect:'홍콩법인·하이난 본사(2019 설립) 실체 확인. 60만 호텔·직계약 2000+·연 58만 RN. B2B 주력이며 B2C 플랫폼(sub-agent)도 운영. 일본·한국·베트남은 일 100~200 RN 예측. 샤오홍슈·더우인 라이브커머스·숏폼 판매, 공급사 Hotelbeds·WebBeds·Expedia·Trip.com·Rakuten·Restel·Fliggy·Meituan 등 광범위.',
      check:'은행정보·계약서·재무제표 미제출. 대표자 개인 성명/신분 자료 추가 필요. Deposit 커버율 0.43x로 예상 월거래액 대비 부족(상향 필요). ※정산조건 2주·USD 합의 완료.',
      opinion:'실체·사업모델·엔드유저·공급망 검증됨(기존 D-보류 → 상향). Deposit 상향 또는 초기 GMV 한도(예: JP/KR/VN 일 100~200 RN) 설정 시 조건부 승인(B) 가능. 재무·은행 자료 보완 권고.',
      comment:'실체·공급망 검증 완료로 신뢰도 높게 봄(4/5). Deposit 커버율만 보완되면 승인 추천 가능. 초기 JP/KR/VN RN 한도부터 시작 권장.'},
    history:[{stage:'영업 1차입력',reviewer:'Global OPs',decision:'보류',comment:'서류 미비·사업자 확인 필요',date:'2026-06-28'},
      {stage:'SCM/운영 검토',reviewer:'Global OPs',decision:'진행',comment:'폴더 자료 검토: HK BR·회사소개서 확인, 실체·엔드유저 검증 → 보류 해소',date:'2026-07-03'},
      {stage:'재무 정산검토',reviewer:'Global OPs',decision:'진행',comment:'정산조건 2주(14일)·USD 정산 합의 완료',date:'2026-07-08'}] });
  const c2 = mk({ id:'C002', name:'Linkall Travel', country:'중국(홍콩법인)', businessType:'B2B',
    market:'유럽·일본·태국', customerType:'B2B 여행사(대표 개발자 출신·24/7 CS)',
    website:'http://linkalltravel.com', bizRegNo:'70069113 (HK BR · FUNTRIP HONGKONG LIMITED)', foundedYear:2019, representative:'확인 완료(대표: 개발자 출신)',
    deposit:10000, monthlyGMV:30000, salesRegion:'유럽·일본·태국', products:'글로벌 호텔(Expedia·Hotelbeds·WebBeds)',
    scores:[4,4,3,3,2,2,5,3,2,5,4,3,5,5],
    docs:{'사업자등록증':'제출','회사소개서':'제출','은행정보':'제출','계약서 초안':'제출','정산조건 합의서':'제출','파트너 레퍼런스':'제출','재무제표/매출자료':'미제출','대표자 신분확인':'제출'},
    notes:{expect:'홍콩법인 FUNTRIP HONGKONG LIMITED(BR 70069113, 퀸즈로드센트럴 145-149) 실체 확인, 웹사이트 linkalltravel.com. 최근 연 TTV 9억 HKD(~1.15억 USD) 대규모 거래. 대표 개발자 출신(연동 2~3일), 일 5,000~6,000건 예약(일본 ~30%), 24/7 CS.',
      check:'공급사가 Expedia·Hotelbeds·WebBeds 등 대형 애그리게이터 중심 → 유니크 인벤토리·기존 채널 중복도 확인 필요. 감사 재무제표 미제출(TTV 9억 HKD는 자기신고). Deposit 커버율 0.71x 부족.',
      opinion:'홍콩법인·대규모 TTV·기술력 확인으로 점수등급 B 수준(기존 C→상향). Deposit 상향 시 승인 가능. 인벤토리 차별성·재무제표만 보완 권고.',
      comment:'홍콩법인·9억 HKD TTV로 실체·규모 확인, 신뢰도 상향(5/5). 남은 과제는 애그리게이터 리셀 중복과 Deposit 부족 → Deposit 보완 시 승인 추천.'},
    history:[{stage:'재무 정산검토',reviewer:'Global OPs',decision:'진행',comment:'정산조건 2주(14일)·USD 정산 합의 완료',date:'2026-07-08'}] });
  const c3 = mk({ id:'C003', name:'Wingpulse (WINGSPULSE TECH)', country:'홍콩(중국계)', businessType:'B2B/TMC',
    market:'호텔 직계약+LCC 항공 (Travel Tech)', customerType:'DMC·여행사·OTA·TMC',
    website:'www.wingspulse.com / info@wingspulse.com', bizRegNo:'51588485 (HK BR)', foundedYear:2025, representative:'HE PENG(贺鹏), 단독이사',
    contact:'WingsPulse', email:'info@wingspulse.com', deposit:10000, monthlyGMV:40000, salesRegion:'동남아·한국·중국(HK·대만·마카오)', products:'역내 호텔 260+ 직계약 · LCC 항공',
    scores:[2,4,3,4,3,4,3,2,2,4,3,2,4,3], status:'검토중',
    docs:{'사업자등록증':'제출','회사소개서':'제출','은행정보':'미제출','계약서 초안':'미제출','정산조건 합의서':'제출','파트너 레퍼런스':'제출','재무제표/매출자료':'제출','대표자 신분확인':'미제출'},
    public:{'공식 웹사이트':'Y','LinkedIn/기업프로필':'불명','Google 검색결과':'Y','부정 뉴스':'N','소송/사기/미정산':'N','거래처/업계 레퍼런스':'Y','도메인 생성시점':'불명','회사주소 실존':'Y','대표자 업계이력':'Y'},
    documents:[{name:'사업자등록·감사 재무제표(17p)',file:'Business license wingpulse 1.pdf'},{name:'회사소개서(영문)',file:'Wing pulse intro-English 1.jpg'}],
    notes:{expect:'AI·시맨틱 태깅 기반 데이터 정확성·거래효율 중심 Travel Tech(홍콩·선전 거점). 동남아·한국·중국(홍콩·대만·마카오) 직계약 호텔 260+ 및 현지 DMC 협력, LCC 항공(NDC·100+ 항공사) dual-track. 밀리초 API·실시간 재고.',
      check:'★회사 제공 정보상 260+ 직계약·운영 거점이 있으나, 제출된 감사 재무제표(2026.3)는 무영업(inactive)·매출 0으로 상충. 2025.5 사명 변경(ALFA→WINGSPULSE), 자산 대부분 이사·주주 대여금. 실거래·매출 증빙 필수. Deposit 커버율 0.54x 부족.',
      opinion:'기술력·직계약 인벤토리는 긍정적이나 감사보고서상 실적 부재가 핵심 리스크 → 추가 확인(기존 보류 → 상향). 실거래 파일럿·매출 증빙 및 Deposit 상향 확인 시 조건부 승인 검토.',
      comment:'기술·260 직계약은 인상적이나 감사상 무영업이 마음에 걸려 신중(3/5). 소규모 실거래 파일럿으로 매출·정산 실적부터 확인 후 확대 권장.'},
    history:[{stage:'영업 1차입력',reviewer:'Global OPs',decision:'진행',comment:'TMC/커넥티비티 기술 파트너 후보',date:'2026-06-27'},
      {stage:'재무 정산검토',reviewer:'Global OPs',decision:'보류',comment:'폴더 자료 검토: 감사보고서상 무영업·매출0, 사명변경 → 실적 증빙까지 보류',date:'2026-07-03'},
      {stage:'SCM/운영 검토',reviewer:'Global OPs',decision:'진행',comment:'추가정보(260+ 직계약·DMC 협력) 반영해 상향, 단 감사상 무영업과 상충 → 실거래 증빙 조건 추가확인',date:'2026-07-03'},
      {stage:'재무 정산검토',reviewer:'Global OPs',decision:'진행',comment:'정산조건 2주(14일)·USD 정산 합의 완료',date:'2026-07-08'}] });
  // Happy Travel(C004): 대표이사 컨펌 완료·진행 확정 → 리스크 게이트에서 제외(승인 완료 그래듀에이션)
  const c5 = mk({ id:'C005', name:'Ohmyhotel (오마이호텔앤코) · 자체평가', country:'싱가포르 본사(한·일·베 법인)', businessType:'B2B/B2C/SaaS',
    market:'아시아(한·일·베·태)+글로벌', customerType:'B2B 파트너 + B2C(ohmyhotel.com) 엔드유저',
    website:'ohmyhotel.com / ohmyhotel.biz', bizRegNo:'주식회사 오마이호텔앤코 (2012 설립 · DART/나이스 조회)', foundedYear:2012, representative:'이미순 대표(前 Vicotrip)',
    contact:'Global OPs', email:'Global_OPs@ohmyhotel.com', deposit:0, settlementDays:0, currency:'KRW', creditRequired:'N', monthlyGMV:0, salesRegion:'아시아·글로벌', products:'일·베·태·한 호텔 3,700+ 직계약', apiIntegration:'Y', manualBooking:'N', cancelNoshowRisk:'낮음',
    scores:[5,5,5,4,5,5,5,4,4,5,4,4,5,5], status:'승인',
    docs:{'사업자등록증':'제출','회사소개서':'제출','은행정보':'제출','계약서 초안':'제출','정산조건 합의서':'제출','파트너 레퍼런스':'제출','재무제표/매출자료':'미제출','대표자 신분확인':'제출'},
    public:{'공식 웹사이트':'Y','LinkedIn/기업프로필':'Y','Google 검색결과':'Y','부정 뉴스':'N','소송/사기/미정산':'N','거래처/업계 레퍼런스':'Y','도메인 생성시점':'Y','회사주소 실존':'Y','대표자 업계이력':'Y'},
    notes:{expect:'2012 설립, 싱가포르 본사·한/일/베 법인, 100+ 임직원. B2B(ohmyhotel.biz, 2023 오픈)·B2C(ohmyhotel.com)·OHMY SaaS 올인원 플랫폼. 아시아 3,700+ 직계약 호텔(일·베·태·한). 2024 관광진흥 국무총리상·외화 3천만 USD 유치탑, 2025 한국관광공사 글로벌챌린지 선정.',
      check:'자체 평가 — Deposit·정산주기 항목은 플랫폼 특성상 해당 없음(0 표기). 감사 재무제표·투자단계는 DART/나이스 조회 필요. Jobplanet 평점 2.8(내부 문화 참고).',
      opinion:'설립 이력·다국적 법인·직계약 인벤토리·수상 실적으로 신뢰도 최상위 → 프레임 기준 A(승인추천). 신규 파트너 평가의 벤치마크(기준선)로 활용.',
      comment:'우리 회사 자체 벤치마크. 실체·사업모델·인벤토리·성장성 최상위(5/5). Deposit/정산은 플랫폼 특성상 해당 없음.'},
    documents:[] });
  return [c1,c2,c3,c5];
}

/* ---------- boot ---------- */
render();
