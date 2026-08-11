# 찾았대 🔍

> 대학교 분실물 통합 플랫폼 — 단일 HTML 파일 + Supabase 백엔드

학교별로 분실물/습득물 게시글을 올리고, 실시간 채팅으로 연락할 수 있는 모바일 웹 앱입니다.

---

## 주요 기능

| 기능 | 설명 |
|---|---|
| 회원가입 / 로그인 | 아이디·닉네임·비밀번호 기반 계정 시스템 |
| 대학 선택 | 서울권·경기/인천권 60개 대학 검색·선택 |
| 게시물 피드 | 분실물·습득물 카드 목록, 카테고리·상태·텍스트 필터 |
| 게시물 등록/수정/삭제 | 사진 업로드, 지도 핀 (Leaflet + Nominatim) |
| 좋아요 / 조회수 | 유저별 중복 방지 좋아요, 세션 당 1회 조회수 집계 |
| 실시간 채팅 | Supabase Realtime — 다른 기기에서 즉시 수신 |
| 상태 변경 | 게시물 상태를 '진행 중' ↔ '해결됨'으로 전환 |
| 유저 프로필 | 작성자 클릭 시 해당 유저의 게시물 통계·목록 조회 |

---

## 문서

| 파일 | 내용 |
|---|---|
| [FEATURES.md](./FEATURES.md) | 기능 상세 설명 및 코드 구조 |
| [SETUP.md](./SETUP.md) | Supabase 연동 설정 방법 |

---

## 기술 스택

- **프론트엔드**: Vanilla HTML / CSS / JavaScript (단일 파일)
- **백엔드**: [Supabase](https://supabase.com) (PostgreSQL + Realtime + REST API)
- **지도**: [Leaflet.js](https://leafletjs.com) + [OpenStreetMap](https://www.openstreetmap.org) + [Nominatim](https://nominatim.org) 주소 검색

## 빠른 시작

1. [SETUP.md](./SETUP.md)를 따라 Supabase 프로젝트를 설정합니다.
2. `index.html` 상단의 `SUPABASE_URL`과 `SUPABASE_ANON` 값을 입력합니다.
3. `index.html`을 브라우저에서 열거나 정적 호스팅(GitHub Pages, Netlify 등)에 배포합니다.
