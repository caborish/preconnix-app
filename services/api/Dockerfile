# PreConnix API container. Build from the repository root:
#   docker build -f services/api/Dockerfile -t preconnix-api .
# Node runs the TypeScript sources directly (type stripping), so there is no build step.
FROM node:24.20.0-alpine
ENV NODE_ENV=production
# Chromium prints report PDFs for email attachments (src/pdf.ts); Liberation and Noto fonts stand in for Arial.
RUN apk add --no-cache chromium font-liberation font-noto && (test -x /usr/bin/chromium-browser || ln -s /usr/bin/chromium /usr/bin/chromium-browser)
ENV CHROME_PATH=/usr/bin/chromium-browser
WORKDIR /app

# Install only the API's runtime dependencies. npm needs every workspace manifest to check the lockfile.
COPY package.json package-lock.json ./
COPY packages/assessment-definitions/package.json packages/assessment-definitions/
COPY packages/assessment-engine/package.json packages/assessment-engine/
COPY packages/content/package.json packages/content/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY apps/mobile/package.json apps/mobile/
COPY services/api/package.json services/api/
RUN npm ci --workspace @preconnix/api --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

# Sources: the API and the shared packages it uses. No mobile app, admin console, legacy files or tests.
COPY packages/assessment-definitions packages/assessment-definitions
COPY packages/assessment-engine/src packages/assessment-engine/src
COPY packages/assessment-policies packages/assessment-policies
COPY packages/content/src packages/content/src
COPY services/api/src services/api/src

USER node
WORKDIR /app/services/api
EXPOSE 3000
CMD ["node", "src/main.ts"]
