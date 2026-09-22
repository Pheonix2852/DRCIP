import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Get admin credentials from environment
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@drcip.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'TempPassword123!';
  const adminName = 'System Administrator';

  console.log(`📧 Admin email: ${adminEmail}`);

  // Hash the password
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  // Upsert the admin user (idempotent)
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash,
      fullName: adminName,
      role: UserRole.ADMINISTRATOR,
      isActive: true,
    },
    create: {
      email: adminEmail,
      passwordHash,
      fullName: adminName,
      role: UserRole.ADMINISTRATOR,
      isActive: true,
      publicId: `USR-ADMIN-${Date.now().toString(36).toUpperCase()}`,
    },
  });

  console.log(`✅ Admin user created/updated: ${admin.publicId} (${admin.email})`);

  console.log('🎉 Database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });