# Stage 1: Build the client assets and verify types
FROM node:24-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies (including devDependencies for build & typecheck)
RUN npm ci

# Copy application source files
COPY . .

# Run typecheck and build production client bundle
RUN npm run build

# Stage 2: Production runner
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built frontend bundle from builder
COPY --from=builder /app/dist/client ./dist/client

# Copy backend server and shared contracts
COPY src/server ./src/server
COPY src/shared ./src/shared
COPY tsconfig.json ./

EXPOSE 4000

# Start production server serving single-origin UI and API
CMD ["npm", "start"]
