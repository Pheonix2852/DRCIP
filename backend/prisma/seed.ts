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

  // Response zones covering a representative area (Kolkata region for demo).
  // The geometry_geom spatial column is populated by the PostGIS sync trigger.
  const zones = [
    {
      name: 'North Zone',
      coordinates: [[[88.2, 22.65], [88.4, 22.65], [88.4, 22.8], [88.2, 22.8], [88.2, 22.65]]],
    },
    {
      name: 'South Zone',
      coordinates: [[[88.2, 22.4], [88.4, 22.4], [88.4, 22.55], [88.2, 22.55], [88.2, 22.4]]],
    },
    {
      name: 'Central Zone',
      coordinates: [[[88.3, 22.55], [88.38, 22.55], [88.38, 22.65], [88.3, 22.65], [88.3, 22.55]]],
    },
    {
      name: 'East Zone',
      coordinates: [[[88.4, 22.45], [88.6, 22.45], [88.6, 22.7], [88.4, 22.7], [88.4, 22.45]]],
    },
    {
      name: 'West Zone',
      coordinates: [[[88.05, 22.45], [88.2, 22.45], [88.2, 22.7], [88.05, 22.7], [88.05, 22.45]]],
    },
  ];

  for (const zone of zones) {
    const publicId = `ZONE-${zone.name.replace(/\s+/g, '-').toUpperCase()}`;
    await prisma.$executeRaw`
      INSERT INTO "ResponseZone" ("id", "publicId", "name", "geometry", "isActive", "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid(),
        ${publicId},
        ${zone.name},
        ${JSON.stringify({ type: 'Polygon', coordinates: zone.coordinates })}::jsonb,
        true,
        NOW(),
        NOW()
      )
      ON CONFLICT ("publicId") DO NOTHING
    `;
  }
  console.log(`✅ Response zones seeded: ${zones.length}`);

  // Backfill response zones for pre-existing incidents via spatial containment.
  const backfilled = await prisma.$executeRaw`
    UPDATE "Incident" i
    SET "responseZoneId" = rz.id
    FROM "ResponseZone" rz
    WHERE i."responseZoneId" IS NULL
      AND rz."isActive" = true
      AND rz."geometry_geom" IS NOT NULL
      AND ST_Contains(rz."geometry_geom", i."location"::geometry)
  `;
  console.log(`✅ Backfilled response zone for ${backfilled} incident(s)`);

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