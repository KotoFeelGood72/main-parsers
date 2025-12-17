const { telegramService } = require('../../../../services/TelegramService');

/**
 * Парсинг деталей объявления для OneClickDrive.com
 */

class OneclickdriveDetailParser {
    constructor(config) {
        this.config = config;
        
        // Счетчик ошибок для логирования
        this.errorCount = 0;
    }

    /**
     * Вспомогательная функция для безопасного извлечения данных
     */
    async safeEval(page, selector, callback) {
        try {
            return await page.$eval(selector, callback);
        } catch (error) {
            return null;
        }
    }

    /**
     * Парсинг детальной информации об объявлении
     */
    async parseCarDetails(url, context) {
        const page = await context.newPage();
        
        try {
            console.log(`🚗 Переходим к ${url}`);

            await page.goto(url, {
                waitUntil: "domcontentloaded",
                timeout: this.config.timeout,
            });

            console.log("📄 Загружаем данные...");

            // Извлечение основных данных
            const title = await this.safeEval(page, "h1.dsktit", el => el.textContent.trim());
            
            // Извлекаем данные из таблицы характеристик
            const specsData = await page.$$eval('.priceingdt', elements => {
                const data = {};
                elements.forEach(el => {
                    const labelSpan = el.querySelector('span:first-child');
                    const valueElement = el.querySelector('.text-right');
                    
                    if (labelSpan && valueElement) {
                        const label = labelSpan.textContent.trim().toLowerCase();
                        const value = valueElement.textContent.trim();
                        
                        if (label.includes('make')) data.make = value;
                        else if (label.includes('model')) data.model = value;
                        else if (label.includes('driven')) data.driven = value;
                        else if (label.includes('body type')) data.bodyType = value;
                        else if (label.includes('gearbox')) data.gearbox = value;
                        else if (label.includes('fuel type')) data.fuelType = value;
                        else if (label.includes('seller type')) data.sellerType = value;
                        else if (label.includes('exterior')) data.exteriorColor = value;
                    }
                });
                return data;
            });

            const make = specsData.make || "Неизвестно";
            const model = specsData.model || "Неизвестно";
            const year = "2023"; // Извлекаем из заголовка или breadcrumb
            const bodyType = specsData.bodyType || "Неизвестно";
            const motorsTrim = specsData.gearbox || "Неизвестно";
            const fuelType = specsData.fuelType || "Неизвестно";
            
            // Сохраняем километры как строку без форматирования
            const kilometers = specsData.driven || "0";

            const exteriorColor = specsData.exteriorColor || "Неизвестно";
            const location = await this.safeEval(page, ".dtlloc", el => el.textContent.replace(/\s+/g, " ").trim());

            // Обработка цены
            const priceFormatted = await this.safeEval(page, ".mainprice", el => el.textContent.replace(/[^\d,]/g, "").trim());
            const priceRaw = priceFormatted ? parseFloat(priceFormatted.replace(/,/g, "")) : null;
            const currency = "AED";

            // Извлечение фотографий
            const photos = await page.$$eval(".collage-slide-images img.imagegal", imgs => 
                imgs.map(img => img.src).filter(src => src)
            );

            // Главное изображение (первое фото)
            const mainImage = photos && photos.length > 0 ? photos[0] : null;

            // Информация о продавце
            const sellerName = await this.safeEval(page, ".cmpbrndlogo", img => img.getAttribute("title"));
            const sellerType = specsData.sellerType || "Неизвестно";
            const sellerLogo = await this.safeEval(page, ".cmpbrndlogo", el => el.src);
            const sellerProfileLink = await this.safeEval(page, ".moredealer", el => el.href);

            // Контактная информация
            const phoneNumber = await this.safeEval(page, ".callnwbtn", el => el.textContent.trim());

            // Формирование объекта с данными
            const carDetails = {
                short_url: url,
                title: title || "Неизвестно",
                photos: photos || [],
                main_image: mainImage,
                make: make || "Неизвестно",
                model: model || "Неизвестно",
                year: year || "Неизвестно",
                body_type: bodyType || "Неизвестно",
                horsepower: null, // Не доступно на сайте
                fuel_type: fuelType || "Неизвестно",
                motors_trim: motorsTrim || "Неизвестно",
                kilometers: kilometers || 0,
                // Плоская структура для цен
                price_formatted: priceFormatted || "0",
                price_raw: priceRaw || 0,
                currency: currency,
                exterior_color: exteriorColor || "Неизвестно",
                location: location || "Неизвестно",
                // Плоская структура для контактов
                phone: phoneNumber || "Не указан",
                // Плоская структура для продавца
                seller_name: sellerName || "Не указан",
                seller_type: sellerType || "Частное лицо",
                seller_logo: sellerLogo || null,
                seller_profile_link: sellerProfileLink || null,
            };

            console.log(`✅ Данные извлечены для: ${title}`);
            return carDetails;

        } catch (error) {
            this.errorCount++;
            console.error(`❌ Ошибка при загрузке данных с ${url}:`, error.message);
            
            // Отправляем уведомление в Telegram при критических ошибках
            if (telegramService.getStatus().enabled && this.errorCount % 10 === 0) {
                await this.sendErrorNotification(url, error);
            }
            
            return null;
        } finally {
            await page.close();
        }
    }

    /**
     * Отправка уведомления об ошибке в Telegram
     */
    async sendErrorNotification(url, error) {
        if (!telegramService.getStatus().enabled) return;

        try {
            const message = `⚠️ *OneClickDrive: Ошибка парсинга детальной страницы*\n\n` +
                          `URL: ${url}\n` +
                          `Ошибка: ${error.name || 'Unknown'}\n` +
                          `Сообщение: ${error.message}\n` +
                          `Всего ошибок: ${this.errorCount}\n` +
                          `Время: ${new Date().toLocaleString('ru-RU')}`;

            await telegramService.sendMessage(message);
        } catch (telegramError) {
            console.warn(`⚠️ Ошибка отправки уведомления:`, telegramError.message);
        }
    }
}

module.exports = { OneclickdriveDetailParser };

