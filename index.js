require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');

// .env fayldan kerakli parametrlarni yuklash
if (!process.env.BOT_TOKEN || !process.env.WEBAPP_URL) {
    console.error('BOT_TOKEN yoki WEBAPP_URL .env faylda aniqlanmagan');
    process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();
const port = process.env.PORT || 3000;

// Bot ishga tushganda asosiy menyuni ko'rsatish
bot.start((ctx) => {
    showMainMenu(ctx);
});

function showMainMenu(ctx) {
    const webAppUrl = createWebAppUrl(ctx);
    ctx.reply(
        '👋 UZ CHINA TRADE ga xush kelibsiz!',
        Markup.keyboard([
            [Markup.button.webApp('🏬 Do\'konni ochish', webAppUrl)],
        ]).resize()
    );
}

function createWebAppUrl(ctx) {
    const baseUrl = process.env.WEBAPP_URL;
    const userId = ctx.from.id;
    const language = 'uz'; // Sessiya yo‘qligi sababli `uz`ni default qilib olamiz
    return `${baseUrl}?user_id=${userId}&lang=${language}`;
}

// Webhook ni belgilash
bot.telegram.setWebhook(`https://china-shop-back.onrender.com`);

function onError(error) {
    if (error.syscall !== 'listen') {
        throw error;
    }

    const bind = 'Port ' + port;

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

// Graceful shutdown
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

bot.launch();
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

console.log('Bot is running...');

app.get('/', (req, res) => {
    res.send('Bot is running...');
});

app.listen(port, function () {
    console.log('Express server listening on port ' + port);
    bot.launch(); // faqat shu joyda `bot.launch()` chaqirilsin
});

app.on('error', onError);
