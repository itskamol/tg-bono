import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const prisma = new PrismaClient();

// Helper function to safely create or find existing record
async function safeCreateBranch(name: string, address: string) {
  try {
    // First try to find existing branch
    const existingBranch = await prisma.branch.findUnique({
      where: { name },
    });

    if (existingBranch) {
      console.log(`✅ Branch '${name}' already exists`);
      return existingBranch;
    }

    // Create new branch if not exists
    const newBranch = await prisma.branch.create({
      data: { name, address },
    });

    console.log(`✨ Created branch: ${name}`);
    return newBranch;
  } catch (error) {
    console.log(error);
    console.log(`❌ Error with branch '${name}':`, error.message);
    return null;
  }
}

async function safeCreateUser(userData: {
  telegram_id: number;
  full_name: string;
  role: Role;
  branch_id?: string;
}) {
  try {
    // Check if user exists by telegram_id
    const existingUser = await prisma.user.findUnique({
      where: { telegram_id: userData.telegram_id },
    });

    if (existingUser) {
      console.log(`✅ User '${userData.full_name}' already exists`);
      return existingUser;
    }

    // Create new user
    const newUser = await prisma.user.create({
      data: userData,
    });

    console.log(`✨ Created user: ${userData.full_name} (${userData.role})`);
    return newUser;
  } catch (error) {
    console.log(
      `❌ Error creating user '${userData.telegram_id}':`,
      error.message,
    );
    return null;
  }
}

async function safeCreateSide(sideData: {
  name: string;
  price: number;
}) {
  try {
    // Check if side exists
    const existingSide = await prisma.side.findUnique({
      where: { name: sideData.name },
    });

    if (existingSide) {
      console.log(`✅ Side '${sideData.name}' already exists`);
      return existingSide;
    }

    // Create new side
    const newSide = await prisma.side.create({
      data: sideData,
    });

    console.log(
      `✨ Created side: ${sideData.name} (+${sideData.price} so'm)`,
    );
    return newSide;
  } catch (error) {
    console.log(
      `❌ Error creating side '${sideData.name}':`,
      error.message,
    );
    return null;
  }
}

async function safeCreateProduct(productData: {
  type: string;
  name: string;
  base_price: number;
}) {
  // Product model olib tashlandi - bu funksiya endi ishlamaydi
  console.log(`⚠️ Product creation skipped - Product model removed`);
  return null;
}

async function main() {
  console.log('🌱 Starting database seeding...\n');

  try {
    // 1. Create sides first
    console.log('🍕 Creating sides...');
    await safeCreateSide({
      name: 'Oldi',
      price: 0,
    });

    await safeCreateSide({
      name: 'Orqa',
      price: 5000,
    });

    await safeCreateSide({
      name: 'Oldi + Orqa',
      price: 8000,
    });

    await safeCreateSide({
      name: 'Kichik',
      price: -5000,
    });

    await safeCreateSide({
      name: 'Katta',
      price: 10000,
    });

    // 2. Create branches
    console.log('\n📍 Creating branches...');
    const branch1 = await safeCreateBranch(
      'Markaziy filial',
      "Toshkent shahar, Amir Temur ko'chasi 1",
    );

    // Categories qo'shish
  const categories = [
    { name: 'Pizza', emoji: '🍕' },
    { name: 'Burger', emoji: '🍔' },
    { name: 'Ichimlik', emoji: '🥤' },
    { name: 'Desert', emoji: '🍰' },
    { name: 'Salat', emoji: '🥗' },
    { name: 'Boshqa', emoji: '📦' },
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: {},
      create: category,
    });
  }

  // Sides qo'shish
  const sides = [
    { name: 'Oldi tomon', price: 25000 },
    { name: 'Orqa tomon', price: 30000 },
    { name: 'Yon tomon', price: 20000 },
    { name: 'Hamma tomon', price: 45000 },
    { name: 'Kamerasi', price: 35000 },
    { name: 'Orqa + Oldi', price: 50000 },
  ];

  for (const side of sides) {
    await prisma.side.upsert({
      where: { name: side.name },
      update: {},
      create: side,
    });
  }

  console.log('Categories va Sides muvaffaqiyatli qo\'shildi!');

    const branch2 = await safeCreateBranch(
      'Yunusobod filiali',
      'Toshkent shahar, Yunusobod tumani, Abdulla Qodiriy 42',
    );

    const branch3 = await safeCreateBranch(
      'Chilonzor filiali',
      'Toshkent shahar, Chilonzor tumani, Bunyodkor 15',
    );

    // 2. Hash password
    console.log('\n🔐 Hashing passwords...');
    const hashedPassword = await bcrypt.hash('123456', 10);

    // 3. Create users
    console.log('\n👥 Creating users...');

    // Super Admin
    await safeCreateUser({
      telegram_id: process.env.SUPER_ADMIN_ID ? parseInt(process.env.SUPER_ADMIN_ID) : 1165097041,
      full_name: 'Super Administrator',
      role: Role.SUPER_ADMIN,
    });

    // Admins for each branch
    if (branch1) {
      await safeCreateUser({
        telegram_id: 987654321,
        full_name: 'Admin Adminov',
        role: Role.ADMIN,
        branch_id: branch1.id,
      });
    }

    if (branch2) {
      await safeCreateUser({
        telegram_id: 987654322,
        full_name: 'Admin Yunusobod',
        role: Role.ADMIN,
        branch_id: branch2.id,
      });
    }

    // Kassirlarga
    if (branch1) {
      await safeCreateUser({
        telegram_id: 555666777,
        full_name: 'Kassir Kassirov',
        role: Role.CASHIER,
        branch_id: branch1.id,
      });
    }

    if (branch2) {
      await safeCreateUser({
        telegram_id: 555666778,
        full_name: 'Kassir Yunusobod',
        role: Role.CASHIER,
        branch_id: branch2.id,
      });
    }

    if (branch3) {
      await safeCreateUser({
        telegram_id: 7561078520,
        full_name: 'Kassir Chilonzor',
        role: Role.CASHIER,
        branch_id: branch3.id,
      });
    }

    // 4. Create sample products
    console.log('\n🍕 Creating sample products...');

    // Pizzalar
    await safeCreateProduct({
      type: 'pizza',
      name: 'Margarita',
      base_price: 45000,
    });

    await safeCreateProduct({
      type: 'pizza',
      name: 'Pepperoni',
      base_price: 55000,
    });

    await safeCreateProduct({
      type: 'pizza',
      name: 'Four Cheese',
      base_price: 60000,
    });

    // Burgerlar
    await safeCreateProduct({
      type: 'burger',
      name: 'Cheeseburger',
      base_price: 25000,
    });

    await safeCreateProduct({
      type: 'burger',
      name: 'Big Burger',
      base_price: 35000,
    });

    // Ichimliklar
    await safeCreateProduct({
      type: 'drink',
      name: 'Cola',
      base_price: 8000,
    });

    await safeCreateProduct({
      type: 'drink',
      name: 'Orange Juice',
      base_price: 12000,
    });

    await safeCreateProduct({
      type: 'drink',
      name: 'Water',
      base_price: 5000,
    });

    // Summary
    console.log('\n📊 Seeding completed successfully!');
    console.log('================================');

    const branchCount = await prisma.branch.count();
    const userCount = await prisma.user.count();
    // Product model olib tashlandi
    const productCount = 0;

    console.log(`✅ Branches: ${branchCount}`);
    console.log(`✅ Users: ${userCount}`);
    console.log(`✅ Products: ${productCount}`);

    console.log('\n🔐 Default login credentials:');
    console.log('Password for all users: 123456');
    console.log(
      'Usernames: superadmin, admin1, admin2, kassir1, kassir2, kassir3',
    );
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
