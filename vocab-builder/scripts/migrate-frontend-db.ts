import fs from 'fs';
import path from 'path';

function walkDir(dir: string, callback: (filepath: string) => void) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filepath = path.join(dir, file);
        if (fs.statSync(filepath).isDirectory()) {
            walkDir(filepath, callback);
        } else {
            callback(filepath);
        }
    }
}

let modifiedCount = 0;

walkDir('./src', (filepath) => {
    if (filepath.endsWith('.ts') || filepath.endsWith('.tsx')) {
        let content = fs.readFileSync(filepath, 'utf8');
        let initialContent = content;

        // Replace imports from firebase/firestore
        if (content.match(/['"]firebase\/firestore['"]/)) {
            content = content.replace(/['"]firebase\/firestore['"]/g, "'@/lib/firebase/firestore'");
        }

        if (content !== initialContent) {
            fs.writeFileSync(filepath, content, 'utf8');
            console.log(`✅ Updated: ${filepath}`);
            modifiedCount++;
        }
    }
});

console.log(`\n🎉 Successfully codemodded ${modifiedCount} files to use the Appwrite Polyfill!`);
