// AI 매칭 정확도 평가 — 현재 알고리즘(aimRankFull/aimScore)을 "그대로" 호출해서 정답표(ground_truth.json)와 비교한다.
// 알고리즘은 건드리지 않는다. 브라우저(testdata/lab.js)와 Node(tests/eval_match.js) 양쪽에서 같은 코드를 쓴다.
(function(root){
  var TOP_N=3;

  // posts: 앱에 등록된 테스트 게시물 [{key,...게시물 필드}] (key = posts.json 의 key), truth: ground_truth.json
  function evaluate(api,posts,truth){
    var byKey={};posts.forEach(function(p){byKey[p.key]=p;});
    var pool=posts.filter(function(p){return p.type==='found';});
    var rows=[];
    posts.filter(function(p){return p.type==='lost';}).forEach(function(q){
      var t=truth.lost[q.key]||{group:'?',expected:[]};
      var rk=api.aimRankFull(q,pool,q.author);
      var top=rk.top.map(function(x,i){
        return {rank:i+1,key:x.post.key,title:x.post.title,total:x.r.total,why:x.r.why,warn:x.r.warn,comp:x.r.comp,correct:t.expected.indexOf(x.post.key)>-1};
      });
      // 정답이 추천에서 빠졌다면 이유를 알려 주기 위해 정답 게시물과의 점수를 따로 계산
      var truthInfo=t.expected.map(function(k){
        var p=byKey[k];if(!p)return {key:k,missing:true};
        var r=api.aimScore(q,p);
        var rank=top.findIndex(function(x){return x.key===k;});
        return {key:k,title:p.title,total:r.total,ok:r.ok,gate:r.gate?r.gate.msg:null,exclMsg:r.exclMsg,conf:r.conf,warn:r.warn,why:r.why,comp:r.comp,
                rank:rank>-1?rank+1:null};
      });
      // 비슷하지만 다른 물건(decoy)은 어떻게 판정됐는지: 점수·추천 여부·제외 사유
      var decoyInfo=(t.decoy||[]).map(function(k){
        var p=byKey[k];if(!p)return {key:k,missing:true};
        var r=api.aimScore(q,p),rank=top.findIndex(function(x){return x.key===k;});
        return {key:k,title:p.title,total:r.total,ok:r.ok,rank:rank>-1?rank+1:null,gate:r.gate?r.gate.msg:null,conf:r.conf,warn:r.warn,why:r.why};
      });
      var wrong=top.filter(function(x){return !x.correct;});
      var hasTruth=t.expected.length>0;
      var status;
      if(hasTruth){
        var tr=truthInfo[0];
        status=tr.rank===1?'top1':tr.rank?'top3':'miss';
        if(status==='top1'&&wrong.length)status='top1_extra';
      }else status=top.length?'false_rec':'none_ok';
      rows.push({key:q.key,id:q.id,title:q.title,group:t.group,category:q.category,date:q.date,expected:t.expected,decoy:t.decoy||[],
        top:top,excluded:rk.excluded.map(function(x){return {key:x.post.key,title:x.post.title,msg:x.r.exclMsg,total:x.r.total};}),
        truth:truthInfo,decoyInfo:decoyInfo,wrongCount:wrong.length,status:status,note:t.note||''});
    });
    return {rows:rows,metrics:metrics(rows,posts,truth)};
  }

  function metrics(rows,posts,truth){
    var withT=rows.filter(function(r){return r.expected.length>0;});
    var noT=rows.filter(function(r){return r.expected.length===0;});
    var p1=withT.filter(function(r){return r.truth[0]&&r.truth[0].rank===1;}).length;
    var r3=withT.filter(function(r){return r.truth[0]&&r.truth[0].rank&&r.truth[0].rank<=TOP_N;}).length;
    var answered=withT.filter(function(r){return r.top.length>0;}).length;
    var wrongItems=0,wrongQueries=0;
    rows.forEach(function(r){wrongItems+=r.wrongCount;if(r.wrongCount)wrongQueries++;});
    var missed=withT.filter(function(r){return !(r.truth[0]&&r.truth[0].rank);});
    var falseNo=noT.filter(function(r){return r.top.length>0;});
    var falseNoItems=falseNo.reduce(function(s,r){return s+r.top.length;},0);
    function grp(g){
      var rs=rows.filter(function(r){return r.group===g;});
      return {n:rs.length,withRec:rs.filter(function(r){return r.top.length>0;}).length,wrongItems:rs.reduce(function(s,r){return s+r.wrongCount;},0),
              top1:rs.filter(function(r){return r.truth[0]&&r.truth[0].rank===1;}).length,
              in3:rs.filter(function(r){return r.truth[0]&&r.truth[0].rank;}).length,
              noRec:rs.filter(function(r){return r.top.length===0;}).length};
    }
    // 가장 점수 높은 오추천 (정답이 아닌데 추천된 것)
    var worst=[];
    rows.forEach(function(r){r.top.forEach(function(x){if(!x.correct)worst.push({lost:r.key,lostTitle:r.title,found:x.key,foundTitle:x.title,rank:x.rank,total:x.total,group:r.group,why:x.why,warn:x.warn});});});
    worst.sort(function(a,b){return b.total-a.total||a.rank-b.rank;});
    // 게시물 별 오추천 횟수 (어떤 습득물이 잘못 자주 추천되나)
    var attract={};
    worst.forEach(function(w){attract[w.found]=(attract[w.found]||0)+1;});
    var foundTotal=posts.filter(function(p){return p.type==='found';}).length;
    return {
      queries:rows.length,withTruth:withT.length,noTruth:noT.length,
      precisionAt1:withT.length?p1/withT.length:null,recallAt3:withT.length?r3/withT.length:null,
      top1Hits:p1,top3Hits:r3,answeredWithTruth:answered,
      precisionAt1WhenAnswered:answered?p1/answered:null,
      wrongItems:wrongItems,wrongQueries:wrongQueries,
      missed:missed.length,missedKeys:missed.map(function(r){return r.key;}),
      falseNoTarget:falseNo.length,falseNoTargetItems:falseNoItems,falseNoTargetKeys:falseNo.map(function(r){return r.key;}),
      groups:{A:grp('A'),B:grp('B'),C:grp('C')},worst:worst,attract:attract,foundTotal:foundTotal
    };
  }

  // 데이터 자체 점검: 개수·분포·날짜 선후·중복 사진
  function validate(posts,truth){
    var out=[],add=function(ok,msg){out.push({ok:ok,msg:msg});};
    var lost=posts.filter(function(p){return p.type==='lost';}).length,found=posts.length-lost;
    add(posts.length===50,'총 게시물 '+posts.length+'개 (목표 50)');
    add(lost===25&&found===25,'분실물 '+lost+' · 습득물 '+found+' (목표 25/25)');
    var byKey={};posts.forEach(function(p){byKey[p.key]=p;});
    var bad=[];
    Object.keys(truth.lost).forEach(function(lk){
      (truth.lost[lk].expected||[]).forEach(function(fk){
        var l=byKey[lk],f=byKey[fk];
        if(!l||!f){bad.push(lk+'↔'+fk+' (게시물 없음)');return;}
        if(f.date<l.date)bad.push(lk+'↔'+fk+' 습득일('+f.date+')이 분실일('+l.date+')보다 빠름');
      });
    });
    add(!bad.length,'정답 쌍의 날짜 선후(분실일 ≤ 습득일): '+(bad.length?bad.join(' / '):'모두 정상'));
    var imgs={},dup=[];posts.forEach(function(p){if(!p.img)return;if(imgs[p.img])dup.push(p.key+'='+imgs[p.img]);else imgs[p.img]=p.key;});
    add(!dup.length,'사진 파일 중복: '+(dup.length?dup.join(', '):'없음'));
    var longs=posts.filter(function(p){return p.title.length>50||(p.desc||'').length>200||(p.coords&&(p.coords.detail||'').length>50);}).map(function(p){return p.key;});
    add(!longs.length,'입력 길이 제한(물품명 50자·설명 200자·상세위치 50자) 준수: '+(longs.length?longs.join(','):'모두 정상'));
    add(posts.every(function(p){return /^테스트계정_/.test(p.author);}),'모든 게시물 작성자가 가상 사용자(테스트계정_*)');
    return out;
  }


  // 민감도 프로브: 정답 쌍(A)의 복사본 입력을 바꿔 점수 변화를 본다 (알고리즘·원본 데이터는 그대로)
  function probes(aimScore,posts,truth,addDays){
    var byKey={};posts.forEach(function(p){byKey[p.key]=p;});
    var FAR={lat:37.2125,lng:126.9790,addr:'수원대학교 기숙사',detail:'기숙사 1층'};
    var cell=function(q,f){var r=aimScore(q,f);return r.total+(r.ok?'':' ✗')+(r.gate?'('+r.gate.code+')':'');};
    return Object.keys(truth.lost).filter(function(k){return truth.lost[k].group==='A';}).sort().map(function(k){
      var q=byKey[k],f=byKey[truth.lost[k].expected[0]];
      return {pair:k.replace('-L',''),
        base:cell(q,f),
        dateBefore:cell(q,Object.assign({},f,{date:addDays(q.date,-10)})),
        dateLate:cell(q,Object.assign({},f,{date:addDays(q.date,20)})),
        farPlace:cell(q,Object.assign({},f,{coords:FAR,location:FAR.detail})),
        noDesc:cell(Object.assign({},q,{desc:''}),Object.assign({},f,{desc:''}))};
    });
  }

  var api={evaluate:evaluate,validate:validate,probes:probes,TOP_N:TOP_N};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.MatchEval=api;
})(typeof window!=='undefined'?window:globalThis);
