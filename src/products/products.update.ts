import { UseGuards } from '@nestjs/common';
import {
  Update,
  Command,
  Ctx,
  Scene,
  SceneEnter,
  On,
  Message,
  Action,
} from 'nestjs-telegraf';
import { AuthGuard } from '../auth/guards/auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { PrismaService } from '../prisma/prisma.service';
import { Context } from '../interfaces/context.interface';

@Update()
@UseGuards(AuthGuard)
export class ProductsUpdate {
  constructor(private readonly prisma: PrismaService) {}

  @Command('list_products')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async listProducts(@Ctx() ctx: Context) {
    const products = await this.prisma.product.findMany();
    if (products.length === 0) {
      return 'No products found.';
    }
    const productList = products
      .map(
        (p) =>
          `- ${p.type} ${p.name} (Sides: ${p.sides.join(', ')}) - Price: ${
            p.price
          }`,
      )
      .join('\n');
    return `Here are the existing products:\n${productList}`;
  }

  @Command('add_product')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async onAddProduct(@Ctx() ctx: Context) {
    await ctx.scene.enter('add-product-scene');
  }

  @Command('edit_product')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async onEditProduct(@Ctx() ctx: Context) {
    await ctx.scene.enter('edit-product-scene');
  }
}

@Scene('add-product-scene')
export class AddProductScene {
  constructor(private readonly prisma: PrismaService) {}

  @SceneEnter()
  async onSceneEnter(@Ctx() ctx: Context) {
    await ctx.reply('Please enter the product type (e.g., "Telefon").');
  }

  @On('text')
  async onText(@Ctx() ctx: Context, @Message('text') text: string) {
    const sceneState = ctx.scene.state as any;

    // Step 1: Set Type
    if (!sceneState.type) {
      sceneState.type = text;
      await ctx.reply(`Type set to "${text}". Now, please enter the product name (model).`);
      return;
    }

    // Step 2: Set Name
    if (!sceneState.name) {
      sceneState.name = text;
      await ctx.reply(`Name set to "${text}". Now, please enter the available sides, separated by commas (e.g., oldi, orqa).`);
      return;
    }

    // Step 3: Set Sides
    if (!sceneState.sides) {
      const sides = text.split(',').map(s => s.trim());
      sceneState.sides = sides;
      await ctx.reply(`Sides set to "${sides.join(', ')}". Now, please enter the price.`);
      return;
    }

    // Step 4: Set Price and Save
    if (!sceneState.price) {
      const price = parseFloat(text);
      if (isNaN(price)) {
        await ctx.reply('Invalid price. Please enter a number.');
        return;
      }
      sceneState.price = price;

      await this.prisma.product.create({
        data: {
          type: sceneState.type,
          name: sceneState.name,
          sides: sceneState.sides,
          price: sceneState.price,
        },
      });

      await ctx.reply(`Successfully created product "${sceneState.type} ${sceneState.name}".`);
      await ctx.scene.leave();
    }
  }
}

@Scene('edit-product-scene')
export class EditProductScene {
  constructor(private readonly prisma: PrismaService) {}

  @SceneEnter()
  async onSceneEnter(@Ctx() ctx: Context) {
    const products = await this.prisma.product.findMany();
    if (products.length === 0) {
      await ctx.reply('No products to edit.');
      await ctx.scene.leave();
      return;
    }
    const buttons = products.map((p) => ({
      text: `${p.type} ${p.name}`,
      callback_data: `edit_product_${p.id}`,
    }));
    const keyboard = {
      inline_keyboard: buttons.map((btn) => [btn]),
    };
    await ctx.reply('Please select a product to edit:', {
      reply_markup: keyboard,
    });
  }

  @Action(/edit_product_(.+)/)
  async onProductSelect(@Ctx() ctx: Context) {
    const productId = (ctx.callbackQuery as any).data.split('_')[2];
    const sceneState = ctx.scene.state as any;
    sceneState.productId = productId;

    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
        await ctx.answerCbQuery('Product not found!');
        await ctx.scene.leave();
        return;
    }

    const keyboard = {
      inline_keyboard: [
        [
          { text: 'Type', callback_data: 'edit_field_type' },
          { text: 'Name', callback_data: 'edit_field_name' },
        ],
        [
          { text: 'Sides', callback_data: 'edit_field_sides' },
          { text: 'Price', callback_data: 'edit_field_price' },
        ],
      ],
    };
    await ctx.editMessageText(
      `You selected "${product.type} ${product.name}". Which field do you want to edit?`,
      { reply_markup: keyboard },
    );
  }

  @Action(/edit_field_(.+)/)
  async onFieldSelect(@Ctx() ctx: Context) {
    const field = (ctx.callbackQuery as any).data.split('_')[2];
    const sceneState = ctx.scene.state as any;
    sceneState.fieldToEdit = field;
    await ctx.answerCbQuery(`Editing ${field}`);
    await ctx.reply(`Please enter the new value for ${field}.`);
  }

  @On('text')
  async onNewValue(@Ctx() ctx: Context, @Message('text') text: string) {
    const sceneState = ctx.scene.state as any;
    const { productId, fieldToEdit } = sceneState;

    if (!productId || !fieldToEdit) {
      return; // Not in the right state, ignore text message
    }

    let updateData: any = {};
    if (fieldToEdit === 'price') {
      const price = parseFloat(text);
      if (isNaN(price)) {
        await ctx.reply('Invalid price. Please enter a number.');
        return;
      }
      updateData.price = price;
    } else if (fieldToEdit === 'sides') {
      updateData.sides = text.split(',').map(s => s.trim());
    } else {
      updateData[fieldToEdit] = text;
    }

    const updatedProduct = await this.prisma.product.update({
      where: { id: productId },
      data: updateData,
    });

    await ctx.reply(
      `Successfully updated product: "${updatedProduct.type} ${updatedProduct.name}".`
    );
    await ctx.scene.leave();
  }
}
