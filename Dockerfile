# Используем образ с Playwright
FROM mcr.microsoft.com/playwright:v1.50.1-jammy

# Создаем пользователя для безопасности
RUN groupadd -r parser && useradd -r -g parser -m parser

# Устанавливаем рабочую директорию внутри контейнера
WORKDIR /app

# Копируем package.json и package-lock.json перед установкой зависимостей
COPY package*.json ./

# Устанавливаем зависимости (включая Playwright)
RUN npm ci --only=production && \
    npm cache clean --force

# Копируем весь код парсера в контейнер
COPY . .

# Создаем необходимые директории
RUN mkdir -p /app/data /app/logs && \
    chown -R parser:parser /app

# Переключаемся на пользователя parser
USER parser

# Устанавливаем браузеры Playwright под пользователем parser
RUN npx playwright install chromium

# Открываем порт (если потребуется)
EXPOSE 3000

# Добавляем healthcheck
HEALTHCHECK --interval=60s --timeout=10s --start-period=120s --retries=3 \
    CMD node -e "process.exit(0)"

# Запускаем парсер
CMD ["node", "--expose-gc", "--max-old-space-size=512", "src/index.js", "cycle"]