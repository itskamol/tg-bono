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
import { Markup } from 'telegraf';

@Update()
@UseGuards(AuthGuard)
export class OrdersUpdate {
  @Command('neworder')
  @Roles(Role.KASSIR)
  async onNewOrder(@Ctx() ctx: Context) {
    if (!ctx.user.branch_id) {
      return "You are not assigned to a branch. You cannot create orders.";
    }
    await ctx.scene.enter('new-order-scene');
  }
}

@Scene('new-order-scene')
export class NewOrderScene {
  constructor(private readonly prisma: PrismaService) {}

  @SceneEnter()
  async onSceneEnter(@Ctx() ctx: Context) {
    const sceneState = ctx.scene.state as any;
    sceneState.products = [];
    sceneState.currentProduct = {};
    await ctx.reply("Starting new order. Please enter the client's name.");
  }

  @On('text')
  async onText(@Ctx() ctx: Context, @Message('text') text: string) {
    const sceneState = ctx.scene.state as any;

    // Step 1: Client Name
    if (!sceneState.clientName) {
      sceneState.clientName = text;
      await ctx.reply("Client name set. Please enter the client's phone number.");
      return;
    }

    // Step 2: Client Phone
    if (!sceneState.clientPhone) {
      sceneState.clientPhone = text;
      await ctx.reply("Client phone set. Please enter the client's birthday (YYYY-MM-DD).");
      return;
    }

    // Step 3: Client Birthday
    if (!sceneState.clientBirthday) {
      // Basic validation for date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        await ctx.reply("Invalid date format. Please use YYYY-MM-DD.");
        return;
      }
      sceneState.clientBirthday = new Date(text);
      await ctx.reply("Client birthday set. Let's add a product.");
      return this.showProductTypes(ctx);
    }

    // This handler will also be used for quantity
    if (sceneState.awaitingQuantity) {
        const quantity = parseInt(text, 10);
        if (isNaN(quantity) || quantity <= 0) {
            await ctx.reply("Invalid quantity. Please enter a positive number.");
            return;
        }
        sceneState.currentProduct.quantity = quantity;
        sceneState.products.push(sceneState.currentProduct);
        sceneState.currentProduct = {};
        sceneState.awaitingQuantity = false;

        const total = sceneState.products.reduce((sum, p) => sum + (p.price * p.quantity), 0);

        await ctx.reply(
            `Product added. Current total: ${total}.\nAdd another product or proceed to payment?`,
            Markup.inlineKeyboard([
                Markup.button.callback('Add Another Product', 'ADD_PRODUCT'),
                Markup.button.callback('Proceed to Payment', 'PAYMENT'),
            ])
        );
    }
  }

  async showProductTypes(ctx: Context) {
    const productTypes = await this.prisma.product.findMany({
        distinct: ['type'],
        select: { type: true }
    });
    if (productTypes.length === 0) {
        await ctx.reply("There are no products available to order.");
        return ctx.scene.leave();
    }
    await ctx.reply(
        'Please select a product type:',
        Markup.inlineKeyboard(
            productTypes.map((pt) => Markup.button.callback(pt.type, `TYPE_${pt.type}`))
        )
    );
  }

  @Action(/TYPE_(.+)/)
  async onProductType(@Ctx() ctx: Context, @Message() msg) {
    const type = (ctx.callbackQuery as any).data.split('_')[1];
    const sceneState = ctx.scene.state as any;
    sceneState.currentProduct.type = type;

    const products = await this.prisma.product.findMany({ where: { type } });

    await ctx.editMessageText(
        `Type "${type}" selected. Now select a product:`,
        Markup.inlineKeyboard(
            products.map((p) => Markup.button.callback(p.name, `PRODUCT_${p.id}`))
        )
    );
  }

  @Action(/PRODUCT_(.+)/)
  async onProduct(@Ctx() ctx: Context) {
      const productId = (ctx.callbackQuery as any).data.split('_')[1];
      const sceneState = ctx.scene.state as any;
      const product = await this.prisma.product.findUnique({where: {id: productId}});
      sceneState.currentProduct.productId = product.id;
      sceneState.currentProduct.price = product.price;

      if (product.sides && product.sides.length > 0) {
          await ctx.editMessageText(
              `Product "${product.name}" selected. Please select a side:`,
              Markup.inlineKeyboard(
                  product.sides.map((s) => Markup.button.callback(s, `SIDE_${s}`))
              )
          );
      } else {
          sceneState.currentProduct.side = 'N/A';
          await ctx.editMessageText(`Product "${product.name}" selected. Please enter the quantity.`);
          sceneState.awaitingQuantity = true;
      }
  }

    @Action(/SIDE_(.+)/)
    async onSide(@Ctx() ctx: Context) {
        const side = (ctx.callbackQuery as any).data.split('_')[1];
        const sceneState = ctx.scene.state as any;
        sceneState.currentProduct.side = side;
        await ctx.editMessageText(`Side "${side}" selected. Please enter the quantity.`);
        sceneState.awaitingQuantity = true;
    }

    @Action('ADD_PRODUCT')
    async onAddAnotherProduct(@Ctx() ctx: Context) {
        await ctx.editMessageText('Adding another product.');
        return this.showProductTypes(ctx);
    }

    @Action('PAYMENT')
    async onPayment(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as any;
        const total = sceneState.products.reduce((sum, p) => sum + (p.price * p.quantity), 0);
        sceneState.totalAmount = total;

        await ctx.editMessageText(
            `Order total: ${total}. Please select a payment type:`,
            Markup.inlineKeyboard([
                Markup.button.callback('Cash', 'PAYMENT_cash'),
                Markup.button.callback('Card', 'PAYMENT_card'),
                Markup.button.callback('Credit', 'PAYMENT_credit'),
            ])
        );
    }

    @Action(/PAYMENT_(.+)/)
    async onPaymentType(@Ctx() ctx: Context) {
        const paymentType = (ctx.callbackQuery as any).data.split('_')[1];
        const sceneState = ctx.scene.state as any;
        sceneState.paymentType = paymentType;

        const orderSummary = `
            **Order Confirmation**
            Client: ${sceneState.clientName} (${sceneState.clientPhone})

            **Products:**
            ${sceneState.products.map(p => `- ${p.quantity}x Product ID ${p.productId} (Side: ${p.side}) @ ${p.price} each`).join('\n')}

            **Total: ${sceneState.totalAmount}**
            Payment: ${paymentType}
        `;

        await ctx.editMessageText(
            `Please confirm the order:\n${orderSummary}`,
            Markup.inlineKeyboard([
                Markup.button.callback('Confirm Order', 'CONFIRM_ORDER'),
                Markup.button.callback('Cancel', 'CANCEL_ORDER'),
            ])
        );
    }

    @Action('CONFIRM_ORDER')
    async onConfirmOrder(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as any;
        const user = ctx.user;

        const orderNumber = `ORDER-${Date.now()}-${user.branch_id.slice(-4)}`;

        await this.prisma.order.create({
            data: {
                order_number: orderNumber,
                client_name: sceneState.clientName,
                client_phone: sceneState.clientPhone,
                client_birthday: sceneState.clientBirthday,
                branch_id: user.branch_id,
                cashier_id: user.id,
                payment_type: sceneState.paymentType,
                total_amount: sceneState.totalAmount,
                order_products: {
                    create: sceneState.products.map(p => ({
                        product_id: p.productId,
                        side: p.side,
                        quantity: p.quantity,
                        price: p.price
                    }))
                }
            }
        });

        await ctx.editMessageText(`Order ${orderNumber} confirmed and saved successfully!`);
        await ctx.scene.leave();
    }

    @Action('CANCEL_ORDER')
    async onCancelOrder(@Ctx() ctx:
    : Context) {
        await ctx.editMessageText('Order cancelled.');
        await ctx.scene.leave();
    }
}
