// v0.3.0 검색 개선 테스트: 띄어쓰기·기호 무시, 여러 단어, 초성, 제목 우선 정렬.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchNotes, compactText, toChoseong } from '../public/js/model.js';
import { seedState } from '../public/js/seed.js';

const s = seedState();

test('비교용 글자: 띄어쓰기·기호·대소문자를 지운다', () => {
  assert.equal(compactText('  CI/CD 정리! '), 'cicd정리');
  assert.equal(compactText('p-값'), 'p값');
  assert.equal(compactText(null), '');
});

test('한글은 초성으로 바꾸고 다른 글자는 그대로 둔다', () => {
  assert.equal(toChoseong(compactText('브랜치 전략')), toChoseong(compactText('ㅂㄹㅊㅈㄹ')));
  assert.equal(toChoseong('git기초'), 'git' + toChoseong('기초'));
});

test('띄어쓰기가 달라도 찾는다', () => {
  assert.deepEqual(searchNotes(s, '브랜치전략'), ['n_branch']);
  assert.deepEqual(searchNotes(s, 'ci cd'), searchNotes(s, 'CI/CD'));
});

test('떨어져 있는 여러 단어가 모두 들어 있는 노트를 찾는다', () => {
  const ids = searchNotes(s, 'push 배포');
  assert.ok(ids.includes('n_cicd'));
  assert.ok(ids.includes('n_vercel'));
  assert.ok(!ids.includes('n_branch'));
});

test('한글 초성으로 찾는다', () => {
  assert.deepEqual(searchNotes(s, 'ㅂㄹㅊ'), ['n_branch']);
  assert.ok(searchNotes(s, 'ㅎㅊㅇㅋ').includes('n_howto'));
});

test('제목에서 찾은 노트가 본문에서만 찾은 노트보다 앞에 온다', () => {
  const ids = searchNotes(s, 'git');
  assert.equal(ids[0], 'n_git');
  assert.ok(ids.length > 1);
});

test('빈 검색어와 없는 단어는 결과가 없다', () => {
  assert.deepEqual(searchNotes(s, '  '), []);
  assert.deepEqual(searchNotes(s, '쿠버네티스'), []);
  assert.deepEqual(searchNotes(s, '!!!'), []);
});
