#!/bin/bash
# API Test Script - Tests all API routes
# Usage: ./test-apis.sh [user-id]

USER_ID="${1:-test-user-123}"
BASE_URL="http://localhost:3000"

echo "=================================="
echo "🧪 API ROUTE TEST SUITE"
echo "=================================="
echo "User ID: $USER_ID"
echo "Base URL: $BASE_URL"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
SKIPPED=0

# Test function
test_get() {
    local name="$1"
    local path="$2"
    echo -n "Testing GET $name... "
    response=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL$path" \
        -H "x-user-id: $USER_ID" \
        -H "Content-Type: application/json" 2>&1)
    
    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | sed '$d')
    
    if [[ "$http_code" =~ ^2 ]] || [[ "$http_code" == "400" ]] || [[ "$http_code" == "401" ]]; then
        echo -e "${GREEN}✓${NC} ($http_code)"
        ((PASSED++))
    else
        echo -e "${RED}✗${NC} ($http_code)"
        echo "  Response: $body"
        ((FAILED++))
    fi
}

test_post() {
    local name="$1"
    local path="$2"
    local data="$3"
    echo -n "Testing POST $name... "
    response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL$path" \
        -H "x-user-id: $USER_ID" \
        -H "Content-Type: application/json" \
        -d "$data" 2>&1)
    
    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | sed '$d')
    
    if [[ "$http_code" =~ ^2 ]] || [[ "$http_code" == "400" ]] || [[ "$http_code" == "401" ]]; then
        echo -e "${GREEN}✓${NC} ($http_code)"
        ((PASSED++))
    else
        echo -e "${RED}✗${NC} ($http_code)"
        echo "  Response: $body"
        ((FAILED++))
    fi
}

echo "=================================="
echo "📱 IMMERSIVE SESSION APIs"
echo "=================================="
test_get "immersive/eligible" "/api/immersive-session/eligible"
test_post "immersive/generate" "/api/immersive-session/generate" '{"mode":"reading"}'
test_post "immersive/complete" "/api/immersive-session/complete" '{"phrases":[],"correctCount":0,"totalQuestions":0,"mode":"reading"}'

echo ""
echo "=================================="
echo "📅 DAILY DRILL APIs"
echo "=================================="
test_get "daily-drill/weaknesses" "/api/daily-drill/weaknesses"
test_post "daily-drill/generate" "/api/daily-drill/generate" '{}'
test_post "daily-drill/complete" "/api/daily-drill/complete" '{"drillId":"test","results":[]}'

echo ""
echo "=================================="
echo "👤 USER APIs"
echo "=================================="
test_get "user/due-phrases" "/api/user/due-phrases"
test_get "user/phrase-limit" "/api/user/phrase-limit"
test_get "user/saved-phrases" "/api/user/saved-phrases"
test_get "user/get-proficiency" "/api/user/get-proficiency"
test_get "user/get-skills" "/api/user/get-skills"
test_get "user/get-sessions" "/api/user/get-sessions"
test_get "user/reading-lists" "/api/user/reading-lists"
test_get "user/xp-history" "/api/user/xp-history"
test_post "user/cluster-phrases" "/api/user/cluster-phrases" '{}'
test_post "user/generate-session" "/api/user/generate-session" '{"type":"quick_practice","phraseIds":[]}'
test_post "user/evaluate-practice" "/api/user/evaluate-practice" '{"questionId":"test","answer":"test"}'
test_post "user/save-phrase" "/api/user/save-phrase" '{"phrase":"test","meaning":"test","context":"test"}'
test_post "user/lookup-phrase" "/api/user/lookup-phrase" '{"phrase":"break the ice"}'
test_post "user/translate" "/api/user/translate" '{"text":"hello","targetLang":"vi"}'
test_post "user/earn-xp" "/api/user/earn-xp" '{"amount":10,"source":"test"}'

echo ""
echo "=================================="
echo "📖 CONTENT APIs"
echo "=================================="
test_get "dictionary" "/api/dictionary?word=test"
test_post "generate-meaning" "/api/generate-meaning" '{"phrase":"break the ice"}'
test_post "tts" "/api/tts" '{"text":"hello world"}'

echo ""
echo "=================================="
echo "🎯 PLACEMENT TEST APIs"
echo "=================================="
test_get "placement-test/tasks" "/api/placement-test/tasks"
test_post "placement-test/submit" "/api/placement-test/submit" '{"answers":[]}'

echo ""
echo "=================================="
echo "📊 SUMMARY"
echo "=================================="
TOTAL=$((PASSED + FAILED + SKIPPED))
echo -e "Total: $TOTAL"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo -e "${YELLOW}Skipped: $SKIPPED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    exit 1
fi
