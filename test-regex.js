const fs = require('fs');
let str = "1 Archmage's Charm (OTP) 8";
const m1 = str.match(/^(\d+)[xX]?\s+(.+)$/);
let parsedName = m1 ? m1[2].trim() : str.trim();

let cleanName = parsedName.replace(/\s+\([a-zA-Z0-9_]+\)\s*.*$/i, '').trim();
let frontName = cleanName.split(/\s*\/\/?\s*/)[0].trim();

fs.writeFileSync('output.txt', `Original: ${str}\nParsed: ${parsedName}\nClean: ${cleanName}\nFront: ${frontName}\n`);
