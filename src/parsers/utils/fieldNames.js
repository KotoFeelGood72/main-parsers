/**
 * Стандартные имена полей для данных автомобилей
 * Используется для единообразия во всех парсерах
 */
const CAR_DATA_FIELDS = {
    SHORT_URL: 'short_url',
    TITLE: 'title',
    MAKE: 'make',
    MODEL: 'model',
    YEAR: 'year',
    BODY_TYPE: 'body_type',
    HORSEPOWER: 'horsepower',
    FUEL_TYPE: 'fuel_type',
    MOTORS_TRIM: 'motors_trim',
    KILOMETERS: 'kilometers',
    PRICE_FORMATTED: 'price_formatted',
    PRICE_RAW: 'price_raw',
    CURRENCY: 'currency',
    EXTERIOR_COLOR: 'exterior_color',
    LOCATION: 'location',
    PHONE: 'phone',
    SELLER_NAME: 'seller_name',
    SELLER_TYPE: 'seller_type',
    SELLER_LOGO: 'seller_logo',
    SELLER_PROFILE_LINK: 'seller_profile_link',
    MAIN_IMAGE: 'main_image',
    PHOTOS: 'photos'
};

/**
 * Значения по умолчанию для полей
 */
const DEFAULT_VALUES = {
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
    photos: []
};

/**
 * Создание объекта данных автомобиля с правильными именами полей
 * @param {Object} data - Данные с любыми именами полей
 * @returns {Object} Данные со стандартными именами полей
 */
function createCarData(data = {}) {
    return {
        short_url: data.short_url || data.url || data.shortUrl || DEFAULT_VALUES.short_url,
        title: data.title || DEFAULT_VALUES.title,
        make: data.make || DEFAULT_VALUES.make,
        model: data.model || DEFAULT_VALUES.model,
        year: data.year || DEFAULT_VALUES.year,
        body_type: data.body_type || data.bodyType || DEFAULT_VALUES.body_type,
        horsepower: data.horsepower || data.engineSize || DEFAULT_VALUES.horsepower,
        fuel_type: data.fuel_type || data.fuelType || DEFAULT_VALUES.fuel_type,
        motors_trim: data.motors_trim || data.motorsTrim || data.trim || DEFAULT_VALUES.motors_trim,
        kilometers: data.kilometers || data.mileage || DEFAULT_VALUES.kilometers,
        price_formatted: data.price_formatted || data.price?.formatted || String(data.price || DEFAULT_VALUES.price_formatted),
        price_raw: data.price_raw || data.price?.raw || parseFloat(data.price) || DEFAULT_VALUES.price_raw,
        currency: data.currency || data.price?.currency || DEFAULT_VALUES.currency,
        exterior_color: data.exterior_color || data.exteriorColor || data.color || DEFAULT_VALUES.exterior_color,
        location: data.location || DEFAULT_VALUES.location,
        phone: data.phone || data.contact?.phone || DEFAULT_VALUES.phone,
        seller_name: data.seller_name || data.sellerName || data.sellers?.sellerName || DEFAULT_VALUES.seller_name,
        seller_type: data.seller_type || data.sellerType || data.sellers?.sellerType || DEFAULT_VALUES.seller_type,
        seller_logo: data.seller_logo || data.sellerLogo || data.sellers?.sellerLogo || DEFAULT_VALUES.seller_logo,
        seller_profile_link: data.seller_profile_link || data.sellerProfileLink || data.sellers?.sellerProfileLink || DEFAULT_VALUES.seller_profile_link,
        main_image: data.main_image || data.mainImage || (data.photos && data.photos[0]) || DEFAULT_VALUES.main_image,
        photos: data.photos || data.images || DEFAULT_VALUES.photos
    };
}

module.exports = {
    CAR_DATA_FIELDS,
    DEFAULT_VALUES,
    createCarData
};

