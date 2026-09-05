FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./

# More reliable Railway install: avoid peer-dependency conflicts and npm audit overhead.
RUN npm install --omit=dev --legacy-peer-deps --no-audit --no-fund

COPY . .

EXPOSE 8000

CMD ["node", "index.js"]
