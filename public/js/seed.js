// 첫 접속 때 넣는 예시 데이터. 방문자가 빈 화면 대신 완성된 지도를 본다.

export function seedState() {
  const now = Date.now();
  return {
    version: 1,
    folders: [
      { id: 'f_devops', name: 'DevOps', x: 40, y: 40, w: 520, h: 330, color: 'blue' },
      { id: 'f_git', name: 'Git', x: 640, y: 40, w: 300, h: 330, color: 'pink' },
    ],
    notes: [
      {
        id: 'n_devops', title: 'DevOps란?', folderId: 'f_devops', x: 70, y: 100, updatedAt: now,
        body: '# DevOps\n개발(Dev)과 운영(Ops)을 하나의 흐름으로 묶는 방식이다.\n\n- 코드를 자주, 작게 올린다.\n- 테스트와 배포를 **자동화**한다.\n- 운영 중 문제를 빨리 발견한다.',
      },
      {
        id: 'n_cicd', title: 'CI/CD 정리', folderId: 'f_devops', x: 320, y: 250, updatedAt: now,
        body: '# CI/CD\n- **CI**: 코드를 올릴 때마다 자동으로 테스트한다.\n- **CD**: 테스트를 통과한 코드를 자동으로 배포한다.\n\n하치위키도 `git push`를 하면 자동으로 배포된다.',
      },
      {
        id: 'n_git', title: 'Git 기초', folderId: 'f_git', x: 690, y: 100, updatedAt: now,
        body: '# Git\n파일의 변경 기록을 남기는 도구다.\n\n1. `git add` 로 올릴 파일을 고른다.\n2. `git commit` 으로 기록을 남긴다.\n3. `git push` 로 GitHub에 올린다.',
      },
      {
        id: 'n_branch', title: '브랜치 전략', folderId: 'f_git', x: 690, y: 250, updatedAt: now,
        body: '# 브랜치\n작업을 나누어 하는 갈래다.\n\n- `main`: 배포되는 코드\n- 기능 브랜치: 새 기능을 만드는 곳',
      },
      {
        id: 'n_vercel', title: 'Vercel 배포', folderId: null, x: 340, y: 450, updatedAt: now,
        body: '# Vercel\nGitHub 저장소와 연결하면 push할 때마다 자동으로 배포해 주는 서비스다.\n\n> 무료 플랜으로 개인 프로젝트를 올릴 수 있다.',
      },
      {
        id: 'n_howto', title: '하치위키 사용법', folderId: null, x: 720, y: 450, updatedAt: now,
        body: '# 사용법\n1. 카드를 끌어서 옮긴다.\n2. 카드를 폴더 안에 놓으면 같은 주제가 된다.\n3. 카드 오른쪽의 **파란 점**을 다른 카드로 끌면 연결된다.\n4. 연결선을 누르면 선과 화살표를 바꿀 수 있다.\n\n노트는 이 브라우저에만 저장된다. 가끔 **내보내기**로 백업하자.',
      },
    ],
    edges: [
      { id: 'e_1', from: 'n_git', to: 'n_devops', kind: 'arrow', label: '먼저 배우기' },
      { id: 'e_2', from: 'n_devops', to: 'n_cicd', kind: 'arrow', label: '' },
      { id: 'e_3', from: 'n_cicd', to: 'n_vercel', kind: 'line', label: '예시' },
      { id: 'e_4', from: 'n_git', to: 'n_branch', kind: 'line', label: '' },
    ],
  };
}
