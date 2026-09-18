# syntax=docker/dockerfile:1

# ---- build -----------------------------------------------------------------
# package.json engines: ^22.18.0 || >=24.12.0
FROM node:24-alpine AS build

WORKDIR /app

# Dependencies first so they cache separately from source changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# No VITE_* here on purpose: the bundle is environment-agnostic and reads its
# settings from /config.js at load time (see nginx.conf and src/config.ts).
# Type-checks and bundles (see package.json "build").
RUN npm run build

# ---- runtime ---------------------------------------------------------------
FROM nginx:1.27-alpine

# Under /etc/nginx/templates the image runs envsubst at start, which renders
# the variables below into the /config.js response.
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# Defaults follow the mcmlln.dev conventions in the deploy repo. Override on
# the container (docker run -e / Deployment env) for another environment. The
# client ids must match the OAuth clients registered in that Verys and the
# backend's CHUD_MONEY_API_CLIENT_ID; see .env.example.
ENV API_BASE=https://api.chud-money.mcmlln.dev \
    VERYS_URL=https://api.verys.mcmlln.dev \
    VERYS_CLIENT_ID=chud-money-spa \
    CHUD_MONEY_CLIENT_ID=chud-money-api

EXPOSE 8080
