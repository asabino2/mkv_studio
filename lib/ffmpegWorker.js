const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class FFmpegWorker {
  constructor() {
    this.currentProcess = null;
    this.isCancelled = false;
  }

  /**
   * Converte um arquivo de vídeo + legendas SRT em um container MKV usando FFmpeg
   * @param {Object} item - Objeto de vídeo com array de legendas
   * @param {String} forcedEncoding - Encoding selecionado pelo usuário no dropdown ('AUTO', 'WINDOWS-1252', 'ISO-8859-1', 'UTF-8', etc.)
   * @param {Function} onLog - Callback para envio de logs
   * @param {Function} onProgress - Callback para envio de percentual de progresso
   */
  convertItem(item, forcedEncoding, onLog, onProgress) {
    return new Promise((resolve, reject) => {
      if (this.isCancelled) {
        return reject(new Error('Processamento cancelado pelo usuário.'));
      }

      onLog('info', `Iniciando conversão do vídeo: ${item.videoName}`);
      onLog('info', `Destino: ${item.destPath}`);
      onLog('info', `Legendas a embutir: ${item.subtitles.length}`);

      item.subtitles.forEach((sub, idx) => {
        const effEnc = (forcedEncoding && forcedEncoding !== 'AUTO') ? forcedEncoding : (sub.encoding || 'utf-8');
        onLog('info', `  - [Legenda ${idx + 1}] ${sub.srtName} -> Idioma: ${sub.langName} (${sub.langCode}) [Encoding Entrada: ${effEnc}]`);
      });

      const destDir = path.dirname(item.destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const args = ['-y'];

      // Input 0: Vídeo principal
      args.push('-i', item.videoPath);

      // Inputs 1..N: Arquivos SRT com -sub_charenc OBRIGATÓRIO na entrada do FFmpeg quando não for UTF-8 puro
      item.subtitles.forEach(sub => {
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

      // Mapeamento dos streams
      args.push('-map', '0:v');  // Faixas de vídeo
      args.push('-map', '0:a?'); // Faixas de áudio
      args.push('-map', '0:s?'); // Legendas originais se existirem

      // Mapeia novas legendas SRT dos inputs adicionais
      item.subtitles.forEach((_, idx) => {
        const inputIndex = idx + 1;
        args.push('-map', `${inputIndex}:s`);
      });

      // Codecs: Cópia sem re-codificação de vídeo/áudio, codec subrip (UTF-8) para legendas
      args.push('-c', 'copy');
      args.push('-c:s', 'subrip');

      // Metadados de idioma para cada legenda
      item.subtitles.forEach((sub, idx) => {
        args.push(`-metadata:s:s:${idx}`, `language=${sub.langCode}`);
        args.push(`-metadata:s:s:${idx}`, `title=${sub.langName}`);
      });

      // Arquivo de saída
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