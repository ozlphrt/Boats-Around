FROM node:18-alpine

WORKDIR /app

# Copy package files and install production dependencies
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy the proxy server
COPY proxy-server.cjs ./

# Expose the port
EXPOSE 3001

# Start the proxy server
CMD ["node", "proxy-server.cjs"]
