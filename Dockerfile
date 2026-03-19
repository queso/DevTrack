FROM node:22-alpine

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# Patch reactive-swr exports to point at source (no dist/ in GitHub dep)
RUN node -e "\
  const fs = require('fs'); \
  const p = 'node_modules/reactive-swr/package.json'; \
  const pkg = JSON.parse(fs.readFileSync(p, 'utf8')); \
  pkg.exports['.'].import = './src/index.ts'; \
  pkg.exports['./testing'].import = './src/testing/index.ts'; \
  fs.writeFileSync(p, JSON.stringify(pkg, null, 2));"

COPY . .

RUN pnpm db:generate

EXPOSE 3000

CMD ["pnpm", "dev"]
