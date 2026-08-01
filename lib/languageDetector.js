const fs = require('fs');
const path = require('path');

const LANGUAGE_MAP = {
  pt: { code6392: 'por', code6391: 'pt', name: 'Portuguese' },
  por: { code6392: 'por', code6391: 'pt', name: 'Portuguese' },
  'pt-br': { code6392: 'por', code6391: 'pt', name: 'Portuguese (BR)' },
  en: { code6392: 'eng', code6391: 'en', name: 'English' },
  eng: { code6392: 'eng', code6391: 'en', name: 'English' },
  es: { code6392: 'spa', code6391: 'es', name: 'Spanish' },
  spa: { code6392: 'spa', code6391: 'es', name: 'Spanish' },
  fr: { code6392: 'fre', code6391: 'fr', name: 'French' },
  fre: { code6392: 'fre', code6391: 'fr', name: 'French' },
  de: { code6392: 'ger', code6391: 'de', name: 'German' },
  ger: { code6392: 'ger', code6391: 'de', name: 'German' },
  it: { code6392: 'ita', code6391: 'it', name: 'Italian' },
  ita: { code6392: 'ita', code6391: 'it', name: 'Italian' },
  ja: { code6392: 'jpn', code6391: 'ja', name: 'Japanese' },
  jpn: { code6392: 'jpn', code6391: 'ja', name: 'Japanese' },
  zh: { code6392: 'chi', code6391: 'zh', name: 'Chinese' },
  chi: { code6392: 'chi', code6391: 'zh', name: 'Chinese' },
  ru: { code6392: 'rus', code6391: 'ru', name: 'Russian' },
  rus: { code6392: 'rus', code6391: 'ru', name: 'Russian' }
};

const STOPWORDS = {
  por: ['que', 'não', 'para', 'com', 'você', 'uma', 'como', 'estou', 'está', 'por', 'mais', 'meu', 'minha', 'isso', 'aqui', 'tudo', 'fazer', 'vamos', 'bem', 'agora', 'nada', 'quando'],
  eng: ['the', 'you', 'that', 'was', 'for', 'are', 'with', 'they', 'be', 'this', 'have', 'from', 'or', 'one', 'had', 'by', 'word', 'but', 'not', 'what', 'all', 'were', 'we', 'when', 'your', 'can', 'said', 'there', 'use', 'an', 'each', 'which', 'she', 'do', 'how', 'their', 'if', 'will', 'up', 'other', 'about', 'out', 'many', 'then', 'them', 'these', 'so', 'some', 'her', 'would', 'make', 'like', 'him', 'into', 'time', 'has', 'look', 'two', 'more', 'write', 'go', 'see'],
  spa: ['que', 'para', 'con', 'por', 'una', 'como', 'estoy', 'está', 'más', 'pero', 'sus', 'le', 'ya', 'o', 'este', 'sí', 'porque', 'esta', 'son', 'mi', 'tengo', 'nada', 'aqui', 'todos', 'bien'],
  fre: ['que', 'pour', 'avec', 'dans', 'sur', 'nous', 'vous', 'est', 'pas', 'une', 'des', 'les', 'plus', 'comme', 'mais', 'cette', 'fait', 'tout', 'bien'],
  ger: ['dass', 'nicht', 'mit', 'auch', 'aber', 'für', 'eine', 'oder', 'wenn', 'haben', 'nach', 'über', 'wie', 'nur', 'mehr', 'hier', 'jetzt'],
  ita: ['che', 'per', 'non', 'con', 'sono', 'della', 'questo', 'questa', 'come', 'sono', 'tutto', 'ancora', 'bene', 'quando', 'molto']
};

/**
 * Validação estrita de UTF-8 em conformidade com o RFC 3629
 */
function isStrictUtf8(buf) {
  let i = 0;
  const len = buf.length;

  while (i < len) {
    const b1 = buf[i];

    if (b1 <= 0x7F) {
      i++;
    } else if (b1 >= 0xC2 && b1 <= 0xDF) {
      if (i + 1 >= len || buf[i + 1] < 0x80 || buf[i + 1] > 0xBF) return false;
      i += 2;
    } else if (b1 === 0xE0) {
      if (i + 2 >= len || buf[i + 1] < 0xA0 || buf[i + 1] > 0xBF || buf[i + 2] < 0x80 || buf[i + 2] > 0xBF) return false;
      i += 3;
    } else if (b1 >= 0xE1 && b1 <= 0xEC) {
      if (i + 2 >= len || buf[i + 1] < 0x80 || buf[i + 1] > 0xBF || buf[i + 2] < 0x80 || buf[i + 2] > 0xBF) return false;
      i += 3;
    } else if (b1 === 0xED) {
      if (i + 2 >= len || buf[i + 1] < 0x80 || buf[i + 1] > 0x9F || buf[i + 2] < 0x80 || buf[i + 2] > 0xBF) return false;
      i += 3;
    } else if (b1 >= 0xEE && b1 <= 0xEF) {
      if (i + 2 >= len || buf[i + 1] < 0x80 || buf[i + 1] > 0xBF || buf[i + 2] < 0x80 || buf[i + 2] > 0xBF) return false;
      i += 3;
    } else if (b1 === 0xF0) {
      if (i + 3 >= len || buf[i + 1] < 0x90 || buf[i + 1] > 0xBF || buf[i + 2] < 0x80 || buf[i + 2] > 0xBF || buf[i + 3] < 0x80 || buf[i + 3] > 0xBF) return false;
      i += 4;
    } else if (b1 >= 0xF1 && b1 <= 0xF3) {
      if (i + 3 >= len || buf[i + 1] < 0x80 || buf[i + 1] > 0xBF || buf[i + 2] < 0x80 || buf[i + 2] > 0xBF || buf[i + 3] < 0x80 || buf[i + 3] > 0xBF) return false;
      i += 4;
    } else if (b1 === 0xF4) {
      if (i + 3 >= len || buf[i + 1] < 0x80 || buf[i + 1] > 0x8F || buf[i + 2] < 0x80 || buf[i + 2] > 0xBF || buf[i + 3] < 0x80 || buf[i + 3] > 0xBF) return false;
      i += 4;
    } else {
      return false;
    }
  }

  return true;
}

/**
 * Detecta a codificação exata do arquivo de legenda
 */
function detectFileEncoding(filePath) {
  try {
    const buf = fs.readFileSync(filePath);

    if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
      return 'utf-8';
    }
    if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
      return 'utf-16le';
    }
    if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
      return 'utf-16be';
    }

    if (isStrictUtf8(buf)) {
      return 'utf-8';
    }

    return 'cp1252';
  } catch (err) {
    return 'cp1252';
  }
}

function detectFromFilename(filePath) {
  const baseName = path.basename(filePath, path.extname(filePath)).toLowerCase();

  const patterns = [
    /\b(pt-br|pt_br|pt|por)\b/i,
    /\b(en-us|en-gb|en|eng)\b/i,
    /\b(es|spa)\b/i,
    /\b(fr|fre)\b/i,
    /\b(de|ger)\b/i,
    /\b(it|ita)\b/i,
    /\b(ja|jpn)\b/i,
    /\b(zh|chi)\b/i,
    /\b(ru|rus)\b/i
  ];

  for (const pat of patterns) {
    const match = baseName.match(pat);
    if (match) {
      const matchedKey = match[1].toLowerCase().replace('_', '-');
      if (LANGUAGE_MAP[matchedKey]) {
        return LANGUAGE_MAP[matchedKey];
      }
    }
  }

  return null;
}

function cleanSrtText(content) {
  return content
    .replace(/^\d+$/gm, '')
    .replace(/\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}.*/g, '')
    .replace(/<[^>]*>/g, '')
    .toLowerCase();
}

function detectFromContent(filePath, encoding) {
  try {
    const buf = fs.readFileSync(filePath).subarray(0, 50000);
    const readEncoding = (encoding === 'cp1252') ? 'latin1' : (encoding === 'utf-16le' ? 'utf16le' : 'utf-8');
    const rawContent = buf.toString(readEncoding);
    const text = cleanSrtText(rawContent);

    const words = text.match(/[a-zà-ÿáéíóúâêîôûãõçäöüß]+/gi) || [];
    if (words.length < 5) return null;

    const scores = { por: 0, eng: 0, spa: 0, fre: 0, ger: 0, ita: 0 };

    for (const word of words) {
      const w = word.toLowerCase();
      for (const [lang, list] of Object.entries(STOPWORDS)) {
        if (list.includes(w)) {
          scores[lang]++;
        }
      }
    }

    let maxLang = null;
    let maxScore = 0;

    for (const [lang, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        maxLang = lang;
      }
    }

    if (maxScore >= 3 && maxLang && STOPWORDS[maxLang]) {
      return LANGUAGE_MAP[maxLang] || null;
    }

  } catch (err) {
    console.error(`Erro ao ler arquivo SRT para detecção: ${filePath}`, err);
  }

  return null;
}

function detectSubtitleLanguage(filePath) {
  const encoding = detectFileEncoding(filePath);

  let lang = detectFromFilename(filePath);
  if (lang) {
    return { ...lang, source: 'filename', encoding };
  }

  lang = detectFromContent(filePath, encoding);
  if (lang) {
    return { ...lang, source: 'content', encoding };
  }

  return { code6392: 'und', code6391: 'un', name: 'Undefined', source: 'default', encoding };
}

function detectAudioLanguage(filePath) {
  let lang = detectFromFilename(filePath);
  if (lang) {
    return { ...lang, source: 'filename' };
  }

  return { code6392: 'und', code6391: 'un', name: 'Undefined', source: 'default' };
}

module.exports = {
  detectSubtitleLanguage,
  detectAudioLanguage,
  detectFileEncoding,
  isStrictUtf8,
  LANGUAGE_MAP
};


