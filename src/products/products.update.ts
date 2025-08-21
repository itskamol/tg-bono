import { UseGuards } from '@nestjs/common';
import { Update, Command, Ctx, Action } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { AuthGuard } from '../auth/guards/auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { Context } from '../interfaces/context.interface';
import { Role } from '@prisma/client';

@Update()
@UseGuards(AuthGuard)
export class ProductsUpdate {
    constructor(private readonly prisma: PrismaService) {}

    @Command('list_products')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN)
    async listProducts() {
        const products = await this.prisma.product.findMany({
            orderBy: [{ type: 'asc' }, { name: 'asc' }],
        });

        if (products.length === 0) {
            return '❌ Mahsulotlar topilmadi.';
        }

        const productsByType = products.reduce(
            (acc, product) => {
                if (!acc[product.type]) {
                    acc[product.type] = [];
                }
                acc[product.type].push(product);
                return acc;
            },
            {} as Record<string, typeof products>,
        );

        let productList = '';
        Object.entries(productsByType).forEach(([type, typeProducts]) => {
            productList += `\n${this.getTypeEmoji(type)} ${this.capitalizeFirst(type)}:\n`;
            typeProducts.forEach((p) => {
                productList += `  • ${p.name} - ${p.price} so'm\n    Tomonlar: ${p.sides.join(', ')}\n`;
            });
        });

        return `📦 Mahsulotlar ro'yxati:${productList}`;
    }

    @Command('add_product')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN)
    async onAddProduct(@Ctx() ctx: Context) {
        await ctx.scene.enter('add-product-scene');
    }

    @Command('edit_product')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN)
    async onEditProduct(@Ctx() ctx: Context) {
        const products = await this.prisma.product.findMany({
            orderBy: [{ type: 'asc' }, { name: 'asc' }],
        });

        if (products.length === 0) {
            await ctx.reply('❌ Tahrirlanadigan mahsulotlar topilmadi.');
            return;
        }

        const productButtons = products.map((product) =>
            Markup.button.callback(
                `${this.getTypeEmoji(product.type)} ${product.name} - ${product.price} so'm`,
                `EDIT_PRODUCT_${product.id}`,
            ),
        );

        await ctx.reply(
            '✏️ Qaysi mahsulotni tahrirlashni xohlaysiz?',
            Markup.inlineKeyboard(productButtons, {
                columns: 2,
            }),
        );
    }

    @Command('delete_product')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN)
    async onDeleteProduct(@Ctx() ctx: Context) {
        await ctx.scene.enter('delete-product-scene');
    }

    @Action(/^EDIT_PRODUCT_(.+)$/)
    async onEditProductSelect(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) return;
        const productId = ctx.callbackQuery.data.replace('EDIT_PRODUCT_', '');

        const product = await this.prisma.product.findUnique({
            where: { id: productId },
        });

        if (!product) {
            await ctx.editMessageText('❌ Mahsulot topilmadi.');
            return;
        }

        await ctx.editMessageText(
            `✏️ "${product.name}" mahsulotini tahrirlash:\n\n` +
                `📦 Turi: ${product.type}\n` +
                `📝 Nomi: ${product.name}\n` +
                `🍕 Tomonlar: ${product.sides.join(', ')}\n` +
                `💰 Narxi: ${product.price} so'm\n\n` +
                `Nimani o'zgartirmoqchisiz?`,
            Markup.inlineKeyboard(
                [
                    Markup.button.callback('📦 Turi', `EDIT_PRODUCT_TYPE_${productId}`),
                    Markup.button.callback('📝 Nomi', `EDIT_PRODUCT_NAME_${productId}`),
                    Markup.button.callback('🍕 Tomonlar', `EDIT_PRODUCT_SIDES_${productId}`),
                    Markup.button.callback('💰 Narxi', `EDIT_PRODUCT_PRICE_${productId}`),
                    Markup.button.callback('❌ Bekor', 'CANCEL_PRODUCT_EDIT'),
                ],
                {
                    columns: 2,
                },
            ),
        );
    }

    @Action('CANCEL_PRODUCT_EDIT')
    async onCancelProductEdit(@Ctx() ctx: Context) {
        await ctx.editMessageText('❌ Tahrirlash bekor qilindi.');
    }

    @Action(/^EDIT_PRODUCT_TYPE_(.+)$/)
    async onEditProductType(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) return;
        const productId = ctx.callbackQuery.data.replace('EDIT_PRODUCT_TYPE_', '');
        await ctx.scene.enter('edit-product-type-scene', { productId });
    }

    @Action(/^EDIT_PRODUCT_NAME_(.+)$/)
    async onEditProductName(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) return;
        const productId = ctx.callbackQuery.data.replace('EDIT_PRODUCT_NAME_', '');
        await ctx.scene.enter('edit-product-name-scene', { productId });
    }

    @Action(/^EDIT_PRODUCT_SIDES_(.+)$/)
    async onEditProductSides(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) return;
        const productId = ctx.callbackQuery.data.replace('EDIT_PRODUCT_SIDES_', '');
        await ctx.scene.enter('edit-product-sides-scene', { productId });
    }

    @Action(/^EDIT_PRODUCT_PRICE_(.+)$/)
    async onEditProductPrice(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) return;
        const productId = ctx.callbackQuery.data.replace('EDIT_PRODUCT_PRICE_', '');
        await ctx.scene.enter('edit-product-price-scene', { productId });
    }

    private getTypeEmoji(type: string): string {
        const emojis: { [key: string]: string } = {
            pizza: '🍕',
            burger: '🍔',
            drink: '🥤',
            dessert: '🍰',
            salad: '🥗',
        };
        return emojis[type.toLowerCase()] || '📦';
    }

    private capitalizeFirst(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}
