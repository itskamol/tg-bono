// src/auth/middlewares/auth.middleware.ts
import { Middleware } from 'telegraf';
import { Context } from 'src/interfaces/context.interface';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Telegraf uchun autentifikatsiya middleware'ini qaytaradigan funksiya.
 *
 * @param requiredRoles - Ruxsat berish uchun talab qilinadigan rollar massivi.
 * @param prismaService - PrismaService ilovasi, foydalanuvchini bazadan topish uchun.
 */
export const authMiddleware = (
    requiredRoles: Role[],
    prismaService: PrismaService,
): Middleware<Context> => {
    return async (ctx, next) => {
        // 1. Foydalanuvchi ma'lumotlarini Telegraf kontekstidan olish
        const { from } = ctx;

        if (!from) {
            ctx.reply("Siz tizimga kirmagansiz. Iltimos, 'start' buyrug'ini bering.");
            return;
        }

        // 2. Foydalanuvchini bazadan topish
        const user = await prismaService.user.findUnique({
            where: { telegram_id: from.id },
            include: {
                branch: true,
            },
        });

        if (!user) {
            ctx.reply("Sizning ma'lumotlaringiz tizimda topilmadi.");
            return;
        }

        // 3. Foydalanuvchi ma'lumotlarini kontekstga qo'shish (keyingi handlerlar uchun)
        ctx.user = user;

        // 4. Rollarni tekshirish
        const hasRole = requiredRoles.some((role: Role) => user.role === role);

        if (!hasRole) {
            ctx.reply("Sizda bu harakatni bajarish uchun ruxsat yo'q.");
            return;
        }

        // 5. Agar tekshiruvdan o'tsa, keyingi handlerga o'tish
        await next();
    };
};