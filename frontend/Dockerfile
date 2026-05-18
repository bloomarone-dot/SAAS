FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci \
    --no-audit \
    --fund=false \
    --fetch-retries=5 \
    --fetch-retry-mintimeout=20000 \
    --fetch-retry-maxtimeout=120000 \
    --fetch-timeout=300000

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
