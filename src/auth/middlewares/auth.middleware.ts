// src/auth/middlewares/auth.middleware.ts
import { Middleware } from 'telegraf';
import { Context } from 'src/interfaces/context.interface';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Telegraf uchun foydalanuvchi ma'lumotlarini yuklash middleware'i.
 * Bu middleware barcha so'rovlar uchun foydalanuvchi ma'lumotlarini kontekstga qo'shadi.
 */
export const userMiddleware = (prismaService: PrismaService): Middleware<Context> => {
    return async (ctx, next) => {
        // 1. Foydalanuvchi ma'lumotlarini Telegraf kontekstidan olish
        const { from } = ctx;

        if (from) {
            // 2. Foydalanuvchini bazadan topish
            const user = await prismaService.user.findUnique({
                where: { telegram_id: from.id },
                include: {
                    branch: true,
                },
            });

            if (user) {
                // 3. Foydalanuvchi ma'lumotlarini kontekstga qo'shish
                ctx.user = user;
            }
        }

        // 4. Keyingi handlerga o'tish (auth tekshiruvi guard'da bo'ladi)
        await next();
    };
};
