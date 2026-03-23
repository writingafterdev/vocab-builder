import { NextResponse } from 'next/server';
import { queryCollection } from '@/lib/appwrite/database';
export async function GET() {
    try {
        const quizzes = await queryCollection('feedQuizzes', { where: [{ field: 'date', op: '==', value: '2026-03-19' }] });
        return NextResponse.json({ quizzes });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
