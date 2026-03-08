const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.ts')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk('apps/server/src');
for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    const replaced = content.replace(/from "(\.\.\/)+shared\/[^"]+"/g, 'from "@opentasks/contracts"');
    if (content !== replaced) {
        fs.writeFileSync(file, replaced);
        console.log(`Updated ${file}`);
    }
}
