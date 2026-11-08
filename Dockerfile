# 하치위키 Docker 이미지 설계도
# 기반 이미지는 정확한 버전으로 고정한다 (같은 Dockerfile이면 언제 빌드해도 같은 환경).
FROM node:22.23.3-alpine3.24

# 빌드 인자: GitHub Actions가 커밋 번호를 넘겨준다. 이 값이 화면과 /api/health에 표시된다.
ARG GIT_SHA=local
ENV NODE_ENV=production \
    PORT=3000 \
    APP_ENV=docker \
    GIT_SHA=${GIT_SHA}

WORKDIR /app

# 하치위키는 외부 패키지가 없어서 npm install 단계가 없다.
COPY package.json server.mjs ./
COPY scripts ./scripts
COPY tests ./tests
COPY public ./public

# 빌드 중 검증: 테스트(데이터 규칙 + 서버 응답)를 통과해야 이미지가 만들어진다.
# 통과하면 이 이미지의 버전·커밋을 version.json에 기록하고, 테스트 파일은 지운다.
RUN npm test \
 && node scripts/write-version.mjs \
 && rm -rf tests \
 && chown -R node:node /app/public

USER node
EXPOSE 3000

# Docker가 10초마다 서버 상태를 확인한다. 배포 스크립트는 이 값이 healthy가 될 때까지 기다린다.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.mjs"]
