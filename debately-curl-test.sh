#!/usr/bin/env bash
# Debately backend smoke test — exercises every implemented endpoint in one
# realistic two-debater flow. Requires: curl only (no jq).
#
# Usage:
#   BASE_URL=http://localhost:4000 ./debately-curl-test.sh
#
# Prints each step and its HTTP status. Screenshot the terminal output for
# Chapter 4's testing evidence.
#
# NOTE: field extraction below is done with grep/sed instead of jq. It
# assumes flat "field":"value" pairs and grabs the first match, which is
# fine for this script's fixed response shapes but is not a general JSON
# parser -- don't reuse extract_field() on deeply nested or repeated keys
# without checking it grabs the right occurrence.

set -uo pipefail
BASE_URL="${BASE_URL:-http://localhost:4000}"
TS=$(date +%s)

pass() { echo "  ✅ $1"; }
fail() { echo "  ❌ $1"; }
step() { echo ""; echo "== $1 =="; }

check_status() {
  local expected="$1" actual="$2" label="$3"
  if [ "$actual" == "$expected" ]; then pass "$label ($actual)"; else fail "$label (expected $expected, got $actual)"; fi
}

# extract_field '<json body>' 'field_name' -> prints the first string value
# found for "field_name":"value" in the body, empty string if not found.
extract_field() {
  local body="$1" field="$2"
  echo "$body" | grep -o "\"$field\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/'
}

step "01 - Health check"
RESP=$(curl -s -w "\n%{http_code}" "$BASE_URL/health")
STATUS=$(echo "$RESP" | tail -1)
check_status 200 "$STATUS" "GET /health"

step "02 - Signup Debater A"
EMAIL_A="debater.a.$TS@debately.test"
USERNAME_A="debaterA$TS"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_A\",\"password\":\"TestPass123!\",\"username\":\"$USERNAME_A\"}")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check_status 201 "$STATUS" "POST /api/auth/signup (A)"
TOKEN_A=$(extract_field "$BODY" "token")
USER_ID_A=$(extract_field "$BODY" "id")

step "03 - Signup Debater B"
EMAIL_B="debater.b.$TS@debately.test"
USERNAME_B="debaterB$TS"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_B\",\"password\":\"TestPass123!\",\"username\":\"$USERNAME_B\"}")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check_status 201 "$STATUS" "POST /api/auth/signup (B)"
TOKEN_B=$(extract_field "$BODY" "token")
USER_ID_B=$(extract_field "$BODY" "id")

step "04 - Onboarding A + B"
# completeOnboarding ignores the request body entirely -- it just flips
# rules_accepted to true. No "interests" field exists on users, so nothing
# is sent here.
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/auth/onboarding" \
  -H "Authorization: Bearer $TOKEN_A")
check_status 200 "$STATUS" "POST /api/auth/onboarding (A)"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/auth/onboarding" \
  -H "Authorization: Bearer $TOKEN_B")
check_status 200 "$STATUS" "POST /api/auth/onboarding (B)"

step "05 - Create Debate (A)"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/debates/create" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN_A" \
  -d '{"topic":"This house believes AI will improve, not replace, human judgment"}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check_status 201 "$STATUS" "POST /api/debates/create"
ROOM_ID=$(extract_field "$BODY" "room_id")
DEBATE_ID=$(extract_field "$BODY" "id")

step "06 - List open debates (public)"
# getOpenDebates queries status='open', and a freshly created debate is
# status='open' by default -- this debate should actually appear here now.
RESP=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/debates/live")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check_status 200 "$STATUS" "GET /api/debates/live"
if echo "$BODY" | grep -q "\"room_id\":\"$ROOM_ID\""; then
  pass "created debate appears in open list"
else
  fail "created debate NOT found in open list"
fi

step "07 - Join Debate (B)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/debates/$ROOM_ID/join" \
  -H "Authorization: Bearer $TOKEN_B")
check_status 200 "$STATUS" "POST /api/debates/$ROOM_ID/join"

step "08 - Get Debate by Room ID"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/debates/$ROOM_ID" \
  -H "Authorization: Bearer $TOKEN_A")
check_status 200 "$STATUS" "GET /api/debates/$ROOM_ID"

step "09 - LiveKit room tokens (debaters only)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/livekit/$ROOM_ID/token" \
  -H "Authorization: Bearer $TOKEN_A")
check_status 200 "$STATUS" "GET /api/livekit/$ROOM_ID/token (A)"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/livekit/$ROOM_ID/token" \
  -H "Authorization: Bearer $TOKEN_B")
check_status 200 "$STATUS" "GET /api/livekit/$ROOM_ID/token (B)"

step "10 - End Debate (A)"
# endDebate does not accept or store winner_id -- the winner is decided by
# the AI verdict step, not declared here. No body needed.
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/debates/$ROOM_ID/end" \
  -H "Authorization: Bearer $TOKEN_A")
check_status 200 "$STATUS" "POST /api/debates/$ROOM_ID/end"

step "11 - Generate AI Verdict (A)"
echo "  ⚠️  Requires a valid OPENAI_API_KEY on the server."
echo "  ⚠️  fact_checks is still accepted raw from the client, not AI-generated."
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/verdicts/$ROOM_ID/generate" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN_A" \
  -d '{"transcript":"Debater A: AI systems can process more precedent and data than any human judge.\nDebater B: Consistency is not fairness -- biased training data reproduces human error at scale.","fact_checks":[]}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check_status 200 "$STATUS" "POST /api/verdicts/$ROOM_ID/generate"
WINNER_ID=$(extract_field "$BODY" "winner_id")
if [ -n "$WINNER_ID" ]; then
  pass "verdict.winner_id present ($WINNER_ID)"
else
  fail "verdict.winner_id missing from response"
fi

step "12 - Get Verdict"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/verdicts/$DEBATE_ID" \
  -H "Authorization: Bearer $TOKEN_A")
check_status 200 "$STATUS" "GET /api/verdicts/$DEBATE_ID"

step "13 - Profile endpoints"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/users/me" -H "Authorization: Bearer $TOKEN_A")
check_status 200 "$STATUS" "GET /api/users/me"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE_URL/api/users/me" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN_A" \
  -d '{"bio":"Test bio written during curl verification run."}')
check_status 200 "$STATUS" "PUT /api/users/me"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/users/$USERNAME_A")
check_status 200 "$STATUS" "GET /api/users/$USERNAME_A"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/users/recent-debates" -H "Authorization: Bearer $TOKEN_A")
check_status 200 "$STATUS" "GET /api/users/recent-debates"

step "14 - Signout"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/auth/signout" -H "Authorization: Bearer $TOKEN_A")
check_status 200 "$STATUS" "POST /api/auth/signout"

echo ""
echo "Done. Scroll up and screenshot the full output for Chapter 4."