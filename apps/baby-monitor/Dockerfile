FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server server
COPY public public
USER 10000
EXPOSE 8080
CMD ["node", "server/index.js"]
