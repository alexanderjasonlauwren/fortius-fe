# syntax=docker/dockerfile:1

# Stage 1: Build the Vite React application
FROM node:22-alpine AS builder

WORKDIR /app

# Cache dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source files
COPY . .

# Build args for frontend environment configuration
ARG VITE_API_URL=/api/v1
ARG VITE_APP_TITLE="Admin Dashboard"
ARG VITE_MAP_TILE_URL=""
ARG VITE_MAP_TILE_ATTRIBUTION=""
ARG VITE_ROUTER_URL=""

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_TITLE=$VITE_APP_TITLE
ENV VITE_MAP_TILE_URL=$VITE_MAP_TILE_URL
ENV VITE_MAP_TILE_ATTRIBUTION=$VITE_MAP_TILE_ATTRIBUTION
ENV VITE_ROUTER_URL=$VITE_ROUTER_URL

# The production bundle currently exceeds Node's container-default heap while
# Rollup renders chunks. This affects only the disposable builder stage.
ENV NODE_OPTIONS=--max-old-space-size=1024

# Build production distribution
RUN npm run build

# Stage 2: Serve static bundle via Nginx
FROM nginx:1.30-alpine

# Remove default static files
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
