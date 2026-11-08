// 빌드할 때 배포 버전 정보를 public/version.json에 쓴다.
// Vercel은 빌드 중에 VERCEL_GIT_COMMIT_SHA 같은 환경 변수를 준다.
// Docker 빌드는 GIT_SHA, APP_ENV를 빌드 인자로 넘긴다(Dockerfile 참고). 로컬에서는 'local'로 쓴다.
import { readFileSync, writeFileSync } from 'node:fs';

const env = process.env;
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const info = {
  version: pkg.version,
  commit: (env.VERCEL_GIT_COMMIT_SHA || env.GIT_SHA || 'local').slice(0, 7),
  message: (env.VERCEL_GIT_COMMIT_MESSAGE || '').split('\n')[0].slice(0, 80),
  env: env.VERCEL_ENV || env.APP_ENV || 'local',
  builtAt: new Date().toISOString(),
};
writeFileSync(new URL('../public/version.json', import.meta.url), JSON.stringify(info, null, 2) + '\n');
console.log('version.json:', info);
