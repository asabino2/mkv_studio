# 🎬 MKV Studio Converter

> **Multiplexador Inteligente de Vídeo e Legendas SRT com Suporte a Pastas Locais, Upload Drag & Drop e Download ZIP em Lote.**

[![Node.js](https://img.shields.io/badge/Node.js-v14%2B-green.svg)](https://nodejs.org/)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-Required-red.svg)](https://ffmpeg.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](#licença)

O **MKV Studio Converter** é uma aplicação web completa, moderna e de alto desempenho desenvolvida para converter vídeos (MP4, AVI, MOV, WMV, WEBM, FLV, M4V, TS, M2TS, 3GP, MKV) e embutir legendas `.srt` em arquivos no formato contêiner **MKV (Matroska)**.

---

## 📋 Sumário

- [Visão Geral](#-visão-geral)
- [✨ Principais Recursos](#-principais-recursos)
- [🛠️ Arquitetura do Projeto](#️-arquitetura-do-projeto)
- [📦 Requisitos do Sistema](#-requisitos-do-sistema)
- [🚀 Como Instalar e Executar](#-como-instalar-e-executar)
- [📖 Guia de Uso](#-guia-de-uso)
  - [Modo 1: Modo Pasta (Sistema Local)](#modo-1-modo-pasta-sistema-local)
  - [Modo 2: Modo Importar Arquivos (Upload & ZIP)](#modo-2-modo-importar-arquivos-upload--zip)
- [🔍 Detecção de Idioma e Encoding](#-detecção-de-idioma-e-encoding)
- [🔌 Referência da API REST & SSE](#-referência-da-api-rest--sse)
- [❓ Solução de Problemas (Troubleshooting)](#-solução-de-problemas-troubleshooting)
- [📝 Changelog](#-changelog)

---

## 🌐 Visão Geral

O MKV Studio Converter foi criado para simplificar o fluxo de trabalho de multiplexação de mídia. Ele oferece duas abordagens de trabalho integradas:
1. **Modo Pasta**: Operação direta em diretórios locais do sistema operacional (ideal para processar grandes bibliotecas de mídia sem mover arquivos).
2. **Modo Importar Arquivos**: Upload por *drag & drop* através do navegador com geração automática de pacotes `.ZIP` para download individual ou em lote.

A aplicação inclui detecção inteligente de idioma e codificação de legenda, embutimento sem perda de qualidade visual (*stream copy*) e terminal interativo em tempo real via Server-Sent Events (SSE).

---

## ✨ Principais Recursos

- **Multiplexação Ultra Rápida (Soft Subtitles)**: Embutimento de legendas SRT como faixas ativáveis/desativáveis no contêiner MKV sem re-encodificar o vídeo (`-c:v copy`).
- **Queima de Legendas no Vídeo (Hard Subtitles / Burn-in)**: Opção para renderizar legendas diretamente nos *frames* do vídeo utilizando o codec H.264 (`libx264`, `-preset medium`, `-crf 23`).
- **Detecção Inteligente de Idioma (ISO-639-1 / ISO-639-2)**:
  - Análise por nome do arquivo (ex: `filme.pt-br.srt`, `movie.en.srt`).
  - Análise linguística por *stopwords* (Português, Inglês, Espanhol, Francês, Alemão e Italiano) caso o nome não indique o idioma.
  - Inserção automática de metadados de idioma no contêiner MKV (`language=por`, `title=Português`).
- **Detecção Automática de Encoding de Legenda**:
  - Validação estrita conforme **RFC 3629** para UTF-8.
  - Suporte a UTF-8 BOM, UTF-16 LE/BE e CP1252/Windows-1252 (evitando erros de acentuação).
  - Opção para forçar codificação globalmente (`WINDOWS-1252`, `ISO-8859-1`, `UTF-8`, etc.).
- **Terminal de Logs e Progresso em Tempo Real (SSE)**:
  - Acompanhamento de porcentagem por arquivo e progresso geral do lote.
  - Exibição em tempo real de comandos FFmpeg, avisos, logs de sistema e erros.
  - Recursos de auto-scroll, limpeza e cópia rápida de logs.
- **Cancelamento Seguro**: Interrupção limpa de processos em segundo plano com encerramento de subprocessos do FFmpeg.

---

## 🛠️ Arquitetura do Projeto

```text
mkv_studio/
├── lib/
│   ├── ffmpegRunner.js       # Gerenciador de processos FFmpeg (spawn, progresso e cancelamento)
│   ├── languageDetector.js   # Validador RFC 3629 (UTF-8/UTF-16/CP1252) e reconhecedor de idiomas
│   ├── mkvZipHelper.js       # Gerador de pacotes ZIP (PowerShell / zip CLI)
│   └── scanner.js            # Escaneamento de pastas e pareamento de vídeos/legendas
├── public/
│   ├── css/
│   │   └── styles.css        # Design System glassmorphic escuro moderno
│   ├── js/
│   │   └── app.js            # Lógica do frontend, gerenciamento de abas e consumo de SSE
│   └── index.html            # Interface de usuário principal
├── temp_storage/             # Armazenamento temporário para uploads e saídas ZIP
├── test_data/                # Arquivos de teste e dados de amostra
├── package.json              # Configurações e dependências do Node.js
├── server.js                 # Servidor HTTP nativo com API REST e Server-Sent Events (SSE)
├── start_server.bat          # Atalho para inicialização rápida no Windows
└── readme.md                 # Documentação técnica do projeto
```

---

## 📦 Requisitos do Sistema

- **Node.js**: Versão 14.0 ou superior.
- **FFmpeg**: É **obrigatório** ter o `ffmpeg` instalado no sistema e acessível nas variáveis de ambiente (`PATH`).
  - Para verificar se está instalado, execute no terminal: `ffmpeg -version`
- **PowerShell (Windows)** ou **zip CLI (Linux/macOS)**: Utilizados pelo módulo `mkvZipHelper.js` para compactar os arquivos de download em ZIP.

---

## 🚀 Como Instalar e Executar

1. **Clonar ou baixar o repositório**:
   ```bash
   git clone <URL_DO_REPOSITORIO>
   cd mkv_studio
   ```

2. **Instalar as dependências do Node.js**:
   ```bash
   npm install
   ```

3. **Iniciar o servidor**:
   - **Via Docker Compose (Recomendado - Alpine Linux leve com FFmpeg integrado)**:
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
     ou
     ```bash
     node server.js
     ```
   - **Via script Batch (Windows)**:
     Dê um duplo clique no arquivo [`start_server.bat`](file:///f:/developerenv/mkv_studio/start_server.bat).

4. **Acessar a aplicação**:
   Abra o navegador e acesse: [http://localhost:3000](http://localhost:3000)

---

## 📖 Guia de Uso

### Modo 1: Modo Pasta (Sistema Local)

Utilize este modo se o servidor estiver rodando no mesmo computador ou servidor com acesso ao sistema de arquivos local.

1. Selecione a aba **Modo Pasta (Sistema Local)**.
2. Informe o caminho da **Pasta de Origem** (onde estão seus vídeos e arquivos `.srt`).
3. Informe o caminho da **Pasta de Destino** (onde os arquivos `.mkv` serão salvos).
4. Clique em **Validar** para confirmar se o sistema consegue acessar as pastas.
5. Clique em **Analisar Arquivos**. O sistema lista todos os vídeos e vincula automaticamente as legendas detectadas.
6. Ajuste a modalidade de cada legenda (Selecionável ou Queimar no Vídeo).
7. Clique em **Iniciar Conversão MKV**.

---

### Modo 2: Modo Importar Arquivos (Upload & ZIP)

Utilize este modo para enviar arquivos via navegador a partir de qualquer dispositivo.

1. Selecione a aba **Modo Importar Arquivos (Upload & Download ZIP)**.
2. Arraste e solte ou clique em **Selecionar Arquivos** para escolher vídeos (`.mp4`, `.avi`, `.mkv`...) e legendas (`.srt`).
3. O sistema enviará os arquivos para uma sessão temporária e realizará a análise automática.
4. Clique em **Iniciar Conversão MKV**.
5. Ao concluir, um painel de downloads será exibido permitindo baixar os arquivos `.mkv` individualmente ou fazer o download de um único arquivo `.ZIP` contendo todo o lote.

---

## 🔍 Detecção de Idioma e Encoding

O módulo [`languageDetector.js`](file:///f:/developerenv/mkv_studio/lib/languageDetector.js) atua em duas etapas:

1. **Codificação do Arquivo (Encoding)**:
   - Checa os marcadores BOM: `UTF-8` (`EF BB BF`), `UTF-16 LE` (`FF FE`), `UTF-16 BE` (`FE FF`).
   - Aplica a função `isStrictUtf8` para validar a conformidade dos bytes segundo o **RFC 3629**.
   - Se a validação falhar, assume o padrão ocidental `CP1252 / Windows-1252`.

2. **Detecção do Idioma**:
   - **Nome do Arquivo**: Procura padrões como `.pt-br.srt`, `.pt.srt`, `.por.srt`, `.en.srt`, `.eng.srt`, `.es.srt`, `.spa.srt`, etc.
   - **Conteúdo (Stopwords)**: Se o nome for genérico (ex: `legenda.srt`), faz a leitura dos primeiros 50.000 bytes, remove marcadores de tempo/tags HTML e calcula pontuações de palavras de parada (*stopwords*) em Português, Inglês, Espanhol, Francês, Alemão e Italiano.

---

## 🔌 Referência da API REST & SSE

| Método | Rota | Descrição |
| :--- | :--- | :--- |
| `GET` | `/api/events` | **Server-Sent Events (SSE)**. Transmite logs do sistema e atualizações de progresso em tempo real. |
| `POST` | `/api/validate-path` | Recebe `{ pathDir }` e valida se a pasta existe e é acessível no sistema local. |
| `POST` | `/api/scan` | Recebe `{ sourceDir, destDir, forcedEncoding }` e escaneia a pasta vinculando vídeos e legendas. |
| `POST` | `/api/upload-files` | Recebe formulário `multipart/form-data` com arquivos de vídeo e legendas SRT. |
| `POST` | `/api/convert` | Recebe a lista de itens selecionados e configurações de legendas para iniciar a conversão em lote. |
| `GET` | `/api/download/file` | Parâmetros: `sessionId` e `filename`. Realiza download de um arquivo MKV gerado. |
| `GET` | `/api/download/zip` | Parâmetro: `sessionId`. Gera e envia o pacote ZIP de todos os arquivos MKV convertidos. |
| `POST` | `/api/cancel` | Interrompe imediatamente o processamento ativo do lote e encerra os processos FFmpeg. |

---

## ❓ Solução de Problemas (Troubleshooting)

#### 1. Acentuação incorreta nas legendas (caracteres estranhos como `Ã§` ou `?`)
- **Solução**: No painel **Configurações da Legenda no MKV**, altere a opção **Codificação da Legenda no FFmpeg** de `✨ Auto-detectar` para `WINDOWS-1252 / CP1252 (Legendas em Português/ANSI)` ou `ISO-8859-1`.

#### 2. Erro "FFmpeg não encontrado" ou "spawn ffmpeg ENOENT"
- **Solução**: O FFmpeg não está instalado ou não foi adicionado às variáveis de ambiente do sistema. Baixe o FFmpeg, adicione a pasta `bin` ao `PATH` e reinicie o terminal/aplicação.

#### 3. Falha ao gerar arquivo ZIP no Modo Importar
- **Solução (Windows)**: Certifique-se de que o PowerShell está habilitado e permite a execução de comandos nativos (`Compress-Archive`).
- **Solução (Linux/macOS)**: Instale o utilitário `zip` (`sudo apt install zip` ou `brew install zip`).

---

## 📝 Changelog

### Versão 1.1.0
- 🎬 **Exclusividade de Queima de Legenda (Burn-in)**: Ao selecionar a opção `burn` em qualquer faixa de legenda de um vídeo, todas as demais legendas desse mesmo vídeo são ajustadas automaticamente para `none`.
- ⚡ **Seleção de Acelerador de Hardware**: Adicionada opção no painel de configurações para o usuário escolher o acelerador de vídeo utilizado pelo FFmpeg (`CPU / libx264`, `NVIDIA NVENC`, `Intel QuickSync`, `AMD AMF`, `Linux VAAPI`, `Apple VideoToolbox`).
- 📦 **Atualização de Versão**: Atualizado o número de versão no [`package.json`](file:///f:/developerenv/mkv_studio/package.json) para `1.1.0`.

---

## 📄 Licença

Este projeto é fornecido sob a licença MIT. Sinta-se livre para modificar, redistribuir e aprimorar.

*Desenvolvido com Node.js, Express & FFmpeg.*
