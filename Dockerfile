# ==========================================
# MKV Studio Converter - Dockerfile (Alpine)
# ==========================================
FROM node:20-alpine

# Instalar dependências de sistema necessárias no Alpine:
# - git: para baixar o código-fonte do GitHub
# - ffmpeg: processamento de mídia e multiplexação
# - zip: criação de arquivos compactados .zip
# - fontconfig e ttf-dejavu: fontes requeridas para renderização de legendas (burn-in)
RUN apk add --no-cache \
    git \
    ffmpeg \
    zip \
    fontconfig \
    ttf-dejavu

# Define o diretório de trabalho na imagem
WORKDIR /app

# Baixar/Clonar a versão mais recente do aplicativo a partir do GitHub
RUN git clone https://github.com/asabino2/mkv_studio.git .

# Instalar apenas dependências de produção do Node.js
RUN npm ci --omit=dev

# Criar diretórios de armazenamento e montagem de mídia
RUN mkdir -p /app/temp_storage /app/media/source /app/media/dest

# Porta em que o servidor irá escutar
EXPOSE 3000

# Variável de ambiente da porta
ENV PORT=3000

# Comando de execução da aplicação
CMD ["node", "server.js"]
