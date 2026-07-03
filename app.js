/* OMH Partner Risk Gate — MVP prototype (static, localStorage) */
'use strict';

/* ---------- constants ---------- */
const ITEM_NAMES = ['회사 신뢰도','사업모델 명확성','엔드유저 보유','판매채널 차별성','기존고객 중복도(낮을수록↑)',
  '유니크 인벤토리','예상 매출기여도','정산 리스크','Deposit 충분성','API/기술 안정성','운영 커뮤니케이션','국가별 법무/정산','장기 성장성'];
const DEFAULT_WEIGHTS = [12,8,8,6,6,6,8,12,12,6,5,6,5];
const DEFAULT_THRESHOLDS = { A:85, B:70, C:55, D:40 };
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
const STORE_KEY = 'omh_prg_v2';

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
    scores:new Array(13).fill(3),
    notes:{expect:'', check:'', opinion:''},
    documents:[],
    history:[]
  };
}
function normalizeCompany(c){
  c.docs = c.docs || {}; DOC_KEYS.forEach(k=>{ if(!(k in c.docs)) c.docs[k]='미제출'; });
  c.public = c.public || {}; PUBLIC_KEYS.forEach(k=>{ if(!(k in c.public)) c.public[k]='불명'; });
  if(!Array.isArray(c.scores)||c.scores.length!==13) c.scores=new Array(13).fill(3);
  c.notes = c.notes || {expect:'',check:'',opinion:''};
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
  let weighted = 0;
  for(let i=0;i<13;i++) weighted += (Number(c.scores[i])||0)/5 * (Number(s.weights[i])||0);
  const t = s.thresholds;
  const scoreGrade = weighted>=t.A?'A':weighted>=t.B?'B':weighted>=t.C?'C':weighted>=t.D?'D':'E';

  const bizMissing = !c.bizRegNo || c.bizRegNo.trim()==='' || /확인필요/.test(c.bizRegNo);
  const addrNo = c.public['회사주소 실존']==='N';
  const negNews = c.public['부정 뉴스']==='Y';
  const lawsuit = c.public['소송/사기/미정산']==='Y';
  const uncoveredCredit = c.creditRequired==='Y' && dep===0;
  const websiteNo = c.public['공식 웹사이트']==='N' || !c.website || c.website.trim()==='' || /확인필요/.test(c.website);
  const repMissing = !c.representative || c.representative.trim()==='' || /확인필요/.test(c.representative);
  const depositShort = hasCov && coverage<1;
  const slowSettle = days>=30;

  const dFlags=[], cFlags=[];
  if(bizMissing) dFlags.push('사업자/실체 확인 불가');
  if(addrNo) dFlags.push('회사주소 실존 확인 불가');
  if(negNews) dFlags.push('부정 뉴스 발견');
  if(lawsuit) dFlags.push('소송/사기/미정산 이슈');
  if(uncoveredCredit) dFlags.push('Deposit 없이 Credit 요청');
  if(websiteNo) cFlags.push('웹사이트 없음/미확인');
  if(repMissing) cFlags.push('대표자 정보 확인 불가');
  if(depositShort) cFlags.push('Deposit 부족(커버율<1.0)');
  if(slowSettle) cFlags.push('정산주기 30일 이상');

  let rank = RANK[scoreGrade];
  if(cFlags.length) rank = Math.max(rank, RANK.C);
  if(dFlags.length) rank = Math.max(rank, RANK.D);
  const finalGrade = Object.keys(RANK).find(k=>RANK[k]===rank);

  return { exposure, coverage, hasCov, weighted, scoreGrade, finalGrade, dFlags, cFlags,
           allFlags:[...dFlags, ...cFlags] };
}

/* ---------- small view helpers ---------- */
const esc = s => String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function badge(g){ const m=GRADE_META[g]; return `<span class="badge ${m.cls}"><span class="dot"></span>${g} · ${m.label}</span>`; }
function opts(list, val){ return list.map(o=>`<option ${o===val?'selected':''}>${esc(o)}</option>`).join(''); }
function fmtUSD(n){ n=Number(n)||0; return '$'+n.toLocaleString('en-US'); }
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
  if(VIEW==='dashboard'||VIEW==='companies'){
    acts.innerHTML = `<button class="btn" data-act="export">JSON 내보내기</button>
      <button class="btn" data-act="import">가져오기</button>
      <button class="btn ghost" data-act="reset">예시 초기화</button>
      <button class="btn primary" data-act="add">+ 신규 업체</button>`;
  } else if(VIEW==='company'){
    acts.innerHTML = `<button class="btn" data-act="back">← 목록</button>
      <button class="btn danger sm" data-act="delete">업체 삭제</button>`;
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
    <div class="card"><div class="k">승인권(A·B)</div><div class="v" style="color:var(--gA)">${approve}</div></div>
    <div class="card"><div class="k">확인·보류(C·D)</div><div class="v" style="color:var(--gD)">${hold}</div></div>
    <div class="card"><div class="k">거절 추천(E)</div><div class="v" style="color:var(--gE)">${reject}</div></div>
  </div>`;
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
    </tr>`).join('');
  const table = list.length ? `<div class="panel"><h3>업체별 리스크 요약</h3>
    <div class="table-wrap"><table><thead><tr>
      <th>업체</th><th class="ctr">국가</th><th class="num">Deposit</th><th class="ctr">커버율</th>
      <th class="num">가중점수</th><th class="ctr">점수등급</th><th class="ctr">최종 판정</th><th>레드플래그</th>
    </tr></thead><tbody>${rows}</tbody></table></div></div>`
    : `<div class="panel"><div class="empty">등록된 업체가 없습니다. 우측 상단 <b>+ 신규 업체</b>로 시작하세요.</div></div>`;
  const guide = `<div class="panel"><h3>사용 순서</h3><div class="body" style="color:#54637a;font-size:13px;line-height:1.9">
    1) <b>신규 업체</b> 등록 → 기본정보·거래조건 입력 &nbsp;·&nbsp; 2) 제출서류·외부 공개정보 체크<br>
    3) <b>리스크 평가</b>에서 13개 항목 1~5점 → 가중점수·최종판정 자동 &nbsp;·&nbsp; 4) <b>승인 요청서</b> 자동 생성·인쇄<br>
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
  <div class="panel"><h3>리스크 항목 가중치 <span class="pill">합계 ${sum} / 100</span></h3>
    <div class="body"><div class="form-grid three">${wr}</div>
    <p class="hint" style="margin-top:14px">가중점수 = Σ(항목점수 ÷ 5 × 가중치). 합계 100 기준 만점 100점 권장.</p></div></div>
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
    <div class="box"><div class="k">Deposit 노출액</div><div class="v">${fmtUSD(r.exposure)}</div><div class="hint">월거래액 × 정산주기/30</div></div>
    <div class="box"><div class="k">Deposit 커버율</div><div class="v" style="color:${r.coverage!=null&&r.coverage<1?'var(--gE)':'var(--gA)'}">${fmtCov(r.coverage)}</div><div class="hint">1.0x 미만 시 C 강등</div></div>
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
종합 의견: ${c.notes.opinion}`;
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
    market:'중국 아웃바운드', customerType:'라이브커머스(샤오홍슈·더우인) 엔드유저 + OTA·여행사',
    website:'huamaoly@163.com (B2B 플랫폼 보유)', bizRegNo:'73809897-000-02-26-8 (HK BR) / 海南华茂 2019', foundedYear:2019, representative:'법인 등기 확인(대표자 성명 자료 추가 요청)',
    contact:'Huamao', email:'huamaoly@163.com', deposit:10000, monthlyGMV:50000, salesRegion:'태국·글로벌', products:'태국·글로벌 호텔',
    scores:[4,5,5,5,4,4,4,3,2,4,3,3,4], status:'검토중',
    docs:{'사업자등록증':'제출','회사소개서':'제출','은행정보':'미제출','계약서 초안':'미제출','정산조건 합의서':'미제출','파트너 레퍼런스':'제출','재무제표/매출자료':'미제출','대표자 신분확인':'미제출'},
    public:{'공식 웹사이트':'Y','LinkedIn/기업프로필':'불명','Google 검색결과':'Y','부정 뉴스':'N','소송/사기/미정산':'N','거래처/업계 레퍼런스':'Y','도메인 생성시점':'불명','회사주소 실존':'Y','대표자 업계이력':'Y'},
    documents:[{name:'사업자등록증(홍콩 BR)',file:'huamao_business license 1.pdf'},{name:'회사소개서(15p)',file:'Huamao introduction file 1.pdf'}],
    notes:{expect:'홍콩법인(HUAMAO TOURISM (HK) LTD)·하이난 본사(海南华茂, 2019 설립) 실체 확인. 자체 분산시스템·API 밀리초 응답, 직계약 2000+ 호텔·연 58만 룸나이트·600개 목적지. 샤오홍슈·더우인 라이브커머스 엔드유저 및 완다·비구이위안·폴리 등 부동산 정적요금 확보 — 신규 채널 볼륨 기대 큼.',
      check:'은행정보·계약서·정산합의서·재무제표 미제출. 대표자 개인 성명/신분 자료 추가 필요. Deposit 커버율 0.43x로 예상 월거래액 대비 부족(상향 필요).',
      opinion:'문서로 실체·사업모델·엔드유저 검증됨(기존 D-보류 → 상향). Deposit 상향 또는 초기 GMV 한도 설정 시 조건부 승인(B) 가능. 재무·은행 자료 보완 권고.'},
    history:[{stage:'영업 1차입력',reviewer:'Global OPs',decision:'보류',comment:'서류 미비·사업자 확인 필요',date:'2026-06-28'},
      {stage:'SCM/운영 검토',reviewer:'Global OPs',decision:'진행',comment:'폴더 자료 검토: HK BR·회사소개서 확인, 실체·엔드유저 검증 → 보류 해소',date:'2026-07-03'}] });
  const c2 = mk({ id:'C002', name:'Linkall Travel', country:'중국', businessType:'B2B',
    market:'중국 아웃바운드', customerType:'B2B 여행사(개발역량 강점)',
    website:'https://linkall.example', bizRegNo:'CN-3100-xxxxx', foundedYear:2019, representative:'확인 완료',
    deposit:10000, monthlyGMV:30000, salesRegion:'글로벌', products:'글로벌 호텔',
    scores:[3,4,3,3,2,3,3,3,2,4,3,2,3],
    docs:{'사업자등록증':'제출','회사소개서':'제출','은행정보':'제출','계약서 초안':'제출','정산조건 합의서':'미제출','파트너 레퍼런스':'제출','재무제표/매출자료':'미제출','대표자 신분확인':'제출'},
    notes:{expect:'개발역량 강점으로 API 안정 연동 기대',
      check:'기존 고객사와 채널 중복 가능성, Deposit 커버율 부족, 재무제표 미제출',
      opinion:'기술력은 양호하나 차별성·Deposit 보완 시 조건부 승인 검토 가능'} });
  const c3 = mk({ id:'C003', name:'Wingpulse (WINGSPULSE TECH)', country:'홍콩(중국계)', businessType:'B2B/TMC',
    market:'LCC 항공+호텔 커넥티비티', customerType:'OTA·TMC·DMC (커넥티비티)',
    website:'www.wingspulse.com / info@wingspulse.com', bizRegNo:'51588485 (HK BR)', foundedYear:2025, representative:'HE PENG(贺鹏), 단독이사',
    contact:'WingsPulse', email:'info@wingspulse.com', deposit:10000, monthlyGMV:40000, salesRegion:'글로벌·기업출장', products:'글로벌 호텔·LCC 항공',
    scores:[2,3,3,4,3,3,2,2,2,4,3,2,4], status:'검토중',
    docs:{'사업자등록증':'제출','회사소개서':'제출','은행정보':'미제출','계약서 초안':'미제출','정산조건 합의서':'미제출','파트너 레퍼런스':'제출','재무제표/매출자료':'제출','대표자 신분확인':'미제출'},
    public:{'공식 웹사이트':'Y','LinkedIn/기업프로필':'불명','Google 검색결과':'Y','부정 뉴스':'N','소송/사기/미정산':'N','거래처/업계 레퍼런스':'Y','도메인 생성시점':'불명','회사주소 실존':'Y','대표자 업계이력':'Y'},
    documents:[{name:'사업자등록·감사 재무제표(17p)',file:'Business license wingpulse 1.pdf'},{name:'회사소개서(영문)',file:'Wing pulse intro-English 1.jpg'}],
    notes:{expect:'LCC 항공 데이터 애그리게이션(전신 Alfa Aggregators) 기반 기술력, NDC·100+ 항공사, 호텔 분산 기술 dual-track. OTA·TMC·DMC 대상 커넥티비티 — 기술 잠재력은 높음.',
      check:'★감사 재무제표상 해당연도 무영업(inactive)·매출 0, 2025.5 사명 변경(ALFA AGGREGATORS→WINGSPULSE), 자산 대부분이 이사·주주 대여금(HE PENG 등). 실거래 실적·운영 증빙 부재. Deposit 커버율 0.54x 부족.',
      opinion:'법인·감사보고서는 투명하나 실질 영업 실적이 없는 신설 리브랜드 법인 → 현 단계 보류(D). 선입금/Deposit 대폭 상향 및 실거래 파일럿·매출 증빙 확인 후 재평가 권고.'},
    history:[{stage:'영업 1차입력',reviewer:'Global OPs',decision:'진행',comment:'TMC/커넥티비티 기술 파트너 후보',date:'2026-06-27'},
      {stage:'재무 정산검토',reviewer:'Global OPs',decision:'보류',comment:'폴더 자료 검토: 감사보고서상 무영업·매출0, 사명변경 → 실적 증빙까지 보류',date:'2026-07-03'}] });
  const c4 = mk({ id:'C004', name:'Happy Travel', country:'두바이(UAE)', businessType:'B2B/TMC',
    market:'중동', customerType:'중동 기업/여행사(태국 호텔 수요)',
    website:'https://happytravel.example', bizRegNo:'AE-DXB-xxxxx', foundedYear:2018, representative:'확인 완료',
    deposit:30000, monthlyGMV:60000, salesRegion:'태국', products:'태국 호텔', manualBooking:'Y', apiIntegration:'부분',
    scores:[4,4,4,4,4,3,5,4,3,3,3,3,4],
    notes:{expect:'중동 고객사 통한 태국 호텔 볼륨 증가 기대, Deposit USD 30,000로 상대적 견고',
      check:'수기예약 비중·중동 정산/법무 리스크 확인 필요',
      opinion:'종합 리스크 낮음. 초기 3개월 GMV 한도·모니터링 조건부 승인 추천'},
    history:[
      {stage:'영업 1차입력',reviewer:'Global OPs',decision:'진행',comment:'중동 태국호텔 볼륨 목적, Deposit 30k',date:'2026-06-25'},
      {stage:'SCM/운영 검토',reviewer:'SCM팀',decision:'진행',comment:'엔드유저·인벤토리 적정',date:'2026-06-27'},
      {stage:'재무 정산검토',reviewer:'재무팀',decision:'진행',comment:'커버율 1.07x, GMV 한도 조건',date:'2026-06-29'}] });
  return [c1,c2,c3,c4];
}

/* ---------- boot ---------- */
render();
