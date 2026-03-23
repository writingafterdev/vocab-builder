import { NextRequest, NextResponse } from 'next/server';
import { queryCollection, runQuery } from '@/lib/appwrite/database';

/**
 * Debug endpoint to test phrase queries
 * GET /api/admin/debug-phrases?userId=xxx
 */
export async function GET(request: NextRequest) {
    const userId = request.nextUrl.searchParams.get('userId') || '1vxOdywrkjaIGPipIIW1usfLi233';
    
    try {
        // Test 1: Raw list all savedPhrases (no filtering)
        const allPhrases = await queryCollection('savedPhrases');
        const userPhrases = allPhrases.filter(p => p.userId === userId);
        
        // Test 2: runQuery with userId filter
        let filteredPhrases: any[] = [];
        let filterError: string | null = null;
        try {
            filteredPhrases = await runQuery('savedPhrases', [
                { field: 'userId', op: 'EQUAL', value: userId }
            ], 5);
        } catch (err) {
            filterError = String(err);
        }
        
        // Sample first doc's raw fields
        const sampleDoc = userPhrases[0] || null;
        
        return NextResponse.json({
            test1_raw_list: {
                total_in_collection: allPhrases.length,
                matching_userId: userPhrases.length,
                sample_fields: sampleDoc ? {
                    id: sampleDoc.id,
                    phrase: sampleDoc.phrase,
                    userId: sampleDoc.userId,
                    createdAt_type: typeof sampleDoc.createdAt,
                    createdAt_value: sampleDoc.createdAt,
                    createdAt_isDate: sampleDoc.createdAt instanceof Date,
                    nextReviewDate_type: typeof sampleDoc.nextReviewDate,
                    nextReviewDate_value: sampleDoc.nextReviewDate,
                    nextReviewDate_isDate: sampleDoc.nextReviewDate instanceof Date,
                } : null,
            },
            test2_runQuery: {
                count: filteredPhrases.length,
                error: filterError,
                first: filteredPhrases[0] ? { id: filteredPhrases[0].id, phrase: filteredPhrases[0].phrase } : null,
            },
        });
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
