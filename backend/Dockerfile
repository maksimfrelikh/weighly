FROM node:26-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM node:26-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# prisma.config.ts resolves DATABASE_URL while it loads, so even `generate` (which never connects)
# needs the variable to exist; this placeholder is never dialled.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate
RUN npm run build

FROM node:26-alpine AS runtime
WORKDIR /app
ARG BUILD_SHA=dev
ARG BUILT_AT=dev
ENV NODE_ENV=production
ENV BUILD_SHA=$BUILD_SHA
ENV BUILT_AT=$BUILT_AT
COPY package*.json ./
RUN npm install --omit=dev
# Prisma 7: the client is generated into src/generated and ships inside dist/; the CLI (`prisma`,
# a runtime dependency now) runs `migrate deploy` from the entrypoint and reads prisma.config.ts.
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start:prod"]
