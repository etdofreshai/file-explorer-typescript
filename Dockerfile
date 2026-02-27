# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY . .

# Build
RUN npm run build:client && npm run build:server

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Create directory for mounted volume (explore root)
RUN mkdir -p /explore

# Environment
ENV NODE_ENV=production
ENV PORT=3001
ENV EXPLORE_ROOT=/explore
# SERVE_APP_ROOT is no longer required: server defaults to dist/client/ relative to itself.
# Override only if you want to serve frontend from a custom path.
# ENV SERVE_APP_ROOT=/app/dist/client

# Start server
CMD ["node", "dist/server/index.js"]
