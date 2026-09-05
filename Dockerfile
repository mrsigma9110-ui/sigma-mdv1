FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8000

# Baileys 6.7.x pulls libsignal through a git dependency.
# Install git so npm can resolve that dependency during the build.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install --omit=dev --legacy-peer-deps --no-audit --no-fund

COPY . .

EXPOSE 8000

CMD ["node", "index.js"]
