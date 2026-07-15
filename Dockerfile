# ==========================================
# Stage 1: Build React Frontend
# ==========================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app

# Copy package descriptors and install packages
COPY package.json ./
RUN npm install

# Copy source configurations and compile assets
COPY vite.config.js index.html ./
COPY public/ ./public/
COPY src/ ./src/
RUN npm run build

# ==========================================
# Stage 2: Express Server Production Runtime
# ==========================================
FROM node:20-alpine
WORKDIR /app

# Install native compilation dependencies for packages like sqlite3
RUN apk add --no-cache python3 make g++

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=5005
ENV DATABASE_DIR=/data
ENV UPLOADS_DIR=/data/uploads

# Expose port
EXPOSE 5005

# Copy package configurations and install production dependencies
COPY package.json ./
RUN npm install --omit=dev

# Copy backend scripts
COPY db.js server.js ./

# Copy built frontend assets from Stage 1
COPY --from=frontend-builder /app/dist ./dist

# Create persistence mount directories
RUN mkdir -p /data/uploads

# Run server on start
CMD ["node", "--use-system-ca", "server.js"]
