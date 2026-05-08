import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteAllData() {
  try {
    console.log('🗑️  Deleting all test data...\n');
    
    const deletedAlerts = await prisma.matchAlert.deleteMany({});
    console.log(`✓ Deleted ${deletedAlerts.count} match alerts`);
    
    const deletedGuests = await prisma.guest.deleteMany({});
    console.log(`✓ Deleted ${deletedGuests.count} guests`);
    
    const deletedRooms = await prisma.room.deleteMany({});
    console.log(`✓ Deleted ${deletedRooms.count} rooms`);
    
    const deletedHotelTokens = await prisma.hotelRefreshToken.deleteMany({});
    console.log(`✓ Deleted ${deletedHotelTokens.count} hotel tokens`);
    
    const deletedHotels = await prisma.hotel.deleteMany({});
    console.log(`✓ Deleted ${deletedHotels.count} hotels`);
    
    const deletedCriminals = await prisma.criminalProfile.deleteMany({});
    console.log(`✓ Deleted ${deletedCriminals.count} criminals`);
    
    const deletedPoliceTokens = await prisma.policeRefreshToken.deleteMany({});
    console.log(`✓ Deleted ${deletedPoliceTokens.count} police tokens`);
    
    const deletedPoliceUsers = await prisma.policeUser.deleteMany({});
    console.log(`✓ Deleted ${deletedPoliceUsers.count} police users`);
    
    const deletedStations = await prisma.station.deleteMany({});
    console.log(`✓ Deleted ${deletedStations.count} police stations`);
    
    const deletedAudit = await prisma.auditLog.deleteMany({});
    console.log(`✓ Deleted ${deletedAudit.count} audit logs`);
    
    console.log('\n✅ Database cleaned! Ready for production data.\n');
    
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Error:', err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

deleteAllData();
