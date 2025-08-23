import { Update, Command, Ctx, Action } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { Context } from '../interfaces/context.interface';
import { Role } from '@prisma/client';

@Update()

export class CategoriesUpdate {
    constructor(private readonly prisma: PrismaService) {}

    @Command('categories')
    @Roles(Role.SUPER_ADMIN)
    async listCategories(@Ctx() ctx: Context) {
        const categories = await this.prisma.category.findMany({
            orderBy: { name: 'asc' },
        });

        if (!categories || categories.length === 0) {
            await ctx.reply(
                '❌ Hech qanday kategoriya mavjud emas.',
                Markup.inlineKeyboard([
                    Markup.button.callback('➕ Kategoriya qo\'shish', 'ADD_CATEGORY'),
                ])
            );
            return;
        }

        const categoryButtons = categories.map((category) =>
            Markup.button.callback(
                `${category.emoji} ${category.name}`,
                `VIEW_CATEGORY_${category.id}`,
            ),
        );

        await ctx.reply(
            `📦 Kategoriyalar ro'yxati (${categories.length} ta):`,
            Markup.inlineKeyboard([
                ...categoryButtons,
                Markup.button.callback('➕ Yangi kategoriya', 'ADD_CATEGORY'),
            ], { columns: 2 }),
        );
    }

    @Action('ADD_CATEGORY')
    @Roles(Role.SUPER_ADMIN)
    async onAddCategory(@Ctx() ctx: Context) {
        await ctx.scene.enter('add-category-scene');
    }

    @Action(/^VIEW_CATEGORY_(.+)$/)
    @Roles(Role.SUPER_ADMIN)
    async onViewCategory(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const categoryData = ctx.callbackQuery.data;
        const categoryId = categoryData.replace('VIEW_CATEGORY_', '');

        const category = await this.prisma.category.findUnique({
            where: { id: categoryId },
        });

        if (!category) {
            await ctx.editMessageText('❌ Kategoriya topilmadi.');
            return;
        }

        // Kategoriyada nechta mahsulot ishlatilganini hisoblash
        const productsCount = await this.prisma.order_Product.count({
            where: { category: category.name },
        });

        const categoryDetails = `
📦 Kategoriya ma'lumotlari:

${category.emoji} Nomi: ${category.name}
📊 Ishlatilgan: ${productsCount} ta buyurtmada
📅 Yaratilgan: ${category.created_at.toLocaleDateString('uz-UZ')}

Nima qilmoqchisiz?
        `;

        await ctx.editMessageText(
            categoryDetails,
            Markup.inlineKeyboard([
                Markup.button.callback('✏️ Tahrirlash', `EDIT_CATEGORY_${category.id}`),
                Markup.button.callback('🗑️ O\'chirish', `DELETE_CATEGORY_${category.id}`),
                Markup.button.callback('🔙 Orqaga', 'BACK_TO_CATEGORIES'),
            ], { columns: 2 })
        );
    }

    @Action(/^EDIT_CATEGORY_(.+)$/)
    @Roles(Role.SUPER_ADMIN)
    async onEditCategory(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const categoryData = ctx.callbackQuery.data;
        const categoryId = categoryData.replace('EDIT_CATEGORY_', '');

        const category = await this.prisma.category.findUnique({
            where: { id: categoryId },
        });

        if (!category) {
            await ctx.editMessageText('❌ Kategoriya topilmadi.');
            return;
        }

        // Scene state'ga category ma'lumotlarini saqlash
        ctx.scene.state = { 
            categoryId, 
            categoryName: category.name, 
            categoryEmoji: category.emoji 
        };
        await ctx.scene.enter('edit-category-scene', ctx.scene.state);
    }

    @Action(/^DELETE_CATEGORY_(.+)$/)
    @Roles(Role.SUPER_ADMIN)
    async onDeleteCategory(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const categoryData = ctx.callbackQuery.data;
        const categoryId = categoryData.replace('DELETE_CATEGORY_', '');

        // Scene state'ga category ID'ni saqlash
        ctx.scene.state = { categoryId };
        await ctx.scene.enter('delete-category-scene', ctx.scene.state);
    }

    @Action('BACK_TO_CATEGORIES')
    @Roles(Role.SUPER_ADMIN)
    async onBackToCategories(@Ctx() ctx: Context) {
        // Kategoriyalar ro'yxatini qayta ko'rsatish
        const categories = await this.prisma.category.findMany({
            orderBy: { name: 'asc' },
        });

        if (!categories || categories.length === 0) {
            await ctx.editMessageText(
                '❌ Hech qanday kategoriya mavjud emas.',
                Markup.inlineKeyboard([
                    Markup.button.callback('➕ Kategoriya qo\'shish', 'ADD_CATEGORY'),
                ])
            );
            return;
        }

        const categoryButtons = categories.map((category) =>
            Markup.button.callback(
                `${category.emoji} ${category.name}`,
                `VIEW_CATEGORY_${category.id}`,
            ),
        );

        await ctx.editMessageText(
            `📦 Kategoriyalar ro'yxati (${categories.length} ta):`,
            Markup.inlineKeyboard([
                ...categoryButtons,
                Markup.button.callback('➕ Yangi kategoriya', 'ADD_CATEGORY'),
            ], { columns: 2 }),
        );
    }
}