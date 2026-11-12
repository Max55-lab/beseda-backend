# Build from repo root: docker build -f beseda-backend/Dockerfile .
FROM node:22-alpine
WORKDIR /app
# copy backend
COPY beseda-backend/package*.json ./
RUN npm install --production
# copy backend code
COPY beseda-backend/ ./
# copy frontend build (must be built first: cd beseda && npm run build)
COPY beseda/dist ./public
EXPOSE 3002
ENV NODE_ENV=production
ENV PORT=3002
CMD ["node", "server.js"]