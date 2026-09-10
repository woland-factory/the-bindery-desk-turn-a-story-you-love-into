# Multi-stage build: compile the static SPA with Node, serve it with nginx.
# The final image carries only the built assets and nginx (no node_modules,
# no build cache), which keeps it well under the image-size budget.

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# SPA server config and the correct type for the sample EPUB.
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
# Runtime config is generated from env at container start (no secrets baked).
COPY docker/config.js.template /usr/share/nginx/html/config.js.template
COPY docker/40-bindery-config.sh /docker-entrypoint.d/40-bindery-config.sh
RUN chmod +x /docker-entrypoint.d/40-bindery-config.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
# The base image's entrypoint runs /docker-entrypoint.d/* then starts nginx.
