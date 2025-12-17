/**
 * Общие утилиты для парсеров (SOLID, DRY, KISS)
 */

/**
 * Безопасное выполнение функции на странице
 * @param {Object} page - Страница Playwright
 * @param {string} selector - CSS селектор
 * @param {Function} fn - Функция для выполнения на элементе
 * @param {*} defaultValue - Значение по умолчанию при ошибке
 * @returns {Promise<*>}
 */
async function safeEval(page, selector, fn, defaultValue = null) {
    try {
        const element = await page.$(selector);
        if (!element) {
            return defaultValue;
        }
        return await page.evaluate(fn, element);
    } catch (error) {
        return defaultValue;
    }
}

/**
 * Создание страницы с оптимизированными настройками
 * @param {Object} context - Контекст браузера
 * @param {Object} config - Конфигурация
 * @returns {Promise<Object>}
 */
async function createOptimizedPage(context, config = {}) {
    const page = await context.newPage();
    
    // Заголовки устанавливаются автоматически в утилите пагинации или при создании контекста
    
    // Блокируем ненужные ресурсы для ускорения
    await page.route('**/*', (route) => {
        const resourceType = route.request().resourceType();
        const url = route.request().url();
        
        // Блокируем изображения если не включена загрузка
        if (resourceType === 'image' && !config.enableImageLoading) {
            route.abort();
            return;
        }
        
        // Блокируем ненужные ресурсы
        if (resourceType === 'stylesheet' || 
            resourceType === 'font' ||
            resourceType === 'media' ||
            resourceType === 'websocket' ||
            url.includes('analytics') ||
            url.includes('tracking') ||
            url.includes('advertisement')) {
            route.abort();
            return;
        }
        
        route.continue();
    });

    return page;
}

/**
 * Задержка
 * @param {number} ms - Миллисекунды
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Проверка наличия капчи на странице
 * @param {Object} page - Страница Playwright
 * @returns {Promise<Object>}
 */
async function checkCaptcha(page) {
    try {
        const captchaInfo = await page.evaluate(() => {
            const amazonWafSelectors = [
                '#captcha-container',
                '#amzn-captcha-verify-button',
                '.amzn-captcha-verify-button',
                '.amzn-captcha-modal'
            ];
            
            for (const selector of amazonWafSelectors) {
                if (document.querySelector(selector)) {
                    return { hasCaptcha: true, type: 'Amazon WAF' };
                }
            }
            
            const bodyText = document.body ? document.body.textContent : '';
            if (bodyText.includes('Let\'s confirm you are human') ||
                bodyText.includes('Complete the security check') ||
                bodyText.includes('Choose all') ||
                bodyText.includes('Before proceeding to your request')) {
                return { hasCaptcha: true, type: 'Amazon WAF' };
            }
            
            return { hasCaptcha: false, type: null };
        });
        
        return captchaInfo;
    } catch (error) {
        return { hasCaptcha: false, type: null };
    }
}

/**
 * Нормализация данных автомобиля
 * @param {Object} rawData - Сырые данные
 * @param {Object} defaults - Значения по умолчанию
 * @returns {Object}
 */
function normalizeCarData(rawData, defaults = {}) {
    const defaultValues = {
        short_url: null,
        title: "Неизвестно",
        make: "Неизвестно",
        model: "Неизвестно",
        year: "Неизвестно",
        body_type: "Неизвестно",
        horsepower: "Неизвестно",
        fuel_type: "Неизвестно",
        motors_trim: "Неизвестно",
        kilometers: 0,
        price_formatted: "0",
        price_raw: 0,
        currency: "Неизвестно",
        exterior_color: "Неизвестно",
        location: "Неизвестно",
        phone: "Не указан",
        seller_name: "Неизвестен",
        seller_type: "Неизвестен",
        seller_logo: null,
        seller_profile_link: null,
        main_image: null,
        ...defaults
    };

    // Функция для безопасного извлечения значения
    const getValue = (path) => {
        const keys = path.split('.');
        let value = rawData;
        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return null;
            }
        }
        return value;
    };

    // Нормализация с поддержкой вложенных путей
    return {
        short_url: rawData.short_url || defaultValues.short_url,
        title: rawData.title || defaultValues.title,
        make: rawData.make || getValue('sellers.sellerName') || defaultValues.make,
        model: rawData.model || defaultValues.model,
        year: rawData.year || defaultValues.year,
        body_type: rawData.body_type || rawData.bodyType || defaultValues.body_type,
        horsepower: rawData.horsepower || defaultValues.horsepower,
        fuel_type: rawData.fuel_type || rawData.fuelType || defaultValues.fuel_type,
        motors_trim: rawData.motors_trim || rawData.motorsTrim || defaultValues.motors_trim,
        kilometers: rawData.kilometers || rawData.mileage || defaultValues.kilometers,
        price_formatted: rawData.price_formatted || getValue('price.formatted') || defaultValues.price_formatted,
        price_raw: rawData.price_raw || getValue('price.raw') || parseFloat(rawData.price_raw) || defaultValues.price_raw,
        currency: rawData.currency || getValue('price.currency') || defaultValues.currency,
        exterior_color: rawData.exterior_color || rawData.exteriorColor || rawData.color || defaultValues.exterior_color,
        location: rawData.location || defaultValues.location,
        phone: rawData.phone || getValue('contact.phone') || defaultValues.phone,
        seller_name: rawData.seller_name || getValue('sellers.sellerName') || defaultValues.seller_name,
        seller_type: rawData.seller_type || getValue('sellers.sellerType') || defaultValues.seller_type,
        seller_logo: rawData.seller_logo || getValue('sellers.sellerLogo') || defaultValues.seller_logo,
        seller_profile_link: rawData.seller_profile_link || getValue('sellers.sellerProfileLink') || defaultValues.seller_profile_link,
        main_image: rawData.main_image || rawData.mainImage || (rawData.photos && rawData.photos[0]) || defaultValues.main_image
    };
}

/**
 * Извлечение текста из элемента
 * @param {Object} page - Страница
 * @param {string} selector - Селектор
 * @param {string} defaultValue - Значение по умолчанию
 * @returns {Promise<string>}
 */
async function extractText(page, selector, defaultValue = "Не указано") {
    return safeEval(
        page,
        selector,
        (el) => el.textContent?.trim() || defaultValue,
        defaultValue
    );
}

/**
 * Извлечение атрибута из элемента
 * @param {Object} page - Страница
 * @param {string} selector - Селектор
 * @param {string} attribute - Атрибут
 * @param {string} defaultValue - Значение по умолчанию
 * @returns {Promise<string>}
 */
async function extractAttribute(page, selector, attribute, defaultValue = null) {
    return safeEval(
        page,
        selector,
        (el) => el.getAttribute(attribute) || defaultValue,
        defaultValue
    );
}

/**
 * Извлечение URL из элемента
 * @param {Object} page - Страница
 * @param {string} selector - Селектор
 * @param {string} baseUrl - Базовый URL
 * @returns {Promise<string|null>}
 */
async function extractUrl(page, selector, baseUrl = '') {
    const href = await extractAttribute(page, selector, 'href');
    if (!href) return null;
    
    if (href.startsWith('http')) return href;
    if (href.startsWith('/')) return baseUrl + href;
    return baseUrl + '/' + href;
}

/**
 * Парсинг цены из текста
 * @param {string} priceText - Текст с ценой
 * @returns {Object}
 */
function parsePrice(priceText) {
    if (!priceText) {
        return { formatted: "0", raw: 0, currency: "Неизвестно" };
    }

    // Извлекаем число
    const numbers = priceText.replace(/[^\d,]/g, '').replace(/,/g, '');
    const raw = parseFloat(numbers) || 0;

    // Определяем валюту
    let currency = "Неизвестно";
    if (priceText.includes('AED') || priceText.includes('د.إ')) {
        currency = 'AED';
    } else if (priceText.includes('USD') || priceText.includes('$')) {
        currency = 'USD';
    } else if (priceText.includes('EUR') || priceText.includes('€')) {
        currency = 'EUR';
    }

    return {
        formatted: priceText.trim(),
        raw,
        currency
    };
}

/**
 * Валидация данных автомобиля
 * @param {Object} data - Данные для валидации
 * @returns {boolean}
 */
function validateCarData(data) {
    if (!data) return false;
    if (!data.short_url) return false;
    if (!data.title || data.title === "Неизвестно") return false;
    return true;
}

module.exports = {
    safeEval,
    createOptimizedPage,
    delay,
    checkCaptcha,
    normalizeCarData,
    extractText,
    extractAttribute,
    extractUrl,
    parsePrice,
    validateCarData
};

