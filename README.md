# 하치위키 (Hachi Wiki)

하치와레와 함께 만드는 공부 지도. 공부 노트를 카드로 띄우고, 폴더로 묶고, 선으로 이어 나만의 지식 지도를 만드는 개인용 지식 관리(KMS) 웹 서비스다.

> 오픈소스SW개발방법및도구 HW2 (From Development to Deployment 1) 과제로 만들었다.

## 기능

| 기능 | 설명 |
|---|---|
| 노트 작성 | 왼쪽 편집 영역에서 마크다운으로 쓴다. 미리보기를 본다. |
| 카드 캔버스 | 오른쪽 캔버스에서 노트 카드를 끌어 옮긴다. 빈 곳을 끌면 화면이 움직이고, 휠로 확대·축소한다. |
| 폴더 | 카드를 폴더 안에 놓으면 같은 주제가 된다. 폴더의 빈 곳을 끌면 폴더가 움직이고, 안의 카드도 같이 움직인다. |
| 하위 폴더 | 폴더를 다른 폴더 안에 놓으면 하위 폴더가 된다. 바깥 폴더는 안의 내용에 맞춰 자동으로 커진다. (v0.2.0) |
| 연결선 | 카드나 폴더의 파란 점을 다른 카드나 폴더로 끌면 연결된다. 선과 화살표를 고르고 이름을 붙인다. (폴더 연결은 v0.2.0) |
| 연결된 노트 | 편집 영역 아래에 폴더와 연결된 노트 목록이 나온다. |
| 검색 | 제목과 내용으로 찾는다. 맞는 카드가 강조된다. |
| 하치와레 말풍선 | 저장, 연결, 폴더 정리를 하면 하치와레가 한 마디 한다. |
| 내보내기/가져오기 | 모든 데이터를 JSON 파일로 백업하고 다시 불러온다. |
| 배포 버전 표시 | 화면 아래에 지금 배포된 버전과 커밋이 보인다. |

노트는 브라우저(IndexedDB)에만 저장된다. 서버에는 노트를 보내지 않는다.

## DevOps 흐름

```
코드 수정 → git push ─┬→ GitHub Actions: 자동 테스트 (CI)
                      └→ Vercel: npm run build (테스트 + 버전 파일 생성)
                               ├─ 실패 → 배포하지 않는다. 기존 사이트가 그대로 동작한다.
                               └─ 통과 → 자동 배포 (CD) → 화면 아래 커밋 값이 바뀐다.
```

- `npm test`: Node.js 내장 테스트로 데이터 규칙을 확인한다. 설치할 패키지가 없다.
- `npm run build`: 테스트를 통과하면 `public/version.json`을 만든다. Vercel이 이 명령으로 빌드한다.
- `/api/health`: Vercel 서버 함수. 서버 상태와 배포된 커밋을 돌려준다.

## Docker CI/CD (HW3)

> 오픈소스SW개발방법및도구 HW3 (From Development to Deployment 2). Vercel 배포는 그대로 두고, 같은 코드를 Docker 이미지로 만들어 내 PC에 자동·무중단 배포한다.

```
git push (main)
  └→ GitHub Actions "CI" (ubuntu)
       ├─ Test: npm test
       └─ Build and push Docker image → Docker Hub  <user>/hachi-wiki:latest, :<commit>
            └→ GitHub Actions "Deploy" (Self-hosted Runner = 내 Windows PC)
                 ├─ Start availability monitor  (배포 전 정상 응답 확인, 1초 간격 실제 화면 요청)
                 ├─ Pull latest image
                 ├─ Replace running app container  (blue-green: 새 컨테이너 healthy → nginx 전환 → 옛 컨테이너 종료)
                 ├─ Keep monitoring for 30 seconds after deployment
                 └─ Write verification summary + Upload verification logs (Artifacts)

브라우저 → http://localhost:8080 → hachi-proxy (nginx) → hachi-blue 또는 hachi-green (node server.mjs :3000)
```

| 파일 | 역할 |
|---|---|
| `Dockerfile` | `node:22.23.3-alpine3.24` 고정. 빌드 중 `npm test`(서버 응답 테스트 포함)를 통과해야 이미지가 만들어진다. |
| `server.mjs` | 컨테이너 안 서버. `public/` 화면과 `/api/health`를 서비스하고, 모든 응답에 `X-App-Version`, `X-App-Commit`, `X-Served-By` 헤더를 붙인다. |
| `.github/workflows/ci.yml` | 테스트 → 이미지 빌드 → Docker Hub 업로드 (`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` Secrets 사용). PR에서는 업로드하지 않는다. |
| `.github/workflows/deploy.yml` | CI가 main push에서 성공하면 Self-hosted Runner에서 무중단 배포와 검증을 한다. PR로는 실행되지 않는다. |
| `deploy/deploy.ps1` | blue-green 교체. 새 컨테이너가 healthy가 아니거나 커밋이 다르면 전환하지 않고 기존 컨테이너가 계속 서비스한다. |
| `deploy/monitor.ps1` | 응답을 받으면 1초 쉬고 다음 요청. 요청마다 시각·응답 시간·HTTP 상태·화면 정상 여부·배포 버전을 기록한다. |
| `deploy/summary.ps1` | 배포 전·중·후 결과, 버전 전환, 실제 요청 간격, 가장 긴 공백을 Actions Summary에 정리한다. |

로컬에서 이미지만 시험할 때:

```bash
docker build --build-arg GIT_SHA=$(git rev-parse HEAD) -t hachi-wiki:dev .
docker run --rm -p 8080:3000 hachi-wiki:dev
```

## 로컬 실행

Node.js 20 이상과 Python 3이 필요하다.

```bash
npm test
npm run dev
```

브라우저에서 http://localhost:8000 을 연다. 로컬에서는 서버 함수(`/api/health`)가 없으므로 화면 아래에 "서버 함수 없음 (로컬)"이 보인다.

## 폴더 구조

```
public/            화면 파일 (Vercel이 그대로 배포)
  index.html
  style.css
  assets/          하치와레 그림
  js/
    app.js         화면 동작 (편집 영역, 캔버스, 말풍선)
    model.js       데이터 모델과 규칙 (테스트 대상)
    markdown.js    안전한 마크다운 변환 (테스트 대상)
    hachi.js       하치와레 말풍선 문구
    seed.js        첫 접속 예시 노트
    store.js       IndexedDB 저장
api/health.js      서버 상태 확인 함수 (Vercel)
server.mjs         Docker 컨테이너용 서버 (HW3)
Dockerfile         Docker 이미지 설계도 (HW3)
deploy/            무중단 배포·검증 스크립트 (HW3, Windows Self-hosted Runner)
tests/             자동 테스트
scripts/           빌드 스크립트 (버전 파일 생성)
.github/workflows/ GitHub Actions 설정 (ci.yml, deploy.yml)
vercel.json        Vercel 빌드 설정
```

## 저작권 안내

하치와레(치이카와) 캐릭터 그림의 저작권은 원작자 나가노(ナガノ)와 치이카와 제작위원회에 있다. 이 프로젝트는 수업 과제용 비상업 팬 프로젝트다. 권리자가 요청하면 그림을 바로 내린다.

코드는 자유롭게 참고해도 된다.
