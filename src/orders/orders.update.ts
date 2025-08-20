import { UseGuards } from '@nestjs/common';
import { Update, Command, Ctx, Action } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { AuthGuard } from '../auth/guards/auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { PrismaService } from '../prisma/prisma.service';
import { Context } from '../interfaces/context.interface';

@Update()
@UseGuards(AuthGuard)
export class OrdersUpdate {
  constructor(private readonly prisma: PrismaService) {}

  @Command('neworder')
  @Roles(Role.KASSIR)
  async onNewOrder(@Ctx() ctx: Context) {
    if (!ctx.user.branch_id) {
      await ctx.reply("❌ Siz hech qanday filialga tayinlanmagansiz. Buyurtma yarata olmaysiz.");
      return;
    }
    await ctx.scene.enter('new-order-scene');
  }

  @Command('list_orders')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.KASSIR)
  async listOrders(@Ctx() ctx: Context) {
    const user = ctx.user;
    let orders;

    if (user.role === Role.SUPER_ADMIN) {
      orders = await this.prisma.order.findMany({
        include: {
          branch: true,
          cashier: true,
          order_products: {
            include: { product: true }
          }
        },
        orderBy: { created_at: 'desc' },
        take: 10
      });
    } else if (user.role === Role.ADMIN || user.role === Role.KASSIR) {
      if (!user.branch_id) {
        await ctx.reply('❌ Siz hech qanday filialga tayinlanmagansiz.');
        return;
      }
      orders = await this.prisma.order.findMany({
        where: { branch_id: user.branch_id },
        include: {
          branch: true,
          cashier: true,
          order_products: {
            include: { product: true }
          }
        },
        orderBy: { created_at: 'desc' },
        take: 10
      });
    }

    if (!orders || orders.length === 0) {
      await ctx.reply('❌ Buyurtmalar topilmadi.');
      return;
    }

    const orderButtons = orders.map(order => 
      Markup.button.callback(
        `${order.order_number} - ${order.total_amount} so'm`, 
        `VIEW_ORDER_${order.id}`
      )
    );

    await ctx.reply(
      '📋 So\'nggi buyurtmalar (10 ta):',
      Markup.inlineKeyboard(orderButtons)
    );
  }

  @Command('order_stats')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async orderStats(@Ctx() ctx: Context) {
    const user = ctx.user;
    let whereClause = {};

    if (user.role === Role.ADMIN && user.branch_id) {
      whereClause = { branch_id: user.branch_id };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [todayOrders, totalOrders, todayRevenue, totalRevenue] = await Promise.all([
      this.prisma.order.count({
        where: {
          ...whereClause,
          created_at: {
            gte: today,
            lt: tomorrow
          }
        }
      }),
      this.prisma.order.count({ where: whereClause }),
      this.prisma.order.aggregate({
        where: {
          ...whereClause,
          created_at: {
            gte: today,
            lt: tomorrow
          }
        },
        _sum: { total_amount: true }
      }),
      this.prisma.order.aggregate({
        where: whereClause,
        _sum: { total_amount: true }
      })
    ]);

    const statsMessage = `
📊 Buyurtma statistikasi:

📅 Bugun:
• Buyurtmalar: ${todayOrders} ta
• Daromad: ${todayRevenue._sum.total_amount || 0} so'm

📈 Jami:
• Buyurtmalar: ${totalOrders} ta  
• Daromad: ${totalRevenue._sum.total_amount || 0} so'm

${user.role === Role.ADMIN ? `🏪 Filial: ${user.branch?.name || 'N/A'}` : '🌐 Barcha filiallar'}
    `;

    await ctx.reply(statsMessage);
  }

  @Action(/^VIEW_ORDER_(.+)$/)
  async onViewOrder(@Ctx() ctx: Context) {
    const orderData = (ctx.callbackQuery as any).data;
    const orderId = orderData.replace('VIEW_ORDER_', '');
    
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        branch: true,
        cashier: true,
        order_products: {
          include: { product: true }
        }
      }
    });
    
    if (!order) {
      await ctx.editMessageText('❌ Buyurtma topilmadi.');
      return;
    }

    const products = order.order_products
      .map(op => `• ${op.quantity}x ${op.product.name} (${op.side}) - ${op.price * op.quantity} so'm`)
      .join('\n');

    const orderDetails = `
📋 Buyurtma tafsilotlari:

🔢 Raqam: ${order.order_number}
👤 Mijoz: ${order.client_name}
📞 Telefon: ${order.client_phone}
🎂 Tug'ilgan kun: ${order.client_birthday.toLocaleDateString('uz-UZ')}

🏪 Filial: ${order.branch.name}
💰 Kassir: ${order.cashier.full_name}
💳 To'lov turi: ${order.payment_type}

📦 Mahsulotlar:
${products}

💵 Jami: ${order.total_amount} so'm
📅 Sana: ${order.created_at.toLocaleString('uz-UZ')}
    `;

    await ctx.editMessageText(orderDetails);
  }
}