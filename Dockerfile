# Stage 1: Build the CLI binary
FROM debian:bookworm-slim AS builder

# Install dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js, pnpm and bun
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm@10.16.0 \
    && curl -fsSL https://bun.sh/install | bash

# Add bun to PATH
ENV PATH="/root/.bun/bin:${PATH}"

# Clone the repository
WORKDIR /app
COPY . .

# Build the monorepo
RUN pnpm install
RUN pnpm build

# Build the CLI binary
WORKDIR /app/packages/cli
RUN pnpm build:bin

# Stage 2: Create a minimal runtime image
FROM debian:bookworm-slim

# Copy the CLI binary from the builder stage
COPY --from=builder /app/packages/cli/dist/composio /composio

# Make the binary executable
RUN chmod +x /composio

# Create directory for user data
WORKDIR /root/.composio

# Set the entrypoint
ENTRYPOINT ["/composio", "--version"]
