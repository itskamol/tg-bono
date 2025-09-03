import { Update, Command, Ctx, Action } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { Context } from '../interfaces/context.interface';
import { Role } from '@prisma/client';
import { formatCurrency } from 'src/utils/format.utils';

@Update()
export class SidesUpdate {
    constructor(private readonly prisma: PrismaService) { }

    @Command('sides')
    @Roles(Role.SUPER_ADMIN)
    async listSides(@Ctx() ctx: Context) {
        const sides = await this.prisma.side.findMany({
            orderBy: { price: 'asc' },
        });

        if (!sides || sides.length === 0) {
            await ctx.reply(
                '❌ Hech qanday tomon mavjud emas.',
                Markup.inlineKeyboard([Markup.button.callback("➕ Tomon qo'shish", 'ADD_SIDE')]),
            );
            return;
        }

        const sideButtons = sides.map((side) =>
            Markup.button.callback(
                `${side.name} - ${formatCurrency(side.price)}`,
                `VIEW_SIDE_${side.id}`,
            ),
        );

        await ctx.reply(
            `🔲 Tomonlar ro'yxati (${sides.length} ta):`,
            Markup.inlineKeyboard(
                [...sideButtons, Markup.button.callback('➕ Yangi', 'ADD_SIDE')],
                { columns: 1 },
            ),
        );
    }

    @Action('ADD_SIDE')
    @Roles(Role.SUPER_ADMIN)
    async onAddSide(@Ctx() ctx: Context) {
        await ctx.scene.enter('add-side-scene');
    }

    @Action(/^VIEW_SIDE_(.+)$/)
    @Roles(Role.SUPER_ADMIN)
    async onViewSide(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const sideData = ctx.callbackQuery.data;

        // Regex orqali sideId'ni olish
        const match = sideData.match(/^VIEW_SIDE_(.+)$/);
        if (!match) {
            await ctx.editMessageText("❌ Noto'g'ri ma'lumot.");
            return;
        }

        const sideId = match[1];

        const side = await this.prisma.side.findUnique({
            where: { id: sideId },
        });

        if (!side) {
            await ctx.editMessageText('❌ Tomon topilmadi.');
            return;
        }

        const sideDetails = `
🔲 Tomon ma'lumotlari:

📝 Nomi: ${side.name}
💰 Narxi: ${formatCurrency(side.price)}
📅 Yaratilgan: ${side.created_at.toLocaleDateString('uz-UZ')}

Nima qilmoqchisiz?
        `;

        await ctx.editMessageText(
            sideDetails,
            Markup.inlineKeyboard(
                [
                    Markup.button.callback('✏️ Tahrirlash', `EDIT_SIDE_${side.id}`),
                    Markup.button.callback("🗑️ O'chirish", `DELETE_SIDE_${side.id}`),
                    Markup.button.callback('🔙 Orqaga', `BACK_TO_SIDES_${side.category_id}`),
                ],
                { columns: 2 },
            ),
        );
    }

    @Action(/^EDIT_SIDE_(.+)$/)
    @Roles(Role.SUPER_ADMIN)
    async onEditSide(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const sideData = ctx.callbackQuery.data;

        // Regex orqali sideId'ni olish
        const match = sideData.match(/^EDIT_SIDE_(.+)$/);
        if (!match) {
            await ctx.editMessageText("❌ Noto'g'ri ma'lumot.");
            return;
        }

        const sideId = match[1];

        const side = await this.prisma.side.findUnique({
            where: { id: sideId },
        });

        if (!side) {
            await ctx.editMessageText('❌ Tomon topilmadi.');
            return;
        }

        // Scene state'ga side ma'lumotlarini saqlash
        ctx.scene.state = { sideId, sideName: side.name, sidePrice: side.price };

        await ctx.scene.enter('edit-side-scene', ctx.scene.state);
    }

    @Action(/^DELETE_SIDE_(.+)$/)
    @Roles(Role.SUPER_ADMIN)
    async onDeleteSide(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const sideData = ctx.callbackQuery.data;

        // Regex orqali sideId'ni olish
        const match = sideData.match(/^DELETE_SIDE_(.+)$/);
        if (!match) {
            await ctx.editMessageText("❌ Noto'g'ri ma'lumot.");
            return;
        }

        const sideId = match[1];

        // Scene state'ga side ID'ni saqlash
        ctx.scene.state = { sideId };
        await ctx.scene.enter('delete-side-scene', ctx.scene.state);
    }

    @Action(/^BACK_TO_SIDES_(.+)$/)
    @Roles(Role.SUPER_ADMIN)
    async onBackToSides(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const sideData = ctx.callbackQuery.data;

        const match = sideData.match(/^BACK_TO_SIDES_(.+)$/);
        if (!match) {
            await ctx.editMessageText("❌ Noto'g'ri ma'lumot.");
            return;
        }
        const categoryId = match[1];
        // Sides ro'yxatini qayta ko'rsatish
        const sides = await this.prisma.side.findMany({
            where: { category_id: categoryId },
            orderBy: { price: 'asc' },
        });

        if (!sides || sides.length === 0) {
            await ctx.editMessageText(
                '❌ Hech qanday tomon mavjud emas.',
                Markup.inlineKeyboard([Markup.button.callback("➕ Tomon qo'shish", 'ADD_SIDE')]),
            );
            return;
        }

        const sideButtons = sides.map((side) =>
            Markup.button.callback(
                `${side.name} - ${formatCurrency(side.price)}`,
                `VIEW_SIDE_${side.id}`,
            ),
        );

        await ctx.editMessageText(
            `🔲 Tomonlar ro'yxati (${sides.length} ta):`,
            Markup.inlineKeyboard(
                [...sideButtons, Markup.button.callback('➕ Yangi', 'ADD_SIDE')],
                { columns: 1 },
            ),
        );
    }
}
