FROM oven/bun:1.1-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY src/ ./src/
COPY tsconfig.json ./

# Health check at container level
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]