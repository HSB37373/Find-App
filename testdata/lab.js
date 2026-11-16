// AI 매칭 테스트 랩 — ?demo=1&testset=1 에서만 index.html 이 불러온다. (실서비스·Supabase 모드에서는 로드되지 않음)
// 1) 테스트 게시물 50개를 "실제 등록 화면의 입력·검증·저장 함수"로 등록한다 (openReg → setType → handlePhoto → 입력칸 → submitPost).
//    저장소는 데모 모드의 메모리 DB 뿐이라 실제 DB·실사용자 데이터와 섞이지 않는다. 새로고침하면 사라진다.
// 2) 테스트 전용 화면에서 정답표(ground_truth.json)와 현재 매칭 알고리즘 결과를 비교한다. 정답표는 이 화면을 열 때만 읽는다.
(function(){
  if(typeof DEMO==='undefined'||!DEMO||typeof TESTSET==='undefined'||!TESTSET)return;
  var B='testdata/';
  var R={recs:null,truth:null,srcs:null,keyOf:{},idOf:{},res:null,tab:'sum',type:'',cat:'',failed:[],done:false,log:[]};
  var $=function(id){return document.getElementById(id);};
  var wait=function(ms){return new Promise(function(r){setTimeout(r,ms);});};
  function getJSON(f){return fetch(B+f).then(function(r){if(!r.ok)throw new Error(f+' '+r.status);return r.json();});}
  function until(fn,ms){var t0=Date.now();return new Promise(function(res){(function chk(){if(fn()||Date.now()-t0>ms)res(!!fn());else setTimeout(chk,25);})();});}

  // ── 진행 표시줄 ──
  function banner(msg,bad){
    var b=$('lab-banner');
    if(!b){b=document.createElement('div');b.id='lab-banner';
      b.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:76px;max-width:410px;width:calc(100% - 20px);z-index:1090;background:#3d2b1f;color:#fff;border-radius:12px;padding:9px 14px;font-size:12px;line-height:1.5;box-shadow:0 4px 14px rgba(0,0,0,.25)';
      document.body.appendChild(b);}
    b.style.background=bad?'#a03030':'#3d2b1f';b.textContent=msg;b.style.display=msg?'block':'none';
  }

  // ── 실제 등록 화면을 그대로 조작해 한 건 등록 ──
  async function attachPhoto(path){
    var resp=await fetch(path);if(!resp.ok)throw new Error('사진을 열 수 없음: '+path+' ('+resp.status+')');
    var blob=await resp.blob();
    var file=new File([blob],path.split('/').pop(),{type:blob.type||'image/jpeg'});
    handlePhoto({files:[file]}); // 파일 선택과 같은 경로: shrinkPhoto(캔버스 축소) → 미리보기 → analyzePhoto
    var ok=await until(function(){return !!ST.photoUrl;},8000);
    if(!ok)throw new Error('사진 처리 시간 초과: '+path);
  }
  async function registerOne(rec){
    var before=ST.posts.length,realMe=ST.me;
    ST.me=rec.author; // 가상 사용자 명의 (실제 계정 아님)
    try{
      openReg();                     // 등록 화면 열기 (입력칸 초기화)
      setType(rec.type);             // 분실 / 습득 선택
      if(rec.img)await attachPhoto(rec.img);
      $('fn').value=rec.title;       // 물품명(=게시물 제목)
      $('fcat').value=rec.category;
      $('fdate').value=rec.date;
      $('fdesc').value=rec.desc;
      $('fnc').textContent=rec.title.length;$('fdc').textContent=rec.desc.length;
      if(rec.place){                 // 지도 핀 + 상세 위치 (placeRegMarker 가 만드는 상태와 동일)
        ST.mapCoords={lat:rec.place.lat,lng:rec.place.lng,addr:rec.place.addr};
        $('map-detail').value=rec.place.detail||'';
        $('fmap').checked=true;
      }
      await submitPost();            // 실제 유효성 검사·저장 (데모 DB insert)
      var toastMsg=($('toast')||{}).textContent||'';
      if(ST.posts.length!==before+1)throw new Error('등록 실패: '+toastMsg);
      var post=ST.posts[0];
      R.keyOf[post.id]=rec.key;R.idOf[rec.key]=post.id;
      return post;
    }finally{ST.me=realMe;}
  }
  async function registerAll(){
    R.recs=await getJSON('posts.json');
    // 일반 데모(?demo=1)가 이미 같은 50개를 넣어 두었으면(tkey) 다시 등록하지 않고 그대로 사용 — 중복 방지
    var pre=ST.posts.filter(function(p){return p.tkey;});
    if(pre.length>=R.recs.length){
      pre.forEach(function(p){R.keyOf[p.id]=p.tkey;R.idOf[p.tkey]=p.id;});
      render();R.done=true;banner('');return;
    }
    // 실제로 올라오는 순서처럼 사건 날짜 순서대로 등록
    var order=R.recs.slice().sort(function(a,b){return a.date<b.date?-1:a.date>b.date?1:a.key<b.key?-1:1;});
    var n=0;
    for(var i=0;i<order.length;i++){
      banner('🧪 테스트 게시물 등록 중… '+(i+1)+'/'+order.length+' (실제 등록 화면 사용)');
      try{await registerOne(order[i]);n++;}
      catch(e){R.failed.push(order[i].key+': '+e.message);console.error(order[i].key,e);}
    }
    closeReg();render();
    R.done=true;
    banner(R.failed.length?'⚠️ 테스트 게시물 '+n+'/'+order.length+'개 등록 (실패 '+R.failed.length+'건 — 🧪 메뉴에서 확인)':'🧪 테스트 게시물 '+n+'개 등록 완료 (가상 사용자 · 메모리 DB)',!!R.failed.length);
    setTimeout(function(){if(!R.failed.length)banner('');},4000);
  }
  // 초기화: 데모 메모리 DB 의 테스트 게시물(가상 사용자 작성분)만 지우고 다시 등록. 실제 DB(Supabase)는 이 코드가 아예 로드되지 않는다.
  async function resetTest(){
    if(!DEMO)return;
    var nicks={};R.recs.forEach(function(r){nicks[r.author]=1;});
    var list=Object.keys(nicks);
    await sb.from('posts').delete().in('author',list);
    ST.posts=ST.posts.filter(function(p){return !nicks[p.author];});
    R.keyOf={};R.idOf={};R.failed=[];R.res=null;
    render();await registerAll();R.res=null;renderLab();
  }

  // ── 평가 ──
  function testPosts(){
    return ST.posts.filter(function(p){return R.keyOf[p.id];}).map(function(p){return Object.assign({},p,{key:R.keyOf[p.id]});});
  }
  async function ensureTruth(){
    if(!R.truth)R.truth=await getJSON('ground_truth.json');
    if(!R.srcs)R.srcs=await getJSON('image_sources.json');
    if(!window.MatchEval){await new Promise(function(ok,no){var s=document.createElement('script');s.src=B+'match_eval.js';s.onload=ok;s.onerror=no;document.head.appendChild(s);});}
  }
  function runEval(){
    var posts=testPosts();
    R.res=MatchEval.evaluate({aimRankFull:aimRankFull,aimScore:aimScore},posts,R.truth);
    R.val=MatchEval.validate(posts,R.truth);
    R.posts=posts;
  }

  // ── 화면 ──
  var CSS='body.lab-open .fab-wrap{display:none!important}.lab-scr{position:fixed;inset:0;max-width:430px;margin:0 auto;background:var(--gbg);display:none;flex-direction:column;z-index:1100}.lab-scr.on{display:flex}'
   +'.lab-tabs{display:flex;gap:4px;padding:8px 10px;background:#fff;border-bottom:1px solid var(--gline);overflow-x:auto;flex-shrink:0}'
   +'.lab-tabs button{border:1px solid var(--gline);background:#fff;border-radius:16px;padding:6px 11px;font-size:12px;font-weight:700;white-space:nowrap;font-family:inherit;color:var(--sub);cursor:pointer}'
   +'.lab-tabs button.on{background:var(--navy);color:#fff;border-color:var(--navy)}'
   +'.lab-body{flex:1;overflow-y:auto;padding:12px 12px 30px}'
   +'.lab-card{background:#fff;border:1px solid var(--gline);border-radius:12px;padding:10px 12px;margin-bottom:9px;font-size:12px;line-height:1.55}'
   +'.lab-kpi{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}.lab-kpi div{background:#fff;border:1px solid var(--gline);border-radius:12px;padding:9px 10px}'
   +'.lab-kpi b{display:block;font-size:20px;color:var(--navy)}.lab-kpi span{font-size:11px;color:var(--sub)}'
   +'.lab-kpi .bad b{color:#c0392b}.lab-kpi .good b{color:#1c7f4a}'
   +'.lab-t{width:100%;border-collapse:collapse;font-size:11px}.lab-t th,.lab-t td{border-bottom:1px solid var(--gline);padding:5px 4px;text-align:left;vertical-align:top}.lab-t th{color:var(--sub)}'
   +'.lab-chip{display:inline-block;border-radius:5px;padding:1px 6px;font-size:10px;font-weight:800;margin-right:3px}'
   +'.lab-A{background:#dff5e6;color:#1c7f4a}.lab-B{background:#fff0d6;color:#a86300}.lab-C{background:#ececec;color:#555}'
   +'.lab-ok{background:#dff5e6;color:#1c7f4a}.lab-warn{background:#fff0d6;color:#a86300}.lab-bad{background:#fde3e0;color:#c0392b}.lab-gray{background:#ececec;color:#555}'
   +'.lab-row{display:flex;gap:8px;align-items:flex-start}.lab-th{width:46px;height:46px;border-radius:8px;object-fit:cover;background:#eee;flex-shrink:0}'
   +'.lab-btn{border:1px solid var(--gline);background:#fff;border-radius:9px;padding:6px 10px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer}'
   +'.lab-sel{border:1px solid var(--gline);border-radius:8px;padding:5px;font-size:12px;font-family:inherit;background:#fff}'
   +'.lab-top{margin:4px 0 0 0;padding-left:0;list-style:none}.lab-top li{padding:3px 0;border-top:1px dashed var(--gline)}'
   +'.lab-test-badge{display:inline-block;background:#efe9ff;color:#5b4fcf;border-radius:5px;padding:1px 6px;font-size:10px;font-weight:800}';
  function mount(){
    var st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
    var d=document.createElement('div');d.className='lab-scr';d.id='lab-scr';
    d.innerHTML='<div class="chat-hd"><button class="chat-back" onclick="closeLab()">←</button><div style="flex:1"><div class="chat-nm">🧪 AI 매칭 검증 (테스트 전용)</div></div></div>'
      +'<div class="lab-tabs" id="lab-tabs"></div><div class="lab-body" id="lab-body"></div>';
    document.body.appendChild(d);
    var m=$('menu-lab');if(m)m.style.display='';
  }
  var TABS=[['sum','요약'],['posts','게시물 50'],['res','매칭 결과'],['bad','오추천·놓침'],['probe','민감도'],['src','사진 출처']];
  window.openLab=async function(){
    $('lab-scr').classList.add('on');document.body.classList.add('lab-open');$('lab-body').innerHTML='<div class="lab-card">불러오는 중…</div>';
    try{await ensureTruth();if(!R.done)await until(function(){return R.done;},120000);runEval();}
    catch(e){$('lab-body').innerHTML='<div class="lab-card">불러오지 못했어요: '+esc(e.message)+'</div>';return;}
    renderLab();
  };
  window.closeLab=function(){$('lab-scr').classList.remove('on');document.body.classList.remove('lab-open');};
  window.labTab=function(t){R.tab=t;renderLab();};
  window.labSet=function(k,v){R[k]=v;renderLab();};
  window.labReset=async function(){
    $('lab-body').innerHTML='<div class="lab-card">테스트 게시물을 지우고 다시 등록하는 중… (데모 메모리 DB 의 가상 사용자 게시물만 대상)</div>';
    await resetTest();runEval();renderLab();
  };
  window.labOpenAi=function(key){
    var p=R.posts.find(function(x){return x.key===key;});if(!p)return;
    openAi({title:p.title,category:p.category,desc:p.desc||'',date:p.date,coords:p.coords||null,location:p.location||'',img:p.img||null});
  };
  window.labOpenPost=function(key){openDet(R.idOf[key]);};

  var pct=function(x){return x==null?'-':Math.round(x*1000)/10+'%';};
  var GL={A:'정답 있음',B:'비슷하지만 다름',C:'대응 없음'};
  var STATUS={top1:['lab-ok','✅ 정답 1위'],top1_extra:['lab-warn','🟡 정답 1위 (+오추천 있음)'],top3:['lab-warn','🟠 정답 2~3위'],miss:['lab-bad','❌ 정답을 추천 못함'],
              false_rec:['lab-bad','🚫 억지 추천(정답 없음)'],none_ok:['lab-ok','✅ 추천 없음(정답 없음)']};
  function chipG(g){return '<span class="lab-chip lab-'+g+'">'+g+' '+GL[g]+'</span>';}
  function thumb(p){return p&&p.img?'<img class="lab-th" src="'+esc(p.img)+'" alt="">':'<div class="lab-th"></div>';}
  function pOf(key){return R.posts.find(function(x){return x.key===key;});}
  function chips(c){
    var L={ident:'종류·모델',color:'색상',loc:'장소',date:'날짜',text:'설명',cat:'카테고리'};
    return Object.keys(L).map(function(k){return c[k]==null?'<span class="lab-chip lab-gray">'+L[k]+' 없음</span>':'<span class="lab-chip lab-gray">'+L[k]+' '+Math.round(c[k]*100)+'</span>';}).join('')
      +'<span class="lab-chip lab-gray">사진 미분석</span>';
  }

  function renderLab(){
    if(!R.res)return;
    $('lab-tabs').innerHTML=TABS.map(function(t){return '<button class="'+(R.tab===t[0]?'on':'')+'" onclick="labTab(\''+t[0]+'\')">'+t[1]+'</button>';}).join('');
    var h='',M=R.res.metrics;
    if(R.tab==='sum'){
      h+='<div class="lab-card">⚠️ <b>테스트 전용 화면</b> — 정답표를 볼 수 있는 곳이에요. 일반 화면에는 정답 정보가 나오지 않아요. 게시물은 모두 <b>가상 사용자(테스트계정_*)</b>가 만든 것이고 메모리 DB 에만 있어요. 사진은 <b>분석 모델 미연결(사진 미분석)</b> 상태라 사진 점수는 쓰지 않았어요.</div>';
      h+='<div class="lab-kpi">'
        +'<div class="good"><b>'+pct(M.precisionAt1)+'</b><span>Precision@1 ('+M.top1Hits+'/'+M.withTruth+') — 정답 있는 분실물 중 1위가 정답</span></div>'
        +'<div class="good"><b>'+pct(M.recallAt3)+'</b><span>Recall@3 ('+M.top3Hits+'/'+M.withTruth+') — 정답이 상위 3건 안</span></div>'
        +'<div class="bad"><b>'+M.wrongItems+'건</b><span>잘못된 추천 (정답이 아닌데 추천된 카드, '+M.wrongQueries+'개 글에서)</span></div>'
        +'<div class="bad"><b>'+M.missed+'건</b><span>정답이 있는데 추천 못한 분실물</span></div>'
        +'<div class="bad"><b>'+M.falseNoTarget+'건</b><span>정답 없는 분실물('+M.noTruth+'개) 중 억지 추천이 나온 글 (카드 '+M.falseNoTargetItems+'개)</span></div>'
        +'<div><b>'+R.posts.length+'개</b><span>등록된 테스트 게시물 (분실 '+R.posts.filter(function(p){return p.type==='lost';}).length+' · 습득 '+R.posts.filter(function(p){return p.type==='found';}).length+')</span></div></div>';
      h+='<div class="lab-card"><table class="lab-t"><tr><th>그룹</th><th>분실물</th><th>1위 정답</th><th>3위 안</th><th>추천 있음</th><th>잘못된 카드</th></tr>'
        +['A','B','C'].map(function(g){var x=M.groups[g];return '<tr><td>'+chipG(g)+'</td><td>'+x.n+'</td><td>'+(g==='A'?x.top1:'-')+'</td><td>'+(g==='A'?x.in3:'-')+'</td><td>'+x.withRec+'</td><td>'+x.wrongItems+'</td></tr>';}).join('')+'</table></div>';
      h+='<div class="lab-card"><b>데이터 점검</b><br>'+R.val.map(function(v){return (v.ok?'✅ ':'❌ ')+esc(v.msg);}).join('<br>')
        +'<br>'+(R.failed.length?'❌ 등록 실패: '+esc(R.failed.join(' / ')):'✅ 실제 등록 화면(submitPost)으로 50건 모두 저장됨')+'</div>';
      h+='<div class="lab-card"><button class="lab-btn" onclick="labReset()">🔄 테스트 데이터 초기화·재등록</button>'
        +'<div style="color:var(--sub);margin-top:6px">데모 메모리 DB 의 가상 사용자 게시물만 지우고 다시 등록해요. 실제 서비스 DB 는 건드리지 않아요. 새로고침하면 전부 처음 상태가 돼요.</div></div>';
    }
    if(R.tab==='posts'){
      var cats=Object.keys(CE);
      h+='<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap"><select class="lab-sel" onchange="labSet(\'type\',this.value)"><option value="">분실+습득</option><option value="lost"'+(R.type==='lost'?' selected':'')+'>분실물</option><option value="found"'+(R.type==='found'?' selected':'')+'>습득물</option></select>'
        +'<select class="lab-sel" onchange="labSet(\'cat\',this.value)"><option value="">전체 카테고리</option>'+cats.map(function(c){return '<option'+(R.cat===c?' selected':'')+'>'+c+'</option>';}).join('')+'</select></div>';
      var ps=R.posts.filter(function(p){return (!R.type||p.type===R.type)&&(!R.cat||p.category===R.cat);}).sort(function(a,b){return a.key<b.key?-1:1;});
      h+='<div style="font-size:11px;color:var(--sub);margin-bottom:6px">'+ps.length+'개</div>';
      ps.forEach(function(p){
        var t=R.truth.lost[p.key]||R.truth.found[p.key]||{};
        h+='<div class="lab-card" onclick="labOpenPost(\''+p.key+'\')" style="cursor:pointer"><div class="lab-row">'+thumb(p)+'<div style="min-width:0;flex:1">'
          +'<span class="lab-chip '+(p.type==='lost'?'lab-warn':'lab-ok')+'">'+(p.type==='lost'?'분실':'습득')+'</span>'+chipG(t.group||'C')+'<span class="lab-chip lab-gray">'+p.key+'</span><br>'
          +'<b>'+esc(p.title)+'</b><br><span style="color:var(--sub)">'+esc(p.category)+' · '+esc(p.date)+' · '+esc(p.location)+' · @'+esc(p.author)+'</span>'
          +(t.partner?'<br><span style="color:#1c7f4a">정답 짝: '+esc(t.partner)+'</span>':'')+(t.decoy?'<br><span style="color:#a86300">비슷하지만 다른 물건: '+esc(t.decoy)+'</span>':'')+'</div></div></div>';
      });
    }
    if(R.tab==='res'){
      h+='<div style="font-size:11px;color:var(--sub);margin-bottom:6px">분실물 25건을 현재 알고리즘(aimRankFull)에 그대로 넣은 결과예요. 습득물 25건이 후보 풀입니다.</div>';
      R.res.rows.slice().sort(function(a,b){return a.key<b.key?-1:1;}).forEach(function(r){
        var s=STATUS[r.status];
        h+='<div class="lab-card"><div><span class="lab-chip '+s[0]+'">'+s[1]+'</span>'+chipG(r.group)+'<span class="lab-chip lab-gray">'+r.key+'</span></div>'
          +'<div style="margin-top:3px"><b>'+esc(r.title)+'</b><br><span style="color:var(--sub)">'+esc(r.date)+' · '+esc((pOf(r.key)||{}).location||'')+'</span></div>'
          +(r.expected.length?'<div style="margin-top:3px;color:#1c7f4a">정답: '+r.truth.map(function(t){return esc(t.title||t.key)+' (점수 '+t.total+(t.rank?', '+t.rank+'위':', 미추천'+(t.gate?' · '+esc(t.gate):''))+')';}).join(', ')+'</div>'
            :'<div style="margin-top:3px;color:var(--sub)">정답 없음'+(r.decoy.length?' · 비슷한 다른 물건: '+esc(r.decoy.join(', ')):'')+'</div>');
        if(r.top.length){
          h+='<ul class="lab-top">'+r.top.map(function(x){
            return '<li>'+x.rank+'위 <span class="lab-chip '+(x.correct?'lab-ok':'lab-bad')+'">'+(x.correct?'정답':'오추천')+'</span><b>'+x.total+'점</b> '+esc(x.title)+' <span style="color:var(--sub)">('+x.key+')</span>'
              +'<br>'+chips(x.comp)+(x.why.length?'<br><span style="color:#1c7f4a">+ '+esc(x.why.slice(0,3).join(' / '))+'</span>':'')+(x.warn.length?'<br><span style="color:#a86300">! '+esc(x.warn.slice(0,3).join(' / '))+'</span>':'')+'</li>';}).join('')+'</ul>';
        }else h+='<div style="margin-top:4px">→ 화면에 <b>“매칭되는 습득물을 찾지 못했어요”</b>가 표시돼요.</div>';
        h+='<div style="margin-top:6px"><button class="lab-btn" onclick="labOpenAi(\''+r.key+'\')">🔍 실제 AI 매칭 화면으로 보기</button></div></div>';
      });
    }
    if(R.tab==='bad'){
      h+='<div class="aim-h">잘못 추천된 사례 (점수 높은 순)</div>';
      if(!M.worst.length)h+='<div class="lab-card">없음</div>';
      M.worst.forEach(function(w){
        h+='<div class="lab-card"><span class="lab-chip lab-bad">'+w.total+'점 · '+w.rank+'위</span>'+chipG(w.group)+'<br>분실: <b>'+esc(w.lostTitle)+'</b> <span style="color:var(--sub)">('+w.lost+')</span><br>'
          +'추천됨: <b>'+esc(w.foundTitle)+'</b> <span style="color:var(--sub)">('+w.found+')</span>'
          +(w.why.length?'<br><span style="color:#1c7f4a">+ '+esc(w.why.slice(0,3).join(' / '))+'</span>':'')+(w.warn.length?'<br><span style="color:#a86300">! '+esc(w.warn.slice(0,3).join(' / '))+'</span>':'')+'</div>';
      });
      h+='<div class="aim-h" style="margin-top:12px">정답이 있는데 추천하지 못한 사례</div>';
      var ms=R.res.rows.filter(function(r){return r.status==='miss';});
      if(!ms.length)h+='<div class="lab-card">없음</div>';
      ms.forEach(function(r){var t=r.truth[0];
        h+='<div class="lab-card"><span class="lab-chip lab-bad">놓침</span><br>분실: <b>'+esc(r.title)+'</b> <span style="color:var(--sub)">('+r.key+')</span><br>정답: <b>'+esc(t.title||t.key)+'</b> — 점수 '+t.total
          +'<br><span style="color:#c0392b">'+esc(t.gate||t.exclMsg||'기준 점수/종류 일치 기준 미달')+'</span></div>';});
    }
    if(R.tab==='probe'){
      h+=R.probeHtml||'<div class="lab-card"><button class="lab-btn" onclick="labProbe()">민감도 프로브 실행</button><div style="color:var(--sub);margin-top:6px">정답 쌍(A)의 날짜·장소·설명을 일부러 바꿔 점수가 어떻게 변하는지 봐요. 알고리즘은 바꾸지 않고, 복사본 입력만 바꿔요.</div></div>';
    }
    if(R.tab==='src'){
      h+='<div class="lab-card">사진은 Wikimedia Commons 의 자유 라이선스 파일이거나, “SAMPLE” 표시가 들어간 <b>직접 만든 모형 이미지</b>입니다. 자세한 근거는 testdata/image_sources.json 과 testdata/README.md 를 보세요.</div>';
      R.srcs.items.forEach(function(s){
        h+='<div class="lab-card"><div class="lab-row"><img class="lab-th" src="'+esc(s.file)+'" alt=""><div style="min-width:0"><b>'+esc(s.key)+'</b> '
          +(s.kind==='mock'?'<span class="lab-chip lab-warn">직접 제작 모형</span>':'<span class="lab-chip lab-ok">실제 사진</span>')
          +'<br>'+esc(s.observed&&s.observed.object||'')+'<br><span style="color:var(--sub)">'+esc(s.license)+' · '+esc(s.author||'')+'</span>'
          +(s.page_url?'<br><a href="'+esc(s.page_url)+'" target="_blank" rel="noopener" style="color:#1a5fd4">원본 파일 페이지</a>':'')
          +(s.same_object_evidence&&s.same_object_evidence!=='n/a'?'<br><span style="color:#a86300">같은 물건 근거: '+esc(s.same_object_evidence)+'</span>':'')+'</div></div></div>';
      });
    }
    $('lab-body').innerHTML=h;
  }

  // ── 민감도 프로브 (복사본 입력만 변경) ──
  window.labProbe=function(){
    var posts=R.posts,out=[];
    var days=function(d,n){var x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
    var P=MatchEval.probes?MatchEval.probes(aimScore,posts,R.truth,days):[];
    R.probeHtml='<div class="lab-card"><table class="lab-t"><tr><th>쌍</th><th>기준</th><th>습득일 −10일</th><th>습득일 +20일</th><th>다른 건물</th><th>설명 삭제</th></tr>'
      +P.map(function(r){return '<tr><td>'+r.pair+'</td><td>'+r.base+'</td><td>'+r.dateBefore+'</td><td>'+r.dateLate+'</td><td>'+r.farPlace+'</td><td>'+r.noDesc+'</td></tr>';}).join('')
      +'</table><div style="color:var(--sub);margin-top:6px">값은 유사도 점수(추천 여부)예요. ✗ = 추천 기준 미달.</div></div>';
    renderLab();
  };

  window.__testlab={R:R,ensure:ensureTruth,run:runEval}; // 자동 검증(tests/)용
  // ── 시작 ──
  mount();
  registerAll().catch(function(e){banner('테스트 데이터 등록 실패: '+e.message,true);console.error(e);});
})();
