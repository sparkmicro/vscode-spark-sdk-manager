import * as assert from 'assert';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { downloadFile } from '../../pixi';
import * as os from 'os';

suite('Download Logic Test Suite', () => {
    let server: http.Server;
    let port: number;
    const tempDir = os.tmpdir();
    const destFile = path.join(tempDir, 'download_test_file.txt');

    setup((done) => {
        // Start a local server that redirects
        server = http.createServer((req, res) => {
            if (req.url === '/redirect') {
                res.writeHead(302, { 'Location': `http://localhost:${port}/final` });
                res.end();
            } else if (req.url === '/final') {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('Hello World');
            } else {
                res.writeHead(404);
                res.end();
            }
        });

        server.listen(0, () => {
            const addr = server.address();
            if (addr && typeof addr !== 'string') {
                port = addr.port;
                done();
            }
        });
    });

    teardown((done) => {
        server.close(done);
        if (fs.existsSync(destFile)) {
            fs.unlinkSync(destFile);
        }
    });

    test('Follows redirects and downloads file', async () => {
        const url = `http://localhost:${port}/redirect`;
        await downloadFile(url, destFile);

        const content = fs.readFileSync(destFile, 'utf-8');
        assert.strictEqual(content, 'Hello World');
    });
});
