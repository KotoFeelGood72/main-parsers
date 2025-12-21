const { chromium } = require('playwright');
const { getStealthArgs, getRealisticUserAgent, getRealisticHeaders } = require('./stealth');

async function startBrowser(options = {}) {
    // Определяем режим: headless в Docker, обычный режим локально
    // Но позволяем переопределить через options
    // const isHeadless = options.headless !== undefined 
    //     ? options.headless 
    //     : (process.env.NODE_ENV === 'production' || process.env.DOCKER === 'true');
    
    // Используем улучшенные stealth аргументы
    const stealthArgs = getStealthArgs();
    
    const browser = await chromium.launch({ 
        headless: false,
        // headless: isHeadless,
        args: stealthArgs,
        ...options
    });
    return browser;
}

/**
 * Создание контекста браузера с полной защитой от fingerprinting
 */
async function createStealthContext(browser, options = {}) {
    const userAgent = options.userAgent || getRealisticUserAgent();
    const headers = getRealisticHeaders(userAgent);
    
    const contextOptions = {
        viewport: { width: 1920, height: 1080 },
        userAgent: userAgent,
        locale: options.locale || 'en-US',
        timezoneId: options.timezoneId || 'America/New_York',
        permissions: options.permissions || ['geolocation'],
        geolocation: options.geolocation || { latitude: 25.2048, longitude: 55.2708 },
        extraHTTPHeaders: {
            ...headers,
            ...(options.extraHTTPHeaders || {})
        },
        ignoreHTTPSErrors: true,
        ...options
    };
    
    const context = await browser.newContext(contextOptions);
    
    // Добавляем полный stealth скрипт
    const { getStealthScript } = require('./stealth');
    await context.addInitScript(getStealthScript());
    
    return context;
}

// Функция для мониторинга памяти
function logMemoryUsage() {
    const used = process.memoryUsage();
    console.log(`📊 Использование памяти:
    RSS: ${Math.round(used.rss / 1024 / 1024)} MB
    Heap Used: ${Math.round(used.heapUsed / 1024 / 1024)} MB
    Heap Total: ${Math.round(used.heapTotal / 1024 / 1024)} MB
    External: ${Math.round(used.external / 1024 / 1024)} MB`);
}

// Принудительная очистка памяти
function forceGarbageCollection() {
    if (global.gc) {
        global.gc();
        console.log('🗑️ Принудительная очистка памяти выполнена');
    }
}

module.exports = { 
    startBrowser, 
    createStealthContext,
    logMemoryUsage, 
    forceGarbageCollection 
};