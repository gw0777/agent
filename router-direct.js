#!/usr/bin/env node
/**
 * HERMES-JEV-ROUTER — Vercel AI Gateway + JEV 직접 호출 버전
 * AI SDK experimental_evaluate 사용.
 * 
 * 사용법:
 *   node router-direct.js                        # 기본 상태로 평가
 *   node router-direct.js --state="..."         # 커스텀 상태
 *   node router-direct.js --output=json         # JSON만 출력
 *   node router-direct.js --help                # 도움말
 * 
 * 환경변수:
 *   AI_GATEWAY_API_KEY  — Vercel AI Gateway API 키 (필수)
 *   JEV_MODEL          — 모델 ID (기본값: typesafe-ai/jev)
 */

const API_KEY = process.env.AI_GATEWAY_API_KEY || '';
const MODEL = process.env.JEV_MODEL || 'typesafe-ai/jev';

// 교수님 기본 상태 (구조화)
const DEFAULT_STATE = {
  professor: "서건우",
  affiliation: "백석대학교 적응체육학과",
  date: "2026-10-06",
  schedule: [
    { event: "우석대 특수교육 AI 특강", date: "10/6", status: "준비중" },
    { event: "후마니타스 AI 실습 + Google 생태계", date: "10/6", status: "준비중" },
    { event: "영남대 특수체육 AI 확장", date: "10/7", status: "준비중" },
    { event: "JER 논문 Major revision 제출", due: "10/9", status: "수정중", priority: "높음" }
  ],
  pendingTasks: [
    "아침 브리핑 메일 발송",
    "우석대 특강 슬라이드 마무리",
    "특강 워크북·핸드아웃 점검",
    "JER 원고 수정·교정",
    "학생·학회 메일 응대"
  ],
  workHistory: [
    "에듀테크 AI 리터러시 적용 특강 다수",
    "특수체육 연구·논문 작성 경험",
    "후마니타스 세미나 운영 경험",
    "AI 용어사전·루프 스테이션 대시보드 HTML 제작 경험",
    "배드민턴 HTML 수업자료 제작 경험"
  ]
};

// JEV 질문 — 3가지 타입 혼합 (boolean + choice + score)
const QUESTIONS = {
  // === boolean (Noul) ===
  urgentToday: {
    type: 'boolean',
    instructions: '주어진 상태에서 오늘(10/6) 당장 조치하지 않으면 하루 이상 늦춰지는 업무가 있는가?'
  },
  morningBriefingUrgent: {
    type: 'boolean',
    instructions: '아침 브리핑 메일 발송이 오늘 첫 1시간 내 조치 대상인가?'
  },
  lectureSlidesCritical: {
    type: 'boolean',
    instructions: '우석대 특강 슬라이드가 오늘 중 최종 점검 완료되지 않으면 강의에 지장이 있는가?'
  },
  jerFocusNeeded: {
    type: 'boolean',
    instructions: '오늘 JER 논문 Major revision 작업에 집중 시간을 할애해야 하는가? (10/9 마감 기준)'
  },
  aiAutomationPossible: {
    type: 'boolean',
    instructions: '오늘 할 일 중 AI로 초안·정리·자동화가 가능한 작업이 있는가?'
  },

  // === choice ===
  topPriorityDomain: {
    type: 'choice',
    options: {
      'ADMIN(행정)': 'ADMIN(행정)',
      'CLASS(수업)': 'CLASS(수업)',
      'RESEARCH(연구)': 'RESEARCH(연구)',
      'HUMANITAS(후마니타스)': 'HUMANITAS(후마니타스)',
      'CONTENT(콘텐츠)': 'CONTENT(콘텐츠)',
      'PERSONAL(개인)': 'PERSONAL(개인)'
    },
    instructions: '오늘 주어진 상태에서 가장 우선적으로 대응해야 할 업무 영역은?'
  },
  lecturePrepLevel: {
    type: 'choice',
    options: {
      '준비 완료': '준비 완료',
      '경미한 점검만 필요': '경미한 점검만 필요',
      '상당한 수정 필요': '상당한 수정 필요',
      '전면 재작성 필요': '전면 재작성 필요'
    },
    instructions: '우석대 특강 슬라이드·워크북의 현재 준비 수준은?'
  },

  // === score ===
  workloadScore: {
    type: 'score',
    levels: ['매우 낮음', '낮음', '보통', '높음', '매우 높음'],
    instructions: '주어진 상태 기준 오늘 교수의 업무 부하와 심리적 부하는 어느 수준인가? (1=매우 낮음, 5=매우 높음)'
  },
  stressLevel: {
    type: 'score',
    levels: ['매우 여유', '약간 여유', '보통', '약간 긴장', '매우 긴장'],
    instructions: '10/9 JER 마감과 10/6~10/7 특강 준비를 동시에 고려할 때 현재 긴장·스트레스 수준은?'
  }
};

// 상태 파싱
function getState(customState) {
  if (customState) {
    try {
      return JSON.parse(customState);
    } catch {
      return { customText: customState };
    }
  }
  return DEFAULT_STATE;
}

// 출력: 텍스트 표 형태
function printTable(state, answers) {
  console.log('');
  console.log('═'.repeat(60));
  console.log('HERMES-JEV-ROUTER · 교수님 6개 영역 JEV 평가');
  console.log('   모델: ' + MODEL + ' | Vercel AI Gateway');
  console.log('═'.repeat(60));
  console.log('');
  console.log('[STATE]');
  console.log(JSON.stringify(state, null, 2));
  console.log('');
  console.log('═'.repeat(60));
  console.log('[JEV ANSWERS]');
  console.log('═'.repeat(60));
  
  for (const [key, q] of Object.entries(QUESTIONS)) {
    const a = answers[key];
    if (!a) {
      console.log(`  ${key}: (응답 없음)`);
      continue;
    }
    let display = '';
    if (q.type === 'boolean') {
      display = `${a.value}  (probability: ${a.probability?.toFixed(3) ?? 'N/A'})`;
    } else if (q.type === 'choice') {
      display = `${a.value}  (probability: ${a.probability?.toFixed(3) ?? 'N/A'}, confidence: ${a.confidence?.toFixed(3) ?? 'N/A'})`;
    } else if (q.type === 'score') {
      display = `${a.value}  (probability: ${a.probability?.toFixed(3) ?? 'N/A'}, confidence: ${a.confidence?.toFixed(3) ?? 'N/A'})`;
    }
    console.log(`  ${key.padEnd(28)} → ${display}`);
  }
  
  console.log('');
  console.log('═'.repeat(60));
  console.log('[해석 가이드]');
  console.log('  • probability 0.7+ → JEV 확신 높음, 판단에 참고');
  console.log('  • probability 0.4-0.7 → 중간, 맥락 확인 필요');
  console.log('  • probability 0.4 미만 → JEV도 불확실, 사람 판단 우선');
  console.log('');
}

// 출력: JSON 형태
function printJSON(state, answers) {
  const output = {
    model: MODEL,
    timestamp: new Date().toISOString(),
    state: state,
    questions: QUESTIONS,
    answers: answers
  };
  console.log(JSON.stringify(output, null, 2));
}

// 메인
async function main() {
  const args = process.argv.slice(2);
  const stateArg = args.find(a => a.startsWith('--state='))?.split('=')[1] || null;
  const customState = getState(stateArg);
  const outputJSON = args.includes('--output=json');

  // API 키 확인
  if (!API_KEY) {
    console.log('⚠️  AI_GATEWAY_API_KEY가 설정되지 않았습니다.');
    console.log('');
    console.log('사용법:');
    console.log('  export AI_GATEWAY_API_KEY="your_key"');
    console.log('  node router-direct.js');
    console.log('');
    console.log('또는:');
    console.log('  AI_GATEWAY_API_KEY=*** node router-direct.js');
    console.log('');
    printTable(customState, {});
    return;
  }

  // AI SDK import
  try {
    const { experimental_evaluate: evaluate } = require('ai');
  } catch (e) {
    console.error('❌ AI SDK(ai 패키지) import 실패:', e.message);
    console.error('   해결: npm install ai@latest');
    process.exit(1);
  }

  console.log('════════════════════════════════════════════════════');
  console.log('HERMES-JEV-ROUTER · Vercel AI Gateway + JEV 직접 호출');
  console.log(' model: ' + MODEL);
  console.log(' state 크기: ' + JSON.stringify(customState).length + '자');
  console.log(' 질문 수: ' + Object.keys(QUESTIONS).length + '개 (병렬)');
  console.log('════════════════════════════════════════════════════');
  console.log('');
  console.log('JEV 호출 중...');

  const startTime = Date.now();

  try {
    const { experimental_evaluate: evaluate } = require('ai');
    
    const result = await evaluate({
      model: MODEL,
      state: customState,
      questions: QUESTIONS,
    });

    const elapsed = Date.now() - startTime;
    console.log(`✓ JEV 응답 완료 (${elapsed}ms)`);
    console.log('');

    if (outputJSON) {
      printJSON(customState, result.answers);
    } else {
      printTable(customState, result.answers);
    }

    // 추가: confidence 기반 요약
    console.log('═'.repeat(60));
    console.log('[confidence 요약]');
    const highConf = [];
    const lowConf = [];
    for (const [key, a] of Object.entries(result.answers)) {
      if (a.confidence !== undefined) {
        if (a.confidence >= 0.6) highConf.push(key);
        else lowConf.push(key);
      } else if (a.probability !== undefined) {
        if (a.probability >= 0.7) highConf.push(key);
        else if (a.probability < 0.4) lowConf.push(key);
      }
    }
    if (highConf.length) console.log('  높은 확신: ' + highConf.join(', '));
    if (lowConf.length) console.log('  낮은 확신(사람 확인 권장): ' + lowConf.join(', '));
    if (!highConf.length && !lowConf.length) console.log('  (confidence 데이터 없음 — boolean 질문만 있는 경우)');

  } catch (err) {
    console.error('');
    console.error('❌ JEV 호출 실패');
    console.error('  타입: ' + err.name);
    console.error('  메시지: ' + err.message);
    if (err.statusCode) console.error('  상태코드: ' + err.statusCode);
    if (err.body) console.error('  응답: ' + JSON.stringify(err.body).substring(0, 300));
    console.error('');
    console.error('  확인 사항:');
    console.error('   1. AI_GATEWAY_API_KEY가 유효한가?');
    console.error('   2. Vercel 팀/계정에서 AI Gateway 접근 권한이 있는가?');
    console.error('   3. JEV 모델(typesafe-ai/jev)이 팀 게이트웨이에 등록돼 있는가?');
    console.error('   4. 9/25 무료 기간 종료됐는가?');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('예기치 않은 오류:', e);
  process.exit(1);
});
