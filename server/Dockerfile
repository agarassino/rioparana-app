# build stage
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# runtime stage
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# 3000 public API (Traefik); 3100 owner admin, published on the tailnet IP only
EXPOSE 3000 3100
USER node
CMD ["node", "dist/index.js"]
