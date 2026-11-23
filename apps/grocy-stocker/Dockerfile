FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
USER node
EXPOSE 8080
CMD ["node", "src/index.js"]
