#!/bin/bash
# Exercise Flow End-to-End Test
# Tests the complete learning flow: Cluster → Generate → Answer → Evaluate → Complete

BASE_URL="http://localhost:3000"
TEST_USER="test-flow-user-$(date +%s)"

echo "🎓 Exercise Flow End-to-End Test"
echo "================================="
echo "Test User: $TEST_USER"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Sample phrases for testing
SAMPLE_PHRASES='[
  {
    "id": "phrase-1",
    "phrase": "break the ice",
    "meaning": "to initiate conversation in an awkward social situation",
    "register": "casual",
    "topic": "social_situations",
    "context": "At the networking event, she told a joke to break the ice."
  },
  {
    "id": "phrase-2", 
    "phrase": "get the ball rolling",
    "meaning": "to start something, especially a process or activity",
    "register": "casual",
    "topic": "business",
    "context": "Let me get the ball rolling by introducing the first speaker."
  },
  {
    "id": "phrase-3",
    "phrase": "bite the bullet",
    "meaning": "to endure a painful or difficult situation",
    "register": "casual",
    "topic": "decision_making",
    "context": "I knew I had to bite the bullet and tell her the truth."
  },
  {
    "id": "phrase-4",
    "phrase": "cut to the chase",
    "meaning": "to get to the main point without wasting time",
    "register": "casual",
    "topic": "communication",
    "context": "Lets cut to the chase - what do you really want?"
  },
  {
    "id": "phrase-5",
    "phrase": "hit the ground running",
    "meaning": "to start something and immediately work hard at it",
    "register": "consultative",
    "topic": "business",
    "context": "The new employee hit the ground running on her first day."
  }
]'

# ==========================================
# STEP 1: CLUSTER PHRASES
# ==========================================
echo -e "${CYAN}📊 STEP 1: Clustering Phrases${NC}"
echo "Grouping 5 sample phrases by semantic similarity..."
echo ""

CLUSTER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/user/cluster-phrases" \
  -H "Content-Type: application/json" \
  -H "x-user-id: $TEST_USER" \
  -H "x-user-email: test@example.com" \
  -d "{\"phrases\": $SAMPLE_PHRASES}")

echo "Response:"
echo "$CLUSTER_RESPONSE" | jq '.' 2>/dev/null || echo "$CLUSTER_RESPONSE"
echo ""

if echo "$CLUSTER_RESPONSE" | grep -q "clusters"; then
  echo -e "${GREEN}✓ Clustering successful${NC}"
else
  echo -e "${RED}✗ Clustering failed${NC}"
  echo "Continuing with manual grouping..."
fi
echo ""

# ==========================================
# STEP 2: LOOKUP PHRASE (Get enriched data)
# ==========================================
echo -e "${CYAN}📖 STEP 2: Lookup Phrase Details${NC}"
echo "Getting enriched data for 'break the ice'..."
echo ""

LOOKUP_RESPONSE=$(curl -s -X POST "$BASE_URL/api/user/lookup-phrase" \
  -H "Content-Type: application/json" \
  -H "x-user-id: $TEST_USER" \
  -H "x-user-email: test@example.com" \
  -d '{
    "phrase": "break the ice",
    "context": "At the networking event, she told a joke to break the ice."
  }')

echo "Response:"
echo "$LOOKUP_RESPONSE" | jq '.' 2>/dev/null || echo "$LOOKUP_RESPONSE"
echo ""

if echo "$LOOKUP_RESPONSE" | grep -q "meaning"; then
  echo -e "${GREEN}✓ Lookup successful${NC}"
else
  echo -e "${RED}✗ Lookup failed${NC}"
fi
echo ""

# ==========================================
# STEP 3: GENERATE READING CONTENT
# ==========================================
echo -e "${CYAN}📚 STEP 3: Generate Reading Content${NC}"
echo "Creating a reading passage with target phrases..."
echo ""

READING_RESPONSE=$(curl -s -X POST "$BASE_URL/api/user/generate-reading" \
  -H "Content-Type: application/json" \
  -H "x-user-id: $TEST_USER" \
  -H "x-user-email: test@example.com" \
  -d "{
    \"phrases\": $SAMPLE_PHRASES,
    \"mode\": \"reading\",
    \"difficulty\": \"intermediate\"
  }")

echo "Response (truncated):"
echo "$READING_RESPONSE" | jq '.content[:500] // .title // .error // .' 2>/dev/null || echo "${READING_RESPONSE:0:500}"
echo ""

if echo "$READING_RESPONSE" | grep -q -E "(content|title|story)"; then
  echo -e "${GREEN}✓ Reading generation successful${NC}"
else
  echo -e "${RED}✗ Reading generation failed${NC}"
fi
echo ""

# ==========================================
# STEP 4: GENERATE CONTEXTUAL EXERCISE
# ==========================================
echo -e "${CYAN}🎯 STEP 4: Generate Contextual Exercise${NC}"
echo "Creating an exercise based on phrases..."
echo ""

EXERCISE_REQUEST='{
  "phrases": [
    {
      "id": "phrase-1",
      "phrase": "break the ice",
      "meaning": "to initiate conversation in an awkward social situation",
      "register": "casual"
    }
  ],
  "questionType": "complete_dialogue",
  "difficulty": "intermediate"
}'

EXERCISE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/user/generate-contextual-exercise" \
  -H "Content-Type: application/json" \
  -H "x-user-id: $TEST_USER" \
  -H "x-user-email: test@example.com" \
  -d "$EXERCISE_REQUEST")

echo "Response:"
echo "$EXERCISE_RESPONSE" | jq '.' 2>/dev/null || echo "$EXERCISE_RESPONSE"
echo ""

if echo "$EXERCISE_RESPONSE" | grep -q -E "(question|exercise|content)"; then
  echo -e "${GREEN}✓ Exercise generation successful${NC}"
else
  echo -e "${YELLOW}? Exercise generation returned unexpected format${NC}"
fi
echo ""

# ==========================================
# STEP 5: EVALUATE USER RESPONSE
# ==========================================
echo -e "${CYAN}✅ STEP 5: Evaluate User Response${NC}"
echo "Simulating user answering a free response question..."
echo ""

EVAL_RESPONSE=$(curl -s -X POST "$BASE_URL/api/user/evaluate-response" \
  -H "Content-Type: application/json" \
  -H "x-user-id: $TEST_USER" \
  -H "x-user-email: test@example.com" \
  -d '{
    "questionType": "free_response",
    "userResponse": "I decided to break the ice by telling everyone about my weekend adventure.",
    "targetPhrase": "break the ice",
    "context": "Starting a conversation at a party"
  }')

echo "Response:"
echo "$EVAL_RESPONSE" | jq '.' 2>/dev/null || echo "$EVAL_RESPONSE"
echo ""

if echo "$EVAL_RESPONSE" | grep -q "correct"; then
  CORRECT=$(echo "$EVAL_RESPONSE" | jq -r '.correct')
  NATURALNESS=$(echo "$EVAL_RESPONSE" | jq -r '.naturalness // "N/A"')
  SCORE=$(echo "$EVAL_RESPONSE" | jq -r '.overallScore // "N/A"')
  echo -e "${GREEN}✓ Evaluation successful${NC}"
  echo "  Correct: $CORRECT"
  echo "  Naturalness: $NATURALNESS"
  echo "  Score: $SCORE"
else
  echo -e "${RED}✗ Evaluation failed${NC}"
fi
echo ""

# ==========================================
# STEP 6: EVALUATE PRACTICE (Full session)
# ==========================================
echo -e "${CYAN}📝 STEP 6: Evaluate Practice Session${NC}"
echo "Evaluating a complete practice answer..."
echo ""

PRACTICE_EVAL=$(curl -s -X POST "$BASE_URL/api/user/evaluate-practice" \
  -H "Content-Type: application/json" \
  -H "x-user-id: $TEST_USER" \
  -H "x-user-email: test@example.com" \
  -d '{
    "questionType": "free_response",
    "userAnswer": "She tried to break the ice with a funny story",
    "expectedPhrase": "break the ice",
    "context": "Making conversation at a networking event"
  }')

echo "Response:"
echo "$PRACTICE_EVAL" | jq '.' 2>/dev/null || echo "$PRACTICE_EVAL"
echo ""

if echo "$PRACTICE_EVAL" | grep -q -E "(score|result|correct|answer)"; then
  echo -e "${GREEN}✓ Practice evaluation successful${NC}"
else
  echo -e "${YELLOW}? Practice evaluation returned unexpected format${NC}"
fi
echo ""

# ==========================================
# STEP 7: SUGGEST COLLOCATIONS
# ==========================================
echo -e "${CYAN}🔤 STEP 7: Suggest Collocations${NC}"
echo "Getting related expressions for 'break'..."
echo ""

COLLOCATIONS=$(curl -s -X POST "$BASE_URL/api/user/suggest-collocations" \
  -H "Content-Type: application/json" \
  -H "x-user-id: $TEST_USER" \
  -H "x-user-email: test@example.com" \
  -d '{
    "word": "break",
    "context": "break the ice at a party"
  }')

echo "Response:"
echo "$COLLOCATIONS" | jq '.' 2>/dev/null || echo "$COLLOCATIONS"
echo ""

if echo "$COLLOCATIONS" | grep -q -E "(commonUsages|potentialUsages|usages)"; then
  echo -e "${GREEN}✓ Collocations successful${NC}"
else
  echo -e "${RED}✗ Collocations failed${NC}"
fi
echo ""

# ==========================================
# STEP 8: IMMERSIVE SESSION ELIGIBLE
# ==========================================
echo -e "${CYAN}🎮 STEP 8: Check Immersive Session Eligibility${NC}"
echo "Checking if user is eligible for immersive session..."
echo ""

ELIGIBLE=$(curl -s -X GET "$BASE_URL/api/immersive-session/eligible" \
  -H "Content-Type: application/json" \
  -H "x-user-id: $TEST_USER" \
  -H "x-user-email: test@example.com")

echo "Response:"
echo "$ELIGIBLE" | jq '.' 2>/dev/null || echo "$ELIGIBLE"
echo ""

if echo "$ELIGIBLE" | grep -q "eligible"; then
  IS_ELIGIBLE=$(echo "$ELIGIBLE" | jq -r '.eligible')
  echo -e "${GREEN}✓ Eligibility check successful (eligible: $IS_ELIGIBLE)${NC}"
else
  echo -e "${RED}✗ Eligibility check failed${NC}"
fi
echo ""

# ==========================================
# SUMMARY
# ==========================================
echo ""
echo "====================================="
echo "🎓 EXERCISE FLOW TEST COMPLETE"
echo "====================================="
echo ""
echo "Flow tested:"
echo "  1. Cluster phrases → Group by similarity"
echo "  2. Lookup phrase → Get enriched data"
echo "  3. Generate reading → Create learning content"
echo "  4. Generate exercise → Create questions"
echo "  5. Evaluate response → AI feedback on answers"
echo "  6. Evaluate practice → Session-level evaluation"
echo "  7. Suggest collocations → Related expressions"
echo "  8. Check eligibility → Immersive session access"
echo ""
echo -e "${GREEN}All key exercise APIs tested!${NC}"
