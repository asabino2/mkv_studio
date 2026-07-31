const http = require('http');
const fs = require('fs');
const path = require('path');
const { scanDirectory } = require('./lib/scanner.js');
const FFmpegWorker = require('./lib/ffmpegRunner.js');
const { createZipFromFolder } = require('./lib/mkvZipHelper.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const TEMP_STORAGE_DIR = path.join(__dirname, 'temp_storage');

if (!fs.existsSync(TEMP_STORAGE_DIR)) {
  fs.mkdirSync(TEMP_STORAGE_DIR, { recursive: true });
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
        reject(new Error('JSON inválido no corpo da requisição.'));
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
    if (!match) return reject(new Error('Content-Type não é multipart/form-data ou boundary não encontrado.'));

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
                fs.writeFileSync(savePath, bodyBuffer);
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
        return res.end(JSON.stringify({ valid: false, message: 'Caminho não fornecido.' }));
      }

      const exists = fs.existsSync(pathDir);
      if (!exists) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ valid: false, message: 'O caminho especificado não existe.' }));
      }

      const stat = fs.statSync(pathDir);
      if (!stat.isDirectory()) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ valid: false, message: 'O caminho especificado não é uma pasta.' }));
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ valid: true, message: 'Pasta válida encontrada.' }));

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
        return res.end(JSON.stringify({ error: 'As pastas de origem e destino são obrigatórias.' }));
      }

      const result = scanDirectory(sourceDir, destDir);
      const encText = (forcedEncoding && forcedEncoding !== 'AUTO') ? ` [Encoding: ${forcedEncoding}]` : ' [Encoding Auto]';
      broadcastLog('info', `Varredura realizada em "${sourceDir}". ${result.totalVideos} vídeo(s) encontrado(s)${encText}.`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    } catch (err) {
      broadcastLog('error', `Erro na varredura: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // 4. Rota: /api/upload-files (Upload de Arquivos Individuais)
  if (req.method === 'POST' && pathname === '/api/upload-files') {
    try {
      const sessionId = 'session_' + Date.now();
      const sessionSourceDir = path.join(TEMP_STORAGE_DIR, sessionId, 'source');
      const sessionDestDir = path.join(TEMP_STORAGE_DIR, sessionId, 'dest');

      fs.mkdirSync(sessionSourceDir, { recursive: true });
      fs.mkdirSync(sessionDestDir, { recursive: true });

      const count = await parseMultipartForm(req, sessionSourceDir);
      broadcastLog('info', `Upload de ${count} arquivo(s) concluído para a sessão "${sessionId}". Analisando arquivos...`);

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
      return res.end(JSON.stringify({ error: `Erro no upload: ${err.message}` }));
    }
  }

  // 5. Rota: /api/convert
  if (req.method === 'POST' && pathname === '/api/convert') {
    if (activeJob.running) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Já existe uma conversão em andamento.' }));
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
          const itemSubModes = itemsConfig[item.id];
          if (Array.isArray(itemSubModes)) {
            item.subtitles.forEach((sub, sIdx) => {
              const matchingConfig = itemSubModes[sIdx] || itemSubModes.find(c => c.srtName === sub.srtName);
              if (matchingConfig && matchingConfig.mode) {
                sub.mode = matchingConfig.mode;
              } else {
                sub.mode = 'selectable';
              }
            });
          }
        });
      }

      if (itemsToProcess.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Nenhum vídeo selecionado para conversão.' }));
      }

      activeJob = {
        running: true,
        worker: new FFmpegWorker(),
        totalItems: itemsToProcess.length,
        completedItems: 0,
        cancelled: false
      };

      broadcastSSE('job_start', { totalItems: itemsToProcess.length });
      broadcastLog('info', `========== INICIANDO LOTE DE CONVERSÃO (${itemsToProcess.length} ARQUIVOS) ==========`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Processamento iniciado.', totalItems: itemsToProcess.length }));

      (async () => {
        for (let i = 0; i < itemsToProcess.length; i++) {
          if (activeJob.cancelled) {
            broadcastLog('warning', 'Processamento em lote interrompido pelo usuário.');
            break;
          }

          const item = itemsToProcess[i];
          broadcastLog('info', `[${i + 1}/${itemsToProcess.length}] Processando: ${item.videoName}`);

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
              broadcastLog('warning', `Conversão do vídeo ${item.videoName} foi cancelada.`);
            } else {
              broadcastLog('error', `Falha ao converter ${item.videoName}: ${err.message}`);
            }
          }
        }

        const finalStatus = activeJob.cancelled ? 'CANCELADO' : 'CONCLUÍDO';
        broadcastLog('info', `========== FIM DO PROCESSAMENTO: ${finalStatus} (${activeJob.completedItems}/${itemsToProcess.length} convertidos) ==========`);

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
      broadcastLog('error', `Erro ao iniciar conversão: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // 6. Rota: /api/download/file (Download de MKV Individual)
  if (req.method === 'GET' && pathname === '/api/download/file') {
    const sessionId = url.searchParams.get('sessionId');
    const filename = url.searchParams.get('filename');

    if (!sessionId || !filename) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Parâmetros de download inválidos.');
    }

    const filePath = path.join(TEMP_STORAGE_DIR, sessionId, 'dest', filename);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Arquivo não encontrado.');
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
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('ID de sessão inválido.');
    }

    const destDir = path.join(TEMP_STORAGE_DIR, sessionId, 'dest');
    const zipPath = path.join(TEMP_STORAGE_DIR, sessionId, `MKV_Convertidos_${sessionId}.zip`);

    try {
      const finalZipPath = createZipFromFolder(destDir, zipPath);
      const stat = fs.statSync(finalZipPath);

      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="MKV_Convertidos_${sessionId}.zip"`
      });
      fs.createReadStream(finalZipPath).pipe(res);
      return;
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(`Erro ao gerar arquivo ZIP: ${err.message}`);
    }
  }

  // 8. Rota: /api/cancel
  if (req.method === 'POST' && pathname === '/api/cancel') {
    if (!activeJob.running || !activeJob.worker) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Nenhum processamento ativo para cancelar.' }));
    }

    activeJob.cancelled = true;
    activeJob.worker.cancel();
    broadcastLog('warning', 'Cancelamento enviado pelo usuário...');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ message: 'Processamento cancelado.' }));
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
  console.log(`Servidor MKV Studio rodando em http://localhost:${PORT}`);
});
