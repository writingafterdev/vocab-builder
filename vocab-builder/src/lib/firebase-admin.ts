/**
 * Edge-compatible Firebase ID Token verification
 * Uses jose library instead of Firebase Admin SDK for Cloudflare Workers compatibility
 */
import * as jose from 'jose';

// Firebase project ID for token verification
const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

// Cache for Firebase public keys (JWKs)
let cachedKeys: jose.JWTVerifyGetKey | null = null;
let keysExpireAt = 0;

/**
 * Get Firebase public keys for JWT verification
 * Keys are cached and refreshed when expired
 */
async function getFirebasePublicKeys(): Promise<jose.JWTVerifyGetKey> {
    const now = Date.now();

    if (cachedKeys && now < keysExpireAt) {
        return cachedKeys;
    }

    // Fetch Google's public keys
    const response = await fetch(
        'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
    );

    if (!response.ok) {
        throw new Error('Failed to fetch Firebase public keys');
    }

    // Parse cache-control header to determine expiry
    const cacheControl = response.headers.get('cache-control');
    const maxAgeMatch = cacheControl?.match(/max-age=(\d+)/);
    const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 3600;
    keysExpireAt = now + (maxAge * 1000);

    const certsByKid = await response.json() as Record<string, string>;

    // Convert X509 certificates to CryptoKey objects
    const keyMap = new Map<string, CryptoKey>();
    for (const [kid, cert] of Object.entries(certsByKid)) {
        try {
            const publicKey = await jose.importX509(cert, 'RS256');
            keyMap.set(kid, publicKey);
        } catch (e) {
            console.error(`[Auth] Failed to import certificate for kid ${kid}:`, e);
        }
    }

    // Create a custom key getter that looks up by kid
    cachedKeys = async (protectedHeader: jose.JWSHeaderParameters) => {
        const kid = protectedHeader.kid;
        if (!kid) {
            throw new Error('Token missing kid header');
        }
        const key = keyMap.get(kid);
        if (!key) {
            throw new Error(`No key found for kid: ${kid}`);
        }
        return key;
    };

    return cachedKeys;
}

/**
 * Verify a Firebase ID token
 * Returns the decoded token payload or null if invalid
 * Accepts either:
 *   - Full auth header: "Bearer <token>"
 *   - Just the token: "<token>"
 */
export async function verifyIdToken(tokenOrHeader: string | null): Promise<{
    uid: string;
    email: string | undefined;
} | null> {
    if (!tokenOrHeader) {
        return null;
    }

    // Handle both formats: "Bearer <token>" or just "<token>"
    let token: string;
    if (tokenOrHeader.startsWith('Bearer ')) {
        token = tokenOrHeader.split('Bearer ')[1];
    } else {
        token = tokenOrHeader;
    }

    if (!FIREBASE_PROJECT_ID) {
        console.error('[Auth] FIREBASE_PROJECT_ID not configured');
        return null;
    }

    try {

        // Decode without verification first to get the header
        const header = jose.decodeProtectedHeader(token);

        // Fetch and cache public keys
        const keys = await getFirebasePublicKeys();

        // Verify the token
        const { payload } = await jose.jwtVerify(token, keys, {
            issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
            audience: FIREBASE_PROJECT_ID,
        });

        // Additional Firebase-specific validations
        if (!payload.sub || typeof payload.sub !== 'string') {
            console.error('[Auth] Token missing sub claim');
            return null;
        }

        // Check if token is not expired (jose does this, but double-check)
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
            console.error('[Auth] Token expired');
            return null;
        }

        // Check auth_time is in the past
        if (payload.auth_time && (payload.auth_time as number) > now) {
            console.error('[Auth] Invalid auth_time');
            return null;
        }

        return {
            uid: payload.sub,
            email: payload.email as string | undefined,
        };
    } catch (error) {
        console.error('[Auth] Token verification failed:', error);
        return null;
    }
}

/**
 * Helper to extract and verify auth from request
 * Returns user info or null if not authenticated
 */
export async function getAuthFromRequest(request: Request): Promise<{
    userId: string;
    userEmail: string;
} | null> {
    const authHeader = request.headers.get('Authorization');
    const verified = await verifyIdToken(authHeader);

    if (!verified) {
        return null;
    }

    return {
        userId: verified.uid,
        userEmail: verified.email || '',
    };
}
