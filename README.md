# HERMES-JEV-ROUTER

서건우 교수 (백석대 특수체육학과) JEV 평가 라우터 + 브라우저 대시보드.

## 구성
- `router.js` — JEV 직접 호출 (fetch)
- `router-ai-sdk.js` — Vercel AI SDK 기반 라우터
- `router-direct.js` — Vercel AI Gateway 직접 호출 버전
- `jev-dashboard.html` — 브라우저 기반 JEV 대시보드 (6개 영역 29개 질문, 결과 시각화)

## JEV API
- 엔드포인트: `https://ai-gateway.vercel.sh/v1/evaluate`
- 모델: `typesafe-ai/jev`
- 헤더: `Authorization: Bearer <API_KEY>`, `Provider: typesafe-ai`

## GPT Bridge MCP 연동
- `gpt-bridge-config.json` → OpenAI ChatGPT Desktop의 `%APPDATA%/OpenAI/ChatGPT/config.json` 에 추가
- ChatGPT가 HERMES-JEV-ROUTER 작업공간을 직접 읽고 편집 가능 (에디터 버퍼로, Ctrl+Z로 취소)

## 로컬 실행
```bash
node router.js
node router-ai-sdk.js --help
```
