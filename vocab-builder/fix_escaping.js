const fs = require('fs');
const file = 'src/app/api/cron/pre-generate-audio/route.ts';
let content = fs.readFileSync(file, 'utf8');

// Fix line 155
content = content.replace(
    "\\`\\${Date.now()}-\\${section.id}\\`",
    "`${Date.now()}-${section.id}`"
);

// Fix line 343: 'Authorization': \`Bearer ${XAI_API_KEY}\`,
content = content.replace(
    "'Authorization': \\`Bearer ${XAI_API_KEY}\\`,",
    "'Authorization': `Bearer ${XAI_API_KEY}`,"
);

fs.writeFileSync(file, content);
console.log("Fixed!");
