# 🎬 MKV Studio Converter

> **Intelligent Video, Audio, and SRT Subtitle Multiplexer with Local Folder Support, Drag & Drop Upload, and Batch ZIP Download.**

[![Node.js](https://img.shields.io/badge/Node.js-v14%2B-green.svg)](https://nodejs.org/)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-Required-red.svg)](https://ffmpeg.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](#license)

**MKV Studio Converter** is a complete, modern, high-performance web application designed to convert videos (MP4, AVI, MOV, WMV, WEBM, FLV, M4V, TS, M2TS, 3GP, MKV) and multiplex `.srt` subtitles and external audio tracks into **MKV (Matroska)** container files.

---

## 📋 Table of Contents

- [Overview](#-overview)
- [✨ Key Features](#-key-features)
- [🛠️ Project Architecture](#️-project-architecture)
- [📦 System Requirements](#-system-requirements)
- [🚀 Installation & Setup](#-installation--setup)
- [📖 Usage Guide](#-usage-guide)
  - [Mode 1: Folder Mode (Local System)](#mode-1-folder-mode-local-system)
  - [Mode 2: Import Files Mode (Upload & ZIP)](#mode-2-import-files-mode-upload--zip)
- [🔍 Language and Encoding Detection](#-language-and-encoding-detection)
- [🔌 REST API & SSE Reference](#-rest-api--sse-reference)
- [❓ Troubleshooting](#-troubleshooting)
- [📝 Changelog](#-changelog)

---

## 🌐 Overview

MKV Studio Converter was created to streamline media multiplexing workflows. It provides two integrated operating modes:
1. **Folder Mode**: Direct operation on local directories of the host system (ideal for processing large local media libraries without moving files).
2. **Import Files Mode**: Browser *drag & drop* upload saving files into an `input/` folder with automatic `.ZIP` package generation in `output/` for single or batch download.

The application includes intelligent language detection for subtitles and audio, encoding auto-detection, lossless video stream copying (`-c:v copy`), and a real-time interactive log terminal powered by Server-Sent Events (SSE).

---

## ✨ Key Features

- **Ultra-Fast Multiplexing (Soft Subtitles & Audios)**: Embed SRT subtitles and external audio tracks as selectable streams into MKV containers without re-encoding video (`-c:v copy`).
- **Subtitle Burn-in (Hard Subtitles)**: Option to render subtitles directly into video frames using H.264 video encoding (`libx264`, `-preset medium`, `-crf 23`).
- **Audio Multiplexing**: Support for external audio files (`.mp3`, `.m4a`, `.aac`, `.flac`, `.wav`, `.ogg`, `.ac3`, `.opus`, `.wma`) with language detection.
- **Intelligent Language Detection (ISO-639-1 / ISO-639-2)**:
  - Filename pattern analysis (e.g., `movie.pt-br.srt`, `movie.en.mp3`).
  - Text stopword analysis (Portuguese, English, Spanish, French, German, Italian) when subtitle filename does not indicate language.
  - Automatic language metadata embedding into MKV stream tags (`language=eng`, `title=English`).
- **Automatic Subtitle Encoding Detection**:
  - Strict validation per **RFC 3629** for UTF-8.
  - Support for UTF-8 BOM, UTF-16 LE/BE, and CP1252/Windows-1252.
  - Option to override encoding globally (`WINDOWS-1252`, `ISO-8859-1`, `UTF-8`, etc.).
- **Checksum Duplicate Check (SHA-256)**: When importing files, verifies filename and SHA-256 hash to prevent unnecessary file overwrites in `input/`.
- **Upload Progress Bar**: Real-time progress percentage tracking for file uploads in Import Mode.
- **Real-Time Logs & Progress Terminal (SSE)**:
  - Individual item percentage and overall batch progress tracking.
  - Real-time display of FFmpeg commands, warnings, system logs, and errors.
  - Terminal features for auto-scroll, log clearing, and quick log copying.
- **Safe Cancellation**: Graceful background process cancellation with immediate cleanup of spawned FFmpeg child processes.

---

## 🛠️ Project Architecture

```text
mkv_studio/
├── input/                    # Subfolder for imported uploaded files
├── output/                   # Subfolder for generated converted MKV files
├── lib/
│   ├── ffmpegRunner.js       # FFmpeg process worker (spawn, progress, cancellation)
│   ├── languageDetector.js   # RFC 3629 validator (UTF-8/UTF-16/CP1252) and language detector
│   ├── mkvZipHelper.js       # ZIP archive helper (PowerShell / zip CLI)
│   └── scanner.js            # Directory scanner & video/audio/subtitle matcher
├── public/
│   ├── css/
│   │   └── styles.css        # Modern dark glassmorphic Design System
│   ├── js/
│   │   └── app.js            # Frontend logic, tab control, and SSE event handlers
│   └── index.html            # Main User Interface
├── temp_storage/             # Auxiliary temporary storage
├── test_data/                # Sample test data
├── package.json              # Node.js project manifest & dependencies
├── server.js                 # HTTP server with REST API and Server-Sent Events (SSE)
├── start_server.bat          # Windows shortcut launcher script
└── readme.md                 # Project technical documentation
```

---

## 📦 System Requirements

- **Node.js**: Version 14.0 or higher.
- **FFmpeg**: **Required**. `ffmpeg` must be installed on the host system and available in system `PATH`.
  - To check installation, run: `ffmpeg -version`
- **PowerShell (Windows)** or **zip CLI (Linux/macOS)**: Used by `mkvZipHelper.js` to compress converted MKV files into a `.ZIP` download package.

---

## 🚀 Installation & Setup

1. **Clone or download the repository**:
   ```bash
   git clone <REPOSITORY_URL>
   cd mkv_studio
   ```

2. **Install Node.js dependencies**:
   ```bash
   npm install
   ```

3. **Start the server**:
   - **Via Docker Compose (Recommended - Lightweight Alpine Linux with built-in FFmpeg)**:
     ```bash
     docker compose up -d --build
     ```
   - **Via Docker CLI**:
     ```bash
     docker build -t mkv-studio .
     docker run -d -p 3000:3000 --name mkv_studio mkv-studio
     ```
   - **Via Node.js (Local)**:
     ```bash
     npm start
     ```
     or
     ```bash
     node server.js
     ```
   - **Via Windows Batch script**:
     Double-click [`start_server.bat`](file:///f:/developerenv/mkv_studio/start_server.bat).

4. **Access the application**:
   Open your browser and navigate to: [http://localhost:3000](http://localhost:3000)

---

## 📖 Usage Guide

### Mode 1: Folder Mode (Local System)

Use this mode if the server is running on the local computer or has access to local filesystem paths.

1. Select **Folder Mode (Local System)**.
2. Enter the **Source Folder** path (containing your videos, audios, and `.srt` files).
3. Enter the **Destination Folder** path (where `.mkv` files will be written).
4. Click **Validate** to verify path accessibility.
5. Click **Analyze Files**. The system scans the directory and automatically pairs video, audio, and subtitle files.
6. Configure track modes (Selectable, Burn-in, or None).
7. Click **Start MKV Conversion**.

---

### Mode 2: Import Files Mode (Upload & ZIP)

Use this mode to upload files through the browser interface.

1. Select **Import Files Mode (Upload & Download ZIP)**.
2. Drag & drop or click **Select Files** to choose videos, audio tracks, and `.srt` subtitles.
3. The real-time upload progress bar tracks file transfer into the `input/` folder while performing SHA-256 duplicate verification.
4. Click **Start MKV Conversion**.
5. Once complete, a download panel appears allowing individual `.mkv` file downloads or a single `.ZIP` archive download containing all output files from `output/`.

---

## 🔍 Language and Encoding Detection

The [`languageDetector.js`](file:///f:/developerenv/mkv_studio/lib/languageDetector.js) module handles detection in two stages:

1. **File Character Encoding**:
   - Checks BOM markers: `UTF-8` (`EF BB BF`), `UTF-16 LE` (`FF FE`), `UTF-16 BE` (`FE FF`).
   - Uses `isStrictUtf8` byte validator per **RFC 3629**.
   - Defaults to `CP1252 / Windows-1252` if UTF-8 validation fails.

2. **Language Detection**:
   - **Filename Patterns**: Matches suffixes like `.pt-br.srt`, `.por.srt`, `.en.srt`, `.eng.srt`, `.es.srt`, `.spa.srt`, etc.
   - **Content Analysis (Stopwords)**: If filename is generic, reads the first 50KB of `.srt` text, strips timestamps/HTML tags, and calculates language stopword scores for Portuguese, English, Spanish, French, German, and Italian.

---

## 🔌 REST API & SSE Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/events` | **Server-Sent Events (SSE)**. Streams real-time processing logs and progress updates. |
| `POST` | `/api/validate-path` | Accepts `{ pathDir }` and validates local directory existence. |
| `POST` | `/api/scan` | Accepts `{ sourceDir, destDir, forcedEncoding }` and scans matching files. |
| `POST` | `/api/upload-files` | Accepts `multipart/form-data` uploads into `input/` with SHA-256 check. |
| `POST` | `/api/convert` | Accepts item selection and track modes to trigger batch conversion. |
| `GET` | `/api/download/file` | Parameters: `sessionId`, `filename`. Downloads a generated MKV file. |
| `GET` | `/api/download/zip` | Parameter: `sessionId`. Generates and streams a ZIP file of output MKVs. |
| `POST` | `/api/cancel` | Cancels active batch conversion and terminates spawned FFmpeg processes. |

---

## ❓ Troubleshooting

#### 1. Garbled subtitle accents (e.g. `Ã§` or `?`)
- **Solution**: In **Subtitle & Transcoding Settings**, change **FFmpeg Subtitle Encoding** from `✨ Auto-detect` to `WINDOWS-1252 / CP1252` or `ISO-8859-1`.

#### 2. "FFmpeg not found" or "spawn ffmpeg ENOENT"
- **Solution**: FFmpeg is not installed or not in system `PATH`. Install FFmpeg, add its `bin` folder to system environment variables, and restart the server.

#### 3. ZIP Download Failure in Import Mode
- **Windows Solution**: Ensure PowerShell is enabled and permits running native compression commands (`Compress-Archive`).
- **Linux/macOS Solution**: Install `zip` CLI utility (`sudo apt install zip` or `brew install zip`).

---

## 📝 Changelog

### Version 1.2.0
- 📂 **Input and Output Folders**: Uploaded files in Import Mode save to `input/` and output MKV files save to `output/`.
- 📊 **Upload Progress Bar**: Added real-time progress bar when uploading files through the browser.
- 🔒 **SHA-256 Checksum Verification**: Validates existing filenames and SHA-256 hashes in `input/` to avoid redundant uploads.
- 🎵 **External Audio Multiplexing**: Support for external audio tracks (`.mp3`, `.m4a`, `.aac`, `.flac`, `.wav`, `.ogg`, `.ac3`, `.opus`, `.wma`).
- 🌐 **Audio Language Detection**: Filename language detection for audio files (defaults to `undefined` / `und`). Audio selection mode options are restricted to `selectable` and `none`.
- 🎨 **Visual Type Badges**: Interface icons and distinct color coding for subtitles (CC) and audio tracks (Music/Audio).
- 🌐 **Full English Localization**: Translated UI, log messages, server APIs, and documentation (`readme.md`) to English.
- 📦 **Version Bump**: Updated version number to `1.2.0` in [`package.json`](file:///f:/developerenv/mkv_studio/package.json).

### Version 1.1.0
- 🎬 **Burn-in Subtitle Exclusivity**: Selecting `burn` on any subtitle track automatically sets other subtitle tracks of the same video to `none`.
- ⚡ **Hardware Acceleration Selection**: Added hardware accelerator selection for FFmpeg (`CPU / libx264`, `NVIDIA NVENC`, `Intel QuickSync`, `AMD AMF`, `Linux VAAPI`, `Apple VideoToolbox`).
- 📦 **Version Bump**: Updated version number to `1.1.0` in [`package.json`](file:///f:/developerenv/mkv_studio/package.json).

---

## 📄 License

This project is licensed under the MIT License. Feel free to modify and redistribute.

*Developed with Node.js, Express & FFmpeg.*

