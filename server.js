const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { scanDirectory } = require('./lib/scanner.js');
const FFmpegWorker = require('./lib/ffmpegRunner.js');
const { createZipFromFolder } = require('./lib/mkvZipHelper.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const TEMP_STORAGE_DIR = path.join(__dirname, 'temp_storage');
const INPUT_DIR = path.join(__dirname, 'input');
const OUTPUT_DIR = path.join(__dirname, 'output');

if (!fs.existsSync(TEMP_STORAGE_DIR)) {
  fs.mkdirSync(TEMP_STORAGE_DIR, { recursive: true });
}
if (!fs.existsSync(INPUT_DIR)) {
  fs.mkdirSync(INPUT_DIR, { recursive: true });
}
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

let sseClients = [];

function broadcastSSE(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.res.write(payload);
    } catch (err) {
      // Cliente desconectado
    }
  });
}

function broadcastLog(type, message) {
  const logEntry = {
    timestamp: new Date().toLocaleTimeString('pt-BR'),
    type: type,
    message: message
  };
  broadcastSSE('log', logEntry);
}

function broadcastProgress(data) {
  broadcastSSE('progress', data);
}

let activeJob = {
  running: false,
  worker: null,
  totalItems: 0,
  completedItems: 0,
  cancelled: false
};

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON in request body.'));
      }
    });
    req.on('error', err => reject(err));
  });
}

/**
 * Parser de Formulário Multipart nativo (Zero Dependências)
 */
function parseMultipartForm(req, saveDir) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!match) return reject(new Error('Content-Type is not multipart/form-data or boundary not found.'));

    const boundaryStr = '--' + (match[1] || match[2]).trim();
    const boundary = Buffer.from(boundaryStr);

    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        let start = 0;
        let fileCount = 0;

        while (true) {
          const boundaryIdx = buffer.indexOf(boundary, start);
          if (boundaryIdx === -1) break;

          if (start > 0) {
            const partBuffer = buffer.subarray(start, boundaryIdx);
            const headerEndIdx = partBuffer.indexOf('\r\n\r\n');
            if (headerEndIdx !== -1) {
              const headerStr = partBuffer.subarray(0, headerEndIdx).toString('utf-8');
              const filenameMatch = headerStr.match(/filename="([^"]+)"/i);
              if (filenameMatch) {
                const filename = filenameMatch[1];
                let bodyBuffer = partBuffer.subarray(headerEndIdx + 4);
                if (bodyBuffer.length >= 2 && bodyBuffer[bodyBuffer.length - 2] === 0x0D && bodyBuffer[bodyBuffer.length - 1] === 0x0A) {
                  bodyBuffer = bodyBuffer.subarray(0, bodyBuffer.length - 2);
                }
                const savePath = path.join(saveDir, filename);
                if (fs.existsSync(savePath)) {
                  const existingBuffer = fs.readFileSync(savePath);
                  const existingHash = crypto.createHash('sha256').update(existingBuffer).digest('hex');
                  const uploadedHash = crypto.createHash('sha256').update(bodyBuffer).digest('hex');

                  if (existingHash === uploadedHash) {
                    broadcastLog('info', `[Checksum Match] File "${filename}" already exists in input folder and is identical. Kept without overwriting.`);
                  } else {
                    broadcastLog('info', `[Checksum Mismatch] File "${filename}" already exists in input folder, but content differs. Updating file...`);
                    fs.writeFileSync(savePath, bodyBuffer);
                  }
                } else {
                  fs.writeFileSync(savePath, bodyBuffer);
                }
                fileCount++;
              }
            }
          }

          start = boundaryIdx + boundary.length;
          if (buffer.subarray(start, start + 2).toString() === '--') break;
          if (buffer.subarray(start, start + 2).toString() === '\r\n') start += 2;
        }

        resolve(fileCount);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function serveStaticFile(req, res, filePath) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // 1. Rota SSE: /api/events
  if (req.method === 'GET' && pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const clientId = Date.now();
    const newClient = { id: clientId, res };
    sseClients.push(newClient);

    res.write(`event: status\ndata: ${JSON.stringify({ running: activeJob.running })}\n\n`);

    req.on('close', () => {
      sseClients = sseClients.filter(c => c.id !== clientId);
    });
    return;
  }

  // 2. Rota: /api/validate-path
  if (req.method === 'POST' && pathname === '/api/validate-path') {
    try {
      const body = await parseRequestBody(req);
      const { pathDir } = body;

      if (!pathDir || typeof pathDir !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ valid: false, message: 'Path not provided.' }));
      }

      const exists = fs.existsSync(pathDir);
      if (!exists) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ valid: false, message: 'Specified path does not exist.' }));
      }

      const stat = fs.statSync(pathDir);
      if (!stat.isDirectory()) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ valid: false, message: 'Specified path is not a directory.' }));
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ valid: true, message: 'Valid directory found.' }));

    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ valid: false, message: err.message }));
    }
  }

  // 3. Rota: /api/scan
  if (req.method === 'POST' && pathname === '/api/scan') {
    try {
      const body = await parseRequestBody(req);
      const { sourceDir, destDir, forcedEncoding } = body;

      if (!sourceDir || !destDir) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Source and destination folders are required.' }));
      }

      const result = scanDirectory(sourceDir, destDir);
      const encText = (forcedEncoding && forcedEncoding !== 'AUTO') ? ` [Encoding: ${forcedEncoding}]` : ' [Encoding Auto]';
      broadcastLog('info', `Scan completed in "${sourceDir}". ${result.totalVideos} video(s) found${encText}.`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    } catch (err) {
      broadcastLog('error', `Scan error: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // 4. Rota: /api/upload-files (Upload de Arquivos para Pasta Input)
  if (req.method === 'POST' && pathname === '/api/upload-files') {
    try {
      const sessionId = 'session_' + Date.now();
      const sessionSourceDir = INPUT_DIR;
      const sessionDestDir = OUTPUT_DIR;

      const count = await parseMultipartForm(req, sessionSourceDir);
      broadcastLog('info', `Upload of ${count} file(s) completed to "input" folder. Analyzing files...`);

      const scanResult = scanDirectory(sessionSourceDir, sessionDestDir);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        sessionId: sessionId,
        sourceDir: sessionSourceDir,
        destDir: sessionDestDir,
        totalVideos: scanResult.totalVideos,
        items: scanResult.items
      }));

    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: `Upload error: ${err.message}` }));
    }
  }

  // 5. Rota: /api/convert
  if (req.method === 'POST' && pathname === '/api/convert') {
    if (activeJob.running) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'A conversion job is already running.' }));
    }

    try {
      const body = await parseRequestBody(req);
      const { sourceDir, destDir, selectedItemIds, itemsConfig, forcedEncoding, accelerator, sessionId } = body;

      const scanResult = scanDirectory(sourceDir, destDir);
      let itemsToProcess = scanResult.items;

      if (Array.isArray(selectedItemIds) && selectedItemIds.length > 0) {
        itemsToProcess = itemsToProcess.filter(item => selectedItemIds.includes(item.id));
      }

      if (itemsConfig && typeof itemsConfig === 'object') {
        itemsToProcess.forEach(item => {
          const config = itemsConfig[item.id];
          if (config) {
            const subConfig = Array.isArray(config) ? config : config.subtitles;
            if (Array.isArray(subConfig)) {
              item.subtitles.forEach((sub, sIdx) => {
                const matchingConfig = subConfig[sIdx] || subConfig.find(c => c.srtName === sub.srtName);
                if (matchingConfig && matchingConfig.mode) {
                  sub.mode = matchingConfig.mode;
                } else {
                  sub.mode = 'selectable';
                }
              });
            }
            const audioConfig = !Array.isArray(config) ? config.audioTracks : null;
            if (Array.isArray(audioConfig) && item.audioTracks) {
              item.audioTracks.forEach((audio, aIdx) => {
                const matchingConfig = audioConfig[aIdx] || audioConfig.find(c => c.audioName === audio.audioName);
                if (matchingConfig && matchingConfig.mode) {
                  audio.mode = matchingConfig.mode;
                } else {
                  audio.mode = 'selectable';
                }
              });
            }
          }
        });
      }

      if (itemsToProcess.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'No videos selected for conversion.' }));
      }

      activeJob = {
        running: true,
        worker: new FFmpegWorker(),
        totalItems: itemsToProcess.length,
        completedItems: 0,
        cancelled: false
      };

      broadcastSSE('job_start', { totalItems: itemsToProcess.length });
      broadcastLog('info', `========== STARTING CONVERSION BATCH (${itemsToProcess.length} FILES) ==========`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Processing started.', totalItems: itemsToProcess.length }));

      (async () => {
        for (let i = 0; i < itemsToProcess.length; i++) {
          if (activeJob.cancelled) {
            broadcastLog('warning', 'Batch processing canceled by user.');
            break;
          }

          const item = itemsToProcess[i];
          broadcastLog('info', `[${i + 1}/${itemsToProcess.length}] Processing: ${item.videoName}`);

          broadcastProgress({
            currentIndex: i + 1,
            totalItems: itemsToProcess.length,
            currentItemName: item.videoName,
            itemPercent: 0,
            overallPercent: Math.round((i / itemsToProcess.length) * 100)
          });

          try {
            await activeJob.worker.convertItem(
              item,
              forcedEncoding || 'AUTO',
              accelerator || 'CPU',
              (type, msg) => broadcastLog(type, msg),
              (percent) => {
                if (activeJob.cancelled) return;
                const currentOverall = Math.round(((i + (percent / 100)) / itemsToProcess.length) * 100);
                broadcastProgress({
                  currentIndex: i + 1,
                  totalItems: itemsToProcess.length,
                  currentItemName: item.videoName,
                  itemPercent: percent,
                  overallPercent: currentOverall
                });
              }
            );
            if (!activeJob.cancelled) {
              activeJob.completedItems++;
            }
          } catch (err) {
            if (activeJob.cancelled) {
              broadcastLog('warning', `Conversion of video ${item.videoName} was canceled.`);
            } else {
              broadcastLog('error', `Failed to convert ${item.videoName}: ${err.message}`);
            }
          }
        }

        const finalStatus = activeJob.cancelled ? 'CANCELED' : 'COMPLETED';
        broadcastLog('info', `========== END OF PROCESSING: ${finalStatus} (${activeJob.completedItems}/${itemsToProcess.length} converted) ==========`);

        const generatedMkvFiles = itemsToProcess.map(item => item.destName);

        broadcastSSE('job_end', {
          status: finalStatus,
          completedItems: activeJob.completedItems,
          totalItems: itemsToProcess.length,
          sessionId: sessionId || null,
          generatedFiles: generatedMkvFiles
        });

        activeJob.running = false;
        activeJob.worker = null;
      })();

      return;

    } catch (err) {
      activeJob.running = false;
      broadcastLog('error', `Error starting conversion: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // 6. Rota: /api/download/file (Download de MKV Individual)
  if (req.method === 'GET' && pathname === '/api/download/file') {
    const sessionId = url.searchParams.get('sessionId');
    const filename = url.searchParams.get('filename');

    if (!filename) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Invalid download parameters.');
    }

    let filePath = path.join(OUTPUT_DIR, filename);
    if (!fs.existsSync(filePath) && sessionId) {
      filePath = path.join(TEMP_STORAGE_DIR, sessionId, 'dest', filename);
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('File not found.');
    }

    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      'Content-Type': 'video/x-matroska',
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // 7. Rota: /api/download/zip (Download de Todos os MKVs em ZIP)
  if (req.method === 'GET' && pathname === '/api/download/zip') {
    const sessionId = url.searchParams.get('sessionId') || 'output_batch';
    const zipName = `Converted_MKV_${Date.now()}.zip`;

    let destDir = OUTPUT_DIR;
    let zipPath = path.join(OUTPUT_DIR, zipName);

    if (sessionId && sessionId.startsWith('session_')) {
      const sessionDest = path.join(TEMP_STORAGE_DIR, sessionId, 'dest');
      if (fs.existsSync(sessionDest) && fs.readdirSync(sessionDest).length > 0) {
        destDir = sessionDest;
        zipPath = path.join(TEMP_STORAGE_DIR, sessionId, zipName);
      }
    }

    try {
      const finalZipPath = createZipFromFolder(destDir, zipPath);
      const stat = fs.statSync(finalZipPath);

      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${zipName}"`
      });
      fs.createReadStream(finalZipPath).pipe(res);
      return;
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(`Error generating ZIP file: ${err.message}`);
    }
  }

  // 8. Rota: /api/cancel
  if (req.method === 'POST' && pathname === '/api/cancel') {
    if (!activeJob.running || !activeJob.worker) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'No active processing to cancel.' }));
    }

    activeJob.cancelled = true;
    activeJob.worker.cancel();
    broadcastLog('warning', 'Cancellation request sent by user...');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ message: 'Processing canceled.' }));
  }

  // 9. Servir arquivos estáticos
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const targetFile = path.join(PUBLIC_DIR, safePath);
  serveStaticFile(req, res, targetFile);
});

server.listen(PORT, () => {
  console.log(`MKV Studio server running at http://localhost:${PORT}`);
});
