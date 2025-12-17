/**
 * Утилиты для скрытия цифрового отпечатка браузера
 * Помогает обойти детекцию автоматизации
 */

/**
 * Полный stealth скрипт для скрытия всех признаков автоматизации
 */
function getStealthScript() {
    return `
        (function() {
            'use strict';
            
            // 1. Скрываем webdriver
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
                configurable: true
            });
            
            // 2. Переопределяем plugins (реалистичные плагины)
            Object.defineProperty(navigator, 'plugins', {
                get: () => {
                    const plugins = [];
                    // Chrome PDF Plugin
                    plugins.push({
                        0: { type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format" },
                        description: "Portable Document Format",
                        filename: "internal-pdf-viewer",
                        length: 1,
                        name: "Chrome PDF Plugin"
                    });
                    // Chrome PDF Viewer
                    plugins.push({
                        0: { type: "application/pdf", suffixes: "pdf", description: "" },
                        description: "",
                        filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
                        length: 1,
                        name: "Chrome PDF Viewer"
                    });
                    // Native Client
                    plugins.push({
                        0: { type: "application/x-nacl", suffixes: "", description: "Native Client Executable" },
                        1: { type: "application/x-pnacl", suffixes: "", description: "Portable Native Client Executable" },
                        description: "",
                        filename: "internal-nacl-plugin",
                        length: 2,
                        name: "Native Client"
                    });
                    return plugins;
                },
                configurable: true
            });
            
            // 3. Переопределяем languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
                configurable: true
            });
            
            // 4. Добавляем chrome объект
            if (!window.chrome) {
                window.chrome = {};
            }
            window.chrome.runtime = {
                connect: function() {},
                sendMessage: function() {},
                onConnect: { addListener: function() {} },
                onMessage: { addListener: function() {} }
            };
            
            // 5. Переопределяем permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => {
                return parameters.name === 'notifications' 
                    ? Promise.resolve({ state: Notification.permission })
                    : originalQuery(parameters);
            };
            
            // 6. Реалистичные свойства hardware
            Object.defineProperty(navigator, 'hardwareConcurrency', {
                get: () => 8,
                configurable: true
            });
            
            Object.defineProperty(navigator, 'deviceMemory', {
                get: () => 8,
                configurable: true
            });
            
            // 7. Скрываем признаки автоматизации в window
            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
            
            // 8. Переопределяем getBattery (если есть)
            if (navigator.getBattery) {
                const originalGetBattery = navigator.getBattery;
                navigator.getBattery = function() {
                    return originalGetBattery.call(navigator).then(battery => {
                        // Возвращаем реалистичные значения
                        return battery;
                    });
                };
            }
            
            // 9. Скрываем признаки Playwright/Puppeteer
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
                configurable: true
            });
            
            // 10. Переопределяем toString для функций
            const getParameter = WebGLRenderingContext.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(parameter) {
                if (parameter === 37445) {
                    return 'Intel Inc.';
                }
                if (parameter === 37446) {
                    return 'Intel Iris OpenGL Engine';
                }
                return getParameter.call(this, parameter);
            };
            
            // 11. Скрываем признаки автоматизации в document
            Object.defineProperty(document, '$cdc_asdjflasutopfhvcZLmcfl_', {
                get: () => undefined,
                configurable: true
            });
            
            // 12. Реалистичные свойства платформы
            Object.defineProperty(navigator, 'platform', {
                get: () => 'Win32',
                configurable: true
            });
            
            // 13. Переопределяем connection (если есть)
            if (navigator.connection) {
                Object.defineProperty(navigator, 'connection', {
                    get: () => ({
                        effectiveType: '4g',
                        rtt: 50,
                        downlink: 10,
                        saveData: false
                    }),
                    configurable: true
                });
            }
            
            // 14. Скрываем признаки автоматизации в window.navigator
            const originalUserAgent = navigator.userAgent;
            Object.defineProperty(navigator, 'userAgent', {
                get: () => originalUserAgent,
                configurable: true
            });
            
            // 15. Переопределяем canvas fingerprint
            const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
            HTMLCanvasElement.prototype.toDataURL = function(type) {
                if (type === 'image/png' || type === 'image/jpeg') {
                    return originalToDataURL.apply(this, arguments);
                }
                return originalToDataURL.apply(this, arguments);
            };
            
            // 16. Скрываем признаки автоматизации в window
            Object.defineProperty(window, 'navigator', {
                value: new Proxy(navigator, {
                    has: (target, key) => {
                        if (key === 'webdriver') return false;
                        return key in target;
                    },
                    get: (target, key) => {
                        if (key === 'webdriver') return false;
                        return target[key];
                    }
                }),
                configurable: true
            });
            
            // 17. Реалистичные свойства экрана
            Object.defineProperty(screen, 'availWidth', {
                get: () => 1920,
                configurable: true
            });
            Object.defineProperty(screen, 'availHeight', {
                get: () => 1040,
                configurable: true
            });
            Object.defineProperty(screen, 'width', {
                get: () => 1920,
                configurable: true
            });
            Object.defineProperty(screen, 'height', {
                get: () => 1080,
                configurable: true
            });
            Object.defineProperty(screen, 'colorDepth', {
                get: () => 24,
                configurable: true
            });
            Object.defineProperty(screen, 'pixelDepth', {
                get: () => 24,
                configurable: true
            });
            
            // 18. Скрываем признаки автоматизации в консоли
            const originalLog = console.log;
            console.log = function(...args) {
                if (args.some(arg => typeof arg === 'string' && arg.includes('webdriver'))) {
                    return;
                }
                return originalLog.apply(console, args);
            };
            
            // 19. Переопределяем toString для объектов
            const originalToString = Function.prototype.toString;
            Function.prototype.toString = function() {
                if (this === navigator.getBattery || this === navigator.permissions.query) {
                    return originalToString.call(this);
                }
                return originalToString.call(this);
            };
            
            // 20. Скрываем признаки автоматизации в window.chrome
            if (window.chrome) {
                Object.defineProperty(window.chrome, 'loadTimes', {
                    get: () => ({
                        commitLoadTime: Date.now() / 1000 - Math.random() * 2,
                        connectionInfo: 'http/1.1',
                        finishDocumentLoadTime: Date.now() / 1000 - Math.random(),
                        finishLoadTime: Date.now() / 1000 - Math.random() * 0.5,
                        firstPaintAfterLoadTime: 0,
                        firstPaintTime: Date.now() / 1000 - Math.random() * 1.5,
                        navigationType: 'Other',
                        npnNegotiatedProtocol: 'unknown',
                        requestTime: Date.now() / 1000 - Math.random() * 3,
                        startLoadTime: Date.now() / 1000 - Math.random() * 3,
                        wasAlternateProtocolAvailable: false,
                        wasFetchedViaSpdy: false,
                        wasNpnNegotiated: false
                    }),
                    configurable: true
                });
                
                Object.defineProperty(window.chrome, 'runtime', {
                    get: () => ({
                        connect: function() {},
                        sendMessage: function() {},
                        onConnect: { addListener: function() {} },
                        onMessage: { addListener: function() {} }
                    }),
                    configurable: true
                });
            }
            
            // 21. Скрываем признаки автоматизации в document
            Object.defineProperty(document, 'hidden', {
                get: () => false,
                configurable: true
            });
            
            Object.defineProperty(document, 'visibilityState', {
                get: () => 'visible',
                configurable: true
            });
            
            // 22. Реалистичные свойства для navigator
            Object.defineProperty(navigator, 'maxTouchPoints', {
                get: () => 0,
                configurable: true
            });
            
            Object.defineProperty(navigator, 'vendor', {
                get: () => 'Google Inc.',
                configurable: true
            });
            
            Object.defineProperty(navigator, 'vendorSub', {
                get: () => '',
                configurable: true
            });
            
            // 23. Скрываем признаки автоматизации в window
            Object.defineProperty(window, 'outerWidth', {
                get: () => 1920,
                configurable: true
            });
            
            Object.defineProperty(window, 'outerHeight', {
                get: () => 1080,
                configurable: true
            });
            
            // 24. Переопределяем fetch для скрытия признаков
            const originalFetch = window.fetch;
            window.fetch = function(...args) {
                return originalFetch.apply(this, args);
            };
            
            // 25. Скрываем признаки автоматизации в Performance
            if (window.performance && window.performance.navigation) {
                Object.defineProperty(window.performance.navigation, 'type', {
                    get: () => 0,
                    configurable: true
                });
            }
            
            // 26. Реалистичные свойства для navigator.mimeTypes
            Object.defineProperty(navigator, 'mimeTypes', {
                get: () => {
                    const mimeTypes = [];
                    mimeTypes.push({
                        type: 'application/pdf',
                        suffixes: 'pdf',
                        description: 'Portable Document Format',
                        enabledPlugin: navigator.plugins[0]
                    });
                    return mimeTypes;
                },
                configurable: true
            });
            
            // 27. Скрываем признаки автоматизации в Date
            const originalDate = Date;
            Date.now = function() {
                return originalDate.now();
            };
            
            // 28. Переопределяем toString для скрытия признаков
            const originalToString = Object.prototype.toString;
            Object.prototype.toString = function() {
                if (this === navigator) {
                    return '[object Navigator]';
                }
                return originalToString.call(this);
            };
            
            // 29. Скрываем признаки автоматизации в window
            delete window.__playwright;
            delete window.__pw_manual;
            delete window.__PUPPETEER_WORLD__;
            delete window.__WEBDRIVER_ELEM_CACHE__;
            
            // 30. Реалистичные свойства для navigator
            Object.defineProperty(navigator, 'appCodeName', {
                get: () => 'Mozilla',
                configurable: true
            });
            
            Object.defineProperty(navigator, 'appName', {
                get: () => 'Netscape',
                configurable: true
            });
            
            Object.defineProperty(navigator, 'appVersion', {
                get: () => '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                configurable: true
            });
            
            // 31. Скрываем признаки автоматизации в console
            const originalError = console.error;
            console.error = function(...args) {
                if (args.some(arg => typeof arg === 'string' && arg.includes('webdriver'))) {
                    return;
                }
                return originalError.apply(console, args);
            };
            
            // 32. Реалистичные свойства для window
            Object.defineProperty(window, 'innerWidth', {
                get: () => 1920,
                configurable: true
            });
            
            Object.defineProperty(window, 'innerHeight', {
                get: () => 1080,
                configurable: true
            });
            
            // 33. Скрываем признаки автоматизации в document
            Object.defineProperty(document, 'documentElement', {
                get: () => document.documentElement,
                configurable: true
            });
            
            // 34. Переопределяем requestAnimationFrame для реалистичности
            const originalRAF = window.requestAnimationFrame;
            window.requestAnimationFrame = function(callback) {
                return originalRAF.call(window, callback);
            };
            
            // 35. Скрываем признаки автоматизации в window
            Object.defineProperty(window, 'chrome', {
                get: () => window.chrome,
                configurable: true,
                enumerable: true
            });
            
            console.log('✅ Stealth скрипт загружен');
        })();
    `;
}

/**
 * Получение улучшенных аргументов для браузера
 */
function getStealthArgs() {
    return [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-client-side-phishing-detection',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-domain-reliability',
        '--disable-extensions',
        '--disable-features=AudioServiceOutOfProcess',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-notifications',
        '--disable-offer-store-unmasked-wallet-cards',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-renderer-backgrounding',
        '--disable-setuid-sandbox',
        '--disable-speech-api',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--ignore-gpu-blacklist',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-pings',
        '--password-store=basic',
        '--use-mock-keychain',
        '--window-size=1920,1080',
        '--start-maximized'
    ];
}

/**
 * Получение реалистичного User-Agent
 */
function getRealisticUserAgent() {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

/**
 * Получение реалистичных заголовков HTTP
 */
function getRealisticHeaders(userAgent) {
    const acceptLanguage = [
        'en-US,en;q=0.9',
        'en-US,en;q=0.9,ru;q=0.8',
        'en-GB,en;q=0.9',
        'en-US,en;q=0.9,ar;q=0.8'
    ];
    
    return {
        'Accept-Language': acceptLanguage[Math.floor(Math.random() * acceptLanguage.length)],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
    };
}

module.exports = {
    getStealthScript,
    getStealthArgs,
    getRealisticUserAgent,
    getRealisticHeaders
};





