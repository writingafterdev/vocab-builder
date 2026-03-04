import { NextRequest, NextResponse } from "next/server";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuthFromRequest } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
    try {
        const authResult = await getAuthFromRequest(req);
        if (!authResult) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = authResult.userId;

        const body = await req.json();
        const { correctIds, incorrectIds, score, date } = body;

        if (!Array.isArray(correctIds) || !Array.isArray(incorrectIds)) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        const db = getFirestore();
        const userRef = db.collection("users").doc(userId);
        const savedPhrasesRef = userRef.collection("savedPhrases");
        const batch = db.batch();

        const now = FieldValue.serverTimestamp();

        // Very basic SM-2 style adjustment for arcade 
        // Real SM-2 should be a function of EFactor, but for fast arcade:
        // Correct: increase learning Step, push next review out.
        // Incorrect: drop learning step to 0 or 1, next review is now.

        // Update correct phrases
        for (const pid of correctIds) {
            batch.update(savedPhrasesRef.doc(pid), {
                usageCount: FieldValue.increment(1),
                learningStep: FieldValue.increment(1),
                nextReviewDate: buildNextReviewDate(1), // Rough placeholder: push it out arbitrarily based on a step increment
                lastReviewedAt: now,
            });
        }

        // Update incorrect phrases
        for (const pid of incorrectIds) {
            batch.update(savedPhrasesRef.doc(pid), {
                learningStep: 1, // reset step
                nextReviewDate: now, // Due immediately
                lastReviewedAt: now,
            });

            // Log to weaknesses (reusing existing logic from update-practice-result potentially)
            batch.set(userRef.collection("weaknesses").doc(pid), {
                phraseId: pid,
                lastFailedAt: now,
                failureCount: FieldValue.increment(1),
                concept: "Meaning recall (Arcade)"
            }, { merge: true });
        }

        // Save daily arcade score
        if (score > 0) {
            const progRef = userRef.collection("dailyProgress").doc(date);
            batch.set(progRef, {
                arcadeScore: FieldValue.increment(score),
                arcadePlays: FieldValue.increment(1),
                lastPlayedAt: now
            }, { merge: true });
        }

        await batch.commit();

        return NextResponse.json({ success: true, updated: correctIds.length + incorrectIds.length });

    } catch (error) {
        console.error("Arcade update error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// Very basic helper for pushing out review dates without a full SM-2 implementation on hand
function buildNextReviewDate(stepIncrement: number) {
    const d = new Date();
    // In a real scenario we'd query current step and do 1->3 days, 3->7 days.
    // Here we just add 3 days as a crude successful review bump.
    d.setDate(d.getDate() + 3);
    return d;
}
