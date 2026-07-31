document.addEventListener('DOMContentLoaded', () => {
  // Elementos - Abas de Modo
  const tabFolderMode = document.getElementById('tabFolderMode');
  const tabFilesMode = document.getElementById('tabFilesMode');
  const folderConfigPanel = document.getElementById('folderConfigPanel');
  const filesConfigPanel = document.getElementById('filesConfigPanel');

  // Elementos - Formulário & Pastas (Modo Pasta)
  const sourceDirInput = document.getElementById('sourceDir');
  const destDirInput = document.getElementById('destDir');
  const btnValidateSource = document.getElementById('btnValidateSource');
  const btnValidateDest = document.getElementById('btnValidateDest');
  const sourceHint = document.getElementById('sourceHint');
  const destHint = document.getElementById('destHint');

  // Elementos - Upload de Arquivos (Modo Arquivos)
  const dropZone = document.getElementById('dropZone');
  const fileUploadInput = document.getElementById('fileUploadInput');

  // Elementos - Configurações Globais & Ações
  const hardwareAccelSelect = document.getElementById('hardwareAccelSelect');
  const subtitleEncodingSelect = document.getElementById('subtitleEncodingSelect');
  const btnScan = document.getElementById('btnScan');
  const btnConvert = document.getElementById('btnConvert');
  const btnCancel = document.getElementById('btnCancel');
  const btnSelectAll = document.getElementById('btnSelectAll');
  const btnDeselectAll = document.getElementById('btnDeselectAll');

  // Elementos - Lista de Arquivos
  const fileCountSpan = document.getElementById('fileCount');
  const fileListContainer = document.getElementById('fileListContainer');

  // Elementos - Painel de Downloads (Modo Arquivos)
  const downloadCard = document.getElementById('downloadCard');
  const downloadListContainer = document.getElementById('downloadListContainer');
  const btnDownloadZip = document.getElementById('btnDownloadZip');

  // Elementos - Progresso & Status
  const overallPercentText = document.getElementById('overallPercentText');
  const overallProgressBar = document.getElementById('overallProgressBar');
  const itemPercentText = document.getElementById('itemPercentText');
  const itemProgressBar = document.getElementById('itemProgressBar');
  const currentProcessingItem = document.getElementById('currentProcessingItem');
  const progressStepText = document.getElementById('progressStepText');
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');

  // Elementos - Terminal
  const logConsole = document.getElementById('logConsole');
  const chkAutoScroll = document.getElementById('chkAutoScroll');
  const btnClearLogs = document.getElementById('btnClearLogs');
  const btnCopyLogs = document.getElementById('btnCopyLogs');

  // Estado da Aplicação
  let currentMode = 'folder'; // 'folder' ou 'files'
  let currentSessionId = null;
  let currentSessionSourceDir = null;
  let currentSessionDestDir = null;
  let scannedItems = [];
  let eventSource = null;
  let isConverting = false;

  initSSE();

  // ALTERNÂNCIA DE ABAS DE MODO
  tabFolderMode.addEventListener('click', () => setMode('folder'));
  tabFilesMode.addEventListener('click', () => setMode('files'));

  function setMode(mode) {
    currentMode = mode;
    downloadCard.classList.add('hidden');
    scannedItems = [];
    renderFileList([]);

    if (mode === 'folder') {
      tabFolderMode.classList.add('active');
      tabFilesMode.classList.remove('active');
      folderConfigPanel.classList.remove('hidden');
      filesConfigPanel.classList.add('hidden');
      btnScan.style.display = 'inline-flex';
    } else {
      tabFilesMode.classList.add('active');
      tabFolderMode.classList.remove('active');
      filesConfigPanel.classList.remove('hidden');
      folderConfigPanel.classList.add('hidden');
      btnScan.style.display = 'none'; // No modo upload, a varredura é automática após o envio
    }
  }

  // EVENTOS: Validação de Pastas
  btnValidateSource.addEventListener('click', () => validatePath(sourceDirInput.value, sourceHint));
  btnValidateDest.addEventListener('click', () => validatePath(destDirInput.value, destHint));

  // EVENTOS: Drag and Drop & Upload de Arquivos
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  });

  fileUploadInput.addEventListener('change', () => {
    if (fileUploadInput.files && fileUploadInput.files.length > 0) {
      handleFileUpload(fileUploadInput.files);
    }
  });

  async function handleFileUpload(files) {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    appendLog('info', `Enviando ${files.length} arquivo(s) para o servidor...`);
    statusText.textContent = 'Enviando arquivos...';

    try {
      const response = await fetch('/api/upload-files', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao enviar arquivos.');

      currentSessionId = data.sessionId;
      currentSessionSourceDir = data.sourceDir;
      currentSessionDestDir = data.destDir;
      scannedItems = data.items || [];

      renderFileList(scannedItems);
      appendLog('success', `Upload concluído com sucesso. ${data.totalVideos} vídeo(s) pronto(s) para conversão.`);

      if (scannedItems.length > 0) {
        btnConvert.disabled = false;
      } else {
        btnConvert.disabled = true;
      }

    } catch (err) {
      appendLog('error', `Erro no upload: ${err.message}`);
      alert(`Falha ao enviar arquivos: ${err.message}`);
    } finally {
      statusText.textContent = 'Pronto';
    }
  }

  // EVENTO: Analisar Pastas (Modo Pasta)
  btnScan.addEventListener('click', async () => {
    const sourceDir = sourceDirInput.value.trim();
    const destDir = destDirInput.value.trim();
    const forcedEncoding = subtitleEncodingSelect.value;

    if (!sourceDir || !destDir) {
      alert('Por favor, preencha ambas as pastas de origem e destino.');
      return;
    }

    btnScan.disabled = true;
    btnScan.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analisando...';

    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDir, destDir, forcedEncoding })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao realizar varredura.');
      }

      scannedItems = data.items || [];
      renderFileList(scannedItems);

      if (scannedItems.length > 0) {
        btnConvert.disabled = false;
      } else {
        btnConvert.disabled = true;
      }

    } catch (err) {
      appendLog('error', `Erro na análise: ${err.message}`);
      alert(`Erro ao analisar pasta: ${err.message}`);
    } finally {
      btnScan.disabled = false;
      btnScan.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Analisar Arquivos';
    }
  });

  // EVENTO: Iniciar Conversão
  btnConvert.addEventListener('click', async () => {
    let sourceDir, destDir;

    if (currentMode === 'folder') {
      sourceDir = sourceDirInput.value.trim();
      destDir = destDirInput.value.trim();
    } else {
      sourceDir = currentSessionSourceDir;
      destDir = currentSessionDestDir;
    }

    const forcedEncoding = subtitleEncodingSelect.value;
    const accelerator = hardwareAccelSelect ? hardwareAccelSelect.value : 'CPU';
    const checkboxes = fileListContainer.querySelectorAll('.item-checkbox:checked');
    const selectedIds = Array.from(checkboxes).map(cb => cb.dataset.itemId);

    if (selectedIds.length === 0) {
      alert('Selecione pelo menos um arquivo de vídeo para converter.');
      return;
    }

    const itemsConfig = {};
    scannedItems.forEach(item => {
      if (selectedIds.includes(item.id)) {
        itemsConfig[item.id] = item.subtitles.map(sub => ({
          srtName: sub.srtName,
          mode: sub.mode || 'selectable'
        }));
      }
    });

    downloadCard.classList.add('hidden');

    try {
      const response = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceDir,
          destDir,
          selectedItemIds: selectedIds,
          itemsConfig,
          forcedEncoding,
          accelerator,
          sessionId: currentSessionId
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível iniciar o processamento.');
      }

      setConvertingState(true);
      appendLog('info', `Iniciando conversão de ${selectedIds.length} arquivo(s)...`);

    } catch (err) {
      appendLog('error', `Falha ao iniciar conversão: ${err.message}`);
      alert(err.message);
    }
  });

  // EVENTO: Cancelar
  btnCancel.addEventListener('click', async () => {
    if (!confirm('Deseja realmente cancelar o processamento atual?')) return;

    try {
      await fetch('/api/cancel', { method: 'POST' });
      appendLog('warning', 'Solicitação de cancelamento enviada.');
    } catch (err) {
      appendLog('error', `Erro ao cancelar: ${err.message}`);
    }
  });

  btnSelectAll.addEventListener('click', () => {
    fileListContainer.querySelectorAll('.item-checkbox').forEach(cb => cb.checked = true);
  });

  btnDeselectAll.addEventListener('click', () => {
    fileListContainer.querySelectorAll('.item-checkbox').forEach(cb => cb.checked = false);
  });

  btnClearLogs.addEventListener('click', () => {
    logConsole.innerHTML = '';
  });

  btnCopyLogs.addEventListener('click', () => {
    const logText = Array.from(logConsole.querySelectorAll('.log-line'))
      .map(line => line.textContent)
      .join('\n');
    navigator.clipboard.writeText(logText).then(() => {
      alert('Logs copiados para a área de transferência!');
    });
  });

  // FUNÇÕES AUXILIARES DE SSE E RENDERIZAÇÃO

  function initSSE() {
    eventSource = new EventSource('/api/events');

    eventSource.addEventListener('status', (e) => {
      const data = JSON.parse(e.data);
      if (data.running) setConvertingState(true);
    });

    eventSource.addEventListener('log', (e) => {
      const log = JSON.parse(e.data);
      appendLog(log.type, log.message, log.timestamp);
    });

    eventSource.addEventListener('job_start', (e) => {
      const data = JSON.parse(e.data);
      setConvertingState(true);
      progressStepText.textContent = `0 / ${data.totalItems} concluídos`;
    });

    eventSource.addEventListener('progress', (e) => {
      const p = JSON.parse(e.data);
      currentProcessingItem.textContent = p.currentItemName;
      progressStepText.textContent = `${p.currentIndex} de ${p.totalItems} em andamento`;

      itemProgressBar.style.width = `${p.itemPercent}%`;
      itemPercentText.textContent = `${p.itemPercent}% (arquivo atual)`;

      overallProgressBar.style.width = `${p.overallPercent}%`;
      overallPercentText.textContent = `${p.overallPercent}%`;
    });

    eventSource.addEventListener('job_end', (e) => {
      const data = JSON.parse(e.data);
      setConvertingState(false);
      overallProgressBar.style.width = '100%';
      overallPercentText.textContent = '100%';
      currentProcessingItem.textContent = `Processamento ${data.status}`;

      // Se for modo arquivos importados (ou possuir sessionId), exibe o painel de download
      if ((currentMode === 'files' || data.sessionId) && data.generatedFiles && data.generatedFiles.length > 0) {
        renderDownloadPanel(data.sessionId || currentSessionId, data.generatedFiles);
      }
    });

    eventSource.onerror = () => {
      statusIndicator.className = 'status-indicator offline';
      statusText.textContent = 'Desconectado';
    };

    eventSource.onopen = () => {
      statusIndicator.className = 'status-indicator online';
      statusText.textContent = 'Pronto';
    };
  }

  function renderDownloadPanel(sessionId, files) {
    downloadCard.classList.remove('hidden');
    btnDownloadZip.href = `/api/download/zip?sessionId=${encodeURIComponent(sessionId)}`;

    downloadListContainer.innerHTML = files.map(file => `
      <div class="download-item">
        <div class="download-item-info">
          <i class="fa-solid fa-file-video"></i>
          <span>${escapeHtml(file)}</span>
        </div>
        <a href="/api/download/file?sessionId=${encodeURIComponent(sessionId)}&filename=${encodeURIComponent(file)}" class="btn btn-secondary btn-sm" download>
          <i class="fa-solid fa-download"></i> Baixar MKV
        </a>
      </div>
    `).join('');
  }

  async function validatePath(pathStr, hintElement) {
    if (!pathStr.trim()) {
      hintElement.textContent = 'Por favor, insira um caminho válido.';
      hintElement.style.color = '#ef4444';
      return;
    }

    try {
      const res = await fetch('/api/validate-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathDir: pathStr })
      });
      const data = await res.json();
      if (data.valid) {
        hintElement.textContent = `✓ ${data.message}`;
        hintElement.style.color = '#10b981';
      } else {
        hintElement.textContent = `✗ ${data.message}`;
        hintElement.style.color = '#ef4444';
      }
    } catch (e) {
      hintElement.textContent = `Erro ao validar caminho: ${e.message}`;
      hintElement.style.color = '#ef4444';
    }
  }

  fileListContainer.addEventListener('change', (e) => {
    if (!e.target.classList.contains('sub-mode-select')) return;
    const selectEl = e.target;
    const itemId = selectEl.dataset.itemId;
    const subIndex = parseInt(selectEl.dataset.subIndex, 10);
    const newMode = selectEl.value;

    selectEl.setAttribute('data-mode', newMode);

    const item = scannedItems.find(i => i.id === itemId);
    if (!item || !item.subtitles[subIndex]) return;

    if (newMode === 'burn') {
      const siblingSelects = fileListContainer.querySelectorAll(`.sub-mode-select[data-item-id="${itemId}"]`);
      siblingSelects.forEach((otherSelect) => {
        if (otherSelect !== selectEl) {
          const otherIdx = parseInt(otherSelect.dataset.subIndex, 10);
          otherSelect.value = 'none';
          otherSelect.setAttribute('data-mode', 'none');
          if (item.subtitles[otherIdx]) {
            item.subtitles[otherIdx].mode = 'none';
          }
        }
      });
    }

    item.subtitles[subIndex].mode = newMode;
  });

  function renderFileList(items) {
    fileCountSpan.textContent = items.length;

    if (items.length === 0) {
      fileListContainer.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-file-video"></i>
          <p>Nenhum arquivo de vídeo (.mp4, .avi, etc.) carregado.</p>
        </div>
      `;
      return;
    }

    const selEnc = subtitleEncodingSelect.value;

    fileListContainer.innerHTML = items.map(item => {
      const sizeMB = (item.videoSize / (1024 * 1024)).toFixed(1);

      const subBadges = item.subtitles.length > 0
        ? item.subtitles.map((sub, idx) => {
            if (!sub.mode) sub.mode = 'selectable';
            const encTag = selEnc !== 'AUTO' ? `sub_charenc: ${selEnc}` : (sub.encoding && sub.encoding !== 'utf-8' ? `sub_charenc: ${sub.encoding.toUpperCase()}` : 'UTF-8');
            return `
              <div class="sub-row">
                <div class="sub-info">
                  <span class="sub-tag">
                    <span class="lang-code">${sub.langCode}</span>
                    <i class="fa-regular fa-closed-captioning"></i> ${sub.langName}
                  </span>
                  <span class="sub-name">(${escapeHtml(sub.srtName)} • ${encTag})</span>
                </div>
                <select class="sub-mode-select" data-item-id="${item.id}" data-sub-index="${idx}" data-mode="${sub.mode}">
                  <option value="selectable" ${sub.mode === 'selectable' ? 'selected' : ''}>selectable</option>
                  <option value="burn" ${sub.mode === 'burn' ? 'selected' : ''}>burn</option>
                  <option value="none" ${sub.mode === 'none' ? 'selected' : ''}>none</option>
                </select>
              </div>
            `;
          }).join('')
        : '<span class="sub-tag no-sub"><i class="fa-solid fa-triangle-exclamation"></i> Nenhuma legenda SRT encontrada</span>';

      return `
        <div class="file-item" data-id="${item.id}">
          <div class="file-item-header">
            <div class="file-title">
              <input type="checkbox" class="item-checkbox" data-item-id="${item.id}" checked>
              <i class="fa-solid fa-file-video"></i>
              <span>${escapeHtml(item.videoName)}</span>
            </div>
            <span class="file-size">${sizeMB} MB</span>
          </div>
          <div class="subtitle-list">
            ${subBadges}
          </div>
        </div>
      `;
    }).join('');
  }

  function appendLog(type, message, timestamp) {
    const time = timestamp || new Date().toLocaleTimeString('pt-BR');
    const line = document.createElement('div');
    line.className = `log-line ${type}`;

    const badgeLabel = {
      info: 'INFO',
      success: 'SUCESSO',
      warning: 'AVISO',
      error: 'ERRO',
      cmd: 'COMANDO',
      ffmpeg: 'FFMPEG'
    }[type] || 'LOG';

    line.innerHTML = `
      <span class="timestamp">[${time}]</span>
      <span class="badge badge-${type}">${badgeLabel}</span>
      <span class="text">${escapeHtml(message)}</span>
    `;

    logConsole.appendChild(line);

    if (chkAutoScroll.checked) {
      logConsole.scrollTop = logConsole.scrollHeight;
    }
  }

  function setConvertingState(converting) {
    isConverting = converting;
    btnConvert.disabled = converting;
    btnScan.disabled = converting;
    btnCancel.disabled = !converting;

    if (converting) {
      statusIndicator.className = 'status-indicator converting';
      statusText.textContent = 'Processando...';
    } else {
      statusIndicator.className = 'status-indicator online';
      statusText.textContent = 'Pronto';
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
});
