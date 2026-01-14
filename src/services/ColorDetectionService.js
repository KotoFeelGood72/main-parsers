const axios = require('axios');
const { loggerService } = require('./LoggerService');

/**
 * Сервис для определения цвета автомобиля по фотографии
 * Использует Sharp для анализа изображений
 */
function createColorDetectionService(config = {}) {
    const defaultConfig = {
        timeout: 10000,
        maxRetries: 2,
        ...config
    };

    const state = {
        config: defaultConfig
    };

    /**
     * Маппинг цветов к стандартным названиям
     */
    const colorMapping = {
        // Английские названия
        'white': 'Белый',
        'black': 'Черный',
        'silver': 'Серебристый',
        'gray': 'Серый',
        'grey': 'Серый',
        'red': 'Красный',
        'blue': 'Синий',
        'green': 'Зеленый',
        'yellow': 'Желтый',
        'orange': 'Оранжевый',
        'brown': 'Коричневый',
        'beige': 'Бежевый',
        'gold': 'Золотой',
        'bronze': 'Бронзовый',
        'purple': 'Фиолетовый',
        'pink': 'Розовый',
        // Русские названия (оставляем как есть)
        'Белый': 'Белый',
        'Черный': 'Черный',
        'Серебристый': 'Серебристый',
        'Серый': 'Серый',
        'Красный': 'Красный',
        'Синий': 'Синий',
        'Зеленый': 'Зеленый',
        'Желтый': 'Желтый',
        'Оранжевый': 'Оранжевый',
        'Коричневый': 'Коричневый',
        'Бежевый': 'Бежевый',
        'Золотой': 'Золотой',
        'Бронзовый': 'Бронзовый',
        'Фиолетовый': 'Фиолетовый',
        'Розовый': 'Розовый'
    };

    /**
     * Нормализация названия цвета
     */
    function normalizeColor(colorName) {
        if (!colorName) return 'Неизвестно';
        
        const normalized = colorName.trim().toLowerCase();
        return colorMapping[normalized] || colorMapping[colorName] || colorName;
    }

    /**
     * Конвертация RGB в название цвета
     * Улучшенная логика определения цвета по RGB значениям
     */
    function rgbToColorName(rgb) {
        const r = rgb.red || rgb.r || 0;
        const g = rgb.green || rgb.g || 0;
        const b = rgb.blue || rgb.b || 0;

        // Нормализуем значения (0-255)
        const maxVal = Math.max(r, g, b);
        const minVal = Math.min(r, g, b);
        const diff = maxVal - minVal;
        const sum = r + g + b;
        const avg = sum / 3;

        // Белый - все каналы высокие и близкие
        if (avg > 200 && diff < 40) return 'Белый';
        
        // Черный - улучшенная логика с учетом отражений
        // Черные автомобили могут иметь отражения неба (синие) или солнца (белые блики)
        // Поэтому проверяем, что среднее значение низкое, даже если есть светлые участки
        // Приоритет черному цвету, если он темный, даже при наличии отражений
        if (avg < 120) {
            // Если среднее очень низкое - точно черный
            if (avg < 60 && diff < 50) return 'Черный';
            // Если среднее низкое, но есть светлые участки (отражения) - тоже черный
            if (avg < 90 && maxVal < 200) return 'Черный';
            // Если среднее низкое и разница небольшая - черный
            if (avg < 80 && diff < 70) return 'Черный';
            // Если среднее низкое, но есть контраст (отражения) - черный
            if (avg < 100 && minVal < 50 && diff > 40) return 'Черный';
        }
        
        // Серебристый/Серый - средние значения, низкая насыщенность
        if (avg > 120 && avg < 200 && diff < 50) {
            if (avg > 150) return 'Серебристый';
            return 'Серый';
        }

        // Определяем доминирующий канал
        const maxChannel = r > g && r > b ? 'r' : (g > b ? 'g' : 'b');
        
        // Красный
        if (maxChannel === 'r' && r > 150 && r > g * 1.3 && r > b * 1.3) {
            if (g > 100 && b < 80) return 'Оранжевый';
            if (g < 50 && b < 50) return 'Красный';
        }
        
        // Синий
        if (maxChannel === 'b' && b > 150 && b > r * 1.3 && b > g * 1.3) {
            if (r > 100 && g < 100) return 'Фиолетовый';
            return 'Синий';
        }
        
        // Зеленый
        if (maxChannel === 'g' && g > 150 && g > r * 1.3 && g > b * 1.3) {
            return 'Зеленый';
        }
        
        // Желтый - высокие R и G, низкий B
        if (r > 180 && g > 150 && b < 120 && r > b * 1.5 && g > b * 1.5) {
            if (r > 220 && g > 200) return 'Желтый';
            if (r > 200 && g > 120) return 'Золотой';
        }
        
        // Коричневый - средние R и G, низкий B
        if (r > 100 && r < 180 && g > 80 && g < 150 && b < 100) {
            return 'Коричневый';
        }
        
        // Бежевый - светлые оттенки коричневого
        if (avg > 150 && avg < 220 && r > 150 && g > 130 && b > 100 && b < 150) {
            return 'Бежевый';
        }

        // Если ничего не подошло, но есть доминирующий цвет
        if (diff > 50) {
            if (maxChannel === 'r') return 'Красный';
            if (maxChannel === 'g') return 'Зеленый';
            if (maxChannel === 'b') return 'Синий';
        }

        return 'Неизвестно';
    }

    /**
     * Определение цвета автомобиля по изображению через Sharp
     */
    async function detectColor(imageUrl, retryCount = 0) {
        if (!imageUrl) {
            return 'Неизвестно';
        }

        try {
            // Скачиваем изображение
            const response = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                timeout: state.config.timeout,
                maxContentLength: 10 * 1024 * 1024, // Максимум 10MB
                maxBodyLength: 10 * 1024 * 1024
            });

            const imageBuffer = Buffer.from(response.data);
            
            // Используем Sharp для анализа изображения
            try {
                const sharp = require('sharp');
                
                // Получаем статистику по изображению (доминирующие цвета)
                // Увеличиваем размер для более точного анализа
                let stats = await sharp(imageBuffer)
                    .resize(400, 400, { 
                        fit: 'inside',
                        withoutEnlargement: true 
                    })
                    .stats();
                
                // Дополнительно анализируем центральную область (где обычно находится автомобиль)
                const metadata = await sharp(imageBuffer).metadata();
                const centerCrop = {
                    left: Math.floor((metadata.width || 400) * 0.2),
                    top: Math.floor((metadata.height || 400) * 0.2),
                    width: Math.floor((metadata.width || 400) * 0.6),
                    height: Math.floor((metadata.height || 400) * 0.6)
                };
                
                let centerStats = null;
                try {
                    centerStats = await sharp(imageBuffer)
                        .extract(centerCrop)
                        .resize(200, 200, { fit: 'inside' })
                        .stats();
                } catch (e) {
                    // Если не удалось обрезать, используем только общую статистику
                    loggerService.logInfo('Не удалось проанализировать центральную область', { error: e.message });
                }
                
                // Анализируем каналы для более точного определения
                if (stats.channels && stats.channels.length >= 3) {
                    const rChannel = stats.channels[0];
                    const gChannel = stats.channels[1];
                    const bChannel = stats.channels[2];
                    
                    // Используем медиану для более устойчивого определения (менее чувствительна к выбросам)
                    const r = rChannel.median !== undefined ? rChannel.median : (rChannel.mean || 0);
                    const g = gChannel.median !== undefined ? gChannel.median : (gChannel.mean || 0);
                    const b = bChannel.median !== undefined ? bChannel.median : (bChannel.mean || 0);
                    
                    // Также получаем квантили для анализа распределения
                    const rQ1 = rChannel.min !== undefined ? rChannel.min : 0;
                    const gQ1 = gChannel.min !== undefined ? gChannel.min : 0;
                    const bQ1 = bChannel.min !== undefined ? bChannel.min : 0;
                    
                    const rQ3 = rChannel.max !== undefined ? rChannel.max : 255;
                    const gQ3 = gChannel.max !== undefined ? gChannel.max : 255;
                    const bQ3 = bChannel.max !== undefined ? bChannel.max : 255;
                    
                    // Получаем стандартное отклонение для понимания распределения
                    const rStdDev = rChannel.stdev || 0;
                    const gStdDev = gChannel.stdev || 0;
                    const bStdDev = bChannel.stdev || 0;
                    const avgStdDev = (rStdDev + gStdDev + bStdDev) / 3;
                    
                    // Сначала пробуем определить цвет по медиане
                    let color = rgbToColorName({ red: r, green: g, blue: b });
                    
                    // Если не определили, пробуем по среднему значению
                    if (color === 'Неизвестно') {
                        const rMean = rChannel.mean || 0;
                        const gMean = gChannel.mean || 0;
                        const bMean = bChannel.mean || 0;
                        color = rgbToColorName({ red: rMean, green: gMean, blue: bMean });
                    }
                    
                    // Если все еще не определили, используем доминирующий цвет
                    if (color === 'Неизвестно' && stats.dominant && stats.dominant.r !== undefined) {
                        color = rgbToColorName({
                            red: stats.dominant.r,
                            green: stats.dominant.g,
                            blue: stats.dominant.b
                        });
                    }
                    
                    // Специальная проверка для черного цвета с учетом отражений
                    // Черные автомобили часто имеют светлые отражения, но большинство пикселей темные
                    const avg = (r + g + b) / 3;
                    const avgMin = (rQ1 + gQ1 + bQ1) / 3;
                    const avgMax = (rQ3 + gQ3 + bQ3) / 3;
                    const avgMean = ((rChannel.mean || r) + (gChannel.mean || g) + (bChannel.mean || b)) / 3;
                    
                    // Критерии для черного цвета:
                    // 1. Медиана темная (низкая)
                    // 2. Минимум очень темный (низкий)
                    // 3. Может быть высокий максимум (отражения), но это не должно влиять на общий цвет
                    // 4. Высокое стандартное отклонение указывает на контраст (темный автомобиль + светлые отражения)
                    
                    const isLikelyBlack = (
                        avg < 120 && // Медиана не слишком светлая
                        avgMin < 80 && // Минимум темный
                        (avgMax > avg * 2 || avgStdDev > 40) // Есть контраст (отражения)
                    ) || (
                        avg < 90 && avgMin < 60 // Классический черный
                    ) || (
                        avgMean < 100 && avgMin < 50 && avgStdDev > 30 // Темный с большим разбросом
                    );
                    
                    if (isLikelyBlack && (color === 'Неизвестно' || color === 'Серый' || color === 'Серебристый')) {
                        // Если медиана темная, но среднее среднее из-за отражений - это черный
                        if (avg < 100 || (avg < 130 && avgMin < 70 && avgStdDev > 35)) {
                            color = 'Черный';
                            loggerService.logInfo(`Определен черный цвет с учетом отражений`, {
                                avg,
                                avgMin,
                                avgMax,
                                avgMean,
                                avgStdDev,
                                originalColor: color,
                                imageUrl
                            });
                        }
                    }
                    
                    // Если не определили и есть статистика центральной области, пробуем её
                    if (color === 'Неизвестно' && centerStats && centerStats.channels && centerStats.channels.length >= 3) {
                        const centerR = centerStats.channels[0].median !== undefined ? centerStats.channels[0].median : (centerStats.channels[0].mean || 0);
                        const centerG = centerStats.channels[1].median !== undefined ? centerStats.channels[1].median : (centerStats.channels[1].mean || 0);
                        const centerB = centerStats.channels[2].median !== undefined ? centerStats.channels[2].median : (centerStats.channels[2].mean || 0);
                        
                        const centerColor = rgbToColorName({ red: centerR, green: centerG, blue: centerB });
                        if (centerColor !== 'Неизвестно') {
                            color = centerColor;
                            loggerService.logInfo(`Цвет определен по центральной области: ${color}`, {
                                rgb: { r: centerR, g: centerG, b: centerB },
                                imageUrl
                            });
                        }
                    }
                    
                    if (color !== 'Неизвестно') {
                        loggerService.logInfo(`Определен цвет через Sharp: ${color}`, {
                            rgb: { r, g, b },
                            rgbMean: {
                                r: rChannel.mean,
                                g: gChannel.mean,
                                b: bChannel.mean
                            },
                            rgbRange: {
                                min: { r: rQ1, g: gQ1, b: bQ1 },
                                max: { r: rQ3, g: gQ3, b: bQ3 }
                            },
                            imageUrl
                        });
                        return color;
                    }
                }
                
                // Fallback: используем доминирующий цвет если каналы не доступны
                if (stats.dominant && stats.dominant.r !== undefined) {
                    const color = rgbToColorName({
                        red: stats.dominant.r,
                        green: stats.dominant.g,
                        blue: stats.dominant.b
                    });
                    
                    if (color !== 'Неизвестно') {
                        loggerService.logInfo(`Определен цвет через доминирующий цвет: ${color}`, {
                            rgb: {
                                r: stats.dominant.r,
                                g: stats.dominant.g,
                                b: stats.dominant.b
                            },
                            imageUrl
                        });
                        return color;
                    }
                }

                return 'Неизвестно';
            } catch (sharpError) {
                // Sharp не установлен или произошла ошибка
                if (sharpError.code === 'MODULE_NOT_FOUND') {
                    loggerService.logWarning('Sharp не установлен. Установите: npm install sharp');
                    throw new Error('Sharp не установлен');
                } else {
                    loggerService.logWarning('Ошибка при использовании Sharp', {
                        error: sharpError.message,
                        imageUrl
                    });
                    throw sharpError;
                }
            }
        } catch (error) {
            if (retryCount < state.config.maxRetries) {
                loggerService.logWarning(`Повторная попытка определения цвета (${retryCount + 1}/${state.config.maxRetries})`, {
                    error: error.message,
                    imageUrl
                });
                await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
                return detectColor(imageUrl, retryCount + 1);
            }

            loggerService.logWarning('Не удалось определить цвет автомобиля', {
                error: error.message,
                imageUrl
            });
            return 'Неизвестно';
        }
    }

    /**
     * Определение цвета для нескольких изображений (берет первое успешное)
     */
    async function detectColorFromImages(imageUrls) {
        if (!imageUrls || imageUrls.length === 0) {
            return 'Неизвестно';
        }

        // Пробуем определить цвет по главному изображению (первому)
        for (const imageUrl of imageUrls.slice(0, 3)) { // Пробуем максимум 3 изображения
            try {
                const color = await detectColor(imageUrl);
                if (color && color !== 'Неизвестно') {
                    return color;
                }
            } catch (error) {
                loggerService.logWarning('Ошибка при определении цвета из изображения', {
                    error: error.message,
                    imageUrl
                });
                continue;
            }
        }

        return 'Неизвестно';
    }

    return {
        detectColor,
        detectColorFromImages,
        normalizeColor,
        getConfig: () => ({ ...state.config })
    };
}

// Создаем глобальный экземпляр
const colorDetectionService = createColorDetectionService();

module.exports = { createColorDetectionService, colorDetectionService };
