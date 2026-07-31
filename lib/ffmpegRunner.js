const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class FFmpegWorker {
  constructor() {
    this.currentProcess = null;
    this.isCancelled = false;
  }

  getEncoderArgs(accelerator) {
    const accel = (accelerator || 'CPU').toUpperCase();
    switch (accel) {
      case 'NVIDIA':
      case 'NVENC':
        return ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '23'];
      case 'INTEL':
      case 'QSV':
        return ['-c:v', 'h264_qsv', '-global_quality', '23'];
      case 'AMD':
      case 'AMF':
        return ['-c:v', 'h264_amf', '-rc', 'cbr'];
      case 'VAAPI':
        return ['-c:v', 'h264_vaapi'];
      case 'VIDEOTOOLBOX':
      case 'APPLE':
        return ['-c:v', 'h264_videotoolbox'];
      case 'CPU':
      default:
        return ['-c:v', 'libx264', '-preset', 'medium', '-crf', '23'];
    }
  }

  /**
   * Converte um arquivo de vídeo + legendas SRT em um container MKV usando FFmpeg
   */
  convertItem(item, forcedEncoding, accelerator, onLog, onProgress) {
    if (typeof accelerator === 'function') {
      onProgress = onLog;
      onLog = accelerator;
      accelerator = 'CPU';
    }

    return new Promise((resolve, reject) => {
      if (this.isCancelled) {
        return reject(new Error('Processamento cancelado pelo usuário.'));
      }

      const burnSub = item.subtitles.find(sub => sub.mode === 'burn');
      const selectableSubs = item.subtitles.filter(sub => (sub.mode === 'selectable' || !sub.mode));

      onLog('info', `Iniciando conversão do vídeo: ${item.videoName}`);
      onLog('info', `Destino: ${item.destPath}`);
      onLog('info', `Acelerador selecionado: ${accelerator || 'CPU'}`);
      onLog('info', `Legendas Soft: ${selectableSubs.length} | Legenda Hard (Burn): ${burnSub ? burnSub.srtName : 'Nenhuma'}`);

      selectableSubs.forEach((sub, idx) => {
        const effEnc = (forcedEncoding && forcedEncoding !== 'AUTO') ? forcedEncoding : (sub.encoding || 'utf-8');
        onLog('info', `  - [Selecionável ${idx + 1}] ${sub.srtName} -> Idioma: ${sub.langName} (${sub.langCode}) [Encoding: ${effEnc}]`);
      });

      if (burnSub) {
        const effEnc = (forcedEncoding && forcedEncoding !== 'AUTO') ? forcedEncoding : (burnSub.encoding || 'utf-8');
        onLog('info', `  - [Queimar no Vídeo] ${burnSub.srtName} -> Idioma: ${burnSub.langName} (${burnSub.langCode}) [Encoding: ${effEnc}]`);
      }

      const destDir = path.dirname(item.destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const args = ['-y'];

      // Input 0: Vídeo principal
      args.push('-i', item.videoPath);

      // Inputs 1..N: Arquivos SRT selecionáveis (soft)
      selectableSubs.forEach(sub => {
        let inputEncoding = null;

        if (forcedEncoding && forcedEncoding !== 'AUTO') {
          inputEncoding = forcedEncoding;
        } else if (sub.encoding && sub.encoding !== 'utf-8') {
          inputEncoding = (sub.encoding === 'cp1252') ? 'WINDOWS-1252' : sub.encoding.toUpperCase();
        }

        if (inputEncoding) {
          args.push('-sub_charenc', inputEncoding);
        }
        args.push('-i', sub.srtPath);
      });

      // Mapeamento dos fluxos de vídeo e áudio
      args.push('-map', '0:v');
      args.push('-map', '0:a?');

      // Processamento de Vídeo (Cópia ou Re-encodamento com filtro de legenda)
      if (burnSub) {
        let inputEncoding = null;
        if (forcedEncoding && forcedEncoding !== 'AUTO') {
          inputEncoding = forcedEncoding;
        } else if (burnSub.encoding && burnSub.encoding !== 'utf-8') {
          inputEncoding = (burnSub.encoding === 'cp1252') ? 'WINDOWS-1252' : burnSub.encoding.toUpperCase();
        }

        let escapedPath = burnSub.srtPath.replace(/\\/g, '/').replace(/'/g, "'\\\\''").replace(/:/g, '\\:');
        let filterOption = `subtitles='${escapedPath}'`;
        if (inputEncoding) {
          filterOption += `:charenc=${inputEncoding}`;
        }

        args.push('-vf', filterOption);
        const encoderArgs = this.getEncoderArgs(accelerator);
        args.push(...encoderArgs);
      } else {
        args.push('-c:v', 'copy');
      }

      // Processamento de Áudio
      args.push('-c:a', 'copy');

      // Mapeamento das legendas selecionáveis (soft)
      if (selectableSubs.length > 0) {
        selectableSubs.forEach((_, idx) => {
          const inputIndex = idx + 1;
          args.push('-map', `${inputIndex}:s`);
        });

        args.push('-c:s', 'subrip');

        selectableSubs.forEach((sub, idx) => {
          args.push(`-metadata:s:s:${idx}`, `language=${sub.langCode}`);
          args.push(`-metadata:s:s:${idx}`, `title=${sub.langName}`);
        });
      }

      args.push(item.destPath);

      onLog('cmd', `Comando FFmpeg: ffmpeg ${args.join(' ')}`);

      const child = spawn('ffmpeg', args, { windowsHide: true });
      this.currentProcess = child;

      let durationInSeconds = 0;

      child.stderr.on('data', (data) => {
        const str = data.toString();
        onLog('ffmpeg', str.trim());

        if (durationInSeconds === 0) {
          const durationMatch = str.match(/Duration:\s*(\d\d):(\d\d):(\d\d\.\d\d)/);
          if (durationMatch) {
            const hours = parseFloat(durationMatch[1]);
            const minutes = parseFloat(durationMatch[2]);
            const seconds = parseFloat(durationMatch[3]);
            durationInSeconds = hours * 3600 + minutes * 60 + seconds;
          }
        }

        const timeMatch = str.match(/time=\s*(\d\d):(\d\d):(\d\d\.\d\d)/);
        if (timeMatch && durationInSeconds > 0) {
          const hours = parseFloat(timeMatch[1]);
          const minutes = parseFloat(timeMatch[2]);
          const seconds = parseFloat(timeMatch[3]);
          const currentTime = hours * 3600 + minutes * 60 + seconds;
          const percent = Math.min(100, Math.round((currentTime / durationInSeconds) * 100));
          if (onProgress) {
            onProgress(percent);
          }
        }
      });

      child.on('error', (err) => {
        this.currentProcess = null;
        if (this.isCancelled) return;
        onLog('error', `Erro ao executar o FFmpeg: ${err.message}`);
        reject(err);
      });

      child.on('close', (code) => {
        this.currentProcess = null;
        if (this.isCancelled) {
          onLog('warning', `Conversão cancelada pelo usuário para: ${item.videoName}`);
          return reject(new Error('Conversão cancelada pelo usuário'));
        }

        if (code === 0) {
          onLog('success', `Conversão concluída com sucesso! MKV gerado em: ${item.destPath}`);
          if (onProgress) onProgress(100);
          resolve(item.destPath);
        } else {
          onLog('error', `FFmpeg finalizou com código de erro ${code} ao processar ${item.videoName}`);
          reject(new Error(`FFmpeg falhou com código ${code}`));
        }
      });
    });
  }

  cancel() {
    this.isCancelled = true;
    if (this.currentProcess && this.currentProcess.pid) {
      const pid = this.currentProcess.pid;
      try {
        if (process.platform === 'win32') {
          execSync(`taskkill /pid ${pid} /f /t`);
        } else {
          this.currentProcess.kill('SIGKILL');
        }
      } catch (e) {
        // Processo encerrado
      }
    }
  }
}

module.exports = FFmpegWorker;
