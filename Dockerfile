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

# Create directories for mounted volumes
RUN mkdir -p /explore /app

# Environment
ENV NODE_ENV=production
ENV PORT=3001
ENV EXPLORE_ROOT=/explore
ENV SERVE_APP_ROOT=/app

# Start server
CMD ["node", "dist/server/index.js"]
