#!/bin/sh
# Generate /config.js from environment at container start. Runs as part of the
# nginx image's standard entrypoint (before nginx launches). Unset variables
# render as empty strings, leaving that integration off. No secret is ever
# baked into the image; values arrive only here, at deploy time.
set -eu

: "${SENTRY_DSN:=}"
: "${UMAMI_URL:=}"
: "${UMAMI_WEBSITE_ID:=}"
export SENTRY_DSN UMAMI_URL UMAMI_WEBSITE_ID

TEMPLATE=/usr/share/nginx/html/config.js.template
OUT=/usr/share/nginx/html/config.js

envsubst '${SENTRY_DSN} ${UMAMI_URL} ${UMAMI_WEBSITE_ID}' <"$TEMPLATE" >"$OUT"
