FROM node:22-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js ./
COPY src ./src

USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/auth/me').then(r=>process.exit(r.status===401?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
