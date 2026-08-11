# Supabase 연동 설정 가이드

## 목차

1. [Supabase 프로젝트 생성](#1-supabase-프로젝트-생성)
2. [데이터베이스 테이블 생성](#2-데이터베이스-테이블-생성)
3. [Realtime 활성화](#3-realtime-활성화)
4. [API 키 입력](#4-api-키-입력)
5. [배포 방법](#5-배포-방법)
6. [문제 해결](#6-문제-해결)

---

## 1. Supabase 프로젝트 생성

1. [https://supabase.com](https://supabase.com) 접속 후 **Start your project** 클릭
2. GitHub 계정으로 로그인
3. **New project** 클릭
4. 설정 입력:
   - **Name**: `find-app` (원하는 이름)
   - **Database Password**: 안전한 비밀번호 입력 (저장해두세요)
   - **Region**: `Northeast Asia (Seoul)` 선택 (한국 기준)
5. **Create new project** 클릭 → 약 1~2분 대기

---

## 2. 데이터베이스 테이블 생성

Supabase 대시보드 왼쪽 메뉴에서 **SQL Editor** 클릭 후, 아래 SQL을 전체 복사해서 붙여넣고 **Run** 클릭합니다.

```sql
-- 유저 테이블
create table users (
  id         bigint generated always as identity primary key,
  student_id text unique not null,
  nickname   text unique not null,
  password   text not null,
  created_at timestamptz default now()
);

-- 게시물 테이블
create table posts (
  id         bigint generated always as identity primary key,
  type       text not null,
  title      text not null,
  category   text not null,
  location   text not null,
  date       text not null,
  author     text not null,
  desc       text,
  status     text default 'active',
  likes      text[] default '{}',
  views      integer default 0,
  img        text,
  coords     jsonb,
  univ       text not null,
  created_at timestamptz default now()
);

-- 채팅 메시지 테이블
create table chat_messages (
  id         bigint generated always as identity primary key,
  post_id    bigint not null,
  from_user  text not null,
  msg_text   text not null,
  msg_time   text not null,
  created_at timestamptz default now()
);

-- RLS(행 수준 보안) 비활성화 — 개발용 설정
alter table users         disable row level security;
alter table posts         disable row level security;
alter table chat_messages disable row level security;
```

> **참고**: RLS를 비활성화하면 누구나 API 키로 데이터에 접근할 수 있습니다.
> 실제 서비스 배포 시에는 Row Level Security 정책을 설정하세요.

실행 후 **Table Editor**에서 `users`, `posts`, `chat_messages` 테이블이 생성됐는지 확인합니다.

---

## 3. Realtime 활성화

채팅 실시간 수신을 위해 `chat_messages` 테이블의 Realtime을 활성화합니다.

1. 대시보드 왼쪽 메뉴 → **Database** → **Replication** 클릭
2. **Source** 탭에서 `chat_messages` 행의 토글을 **ON**으로 변경

> 이 설정이 없으면 채팅 메시지를 보내도 상대방 화면에 자동으로 표시되지 않습니다.
> (새로고침 시에는 정상 표시됩니다.)

---

## 4. API 키 입력

1. 대시보드 왼쪽 메뉴 → **Project Settings** → **API** 클릭
2. 아래 두 값을 복사합니다:
   - **Project URL**: `https://xxxxxxxxxxxx.supabase.co` 형태
   - **anon public** 키: `eyJhb...` 로 시작하는 긴 문자열

3. `index.html`을 텍스트 편집기로 열고 상단 두 줄을 수정합니다:

```javascript
// 수정 전
var SUPABASE_URL  = 'https://xxxxxxxxxxxx.supabase.co';
var SUPABASE_ANON = 'your-anon-key-here';

// 수정 후 (본인 값으로 교체)
var SUPABASE_URL  = 'https://abcdefghijkl.supabase.co';
var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

저장 후 브라우저에서 `index.html`을 열면 앱이 동작합니다.

---

## 5. 배포 방법

`index.html` 단일 파일이므로 어떤 정적 호스팅 서비스에도 배포할 수 있습니다.

### GitHub Pages (무료, 권장)

1. GitHub에서 새 저장소 생성
2. `index.html`을 저장소 루트에 업로드 (`git push`)
3. 저장소 Settings → **Pages** → Source: `main` 브랜치, `/ (root)` 선택 → **Save**
4. 약 1분 후 `https://{username}.github.io/{repo-name}/` 으로 접속 가능

### Netlify (무료, 드래그&드롭)

1. [netlify.com](https://netlify.com) 접속 → 로그인
2. 대시보드에서 `index.html` 파일을 드래그&드롭
3. 바로 `https://xxxxxx.netlify.app` URL 발급

### 로컬 실행

`index.html`을 브라우저에서 직접 열어도 동작합니다. (파일 탐색기에서 더블클릭)

---

## 6. 문제 해결

### 앱을 열어도 데이터가 안 보여요

- `SUPABASE_URL`과 `SUPABASE_ANON` 값이 올바르게 입력됐는지 확인하세요.
- 브라우저 개발자 도구(F12) → Console 탭에서 에러 메시지를 확인하세요.
- Supabase 대시보드 → **Table Editor**에서 테이블이 생성됐는지 확인하세요.

### 회원가입/로그인이 안 돼요

- SQL 실행이 완료됐는지 확인하세요 (Table Editor에 `users` 테이블 있어야 함).
- RLS가 비활성화됐는지 확인하세요: Table Editor → `users` → RLS 배지가 `disabled`여야 합니다.

### 채팅 메시지가 실시간으로 안 와요

- Realtime 설정을 확인하세요: Database → Replication → `chat_messages` 토글 ON
- 브라우저 Console에 WebSocket 관련 에러가 없는지 확인하세요.

### 사진 업로드 후 게시물이 너무 느려요

`posts.img` 컬럼에 base64로 저장하는 방식은 이미지 크기가 클수록 DB 용량을 많이 소비합니다.
대용량 이미지 처리가 필요하다면 Supabase Storage로 전환을 권장합니다:

1. 대시보드 → **Storage** → 새 버킷 생성 (`post-images`, Public)
2. 이미지 업로드: `sb.storage.from('post-images').upload(path, file)`
3. 공개 URL 저장: `sb.storage.from('post-images').getPublicUrl(path).data.publicUrl`

---

## 설정 체크리스트

설정 완료 전에 아래 항목을 모두 확인하세요:

- [ ] Supabase 프로젝트 생성 완료
- [ ] SQL 실행으로 3개 테이블 생성 (`users`, `posts`, `chat_messages`)
- [ ] 3개 테이블 모두 RLS 비활성화
- [ ] `chat_messages` Realtime 활성화
- [ ] `index.html`에 `SUPABASE_URL` 입력
- [ ] `index.html`에 `SUPABASE_ANON` 입력
- [ ] 브라우저에서 앱 열기 → 회원가입 정상 동작 확인
- [ ] 게시물 등록 정상 동작 확인
- [ ] 두 브라우저 탭에서 채팅 실시간 수신 확인
