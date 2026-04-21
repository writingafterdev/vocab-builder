import { NextRequest, NextResponse } from 'next/server';
import {
    getAdminStats,
    getAllUsers,
    deletePost,
    bulkDeleteAllPosts,
    bulkDeleteAllArticles,
    getUserSavedPhrases,
    getUserScenarios,
    getUserPosts,
    getUserTokenUsage,
    getLearningCycleSettings,
    updateLearningCycleSettings,
    createPostWithComments,
    updatePost,
} from '@/lib/db/admin';
import { getTokenUsageStats, getDetailedTokenUsage } from '@/lib/db/token-tracking';

const ADMIN_EMAIL = 'ducanhcontactonfb@gmail.com';

function isAdmin(request: NextRequest): boolean {
    const email = request.headers.get('x-user-email') || '';
    return email === ADMIN_EMAIL;
}

/**
 * GET: Fetch admin data (stats, users, user details, learning settings)
 * POST: Admin mutations (delete post, bulk delete, update settings, create post)
 */
export async function GET(request: NextRequest) {
    if (!isAdmin(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    try {
        switch (action) {
            case 'stats': {
                const stats = await getAdminStats();
                return NextResponse.json(stats);
            }
            case 'users': {
                const users = await getAllUsers();
                return NextResponse.json({ users });
            }
            case 'user-phrases': {
                const userId = searchParams.get('userId') || '';
                const phrases = await getUserSavedPhrases(userId);
                return NextResponse.json({ phrases });
            }
            case 'user-scenarios': {
                const userId = searchParams.get('userId') || '';
                const scenarios = await getUserScenarios(userId);
                return NextResponse.json({ scenarios });
            }
            case 'user-posts': {
                const userId = searchParams.get('userId') || '';
                const posts = await getUserPosts(userId);
                return NextResponse.json({ posts });
            }
            case 'user-tokens': {
                const email = searchParams.get('email') || '';
                const tokens = await getUserTokenUsage(email);
                return NextResponse.json(tokens);
            }
            case 'learning-settings': {
                const settings = await getLearningCycleSettings();
                return NextResponse.json(settings);
            }
            case 'token-stats': {
                const days = parseInt(searchParams.get('days') || '30', 10);
                const stats = await getTokenUsageStats(days);
                return NextResponse.json(stats);
            }
            case 'token-detailed': {
                const limit = parseInt(searchParams.get('limit') || '100', 10);
                const todayOnly = searchParams.get('todayOnly') === 'true';
                const entries = await getDetailedTokenUsage(limit, todayOnly);
                return NextResponse.json({ entries });
            }
            default:
                return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
        }
    } catch (error) {
        console.error(`Admin GET error (${action}):`, error);
        return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    if (!isAdmin(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { action } = body;

    try {
        switch (action) {
            case 'delete-post': {
                await deletePost(body.postId);
                return NextResponse.json({ success: true });
            }
            case 'bulk-delete-posts': {
                const result = await bulkDeleteAllPosts();
                return NextResponse.json(result);
            }
            case 'bulk-delete-articles': {
                const result = await bulkDeleteAllArticles();
                return NextResponse.json(result);
            }
            case 'update-learning-settings': {
                await updateLearningCycleSettings(body.settings);
                return NextResponse.json({ success: true });
            }
            case 'create-post-with-comments': {
                const postId = await createPostWithComments(body.input);
                return NextResponse.json({ postId });
            }
            case 'update-post': {
                await updatePost(body.postId, body.data);
                return NextResponse.json({ success: true });
            }
            default:
                return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
        }
    } catch (error) {
        console.error(`Admin POST error (${action}):`, error);
        return NextResponse.json({ error: 'Failed to perform action' }, { status: 500 });
    }
}
