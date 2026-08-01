const fs = require('fs');
const path = require('path');
const { detectSubtitleLanguage, detectAudioLanguage } = require('./languageDetector.js');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.webm', '.flv', '.m4v', '.ts', '.m2ts', '.3gp']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.ac3', '.opus', '.wma']);

function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function scanDirectory(sourceDir, destDir) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source directory "${sourceDir}" does not exist.`);
  }

  const stat = fs.statSync(sourceDir);
  if (!stat.isDirectory()) {
    throw new Error(`Source path "${sourceDir}" is not a directory.`);
  }

  if (destDir && !fs.existsSync(destDir)) {
    try {
      fs.mkdirSync(destDir, { recursive: true });
    } catch (e) {
      throw new Error(`Could not create destination directory "${destDir}": ${e.message}`);
    }
  }

  const items = [];
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  const videoFiles = [];
  const srtFiles = [];
  const audioFiles = [];

  for (const entry of entries) {
    if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      const fullPath = path.join(sourceDir, entry.name);

      if (VIDEO_EXTENSIONS.has(ext)) {
        const stats = fs.statSync(fullPath);
        videoFiles.push({
          name: entry.name,
          baseName: path.basename(entry.name, ext),
          ext: ext,
          fullPath: fullPath,
          size: stats.size
        });
      } else if (ext === '.srt') {
        srtFiles.push({
          name: entry.name,
          baseName: path.basename(entry.name, ext),
          fullPath: fullPath
        });
      } else if (AUDIO_EXTENSIONS.has(ext)) {
        audioFiles.push({
          name: entry.name,
          baseName: path.basename(entry.name, ext),
          ext: ext,
          fullPath: fullPath
        });
      }
    }
  }

  let idCounter = 1;
  for (const video of videoFiles) {
    const videoNorm = normalizeName(video.baseName);
    const videoLower = video.baseName.toLowerCase();
    const matchedSubtitles = [];
    const matchedAudios = [];

    for (const srt of srtFiles) {
      const srtNorm = normalizeName(srt.baseName);
      const srtLower = srt.baseName.toLowerCase();

      const isExactPrefix = srtLower.startsWith(videoLower);
      const isNormMatch = srtNorm.includes(videoNorm) || videoNorm.includes(srtNorm);

      if (isExactPrefix || isNormMatch) {
        const langInfo = detectSubtitleLanguage(srt.fullPath);
        matchedSubtitles.push({
          srtPath: srt.fullPath,
          srtName: srt.name,
          langCode: langInfo.code6392,
          lang2Code: langInfo.code6391,
          langName: langInfo.name,
          detectionSource: langInfo.source,
          encoding: langInfo.encoding || 'utf-8',
          mode: 'selectable'
        });
      }
    }

    for (const audio of audioFiles) {
      const audioNorm = normalizeName(audio.baseName);
      const audioLower = audio.baseName.toLowerCase();

      const isExactPrefix = audioLower.startsWith(videoLower);
      const isNormMatch = audioNorm.includes(videoNorm) || videoNorm.includes(audioNorm);

      if (isExactPrefix || isNormMatch) {
        const langInfo = detectAudioLanguage(audio.fullPath);
        matchedAudios.push({
          audioPath: audio.fullPath,
          audioName: audio.name,
          langCode: langInfo.code6392,
          lang2Code: langInfo.code6391,
          langName: langInfo.name,
          detectionSource: langInfo.source,
          mode: 'selectable'
        });
      }
    }

    let outputFileName = `${video.baseName}.mkv`;
    if (path.resolve(sourceDir) === path.resolve(destDir) && video.ext === '.mkv') {
      outputFileName = `${video.baseName}_subtitled.mkv`;
    }

    const destPath = path.join(destDir, outputFileName);

    items.push({
      id: `video_${idCounter++}`,
      videoPath: video.fullPath,
      videoName: video.name,
      videoExt: video.ext,
      videoSize: video.size,
      destPath: destPath,
      destName: outputFileName,
      subtitles: matchedSubtitles,
      audioTracks: matchedAudios
    });
  }

  return {
    sourceDir: path.resolve(sourceDir),
    destDir: path.resolve(destDir),
    totalVideos: items.length,
    items: items
  };
}

module.exports = {
  scanDirectory
};

