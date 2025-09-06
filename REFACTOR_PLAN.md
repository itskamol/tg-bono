# 🚀 TG-BONO Loyihasi - Keng Miqyosli Refactor Plan

## 📊 Hozirgi Holatni Baholash

### ✅ Yaxshi Tomonlar
- **Framework**: NestJS yaxshi tanlangan va to'g'ri ishlatilgan
- **Database**: Prisma ORM + MongoDB kombinatsiyasi
- **Authentication**: Role-based access control (SUPER_ADMIN, ADMIN, CASHIER)
- **Modular Structure**: Feature-based modullar mavjud
- **Infrastructure**: Docker, TypeScript, ESLint konfiguratsiyasi

### ❌ Asosiy Muammolar

#### 1. Architecture Issues
- **Fat Controllers**: `NewOrderScene` 1100+ qator kod (ideal: <200)
- **Monolithic Module**: `TelegramModule` barcha update'larni o'z ichiga olgan
- **Mixed Responsibilities**: Scene'lar ham UI ham business logic bilan
- **Dependency Issues**: Circular dependencies va tight coupling

#### 2. Code Quality Issues
- `any` types ko'p ishlatilgan (type safety buzilgan)
- `console.log` statements production kodda qolgan
- Error handling standardlashtirilmagan
- Input validation yo'q
- DTOs va validation pipes yo'q

#### 3. Performance Issues
- N+1 query muammolari Prisma so'rovlarida
- Eager loading strategiyasi optimallashtirilmagan
- Caching layer yo'q
- Database connection pool sozlanmagan

#### 4. Security Issues
- Rate limiting yo'q
- Input sanitization qilinmagan
- Error messages haddan ortiq ma'lumot berishi mumkin
- Logging system yo'q

#### 5. Testing Issues
- Unit testlar yo'q
- Integration testlar yo'q
- E2E testlar minimal

---

## 🎯 4-Fazali Refactor Strategiyasi

### **Phase 1: Architecture Foundation** ⏱️ (2-3 hafta)

#### 1.1 Feature-Based Module Restructure

**Hozirgi struktura:**
```
src/
├── telegram/           # Monolithic module
├── users/
├── orders/
├── reports/
└── ...
```

**Yangi struktura:**
```
src/
├── core/                          # Core functionality
│   ├── database/
│   │   ├── database.module.ts
│   │   └── database.config.ts
│   ├── config/
│   │   ├── app.config.ts
│   │   └── validation.schema.ts
│   ├── guards/
│   │   ├── auth.guard.ts
│   │   └── roles.guard.ts
│   └── middlewares/
│       ├── auth.middleware.ts
│       └── logging.middleware.ts
├── shared/                        # Shared utilities
│   ├── dtos/
│   │   ├── base.dto.ts
│   │   └── pagination.dto.ts
│   ├── enums/
│   │   ├── role.enum.ts
│   │   └── payment-type.enum.ts
│   ├── interfaces/
│   │   ├── repository.interface.ts
│   │   └── service.interface.ts
│   └── utils/
│       ├── format.utils.ts
│       └── validation.utils.ts
├── features/                      # Feature modules
│   ├── auth/
│   │   ├── commands/
│   │   ├── queries/
│   │   ├── handlers/
│   │   └── auth.module.ts
│   ├── users/
│   │   ├── commands/
│   │   ├── queries/
│   │   ├── handlers/
│   │   ├── scenes/
│   │   └── users.module.ts
│   ├── orders/
│   │   ├── commands/
│   │   ├── queries/
│   │   ├── handlers/
│   │   ├── scenes/
│   │   └── orders.module.ts
│   ├── reports/
│   │   ├── commands/
│   │   ├── queries/
│   │   ├── handlers/
│   │   ├── scenes/
│   │   └── reports.module.ts
│   └── telegram-bot/
│       ├── handlers/
│       ├── scenes/
│       └── telegram.module.ts
└── infrastructure/                # External services
    ├── google-sheets/
    │   ├── google-sheets.service.ts
    │   └── google-sheets.module.ts
    ├── notifications/
    │   ├── notification.service.ts
    │   └── notification.module.ts
    └── encryption/
        ├── encryption.service.ts
        └── encryption.module.ts
```

#### 1.2 CQRS Pattern Implementation

**Commands va Queries:**
```typescript
// commands/create-order.command.ts
export class CreateOrderCommand {
  constructor(
    public readonly userId: string,
    public readonly orderData: CreateOrderDto
  ) {}
}

// queries/get-order.query.ts
export class GetOrderQuery {
  constructor(
    public readonly orderId: string,
    public readonly userId: string
  ) {}
}

// handlers/create-order.handler.ts
@CommandHandler(CreateOrderCommand)
export class CreateOrderHandler implements ICommandHandler<CreateOrderCommand> {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly eventBus: EventBus
  ) {}

  async execute(command: CreateOrderCommand): Promise<Order> {
    // Validation
    const validation = await this.validateOrder(command.orderData);
    if (!validation.isValid) {
      throw new BadRequestException(validation.errors);
    }

    // Business logic
    const order = await this.orderRepository.create(command.orderData);

    // Event publishing
    this.eventBus.publish(new OrderCreatedEvent(order.id, command.userId));

    return order;
  }
}
```

#### 1.3 DTOs va Validation

```typescript
// dtos/create-order.dto.ts
export class CreateOrderDto {
  @IsString()
  @MinLength(2, { message: 'Mijoz ismi kamida 2 ta belgidan iborat bo\'lishi kerak' })
  @MaxLength(50, { message: 'Mijoz ismi 50 ta belgidan ko\'p bo\'lmasligi kerak' })
  clientName: string;

  @IsPhoneNumber('UZ', { message: 'Telefon raqami noto\'g\'ri formatda' })
  @IsOptional()
  clientPhone?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderProductDto)
  products: OrderProductDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  payments: PaymentDto[];
}

// dtos/order-product.dto.ts
export class OrderProductDto {
  @IsString()
  productId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  price: number;
}
```

### **Phase 2: Business Logic Separation** ⏱️ (2 hafta)

#### 2.1 Service Layer Architecture

```typescript
// domain/order.domain.service.ts
@Injectable()
export class OrderDomainService {
  calculateTotal(products: OrderProduct[], discounts?: Discount[]): number {
    const subtotal = products.reduce((sum, product) => 
      sum + (product.price * product.quantity), 0);
    
    const discountAmount = discounts?.reduce((sum, discount) => 
      sum + this.calculateDiscount(discount, subtotal), 0) || 0;
    
    return subtotal - discountAmount;
  }

  validateOrder(order: CreateOrderDto): ValidationResult {
    const errors: string[] = [];

    if (order.products.length === 0) {
      errors.push('Buyurtmada kamida bitta mahsulot bo\'lishi kerak');
    }

    if (order.payments.length === 0) {
      errors.push('To\'lov ma\'lumotlari kiritilishi kerak');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// application/order.application.service.ts
@Injectable()
export class OrderApplicationService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly orderDomain: OrderDomainService,
    private readonly eventBus: EventBus
  ) {}

  async createOrder(dto: CreateOrderDto, userId: string): Promise<Order> {
    // Domain validation
    const validation = this.orderDomain.validateOrder(dto);
    if (!validation.isValid) {
      throw new BadRequestException(validation.errors);
    }

    // Business logic
    const totalAmount = this.orderDomain.calculateTotal(dto.products);
    
    const order = await this.orderRepository.create({
      ...dto,
      totalAmount,
      userId,
      status: OrderStatus.PENDING
    });

    // Events
    this.eventBus.publish(new OrderCreatedEvent(order.id, userId));

    return order;
  }
}
```

#### 2.2 Repository Pattern

```typescript
// interfaces/order.repository.interface.ts
export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  findByUserId(userId: string, pagination: PaginationDto): Promise<Order[]>;
  findByDateRange(start: Date, end: Date): Promise<Order[]>;
  create(data: CreateOrderData): Promise<Order>;
  update(id: string, data: UpdateOrderData): Promise<Order>;
  delete(id: string): Promise<void>;
}

// repositories/prisma-order.repository.ts
@Injectable()
export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Order | null> {
    return this.prisma.order.findUnique({
      where: { id },
      include: {
        products: {
          include: {
            side: true,
            category: true
          }
        },
        payments: true,
        branch: true,
        cashier: true
      }
    });
  }

  async findByDateRange(start: Date, end: Date): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: {
        created_at: {
          gte: start,
          lte: end
        }
      },
      include: {
        products: true,
        payments: true
      }
    });
  }

  async create(data: CreateOrderData): Promise<Order> {
    return this.prisma.order.create({
      data: {
        ...data,
        products: {
          create: data.products
        },
        payments: {
          create: data.payments
        }
      },
      include: {
        products: true,
        payments: true
      }
    });
  }
}
```

#### 2.3 Scene Refactoring (Slim Controllers)

```typescript
// scenes/new-order.scene.ts (Refactored)
@Scene('new-order')
export class NewOrderScene {
  constructor(
    private readonly orderService: OrderApplicationService,
    private readonly logger: Logger
  ) {}

  @SceneEnter()
  async onEnter(@Ctx() ctx: Context) {
    try {
      await ctx.reply(
        '🛒 Yangi buyurtma yaratish',
        Markup.keyboard([
          ['📱 Mijoz ma\'lumotlarini kiriting'],
          ['🔙 Orqaga']
        ]).resize()
      );
      
      ctx.scene.state = { step: 'CLIENT_INFO' };
    } catch (error) {
      this.logger.error('Scene enter error', error);
      await ctx.reply('❌ Xatolik yuz berdi. Qaytadan urinib ko\'ring.');
    }
  }

  @On('text')
  async onText(@Ctx() ctx: Context) {
    const state = ctx.scene.state as NewOrderState;
    
    switch (state.step) {
      case 'CLIENT_INFO':
        return this.handleClientInfo(ctx);
      case 'PRODUCT_SELECTION':
        return this.handleProductSelection(ctx);
      case 'PAYMENT':
        return this.handlePayment(ctx);
      default:
        await ctx.reply('❌ Noto\'g\'ri qadam. Qaytadan boshlang.');
    }
  }

  @Action('COMPLETE_ORDER')
  async completeOrder(@Ctx() ctx: Context) {
    const state = ctx.scene.state as NewOrderState;
    
    try {
      const order = await this.orderService.createOrder(
        state.orderData,
        ctx.from.id.toString()
      );

      await ctx.reply(
        `✅ Buyurtma muvaffaqiyatli yaratildi!\n` +
        `📋 Buyurtma raqami: ${order.order_number}\n` +
        `💰 Jami summa: ${formatCurrency(order.total_amount)}`
      );

      await ctx.scene.leave();
    } catch (error) {
      this.logger.error('Order creation error', error);
      await ctx.reply('❌ Buyurtma yaratishda xatolik. Qaytadan urinib ko\'ring.');
    }
  }

  private async handleClientInfo(ctx: Context) {
    // Minimal UI logic only
    const text = ctx.text;
    if (text && text.length >= 2) {
      ctx.scene.state.orderData.clientName = text;
      ctx.scene.state.step = 'PRODUCT_SELECTION';
      return this.showProductSelection(ctx);
    }
    
    await ctx.reply('❌ Mijoz ismi kamida 2 ta belgidan iborat bo\'lishi kerak.');
  }
}
```

### **Phase 3: Performance & Quality** ⏱️ (2 hafta)

#### 3.1 Database Query Optimization

**N+1 Problem Fix:**
```typescript
// Before: N+1 problem
async getOrdersWithProducts(orderIds: string[]): Promise<Order[]> {
  const orders = await this.prisma.order.findMany({
    where: { id: { in: orderIds } }
  });

  // N+1 problem - separate query for each order
  for (const order of orders) {
    order.products = await this.prisma.orderProduct.findMany({
      where: { orderId: order.id }
    });
  }

  return orders;
}

// After: Optimized with includes
async getOrdersWithProducts(orderIds: string[]): Promise<Order[]> {
  return this.prisma.order.findMany({
    where: { id: { in: orderIds } },
    include: {
      products: {
        include: {
          side: true,
          category: true
        }
      },
      payments: true,
      branch: {
        select: {
          id: true,
          name: true,
          address: true
        }
      },
      cashier: {
        select: {
          id: true,
          full_name: true
        }
      }
    }
  });
}
```

#### 3.2 Caching Layer

```typescript
// cache/cache.service.ts
@Injectable()
export class CacheService {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly logger: Logger
  ) {}

  @Cacheable('user-permissions', 300) // 5 minutes
  async getUserPermissions(userId: string): Promise<Permission[]> {
    this.logger.debug(`Getting permissions for user: ${userId}`);
    return this.userService.getPermissions(userId);
  }

  @Cacheable('branch-products', 600) // 10 minutes
  async getBranchProducts(branchId: string): Promise<Product[]> {
    return this.productService.getByBranchId(branchId);
  }

  async invalidateUserCache(userId: string): Promise<void> {
    await this.cacheManager.del(`user-permissions:${userId}`);
  }
}

// cache/cache.decorator.ts
export function Cacheable(keyPrefix: string, ttl: number) {
  return function(target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function(...args: any[]) {
      const cacheKey = `${keyPrefix}:${args.join(':')}`;
      
      let result = await this.cacheManager.get(cacheKey);
      if (result) {
        return result;
      }
      
      result = await method.apply(this, args);
      await this.cacheManager.set(cacheKey, result, ttl);
      
      return result;
    };
  };
}
```

#### 3.3 Event-Driven Architecture

```typescript
// events/order-created.event.ts
export class OrderCreatedEvent {
  constructor(
    public readonly orderId: string,
    public readonly userId: string,
    public readonly branchId: string,
    public readonly totalAmount: number
  ) {}
}

// handlers/send-notification.handler.ts
@EventsHandler(OrderCreatedEvent)
export class SendNotificationHandler implements IEventHandler<OrderCreatedEvent> {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly googleSheetsService: GoogleSheetsService,
    private readonly logger: Logger
  ) {}

  async handle(event: OrderCreatedEvent): Promise<void> {
    try {
      // Send notification
      await this.notificationService.sendOrderConfirmation(event.orderId);
      
      // Update Google Sheets
      await this.googleSheetsService.addOrderToSheet(event.orderId);
      
      this.logger.log(`Order ${event.orderId} processed successfully`);
    } catch (error) {
      this.logger.error(`Failed to process order ${event.orderId}`, error);
      // Could implement retry logic here
    }
  }
}

// handlers/update-statistics.handler.ts
@EventsHandler(OrderCreatedEvent)
export class UpdateStatisticsHandler implements IEventHandler<OrderCreatedEvent> {
  constructor(
    private readonly statisticsService: StatisticsService,
    private readonly cacheService: CacheService
  ) {}

  async handle(event: OrderCreatedEvent): Promise<void> {
    // Update real-time statistics
    await this.statisticsService.incrementOrderCount(event.branchId);
    await this.statisticsService.addToRevenue(event.branchId, event.totalAmount);
    
    // Invalidate cache
    await this.cacheService.invalidateBranchStats(event.branchId);
  }
}
```

### **Phase 4: Security & DevOps** ⏱️ (1-2 hafta)

#### 4.1 Security Enhancements

```typescript
// security/rate-limiting.ts
@UseGuards(ThrottlerGuard)
@Throttle(100, 60) // 100 requests per minute
@Controller('orders')
export class OrderController {
  @Post()
  @Throttle(10, 60) // 10 order creations per minute
  async createOrder(@Body() dto: CreateOrderDto) {
    return this.orderService.createOrder(dto);
  }
}

// security/input-sanitization.pipe.ts
@Injectable()
export class SanitizeInputPipe implements PipeTransform {
  transform(value: any) {
    if (typeof value === 'string') {
      return sanitizeHtml(value, {
        allowedTags: [],
        allowedAttributes: {}
      });
    }
    
    if (typeof value === 'object' && value !== null) {
      return this.sanitizeObject(value);
    }
    
    return value;
  }

  private sanitizeObject(obj: any): any {
    const result = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = this.transform(val);
    }
    return result;
  }
}

// security/error-handling.ts
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Ichki server xatosi';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
    }

    // Log error but don't expose sensitive information
    this.logger.error(
      `${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : exception
    );

    response.status(status).json({
      statusCode: status,
      message: status === HttpStatus.INTERNAL_SERVER_ERROR 
        ? 'Ichki server xatosi' 
        : message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

#### 4.2 Health Checks & Monitoring

```typescript
// health/database.health.ts
@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return this.getStatus(key, true);
    } catch (error) {
      return this.getStatus(key, false, { error: error.message });
    }
  }
}

// health/telegram.health.ts
@Injectable()
export class TelegramHealthIndicator extends HealthIndicator {
  constructor(@InjectBot() private readonly bot: Telegraf) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const me = await this.bot.telegram.getMe();
      return this.getStatus(key, true, { botUsername: me.username });
    } catch (error) {
      return this.getStatus(key, false, { error: error.message });
    }
  }
}

// health/health.controller.ts
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: DatabaseHealthIndicator,
    private telegram: TelegramHealthIndicator
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.isHealthy('database'),
      () => this.telegram.isHealthy('telegram'),
    ]);
  }
}
```

#### 4.3 Logging & Monitoring

```typescript
// logging/logger.service.ts
@Injectable()
export class LoggerService implements LoggerService {
  private logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    transports: [
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error'
      }),
      new winston.transports.File({
        filename: 'logs/combined.log'
      })
    ]
  });

  log(message: string, context?: string) {
    this.logger.info(message, { context });
  }

  error(message: string, trace?: string, context?: string) {
    this.logger.error(message, { trace, context });
  }

  warn(message: string, context?: string) {
    this.logger.warn(message, { context });
  }

  debug(message: string, context?: string) {
    this.logger.debug(message, { context });
  }
}
```

---

## 📋 Implementation Roadmap

### **Week 1-2: Foundation Setup**
- [ ] Create new folder structure
- [ ] Setup CQRS pattern with @nestjs/cqrs
- [ ] Implement base DTOs and validation
- [ ] Create repository interfaces
- [ ] Setup global exception filter

### **Week 3-4: Business Logic Refactoring**
- [ ] Extract domain services from scenes
- [ ] Implement repository pattern
- [ ] Refactor fat NewOrderScene
- [ ] Create application services
- [ ] Setup event system

### **Week 5-6: Performance Optimization**
- [ ] Database query optimization
- [ ] Implement caching with Redis
- [ ] Setup query performance monitoring
- [ ] Load testing with Artillery/k6
- [ ] Memory usage optimization

### **Week 7-8: Security & DevOps**
- [ ] Implement rate limiting
- [ ] Add input sanitization
- [ ] Setup comprehensive logging
- [ ] Health checks implementation
- [ ] Documentation and testing

---

## 🔧 Immediate Quick Wins (1-2 kun)

### 1. Console.log Cleanup
```typescript
// Replace all console.log with proper logger
// Before:
console.log('Google Sheets sozlamalari topilmadi');

// After:
this.logger.warn('Google Sheets sozlamalari topilmadi', 'OrderScene');
```

### 2. Type Safety Fixes
```typescript
// Replace 'any' types with proper interfaces
// Before:
protected getWhereClause(user: any) { }

// After:
protected getWhereClause(user: AuthUser) { }
```

### 3. Environment Configuration
```typescript
// config/app.config.ts
export default () => ({
  port: parseInt(process.env.PORT, 10) || 8080,
  database: {
    url: process.env.DATABASE_URL,
  },
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  }
});
```

### 4. Global Error Handler
```typescript
// filters/global-exception.filter.ts
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    // Proper error handling and logging
  }
}
```

---

## 📊 Success Metrics

### Performance Metrics
- [ ] Response time < 200ms (95th percentile)
- [ ] Database query count reduction by 50%
- [ ] Memory usage optimization
- [ ] Error rate < 1%

### Code Quality Metrics
- [ ] TypeScript strict mode enabled
- [ ] Test coverage > 80%
- [ ] ESLint errors = 0
- [ ] Code duplication < 5%

### Maintainability Metrics
- [ ] Cyclomatic complexity < 10
- [ ] File size < 200 lines (controllers/scenes)
- [ ] Dependency graph depth < 5
- [ ] Documentation coverage > 90%

---

## 🛠️ Required Dependencies

```json
{
  "dependencies": {
    "@nestjs/cqrs": "^10.0.0",
    "@nestjs/cache-manager": "^2.0.0",
    "@nestjs/throttler": "^5.0.0",
    "@nestjs/terminus": "^10.0.0",
    "cache-manager": "^5.0.0",
    "cache-manager-redis-store": "^3.0.0",
    "winston": "^3.10.0",
    "class-validator": "^0.14.0",
    "class-transformer": "^0.5.1",
    "sanitize-html": "^2.11.0"
  },
  "devDependencies": {
    "artillery": "^2.0.0",
    "@types/sanitize-html": "^2.9.0"
  }
}
```

---

Bu refactor plan loyihangizni enterprise-level ga olib chiqish uchun mo'ljallangan. Har bir fazani ketma-ket amalga oshirish orqali koderingiz yanada maintainable, performant va secure bo'ladi.

Qaysi fazadan boshlashni istaysiz?
