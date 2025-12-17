# Используем образ с Playwright
FROM mcr.microsoft.com/playwright:v1.50.1-jammy

# Устанавливаем рабочую директорию внутри контейнера
WORKDIR /app

# Копируем package.json и package-lock.json перед установкой зависимостей
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install --production --no-audit --no-fund && \
    npm cache clean --force

# Устанавливаем браузеры Playwright (до переключения пользователя)
RUN npx playwright install chromium

# Создаем пользователя для безопасности
RUN groupadd -r parser && useradd -r -g parser -m parser

# Устанавливаем su-exec для переключения пользователя
RUN apt-get update && \
    apt-get install -y su-exec && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Копируем весь код парсера в контейнер
COPY . .

# Создаем entrypoint скрипт для установки прав (запускается от root)
RUN echo '#!/bin/sh\n\
set -e\n\
# Создаем директории с правильными правами (от root)\n\
mkdir -p /app/logs /app/data\n\
chown -R parser:parser /app/logs /app/data 2>/dev/null || true\n\
# Переключаемся на пользователя parser и запускаем команду\n\
exec su-exec parser "$@"' > /entrypoint.sh && \
    chmod +x /entrypoint.sh

# Создаем необходимые директории
RUN mkdir -p /app/data /app/logs && \
    chown -R parser:parser /app

# Оставляем root для entrypoint (он переключится на parser через su-exec)
# USER parser

# Устанавливаем entrypoint
ENTRYPOINT ["/entrypoint.sh"]

# Открываем порт (если потребуется)
EXPOSE 3000

# Добавляем healthcheck
HEALTHCHECK --interval=60s --timeout=10s --start-period=120s --retries=3 \
    CMD node -e "process.exit(0)"

# Запускаем парсер
CMD ["node", "--expose-gc", "--max-old-space-size=512", "src/index.js", "cycle"]