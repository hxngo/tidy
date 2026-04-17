# Tidy Skill Marketplace Server

커스텀 스킬을 공유하고 탐색하는 REST API 서버입니다.

## 실행

```bash
cd server
npm install
npm start        # 포트 3333
# 또는
PORT=4000 npm start
```

## 환경변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| PORT | 3333 | 서버 포트 |
| DATA_DIR | ./data | SQLite DB 저장 경로 |

## API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /health | 상태 확인 |
| GET | /api/skills | 목록 (q, category, sort, page) |
| GET | /api/skills/:id | 단건 조회 |
| POST | /api/skills | 스킬 등록 |
| POST | /api/skills/:id/install | 설치 카운트 +1 |
| POST | /api/skills/:id/like | 좋아요 토글 |
| DELETE | /api/skills/:id | 삭제 (author_token 필요) |

## Tidy 앱 연결

앱 기본값: `http://localhost:3333`  
Settings → 마켓플레이스 URL에서 변경 가능합니다.
