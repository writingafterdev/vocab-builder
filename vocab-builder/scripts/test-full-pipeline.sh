#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# Full End-to-End Pipeline Test
# Tests: Seed → Save phrases → Enrich → Feed quizzes → Session article → TTS → Cron
# ═══════════════════════════════════════════════════════════════════════


BASE="http://localhost:3000"
USER_ID="1vxOdywrkjaIGPipIIW1usfLi233"
CRON_SECRET="openssl rand -hex 32"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

pass() { echo -e "  ${GREEN}✅ $1${NC}"; }
fail() { echo -e "  ${RED}❌ $1${NC}"; FAILURES=$((FAILURES + 1)); }
info() { echo -e "  ${CYAN}ℹ  $1${NC}"; }
header() { echo -e "\n${BOLD}${YELLOW}═══ STEP $1: $2 ═══${NC}"; }

FAILURES=0
TOTAL=0

check() {
    TOTAL=$((TOTAL + 1))
    local label="$1"
    local status="$2"
    local body="$3"
    if [ "$status" -ge 200 ] && [ "$status" -lt 300 ]; then
        pass "$label (HTTP $status)"
        return 0
    else
        fail "$label (HTTP $status)"
        echo -e "    ${RED}Response: $(echo "$body" | head -c 200)${NC}"
        return 1
    fi
}

# ═══════════════════════════════════════
header "1" "Seed test phrases (due yesterday)"
# ═══════════════════════════════════════
RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/api/test/seed-scenario" \
    -H "Content-Type: application/json" \
    -H "x-user-id: $USER_ID")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "Seed scenario data" "$CODE" "$BODY"
info "$(echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('message',''))" 2>/dev/null || echo "$BODY")"

# ═══════════════════════════════════════
header "2" "Save a phrase via API (with AI topic assignment)"
# ═══════════════════════════════════════
RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/api/user/save-phrase" \
    -H "Content-Type: application/json" \
    -H "x-user-id: $USER_ID" \
    -d '{
        "phrase": "get the ball rolling",
        "meaning": "to start a process or activity",
        "context": "Let us get the ball rolling on this project.",
        "register": "casual",
        "nuance": "positive"
    }')
BODY=$(echo "$RESP" | sed '$d')
CODE=$(echo "$RESP" | tail -1)
check "Save phrase" "$CODE" "$BODY"
PHRASE_ID=$(echo "$BODY" | python3 -c "import json,sys; print(json.load(sys.stdin).get('phraseId',''))" 2>/dev/null)
info "Phrase ID: $PHRASE_ID"

# ═══════════════════════════════════════
header "3" "Enrich phrase — suggest collocations"
# ═══════════════════════════════════════
RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/api/user/suggest-collocations" \
    -H "Content-Type: application/json" \
    -H "x-user-id: $USER_ID" \
    -H "x-user-email: ducanhcontactonfb@gmail.com" \
    -d '{
        "word": "get the ball rolling",
        "context": "Let us get the ball rolling on this project."
    }')
BODY=$(echo "$RESP" | sed '$d')
CODE=$(echo "$RESP" | tail -1)
check "Suggest collocations" "$CODE" "$BODY"
USAGES=$(echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"{len(d.get('potentialUsages',[]))} usages, {len(d.get('commonUsages',[]))} collocations\")" 2>/dev/null)
info "Generated: $USAGES"

# ═══════════════════════════════════════
header "4" "Pre-generate feed quizzes (real-time)"
# ═══════════════════════════════════════
RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/api/exercise/pre-generate-feed-quizzes" \
    -H "Content-Type: application/json" \
    -H "x-user-id: $USER_ID")
BODY=$(echo "$RESP" | sed '$d')
CODE=$(echo "$RESP" | tail -1)
check "Pre-generate feed quizzes" "$CODE" "$BODY"
QUIZ_COUNT=$(echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"{len(d.get('questions',[]))} questions\")" 2>/dev/null)
info "Generated: $QUIZ_COUNT"

# ═══════════════════════════════════════
header "5" "Generate practice session article"
# ═══════════════════════════════════════
echo -e "  ${CYAN}⏳ This calls Grok AI and may take 30-60s...${NC}"
RESP=$(curl -s -w '\n%{http_code}' --max-time 120 -X POST "$BASE/api/practice/generate-session-article" \
    -H "Content-Type: application/json" \
    -H "x-user-id: $USER_ID")
BODY=$(echo "$RESP" | sed '$d')
CODE=$(echo "$RESP" | tail -1)
check "Generate session article" "$CODE" "$BODY"
SESSION_ID=$(echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"id={d.get('sessionId','?')}, sections={d.get('sectionCount','?')}, questions={d.get('questionCount','?')}, listening={d.get('isListeningDay','?')}\")" 2>/dev/null)
info "Session: $SESSION_ID"

# ═══════════════════════════════════════
header "6" "TTS — Single text"
# ═══════════════════════════════════════
RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/api/tts" \
    -H "Content-Type: application/json" \
    -d '{"text": "Getting the ball rolling on a new project can be challenging, but once you take that first step, momentum builds quickly."}' \
    -o /tmp/tts_pipeline_test.mp3)
CODE=$(echo "$RESP" | tail -1)
SIZE=$(wc -c < /tmp/tts_pipeline_test.mp3 2>/dev/null | tr -d ' ')
TOTAL=$((TOTAL + 1))
if [ "$CODE" -ge 200 ] && [ "$CODE" -lt 300 ] && [ "$SIZE" -gt 1000 ]; then
    pass "TTS single text (HTTP $CODE, ${SIZE} bytes)"
else
    fail "TTS single text (HTTP $CODE, ${SIZE} bytes)"
fi

# ═══════════════════════════════════════
header "7" "TTS — Multi-speaker conversation"
# ═══════════════════════════════════════
RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/api/tts" \
    -H "Content-Type: application/json" \
    -d '{"messages": [
        {"id": "m1", "speakerName": "Alice", "text": "We need to get the ball rolling on the Q3 strategy."},
        {"id": "m2", "speakerName": "Bob", "text": "Agreed. Let me take into account the latest market data first."}
    ]}' \
    -o /tmp/tts_conv_pipeline.json)
CODE=$(echo "$RESP" | tail -1)
BODY=$(cat /tmp/tts_conv_pipeline.json)
check "TTS conversation" "$CODE" "$BODY"
SEGMENTS=$(echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"{len(d.get('segments',[]))} segments\")" 2>/dev/null)
info "Generated: $SEGMENTS"

# ═══════════════════════════════════════
header "8" "Cron — Daily import (RSS + batch submit)"
# ═══════════════════════════════════════
RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/api/cron/daily-import" \
    -H "Authorization: Bearer $CRON_SECRET" \
    -H "Content-Type: application/json")
BODY=$(echo "$RESP" | sed '$d')
CODE=$(echo "$RESP" | tail -1)
check "Daily import cron" "$CODE" "$BODY"
IMPORT_SUMMARY=$(echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"imported={d.get('imported',0)}, articles_batch={d.get('batch',{}).get('articles',{})}, exercises_batch={d.get('batch',{}).get('exercises',{})}\")" 2>/dev/null)
info "Result: $IMPORT_SUMMARY"

# ═══════════════════════════════════════
header "9" "Cron — Pre-generate audio (listening days)"
# ═══════════════════════════════════════
RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/api/cron/pre-generate-audio" \
    -H "Authorization: Bearer $CRON_SECRET" \
    -H "Content-Type: application/json")
BODY=$(echo "$RESP" | sed '$d')
CODE=$(echo "$RESP" | tail -1)
check "Pre-generate audio cron" "$CODE" "$BODY"
AUDIO_SUMMARY=$(echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"users={d.get('totalUsers',0)}, generated={d.get('totalGenerated',0)}, errors={d.get('totalErrors',0)}\")" 2>/dev/null)
info "Result: $AUDIO_SUMMARY"

# ═══════════════════════════════════════
header "10" "Cron — Collect batch results"
# ═══════════════════════════════════════
RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/api/cron/collect-batch" \
    -H "Authorization: Bearer $CRON_SECRET" \
    -H "Content-Type: application/json")
BODY=$(echo "$RESP" | sed '$d')
CODE=$(echo "$RESP" | tail -1)
check "Collect batch results" "$CODE" "$BODY"
BATCH_SUMMARY=$(echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"processed={d.get('processed',0)} batch jobs\")" 2>/dev/null)
info "Result: $BATCH_SUMMARY"

# ═══════════════════════════════════════
echo -e "\n${BOLD}════════════════════════════════════════${NC}"
echo -e "${BOLD}  RESULTS: $((TOTAL - FAILURES))/$TOTAL passed${NC}"
if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}${BOLD}  🎉 ALL TESTS PASSED — Safe to deploy!${NC}"
else
    echo -e "${RED}${BOLD}  ⚠️  $FAILURES test(s) failed — review above${NC}"
fi
echo -e "${BOLD}════════════════════════════════════════${NC}\n"

# Cleanup
rm -f /tmp/tts_pipeline_test.mp3 /tmp/tts_conv_pipeline.json

exit $FAILURES
