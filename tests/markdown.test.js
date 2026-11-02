import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, firstLine } from '../public/js/markdown.js';
import { hachiLine, HACHI_EVENTS } from '../public/js/hachi.js';

test('HTML 태그는 실행되지 않고 글자로 보인다', () => {
  const html = renderMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)>');
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('javascript: 링크는 만들지 않는다', () => {
  const html = renderMarkdown('[눌러](javascript:alert(1))');
  assert.ok(!html.includes('<a'));
});

test('제목, 목록, 굵게, 코드를 변환한다', () => {
  const html = renderMarkdown('# 제목\n- **굵게**\n- `code`');
  assert.ok(html.includes('<h2>제목</h2>'));
  assert.ok(html.includes('<ul>'));
  assert.ok(html.includes('<strong>굵게</strong>'));
  assert.ok(html.includes('<code>code</code>'));
});

test('카드 미리보기는 제목 줄보다 내용 줄을 먼저 보여준다', () => {
  assert.equal(firstLine('\n# **DevOps**\n- **개발**과 운영'), '개발과 운영');
  assert.equal(firstLine('# 제목만 있음'), '제목만 있음');
});

test('하치와레는 모든 상황에 말할 거리가 있다', () => {
  for (const event of HACHI_EVENTS) assert.ok(hachiLine(event, { name: 'Git' }).length > 0);
  assert.equal(hachiLine('folderIn', { name: 'Git' }, () => 0), "'Git' 폴더에 넣었어. 친구가 생겼네.");
});
