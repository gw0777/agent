#!/usr/bin/env node
/**
 * HERMES-JEV-ROUTER
 * 교수님의 6개 영역 업무(ADMIN/CLASS/RESEARCH/HUMANITAS/CONTENT/PERSONAL)를
 * Vercel AI Gateway + JEV(typesafe-ai/jev)로 라우팅하는 라우터.
 * 실제 메일·캘린더 변경은 하지 않고, 라우팅·결정·기록만 수행.
 *
 * 사용법:
 *   node router.js                    → 기본 상태(오늘의 교수 업무)로 평가
 *   node router.js --state="..."      → 커스텀 상태 주입
 *   node router.js --output=json      → JSON만 출력 (파이프 용도)
 *   node router.js --help             → 사용법
 *
 * 환경변수:
 *   VERCEL_AI_GATEWAY_KEY  — JEV API 키 (기본값: mock-jev-demo-key-2026)
 *   JEV_API_URL            — Vercel AI Gateway evaluate 엔드포인트
 */

const DEFAULT_API_KEY = "";
const DEFAULT_API_URL = "https://ai-gateway.vercel.sh/v1/evaluate";

// ============================================================
// 1. 교수 업무 영역 정의 (6개)
// ============================================================
const PROFESSOR_DOMAINS = {
  ADMIN: {
    label: "ADMIN (행정)",
    description: "아침 브리핑 작성·메일 발송, 일정 조정, 행정 결재, 비교과 프로그램 간식비, 이메일 관리, 교수학습개발원 소통",
    jeVQuestions: {
      urgency: { type: "boolean", instructions: "지금 처리하지 않으면 하루 이상 지연되는 행정 업무가 있는가?" },
      autoDraft: { type: "boolean", instructions: "브리핑·메일·공지문 초안을 AI로 작성 가능한가?" },
      humanDecide: { type: "boolean", instructions: "교수가 직접 결재·판단해야 하는 행정 사항인가?" },
      mailCheck: { type: "boolean", instructions: "오늘 확인해야 할 수신 메일이 있는가?" },
      esseRecord: { type: "boolean", instructions: "이 행정 업무의 결정·처리 내역을 기록·보관해야 하는가?" }
    }
  },
  CLASS: {
    label: "CLASS (수업)",
    description: "우석대 특수교육 AI 특강, 후마니타스 AI 실습+Google 생태계, 영남대 특수체육 AI 확장, 배드민턴 HTML 수업, AI 용어사전 수업, 강의자료 준비",
    jeVQuestions: {
      classReady: { type: "boolean", instructions: "오늘 수업이 준비 완료된 상태인가? (자료·링크·프로젝터 점검 포함)" },
      aiMaterial: { type: "boolean", instructions: "수업용 자료(슬라이드·실습지·예시)를 AI로 초안/보완 가능한가?" },
      studentLink: { type: "boolean", instructions: "학생 연락·미참석자 확인이 필요한 수업 관련 업무가 있는가?" },
      reuseAsset: { type: "boolean", instructions: "기존 수업자료를 재활용·변형해서 오늘 수업에 쓸 수 있는가?" },
      esseRecord: { type: "boolean", instructions: "수업 진행 내용·학생 피드백을 기록해야 하는가?" }
    }
  },
  RESEARCH: {
    label: "RESEARCH (연구)",
    description: "JER 논문 Major revision(10/9 마감), KSSWE 논문 판정, 원고 작성·교정, 참고문헌 대조, 통계·방법론 검토",
    jeVQuestions: {
      deadlineCritical: { type: "boolean", instructions: "마감 임박(48시간 이내)한 연구 관련 업무가 있는가?" },
      revisionDirection: { type: "string", enum: ["진행", "보류", "중단"], instructions: "현재 연구 업무를 어떻게 진행할지 방향을 선택하라." },
      aiAssisted: { type: "boolean", instructions: "초안·교정·참고문헌 대조·코드 초안을 AI로 보조 가능한가?" },
      humanReview: { type: "boolean", instructions: "연구 내용·인용·데이터 해석은 교수 확인이 반드시 필요한가?" },
      esseRecord: { type: "boolean", instructions: "연구 진행·수정·판정 내역을 기록·보관해야 하는가?" }
    }
  },
  HUMANITAS: {
    label: "HUMANITAS (후마니타스)",
    description: "13기 개강·미참석자 연락, 12기 감사·후속, 14기 모집 준비, 참여자 관리, 단체카톡방 운영, 관계 관리",
    jeVQuestions: {
      participantContact: { type: "boolean", instructions: "오늘 미참석자·신규 대상자에게 연락해야 할 인간관계가 있는가?" },
      messageDraft: { type: "boolean", instructions: "감사·안내·모집 연락 메시지 초안을 AI로 작성 가능한가?" },
      relationshipRisk: { type: "boolean", instructions: "지연 시 관계 관리 골든타임을 놓칠 수 있는 후속 업무가 있는가?" },
      programDecision: { type: "boolean", instructions: "모집 시점·방식·감사 방식 등 교수 결정이 필요한 운영 사항이 있는가?" },
      esseRecord: { type: "boolean", instructions: "참여자 연락처·연락 내역·후속 계획을 기록·관리해야 하는가?" }
    }
  },
  CONTENT: {
    label: "CONTENT (콘텐츠 제작)",
    description: "AI 특강 슬라이드·워크북·핸드아웃, AI 용어사전 HTML, 루프 스테이션 대시보드 HTML, 강의 보조자료, PDF·PPTX·DOCX 문서 제작",
    jeVQuestions: {
      contentDraft: { type: "boolean", instructions: "오늘 제작할 콘텐츠를 AI로 초안·구조·예시 생성이 가능한가?" },
      reuseModify: { type: "boolean", instructions: "기존 콘텐츠를 변형·재사용해서 오늘 작업에 쓸 수 있는가?" },
      formatBuild: { type: "boolean", instructions: "HTML·PPTX·DOCX·PDF 등 실제 파일 빌드까지 AI가 보조 가능한가?" },
      reviewNeeded: { type: "boolean", instructions: "콘텐츠 내용·정확성·톤 최종 확인을 교수가 해야 하는가?" },
      esseRecord: { type: "boolean", instructions: "제작한 콘텐츠·수정 내역·출처를 기록해야 하는가?" }
    }
  },
  PERSONAL: {
    label: "PERSONAL (개인)",
    description: "개인 일정, 가족·건강, 취미(배드민턴 등), 휴식, 기타 개인 업무",
    jeVQuestions: {
      personalUrgent: { type: "boolean", instructions: "오늘 개인적으로 긴급하게 처리해야 할 일이 있는가?" },
      personalBalance: { type: "boolean", instructions: "업무 부담 대비 개인 시간·휴식 확보가 필요한 상태인가?" },
      noRobot: { type: "boolean", instructions: "이 영역은 AI·자동화가 개입하지 않고 사람만 처리할 일인가?" },
      esseRecord: { type: "boolean", instructions: "개인 일정·결정 내역을 기록·관리할 필요가 있는가?" }
    }
  }
};

// ============================================================
// 2. 교수 오늘 상태 (기본값)
// ============================================================
const DEFAULT_STATE = `
서건우 교수(백석대학교 적응체육학과).
오늘 일정: 우석대 특수교육 AI 특강(10/6), 후마니타스 AI 실습+Google 생태계(10/6),
영남대 특수체육 AI 확장(10/7), JER 논문 Major revision 제출(10/9 마감), 아침 브리핑 메일 발송 필요.
반복 업무: 아침 브리핑 작성·메일 발송, 특강 슬라이드·워크북 제작, 강의 자료 정리,
학생·학회 메일 응대, 연구 논문 작성·교정. 콘텐츠: 배드민턴 HTML, AI 용어사전 HTML, 루프 스테이션 대시보드 HTML 제작 경험.
`;

// ============================================================
// 3. JEV 호출
// ============================================================
async function callJEV(state, questions, apiKey, apiUrl) {
  const payload = JSON.stringify({ model: "typesafe-ai/jev", state, questions });
  const req = new (await import("node:fetch")).Request(apiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Provider": "typesafe-ai"
    },
    body: payload
  });
  const resp = await req.json();
  return resp;
}

// ============================================================
// 4. CLI 진입점
// ============================================================
async function main() {
  const args = process.argv.slice(2);
  const stateIdx = args.indexOf("--state");
  const state = stateIdx >= 0 ? args[stateIdx + 1] : DEFAULT_STATE;
  const outputJson = args.includes("--output=json");
  const help = args.includes("--help");

  if (help) {
    console.log(`
HERMES-JEV-ROUTER — 교수님 6개 영역 업무 JEV 라우팅

사용법:
  node router.js                          → 기본 상태(오늘의 교수 업무)로 평가
  node router.js --state="..."            → 커스텀 상태 주입
  node router.js --output=json            → JSON만 출력 (파이프 용도)
  node router.js --help                   → 이 도움말

환경변수:
  VERCEL_AI_GATEWAY_KEY  — JEV API 키 (기본값: mock-jev-demo-key-2026)
  JEV_API_URL            — Vercel AI Gateway evaluate 엔드포인트
    `);
    process.exit(0);
  }

  const apiKey = process.env.AI_GATEWAY_API_KEY || DEFAULT_API_KEY;
  const apiUrl = process.env.JEV_API_URL || DEFAULT_API_URL;

  // 모든 도메인의 질문을 하나로 모아서 JEV에 병렬 요청
  const allQuestions = {};
  for (const [domain, info] of Object.entries(PROFESSOR_DOMAINS)) {
    for (const [qKey, qDef] of Object.entries(info.jeVQuestions)) {
      allQuestions[`${domain}_${qKey}`] = qDef;
    }
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("HERMES-JEV-ROUTER · 교수님 6개 영역 업무 JEV 평가");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`API: ${apiUrl}`);
  console.log(`상태 길이: ${state.length}자`);
  console.log(`질문 수: ${Object.keys(allQuestions).length}개 (병렬)`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\n[STATE]");
  console.log(state);
  console.log("\n[DOMAINS]");
  for (const [domain, info] of Object.entries(PROFESSOR_DOMAINS)) {
    console.log(`  ${info.label}: ${info.description}`);
  }
  console.log("\n[JEV 호출 중...]");

  try {
    const result = await callJEV(state, allQuestions, apiKey, apiUrl);
    console.log("\n[JEV RESPONSE]");
    console.log(JSON.stringify(result, null, 2));

    // 영역별 요약 출력
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("【영역별 요약】");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    for (const [domain, info] of Object.entries(PROFESSOR_DOMAINS)) {
      console.log(`\n▶ ${info.label} (${info.label})`);
      console.log(`  설명: ${info.description}`);
      const domainResults = {};
      for (const [qKey, qDef] of Object.entries(info.jeVQuestions)) {
        const fullKey = `${domain}_${qKey}`;
        if (result[fullKey] !== undefined) {
          domainResults[qKey] = result[fullKey];
        }
      }
      for (const [qKey, qVal] of Object.entries(domainResults)) {
        const qDef = info.jeVQuestions[qKey];
        let display = qVal;
        if (typeof qVal === "object" && qVal !== null) {
          display = JSON.stringify(qVal);
        }
        console.log(`  ${qKey}: ${display}`);
      }
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("【Esse(관리/윤리/기록) 체크】");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const esseFlags = {};
    for (const [domain, info] of Object.entries(PROFESSOR_DOMAINS)) {
      const flag = info.jeVQuestions.esseRecord;
      const fullKey = `${domain}_esseRecord`;
      const val = result[fullKey];
      esseFlags[domain] = val;
      const need = val === true || (typeof val === "string" && val === "필요함") ? "✅ 기록 필요" : "○ 기록 불필요/미확정";
      console.log(`  ${info.label}: ${need} (값: ${JSON.stringify(val)})`);
    }

    console.log("\n【최종 판정 가이드】");
    console.log("  · 인간 확인 필요 영역: PERSONAL은 AI 개입 없이 사람만 처리");
    console.log("  · ADMIN·CLASS·RESEARCH·HUMANITAS·CONTENT: JEV 결과로 우선순위·자동화·기록 판단");
    console.log("  · 기록(Esse) 필요한 영역은 결과값 true인 영역 — 이후 로그·보관 계획 수립");
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    if (outputJson) {
      process.stdout.write(JSON.stringify({ state, questions: allQuestions, result }, null, 2) + "\n");
    }

  } catch (err) {
    console.error("\n[JEV 호출 실패]");
    if (err.name === "FetchError" || err.message?.includes("fetch") || err.message?.includes("network") || err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
      console.error("※ 네트워크/엔드포인트 문제: Vercel AI Gateway JEV 엔드포인트에 도달하지 못함.");
      console.error("※ 실제 환경에서는 Vercel AI Gateway가 활성화된 상태여야 함.");
      console.error("※ 현재 모의 테스트 환경이라면 아래 구조로 응답 형태를 확인할 수 있음:");
      console.error("※ https://vercel.com/ai-gateway/models/jev");
    } else {
      console.error(err);
    }
    process.exit(1);
  }
}

main();
