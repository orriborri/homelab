FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server server
COPY public public
USER 10000
EXPOSE 8080
CMD ["node", "server/index.js"]
