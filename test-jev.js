const key = require('fs').readFileSync('.env', 'utf8').split('=')[1].trim();
console.log('키 접두사:', key.slice(0,7), '... (길이:', key.length, ')');
console.log('TypeSafe 직접 API 호출 시도...\n');

const endpoints = [
  'https://api.jevtypesafeai.com/api/v1/decide',
  'https://jevtypesafeai.com/api/v1/decide',
  'https://api.typesafe.ai/v1/decide',
  'https://api.jevtypesafeai.com/v1/decide'
];

async function tryEndpoints() {
  for (const url of endpoints) {
    console.log('시도:', url);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          state: { context: 'JEV 테스트 — GPT Bridge·Vercel 연동 확인' },
          questions: {
            q1: { type: 'boolean', question: 'JEV 연결이 정상 동작하는가?', criteria: { accept: '연결 성공' } }
          }
        })
      });
      const data = await resp.json();
      console.log('  HTTP 상태:', resp.status);
      console.log('  응답:', JSON.stringify(data, null, 2));
      if (resp.status === 200 && !data.error) {
        console.log('\n✅ 성공! JEV 연결 확인됨');
        return;
      }
      console.log('  ---');
    } catch(e) {
      console.log('  오류:', e.message);
      console.log('  ---');
    }
  }
  console.log('\n모든 엔드포인트 실패');
}

tryEndpoints().catch(e => console.log('예외:', e.message));
