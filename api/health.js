// Vercel 서버 함수: 서버 상태와 지금 배포된 커밋을 돌려준다.
// 주소: /api/health
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    status: 'ok',
    service: 'hachi-wiki',
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7),
    env: process.env.VERCEL_ENV || 'local',
    region: process.env.VERCEL_REGION || 'local',
    time: new Date().toISOString(),
  });
}
