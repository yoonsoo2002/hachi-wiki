// Docker 컨테이너 안에서 하치위키를 서비스하는 작은 서버 (추가 패키지 없음).
// Vercel이 해 주던 두 가지를 대신한다: public/ 화면 파일 서비스, /api/health 상태 확인.
// 모든 응답에 배포 버전·커밋·컨테이너 이름을 헤더로 붙인다 → 무중단 재배포 검증에 쓴다.
import { createServer as createHttpServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostname } from 'node:os';

const ROOT = fileURLToPath(new URL('./public/', import.meta.url));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

export function readVersion(root = ROOT) {
  try {
    return JSON.parse(readFileSync(join(root, 'version.json'), 'utf8'));
  } catch {
    return { version: '0.0.0', commit: 'local', env: 'local', builtAt: null };
  }
}

export function createServer({ root = ROOT, version = readVersion(root), name = hostname() } = {}) {
  const started = new Date().toISOString();

  function headers(type, noStore) {
    return {
      'Content-Type': type,
      'Cache-Control': noStore ? 'no-store' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'X-App-Version': version.version,
      'X-App-Commit': version.commit,
      'X-Served-By': name,
    };
  }

  return createHttpServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { ...headers('text/plain; charset=utf-8', true), Allow: 'GET, HEAD' });
      res.end('Method Not Allowed');
      return;
    }

    if (url.pathname === '/api/health') {
      res.writeHead(200, headers('application/json; charset=utf-8', true));
      res.end(JSON.stringify({
        status: 'ok',
        service: 'hachi-wiki',
        version: version.version,
        commit: version.commit,
        env: version.env,
        container: name,
        startedAt: started,
        time: new Date().toISOString(),
      }));
      return;
    }

    // 경로 정리: /../ 같은 탈출을 막고, 폴더 주소는 index.html로 보낸다.
    let path;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      path = '/';
    }
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(normalize(root.endsWith(sep) ? root : root + sep))) {
      res.writeHead(403, headers('text/plain; charset=utf-8', true));
      res.end('Forbidden');
      return;
    }

    try {
      const info = await stat(file);
      if (!info.isFile()) throw new Error('not a file');
      const body = await readFile(file);
      const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, headers(type, path === '/version.json'));
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404, headers('text/plain; charset=utf-8', true));
      res.end('Not Found');
    }
  });
}

// node server.mjs 로 직접 실행했을 때만 서버를 켠다 (테스트에서는 import만 한다).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT) || 3000;
  const server = createServer();
  server.listen(port, () => {
    const v = readVersion();
    console.log(`hachi-wiki v${v.version} (${v.commit}) listening on :${port}`);
  });

  // 컨테이너를 끌 때(docker stop) 받던 요청은 끝까지 처리하고 닫는다 → 무중단 교체에 필요.
  const shutdown = (signal) => {
    console.log(`${signal} received, closing server`);
    server.close(() => process.exit(0));
    server.closeIdleConnections?.();
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
