// Docker 이미지 안에서 쓰는 서버(server.mjs)가 화면과 상태 확인을 제대로 돌려주는지 확인한다.
// Dockerfile이 빌드 중에 npm test를 돌리므로, 이 테스트가 실패하면 이미지가 만들어지지 않는다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.mjs';

const version = { version: '9.9.9', commit: 'abc1234', env: 'test', builtAt: null };
let server;
let base;

before(async () => {
  server = createServer({ version, name: 'test-container' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('첫 화면(/)은 하치위키 HTML을 돌려준다', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const html = await res.text();
  assert.match(html, /id="layout"/);
  assert.match(html, /하치위키/);
});

test('모든 응답에 배포 버전·커밋·컨테이너 이름 헤더가 붙는다', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.headers.get('x-app-version'), '9.9.9');
  assert.equal(res.headers.get('x-app-commit'), 'abc1234');
  assert.equal(res.headers.get('x-served-by'), 'test-container');
});

test('/api/health는 상태와 버전을 JSON으로 돌려준다', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.version, '9.9.9');
  assert.equal(body.commit, 'abc1234');
});

test('화면에 필요한 JS·CSS 파일을 알맞은 형식으로 준다', async () => {
  const js = await fetch(`${base}/js/app.js`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
  const css = await fetch(`${base}/style.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);
});

test('없는 파일은 404, 폴더 밖 파일은 열지 않는다', async () => {
  assert.equal((await fetch(`${base}/nope.txt`)).status, 404);
  const escape = await fetch(`${base}/..%2Fpackage.json`);
  assert.ok([403, 404].includes(escape.status));
});

test('GET/HEAD 말고 다른 요청은 받지 않는다', async () => {
  const res = await fetch(`${base}/`, { method: 'POST' });
  assert.equal(res.status, 405);
});
