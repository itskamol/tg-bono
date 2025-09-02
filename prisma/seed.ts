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
        console.log(`❌ Error creating user '${userData.telegram_id}':`, error.message);
        return null;
    }
}

async function main() {
    console.log('🌱 Starting database seeding...\n');

    try {
        // 2. Create branches
        console.log('\n📍 Creating branches...');
        const branch1 = await safeCreateBranch(
            'Markaziy filial',
            "Toshkent shahar, Amir Temur ko'chasi 1",
        );
        const categories = [
            { name: 'Pizza' },
            { name: 'Burger' },
            { name: 'Ichimlik' },
            { name: 'Desert' },
            { name: 'Salat' },
            { name: 'Boshqa' },
        ];
        const sides = [
            { name: 'Oldi tomon', price: 25000 },
            { name: 'Orqa tomon', price: 30000 },
            { name: 'Yon tomon', price: 20000 },
            { name: 'Hamma tomon', price: 45000 },
            { name: 'Kamerasi', price: 35000 },
            { name: 'Orqa + Oldi', price: 50000 },
            { name: 'Chap tomon', price: 22000 },
            { name: "O'ng tomon", price: 22000 },
            { name: 'Premium tomon', price: 60000 },
            { name: 'Standart tomon', price: 18000 },
        ];

        for (const category of categories) {
            const c = await prisma.category.upsert({
                where: { name: category.name },
                update: {},
                create: category,
            });

            for (const side of sides) {
                await prisma.side.upsert({
                    where: { name_category_id: { name: side.name, category_id: c.id } },
                    update: {},
                    create: { ...side, category_id: c.id },
                });
            }
        }

        console.log("Categories va Sides muvaffaqiyatli qo'shildi!");

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
            telegram_id: process.env.SUPER_ADMIN_ID
                ? parseInt(process.env.SUPER_ADMIN_ID)
                : 1165097041,
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

        console.log('\n📊 Seeding completed successfully!');
        console.log('================================');

        const branchCount = await prisma.branch.count();
        const userCount = await prisma.user.count();
        // Product model olib tashlandi

        console.log(`✅ Branches: ${branchCount}`);
        console.log(`✅ Users: ${userCount}`);

        console.log('\n🔐 Default login credentials:');
        console.log('Password for all users: 123456');
        console.log('Usernames: superadmin, admin1, admin2, kassir1, kassir2, kassir3');
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
