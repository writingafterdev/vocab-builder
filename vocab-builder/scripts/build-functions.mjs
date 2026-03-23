import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function buildFunctions() {
    console.log('Bundling Appwrite Background Jobs...');

    try {
        await esbuild.build({
            entryPoints: [path.join(__dirname, '../appwrite-functions/background-jobs/src/index.ts')],
            bundle: true,
            minify: true, // Compress for faster cloud init
            platform: 'node',
            target: 'node18',
            outfile: path.join(__dirname, '../appwrite-functions/background-jobs/dist/index.js'),
            // Appwrite environment doesn't need to bundle native node modules
            external: [
                'dns', 'net', 'tls', 'crypto', 'http', 'https', 'stream', 'zlib', 'events', 'path', 'fs', 'os', 'util'
            ],
            // We need to resolve TS path aliases like @/lib
            alias: {
                '@': path.join(__dirname, '../src')
            }
        });

        console.log('✅ Bundling completed successfully!');
        console.log('Ready to deploy: appwrite deploy function');
    } catch (error) {
        console.error('❌ Build failed:', error);
        process.exit(1);
    }
}

buildFunctions();
