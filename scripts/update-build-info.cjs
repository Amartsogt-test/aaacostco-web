const fs = require('fs');
const path = require('path');

const buildInfoPath = path.join(__dirname, '../src/buildInfo.json');

try {
    // Read existing file
    let buildInfo = {};
    if (fs.existsSync(buildInfoPath)) {
        const data = fs.readFileSync(buildInfoPath, 'utf8');
        buildInfo = JSON.parse(data);
    }

    // Generate new timestamp
    const now = new Date();
    const formattedDate = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    // Update buildTime
    buildInfo.buildTime = formattedDate;

    // Write back to file
    fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2));

    console.log(`Build info updated: ${formattedDate}`);
} catch (error) {
    console.error('Error updating build info:', error);
    process.exit(1);
}
