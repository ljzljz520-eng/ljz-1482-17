FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm config set registry https://registry.npmmirror.com && npm install
COPY prisma ./prisma
RUN npx prisma generate

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 4000
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npm run seed && exec node src/server.js"]
