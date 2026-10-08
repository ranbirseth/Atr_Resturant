// Frees the configured PORT before nodemon starts.
// On Windows a closed terminal can leave an orphaned `node server.js` holding the
// port, which makes the next `npm run dev` fail with EADDRINUSE.
const { execSync } = require('child_process');

const PORT = process.env.PORT || 5000;

const getPidsOnPort = () => {
    try {
        const cmd = process.platform === 'win32'
            ? `netstat -ano -p TCP | findstr LISTENING | findstr :${PORT}`
            : `lsof -ti tcp:${PORT}`;
        const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        return out
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(Boolean)
            .map(l => (process.platform === 'win32' ? l.split(/\s+/).pop() : l))
            .filter(pid => /^\d+$/.test(pid) && pid !== String(process.pid));
    } catch {
        return [];
    }
};

const pids = getPidsOnPort();

if (pids.length === 0) {
    console.log(`[freePort] Port ${PORT} is free.`);
    process.exit(0);
}

for (const pid of pids) {
    try {
        process.kill(Number(pid), 'SIGKILL');
        console.log(`[freePort] Killed process ${pid} holding port ${PORT}.`);
    } catch (err) {
        console.warn(`[freePort] Could not kill process ${pid}: ${err.message}`);
    }
}