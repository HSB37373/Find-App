# 기능 상세 및 코드 설명

## 목차

1. [전체 구조](#1-전체-구조)
2. [화면 구성](#2-화면-구성)
3. [데이터 모델](#3-데이터-모델)
4. [인증 시스템](#4-인증-시스템)
5. [대학 선택](#5-대학-선택)
6. [게시물 피드 & 필터](#6-게시물-피드--필터)
7. [게시물 등록 / 수정 / 삭제](#7-게시물-등록--수정--삭제)
8. [지도 기능](#8-지도-기능)
9. [좋아요 & 조회수](#9-좋아요--조회수)
10. [실시간 채팅](#10-실시간-채팅)
11. [유저 프로필](#11-유저-프로필)
12. [상태 변경](#12-상태-변경)
13. [매너온도](#13-매너온도)

---

## 1. 전체 구조

```
index.html
├── <head>
│   ├── Leaflet CSS/JS (지도)
│   └── Supabase JS SDK (CDN)
├── <body>  — 모든 화면을 하나의 HTML에 포함
│   ├── #auth-scr       로그인 / 회원가입
│   ├── #univ-scr       대학 선택
│   ├── #app            메인 피드
│   ├── #reg-ov         게시물 등록/수정 모달
│   ├── #det-ov         게시물 상세 모달
│   ├── #chat-scr       채팅방
│   ├── #chatlist-scr   채팅 목록
│   ├── #profile-scr    유저 프로필
│   ├── #menu-ov        사이드 메뉴
│   └── #spick-ov       상태 변경 바텀시트
└── <script>  — 모든 로직 (약 900줄)
```

**설계 철학**: 별도 빌드 도구 없이 HTML 단일 파일로 배포 가능하도록 설계했습니다.
Supabase JS SDK만 CDN으로 불러와 백엔드와 통신합니다.

---

## 2. 화면 구성

화면은 `z-index` 스택으로 관리되며, `display:none` / `display:flex` 또는 `.on` 클래스 토글로 전환합니다.

| 화면 | z-index | 전환 방식 |
|---|---|---|
| `#auth-scr` (인증) | 10002 | `style.display` |
| `#univ-scr` (대학 선택) | 10001 | `style.display` |
| `#menu-ov` (사이드 메뉴) | 4000 | `.on` 클래스 |
| `#rev-ov` (매너 평가) | 3100 | `.on` 클래스 |
| `#spick-ov` (상태 픽커) | 3000 | `.on` 클래스 |
| `#helper-ov` (해결 도우미 선택) | 3000 | `.on` 클래스 |
| `#profile-scr` (프로필) | 2500 | `.on` 클래스 |
| `#chat-scr` (채팅방) | 2000 | `.on` 클래스 |
| `#det-ov` (상세) | 1600 | `.on` 클래스 |
| `#chatlist-scr` (채팅 목록) | 1500 | `.on` 클래스 |
| `#app` (메인 피드) | — | `style.display` |

**FAB(플로팅 버튼)** 은 모달이 열릴 때 `display:none`으로 숨기고, 닫힐 때 복원합니다.
단, 채팅·프로필 등 복수의 화면이 중첩될 수 있으므로 `closeXxx()` 함수마다 다른 화면이 열려있는지 체크 후 복원합니다.

```javascript
function closeDet(){
  document.getElementById('det-ov').classList.remove('on');
  var profOpen = document.getElementById('profile-scr').classList.contains('on');
  if (!profOpen) document.querySelector('.fab-wrap').style.display = '';
}
```

---

## 3. 데이터 모델

### Supabase 테이블

#### `users`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | bigint (PK, auto) | 내부 식별자 |
| `student_id` | text (unique) | 로그인 아이디 |
| `nickname` | text (unique) | 앱 내 표시 이름 |
| `password` | text | 비밀번호 (평문) |
| `created_at` | timestamptz | 가입 시각 |

#### `posts`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | bigint (PK, auto) | 게시물 ID |
| `type` | text | `'lost'` 또는 `'found'` |
| `title` | text | 물품명 |
| `category` | text | 전자기기 / 가방/지갑 / 의류 등 |
| `location` | text | 분실/습득 위치 텍스트 |
| `date` | text | 날짜 (YYYY-MM-DD) |
| `author` | text | 작성자 닉네임 |
| `desc` | text | 상세 설명 |
| `status` | text | `'active'` 또는 `'resolved'` |
| `likes` | text[] | 좋아요 누른 닉네임 배열 |
| `views` | integer | 조회수 |
| `img` | text | 사진 base64 데이터 URL |
| `coords` | jsonb | `{lat, lng, addr}` 지도 좌표 |
| `univ` | text | 소속 대학명 |
| `resolved_with` | text | 해결을 도와준 상대 닉네임 (매너온도) |
| `created_at` | timestamptz | 등록 시각 |

#### `chat_messages`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | bigint (PK, auto) | 메시지 ID |
| `post_id` | bigint | 연관 게시물 ID |
| `from_user` | text | 발신자 닉네임 |
| `msg_text` | text | 메시지 내용 |
| `msg_time` | text | 표시 시각 (`HH:MM`) |
| `created_at` | timestamptz | 실제 전송 시각 (정렬용) |

### 전역 상태 객체 `ST`

```javascript
var ST = {
  posts: [],          // 현재 대학의 게시물 배열
  me: '',             // 로그인한 유저 닉네임
  tab: 'all',         // 탭 필터: all / lost / found
  sf: 'active',       // 상태 필터: active / all / resolved
  cf: '',             // 카테고리 필터
  q: '',              // 검색어
  regType: 'lost',    // 등록 폼 유형
  photoUrl: null,     // 등록 사진 base64
  chats: {},          // 채팅 메시지 { [postId]: Message[] }
  univ: '',           // 선택한 대학명
  editId: null,       // 수정 중인 게시물 ID
  statusPickId: null, // 상태 변경 대상 ID
  mapCoords: null,    // 등록 폼 지도 좌표
};
```

### localStorage 사용처 (최소화)

| 키 | 내용 |
|---|---|
| `cjd2_session` | 로그인 세션 `{studentId, nickname}` |
| `cjd2_lastUniv` | 마지막 선택 대학 (자동 재진입용) |
| `cjd2_my_chats_{대학}` | 내가 참여한 채팅의 post_id 목록 |

게시물·채팅 데이터는 모두 Supabase에 저장됩니다.

---

## 4. 인증 시스템

```javascript
async function doLogin() {
  var res = await sb.from('users')
    .select('*')
    .eq('student_id', sid)
    .eq('password', pw)
    .maybeSingle();
  if (!res.data) { /* 에러 표시 */ return; }
  localStorage.setItem('cjd2_session', JSON.stringify({
    studentId: res.data.student_id,
    nickname: res.data.nickname
  }));
  afterAuth(res.data.nickname);
}
```

- `maybeSingle()`: 결과가 0건이면 `null` 반환 (에러 없음), 1건이면 객체 반환
- 세션은 `localStorage`에 저장 → 페이지 새로고침 후에도 유지
- 앱 시작 시 `getSession()`으로 세션 확인 → 있으면 `afterAuth()` 바로 호출

```javascript
// 초기화
(function(){
  var _session = getSession();
  if (_session) {
    afterAuth(_session.nickname);   // 자동 로그인
  } else {
    switchAuthTab('login');         // 로그인 화면 표시
  }
})();
```

회원가입 시 아이디·닉네임 중복을 `maybeSingle()`로 두 번 확인 후 `insert` 합니다.

---

## 5. 대학 선택

60개 대학을 `UNIVS` 객체에 하드코딩하여 서울권/경기인천권으로 분류합니다.

```javascript
var UNIVS = {
  seoul: [
    { name: '서울대학교', loc: '서울 관악구' },
    // ... 30개
  ],
  gyeonggi: [
    { name: '아주대학교', loc: '경기 수원시' },
    // ... 30개
  ]
};
```

검색 시 두 지역을 합쳐 필터링합니다:

```javascript
function renderUnivList() {
  var list;
  if (univQ.trim()) {
    var q = univQ.toLowerCase();
    list = UNIVS.seoul.concat(UNIVS.gyeonggi).filter(function(u) {
      return u.name.toLowerCase().indexOf(q) >= 0
          || u.loc.toLowerCase().indexOf(q) >= 0;
    });
  } else {
    list = UNIVS[curRegion];
  }
  // ...
}
```

대학 선택 시 `selectUniv(name)` → `initData()` → Supabase에서 해당 대학 게시물 로드.
대학별로 게시물이 완전히 분리됩니다 (`posts.univ = '서울대학교'` 식으로 필터).

---

## 6. 게시물 피드 & 필터

### 필터 파이프라인 `getFeed()`

```javascript
function getFeed() {
  var ps = ST.posts.slice().sort(function(a, b) { return b.id - a.id; });
  // 1) 탭 필터
  if (ST.tab === 'lost')    ps = ps.filter(p => p.type === 'lost');
  if (ST.tab === 'found')   ps = ps.filter(p => p.type === 'found');
  // 2) 상태 필터
  if (ST.sf === 'active')   ps = ps.filter(p => p.status === 'active');
  if (ST.sf === 'resolved') ps = ps.filter(p => p.status === 'resolved');
  // 3) 카테고리 필터
  if (ST.cf) ps = ps.filter(p => p.category === ST.cf);
  // 4) 텍스트 검색 (제목 + 위치 + 설명)
  if (ST.q) {
    var q = ST.q.toLowerCase();
    ps = ps.filter(p =>
      (p.title + p.location + (p.desc || '')).toLowerCase().indexOf(q) >= 0
    );
  }
  return ps;
}
```

Supabase에서 가져온 데이터를 클라이언트에서 필터링합니다.
데이터가 이미 `ST.posts`에 메모리 캐싱되어 있어 매번 DB 요청을 하지 않습니다.

### 상단 통계 칩 (`setStat`)

전체 / 찾는 중 / 보관 중 / 해결됨 칩을 클릭하면 탭·상태 필터를 한 번에 설정합니다:

```javascript
function setStat(k) {
  var tabMap = { all:'all', lost:'lost', found:'found', done:'all' };
  var sfMap  = { all:'all', lost:'active', found:'active', done:'resolved' };
  ST.tab = tabMap[k];
  ST.sf  = sfMap[k];
  render();
}
```

---

## 7. 게시물 등록 / 수정 / 삭제

### 등록 (새 게시물)

```javascript
var np = {
  type: ST.regType, title: name, category: catRaw,
  location: loc, date: date, author: ST.me, desc: desc,
  status: 'active', likes: [], views: 0,
  img: ST.photoUrl || null, coords: ST.mapCoords || null,
  univ: ST.univ
};
var ins = await sb.from('posts').insert(np).select().single();
ST.posts.unshift(ins.data);  // 로컬 캐시에도 추가
```

`.select().single()`로 삽입된 행을 즉시 반환받아 `ST.posts`에 추가합니다.
페이지 새로고침 없이 피드에 바로 반영됩니다.

### 수정

```javascript
var res = await sb.from('posts').update(upd).eq('id', ST.editId);
var idx = ST.posts.findIndex(x => x.id === ST.editId);
if (idx > -1) Object.assign(ST.posts[idx], upd);  // 로컬 캐시 동기화
```

### 삭제

```javascript
await sb.from('posts').delete().eq('id', id);
ST.posts = ST.posts.filter(x => x.id !== id);
```

### 사진 업로드

`FileReader.readAsDataURL()`로 이미지를 base64 문자열로 변환 후 `posts.img` 컬럼에 저장합니다.
별도 스토리지 서버 없이 동작하지만, 큰 이미지는 DB 용량을 많이 차지합니다.

```javascript
function handlePhoto(inp) {
  var reader = new FileReader();
  reader.onload = function(e) {
    ST.photoUrl = e.target.result;  // base64 data URL
    // 미리보기 렌더링...
  };
  reader.readAsDataURL(inp.files[0]);
}
```

---

## 8. 지도 기능

Leaflet.js와 OpenStreetMap을 사용합니다. 주소 검색은 Nominatim API를 호출합니다.

### 주소 → 좌표 변환

```javascript
function searchMapAddr() {
  var url = 'https://nominatim.openstreetmap.org/search'
    + '?q=' + encodeURIComponent(q)
    + '&format=json&limit=1&accept-language=ko';
  fetch(url).then(r => r.json()).then(function(data) {
    var lat = parseFloat(data[0].lat);
    var lng = parseFloat(data[0].lon);
    var addr = data[0].display_name.split(',').slice(0, 3).join(', ');
    placeRegMarker(lat, lng, addr);
  });
}
```

선택한 좌표는 `ST.mapCoords = { lat, lng, addr }`에 저장되고, 게시물 등록 시 `coords` 컬럼(jsonb)에 함께 저장됩니다.

상세 보기에서 `coords`가 있으면 지도를 렌더링합니다:

```javascript
if (p.coords) {
  setTimeout(function() { initDetMap(p.coords.lat, p.coords.lng); }, 80);
}
```

`setTimeout(80ms)` 딜레이는 DOM에 지도 컨테이너가 삽입된 후 Leaflet이 초기화되도록 보장하기 위함입니다.

### 핀 규칙 (수원대 고정)

- 학교는 `수원대학교`로 고정되며 학교 선택/변경 화면은 사용하지 않습니다 (`SCHOOL`).
- **습득물은 지도 핀이 필수**, 분실물은 선택입니다 (`syncMapReq()`, 등록 시 `ST.mapCoords` 검사).
- 핀은 지도 클릭, 주소 검색, `📡 내 위치`(GPS)로 찍고, 드래그로 옮길 수 있습니다. 클릭·드래그한 좌표는 Nominatim reverse로 주소를 채웁니다.
- 모든 지도는 수원대 중심 반경 약 5km(`NEAR_BOUNDS`)로 제한되며, 범위 밖에는 핀을 찍을 수 없습니다.
- 핀을 찍으면 지도 아래 `상세 위치` 칸(예: 공학관 3층 302호 앞)에 적을 수 있고 `coords.detail`에 저장됩니다.
- 피드의 `🗺️ 지도` 탭에서 진행 중이고 핀이 있는 **습득물만** 한 지도에서 볼 수 있고, 핀을 누르면 상세로 이동합니다 (`openAllMap()`).

---

## 9. 좋아요 & 조회수

### 좋아요 (중복 방지)

`posts.likes`는 `text[]` 타입으로, 좋아요를 누른 닉네임 배열을 저장합니다.

```javascript
async function like(id) {
  var likes = Array.isArray(p.likes) ? p.likes.slice() : [];
  var idx = likes.indexOf(ST.me);
  if (idx > -1) likes.splice(idx, 1);   // 좋아요 취소
  else          likes.push(ST.me);       // 좋아요 추가
  p.likes = likes;
  await sb.from('posts').update({ likes }).eq('id', id);
}
```

### 조회수 (세션 중복 방지)

`Set`으로 이미 조회한 게시물을 추적하여 중복 카운팅을 방지합니다.

```javascript
var _viewedPosts = new Set();

async function openDet(id) {
  if (!_viewedPosts.has(id)) {
    _viewedPosts.add(id);
    p.views++;
    await sb.from('posts').update({ views: p.views }).eq('id', id);
  }
  // 상세 렌더링...
}
```

같은 상세 보기를 여러 번 열어도(좋아요·상태변경 후 새로고침 등) 조회수는 1회만 증가합니다.

---

## 10. 실시간 채팅

Supabase Realtime의 `postgres_changes`를 사용합니다.

### 구독 설정

채팅방을 열 때 해당 `post_id`에 대한 실시간 구독을 시작합니다:

```javascript
function subscribeChat(postId) {
  if (_chatChannel) { sb.removeChannel(_chatChannel); }
  _chatChannel = sb.channel('chat:' + postId)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'chat_messages',
      filter: 'post_id=eq.' + postId
    }, function(payload) {
      var m = payload.new;
      if (m.from_user === ST.me) return;  // 내가 보낸 메시지는 이미 로컬에 추가됨
      ST.chats[postId].push({
        from: m.from_user, text: m.msg_text, time: m.msg_time
      });
      renderChat(postId);
      scrollToBottom();
    })
    .subscribe();
}
```

### 메시지 전송

```javascript
async function sendMsg() {
  var time = nt();  // "HH:MM"
  // 1) 즉시 UI 반영 (낙관적 업데이트)
  ST.chats[id].push({ from: ST.me, text: txt, time: time });
  renderChat(id);
  // 2) Supabase에 저장 (Realtime이 상대방에게 전달)
  await sb.from('chat_messages').insert({
    post_id: id, from_user: ST.me, msg_text: txt, msg_time: time
  });
}
```

내가 보낸 메시지는 먼저 로컬에 추가(낙관적 업데이트)하고, Supabase 저장 후 Realtime 이벤트가 오면 `from_user === ST.me` 조건으로 스킵하여 중복을 방지합니다.

### 채팅 참여 추적

참여 중인 채팅의 `post_id`는 `localStorage`에 저장합니다.
앱 재시작 시 이 목록으로 Supabase에서 메시지를 로드합니다.

```javascript
function trackChat(pid) {
  var key = 'cjd2_my_chats_' + ST.univ;
  var list = JSON.parse(localStorage.getItem(key) || '[]');
  if (list.indexOf(pid) < 0) { list.push(pid); localStorage.setItem(key, JSON.stringify(list)); }
}
```

### 샘플 게시물 자동 응답

`SAMPLE_AUTHORS`에 포함된 봇 계정 게시물에 채팅 시 1.1초 후 자동 응답합니다:

```javascript
var SAMPLE_AUTHORS = ['kim_sw', 'inchang_helper', 'park_2023', ...];

if (SAMPLE_AUTHORS.indexOf(p.author) > -1) {
  setTimeout(async function() {
    var reply = rs[Math.floor(Math.random() * rs.length)];
    await sb.from('chat_messages').insert({
      post_id: id, from_user: p.author, msg_text: reply, msg_time: nt()
    });
    // Realtime 구독이 자동으로 화면에 표시
  }, 1100);
}
```

실제 유저가 올린 게시물에는 자동 응답이 없습니다.

---

## 11. 유저 프로필

`openProfile(author)` — 특정 닉네임을 가진 유저의 게시물을 `ST.posts`에서 필터링하여 표시합니다. Supabase 추가 요청 없이 이미 로드된 데이터를 사용합니다.

```javascript
function openProfile(author) {
  var posts = ST.posts
    .filter(p => p.author === author)
    .sort((a, b) => b.id - a.id);
  // 통계 및 게시물 목록 렌더링
}
```

통계 카드:
- **전체 게시물**: `posts.length`
- **분실물**: `type === 'lost' && status !== 'resolved'`
- **습득물**: `type === 'found' && status !== 'resolved'`
- **해결됨**: `status === 'resolved'`

---

## 12. 상태 변경

게시물 작성자만 상태를 변경할 수 있습니다. 상세 보기에서 `isMine` 조건으로 버튼을 제어합니다:

```javascript
var isMine = p.author === ST.me;
var actBtns = isMine
  ? likeBtn + editBtn + statusBtn + deleteBtn
  : likeBtn + chatBtn;
```

바텀시트 픽커에서 선택 시:

```javascript
async function pickStatus(status) {
  if (status === 'resolved') { openHelperPicker(id); return; }  // 13장 매너온도 흐름
  p.status = status; p.resolved_with = null;
  await sb.from('posts').update({ status, resolved_with: null }).eq('id', id);
  openDet(id);  // 상세 보기 새로고침 (views 중복 카운트 방지됨)
}
```

---

## 13. 매너온도

당근마켓 매너온도처럼, 물건을 주고받은 두 사람이 서로 남긴 평가로 온도가 오르내립니다.

### 흐름

1. 작성자가 상태를 **해결됨**으로 바꾸면 `#helper-ov`가 열립니다. "누구 덕분에 해결됐나요?"
   - 그 글에서 채팅한 사람 목록 (`chat_messages.from_user`, 작성자 제외)
   - 닉네임 직접 입력 (가입한 닉네임만, 본인 불가)
   - "상대 없이 해결됨으로 바꾸기" (평가 안 함)
2. 고르면 `posts.resolved_with`에 저장하고, 바로 상대 평가 창(`#rev-ov`)을 띄웁니다.
3. 상대방은 그 글 상세 화면에서 **⭐ 매너 평가 남기기** 버튼으로 평가합니다 (`pendingReviewTarget()`).
4. 같은 글에서 같은 상대에게는 한 번만 평가할 수 있습니다 (`reviews` 의 unique 제약 + `hasReviewed()`).
5. 다시 **진행 중**으로 바꾸면 `resolved_with`는 비워지고, 이미 남긴 평가는 그대로 남습니다.

### 평가 항목 (`GOOD_TAGS` / `BAD_TAGS`)

| 😊 좋았어요 | 😞 아쉬웠어요 |
|---|---|
| 답장이 빨라요 | 연락이 끊겼어요 |
| 약속 시간을 잘 지켜요 | 약속을 지키지 않았어요 |
| 물건을 깨끗하게 보관해줬어요 | 불친절했어요 |
| 위치를 정확히 알려줬어요 | 물건 상태가 설명과 달랐어요 |
| 친절하고 매너가 좋아요 | |

한 줄 후기(100자)는 선택입니다.

### 온도 계산 `mannerOf(nick)`

온도는 따로 저장하지 않고 `reviews` 표에서 매번 계산합니다. 계산식을 바꿔도 데이터가 꼬이지 않습니다.

| 항목 | 값 (`MANNER`) |
|---|---|
| 시작 온도 | 36.5°C |
| 좋은 항목 1개 | +0.1° |
| 아쉬운 항목 1개 | −0.3° |
| 물건을 찾아준 사람이 받은 평가에 아쉬운 항목이 없을 때 | +0.5° (찾아준 물건 수 +1) |
| 범위 | 0 ~ 99°C |

"찾아준 사람"은 분실물 글이면 `resolved_with`, 습득물 글이면 작성자입니다. 평가를 저장할 때 `reviews.returned`에 기록합니다.

### 온도 칭호 (`TIERS`)

| 온도 | 칭호 |
|---|---|
| 36.5° ~ | 🌱 갓 입학한 새내기 |
| 38° ~ | ☕ 따뜻한 선배 |
| 42° ~ | 🧤 손난로 같은 사람 |
| 48° ~ | 🔥 캠퍼스 난로 |
| 55° ~ | 🌡️ 인간 온풍기 |
| 65° ~ | ☀️ 걸어다니는 햇살 |
| 80° ~ | 🌋 찾았대 용광로 |

36.5°C 아래는 칭호를 보여주지 않습니다.

### 화면에 보이는 곳

- **프로필**: 온도, 막대, 표정, 칭호, 찾아준 물건 수, 받은 칭찬 목록, 최근 후기 3개
  - 👎 항목과 아쉬운 평가의 후기는 **본인 프로필에서만** 보입니다.
- **게시물 상세**: 작성자 옆 온도 칩, 해결된 글은 "🤝 @상대 님과 해결됐어요"
- **채팅 헤더**: 상대 닉네임 옆 온도 칩
- **메뉴**: 내 매너온도

### `reviews` 테이블

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | bigint (PK, auto) | 평가 ID |
| `post_id` | bigint | 어떤 글의 거래인지 |
| `from_user` | text | 평가한 사람 |
| `to_user` | text | 평가받은 사람 |
| `good_tags` | text[] | 고른 좋은 항목 |
| `bad_tags` | text[] | 고른 아쉬운 항목 |
| `comment` | text | 한 줄 후기 |
| `returned` | boolean | `to_user`가 물건을 찾아준 사람인지 |
| `created_at` | timestamptz | 작성 시각 |

`unique (post_id, from_user, to_user)`. 이미 테이블을 만든 프로젝트는 `index.html` 상단 SQL 주석대로 `reviews` 표를 만들고 `alter table posts add column resolved_with text;`를 실행하세요.

### 데모 모드

샘플 평가 10개(`SAMPLE_REVIEWS`)가 함께 채워집니다. 해결된 샘플 글 "파란색 나이키 후드 분실"은 데모사용자가 찾아준 것으로 되어 있어서, 그 글 상세에서 바로 평가 흐름을 볼 수 있습니다.
