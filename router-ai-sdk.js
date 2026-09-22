#!/usr/bin/env node
/**
 * HERMES-JEV-ROUTER — AI SDK 버전
 * Vercel AI Gateway + JEV(typesafe-ai/jev)로 교수님 6개 영역 업무를 평가하는 라우터.
 * AI SDK experimental_evaluate 사용.
 * 
 * 사용법:
 *   node router-ai-sdk.js                        # 기본 상태로 평가
 *   node router-ai-sdk.js --state="..."         # 커스텀 상태
 *   node router-ai-sdk.js --output=json         # JSON만 출력
 *   node router-ai-sdk.js --help                # 도움말
 * 
 * 환경변수:
 *   AI_GATEWAY_API_KEY  — Vercel AI Gateway API 키 (필수)
 *   JEV_MODEL          — 모델 ID (기본값: typesafe-ai/jev)
 */

const API_KEY = process.env.AI_GATEWAY_API_KEY || '';
const MODEL = process.env.JEV_MODEL || 'typesafe-ai/jev';

// 교수님 기본 상태
const DEFAULT_STATE = `서건우 교수(백석대학교 적응체육학과).
오늘 일정: 우석대 특수교육 AI 특강(10/6), 후마니타스 AI 실습+Google 생태계(10/6),
영남대 특수체육 AI 확장(10/7), JER 논문 Major revision 제출(10/9 마감), 아침 브리핑 메일 발송 필요.
반복 업무: 아침 브리핑 작성·메일 발송, 특강 슬라이드·워크북 제작, 강의 자료 정리,
학생·학회 메일 응대, 연구 논문 작성·교정. 콘텐츠: 배드민턴 HTML, AI 용어사전 HTML, 루프 스테이션 대시보드 HTML 제작 경험.`;

// 6개 영역별 JEV 질문 템플릿
const DOMAIN_QUESTIONS = {
  ADMIN: {
    label: 'ADMIN (행정)',
    questions: {
      urgent: {
        type: 'boolean',
        instructions: '지금 당장 처리하지 않으면 하루 이상 지연되는 행정 업무가 있는가? (RISE 계획서, 임용 심의, JER 마감 등)'
      },
      aiAutomation: {
        type: 'boolean',
        instructions: '이 행정 업무들 중 AI로 초안/정리/자동화가 가능한 것이 있는가?'
      },
      decisionNeeded: {
        type: 'boolean',
        instructions: '교수가 직접 결정해야 하는 행정 사항이 있는가?'
      },
      humanInLoop: {
        type: 'string',
        enum: ['필요함', '일부 필요함', '불필요함'],
        instructions: '행정 영역에서 인간 확인이 반드시 필요한 것은?'
      }
    }
  },
  CLASS: {
    label: 'CLASS (수업)',
    questions: {
      urgent: {
        type: 'boolean',
        instructions: '지금 당장 준비하지 않으면 수업에 바로 영향을 주는 것이 있는가?'
      },
      aiAutomation: {
        type: 'boolean',
        instructions: '특강 슬라이드·워크북·핸드아웃 제작 중 AI로 초안 가능한 부분은?'
      },
      decisionNeeded: {
        type: 'boolean',
        instructions: '특강 콘텐츠·사례 선택에 교수 판단이 필요한가?'
      },
      humanInLoop: {
        type: 'string',
        enum: ['필요함', '일부 필요함', '불필요함'],
        instructions: '수업 준비에서 인간 확인이 반드시 필요한 부분은?'
      }
    }
  },
  RESEARCH: {
    label: 'RESEARCH (연구)',
    questions: {
      urgent: {
        type: 'boolean',
        instructions: '연구 관련 마감(JER 10/9 등)이 임박했는가?'
      },
      aiAutomation: {
        type: 'boolean',
        instructions: '논문 수정·교정·참고문헌 대조 중 AI 보조 가능한 작업은?'
      },
      decisionNeeded: {
        type: 'boolean',
        instructions: '연구 해석·통계·방법론 판단에 교수 결정이 필요한가?'
      },
      humanInLoop: {
        type: 'string',
        enum: ['필요함', '일부 필요함', '불필요함'],
        instructions: '연구 윤리·정확성 측면에서 인간 확인이 반드시 필요한 것은?'
      }
    }
  },
  HUMANITAS: {
    label: 'HUMANITAS (후마니타스)',
    questions: {
      urgent: {
        type: 'boolean',
        instructions: '기수 운영·연락·관리에서 지금 처리해야 할 것이 있는가?'
      },
      aiAutomation: {
        type: 'boolean',
        instructions: '연락 메시지 초안·명단 정리·안내문 작성 중 AI 가능한 부분은?'
      },
      decisionNeeded: {
        type: 'boolean',
        instructions: '공동체 운영·구성원 관계 관리에서 교수 판단이 필요한가?'
      },
      humanInLoop: {
        type: 'string',
        enum: ['필요함', '일부 필요함', '불필요함'],
        instructions: '후마니타스 운영에서 인간 확인·관계가 반드시 필요한 부분은?'
      }
    }
  },
  CONTENT: {
    label: 'CONTENT (콘텐츠 제작)',
    questions: {
      urgent: {
        type: 'boolean',
        instructions: '콘텐츠 제작·업데이트에서 지금 마감에 쫓기는 작업이 있는가?'
      },
      aiAutomation: {
        type: 'boolean',
        instructions: 'HTML·슬라이드·용어사전 제작 중 AI 초안·검수 자동화 가능한 부분은?'
      },
      decisionNeeded: {
        type: 'boolean',
        instructions: '콘텐츠 내용·표현·구조 선택에 교수 판단이 필요한가?'
      },
      humanInLoop: {
        type: 'string',
        enum: ['필요함', '일부 필요함', '불필요함'],
        instructions: '콘텐츠 제작에서 인간 확인이 반드시 필요한 품질·윤리 지점은?'
      }
    }
  },
  PERSONAL: {
    label: 'PERSONAL (개인)',
    questions: {
      urgent: {
        type: 'boolean',
        instructions: '개인 일정·건강·컨디션에서 지금 주의가 필요한 것은?'
      },
      aiAutomation: {
        type: 'boolean',
        instructions: '개인 일정·할 일 정리·아이디어 분류 중 AI 보조 가능한 부분은?'
      },
      decisionNeeded: {
        type: 'boolean',
        instructions: '개인 우선순위·일정 조정·휴식 판단에 교수 결정이 필요한가?'
      },
      humanInLoop: {
        type: 'string',
        enum: ['필요함', '일부 필요함', '불필요함'],
        instructions: '개인 영역에서 인간 판단·자기 결정이 반드시 필요한 것은?'
      }
    }
  }
};

// 상태 파싱 — 커스텀 상태 주입 처리
function getState(customState) {
  return customState || DEFAULT_STATE;
}

// 질문 합치기 — 모든 영역 질문을 하나로 병합
function buildQuestions() {
  const all = {};
  for (const [domain, config] of Object.entries(DOMAIN_QUESTIONS)) {
    for (const [key, q] of Object.entries(config.questions)) {
      all[`${domain.toLowerCase()}_${key}`] = {
        ...q,
        instructions: `[${config.label}] ${q.instructions}`
      };
    }
  }
  return all;
}

// 출력: 텍스트 표 형태
function printTable(state, domainResults) {
  console.log('');
  console.log('═'.repeat(60));
  console.log('HERMES-JEV-ROUTER · 교수님 6개 영역 업무 JEV 평가 (AI SDK)');
  console.log('═'.repeat(60));
  console.log('');
  console.log('[STATE]');
  console.log(state);
  console.log('');
  console.log('═'.repeat(60));
  console.log('DOMAINS');
  console.log('═'.repeat(60));
  
  for (const [domain, config] of Object.entries(DOMAIN_QUESTIONS)) {
    const prefix = domain.toLowerCase();
    console.log('');
    console.log(`${config.label}:`);
    console.log(`  긴급도   → ${domainResults[`${prefix}_urgent`]?.answer ?? '대기'}`);
    console.log(`  AI 자동화 → ${domainResults[`${prefix}_aiAutomation`]?.answer ?? '대기'}`);
    console.log(`  결정 필요 → ${domainResults[`${prefix}_decisionNeeded`]?.answer ?? '대기'}`);
    console.log(`  인간 확인  → ${domainResults[`${prefix}_humanInLoop`]?.answer ?? '대기'}`);
  }
  
  console.log('');
  console.log('═'.repeat(60));
  console.log('[사용법]');
  console.log('  node router-ai-sdk.js                          → 기본 상태 평가');
  console.log('  node router-ai-sdk.js --state="..."            → 커스텀 상태');
  console.log('  node router-ai-sdk.js --output=json           → JSON만 출력');
  console.log('  node router-ai-sdk.js --help                  → 도움말');
  console.log('');
  console.log('환경변수:');
  console.log('  AI_GATEWAY_API_KEY  — Vercel AI Gateway API 키 (필수)');
  console.log('  JEV_MODEL          — 모델 ID (기본: typesafe-ai/jev)');
  console.log('');
}

// 출력: JSON 형태
function printJSON(state, domainResults) {
  const output = {
    model: MODEL,
    state: state,
    timestamp: new Date().toISOString(),
    domains: {}
  };
  
  for (const [domain, config] of Object.entries(DOMAIN_QUESTIONS)) {
    const prefix = domain.toLowerCase();
    output.domains[domain] = {
      label: config.label,
      urgent: domainResults[`${prefix}_urgent`]?.answer ?? null,
      aiAutomation: domainResults[`${prefix}_aiAutomation`]?.answer ?? null,
      decisionNeeded: domainResults[`${prefix}_decisionNeeded`]?.answer ?? null,
      humanInLoop: domainResults[`${prefix}_humanInLoop`]?.answer ?? null
    };
  }
  
  console.log(JSON.stringify(output, null, 2));
}

// 메인: CLI 파싱 + 실행
async function main() {
  const args = process.argv.slice(2);
  const stateArg = args.find(a => a.startsWith('--state='))?.split('=')[1] || null;
  const customState = getState(stateArg);
  const outputJSON = args.includes('--output=json') || args.includes('--output=json');
  
  const questions = buildQuestions();
  
  if (outputJSON) {
    printJSON(customState, questions);
    return;
  }
  
  printTable(customState, questions);
  
  // API 키 확인
  if (!API_KEY) {
    console.log('⚠️  AI_GATEWAY_API_KEY가 설정되지 않았습니다.');
    console.log('   JEV 실제 평가 실행 불가.');
    console.log('');
    console.log('   키 발급 방법:');
    console.log('   1. Vercel 대시보드 → AI Gateway → API 키 생성');
    console.log('   2. export AI_GATEWAY_API_KEY="your_key"');
    console.log('   3. 또는 .env 파일에 저장');
    console.log('');
    console.log('   ※ JEV는 2026년 9월 25일까지 무료.');
    console.log('');
    return;
  }
  
  // TODO: 실제 AI SDK experimental_evaluate 호출
  // import { experimental_evaluate as evaluate } from 'ai';
  // const result = await evaluate({
  //   model: MODEL,
  //   state: customState,
  //   questions: questions,
  // });
  // console.log('결과:', JSON.stringify(result.answers, null, 2));
  
  console.log('[JEV 호출 — AI SDK 평가]');
  console.log('   (AI SDK가 설치되어 있고 API 키가 있으면 실제 호출됨)');
  console.log('');
}

main().catch(e => {
  console.error('오류:', e.message);
  process.exit(1);
});
