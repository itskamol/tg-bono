import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

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
    console.log(`❌ Error with branch '${name}':`, error.message);
    return null;
  }
}

async function safeCreateUser(userData: {
  telegram_id: number;
  full_name: string;
  username: string;
  password: string;
  role: Role;
  branch_id?: string;
}) {
  try {
    // Check if user exists by telegram_id
    const existingUser = await prisma.user.findUnique({
      where: { telegram_id: userData.telegram_id },
    });

    if (existingUser) {
      console.log(`✅ User '${userData.username}' already exists`);
      return existingUser;
    }

    // Create new user
    const newUser = await prisma.user.create({
      data: userData,
    });

    console.log(`✨ Created user: ${userData.username} (${userData.role})`);
    return newUser;
  } catch (error) {
    console.log(`❌ Error creating user '${userData.username}':`, error.message);
    return null;
  }
}

async function safeCreateProduct(productData: {
  type: string;
  name: string;
  sides: string[];
  price: number;
}) {
  try {
    // Check if product exists
    const existingProduct = await prisma.product.findFirst({
      where: { name: productData.name },
    });

    if (existingProduct) {
      console.log(`✅ Product '${productData.name}' already exists`);
      return existingProduct;
    }

    // Create new product
    const newProduct = await prisma.product.create({
      data: productData,
    });

    console.log(`✨ Created product: ${productData.name} (${productData.price} so'm)`);
    return newProduct;
  } catch (error) {
    console.log(`❌ Error creating product '${productData.name}':`, error.message);
    return null;
  }
}

async function main() {
  console.log('🌱 Starting database seeding...\n');

  try {
    // 1. Create branches
    console.log('📍 Creating branches...');
    const branch1 = await safeCreateBranch(
      'Markaziy filial',
      "Toshkent shahar, Amir Temur ko'chasi 1"
    );

    const branch2 = await safeCreateBranch(
      'Yunusobod filiali',
      'Toshkent shahar, Yunusobod tumani, Abdulla Qodiriy 42'
    );

    const branch3 = await safeCreateBranch(
      'Chilonzor filiali',
      'Toshkent shahar, Chilonzor tumani, Bunyodkor 15'
    );

    // 2. Hash password
    console.log('\n🔐 Hashing passwords...');
    const hashedPassword = await bcrypt.hash('123456', 10);

    // 3. Create users
    console.log('\n👥 Creating users...');

    // Super Admin
    await safeCreateUser({
      telegram_id: 1165097041,
      full_name: 'Super Administrator',
      username: 'superadmin',
      password: hashedPassword,
      role: Role.super_admin,
    });

    // Admins for each branch
    if (branch1) {
      await safeCreateUser({
        telegram_id: 987654321,
        full_name: 'Admin Adminov',
        username: 'admin1',
        password: hashedPassword,
        role: Role.admin,
        branch_id: branch1.id,
      });
    }

    if (branch2) {
      await safeCreateUser({
        telegram_id: 987654322,
        full_name: 'Admin Yunusobod',
        username: 'admin2',
        password: hashedPassword,
        role: Role.admin,
        branch_id: branch2.id,
      });
    }

    // Kassirlarga
    if (branch1) {
      await safeCreateUser({
        telegram_id: 555666777,
        full_name: 'Kassir Kassirov',
        username: 'kassir1',
        password: hashedPassword,
        role: Role.kassir,
        branch_id: branch1.id,
      });
    }

    if (branch2) {
      await safeCreateUser({
        telegram_id: 555666778,
        full_name: 'Kassir Yunusobod',
        username: 'kassir2',
        password: hashedPassword,
        role: Role.kassir,
        branch_id: branch2.id,
      });
    }

    if (branch3) {
      await safeCreateUser({
        telegram_id: 555666779,
        full_name: 'Kassir Chilonzor',
        username: 'kassir3',
        password: hashedPassword,
        role: Role.kassir,
        branch_id: branch3.id,
      });
    }

    // 4. Create sample products
    console.log('\n🍕 Creating sample products...');

    // Pizzalar
    await safeCreateProduct({
      type: 'pizza',
      name: 'Margarita',
      sides: ['oldi', 'orqa'],
      price: 45000,
    });

    await safeCreateProduct({
      type: 'pizza',
      name: 'Pepperoni',
      sides: ['oldi', 'orqa'],
      price: 55000,
    });

    await safeCreateProduct({
      type: 'pizza',
      name: 'Four Cheese',
      sides: ['oldi', 'orqa'],
      price: 60000,
    });

    // Burgerlar
    await safeCreateProduct({
      type: 'burger',
      name: 'Cheeseburger',
      sides: ['oldi'],
      price: 25000,
    });

    await safeCreateProduct({
      type: 'burger',
      name: 'Big Burger',
      sides: ['oldi'],
      price: 35000,
    });

    // Ichimliklar
    await safeCreateProduct({
      type: 'drink',
      name: 'Cola',
      sides: ['oldi'],
      price: 8000,
    });

    await safeCreateProduct({
      type: 'drink',
      name: 'Orange Juice',
      sides: ['oldi'],
      price: 12000,
    });

    await safeCreateProduct({
      type: 'drink',
      name: 'Water',
      sides: ['oldi'],
      price: 5000,
    });

    // Summary
    console.log('\n📊 Seeding completed successfully!');
    console.log('================================');

    const branchCount = await prisma.branch.count();
    const userCount = await prisma.user.count();
    const productCount = await prisma.product.count();

    console.log(`✅ Branches: ${branchCount}`);
    console.log(`✅ Users: ${userCount}`);
    console.log(`✅ Products: ${productCount}`);

    console.log('\n🔐 Default login credentials:');
    console.log('Password for all users: 123456');
    console.log('Usernames: superadmin, admin1, admin2, kassir1, kassir2, kassir3');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  }
} {
  //       where: { telegram_id: 987654321 },
  //     });
  //     if (!admin1) {
  //       admin1 = await prisma.user.create({
  //         data: {
  //           telegram_id: 987654321,
  //           full_name: 'Admin Adminov',
  //           username: 'admin1',
  //           password: hashedPassword,
  //           role: Role.admin,
  //           branch_id: branch1.id,
  //         },
  //       });
  //     }
  //   } catch (error) {
  //     console.log('Admin1 already exists or error:', error.message);
  //   }

  //   let kassir1;
  //   try {
  //     kassir1 = await prisma.user.findUnique({
  //       where: { telegram_id: 555666777 },
  //     });
  //     if (!kassir1) {
  //       kassir1 = await prisma.user.create({
  //         data: {
  //           telegram_id: 555666777,
  //           full_name: 'Kassir Kassirov',
  //           username: 'kassir1',
  //           password: hashedPassword,
  //           role: Role.kassir,
  //           branch_id: branch1.id,
  //         },
  //       });
  //     }
  //   } catch (error) {
  //     console.log('Kassir1 already exists or error:', error.message);
  //   }

  //   let kassir2;
  //   try {
  //     kassir2 = await prisma.user.findUnique({
  //       where: { telegram_id: 444555666 },
  //     });
  //     if (!kassir2) {
  //       kassir2 = await prisma.user.create({
  //         data: {
  //           telegram_id: 444555666,
  //           full_name: 'Kassir Kassirov 2',
  //           username: 'kassir2',
  //           password: hashedPassword,
  //           role: Role.kassir,
  //           branch_id: branch2.id,
  //         },
  //       });
  //     }
  //   } catch (error) {
  //     console.log('Kassir2 already exists or error:', error.message);
  //   }

  //   // Create some sample products
  //   try {
  //     const existingProduct1 = await prisma.product.findFirst({
  //       where: { name: 'Margarita' },
  //     });
  //     if (!existingProduct1) {
  //       await prisma.product.create({
  //         data: {
  //           type: 'pizza',
  //           name: 'Margarita',
  //           sides: ['oldi', 'orqa'],
  //           price: 45000,
  //         },
  //       });
  //     }
  //   } catch (error) {
  //     console.log('Product Margarita already exists or error:', error.message);
  //   }

  //   try {
  //     const existingProduct2 = await prisma.product.findFirst({
  //       where: { name: 'Cheeseburger' },
  //     });
  //     if (!existingProduct2) {
  //       await prisma.product.create({
  //         data: {
  //           type: 'burger',
  //           name: 'Cheeseburger',
  //           sides: ['oldi'],
  //           price: 25000,
  //         },
  //       });
  //     }
  //   } catch (error) {
  //     console.log('Product Cheeseburger already exists or error:', error.message);
  //   }

  //   try {
  //     const existingProduct3 = await prisma.product.findFirst({
  //       where: { name: 'Cola' },
  //     });
  //     if (!existingProduct3) {
  //       await prisma.product.create({
  //         data: {
  //           type: 'drink',
  //           name: 'Cola',
  //           sides: ['oldi'],
  //           price: 8000,
  //         },
  //       });
  //     }
  //   } catch (error) {
  //     console.log('Product Cola already exists or error:', error.message);
  //   }

  //   console.log('✅ Database seeded successfully!');
  //   console.log('📊 Created:');
  //   console.log(`- Super Admin`);
  //   console.log(`- Admin - ${branch[0].name}`);
  //   console.log(`- Kassir 1 - ${branch1.name}`);
  //   console.log(`- Kassir 2 - ${branch2.name}`);
  console.log('- 3 sample products');
  console.log('- 2 branches');

  console.log('\n📝 Login credentials:');
  console.log('Username: superadmin, admin1, kassir1, kassir2');
  console.log('Password: 123456');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
