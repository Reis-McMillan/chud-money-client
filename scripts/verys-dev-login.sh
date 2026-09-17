#!/usr/bin/env sh
# Complete a Verys login locally without email.
#
# The compose Verys has no SMTP, so its login page cannot deliver a code. Verys
# stores the code before it tries to send, so this asks for one, reads it from
# Mongo, and prints the URL that finishes the login: opening it sets the Verys
# session cookies in that browser. Then go (back) to the app and it signs in
# without a code prompt.
#
#   scripts/verys-dev-login.sh [email]     (default: VERYS_DEV_EMAIL or dev@example.com)
set -eu

EMAIL="${1:-${VERYS_DEV_EMAIL:-dev@example.com}}"
VERYS="${VERYS_URL:-http://localhost:8080}"
cd "$(dirname "$0")/.."

# A 500 is expected here: the code is stored, the email attempt fails.
curl -s -o /dev/null -X POST "$VERYS/verification?email=$EMAIL" || true

CODE=$(docker compose exec -T mongo mongosh verys --quiet --eval \
  "const v = db.verification.findOne({ email: '$EMAIL', deleted: false }); print(v ? v.code : '')")
if [ -z "$CODE" ]; then
  echo "no verification code for $EMAIL: is that identity seeded (see scripts/verys-seed.js)?" >&2
  exit 1
fi

echo "Open this in the browser you use for the app (codes expire in 5 minutes):"
echo
echo "  $VERYS/verification?email=$EMAIL&code=$CODE"
echo
echo "then go to http://localhost:5173"
