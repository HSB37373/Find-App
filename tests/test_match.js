// 사용: node tests/test_match.js  — index.html 의 AI-MATCH 구간(순수 계산 함수)만 꺼내 검증한다.
const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
const m=src.match(/\/\/ ==AI-MATCH-START==([\s\S]*?)\/\/ ==AI-MATCH-END==/);
assert(m,'AI-MATCH 구간을 찾지 못함');
const E=new Function(m[1]+';return {aimScore,aimRank,aimRankFull,aimWeights,AIM_W,AIM_W_IMG,setImg:v=>{AIM_IMG_READY=v;}};')();
const D=(n)=>{const x=new Date('2026-11-02T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
let pass=0;const t=(n,f)=>{try{f();pass++;console.log('ok  ',n);}catch(e){console.log('FAIL',n,'\n    ',e.message);process.exitCode=1;}};
const F=(o)=>Object.assign({type:'found',status:'active',author:'x',desc:'',coords:null,img:null,category:'전자기기'},o);
const SW={lat:37.2086,lng:126.9778,addr:'수원대학교 소프트웨어관'};
// 찾는 분실물: 베이지색 갤럭시 버즈, 분실일 11-02
const q={title:'갤럭시 버즈',category:'전자기기',desc:'베이지색',date:D(0),location:'',coords:null};
const same=F({id:1,title:'갤럭시 버즈 습득',desc:'의자 위에서 베이지색 갤럭시 버즈 충전 케이스와 이어버드를 주웠어요.',location:'소프트웨어관 1층 로비',date:D(1),coords:Object.assign({detail:'1층 로비'},SW)});
const blackCase=F({id:2,title:'검정 이어폰 케이스 습득',desc:'열람실 책상 위에서 흰색 스티커가 붙은 검정 에어팟 케이스를 주웠어요.',location:'중앙도서관 3층 열람실',date:D(2)});
const protect=F({id:3,title:'이어폰 보호 케이스 습득',desc:'베이지색 실리콘 보호 케이스만 발견했어요.',location:'소프트웨어관 1층',date:D(1)});
const sony=F({id:4,title:'소니 무선 이어폰 습득',desc:'베이지색 소니 무선 이어폰이에요.',location:'소프트웨어관 1층',date:D(1)});
const early=F({id:5,title:'갤럭시 버즈',desc:'의자 아래에서 갤럭시 이어버즈 베이지색 케이스를 발견했습니다.',location:'소프트웨어관 302호',date:D(-142),coords:Object.assign({detail:'302호'},SW)});
const blackBuds=F({id:6,title:'검정 갤럭시 버즈 습득',desc:'검정색 갤럭시 버즈를 주웠어요.',location:'소프트웨어관 1층',date:D(1)});
const umb=F({id:7,title:'파란색 우산 습득',category:'기타',desc:'파란색 장우산',location:'공학관 1층 로비',date:D(1)});
const wallet=F({id:8,title:'검정 카드지갑 습득',category:'가방/지갑',desc:'검정색 카드지갑',location:'학생식당 입구',date:D(1)});

t('가중치 합 = 1.0, 사진 미연결 시 사진 비중 0',()=>{
  assert(Math.abs(Object.values(E.AIM_W).reduce((a,b)=>a+b)-1)<1e-9);
  assert(!('img' in E.aimWeights()));});
t('사진 모델 연결 가정: 사진 비중 30% + 나머지 합 70% (합 100%)',()=>{
  E.setImg(true);const w=E.aimWeights();E.setImg(false);
  assert(Math.abs(w.img-.30)<1e-9);assert(Math.abs(Object.values(w).reduce((a,b)=>a+b)-1)<1e-9);});
t('① 베이지 갤럭시 버즈 vs 동일 모델·색상 습득물 → 추천, 높은 점수',()=>{
  const r=E.aimScore(q,same);assert(r.ok,JSON.stringify(r.gate));assert(r.total>=75,'점수 '+r.total);
  assert(r.why.some(x=>x.includes('갤럭시 버즈')));assert(r.why.some(x=>x.includes('베이지')));assert(r.conf.length===0);});
t('② 갤럭시 버즈 vs 검정 이어폰 케이스(에어팟) → 추천 안 함(브랜드·색상·구성 불일치)',()=>{
  const r=E.aimScore(q,blackCase);assert(!r.ok);assert(r.total<30,'점수 '+r.total);
  assert(r.conf.some(x=>x.includes('브랜드'))&&r.conf.some(x=>x.includes('색상')));});
t('②-b 갤럭시 버즈 vs 이어폰 보호 케이스 → 구성이 달라 제외',()=>{
  const r=E.aimScore(q,protect);assert(!r.ok);assert(r.gate&&r.gate.code==='form',JSON.stringify(r.gate));});
t('③ 갤럭시 버즈 vs 다른 브랜드(소니) 무선 이어폰 → 추천 안 함',()=>{
  const r=E.aimScore(q,sony);assert(!r.ok);assert(r.conf.some(x=>x.includes('브랜드가 달라요')),r.conf.join('|'));
  assert(r.total<E.aimScore(q,same).total-30);});
t('④ 학생증 vs 일반 카드지갑 → 추천 안 함',()=>{
  const lq={title:'학생증 분실 (홍길동)',category:'카드/신분증',desc:'',date:D(0),location:'학생식당 1층'};
  const r=E.aimScore(lq,wallet);assert(!r.ok);assert(r.warn.some(x=>x.includes('종류가 달라요')));});
t('④-b 지갑 설명에 학생증이 있으면 가능성 있는 후보로(같은 곳·다음 날)',()=>{
  const lq={title:'학생증 분실 (홍길동)',category:'카드/신분증',desc:'',date:D(0),location:'학생식당 1층'};
  const w2=F({id:9,title:'검정 지갑 습득',category:'가방/지갑',desc:'안에 학생증이 들어 있어요',location:'학생식당 입구',date:D(1)});
  const r=E.aimScore(lq,w2);assert(r.comp.ident>=.7,'ident '+r.comp.ident);assert(r.ok,'total '+r.total);});
t('⑤ 분실일보다 142일 먼저 습득 → 일반 추천 제외 + 제외 사유 표시',()=>{
  const r=E.aimScore(q,early);assert(!r.ok);assert(r.gate.code==='date'&&r.gate.msg.includes('142일'));
  const rf=E.aimRankFull(q,[early],'me');assert.strictEqual(rf.top.length,0);assert.strictEqual(rf.excluded.length,1);
  assert(rf.excluded[0].r.exclMsg.includes('142일'));});
t('⑥ 분실 다음 날 같은 건물에서 습득 → 추천 + 이유에 날짜·장소',()=>{
  const lq=Object.assign({},q,{location:'소프트웨어관 1층',coords:Object.assign({detail:'1층'},SW)});
  const r=E.aimScore(lq,same);assert(r.ok);assert(r.why.some(x=>x.includes('1일 뒤')));assert(r.why.some(x=>x.includes('지도 핀')||x.includes('같은 장소')));});
t('⑦ 사진이 없는 게시물 → 오류 없이 계산, 사진 점수는 null(계산한 척 안 함)',()=>{
  const r=E.aimScore(q,Object.assign({},same,{img:null}));assert.strictEqual(r.comp.img,null);assert(r.ok);
  const r2=E.aimScore(Object.assign({},q,{img:'data:image/png;base64,AAAA'}),Object.assign({},same,{img:'images/x.jpg'}));
  assert.strictEqual(r2.comp.img,null,'사진이 있어도 모델이 없으면 사진 점수 없음');assert.strictEqual(r2.total,r.total);});
t('⑧ 장소가 없는 게시물 → 0점이 아니라 정보 없음(null) + 확인 안내',()=>{
  const r=E.aimScore(q,Object.assign({},same,{location:'',coords:null}));
  assert.strictEqual(r.comp.loc,null);assert(r.warn.some(x=>x.includes('장소 정보')));assert(r.ok);
  const bad=E.aimScore(Object.assign({},q,{location:'정문 앞'}),Object.assign({},same,{location:'기숙사 앞',coords:null}));
  assert(bad.comp.loc<.2,'장소가 명확히 다르면 낮음');});
t('⑨ 일치할 만한 물건이 하나도 없으면 빈 결과(억지로 채우지 않음)',()=>{
  const rf=E.aimRankFull(q,[umb,wallet,blackCase,protect,sony],'me');assert.strictEqual(rf.top.length,0);});
t('⑩ 동일 모델·다른 색상(검정 vs 베이지) → 추천 안 함, 사유=색상',()=>{
  const r=E.aimScore(q,blackBuds);assert(!r.ok);assert(r.conf.some(x=>x.includes('색상이 달라요')));
  const rf=E.aimRankFull(q,[blackBuds],'me');assert.strictEqual(rf.excluded.length,1);assert(rf.excluded[0].r.exclMsg.includes('색상'));});
t('같은 모델 > 다른 색 > 다른 브랜드 순서가 점수에 반영',()=>{
  const a=E.aimScore(q,same).total,b=E.aimScore(q,blackBuds).total,c=E.aimScore(q,sony).total;
  assert(a>b&&b>=0&&a>c,[a,b,c].join(','));});
t('정보가 적은 후보는 만점에 가까워질 수 없음(재정규화 폐지)',()=>{
  const bare=E.aimScore({title:'갤럭시 버즈'},F({title:'갤럭시 버즈 습득'}));
  assert(bare.total<75,'점수 '+bare.total);assert(bare.warn.length>=3);});
t('날짜 누락·입력 오류는 별도 안내(감점·제외 아님)',()=>{
  const r1=E.aimScore(Object.assign({},q,{date:''}),same);assert.strictEqual(r1.comp.date,null);assert(r1.warn.some(x=>x.includes('날짜 정보가 없어')));assert(!r1.gate);
  const r2=E.aimScore(Object.assign({},q,{date:'2026-13-45'}),same);assert(r2.warn.some(x=>x.includes('올바르지 않아')));assert(!r2.gate);});
t('습득일이 분실일보다 2~7일 앞서면 제외하지 않고 날짜 확인 안내',()=>{
  const r=E.aimScore(q,Object.assign({},same,{date:D(-3)}));assert(!r.gate);assert(r.warn.some(x=>x.includes('3일 앞서요')));
  const r8=E.aimScore(q,Object.assign({},same,{date:D(-8)}));assert(r8.gate&&r8.gate.code==='date');});
t('종류를 알 수 없는 글은 확인 필요 표시(점수만으로 상위 추천 안 함)',()=>{
  const r=E.aimScore({title:'이상한 물건',category:'기타',date:D(0),location:'본관'},F({title:'특이한 물건',category:'기타',date:D(1),location:'본관 1층'}));
  assert(r.uncertain);assert(r.warn.some(x=>x.includes('추가 확인')));assert(!r.ok);});
t('해결 완료·분실물·본인 글은 후보에서 제외',()=>{
  const posts=[same,F({id:10,title:'갤럭시 버즈',desc:'베이지',date:D(1),status:'resolved'}),
    F({id:11,title:'갤럭시 버즈',desc:'베이지',date:D(1),type:'lost'}),F({id:12,title:'갤럭시 버즈',desc:'베이지',date:D(1),author:'me'})];
  const r=E.aimRank(q,posts,'me');assert.deepStrictEqual(r.map(x=>x.post.id),[1]);});
t('TOP3 상한 + 점수 내림차순 + 억지 채우기 없음',()=>{
  const mk=(id,off,loc)=>F({id,title:'갤럭시 버즈 습득',desc:'베이지색 갤럭시 버즈',location:loc,date:D(off)});
  const posts=[mk(21,1,'소프트웨어관'),mk(22,2,'소프트웨어관'),mk(23,3,'소프트웨어관'),mk(24,5,'소프트웨어관'),mk(25,1,'소프트웨어관')];
  const r=E.aimRank(Object.assign({},q,{location:'소프트웨어관'}),posts,'me');assert.strictEqual(r.length,3);
  for(let i=1;i<r.length;i++)assert(r[i-1].r.raw>=r[i].r.raw);
  assert.strictEqual(E.aimRank(q,[mk(26,1,'x')].slice(0,1),'me').length<=1,true);});
t('동일 점수 과다 반복 방지: 거리·날짜가 다르면 점수도 달라짐',()=>{
  const lq=Object.assign({},q,{coords:SW,location:'소프트웨어관'});
  const near=E.aimScore(lq,F(Object.assign({},same,{coords:{lat:37.2087,lng:126.9779,addr:'a'}}))).raw;
  const mid=E.aimScore(lq,F(Object.assign({},same,{coords:{lat:37.2100,lng:126.9790,addr:'a'}}))).raw;
  const far=E.aimScore(lq,F(Object.assign({},same,{coords:{lat:37.2140,lng:126.9850,addr:'a'}}))).raw;
  assert(near>mid&&mid>far,[near,mid,far].join(','));});
t('결과 문구: 확률 표현 없음',()=>{
  const r=E.aimScore(q,same);assert(![...r.why,...r.warn].join(' ').includes('확률'));});
console.log(`\n${pass} passed`);
