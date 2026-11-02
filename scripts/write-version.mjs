// 빌드할 때 배포 버전 정보를 public/version.json에 쓴다.
// Vercel은 빌드 중에 VERCEL_GIT_COMMIT_SHA 같은 환경 변수를 준다. 로컬에서는 'local'로 쓴다.
import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const info = {
  version: pkg.version,
  commit: (process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7),
  message: (process.env.VERCEL_GIT_COMMIT_MESSAGE || '').split('\n')[0].slice(0, 80),
  env: process.env.VERCEL_ENV || 'local',
  builtAt: new Date().toISOString(),
};
writeFileSync(new URL('../public/version.json', import.meta.url), JSON.stringify(info, null, 2) + '\n');
console.log('version.json:', info);
