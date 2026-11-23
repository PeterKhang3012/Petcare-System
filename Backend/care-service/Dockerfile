FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY src ./src
COPY server.js ./
USER node
EXPOSE 3006
HEALTHCHECK --interval=15s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3006)+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
