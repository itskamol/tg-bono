import { Update, Command, Ctx, Action } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { Context } from '../interfaces/context.interface';
import { Role } from '@prisma/client';
import { safeEditMessageText } from '../utils/telegram.utils';
import { formatCurrency } from 'src/utils/format.utils';

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
                    Markup.button.callback("➕ Kategoriya qo'shish", 'ADD_CATEGORY'),
                ]),
            );
            return;
        }

        const categoryButtons = categories.map((category) =>
            Markup.button.callback(category.name, `VIEW_CATEGORY_${category.id}`),
        );

        await ctx.reply(
            `📦 Kategoriyalar ro'yxati (${categories.length} ta):`,
            Markup.inlineKeyboard(
                [...categoryButtons, Markup.button.callback('➕ Yangi kategoriya', 'ADD_CATEGORY')],
                { columns: 2 },
            ),
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
            include: { sides: true },
        });

        if (!category) {
            await ctx.editMessageText('❌ Kategoriya topilmadi.');
            return;
        }

        // Kategoriyada nechta mahsulot ishlatilganini hisoblash
        const productsCount = await this.prisma.order_Product.count({
            where: { category: category.name },
        });

        // Sides ma'lumotlari
        const sidesInfo =
            category.sides.length > 0
                ? category.sides
                      .map((side) => `• ${side.name}: ${formatCurrency(side.price)}`)
                      .join('\n')
                : "Hech qanday tomon qo'shilmagan";

        const categoryDetails = `
📦 Kategoriya ma'lumotlari:

📝 Nomi: ${category.name}
📊 Ishlatilgan: ${productsCount} ta buyurtmada
📅 Yaratilgan: ${category.created_at.toLocaleDateString('uz-UZ')}

🍕 Tomonlar (${category.sides.length} ta):
${sidesInfo}

Nima qilmoqchisiz?
        `;

        await safeEditMessageText(
            ctx,
            categoryDetails,
            Markup.inlineKeyboard(
                [
                    Markup.button.callback('✏️ Tahrirlash', `EDIT_CATEGORY_${category.id}`),
                    Markup.button.callback('🍕 Tomonlar', `MANAGE_SIDES_${category.id}`),
                    Markup.button.callback("🗑️ O'chirish", `DELETE_CATEGORY_${category.id}`),
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_CATEGORIES'),
                ],
                { columns: 2 },
            ),
            "Kategoriya ma'lumotlari",
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
        };
        await ctx.scene.enter('edit-category-scene', ctx.scene.state);
    }

    @Action(/^MANAGE_SIDES_(.+)$/)
    @Roles(Role.SUPER_ADMIN)
    async onManageSides(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const categoryData = ctx.callbackQuery.data;
        const categoryId = categoryData.replace('MANAGE_SIDES_', '');

        const category = await this.prisma.category.findUnique({
            where: { id: categoryId },
            include: { sides: true },
        });

        if (!category) {
            await safeEditMessageText(ctx, '❌ Kategoriya topilmadi.', undefined, 'Xatolik');
            return;
        }

        const sidesButtons = category.sides.map((side) =>
            Markup.button.callback(
                `${side.name} (${formatCurrency(side.price)})`,
                `VIEW_SIDE_${side.id}`,
            ),
        );

        await safeEditMessageText(
            ctx,
            `🍕 "${category.name}" kategoriyasi tomonlari (${category.sides.length} ta):`,
            Markup.inlineKeyboard(
                [
                    ...sidesButtons,
                    Markup.button.callback('➕ Yangi tomon', `ADD_SIDE_${categoryId}`),
                    Markup.button.callback('🔙 Orqaga', `VIEW_CATEGORY_${categoryId}`),
                ],
                { columns: 1 },
            ),
            "Tomonlar ro'yxati",
        );
    }

    @Action(/^ADD_SIDE_(.+)$/)
    @Roles(Role.SUPER_ADMIN)
    async onAddSide(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const categoryData = ctx.callbackQuery.data;
        const categoryId = categoryData.replace('ADD_SIDE_', '');

        ctx.scene.state = { categoryId };
        await ctx.scene.enter('add-side-scene', ctx.scene.state);
    }

    @Action(/^VIEW_SIDE_(.+)$/)
    @Roles(Role.SUPER_ADMIN)
    async onViewSide(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const sideData = ctx.callbackQuery.data;
        const sideId = sideData.replace('VIEW_SIDE_', '');

        const side = await this.prisma.side.findUnique({
            where: { id: sideId },
            include: { category: true },
        });

        if (!side) {
            await safeEditMessageText(ctx, '❌ Tomon topilmadi.', undefined, 'Xatolik');
            return;
        }

        const sideDetails = `
🍕 Tomon ma'lumotlari:

📝 Nomi: ${side.name}
💰 Narxi: ${formatCurrency(side.price)}
📦 Kategoriya: ${side.category.name}
📅 Yaratilgan: ${side.created_at.toLocaleDateString('uz-UZ')}

Nima qilmoqchisiz?
        `;

        await safeEditMessageText(
            ctx,
            sideDetails,
            Markup.inlineKeyboard(
                [
                    Markup.button.callback('✏️ Tahrirlash', `EDIT_SIDE_${side.id}`),
                    Markup.button.callback("🗑️ O'chirish", `DELETE_SIDE_${side.id}`),
                    Markup.button.callback('🔙 Orqaga', `MANAGE_SIDES_${side.category_id}`),
                ],
                { columns: 2 },
            ),
            "Tomon ma'lumotlari",
        );
    }

    @Action(/^EDIT_SIDE_(.+)$/)
    @Roles(Role.SUPER_ADMIN)
    async onEditSide(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const sideData = ctx.callbackQuery.data;
        const sideId = sideData.replace('EDIT_SIDE_', '');

        ctx.scene.state = { sideId };
        await ctx.scene.enter('edit-side-scene', ctx.scene.state);
    }

    @Action(/^DELETE_SIDE_(.+)$/)
    @Roles(Role.SUPER_ADMIN)
    async onDeleteSide(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const sideData = ctx.callbackQuery.data;
        const sideId = sideData.replace('DELETE_SIDE_', '');

        ctx.scene.state = { sideId };
        await ctx.scene.enter('delete-side-scene', ctx.scene.state);
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
            await safeEditMessageText(
                ctx,
                '❌ Hech qanday kategoriya mavjud emas.',
                Markup.inlineKeyboard([
                    Markup.button.callback("➕ Kategoriya qo'shish", 'ADD_CATEGORY'),
                ]),
                "Kategoriyalar ro'yxati",
            );
            return;
        }

        const categoryButtons = categories.map((category) =>
            Markup.button.callback(category.name, `VIEW_CATEGORY_${category.id}`),
        );

        await safeEditMessageText(
            ctx,
            `📦 Kategoriyalar ro'yxati (${categories.length} ta):`,
            Markup.inlineKeyboard(
                [...categoryButtons, Markup.button.callback('➕ Yangi kategoriya', 'ADD_CATEGORY')],
                { columns: 2 },
            ),
            "Kategoriyalar ro'yxati",
        );
    }
}
