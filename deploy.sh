#!/bin/bash

# Production deployment script for Telegram Bot

set -e

echo "🚀 Starting production deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo -e "${RED}❌ .env.production file not found!${NC}"
    echo "Please create .env.production file with your production environment variables."
    exit 1
fi

# Load production environment
export $(cat .env.production | grep -v '^#' | xargs)

echo -e "${YELLOW}📋 Checking prerequisites...${NC}"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed!${NC}"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"

# Stop existing containers
echo -e "${YELLOW}🛑 Stopping existing containers...${NC}"
docker-compose -f docker-compose.yml --env-file .env.production down

# Remove old images (optional)
read -p "Do you want to remove old Docker images? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}🗑️ Removing old images...${NC}"
    docker system prune -f
fi

# Build and start services
echo -e "${YELLOW}🔨 Building and starting services...${NC}"
docker-compose -f docker-compose.yml --env-file .env.production up -d --build

# Wait for services to be healthy
echo -e "${YELLOW}⏳ Waiting for services to be healthy...${NC}"
sleep 30

# Check service health
echo -e "${YELLOW}🔍 Checking service health...${NC}"

# Check MongoDB
if docker-compose -f docker-compose.yml --env-file .env.production exec -T mongodb mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ MongoDB is healthy${NC}"
else
    echo -e "${RED}❌ MongoDB is not healthy${NC}"
fi

# Check App health
if docker-compose -f docker-compose.yml --env-file .env.production exec -T app wget --no-verbose --tries=1 --spider http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Application is healthy${NC}"
else
    echo -e "${RED}❌ Application is not healthy${NC}"
fi

# Show running containers
echo -e "${YELLOW}📊 Running containers:${NC}"
docker-compose -f docker-compose.yml --env-file .env.production ps

# Show logs
echo -e "${YELLOW}📝 Recent logs:${NC}"
docker-compose -f docker-compose.yml --env-file .env.production logs --tail=20

echo -e "${GREEN}🎉 Deployment completed!${NC}"
echo -e "${YELLOW}📱 Your Telegram bot is now running on production.${NC}"
echo -e "${YELLOW}🔍 Health check: docker-compose exec app wget --spider http://localhost:3000/health${NC}"