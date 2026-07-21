FROM node:22-alpine AS build

# Render exposes service environment variables to Docker builds as build
# arguments. Declare and export the public hostname so Astro can include the
# exact Render proxy host in security.allowedDomains during compilation. This
# lets Astro reconstruct public URLs behind Render's HTTPS proxy.
ARG RENDER_EXTERNAL_HOSTNAME
ENV RENDER_EXTERNAL_HOSTNAME=${RENDER_EXTERNAL_HOSTNAME}

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run check && npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/db ./db
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src/data ./src/data
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 8080
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "./dist/server/entry.mjs"]
