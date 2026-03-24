import { Client, Databases, Query } from 'node-appwrite';

// Server component — fetches data directly from Appwrite, no auth needed
async function getData() {
    const client = new Client()
        .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
        .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
        .setKey(process.env.APPWRITE_API_KEY!);
    const db = new Databases(client);
    const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

    const [postsRes, quotesRes, phrasesRes, usersRes] = await Promise.all([
        db.listDocuments(DB_ID, 'posts', [Query.limit(6), Query.orderDesc('createdAt')]),
        db.listDocuments(DB_ID, 'quotes', [Query.limit(6)]),
        db.listDocuments(DB_ID, 'savedPhrases', [Query.limit(6)]),
        db.listDocuments(DB_ID, 'users', [Query.limit(4)]),
    ]);

    return {
        posts: postsRes.documents,
        postsTotal: postsRes.total,
        quotes: quotesRes.documents,
        quotesTotal: quotesRes.total,
        phrases: phrasesRes.documents,
        phrasesTotal: phrasesRes.total,
        users: usersRes.documents,
        usersTotal: usersRes.total,
    };
}

export default async function TestUIPage() {
    const data = await getData();

    return (
        <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", maxWidth: 900, margin: '0 auto', padding: '40px 20px', background: '#fafafa', minHeight: '100vh' }}>
            <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 16, padding: 32, marginBottom: 24 }}>
                <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>🧪 Appwrite Migration — Visual Test</h1>
                <p style={{ color: '#666', fontSize: 14 }}>This page renders real data from Appwrite. Delete after testing.</p>
                <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
                    <Stat label="Posts" value={data.postsTotal} />
                    <Stat label="Quotes" value={data.quotesTotal} />
                    <Stat label="Phrases" value={data.phrasesTotal} />
                    <Stat label="Users" value={data.usersTotal} />
                </div>
            </div>

            {/* Posts / Articles */}
            <Section title="📰 Articles (Feed)" count={data.postsTotal}>
                {data.posts.map((post: any) => (
                    <Card key={post.$id}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                            {post.coverImage && (
                                <img 
                                    src={post.coverImage} 
                                    alt="" 
                                    style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                                />
                            )}
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                                    {post.source || 'Unknown source'} · {post.authorName || 'No author'}
                                </div>
                                <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 6px', lineHeight: 1.3 }}>
                                    {post.title || <span style={{ color: '#e11d48' }}>⚠️ MISSING TITLE</span>}
                                </h3>
                                <p style={{ fontSize: 13, color: '#555', margin: 0, lineHeight: 1.5 }}>
                                    {post.content 
                                        ? post.content.replace(/<[^>]*>?/gm, '').substring(0, 150) + '...'
                                        : <span style={{ color: '#e11d48' }}>⚠️ MISSING CONTENT</span>
                                    }
                                </p>
                                <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
                                    {post.content ? `${Math.ceil(post.content.length / 5)} words` : '0 words'} · ID: {post.$id.substring(0, 20)}
                                </div>
                            </div>
                        </div>
                    </Card>
                ))}
            </Section>

            {/* Quotes */}
            <Section title="💬 Quotes (Swiper)" count={data.quotesTotal}>
                {data.quotes.map((quote: any) => (
                    <Card key={quote.$id} style={{ background: '#1a1a2e', color: '#fff', border: 'none' }}>
                        <p style={{ fontSize: 16, fontStyle: 'italic', lineHeight: 1.6, margin: '0 0 12px' }}>
                            &ldquo;{(quote.text || '').substring(0, 200)}{(quote.text || '').length > 200 ? '...' : ''}&rdquo;
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 600 }}>
                                    {quote.author || <span style={{ color: '#f87171' }}>⚠️ UNKNOWN</span>}
                                </div>
                                <div style={{ fontSize: 12, color: '#888' }}>
                                    {quote.postTitle || <span style={{ color: '#f87171' }}>Untitled</span>}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                {quote.topic && (
                                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(255,255,255,0.1)', color: '#ccc' }}>
                                        {quote.topic}
                                    </span>
                                )}
                                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(255,255,255,0.1)', color: '#ccc' }}>
                                    {quote.sourceType}
                                </span>
                            </div>
                        </div>
                    </Card>
                ))}
            </Section>

            {/* Saved Phrases */}
            <Section title="📚 Saved Phrases (Vocab Bank)" count={data.phrasesTotal}>
                {data.phrases.map((phrase: any) => (
                    <Card key={phrase.$id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>
                                    {phrase.phrase || <span style={{ color: '#e11d48' }}>⚠️ MISSING</span>}
                                </h3>
                                <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
                                    {phrase.meaning || 'No meaning'}
                                </p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 11, color: '#888' }}>Step: {phrase.learningStep ?? '?'}</div>
                                <div style={{ fontSize: 11, color: '#888' }}>
                                    Next: {phrase.nextReviewDate ? new Date(phrase.nextReviewDate).toLocaleDateString() : 'N/A'}
                                </div>
                            </div>
                        </div>
                    </Card>
                ))}
            </Section>

            {/* Users */}
            <Section title="👤 Users" count={data.usersTotal}>
                {data.users.map((user: any) => (
                    <Card key={user.$id}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            {user.photoURL && (
                                <img src={user.photoURL} alt="" style={{ width: 40, height: 40, borderRadius: 20 }} />
                            )}
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 600 }}>{user.name || 'No name'}</div>
                                <div style={{ fontSize: 12, color: '#888' }}>{user.email}</div>
                            </div>
                        </div>
                    </Card>
                ))}
            </Section>

            <div style={{ textAlign: 'center', padding: 32, color: '#999', fontSize: 12 }}>
                ⚠️ DELETE this page after testing: <code>src/app/test-ui/page.tsx</code>
            </div>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: number }) {
    return (
        <div style={{ background: '#f5f5f5', padding: '12px 20px', borderRadius: 10, minWidth: 100 }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
            <div style={{ fontSize: 12, color: '#888' }}>{label}</div>
        </div>
    );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
    return (
        <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 16, padding: 24, marginBottom: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 16px' }}>
                {title} <span style={{ fontSize: 14, fontWeight: 400, color: '#888' }}>({count} total)</span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {children}
            </div>
        </div>
    );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <div style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: 12, padding: 16, ...style }}>
            {children}
        </div>
    );
}
