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

# Копируем весь код парсера в контейнер
COPY . .

# Создаем необходимые директории и устанавливаем права
RUN mkdir -p /app/data /app/logs && \
    chown -R parser:parser /app

# Переключаемся на пользователя parser
USER parser

# Открываем порт (если потребуется)
EXPOSE 3000

# Добавляем healthcheck
HEALTHCHECK --interval=60s --timeout=10s --start-period=120s --retries=3 \
    CMD node -e "process.exit(0)"

# Запускаем парсер
CMD ["node", "--expose-gc", "--max-old-space-size=512", "src/index.js", "cycle"]