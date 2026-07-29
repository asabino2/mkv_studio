const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Compacta apenas os arquivos .mkv de uma pasta em um arquivo .zip de forma nativa e confiável
 */
function createZipFromFolder(destDir, outputZipPath) {
  if (!fs.existsSync(destDir)) {
    throw new Error(`A pasta de arquivos "${destDir}" não existe.`);
  }

  const files = fs.readdirSync(destDir);
  const mkvFiles = files.filter(f => f.toLowerCase().endsWith('.mkv'));

  if (mkvFiles.length === 0) {
    throw new Error('Nenhum arquivo .mkv gerado encontrado para compactação.');
  }

  // Garante que o arquivo ZIP anterior seja removido antes de recriar
  if (fs.existsSync(outputZipPath)) {
    try {
      fs.unlinkSync(outputZipPath);
    } catch (e) {
      // Se o arquivo original estiver em download, gera com nome temporário único
      const ext = path.extname(outputZipPath);
      const base = path.basename(outputZipPath, ext);
      outputZipPath = path.join(path.dirname(outputZipPath), `${base}_${Date.now()}${ext}`);
    }
  }

  if (process.platform === 'win32') {
    // Filtra especificamente apenas os arquivos .mkv para não tentar compactar o próprio .zip
    const psCommand = `Get-ChildItem -Path '${destDir}' -Filter '*.mkv' | Compress-Archive -DestinationPath '${outputZipPath}' -Force`;
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommand}"`, { windowsHide: true });
  } else {
    execSync(`zip -j "${outputZipPath}" "${path.join(destDir, '*.mkv')}"`);
  }

  if (!fs.existsSync(outputZipPath)) {
    throw new Error(`Não foi possível gerar o arquivo ZIP em: ${outputZipPath}`);
  }

  return outputZipPath;
}

module.exports = {
  createZipFromFolder
};