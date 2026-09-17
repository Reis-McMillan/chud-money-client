# syntax=docker/dockerfile:1

# ---- build -----------------------------------------------------------------
# package.json engines: ^22.18.0 || >=24.12.0
FROM node:24-alpine AS build

WORKDIR /app

# Dependencies first so they cache separately from source changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines VITE_* at build time, so the deployment target is chosen here.
# Defaults follow the mcmlln.dev conventions in the deploy repo (SPA at
# chud-money.mcmlln.dev, API at api.chud-money.mcmlln.dev, Verys at
# api.verys.mcmlln.dev). Override with --build-arg for another environment.
# The client ids must match the OAuth clients registered in that Verys and
# the backend's CHUD_MONEY_API_CLIENT_ID; see .env.example.
ARG VITE_API_BASE=https://api.chud-money.mcmlln.dev
ARG VITE_VERYS_URL=https://api.verys.mcmlln.dev
ARG VITE_VERYS_CLIENT_ID=chud-money-spa
ARG VITE_CHUD_MONEY_CLIENT_ID=chud-money-api

# Type-checks and bundles (see package.json "build").
RUN npm run build

# ---- runtime ---------------------------------------------------------------
FROM nginx:1.27-alpine

# Under /etc/nginx/templates the image runs envsubst at start; nothing is
# substituted today, it just keeps the layout of the other SPAs.
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
