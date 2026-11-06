# Production image: docker build -t tikla . && docker run -p 3000:3000 -v tikla-data:/app/data --env-file .env tikla
# The data/ volume holds the database, uploaded photos, backups and logs; keep it (and back it up) across image updates.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The build opens the database (sample products are seeded on import), so it gets a throwaway one, not the volume.
RUN STANDALONE=1 DB_PATH=/tmp/build.db npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 DB_PATH=/app/data/shop.db
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
RUN mkdir -p /app/data && chown node:node /app/data
USER node
VOLUME /app/data
EXPOSE 3000
CMD ["node", "server.js"]
