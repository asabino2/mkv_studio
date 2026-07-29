const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function createZipFromFolder(destDir, outputZipPath) {
  if (!fs.existsSync(destDir)) {
    throw new Error(`A pasta de arquivos "${destDir}" não existe.`);
  }

  if (fs.existsSync(outputZipPath)) {
    try {
      const stats = fs.statSync(outputZipPath);
      if (stats.size > 0) {
        return outputZipPath;
      }
    } catch (e) {
      // Continua
    }
  }

  const files = fs.readdirSync(destDir);
  const mkvFiles = files.filter(f => f.toLowerCase().endsWith('.mkv'));

  if (mkvFiles.length === 0) {
    throw new Error('Nenhum arquivo .mkv gerado encontrado para compactação.');
  }

  const tempZipPath = path.join(path.dirname(outputZipPath), `tmp_${Date.now()}_${Math.random().toString(36).substring(7)}.zip`);

  if (process.platform === 'win32') {
    const psCommand = `Get-ChildItem -Path '${destDir}' -Filter '*.mkv' | Compress-Archive -DestinationPath '${tempZipPath}' -Force`;
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommand}"`, { windowsHide: true });
  } else {
    execSync(`zip -j "${tempZipPath}" "${path.join(destDir, '*.mkv')}"`);
  }

  if (!fs.existsSync(tempZipPath)) {
    throw new Error(`Não foi possível gerar o arquivo ZIP temporário em: ${tempZipPath}`);
  }

  try {
    if (fs.existsSync(outputZipPath)) {
      try { fs.unlinkSync(outputZipPath); } catch (e) {}
    }
    fs.renameSync(tempZipPath, outputZipPath);
    return outputZipPath;
  } catch (err) {
    return tempZipPath;
  }
}

module.exports = {
  createZipFromFolder
};
