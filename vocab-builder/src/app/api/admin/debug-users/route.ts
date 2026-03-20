import { NextRequest, NextResponse } from 'next/server';
import { queryCollection } from '@/lib/firestore-rest';

/**
 * Debug: list all users
 * GET /api/admin/debug-users
 */
export async function GET(request: NextRequest) {
    const users = await queryCollection('users');
    return NextResponse.json({
        count: users.length,
        users: users.map(u => ({
            id: u.id,
            email: u.email,
            displayName: u.displayName || u.name,
        })),
    });
}
