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
  const uploadProgressContainer = document.getElementById('uploadProgressContainer');
  const uploadProgressText = document.getElementById('uploadProgressText');
  const uploadProgressBarFill = document.getElementById('uploadProgressBarFill');

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

  function handleFileUpload(files) {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    appendLog('info', `Uploading ${files.length} file(s) to input folder...`);
    statusText.textContent = 'Uploading files...';
    if (uploadProgressContainer) {
      uploadProgressContainer.classList.remove('hidden');
      uploadProgressBarFill.style.width = '0%';
      uploadProgressText.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Uploading files to input folder: 0%`;
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload-files', true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && uploadProgressContainer) {
        const percent = Math.round((e.loaded / e.total) * 100);
        uploadProgressBarFill.style.width = `${percent}%`;
        uploadProgressText.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Uploading files to input folder: ${percent}%`;
      }
    };

    xhr.onload = () => {
      if (uploadProgressContainer) uploadProgressContainer.classList.add('hidden');
      statusText.textContent = 'Ready';

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          currentSessionId = data.sessionId;
          currentSessionSourceDir = data.sourceDir;
          currentSessionDestDir = data.destDir;
          scannedItems = data.items || [];

          renderFileList(scannedItems);
          appendLog('success', `Upload completed successfully. ${data.totalVideos} video(s) ready for conversion.`);
          btnConvert.disabled = scannedItems.length === 0;
        } catch (err) {
          appendLog('error', `Error processing upload response: ${err.message}`);
          alert(`Failed to process files: ${err.message}`);
        }
      } else {
        let errMsg = xhr.statusText;
        try {
          const errData = JSON.parse(xhr.responseText);
          if (errData.error) errMsg = errData.error;
        } catch (e) {}
        appendLog('error', `Upload error: ${errMsg}`);
        alert(`Failed to upload files: ${errMsg}`);
      }
    };

    xhr.onerror = () => {
      if (uploadProgressContainer) uploadProgressContainer.classList.add('hidden');
      statusText.textContent = 'Ready';
      appendLog('error', `Network error uploading files.`);
      alert(`Network connection failure while uploading files.`);
    };

    xhr.send(formData);
  }

  // EVENTO: Analisar Pastas (Modo Pasta)
  btnScan.addEventListener('click', async () => {
    const sourceDir = sourceDirInput.value.trim();
    const destDir = destDirInput.value.trim();
    const forcedEncoding = subtitleEncodingSelect.value;

    if (!sourceDir || !destDir) {
      alert('Please fill in both source and destination folders.');
      return;
    }

    btnScan.disabled = true;
    btnScan.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing...';

    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDir, destDir, forcedEncoding })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Error performing scan.');
      }

      scannedItems = data.items || [];
      renderFileList(scannedItems);

      if (scannedItems.length > 0) {
        btnConvert.disabled = false;
      } else {
        btnConvert.disabled = true;
      }

    } catch (err) {
      appendLog('error', `Scan error: ${err.message}`);
      alert(`Error scanning folder: ${err.message}`);
    } finally {
      btnScan.disabled = false;
      btnScan.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Analyze Files';
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
      alert('Select at least one video file to convert.');
      return;
    }

    const itemsConfig = {};
    scannedItems.forEach(item => {
      if (selectedIds.includes(item.id)) {
        itemsConfig[item.id] = {
          subtitles: (item.subtitles || []).map(sub => ({
            srtName: sub.srtName,
            mode: sub.mode || 'selectable'
          })),
          audioTracks: (item.audioTracks || []).map(audio => ({
            audioName: audio.audioName,
            mode: audio.mode || 'selectable'
          }))
        };
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
        throw new Error(data.error || 'Could not start processing.');
      }

      setConvertingState(true);
      appendLog('info', `Starting conversion of ${selectedIds.length} file(s)...`);

    } catch (err) {
      appendLog('error', `Failed to start conversion: ${err.message}`);
      alert(err.message);
    }
  });

  // EVENTO: Cancelar
  btnCancel.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to cancel the current processing?')) return;

    try {
      await fetch('/api/cancel', { method: 'POST' });
      appendLog('warning', 'Cancellation request sent.');
    } catch (err) {
      appendLog('error', `Error canceling: ${err.message}`);
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
      alert('Logs copied to clipboard!');
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
      progressStepText.textContent = `0 / ${data.totalItems} completed`;
    });

    eventSource.addEventListener('progress', (e) => {
      const p = JSON.parse(e.data);
      currentProcessingItem.textContent = p.currentItemName;
      progressStepText.textContent = `${p.currentIndex} of ${p.totalItems} in progress`;

      itemProgressBar.style.width = `${p.itemPercent}%`;
      itemPercentText.textContent = `${p.itemPercent}% (current file)`;

      overallProgressBar.style.width = `${p.overallPercent}%`;
      overallPercentText.textContent = `${p.overallPercent}%`;
    });

    eventSource.addEventListener('job_end', (e) => {
      const data = JSON.parse(e.data);
      setConvertingState(false);
      overallProgressBar.style.width = '100%';
      overallPercentText.textContent = '100%';
      currentProcessingItem.textContent = `Processing ${data.status}`;

      if ((currentMode === 'files' || data.sessionId) && data.generatedFiles && data.generatedFiles.length > 0) {
        renderDownloadPanel(data.sessionId || currentSessionId, data.generatedFiles);
      }
    });

    eventSource.onerror = () => {
      statusIndicator.className = 'status-indicator offline';
      statusText.textContent = 'Disconnected';
    };

    eventSource.onopen = () => {
      statusIndicator.className = 'status-indicator online';
      statusText.textContent = 'Ready';
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
          <i class="fa-solid fa-download"></i> Download MKV
        </a>
      </div>
    `).join('');
  }

  async function validatePath(pathStr, hintElement) {
    if (!pathStr.trim()) {
      hintElement.textContent = 'Please enter a valid path.';
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
      hintElement.textContent = `Error validating path: ${e.message}`;
      hintElement.style.color = '#ef4444';
    }
  }

  fileListContainer.addEventListener('change', (e) => {
    if (e.target.classList.contains('sub-mode-select')) {
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
    } else if (e.target.classList.contains('audio-mode-select')) {
      const selectEl = e.target;
      const itemId = selectEl.dataset.itemId;
      const audioIndex = parseInt(selectEl.dataset.audioIndex, 10);
      const newMode = selectEl.value;

      selectEl.setAttribute('data-mode', newMode);

      const item = scannedItems.find(i => i.id === itemId);
      if (!item || !item.audioTracks || !item.audioTracks[audioIndex]) return;

      item.audioTracks[audioIndex].mode = newMode;
    }
  });

  function renderFileList(items) {
    fileCountSpan.textContent = items.length;

    if (items.length === 0) {
      fileListContainer.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-file-video"></i>
          <p>No video files (.mp4, .avi, etc.) loaded.</p>
        </div>
      `;
      return;
    }

    const selEnc = subtitleEncodingSelect.value;

    fileListContainer.innerHTML = items.map(item => {
      const sizeMB = (item.videoSize / (1024 * 1024)).toFixed(1);

      const subBadges = (item.subtitles && item.subtitles.length > 0)
        ? item.subtitles.map((sub, idx) => {
            if (!sub.mode) sub.mode = 'selectable';
            const encTag = selEnc !== 'AUTO' ? `sub_charenc: ${selEnc}` : (sub.encoding && sub.encoding !== 'utf-8' ? `sub_charenc: ${sub.encoding.toUpperCase()}` : 'UTF-8');
            return `
              <div class="sub-row">
                <div class="sub-info">
                  <span class="sub-tag" title="SRT Subtitle">
                    <span class="lang-code">${sub.langCode}</span>
                    <i class="fa-solid fa-closed-captioning"></i> ${sub.langName}
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
        : '<span class="sub-tag no-sub"><i class="fa-solid fa-triangle-exclamation"></i> No SRT subtitles found</span>';

      const audioBadges = (item.audioTracks && item.audioTracks.length > 0)
        ? item.audioTracks.map((audio, idx) => {
            if (!audio.mode) audio.mode = 'selectable';
            return `
              <div class="sub-row">
                <div class="sub-info">
                  <span class="audio-tag" title="Audio Track">
                    <span class="lang-code">${audio.langCode}</span>
                    <i class="fa-solid fa-file-audio"></i> ${audio.langName}
                  </span>
                  <span class="sub-name">(${escapeHtml(audio.audioName)})</span>
                </div>
                <select class="audio-mode-select" data-item-id="${item.id}" data-audio-index="${idx}" data-mode="${audio.mode}">
                  <option value="selectable" ${audio.mode === 'selectable' ? 'selected' : ''}>selectable</option>
                  <option value="none" ${audio.mode === 'none' ? 'selected' : ''}>none</option>
                </select>
              </div>
            `;
          }).join('')
        : '';

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
            ${audioBadges}
          </div>
        </div>
      `;
    }).join('');
  }

  function appendLog(type, message, timestamp) {
    const time = timestamp || new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = `log-line ${type}`;

    const badgeLabel = {
      info: 'INFO',
      success: 'SUCCESS',
      warning: 'WARNING',
      error: 'ERROR',
      cmd: 'COMMAND',
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
      statusText.textContent = 'Processing...';
    } else {
      statusIndicator.className = 'status-indicator online';
      statusText.textContent = 'Ready';
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
