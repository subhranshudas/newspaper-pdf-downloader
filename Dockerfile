FROM mcr.microsoft.com/playwright:v1.50.1-focal-node18

WORKDIR /app

# Create downloads directory
RUN mkdir -p /app/downloads

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy entire project
COPY . .

# Compile TypeScript
RUN npm run build

# Command to run the application
CMD ["npm", "start"]