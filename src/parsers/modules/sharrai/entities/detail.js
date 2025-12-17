const { telegramService } = require('../../../../services/TelegramService');

/**
 * Парсинг детальной информации для Sharrai.ae
 */

class SharraiDetailParser {
    constructor(config) {
        this.config = config;
        
        // Счетчик ошибок для логирования
        this.errorCount = 0;
        
        // Селекторы для детальной страницы Sharrai
        this.selectors = {
            // Основные данные
            title: 'h1, [class*="title"], [class*="car-title"]',
            price: '[class*="price"], [class*="amount"], [class*="cost"]',
            location: '[class*="location"], [class*="address"], [class*="city"]',
            
            // Детали автомобиля
            carDetails: '[class*="details"], [class*="specs"], [class*="specifications"]',
            make: '[class*="make"], [data-field="make"]',
            model: '[class*="model"], [data-field="model"]',
            year: '[class*="year"], [data-field="year"]',
            bodyType: '[class*="body-type"], [class*="bodyType"], [data-field="bodyType"]',
            fuelType: '[class*="fuel"], [class*="fuel-type"], [data-field="fuelType"]',
            transmission: '[class*="transmission"], [class*="gear"], [data-field="transmission"]',
            mileage: '[class*="mileage"], [class*="km"], [class*="kilometers"], [data-field="mileage"]',
            color: '[class*="color"], [class*="exterior-color"], [data-field="color"]',
            cylinders: '[class*="cylinder"], [class*="cylinders"], [data-field="cylinders"]',
            
            // Продавец
            sellerInfo: '[class*="seller"], [class*="dealer"], [class*="owner"]',
            sellerName: '[class*="seller-name"], [class*="dealer-name"]',
            sellerType: '[class*="seller-type"], [class*="dealer-type"]',
            sellerLogo: '[class*="seller-logo"] img, [class*="dealer-logo"] img',
            sellerProfileLink: 'a[href*="/dealer/"], a[href*="/seller/"]',
            
            // Телефон
            phone: '[class*="phone"], [class*="contact"], a[href^="tel:"]',
            phoneButton: 'button[class*="phone"], button[class*="call"]',
            
            // Изображения
            images: 'img[class*="car"], img[class*="photo"], img[class*="image"]',
            mainImage: 'img[class*="main"], [class*="main-image"] img, [class*="featured-image"] img'
        };
        
        // Поля для извлечения данных
        this.dataFields = {
            make: ['Make', 'Марка', 'Brand', 'brand'],
            model: ['Model', 'Модель', 'Car Model', 'car model'],
            bodyType: ['Body type', 'Body Type', 'Тип кузова', 'body type', 'Body', 'body'],
            fuelType: ['Fuel Type', 'Тип топлива', 'Fuel', 'fuel', 'Fuel type', 'fuel type'],
            transmission: ['Transmission', 'Коробка передач', 'Gear', 'gear'],
            color: ['Color', 'Цвет', 'Exterior Color', 'exterior color']
        };
    }

    /**
     * Парсинг детальной страницы автомобиля
     */
    async parseCarDetails(url, context) {
        const page = await context.newPage();

        try {
            console.log(`🚗 Переходим к ${url}`);

            await page.goto(url, {
                waitUntil: "domcontentloaded",
                timeout: 30000
            });

            console.log("📄 Загружаем данные...");

            // Ждем загрузки основных элементов
            await page.waitForTimeout(3000);

            // Извлекаем основные поля
            const title = await this.safeEval(page, this.selectors.title, el => el.textContent.trim()) || "Не указано";
            
            // Извлекаем цену
            let priceData = { formatted: "Не указано", raw: 0 };
            try {
                priceData = await page.evaluate((selectors) => {
                    const priceEl = document.querySelector(selectors.price);
                    if (priceEl) {
                        const text = priceEl.textContent.trim();
                        const match = text.match(/([\d,]+)/);
                        if (match) {
                            const numeric = match[1].replace(/,/g, '');
                            return {
                                formatted: text,
                                raw: parseInt(numeric) || 0
                            };
                        }
                    }
                    return { formatted: "Не указано", raw: 0 };
                }, this.selectors);
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения price:`, error.message);
            }

            // Извлекаем локацию
            const location = await this.safeEval(page, this.selectors.location, el => el.textContent.trim()) || "Не указано";

            // Извлекаем детали автомобиля
            let make = "Не указано";
            let model = "Не указано";
            let year = "Не указано";
            let bodyType = "Не указано";
            let fuelType = "Не указано";
            let transmission = "Не указано";
            let kilometers = "0";
            let exteriorColor = "Не указано";
            let cylinders = "Не указано";

            try {
                const carDetails = await page.evaluate((selectors) => {
                    const details = {};
                    
                    // Извлекаем make
                    const makeEl = document.querySelector(selectors.make);
                    if (makeEl) details.make = makeEl.textContent.trim();
                    
                    // Извлекаем model
                    const modelEl = document.querySelector(selectors.model);
                    if (modelEl) details.model = modelEl.textContent.trim();
                    
                    // Извлекаем year
                    const yearEl = document.querySelector(selectors.year);
                    if (yearEl) {
                        const yearText = yearEl.textContent.trim();
                        const yearMatch = yearText.match(/\d{4}/);
                        if (yearMatch) details.year = yearMatch[0];
                    }
                    
                    // Извлекаем bodyType
                    const bodyTypeEl = document.querySelector(selectors.bodyType);
                    if (bodyTypeEl) details.bodyType = bodyTypeEl.textContent.trim();
                    
                    // Извлекаем fuelType
                    const fuelTypeEl = document.querySelector(selectors.fuelType);
                    if (fuelTypeEl) details.fuelType = fuelTypeEl.textContent.trim();
                    
                    // Извлекаем transmission
                    const transmissionEl = document.querySelector(selectors.transmission);
                    if (transmissionEl) details.transmission = transmissionEl.textContent.trim();
                    
                    // Извлекаем mileage
                    const mileageEl = document.querySelector(selectors.mileage);
                    if (mileageEl) {
                        const mileageText = mileageEl.textContent.trim();
                        const mileageMatch = mileageText.match(/([\d,]+)/);
                        if (mileageMatch) {
                            details.mileage = mileageMatch[1].replace(/,/g, '');
                        }
                    }
                    
                    // Извлекаем color
                    const colorEl = document.querySelector(selectors.color);
                    if (colorEl) details.color = colorEl.textContent.trim();
                    
                    // Извлекаем cylinders
                    const cylindersEl = document.querySelector(selectors.cylinders);
                    if (cylindersEl) {
                        const cylindersText = cylindersEl.textContent.trim();
                        const cylindersMatch = cylindersText.match(/(\d+)/);
                        if (cylindersMatch) {
                            details.cylinders = cylindersMatch[1];
                        }
                    }
                    
                    return details;
                }, this.selectors);
                
                make = carDetails.make || "Не указано";
                model = carDetails.model || "Не указано";
                year = carDetails.year || "Не указано";
                bodyType = carDetails.bodyType || "Не указано";
                fuelType = carDetails.fuelType || "Не указано";
                transmission = carDetails.transmission || "Не указано";
                kilometers = carDetails.mileage || "0";
                exteriorColor = carDetails.color || "Не указано";
                cylinders = carDetails.cylinders || "Не указано";
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения деталей автомобиля:`, error.message);
            }

            // Извлекаем информацию о продавце
            let sellerName = "Не указано";
            let sellerType = "Частное лицо";
            let sellerLogo = null;
            let sellerProfileLink = null;

            try {
                const sellerInfo = await page.evaluate((selectors) => {
                    const info = {};
                    
                    const sellerNameEl = document.querySelector(selectors.sellerName);
                    if (sellerNameEl) info.sellerName = sellerNameEl.textContent.trim();
                    
                    const sellerTypeEl = document.querySelector(selectors.sellerType);
                    if (sellerTypeEl) {
                        const typeText = sellerTypeEl.textContent.trim().toLowerCase();
                        info.sellerType = typeText.includes('dealer') || typeText.includes('дилер') ? 'Дилер' : 'Частное лицо';
                    }
                    
                    const sellerLogoEl = document.querySelector(selectors.sellerLogo);
                    if (sellerLogoEl && sellerLogoEl.src) {
                        info.sellerLogo = sellerLogoEl.src.startsWith('http') ? sellerLogoEl.src : `https://sharrai.ae${sellerLogoEl.src}`;
                    }
                    
                    const sellerLinkEl = document.querySelector(selectors.sellerProfileLink);
                    if (sellerLinkEl && sellerLinkEl.href) {
                        info.sellerProfileLink = sellerLinkEl.href.startsWith('http') ? sellerLinkEl.href : `https://sharrai.ae${sellerLinkEl.href}`;
                    }
                    
                    return info;
                }, this.selectors);
                
                sellerName = sellerInfo.sellerName || "Не указано";
                sellerType = sellerInfo.sellerType || "Частное лицо";
                sellerLogo = sellerInfo.sellerLogo || null;
                sellerProfileLink = sellerInfo.sellerProfileLink || null;
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения информации о продавце:`, error.message);
            }

            // Извлекаем телефон
            let phoneNumber = "Не указан";
            try {
                // Пробуем найти кнопку с телефоном
                const phoneButton = await page.$(this.selectors.phoneButton);
                if (phoneButton) {
                    await phoneButton.click();
                    await page.waitForTimeout(1000);
                }
                
                phoneNumber = await page.evaluate((selectors) => {
                    // Ищем телефон в различных местах
                    const phoneEl = document.querySelector(selectors.phone);
                    if (phoneEl) {
                        const phoneText = phoneEl.textContent || phoneEl.getAttribute('href')?.replace('tel:', '');
                        if (phoneText) {
                            const phoneMatch = phoneText.match(/\+?\d{1,3}[\s-]?\d{1,4}[\s-]?\d{1,4}[\s-]?\d{1,9}/);
                            if (phoneMatch) return phoneMatch[0];
                        }
                    }
                    
                    // Ищем все ссылки tel:
                    const telLinks = document.querySelectorAll('a[href^="tel:"]');
                    for (const link of telLinks) {
                        const tel = link.getAttribute('href').replace('tel:', '').trim();
                        if (tel) return tel;
                    }
                    
                    return "Не указан";
                }, this.selectors);
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения телефона:`, error.message);
            }

            // Извлекаем изображения
            let photos = [];
            let mainImage = null;
            try {
                const imagesData = await page.evaluate((selectors) => {
                    const images = [];
                    const imageElements = document.querySelectorAll(selectors.images);
                    
                    for (const img of imageElements) {
                        if (img.src && img.src.startsWith('http')) {
                            images.push(img.src);
                        } else if (img.src && !img.src.startsWith('data:')) {
                            images.push(`https://sharrai.ae${img.src.startsWith('/') ? img.src : '/' + img.src}`);
                        }
                    }
                    
                    const mainImgEl = document.querySelector(selectors.mainImage);
                    const mainImg = mainImgEl && mainImgEl.src 
                        ? (mainImgEl.src.startsWith('http') ? mainImgEl.src : `https://sharrai.ae${mainImgEl.src.startsWith('/') ? mainImgEl.src : '/' + mainImgEl.src}`)
                        : (images.length > 0 ? images[0] : null);
                    
                    return { images: [...new Set(images)], mainImage: mainImg };
                }, this.selectors);
                
                photos = imagesData.images || [];
                mainImage = imagesData.mainImage || (photos.length > 0 ? photos[0] : null);
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения изображений:`, error.message);
            }

            // Формируем объект с данными в плоской структуре
            const carDetails = {
                short_url: url,
                title: title || "Не указано",
                photos: photos || [],
                main_image: mainImage,
                make: make || "Не указано",
                model: model || "Не указано",
                year: year || "Не указано",
                body_type: bodyType || "Не указано",
                horsepower: cylinders ? `${cylinders} цилиндров` : "Не указано",
                fuel_type: fuelType || "Не указано",
                motors_trim: transmission || "Не указано",
                kilometers: kilometers || "0",
                seller_name: sellerName || "Не указано",
                seller_type: sellerType || "Частное лицо",
                seller_logo: sellerLogo || null,
                seller_profile_link: sellerProfileLink || null,
                price_formatted: priceData?.formatted || "Не указано",
                price_raw: priceData?.raw || 0,
                currency: "AED",
                exterior_color: exteriorColor || "Не указано",
                location: location || "Не указано",
                phone: phoneNumber || "Не указан",
            };

            console.log("✅ Данные автомобиля успешно извлечены");

            return carDetails;

        } catch (error) {
            console.error(`❌ Ошибка при загрузке данных с ${url}:`, error.message);
            this.errorCount++;
            
            if (telegramService.getStatus().enabled && this.errorCount % 10 === 0) {
                await this.sendErrorNotification(url, error);
            }
            
            return null;
        } finally {
            try {
                await page.close();
            } catch (closeError) {
                console.warn(`⚠️ Ошибка при закрытии страницы:`, closeError.message);
            }
        }
    }

    /**
     * Отправка уведомления об ошибке в Telegram
     */
    async sendErrorNotification(url, error) {
        if (!telegramService.getStatus().enabled) return;

        try {
            const message = `⚠️ *Sharrai: Ошибка парсинга*\n\n` +
                          `URL: ${url}\n` +
                          `Ошибка: ${error.message}\n` +
                          `Время: ${new Date().toLocaleString('ru-RU')}`;

            await telegramService.sendMessage(message);
        } catch (telegramError) {
            console.warn(`⚠️ Ошибка отправки уведомления:`, telegramError.message);
        }
    }

    /**
     * Безопасное выполнение функции на элементе
     */
    async safeEval(page, selector, fn, defaultValue = null) {
        try {
            const element = await page.$(selector);
            if (!element) {
                return defaultValue;
            }
            return await page.evaluate(fn, element);
        } catch (error) {
            console.warn(`⚠️ Ошибка в safeEval для селектора ${selector}:`, error.message);
            return defaultValue;
        }
    }
}

module.exports = { SharraiDetailParser };

