const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
require('dotenv').config(); // dotenv kutubxonasini chaqiramiz

// Bot tokenini muhit o'zgaruvchisidan olish
const bot = new Telegraf(process.env.BOT_TOKEN);

// Sessiya o'rnatish (JSON faylda saqlash uchun)
const localSession = new LocalSession({
    database: 'sessions.json',
});

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot is running...');
});

app.listen(port, function () {
    bot.launch();
    console.log('Express server listening on port ' + port);
});

app.on('error', onError);

// Sessiyalar bilan ishlash
bot.use(localSession.middleware());

// Foydalanuvchi sessiyasidagi sahifalar stekini boshqarish funksiyasi
function navigateTo(ctx, newPage) {
    if (!ctx.session.pageStack) {
        ctx.session.pageStack = [];
    }
    ctx.session.pageStack.push(newPage);  // Yangi sahifani stackga qo'shish
}

// /start komandasini boshqarish
bot.start((ctx) => {
    navigateTo(ctx, 'main');
    ctx.reply(
        '👋 UZ CHINA TRADE ga xush kelibsiz!\n' +
        'Tilni tanlang:',
        Markup.keyboard([
            ['🇺🇿 O\'zbek', '🇷🇺 Русский']
        ]).resize().oneTime()
    );
});

// Tilni tanlash komandasi
bot.hears('🇺🇿 O\'zbek', (ctx) => {
    ctx.session.language = 'uz';
    ctx.reply('Til tanlandi: O\'zbek');
    showMainMenu(ctx);
});

bot.hears('🇷🇺 Русский', (ctx) => {
    ctx.session.language = 'ru';
    ctx.reply('Язык выбран: Русский');
    showMainMenu(ctx);
});

// Asosiy menyuni ko'rsatish funksiyasi
function showMainMenu(ctx) {
    navigateTo(ctx, 'main');
    const webAppUrl = createWebAppUrl(ctx);
    ctx.reply(
        'Amalni tanlang:',
        Markup.keyboard([
            [Markup.button.webApp('🏬 Do\'konni ochish', webAppUrl), '⚙️ Sozlamalar'],
            ['◀️ Orqaga']
        ]).resize()
    );
}

// Web App URL yaratish funksiyasi
function createWebAppUrl(ctx) {
    const baseUrl = process.env.WEBAPP_URL; // Web app URL'ni env fayldan olamiz
    const userId = ctx.from.id;
    const language = ctx.session.language || 'uz';  // Tilni sessiyadan olamiz
    return `${baseUrl}?user_id=${userId}&lang=${language}`;
}

// Sozlamalar bo'limi
bot.hears('⚙️ Sozlamalar', (ctx) => {
    showSettings(ctx);
});

function showSettings(ctx) {
    navigateTo(ctx, 'settings');
    ctx.reply(
        'Sozlamalar bo\'limi:',
        Markup.keyboard([
            ['Tilni o\'zgartirish', 'Telefon raqamingizni o\'zgartirish'],
            ['◀️ Orqaga']
        ]).resize()
    );
}

// Telefon raqamni o'zgartirish
bot.hears('Telefon raqamingizni o\'zgartirish', (ctx) => {
    askForPhone(ctx);
});

function askForPhone(ctx) {
    navigateTo(ctx, 'changePhone');
    ctx.reply(
        'Yangi telefon raqamingizni yuboring:',
        Markup.keyboard([
            Markup.button.contactRequest('📱 Telefon raqamni yuborish')
        ]).resize().oneTime()
    );
}

// Telefon raqamni qabul qilish
bot.on('contact', (ctx) => {
    const phoneNumber = ctx.message.contact.phone_number;
    ctx.session.phone = phoneNumber;  // Sessiyada raqamni saqlaymiz
    ctx.reply(`Raqamingiz qabul qilindi va saqlandi: ${phoneNumber}`);

    // Telefon yuborilgandan keyin asosiy menyuni ko'rsatish
    showMainMenu(ctx);
});

// Orqaga qaytish
bot.hears('◀️ Orqaga', (ctx) => {
    goBack(ctx);  // Avvalgi sahifaga qaytish
});

function goBack(ctx) {
    if (ctx.session.pageStack && ctx.session.pageStack.length > 1) {
        ctx.session.pageStack.pop();  // Hozirgi sahifani stackdan o'chirish
        const previousPage = ctx.session.pageStack[ctx.session.pageStack.length - 1];
        // Avvalgi sahifaga qaytish
        switch (previousPage) {
            case 'main':
                showMainMenu(ctx);
                break;
            case 'settings':
                showSettings(ctx);
                break;
            case 'changePhone':
                askForPhone(ctx);
                break;
            default:
                ctx.reply('Avvalgi sahifa topilmadi.');
        }
    } else {
        ctx.reply('Orqaga qaytish sahifasi mavjud emas.');
    }
}

// Botni ishga tushirish
bot.launch();

function onError(error) {
    if (error.syscall !== 'listen') {
        throw error;
    }

    let bind = 'Port ' + port;

    switch (error.code) {
        case 'EACCES':
            console.error(bind + ' requires elevated privileges');
            process.exit(1);
            break;
        case 'EADDRINUSE':
            console.error(bind + ' is already in use');
            process.exit(1);
            break;
        default:
            throw error;
    }
}

const shutdown = async (val) => {
    console.log('Shutting down gracefully...');

    try {
        await bot.stop(val);
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
};

// Graceful shutdown
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

console.log('Bot is running...');
