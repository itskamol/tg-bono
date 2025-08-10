import { UseGuards } from '@nestjs/common';
import {
  Update,
  Command,
  Ctx,
  Scene,
  SceneEnter,
  On,
  Message,
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
