# Build Stage for Frontend
FROM node:20-alpine AS builder-web
RUN npm install -g npm@10.8.2
WORKDIR /app
COPY refer/re_sekai-calculator/ refer/re_sekai-calculator/

WORKDIR /app
COPY web/ web/
WORKDIR /app/web
# Set API URL empty to allow relative fetching
ENV NEXT_PUBLIC_API_URL=
RUN npm ci
RUN ls -la /app/refer/re_sekai-calculator/src/index.ts
RUN npm run build:next

# Build Stage for Backend
FROM golang:1.23-alpine AS builder-go
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY internal ./internal
COPY main.go .
RUN go build -o server main.go

# Runtime Stage
FROM node:20-alpine
WORKDIR /app

# Copy Backend
COPY --from=builder-go /app/server ./server

# Copy Next.js Standalone Server
COPY --from=builder-web /app/web/.next/standalone ./nextjs/
COPY --from=builder-web /app/web/.next/static ./nextjs/web/.next/static
COPY --from=builder-web /app/web/public ./nextjs/web/public

# Copy Master Data
COPY data/ ./data/

# Install certs for external API calls from backend
RUN apk add --no-cache ca-certificates

# Create startup script that runs both servers
RUN printf '#!/bin/sh\n\
    # Start Next.js standalone server on port 3000\n\
    cd /app/nextjs/web && node server.js &\n\
    NEXTJS_PID=$!\n\
    \n\
    # Start Go API server on port 8080\n\
    cd /app && ./server &\n\
    GO_PID=$!\n\
    \n\
    # Wait for either process to exit\n\
    wait -n $NEXTJS_PID $GO_PID\n\
    exit $?\n' > /app/start.sh && chmod +x /app/start.sh

# Go server runs on 8080, Next.js on 3000
EXPOSE 8080 3000

CMD ["/app/start.sh"]
