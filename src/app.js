const APP_VER='1.0.0 (10-17)';

/* ── 저장: 이 앱 전용 IndexedDB (github.io 다른 앱과 localStorage 용량을 나눠 쓰지 않게) ── */
const DB_NAME='donjusemDB', STORE='kv';
let dbp=null;
function idb(){if(dbp)return dbp;dbp=new Promise((res,rej)=>{try{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}catch(e){rej(e)}});return dbp}
function idbGet(k){return idb().then(db=>new Promise((res,rej)=>{const q=db.transaction(STORE,'readonly').objectStore(STORE).get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)}))}
function idbSet(k,v){return idb().then(db=>new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(v,k);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error)}))}

/* ── 날짜 ── */
const pad=n=>String(n).padStart(2,'0');
const NOW=new Date();
const CUR=`${NOW.getFullYear()}-${pad(NOW.getMonth()+1)}`, TODAY=NOW.getDate();
const ymNext=ym=>{let [y,m]=ym.split('-').map(Number);m++;if(m>12){m=1;y++}return `${y}-${pad(m)}`};
const daysIn=ym=>{const [y,m]=ym.split('-').map(Number);return new Date(y,m,0).getDate()};
const mNum=ym=>+ym.slice(5);
const todayISO=()=>`${CUR}-${pad(TODAY)}`;
const todayLabel=()=>`${NOW.getMonth()+1}월 ${TODAY}일`;
const WD='일월화수목금토';

/* ── 도우미 ── */
const $=s=>document.querySelector(s);
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const clone=o=>JSON.parse(JSON.stringify(o));
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const man=n=>`${Math.round((n||0)/10000).toLocaleString('ko-KR')}만`;
const digits=v=>parseInt(String(v).replace(/\D/g,''),10)||0;
const sum=(a,f)=>a.reduce((t,x)=>t+(f(x)||0),0);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pct=(a,b)=>Math.max(0,Math.min(100,b?a/b*100:0));

/* ── 처음 상태 ── */
function defaultState(){
  return {v:1,setupDone:false,saveStart:0,lastBackup:null,invest:[],months:{},
    plan:{income:[{id:uid(),name:'남편 월급',amt:0,day:25},{id:uid(),name:'내 월급',amt:0,day:10}],fixed:[],me:0,him:0,
      cats:[['grocery','장보기'],['eatout','외식·배달'],['home','생활용품'],['car','교통·주유'],['gift','경조사·선물'],['health','병원·약']].map(([id,name])=>({id,name,budget:0})),
      invest:[],saveDay:25}};
}
function fixState(s){
  const d=defaultState();
  s=Object.assign(d,s||{});
  s.plan=Object.assign(defaultState().plan,s.plan||{});
  ['income','fixed','cats','invest'].forEach(k=>{if(!Array.isArray(s.plan[k]))s.plan[k]=[]});
  if(!Array.isArray(s.invest))s.invest=[];
  s.invest.forEach(it=>{it.kind=it.kind||'simple';it.stocks=it.stocks||[];it.start=it.start||0});
  if(!s.months||typeof s.months!=='object')s.months={};
  Object.values(s.months).forEach(m=>{
    m.plan=Object.assign(clone(s.plan),m.plan||{});
    m.exp=m.exp||[];m.me=m.me||[];m.him=m.him||{left:null,upd:''};m.paid=m.paid||{};
    m.ov=m.ov||{};m.ov.inv=m.ov.inv||{};
  });
  return s;
}
let S=defaultState();
function newMonth(){return {plan:clone(S.plan),exp:[],me:[],him:{left:null,upd:''},paid:{},ov:{inv:{}}}}
// 이번 달까지 빈 달을 채움. 새 달은 「월 계획」 틀을 그대로 복사
function ensureMonths(){
  const keys=Object.keys(S.months).sort();
  if(!keys.length){S.months[CUR]=newMonth();return}
  let last=keys[keys.length-1];
  while(last<CUR){last=ymNext(last);S.months[last]=newMonth()}
}

let saveTimer=null, saveOk=true;
function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(flush,250)}
async function flush(){
  clearTimeout(saveTimer);
  try{await idbSet('state',S);if(!saveOk){saveOk=true;toast('다시 저장되고 있어요')}}
  catch(e){if(saveOk)toast('저장이 안 됐어요. 사파리 개인정보 보호 모드인지 확인해 주세요');saveOk=false}
}

/* ── 상태 ── */
const TABS=['home','living','allow','pot','plan'], TAB_NAME={home:'이번 달',living:'생활비',allow:'용돈',pot:'모은 돈',plan:'월 계획'};
let vm=CUR, tab='home', mode='spend', pick=null, editRef=null, pendingDel=null, qaCat=null;
let valIdx=null, stockRef=null, ovKey=null, hideAmt=false, incView='all', showPaid=false, installClosed=false, pendingImport=null;
const M=()=>S.months[vm];
const isCur=()=>vm===CUR;
const dayNow=ym=>ym===CUR?TODAY:(ym<CUR?99:0);
const invOf=id=>S.invest.find(x=>x.id===id)||{id,name:'(지운 투자)',start:0,kind:'simple',stocks:[]};
const catName=id=>(M().plan.cats.find(c=>c.id===id)||{name:'(지운 항목)'}).name;
const dlabel=d=>`${mNum(vm)}.${pad(d)} ${WD[new Date(+vm.slice(0,4),mNum(vm)-1,d).getDay()]}`;
const ddot=d=>`${+d.slice(5,7)}.${+d.slice(8,10)}`;
const isoToLabel=d=>`${+d.slice(5,7)}월 ${+d.slice(8,10)}일`;

function T(m=M(),ym=vm){
  const pl=m.plan;
  const income=sum(pl.income,x=>x.amt), fixed=sum(pl.fixed,x=>x.amt), allow=pl.me+pl.him,
        budget=sum(pl.cats,x=>x.budget), invest=sum(pl.invest,x=>x.amt), spent=sum(m.exp,x=>x.a), meSpent=sum(m.me,x=>x.a);
  const himLeft=m.him.left??pl.him;
  return {income,fixed,allow,budget,invest,spent,save:income-fixed-allow-budget-invest,meSpent,meLeft:pl.me-meSpent,himLeft,
    livingLeft:budget-spent,daysLeft:ym===CUR?daysIn(ym)-TODAY+1:0};
}
// 한 달에 저축·투자로 들어간 돈. 넣는 날이 지나야 넣은 걸로 침. 남은 용돈은 그 달이 끝나야(다음 달 1일) 저축으로
function contrib(ym){
  const m=S.months[ym], t=T(m,ym), day=dayNow(ym);
  const saveAmt=m.ov.save??Math.max(0,t.save);
  const saveIn=day>=m.plan.saveDay?saveAmt:0;
  const left=ym<CUR?Math.max(0,t.meLeft)+Math.max(0,t.himLeft):0;
  const inv={}; let invPlanned=0;
  m.plan.invest.forEach(x=>{const a=m.ov.inv[x.id]??x.amt;invPlanned+=a;inv[x.id]=day>=x.day?a:0});
  return {saveAmt,saveIn,left,inv,invPlanned,invIn:sum(Object.values(inv),x=>x)};
}
function P(){
  const keys=Object.keys(S.months).filter(k=>k<=CUR).sort();
  const cs=keys.map(k=>({k,c:contrib(k)}));
  const saveTotal=S.saveStart+sum(cs,x=>x.c.saveIn+x.c.left);
  const inv=S.invest.map(it=>{
    const principal=(it.start||0)+sum(cs,x=>x.c.inv[it.id]||0);
    if(it.kind==='stock'){
      const hold=(it.stocks||[]).map(st=>{const q=sum(st.buys,b=>b.q), cost=sum(st.buys,b=>b.q*b.u), val=q*st.price;
        return {...st,q,cost,avg:q?cost/q:0,val,gain:val-cost}});
      const bought=sum(hold,h=>h.cost), cash=principal-bought, value=sum(hold,h=>h.val)+cash;
      return {...it,principal,hold,cash,value,gain:value-principal};
    }
    const value=it.value??principal;
    return {...it,principal,value,gain:value-principal};
  });
  const invPrincipal=sum(inv,x=>x.principal), invValue=sum(inv,x=>x.value);
  let s=S.saveStart, iv=sum(S.invest,x=>x.start||0);
  const months=cs.map(({k,c})=>{
    if(k===CUR)return {m:mNum(k),save:s+c.saveAmt,inv:iv+c.invPlanned,plan:c.saveAmt+c.invPlanned>c.saveIn+c.invIn};
    s+=c.saveIn+c.left;iv+=c.invIn;return {m:mNum(k),save:s,inv:iv};
  }).slice(-8);
  const cc=contrib(CUR);
  return {saveTotal,inv,invPrincipal,invValue,gain:invValue-invPrincipal,total:saveTotal+invValue,months,cs,cc,
    thisSave:cc.saveAmt,thisInv:cc.invPlanned};
}

/* ── 아이콘 (선 아이콘, 이모지 없음) ── */
const ICON={
  save:'<ellipse cx="8" cy="4.8" rx="5" ry="2.1"/><path d="M3 4.8v6.4c0 1.2 2.2 2.1 5 2.1s5-.9 5-2.1V4.8M3 8c0 1.2 2.2 2.1 5 2.1s5-.9 5-2.1"/>',
  stock:'<path d="M2 12l4-4 3 3 5-6M10.5 5H14v3.5"/>',
  cash:'<rect x="2" y="4.5" width="12" height="7" rx="1.5"/><circle cx="8" cy="8" r="1.7"/>',
  fund:'<circle cx="8" cy="8" r="5.6"/><path d="M8 5v3.2l2.2 1.4"/>',
  cart:'<path d="M1.5 2h2l1.6 8h7.4l1.5-5.5H4.4"/><circle cx="6.3" cy="13" r="1"/><circle cx="11.6" cy="13" r="1"/>',
  fork:'<path d="M4 1.5v5a1.5 1.5 0 003 0v-5M5.5 1.5v13M11.5 14.5V1.5c-1.7.8-2.5 2.6-2.5 5v2.5h2.5"/>',
  box:'<path d="M2 5l6-3 6 3v6l-6 3-6-3zM2 5l6 3 6-3M8 8v6"/>',
  car:'<path d="M2.5 10.5V8L4 4.5h8L13.5 8v2.5zM3 10.5v2h2v-2M11 10.5v2h2v-2M2.5 8h11"/>',
  gift:'<rect x="2" y="6" width="12" height="3" rx=".6"/><path d="M3 9v5h10V9M8 6v8M8 6C6.5 3 4 3.6 5 5.4 5.6 6 8 6 8 6zm0 0c1.5-3 4-2.4 3-.6-.6.6-3 .6-3 .6"/>',
  health:'<rect x="2" y="2" width="12" height="12" rx="3.5"/><path d="M8 5v6M5 8h6"/>',
  tag:'<path d="M2 2h6l6 6-6 6-6-6z"/><circle cx="5.2" cy="5.2" r="1"/>',
  bag:'<path d="M3 5h10l-.8 9H3.8zM5.5 5V4a2.5 2.5 0 015 0v1"/>',
  list:'<rect x="3" y="1.5" width="10" height="13" rx="2.5"/><path d="M5.5 5h5M5.5 8h5M5.5 11h3"/>',
  eye:'<path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/>',
  eyeoff:'<path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/><path d="M2 2l12 12"/>',
  arrow:'<path d="M4 12L12 4M5.5 4H12v6.5"/>',
  plus:'<path d="M8 3v10M3 8h10"/>',
  check:'<path d="M3 8.5l3 3 7-7"/>',
  dots:'<circle cx="3.5" cy="8" r=".9"/><circle cx="8" cy="8" r=".9"/><circle cx="12.5" cy="8" r=".9"/>',
  spark:'<path d="M8 1.5l1.6 4.9 4.9 1.6-4.9 1.6L8 14.5 6.4 9.6 1.5 8l4.9-1.6z"/>',
  wallet:'<rect x="1.5" y="4" width="13" height="9" rx="2.5"/><path d="M1.5 7h13M11 10h1.5"/>',
  calendar:'<rect x="2" y="3" width="12" height="11" rx="2.5"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3"/>',
  share:'<path d="M8 10V1.5M5 4.5l3-3 3 3M3.5 7.5v6h9v-6"/>',
  download:'<path d="M8 2v8.5M5 7.5l3 3 3-3M3 13.5h10"/>'
};
const CATICON={grocery:'cart',eatout:'fork',home:'box',car:'car',gift:'gift',health:'health'};
const ico=k=>`<svg class="ic" viewBox="0 0 16 16" aria-hidden="true">${ICON[k]||ICON.tag}</svg>`;
const gainTxt=(g,base)=>`<span class="gain num ${g<0?'minus':''}">${g>=0?'+':'-'}${won(Math.abs(g))}${base?` (${g>=0?'+':'-'}${(Math.abs(g)/base*100).toFixed(1)}%)`:''}</span>`;

/* ── 포트폴리오 그래프 ── */
const PAL=['var(--c1)','var(--c2)','var(--c3)','var(--c4)','var(--c5)','var(--c6)','var(--c7)','var(--c8)','var(--c9)','var(--c10)','var(--c11)'];
function slices(p){
  const inv=[];
  p.inv.forEach(it=>{
    if(it.kind==='stock'){
      it.hold.forEach(h=>inv.push({g:'투자',name:h.name,sub:it.name,val:Math.max(0,h.val),icon:'stock'}));
      if(it.cash>0)inv.push({g:'투자',name:`${it.name} 현금`,val:it.cash,icon:'cash'});
    } else inv.push({g:'투자',name:it.name||'투자',val:Math.max(0,it.value),icon:'fund'});
  });
  const out=[{g:'저축',name:'저축',val:Math.max(0,p.saveTotal),icon:'save'},...inv.sort((a,b)=>b.val-a.val)].filter(x=>x.val>0);
  out.forEach((x,i)=>x.color=PAL[i%PAL.length]);
  return out;
}
const pctTxt=(v,t)=>`${t?(v/t*100).toFixed(1):'0.0'}%`;
const pctRound=(v,t)=>{const x=t?v/t*100:0;return x<1?'1% 미만':`${Math.round(x)}%`};
function ring(sl,tot){
  const W=460,H=360,cx=230,cy=180,R=112,r=60,LR=R+24;
  const pt=(rad,a)=>[cx+rad*Math.sin(a),cy-rad*Math.cos(a)];
  let acc=0; const paths=[], labels=[];
  sl.forEach(x=>{
    const a0=acc/tot*2*Math.PI; acc+=x.val; const a1=acc/tot*2*Math.PI;
    const big=a1-a0>Math.PI?1:0;
    if(sl.length===1){paths.push(`<circle cx="${cx}" cy="${cy}" r="${(R+r)/2}" fill="none" stroke="${x.color}" stroke-width="${R-r}"/>`)}
    else{const [x0,y0]=pt(R,a0),[x1,y1]=pt(R,a1),[x2,y2]=pt(r,a1),[x3,y3]=pt(r,a0);
      paths.push(`<path d="M${x0} ${y0}A${R} ${R} 0 ${big} 1 ${x1} ${y1}L${x2} ${y2}A${r} ${r} 0 ${big} 0 ${x3} ${y3}Z" fill="${x.color}"/>`)}
    const am=(a0+a1)/2, [lx,ly]=pt(LR,am);
    labels.push({x:lx,y:ly,side:Math.sin(am)>=0?1:-1,name:x.name.length>8?x.name.slice(0,7)+'…':x.name,pct:pctRound(x.val,tot)});
  });
  [1,-1].forEach(sd=>{
    const g=labels.filter(l=>l.side===sd).sort((a,b)=>a.y-b.y);
    for(let i=1;i<g.length;i++)if(g[i].y-g[i-1].y<36)g[i].y=g[i-1].y+36;
    const over=g.length?g[g.length-1].y-(H-24):0;
    if(over>0)g.forEach(l=>l.y-=over);
  });
  const lab=labels.map(l=>{const anc=Math.abs(l.x-cx)<14?'middle':l.side>0?'start':'end';
    return `<text x="${l.x}" y="${l.y-3}" text-anchor="${anc}" class="lp">${l.pct}</text><text x="${l.x}" y="${l.y+14}" text-anchor="${anc}" class="ln">${esc(l.name)}</text>`}).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="포트폴리오 비율 그래프">
    ${paths.join('')}<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--pf-hole)"/>
    <text x="${cx}" y="${cy-6}" text-anchor="middle" class="ct" font-size="17">전부</text>
    <text x="${cx}" y="${cy+20}" text-anchor="middle" class="ct" font-size="22">${man(tot)}원</text>
    ${lab}</svg>`;
}
function portfolio(p){
  const sl=slices(p), tot=sum(sl,x=>x.val);
  if(!tot)return `<section class="card span2"><h2>포트폴리오</h2><div class="sub">모은 돈이 생기면 저축과 투자 비율이 여기에 그래프로 보여요.</div></section>`;
  const g=k=>sum(sl.filter(x=>x.g===k),x=>x.val);
  return `<section class="card span2 pfc">
    <div class="row-h"><h2>포트폴리오</h2><span class="sub">투자는 지금 금액 기준</span></div>
    <div class="pf-sum num">저축 <b>${pctTxt(g('저축'),tot)}</b> · 투자 <b>${pctTxt(g('투자'),tot)}</b></div>
    <div class="pf">
      ${ring(sl,tot)}
      <div class="pfl">${sl.map(x=>`<div class="pfi"><span class="dt" style="background:${x.color}"></span>${ico(x.icon)}<span class="nm"><span>${esc(x.name)}</span><small class="num">${pctTxt(x.val,tot)} · ${won(x.val)}원</small></span></div>`).join('')}</div>
    </div>
  </section>`;
}
function chart(months){
  const max=Math.max(...months.map(x=>x.save+x.inv),1);
  return `<div class="chart" role="img" aria-label="달마다 쌓인 저축과 투자">${months.map(x=>{const tot=x.save+x.inv;
    return `<div class="col ${x.plan?'plan':''}"><div class="cbw"><span class="cv num">${man(tot)}</span><div class="cb" style="height:${tot/max*82}%"><i class="ci" style="height:${tot?x.inv/tot*100:0}%"></i><i class="cs" style="height:${tot?x.save/tot*100:0}%"></i></div></div><span class="cm">${x.m}월${x.plan?' 예정':''}</span></div>`}).join('')}</div>`;
}

/* ── 안내 카드 ── */
const isIOS=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const isStandalone=()=>navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;
function topCards(){
  let h='';
  if(isIOS&&!isStandalone()&&!installClosed)h+=`<section class="card install">
    <div class="ch"><span class="icircle">${ico('share')}</span><h2>홈 화면에 추가해 주세요</h2><button class="x" data-closeinstall>닫기</button></div>
    <div>사파리 아래쪽 <b>공유 버튼</b>을 누르고 <b>「홈 화면에 추가」</b>를 누르면 앱처럼 쓸 수 있어요.</div>
    <div class="sub">추가하지 않고 사파리로만 쓰면, 7일 동안 안 열었을 때 기록이 지워질 수 있어요.</div>
  </section>`;
  if(!S.setupDone)h+=`<section class="card welcome">
    <h2>돈주셈을 시작해요</h2>
    <div>먼저 <b>월 계획</b>에 월급, 고정지출, 용돈, 생활비 예산을 적어 주세요. 한 번만 적으면 매달 그대로 들어가요.</div>
    <button class="btn" data-tab="plan">${ico('arrow')}월 계획 적기</button>
  </section>`;
  return h;
}
function backupCard(){
  if(!S.setupDone)return '';
  const d=S.lastBackup?Math.floor((Date.now()-S.lastBackup)/864e5):null;
  if(d!==null&&d<30)return '';
  return `<section class="card backupnag">
    <div class="ch"><span class="icircle">${ico('download')}</span><h2>${d===null?'아직 백업을 안 했어요':`백업한 지 ${d}일 지났어요`}</h2></div>
    <div class="sub">기록은 이 아이폰에만 있어요. 백업 파일을 「파일」 앱에 저장해 두면 폰을 바꿔도 되살릴 수 있어요.</div>
    <button class="btn" data-backup>${ico('download')}백업 파일 저장</button>
  </section>`;
}

/* ── 화면: 이번 달 ── */
function home(){
  const m=M(), pl=m.plan, t=T(), p=P(), perDay=t.daysLeft?Math.max(0,t.livingLeft)/t.daysLeft:0;
  const short=n=>n.replace(/ 월급$/,'');
  if(incView!=='all'&&!pl.income[+incView])incView='all';
  const incAmt=incView==='all'?t.income:pl.income[+incView].amt;
  const seg=[['고정지출',t.fixed,'var(--fixed)'],['용돈',t.allow,'var(--me)'],['생활비',t.budget,'var(--living)'],['투자',t.invest,'var(--inv)'],['저축',Math.max(0,t.save),'var(--save)']];
  const fixedSorted=[...pl.fixed].sort((a,b)=>a.day-b.day);
  const unpaid=fixedSorted.filter(f=>!m.paid[f.id]), paid=fixedSorted.filter(f=>m.paid[f.id]);
  const catSp=pl.cats.map(c=>{const sp=sum(m.exp.filter(e=>e.c===c.id),e=>e.a);return {...c,sp,r:c.budget?sp/c.budget:0}});
  const topCat=[...catSp].filter(c=>c.budget).sort((a,b)=>b.r-a.r)[0];
  const used=t.budget?t.spent/t.budget:0, C=2*Math.PI*84;
  const potRows=[{name:'저축',v:p.saveTotal},...p.inv.map(it=>({name:it.name||'투자',v:it.value}))];
  const pmax=Math.max(...potRows.map(x=>x.v),1), ptot=sum(potRows,x=>x.v)||1;
  const dueRow=(f,isPaid)=>{const late=f.day<=dayNow(vm);
    return `<div class="due ${isPaid?'done':''}"><span class="icircle">${ico('calendar')}</span><div class="t"><b>${esc(f.name||'고정지출')} <span class="num">${won(f.amt)}</span></b>
      <span class="warnt">${isPaid?`${f.day}일 · 나갔어요`:late?`${f.day}일 · 나갔으면 체크해 주세요`:`${f.day}일 나갈 예정`}</span></div>
      ${isPaid?`<button class="x" data-unpaid="${f.id}">취소</button>`:`<button class="okbtn" data-paid="${f.id}" aria-label="${esc(f.name)} 나갔어요">${ico('check')}</button>`}</div>`};
  const recent=sortedExp().slice(0,4);
  return `${topCards()}<div class="grid g-home">
  <section class="card hero">
    <div class="hero-top">
      <div class="segp" role="group" aria-label="누구 월급 볼지">
        <button data-inc="all" aria-pressed="${incView==='all'}">둘이 합쳐서</button>
        ${pl.income.map((x,i)=>`<button data-inc="${i}" aria-pressed="${incView===String(i)}">${esc(short(x.name)||'수입')}</button>`).join('')}
      </div>
      <div class="acct"><span class="sub">들어오는 날</span><b class="num">${pl.income.map(i=>`${esc(short(i.name))} ${i.day}일`).join(' · ')||'-'}</b></div>
    </div>
    <div>
      <div class="lbl">${mNum(vm)}월에 들어온 돈</div>
      <div class="hero-num"><span class="huge num">${hideAmt?'••••••':won(incAmt)}<small>원</small></span><button class="iconbtn" data-hide aria-label="${hideAmt?'금액 보이기':'금액 숨기기'}">${ico(hideAmt?'eyeoff':'eye')}</button></div>
    </div>
    ${t.income?`<div class="stack" role="img" aria-label="들어온 돈 나눈 비율">${seg.map(s=>`<i style="width:${pct(s[1],t.income)}%;background:${s[2]}"></i>`).join('')}</div>`:''}
    <ul class="legend">${seg.map(s=>`<li><span class="dot" style="background:${s[2]}"></span>${s[0]}<b class="num">${won(s[1])}</b></li>`).join('')}</ul>
    ${t.save<0?`<div class="hint bad">정한 돈이 들어오는 돈보다 <b class="num">${won(-t.save)}원</b> 많아요. 월 계획에서 줄여 주세요.</div>`:''}
    <div class="hero-act">
      <button class="btn" data-open="spend">${ico('plus')}지출 적기</button>
      <button class="btn ghost" data-open="me">${ico('wallet')}내 용돈 적기</button>
      <button class="roundlime" data-tab="plan" aria-label="월 계획 보기">${ico('arrow')}</button>
    </div>
  </section>

  <section class="card limecard">
    <div class="row-h" style="align-items:center"><span class="badge">${mNum(vm)}월 생활비<i>${ico('spark')}</i></span><button class="iconbtn" data-tab="living" aria-label="생활비 자세히">${ico('dots')}</button></div>
    <div>
      <div class="lbl">생활비 남은 돈</div>
      <div class="hero-num"><span class="huge num">${won(t.livingLeft)}<small>원</small></span>${t.livingLeft<0?`<span class="chip-w neg num">${won(-t.livingLeft)}원 넘음</span>`:t.daysLeft?`<span class="chip-w num">하루 ${won(perDay)}원씩</span>`:''}</div>
      <div class="sub num">${won(t.budget)}원 중 ${won(t.spent)}원 썼어요${t.daysLeft?` · 오늘 포함 ${t.daysLeft}일 남음`:' · 지난달 기록이에요'}</div>
    </div>
    <div class="tiles">
      <button class="tile" data-tab="allow"><span class="tl">내 용돈 남음</span><b class="num">${ico('wallet')}${won(t.meLeft)}</b></button>
      <button class="tile" data-tab="allow"><span class="tl"><span>남편 용돈 남음</span><span>${m.him.upd||''}</span></span><b class="num">${ico('wallet')}${won(t.himLeft)}</b></button>
    </div>
  </section>

  <section class="card c3">
    <div class="ch"><span class="icircle">${ico('bag')}</span><h2>생활비</h2><span class="pill-o">${mNum(vm)}월</span></div>
    <div class="gauge"><svg viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="84" fill="none" stroke="var(--fixed)" stroke-width="14" stroke-dasharray="34 10"/>
      ${used>0?`<circle cx="100" cy="100" r="84" fill="none" stroke="${used>1?'var(--bad)':'var(--lime)'}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${C*Math.min(1,used)} ${C}"/>`:''}</svg>
      <div class="gc"><b class="num">${won(t.spent)}</b><span class="num" style="color:${used>1?'var(--bad)':'var(--up)'};font-weight:600;font-size:14px">${t.budget?`예산의 ${Math.round(used*100)}%`:'예산을 적어 주세요'}</span></div></div>
    ${topCat&&topCat.sp?`<div class="chip-o">${ico('spark')}<span>${esc(topCat.name)} 예산을 <b class="num">${Math.round(topCat.r*100)}%</b> 썼어요</span></div>`:''}
    <div class="catleg">${[...catSp].sort((a,b)=>b.sp-a.sp).map((c,i)=>`<span class="${i>1||!c.sp?'f':''}">${ico(CATICON[c.id]||'tag')}${esc(c.name)} <b class="num" style="font-weight:500">${won(c.sp)}</b></span>`).join('')}</div>
  </section>

  <section class="card c3">
    <div class="ch"><span class="icircle">${ico('save')}</span><h2>모은 돈</h2><span class="tgt num"><span>이번 달 +${man(p.thisSave+p.thisInv)}</span><i></i></span></div>
    <div><div class="big num">${won(p.total)}<small>원</small></div>${p.invPrincipal?`<div class="sub">${gainTxt(p.gain)} 투자로 늘어난 돈</div>`:'<div class="sub">저축과 투자를 합친 돈이에요</div>'}</div>
    <div style="display:flex;flex-direction:column;gap:14px">${potRows.map(x=>{const w=x.v/pmax*100, top=x.v===pmax&&x.v>0;
      return `<div class="brw ${top?'mx':''}"><div class="row-h"><span>${esc(x.name)}</span><span class="num">${won(x.v)}</span></div><div class="bar2 ${top?'mx':''}"><i style="width:${w}%"></i>${top?`<em class="num" style="left:${w}%">${Math.round(x.v/ptot*100)}%</em>`:''}</div></div>`}).join('')}</div>
    <button class="link" data-tab="pot">포트폴리오·달별 그래프 보기</button>
  </section>

  <section class="card c3">
    <div class="ch"><span class="icircle">${ico('list')}</span><h2>최근 지출</h2><button class="iconbtn" data-tab="living" aria-label="생활비 전체 보기">${ico('dots')}</button></div>
    ${unpaid.slice(0,3).map(f=>dueRow(f,false)).join('')}
    ${unpaid.length>3?`<div class="sub">안 나간 고정지출 ${unpaid.length-3}건 더 있어요</div>`:''}
    ${paid.length?`<button class="link" data-showpaid>${showPaid?'나간 고정지출 접기':`나간 고정지출 ${paid.length}건 보기`}</button>${showPaid?paid.map(f=>dueRow(f,true)).join(''):''}`:''}
    <div>${recent.length?recent.map(({e,i})=>`<button class="txr" data-e="${i}"><span class="icircle">${ico(CATICON[e.c]||'tag')}</span><span class="t"><b>${esc(e.m||catName(e.c))}</b><span class="sub">${dlabel(e.d)} · ${esc(catName(e.c))}</span></span><b class="num">-${won(e.a)}</b></button>`).join('')
      :'<div class="sub">아직 적은 지출이 없어요. 「지출 적기」로 첫 지출을 적어 보세요.</div>'}</div>
  </section>
  </div>${backupCard()}`;
}

const sortedExp=()=>M().exp.map((e,i)=>({e,i})).sort((x,y)=>y.e.d-x.e.d||y.i-x.i);
function expRows(list){
  return list.map(({e,i})=>`<button class="erow" data-e="${i}"><span class="e-d num">${dlabel(e.d)}</span><span class="e-c tag">${esc(catName(e.c))}</span><span class="e-m">${esc(e.m||catName(e.c))}</span><span class="e-a num">${won(e.a)}</span></button>`).join('');
}
const THEAD='<div class="thead"><span>날짜</span><span>항목</span><span>메모</span><span>금액</span></div>';

/* ── 화면: 생활비 ── */
function living(){
  const m=M(), t=T();
  if(!qaCat||(qaCat!=='me'&&!m.plan.cats.some(c=>c.id===qaCat)))qaCat=m.plan.cats[0]?.id||'me';
  const cats=m.plan.cats.map(c=>{
    const sp=sum(m.exp.filter(e=>e.c===c.id),e=>e.a), left=c.budget-sp, r=c.budget?sp/c.budget:(sp?2:0);
    const cls=r>1?'over':r>=.85?'warn':'';
    return `<div class="cat ${cls}"><div class="row-h"><b>${esc(c.name)}</b><span class="num">${won(sp)} <span class="sub">/ ${won(c.budget)}</span></span></div>
      <div class="bar"><i style="width:${pct(sp,c.budget)}%"></i></div>
      <div class="left num">${left>=0?`${won(left)}원 남음`:`${won(-left)}원 넘었어요`}</div></div>`;
  }).join('');
  const last=daysIn(vm), defD=isCur()?todayISO():`${vm}-01`;
  return `<div class="grid g-live">
  <section class="card">
    <div class="row-h"><h2>항목별 예산</h2><span class="sub num">${won(t.spent)} / ${won(t.budget)}</span></div>
    ${cats||'<div class="sub">생활비 항목이 없어요.</div>'}
    <button class="link" data-tab="plan">항목·예산 고치기</button>
  </section>
  <section class="card">
    <div class="row-h"><h2>쓴 내역</h2><span class="sub">줄을 누르면 고치거나 지울 수 있어요</span></div>
    <form class="qa" id="qa" autocomplete="off">
      <input type="date" id="qaD" value="${defD}" min="${vm}-01" max="${vm}-${last}" aria-label="날짜">
      <select id="qaC" aria-label="항목">${m.plan.cats.map(c=>`<option value="${c.id}" ${qaCat===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}<option value="me" ${qaCat==='me'?'selected':''}>내 용돈</option></select>
      <input id="qaM" placeholder="메모 (선택)" aria-label="메모">
      <input id="qaA" class="qa-a" inputmode="numeric" placeholder="금액" aria-label="금액">
      <button class="btn" type="submit">적기</button>
    </form>
    ${m.exp.length?`<div>${THEAD}<div class="rows">${expRows(sortedExp())}</div></div>`:'<div class="sub">이 달에 적은 생활비가 없어요.</div>'}
  </section>
  </div>`;
}

/* ── 화면: 용돈 ── */
function allow(){
  const m=M(), pl=m.plan, t=T(), sum2=Math.max(0,t.meLeft)+Math.max(0,t.himLeft);
  const prevKey=Object.keys(S.months).filter(k=>k<vm).sort().pop();
  const prevLeft=prevKey?contrib(prevKey).left:null;
  return `<p class="lead">용돈은 매달 정해진 금액을 각자 받고, 어디에 썼는지는 적지 않아요. 남은 금액만 보여요.</p>
  <div class="grid g2">
  <section class="card" style="background:var(--me-soft)">
    <div class="row-h"><h2 style="color:var(--me)">내 용돈</h2><span class="sub num">한 달 ${won(pl.me)}원</span></div>
    <div class="big num">${won(t.meLeft)}<small>원 남음</small></div>
    <div class="bar"><i style="width:${pct(t.meSpent,pl.me)}%;background:var(--me)"></i></div>
    <div class="sub num">${won(t.meSpent)}원 썼어요 · ${m.me.length}번</div>
    <button class="btn me" data-open="me">쓴 금액 적기</button>
    <div class="rows">${m.me.map((s,i)=>({s,i})).sort((x,y)=>y.s.d-x.s.d||y.i-x.i).map(({s,i})=>`<button class="erow" data-m="${i}"><span class="e-d num">${dlabel(s.d)}</span><span class="e-m sub">용돈</span><span class="e-c"></span><span class="e-a num">-${won(s.a)}</span></button>`).join('')}</div>
  </section>
  <section class="card" style="background:var(--him-soft)">
    <div class="row-h"><h2 style="color:var(--him)">남편 용돈</h2><span class="sub num">한 달 ${won(pl.him)}원</span></div>
    <div class="big num">${won(t.himLeft)}<small>원 남음</small></div>
    <div class="bar"><i style="width:${pct(pl.him-t.himLeft,pl.him)}%;background:var(--him)"></i></div>
    <div class="sub">${m.him.upd?`남편이 알려준 금액이에요 · ${m.him.upd}`:'아직 남은 금액을 안 들었어요. 들으면 고쳐 주세요.'}</div>
    <button class="btn him" data-open="him">남은 금액 고치기</button>
  </section>
  <section class="card span2">
    <h2>남은 용돈은 저축으로 가요</h2>
    ${vm<CUR?`<div class="hint save">이 달에 남은 용돈 <b class="num">${won(sum2)}원</b>은 저축으로 넘어갔어요.</div>`
      :`<div class="hint save">${mNum(ymNext(vm))}월 1일에 남은 용돈이 저축으로 넘어가요. 지금대로면 내 ${won(Math.max(0,t.meLeft))} + 남편 ${won(Math.max(0,t.himLeft))} = <b class="num">${won(sum2)}원</b></div>`}
    ${prevKey?`<div class="sub">${mNum(prevKey)}월에 남은 용돈 ${won(prevLeft)}원은 저축으로 넘어갔어요.</div>`:''}
  </section>
  </div>`;
}

/* ── 화면: 모은 돈 ── */
function pot(){
  const p=P(), cc=p.cc, cm=S.months[CUR], t=T(cm,CUR);
  const leftNow=Math.max(0,t.meLeft)+Math.max(0,t.himLeft);
  const statusPill=(day,done)=>`<span class="pill ${done?'':'soon'}">${done?'넣음':`${day}일`}</span>`;
  const hist=p.cs.filter(x=>x.c.saveIn+x.c.left>0).reverse();
  return `<div class="grid g2">
  <section class="card span2">
    <div class="lbl">모은 돈 전부 (투자는 지금 금액 기준)</div>
    <div class="big num">${won(p.total)}<small>원</small></div>
    <ul class="legend" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <li><span class="dot" style="background:var(--save)"></span>저축<b class="num">${won(p.saveTotal)}</b></li>
      <li><span class="dot" style="background:var(--inv)"></span>투자<b class="num">${won(p.invValue)}</b></li>
    </ul>
    ${chart(p.months)}
    <div class="sub">막대는 달마다 쌓인 돈이에요(투자는 넣은 돈 기준). 이번 달은 넣을 예정인 금액까지 더해서 보여요.</div>
  </section>

  ${portfolio(p)}

  <section class="card">
    <div class="row-h"><h2>${mNum(CUR)}월에 넣을 돈</h2><span class="sub num">${won(p.thisSave+p.thisInv)}원</span></div>
    <div class="rows">
      <button class="lrow" data-ov="save"><span class="t">저축 (남는 돈)${cm.ov.save!=null?' <span class="sub">· 고친 금액</span>':''}</span>${statusPill(cm.plan.saveDay,TODAY>=cm.plan.saveDay)}<span class="a num">${won(cc.saveAmt)}</span></button>
      ${cm.plan.invest.map(x=>`<button class="lrow" data-ov="${x.id}"><span class="t">${esc(invOf(x.id).name||'투자')}${cm.ov.inv[x.id]!=null?' <span class="sub">· 고친 금액</span>':''}</span>${statusPill(x.day,TODAY>=x.day)}<span class="a num">${won(cm.ov.inv[x.id]??x.amt)}</span></button>`).join('')}
      <div class="lrow"><span class="t">남은 용돈 → 저축 <span class="sub">(예상)</span></span><span class="pill soon">${mNum(ymNext(CUR))}월 1일</span><span class="a num">${won(leftNow)}</span></div>
    </div>
    <div class="sub">날짜가 지나면 넣은 걸로 쳐요. 실제로 넣은 금액이 달랐으면 줄을 눌러 고쳐 주세요.</div>
  </section>

  <section class="card">
    <div class="row-h"><h2>저축</h2><span class="sub">누적</span></div>
    <div class="big num">${won(p.saveTotal)}<small>원</small></div>
    <div class="sub num">앱 쓰기 전에 있던 돈 ${won(S.saveStart)} + 그 뒤로 넣은 돈 ${won(p.saveTotal-S.saveStart)}</div>
    <ul class="list">${hist.map(({k,c})=>`<li><div class="t">${mNum(k)}월${c.left?` <span class="sub">(남은 용돈 ${won(c.left)} 포함)</span>`:''}</div><span class="a num">+${won(c.saveIn+c.left)}</span></li>`).join('')||'<li class="sub">아직 넣은 기록이 없어요.</li>'}</ul>
  </section>

  ${p.inv.map((it,i)=>{const inPlan=cm.plan.invest.find(x=>x.id===it.id);
  return `<section class="card" style="background:var(--inv-soft)">
    <div class="row-h"><h2 style="color:var(--inv)">${esc(it.name||'투자')}</h2><span class="sub num">${inPlan?`매달 ${won(inPlan.amt)}`:'지금은 매달 넣지 않아요'}</span></div>
    <div class="big num">${won(it.value)}<small>원</small></div>
    <div class="kv">
      <div><span class="sub">넣은 돈 (누적)</span><b class="num">${won(it.principal)}</b></div>
      <div><span class="sub">늘어난 돈</span>${gainTxt(it.gain,it.principal)}</div>
    </div>
    ${it.kind==='stock'?`
    <div class="hold">${it.hold.length?it.hold.map((h,k)=>`<button class="hrow" data-stock="${i}:${k}">
        <span class="hn"><b>${esc(h.name)}</b><span class="sub num">${won(h.q)}주 · 평균 ${won(h.avg)} → 지금 ${won(h.price)}</span></span>
        <span class="hv"><b class="num">${won(h.val)}</b>${gainTxt(h.gain,h.cost)}</span></button>`).join('')
      :'<div class="sub">산 주식을 적으면 여기에 종목별로 보여요.</div>'}</div>
    <div class="sub num">${it.cash>=0?`남은 현금 ${won(it.cash)}원 (넣었지만 아직 주식을 안 산 돈)`:`넣은 돈보다 ${won(-it.cash)}원 더 샀어요. 월 계획의 시작 금액이나 산 기록을 확인해 주세요.`}</div>
    ${it.hold.length?'<div class="sub">종목을 누르면 지금 가격을 고치거나 산 기록을 볼 수 있어요.</div>':''}
    <button class="btn inv" data-buy="${i}">${ico('plus')}산 주식 적기</button>`
    :`<div class="sub">${it.vdate?`${it.vdate}에 확인한 금액이에요`:'아직 지금 금액을 안 적었어요. 넣은 돈으로 보여요.'}</div>
    <button class="btn inv" data-val="${i}">지금 금액 고치기</button>
    <button class="link" data-tostock="${i}">주식 계좌로 바꾸기 (종목·주수 적기)</button>`}
  </section>`}).join('')}
  ${S.invest.length?'':`<section class="card"><h2>투자</h2><div class="sub">월 계획의 「투자」에 주식 계좌·연금처럼 매달 넣는 곳을 추가하면 여기에 보여요.</div><button class="link" data-tab="plan">월 계획으로 가기</button></section>`}
  </div>`;
}

/* ── 화면: 월 계획 ── */
function edRows(k,rows,opt){
  const hasDay=opt.day;
  return `<div class="ed-head ${hasDay?'has-day':''}"><span>이름</span>${hasDay?'<span>날짜</span>':''}<span>금액</span><span></span></div>`+
  rows.map((r,i)=>{
    const key=`${k}:${r.id}`, warn=pendingDel===key;
    const n=k==='cats'?M().exp.filter(e=>e.c===r.id).length:0;
    return `<div class="ed ${hasDay?'has-day':''}">
      <input data-k="${k}" data-i="${i}" data-f="name" value="${esc(r.name)}" placeholder="${opt.ph||'이름'}" aria-label="이름">
      ${hasDay?`<label class="day"><input data-k="${k}" data-i="${i}" data-f="day" value="${r.day}" inputmode="numeric" maxlength="2" aria-label="매달 며칠">일</label>`:''}
      <input class="ed-a" data-k="${k}" data-i="${i}" data-f="${opt.f}" value="${won(r[opt.f])}" inputmode="numeric" aria-label="금액">
      <button class="ed-x" data-del="${key}" aria-label="${esc(r.name)} 빼기">빼기</button>
      ${warn?`<div class="ed-warn">이 항목에 이 달 지출이 ${n}건 있어요. 빼면 「기타」로 옮겨져요. 한 번 더 누르면 빼요.</div>`:''}
    </div>`;}).join('');
}
function plan(){
  const m=M(), pl=m.plan;
  const blk=(title,key,body,add,extra='')=>`<section class="card"><div class="row-h"><h2>${title}</h2></div>${body}
    ${add?`<button class="link" data-add="${key}">+ ${add}</button>`:''}
    <div class="sumline num"><span>합계</span><span data-sum="${key}"></span></div>${extra}</section>`;
  const invRows=pl.invest.map(x=>({id:x.id,name:invOf(x.id).name,amt:x.amt,day:x.day}));
  const setup=S.setupDone?'':`<section class="card welcome span2">
    <h2>처음 적는 순서</h2>
    <div>들어오는 돈 → 고정지출 → 용돈 → 생활비 예산 → 투자 → 앱 쓰기 전에 모아둔 돈. 모르는 칸은 0으로 두고 나중에 고쳐도 돼요.</div>
    <button class="btn" data-setupdone>${ico('check')}다 적었어요</button>
  </section>`;
  const imp=pendingImport?`<div class="hint bad">「${esc(pendingImport.when)}」에 만든 백업이에요. 바꾸면 지금 기록이 전부 이 파일 내용으로 바뀌어요.</div>
    <div class="pair"><button class="btn danger" data-importgo>바꾸기</button><button class="btn ghost" data-importcancel>취소</button></div>`:'';
  return `<p class="lead">${isCur()?'한 번 정해 두면 매달 그대로 들어가요. 칸을 눌러 바로 고치면 돼요.':`${mNum(vm)}월 계획이에요. 여기서 고치면 그 달만 바뀌어요.`}</p>
  <div class="grid g2">
  ${setup}
  ${blk('들어오는 돈','income',edRows('income',pl.income,{day:1,f:'amt',ph:'예) 남편 월급'}),'들어오는 돈 추가')}
  ${blk('용돈','allow',`<div class="ed-head"><span>이름</span><span>금액</span><span></span></div>
     <div class="ed"><span class="fixedname">내 용돈</span><input class="ed-a" data-k="me" data-f="amt" value="${won(pl.me)}" inputmode="numeric" aria-label="내 용돈"><span></span></div>
     <div class="ed"><span class="fixedname">남편 용돈</span><input class="ed-a" data-k="him" data-f="amt" value="${won(pl.him)}" inputmode="numeric" aria-label="남편 용돈"><span></span></div>`,'')}
  ${blk('고정지출','fixed',edRows('fixed',pl.fixed,{day:1,f:'amt',ph:'예) 월세'}),'고정지출 추가')}
  ${blk('생활비 항목·예산','cats',edRows('cats',pl.cats,{f:'budget',ph:'예) 장보기'}),'항목 추가')}
  ${blk('투자','invest',edRows('invest',invRows,{day:1,f:'amt',ph:'예) 주식 계좌'}),'투자 추가','<div class="sub">매달 넣는 금액과 날짜예요. 주식·펀드·연금처럼 불리는 돈을 적어요.</div>')}
  <section class="card">
    <h2>저축</h2>
    <div class="big num" data-save></div>
    <div class="sub">들어오는 돈에서 고정지출·용돈·생활비 예산·투자를 빼고 남는 돈이에요. 여기에 달 끝에 남은 용돈도 더해져요.</div>
    <div class="ed"><span class="fixedname">매달 저축 넣는 날</span><label class="day" style="justify-content:flex-end"><input data-k="saveDay" value="${pl.saveDay}" inputmode="numeric" maxlength="2" aria-label="저축 넣는 날" style="max-width:64px;text-align:center">일</label><span></span></div>
    <div data-savewarn></div>
  </section>
  <section class="card">
    <h2>앱 쓰기 전에 모아둔 돈</h2>
    <div class="sub">처음 한 번만 적어요. 모은 돈 누적이 이 금액부터 시작해요.</div>
    <div class="ed"><span class="fixedname">저축 (통장·적금)</span><input class="ed-a" data-k="saveStart" value="${won(S.saveStart)}" inputmode="numeric" aria-label="시작 저축 금액"><span></span></div>
    ${S.invest.map(it=>`<div class="ed"><span class="fixedname">${esc(it.name||'투자')}</span><input class="ed-a" data-k="istart" data-id="${it.id}" value="${won(it.start)}" inputmode="numeric" aria-label="${esc(it.name)} 시작 금액"><span></span></div>`).join('')}
    ${S.invest.some(it=>it.kind==='stock')?'<div class="sub">주식 계좌는 그때까지 계좌에 넣은 돈(산 주식 값 + 남은 현금)을 적고, 그때 가지고 있던 주식은 「모은 돈」에서 산 주식으로 적어 주세요.</div>':''}
  </section>
  <section class="card">
    <h2>백업</h2>
    <div class="sub">기록은 이 아이폰에만 저장돼요. 한 달에 한 번 백업 파일을 「파일」 앱에 저장해 두면 폰을 바꿔도 되살릴 수 있어요.${S.lastBackup?` 마지막 백업: ${new Date(S.lastBackup).toLocaleDateString('ko-KR')}`:''}</div>
    <div class="pair"><button class="btn ghost" data-backup>${ico('download')}백업 파일 저장</button><button class="btn ghost" data-import>백업 불러오기</button></div>
    ${imp}
    <div class="sub">돈주셈 ${APP_VER}</div>
  </section>
  </div>`;
}
function updateSums(){
  const t=T();
  const set=(k,v)=>{const el=document.querySelector(`[data-sum="${k}"]`);if(el)el.textContent=won(v)};
  set('income',t.income);set('fixed',t.fixed);set('allow',t.allow);set('cats',t.budget);set('invest',t.invest);
  const sv=document.querySelector('[data-save]');
  if(sv){sv.innerHTML=`${won(t.save)}<small>원</small>`;sv.style.color=t.save<0?'var(--bad)':'';
    document.querySelector('[data-savewarn]').innerHTML=t.save<0?`<div class="hint bad">정한 돈이 들어오는 돈보다 <b class="num">${won(-t.save)}원</b> 많아요. 어딘가 줄여야 해요.</div>`:''}
}

/* ── 그리기 ── */
function render(){
  $('#view').innerHTML={home,living,allow,pot,plan}[tab]();
  $('#ptitle').textContent=TAB_NAME[tab]; $('#ptitle').hidden=tab==='home';
  $('#mlabel').textContent=`${vm.slice(0,4)}년 ${mNum(vm)}월`;
  $('#mlabel').classList.toggle('past',!isCur());
  document.querySelectorAll('nav [data-tab]').forEach(b=>{if(b.dataset.tab===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  if(tab==='plan')updateSums();
  persist();
}
function go(t){tab=t;pendingDel=null;render();window.scrollTo(0,0)}
function toast(msg){const el=$('#toast');el.textContent=msg;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,2200)}
function moveMonth(dir){
  const keys=Object.keys(S.months).sort(), i=keys.indexOf(vm), n=keys[i+dir];
  if(!n)return toast(dir<0?'이전 기록이 없어요':'이번 달이 마지막이에요');
  vm=n;pendingDel=null;render();
}

/* ── 적기 창 ── */
function chips(){
  $('#chips').innerHTML=M().plan.cats.map(c=>`<button data-c="${c.id}" aria-pressed="${pick===c.id}">${esc(c.name)}</button>`).join('')+
    `<button class="mine" data-c="me" aria-pressed="${pick==='me'}">내 용돈</button>`;
  const mine=pick==='me';
  $('#memoField').hidden=mine; $('#allowNote').hidden=!mine;
}
function extraBuy(it){
  const names=(it.stocks||[]).map(st=>st.name);
  return `<div class="field"><label for="bName">종목</label><input id="bName" placeholder="예) 삼성전자" autocomplete="off"></div>
    ${names.length?`<div class="chips">${names.map(n=>`<button data-sname="${esc(n)}">${esc(n)}</button>`).join('')}</div>`:''}
    <div class="two"><div class="field"><label for="bQty">몇 주</label><input id="bQty" inputmode="numeric" placeholder="0"></div>
    <div class="field"><label for="bUnit">1주 가격</label><input id="bUnit" inputmode="numeric" placeholder="0"></div></div>
    <div class="field"><label for="bDate">산 날짜</label><input id="bDate" type="date" value="${todayISO()}"></div>
    <div class="hint" id="bSum">합계 0원</div>`;
}
function extraStock(st){
  const q=sum(st.buys,b=>b.q), cost=sum(st.buys,b=>b.q*b.u);
  return `<div class="sub num">${won(q)}주 가지고 있어요 · 평균 산 가격 ${won(q?cost/q:0)} · 산 돈 ${won(cost)}</div>
    <div class="field"><label>산 기록</label><div>${st.buys.map((b,j)=>`<div class="brow num"><span>${ddot(b.d)}</span><span>${won(b.q)}주 × ${won(b.u)}</span><b>${won(b.q*b.u)}</b><button data-delbuy="${j}">지우기</button></div>`).join('')}</div></div>`;
}
function showSheet(focusEl){$('#scrim').hidden=false;$('#sheet').hidden=false;setTimeout(()=>{focusEl.focus();if(focusEl.select)focusEl.select()},60)}
function openSheet(m,ref){
  mode=m; editRef=ref||null;
  ['#extra','#amtLbl','#chipField','#memoField','#dateField','#allowNote','#delBtn'].forEach(q=>$(q).hidden=true);
  $('#extra').innerHTML=''; $('.amt').hidden=false; $('#amtIn').value=''; $('#memoIn').value='';
  const last=daysIn(vm); $('#dateIn').min=`${vm}-01`; $('#dateIn').max=`${vm}-${last}`;
  $('#dateIn').value=isCur()?todayISO():`${vm}-01`;
  const simple=(title,btn,val,lbl)=>{$('#sheetTitle').textContent=title;$('#saveBtn').textContent=btn;$('#amtIn').value=val?won(val):'';
    if(lbl){$('#amtLbl').hidden=false;$('#amtLbl').textContent=lbl}showSheet($('#amtIn'))};
  if(m==='buy'||m==='stock'){
    const it=S.invest[valIdx]; $('#extra').hidden=false;
    if(m==='buy'){$('.amt').hidden=true;$('#sheetTitle').textContent=`${it.name} · 산 주식 적기`;$('#saveBtn').textContent='적기';$('#extra').innerHTML=extraBuy(it);return showSheet($('#bName'))}
    const st=it.stocks[stockRef];$('#extra').innerHTML=extraStock(st);
    return simple(st.name,'지금 가격 고치기',st.price,`1주 지금 가격 (${st.pdate||'아직 안 적음'} 기준)`);
  }
  if(m==='him')return simple('남편 남은 용돈','고치기',T().himLeft,'남편이 알려준 남은 금액');
  if(m==='val'){const it=S.invest[valIdx];return simple(`${it.name} 지금 금액`,'고치기',it.value??P().inv[valIdx].principal,'증권·은행 앱에서 본 지금 금액')}
  if(m==='ov'){
    const cm=S.months[CUR], cc=contrib(CUR);
    const title=ovKey==='save'?`${mNum(CUR)}월 저축 넣은 금액`:`${mNum(CUR)}월 ${invOf(ovKey).name} 넣은 금액`;
    const cur=ovKey==='save'?cc.saveAmt:(cm.ov.inv[ovKey]??(cm.plan.invest.find(x=>x.id===ovKey)||{amt:0}).amt);
    return simple(title,'고치기',cur,'실제로 넣은 금액이 계획과 달랐을 때만 고쳐 주세요');
  }
  // 지출·용돈 적기/고치기
  if(m==='me')pick='me';
  if(m==='spend'&&!ref&&(pick==='me'||!M().plan.cats.some(c=>c.id===pick)))pick=M().plan.cats[0]?.id||'me';
  if(ref){
    pick=ref.kind==='me'?'me':ref.obj.c;
    $('#amtIn').value=won(ref.obj.a); $('#memoIn').value=ref.obj.m||'';
    $('#dateIn').value=`${vm}-${pad(ref.obj.d)}`;
  }
  $('#sheetTitle').textContent=ref?'고치기':m==='me'?'내 용돈 쓴 금액':'지출 적기';
  $('#saveBtn').textContent=ref?'고치기':'적기';
  $('#delBtn').hidden=!ref; $('#chipField').hidden=false; $('#dateField').hidden=false;
  chips(); showSheet($('#amtIn'));
}
function closeSheet(){$('#scrim').hidden=true;$('#sheet').hidden=true}
function removeRef(r){const arr=r.kind==='me'?M().me:M().exp;const i=arr.indexOf(r.obj);if(i>=0)arr.splice(i,1)}
function addEntry(cat,d,a,m){if(cat==='me')M().me.push({d,a});else M().exp.push({d,c:cat,a,m})}
function saveSheet(){
  const a=digits($('#amtIn').value);
  if(mode==='buy'){
    const it=S.invest[valIdx], name=$('#bName').value.trim(), q=digits($('#bQty').value), u=digits($('#bUnit').value);
    if(!name)return toast('종목 이름을 적어 주세요'); if(!q||!u)return toast('몇 주, 1주 가격을 적어 주세요');
    let st=it.stocks.find(x=>x.name===name);
    if(!st){st={name,price:u,pdate:todayLabel(),buys:[]};it.stocks.push(st)}
    st.buys.push({d:$('#bDate').value||todayISO(),q,u});
    st.buys.sort((x,y)=>x.d<y.d?-1:1);
    closeSheet();render();return toast(`${name} ${won(q)}주 적었어요`);
  }
  if(mode==='stock'){const st=S.invest[valIdx].stocks[stockRef];if(!a)return toast('가격을 적어 주세요');st.price=a;st.pdate=todayLabel();closeSheet();render();return toast('지금 가격을 고쳤어요')}
  if(mode==='val'){const it=S.invest[valIdx];it.value=a;it.vdate=todayLabel();closeSheet();render();return toast('지금 금액을 고쳤어요')}
  if(mode==='him'){M().him={left:a,upd:isCur()?todayLabel():`${mNum(vm)}월`};closeSheet();render();return toast('남편 용돈을 고쳤어요')}
  if(mode==='ov'){
    const cm=S.months[CUR];
    if(ovKey==='save'){const auto=Math.max(0,T(cm,CUR).save);if(a===auto)delete cm.ov.save;else cm.ov.save=a}
    else{const pa=(cm.plan.invest.find(x=>x.id===ovKey)||{amt:0}).amt;if(a===pa)delete cm.ov.inv[ovKey];else cm.ov.inv[ovKey]=a}
    closeSheet();render();return toast('넣은 금액을 고쳤어요');
  }
  if(!a)return toast('금액을 적어 주세요');
  if(!pick)return toast('어디서 나간 돈인지 골라 주세요');
  const d=parseInt(($('#dateIn').value||'').slice(8),10)||(isCur()?TODAY:1);
  const wasEdit=!!editRef;
  if(editRef)removeRef(editRef);
  addEntry(pick,Math.min(d,daysIn(vm)),a,$('#memoIn').value.trim());
  closeSheet();render();
  toast(wasEdit?'고쳤어요':pick==='me'?'내 용돈에서 뺐어요':`${catName(pick)}에 적었어요`);
}

/* ── 월 계획 고치기 ── */
function planRow(k,i){return M().plan[k][i]}
function syncTpl(k,id,f,v){if(!isCur())return;const r=S.plan[k].find(x=>x.id===id);if(r)r[f]=v}
function addRow(k){
  const m=M();
  if(k==='invest'){
    const id=uid();S.invest.push({id,name:'',start:0,kind:'simple',stocks:[],value:null,vdate:''});
    const row={id,amt:0,day:26};m.plan.invest.push(row);if(isCur())S.plan.invest.push(clone(row));
  } else {
    const row=k==='cats'?{id:uid(),name:'',budget:0}:{id:uid(),name:'',amt:0,day:1};
    m.plan[k].push(row);if(isCur())S.plan[k].push(clone(row));
  }
  render();const ins=document.querySelectorAll(`[data-k="${k}"][data-f="name"]`);ins[ins.length-1]?.focus();
}
function delRow(key){
  const [k,id]=key.split(':'), m=M();
  if(k==='cats'){
    const n=m.exp.filter(e=>e.c===id).length;
    if(n&&pendingDel!==key){pendingDel=key;return render()}
    if(n){
      if(id==='etc')return toast('기타에 지출이 있어서 뺄 수 없어요');
      if(!m.plan.cats.some(c=>c.id==='etc')){m.plan.cats.push({id:'etc',name:'기타',budget:0});if(isCur()&&!S.plan.cats.some(c=>c.id==='etc'))S.plan.cats.push({id:'etc',name:'기타',budget:0})}
      m.exp.forEach(e=>{if(e.c===id)e.c='etc'});
    }
  }
  m.plan[k]=m.plan[k].filter(x=>x.id!==id);
  if(isCur())S.plan[k]=S.plan[k].filter(x=>x.id!==id);
  if(k==='fixed')delete m.paid[id];
  if(k==='invest'){
    const it=S.invest.find(x=>x.id===id), used=Object.values(S.months).some(mm=>mm.plan.invest.some(x=>x.id===id))||S.plan.invest.some(x=>x.id===id);
    if(it&&!used&&!it.start&&!(it.stocks||[]).length)S.invest=S.invest.filter(x=>x.id!==id);
  }
  pendingDel=null;render();toast('뺐어요');
}

/* ── 백업 ── */
async function exportBackup(){
  const data=JSON.stringify({app:'donjusem',v:1,savedAt:new Date().toISOString(),state:S});
  const name=`donjusem-backup-${todayISO()}.json`;
  const file=new File([data],name,{type:'application/json'});
  const done=()=>{S.lastBackup=Date.now();render();toast('백업 파일을 만들었어요. 「파일에 저장」으로 보관해 주세요')};
  try{if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:'돈주셈 백업'});return done()}}
  catch(e){if(e&&e.name==='AbortError')return}
  const a=document.createElement('a');a.href=URL.createObjectURL(file);a.download=name;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);done();
}
function readImport(file){
  const r=new FileReader();
  r.onload=()=>{
    try{const o=JSON.parse(r.result);
      if(!o||o.app!=='donjusem'||!o.state||!o.state.months)return toast('돈주셈 백업 파일이 아니에요');
      pendingImport={state:o.state,when:o.savedAt?new Date(o.savedAt).toLocaleString('ko-KR'):'날짜 모름'};tab='plan';render();
      setTimeout(()=>document.querySelector('[data-importgo]')?.scrollIntoView({block:'center'}),50);
    }catch(e){toast('파일을 읽지 못했어요')}
  };
  r.readAsText(file);
}
async function applyImport(){
  try{await idbSet('beforeImport',S)}catch(e){}
  S=fixState(pendingImport.state);pendingImport=null;ensureMonths();vm=CUR;render();await flush();toast('백업으로 되살렸어요');
}

/* ── 이벤트 ── */
document.addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b)return;
  const d=b.dataset;
  if(d.hide!=null){hideAmt=!hideAmt;return render()}
  if(d.inc!=null){incView=d.inc;return render()}
  if(d.tab)return go(d.tab);
  if(d.open)return openSheet(d.open);
  if(d.c){pick=d.c;return chips()}
  if(d.e!=null)return openSheet('spend',{kind:'exp',obj:M().exp[+d.e]});
  if(d.m!=null)return openSheet('me',{kind:'me',obj:M().me[+d.m]});
  if(d.del)return delRow(d.del);
  if(d.add)return addRow(d.add);
  if(d.paid){M().paid[d.paid]=true;render();return toast('나간 걸로 체크했어요')}
  if(d.unpaid){delete M().paid[d.unpaid];return render()}
  if(d.showpaid!=null){showPaid=!showPaid;return render()}
  if(d.val!=null){valIdx=+d.val;return openSheet('val')}
  if(d.buy!=null){valIdx=+d.buy;return openSheet('buy')}
  if(d.ov){ovKey=d.ov;return openSheet('ov')}
  if(d.stock){const [i,k]=d.stock.split(':');valIdx=+i;stockRef=+k;return openSheet('stock')}
  if(d.tostock!=null){const it=S.invest[+d.tostock];it.kind='stock';it.stocks=it.stocks||[];render();return toast('주식 계좌로 바꿨어요')}
  if(d.sname!=null){$('#bName').value=d.sname;return $('#bQty').focus()}
  if(d.delbuy!=null){
    const it=S.invest[valIdx], st=it.stocks[stockRef]; st.buys.splice(+d.delbuy,1);
    if(!st.buys.length){it.stocks.splice(stockRef,1);closeSheet();render();return toast(`${st.name} 기록을 다 지웠어요`)}
    $('#extra').innerHTML=extraStock(st);render();return toast('산 기록을 지웠어요');
  }
  if(d.closeinstall!=null){installClosed=true;return render()}
  if(d.setupdone!=null){S.setupDone=true;go('home');return toast('준비 끝! 이제 지출을 적어 보세요')}
  if(d.backup!=null)return exportBackup();
  if(d.import!=null)return $('#importFile').click();
  if(d.importgo!=null)return applyImport();
  if(d.importcancel!=null){pendingImport=null;return render()}
  if(b.id==='sheetClose')return closeSheet();
  if(b.id==='saveBtn')return saveSheet();
  if(b.id==='delBtn'){removeRef(editRef);closeSheet();render();return toast('지웠어요')}
  if(b.id==='prevM')return moveMonth(-1);
  if(b.id==='nextM')return moveMonth(1);
});
document.addEventListener('submit',e=>{
  if(e.target.id!=='qa')return; e.preventDefault();
  const a=digits($('#qaA').value); if(!a){$('#qaA').focus();return toast('금액을 적어 주세요')}
  qaCat=$('#qaC').value;
  addEntry(qaCat,parseInt($('#qaD').value.slice(8),10)||(isCur()?TODAY:1),a,$('#qaM').value.trim());
  const dv=$('#qaD').value; render(); $('#qaD').value=dv; $('#qaA').focus();
  toast(qaCat==='me'?'내 용돈에서 뺐어요':`${catName(qaCat)}에 적었어요`);
});
document.addEventListener('input',e=>{
  const el=e.target;
  if(['amtIn','qaA','bQty','bUnit'].includes(el.id)){const v=digits(el.value);el.value=v?won(v):'';
    if(el.id==='bQty'||el.id==='bUnit')$('#bSum').textContent=`합계 ${won(digits($('#bQty').value)*digits($('#bUnit').value))}원`;return}
  const k=el.dataset.k; if(!k)return;
  const f=el.dataset.f, m=M();
  if(k==='me'||k==='him'){m.plan[k]=digits(el.value);if(isCur())S.plan[k]=m.plan[k]}
  else if(k==='saveStart')S.saveStart=digits(el.value);
  else if(k==='istart'){const it=S.invest.find(x=>x.id===el.dataset.id);if(it)it.start=digits(el.value)}
  else if(k==='saveDay'){const v=Math.min(31,digits(el.value));m.plan.saveDay=v||1;if(isCur())S.plan.saveDay=m.plan.saveDay;el.value=v||''}
  else{
    const row=planRow(k,+el.dataset.i); if(!row)return;
    if(k==='invest'&&f==='name'){const it=S.invest.find(x=>x.id===row.id);if(it)it.name=el.value}
    else{
      let v;
      if(f==='name')v=el.value;
      else if(f==='day'){const x=Math.min(31,digits(el.value));v=x||1;el.value=x||''}
      else v=digits(el.value);
      row[f]=v;syncTpl(k,row.id,f,v);
    }
  }
  updateSums();persist();
});
document.addEventListener('focusout',e=>{const el=e.target;if(el.dataset&&el.dataset.k&&el.classList.contains('ed-a'))el.value=won(digits(el.value))});
document.addEventListener('keydown',e=>{
  const open=!$('#sheet').hidden;
  if(e.key==='Escape'&&open)return closeSheet();
  if(open&&e.key==='Enter'&&e.target.tagName==='INPUT'){e.preventDefault();return saveSheet()}
  if(open||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||e.metaKey||e.ctrlKey||e.altKey)return;
  if(e.key==='n'||e.key==='N'||e.key==='ㅜ'){e.preventDefault();openSheet('spend')}
  else if(/^[1-5]$/.test(e.key))go(TABS[+e.key-1]);
  else if(e.key==='ArrowLeft')moveMonth(-1);
  else if(e.key==='ArrowRight')moveMonth(1);
});
$('#scrim').addEventListener('click',closeSheet);
$('#importFile').addEventListener('change',e=>{const f=e.target.files[0];e.target.value='';if(f)readImport(f)});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush()});
window.addEventListener('pagehide',flush);

/* ── 시작 ── */
(async function boot(){
  try{const saved=await idbGet('state');if(saved)S=fixState(saved)}
  catch(e){saveOk=false;setTimeout(()=>toast('이 브라우저에선 저장이 안 돼요. 사파리로 열어 주세요'),300)}
  ensureMonths();vm=CUR;render();
  try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}
  if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
