# Use Node.js LTS
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose port (MCP servers typically use stdio, but for HTTP we need a port)
EXPOSE 3000

# Start the server
CMD ["node", "dist/index.js"]