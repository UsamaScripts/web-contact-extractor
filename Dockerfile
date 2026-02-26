FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

EXPOSE 3000

ENV PLAYWRIGHT_BROWSERS_PATH=0
ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
