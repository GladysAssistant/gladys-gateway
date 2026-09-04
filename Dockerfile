# syntax=docker/dockerfile:1

# ---------- Build stage: install production dependencies ----------
FROM node:24-alpine AS build

WORKDIR /src

# Toolchain needed to compile the few optional native modules
RUN apk add --no-cache make gcc g++ python3 git

COPY package.json package-lock.json ./

# Reproducible install from the lockfile, production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Optionally refresh the GeoIP database at build time.
# The MaxMind key is read from a BuildKit secret, so it is never stored
# in an image layer, in the image config or visible via `docker inspect`.
# Build with: docker build --secret id=maxmind_license_key,env=MAX_MIND_LICENSE_KEY .
RUN --mount=type=secret,id=maxmind_license_key \
  if [ -s /run/secrets/maxmind_license_key ]; then \
    cd node_modules/geoip-lite && \
    LICENSE_KEY="$(cat /run/secrets/maxmind_license_key)" npm run-script updatedb; \
  fi

# ---------- Runtime stage ----------
FROM node:24-alpine

# Add tzdata for timezone settings
RUN apk add --no-cache tzdata

WORKDIR /src

COPY --chown=node:node --from=build /src/node_modules ./node_modules
COPY --chown=node:node . .

# Run as the unprivileged `node` user shipped with the base image
USER node

# Export listening port
EXPOSE 3000

CMD ["node", "index.js"]
