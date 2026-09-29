FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S holedo && adduser -S holedo -G holedo
COPY --from=build --chown=holedo:holedo /app/node_modules ./node_modules
COPY --from=build --chown=holedo:holedo /app/package.json ./package.json
COPY --from=build --chown=holedo:holedo /app/dist ./dist
COPY --from=build --chown=holedo:holedo /app/server ./server
USER holedo
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
STOPSIGNAL SIGTERM
CMD ["npm", "start"]
