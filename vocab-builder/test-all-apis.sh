#!/bin/bash
# Comprehensive API Test Suite
# Tests all AI-powered APIs in the vocab-builder project

BASE_URL="http://localhost:3000"
TEST_USER="test-user-123"
HEADERS="-H 'Content-Type: application/json' -H 'x-user-id: $TEST_USER' -H 'x-user-email: test@example.com'"

echo "🔬 VocabBuilder API Test Suite"
echo "=============================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0
SKIPPED=0

test_api() {
    local name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    local expected_field=$5
    
    echo -n "Testing $name... "
    
    if [ "$method" == "GET" ]; then
        response=$(curl -s -X GET "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -H "x-user-id: $TEST_USER" \
            -H "x-user-email: test@example.com" 2>/dev/null)
    else
        response=$(curl -s -X POST "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -H "x-user-id: $TEST_USER" \
            -H "x-user-email: test@example.com" \
            -d "$data" 2>/dev/null)
    fi
    
    # Check for errors
    if echo "$response" | grep -q '"error"'; then
        error=$(echo "$response" | jq -r '.error' 2>/dev/null)
        if [[ "$error" == "Authentication required" || "$error" == "Unauthorized" ]]; then
            echo -e "${YELLOW}⏭ SKIP (needs auth)${NC}"
            ((SKIPPED++))
        else
            echo -e "${RED}✗ FAIL: $error${NC}"
            ((FAILED++))
        fi
    elif echo "$response" | grep -q "$expected_field"; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((PASSED++))
    elif echo "$response" | grep -q "404"; then
        echo -e "${RED}✗ 404 Not Found${NC}"
        ((FAILED++))
    else
        echo -e "${YELLOW}? UNKNOWN RESPONSE${NC}"
        echo "  Response: $(echo "$response" | head -c 200)"
        ((FAILED++))
    fi
}

echo "📚 PUBLIC APIS (No Auth Required)"
echo "-----------------------------------"

# 1. Dictionary lookup
test_api "dictionary" "GET" "/api/dictionary?word=happy" "found"

# 2. Generate meaning (replaced with lookup-phrase but still exists)
test_api "generate-meaning" "POST" "/api/generate-meaning" \
    '{"phrase": "break the ice"}' "meaning"

# 3. TTS (Text to Speech)
echo -n "Testing tts... "
tts_status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/tts" \
    -H "Content-Type: application/json" \
    -d '{"text": "Hello", "voice": "en-US-GuyNeural"}')
if [ "$tts_status" == "200" ]; then
    echo -e "${GREEN}✓ PASS (returns audio)${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL (status: $tts_status)${NC}"
    ((FAILED++))
fi

echo ""
echo "👤 USER APIS (May Require Auth)"
echo "-----------------------------------"

# 4. Lookup phrase (comprehensive)
test_api "user/lookup-phrase" "POST" "/api/user/lookup-phrase" \
    '{"phrase": "get the ball rolling"}' "meaning"

# 5. Suggest collocations
test_api "user/suggest-collocations" "POST" "/api/user/suggest-collocations" \
    '{"word": "take", "context": "I need to take notes"}' "commonUsages"

# 6. Evaluate response (enhanced with social context)
test_api "user/evaluate-response" "POST" "/api/user/evaluate-response" \
    '{"questionType": "free_response", "userResponse": "I will break the ice", "targetPhrase": "break the ice", "context": "Starting a conversation"}' "correct"

# 7. Generate exercise
test_api "user/generate-exercise" "POST" "/api/user/generate-exercise" \
    '{"phrase": "break the ice", "meaning": "start a conversation", "register": "casual"}' "question"

# 8. Generate contextual exercise
test_api "user/generate-contextual-exercise" "POST" "/api/user/generate-contextual-exercise" \
    '{"phrases": [{"phrase": "break the ice", "meaning": "start conversation"}]}' "exercises"

# 9. Generate session
test_api "user/generate-session" "POST" "/api/user/generate-session" \
    '{"sessionType": "quick"}' "questions"

# 10. Generate practice
test_api "user/generate-practice" "POST" "/api/user/generate-practice" \
    '{"mode": "quick"}' "questions"

# 11. Generate reading
test_api "user/generate-reading" "POST" "/api/user/generate-reading" \
    '{"phrases": [{"phrase": "break the ice"}], "mode": "reading"}' "content"

# 12. Generate active question
test_api "user/generate-active-question" "POST" "/api/user/generate-active-question" \
    '{"phrase": "break the ice", "meaning": "start a conversation"}' "question"

# 13. Cluster phrases
test_api "user/cluster-phrases" "POST" "/api/user/cluster-phrases" \
    '{"phrases": [{"phrase": "happy"}, {"phrase": "joyful"}]}' "clusters"

# 14. Evaluate exercise
test_api "user/evaluate-exercise" "POST" "/api/user/evaluate-exercise" \
    '{"questionId": "test", "answer": "break the ice", "correctAnswer": "break the ice"}' "correct"

# 15. Evaluate practice
test_api "user/evaluate-practice" "POST" "/api/user/evaluate-practice" \
    '{"response": "I broke the ice", "expectedPhrase": "break the ice"}' "score"

# 16. Due phrases
test_api "user/due-phrases" "GET" "/api/user/due-phrases" "" "phrases"

# 17. Phrase limit
test_api "user/phrase-limit" "GET" "/api/user/phrase-limit" "" "limit"

echo ""
echo "📖 IMMERSIVE SESSION APIS"
echo "-----------------------------------"

# 18. Immersive eligible
test_api "immersive-session/eligible" "GET" "/api/immersive-session/eligible" "" "eligible"

# 19. Immersive generate
test_api "immersive-session/generate" "POST" "/api/immersive-session/generate" \
    '{"mode": "reading"}' "content"

# 20. Immersive complete
test_api "immersive-session/complete" "POST" "/api/immersive-session/complete" \
    '{"mode": "reading", "phraseIds": [], "results": []}' "success"

echo ""
echo "🎯 DAILY DRILL APIS"
echo "-----------------------------------"

# 21. Daily drill weaknesses
test_api "daily-drill/weaknesses" "GET" "/api/daily-drill/weaknesses" "" "weaknesses"

# 22. Daily drill generate
test_api "daily-drill/generate" "POST" "/api/daily-drill/generate" \
    '{"mode": "quick"}' "questions"

# 23. Daily drill complete
test_api "daily-drill/complete" "POST" "/api/daily-drill/complete" \
    '{"results": [], "duration": 60}' "success"

echo ""
echo "📝 PLACEMENT TEST APIS"
echo "-----------------------------------"

# 24. Placement test tasks
test_api "placement-test/tasks" "GET" "/api/placement-test/tasks" "" "tasks"

# 25. Placement test submit
test_api "placement-test/submit" "POST" "/api/placement-test/submit" \
    '{"answers": []}' "result"

echo ""
echo "🔧 ADMIN APIS (Usually Require Auth)"
echo "-----------------------------------"

# 26. Extract phrases
test_api "admin/extract-phrases" "POST" "/api/admin/extract-phrases" \
    '{"content": "The quick brown fox jumps over the lazy dog."}' "phrases"

# 27. Process article
test_api "admin/process-article" "POST" "/api/admin/process-article" \
    '{"url": "https://example.com/article"}' "article"

# 28. Translate
test_api "admin/translate" "POST" "/api/admin/translate" \
    '{"text": "Hello world", "targetLang": "vi"}' "translation"

# 29. Generate caption
test_api "admin/generate-caption" "POST" "/api/admin/generate-caption" \
    '{"title": "Test Article", "summary": "A test article about testing"}' "caption"

echo ""
echo "====================================="
echo "📊 TEST RESULTS"
echo "====================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo -e "${YELLOW}Skipped (auth required): $SKIPPED${NC}"
echo ""
TOTAL=$((PASSED + FAILED + SKIPPED))
echo "Total: $TOTAL APIs tested"

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All accessible APIs working!${NC}"
else
    echo -e "${YELLOW}⚠ Some APIs need attention${NC}"
fi
