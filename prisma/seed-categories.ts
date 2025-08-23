import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Categories qo'shish
    const categories = [
        { name: 'Pizza', emoji: '🍕' },
        { name: 'Burger', emoji: '🍔' },
        { name: 'Ichimlik', emoji: '🥤' },
        { name: 'Desert', emoji: '🍰' },
        { name: 'Salat', emoji: '🥗' },
        { name: 'Boshqa', emoji: '📦' },
    ];

    for (const category of categories) {
        await prisma.category.upsert({
            where: { name: category.name },
            update: {},
            create: category,
        });
    }

    // Sides qo'shish
    const sides = [
        { name: 'Oldi tomon', price: 25000 },
        { name: 'Orqa tomon', price: 30000 },
        { name: 'Yon tomon', price: 20000 },
        { name: 'Hamma tomon', price: 45000 },
        { name: 'Kamerasi', price: 35000 },
        { name: 'Orqa + Oldi', price: 50000 },
        { name: 'Chap tomon', price: 22000 },
        { name: 'O\'ng tomon', price: 22000 },
        { name: 'Premium tomon', price: 60000 },
        { name: 'Standart tomon', price: 18000 },
    ];

    for (const side of sides) {
        await prisma.side.upsert({
            where: { name: side.name },
            update: {},
            create: side,
        });
    }

    console.log('Categories va Sides muvaffaqiyatli qo\'shildi!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });