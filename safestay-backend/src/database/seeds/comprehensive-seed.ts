import { PrismaClient } from '@prisma/client';
import { hash as argon2Hash, Algorithm } from '@node-rs/argon2';

const prisma = new PrismaClient();

const DEMO_HOTEL_PASSWORD = 'Hotel@1234';
const DEMO_OFFICER_PASSWORD = 'Officer@1234';

async function seedDatabase() {
  try {
    console.log('🌱 Starting comprehensive database seed...\n');

    // 1. POLICE RANKS — upsert by level so pre-existing control-room rank is kept
    const ranksToSeed: { level: number; title: string; description: string }[] = [
      { level: 0, title: 'Control Room', description: 'Control room dispatcher' },
      { level: 1, title: 'Inspector General', description: 'Top rank' },
      { level: 2, title: 'Inspector', description: 'Senior officer' },
      { level: 3, title: 'Sub-Inspector', description: 'Mid-level officer' },
    ];
    for (const r of ranksToSeed) {
      await prisma.policeRank.upsert({
        where: { level: r.level },
        update: {},
        create: r,
      });
    }
    console.log(`✓ Ensured ${ranksToSeed.length} police ranks`);

    // 2. JURISDICTION HIERARCHY — State -> Zone -> Range -> District (prerequisites for Station)
    let state = await prisma.state.findFirst();
    if (!state) {
      state = await prisma.state.create({
        data: { name: 'Telangana', code: 'TG' },
      });
      console.log('✓ Created state Telangana');
    }
    let zone = await prisma.zone.findFirst({ where: { stateId: state.id } });
    if (!zone) {
      zone = await prisma.zone.create({
        data: { name: 'Hyderabad Zone', stateId: state.id },
      });
      console.log('✓ Created zone Hyderabad');
    }
    let range = await prisma.range.findFirst({ where: { zoneId: zone.id } });
    if (!range) {
      range = await prisma.range.create({
        data: { name: 'Central Range', zoneId: zone.id },
      });
      console.log('✓ Created range Central');
    }
    let district = await prisma.district.findFirst({ where: { rangeId: range.id } });
    if (!district) {
      district = await prisma.district.create({
        data: { name: 'Central District', rangeId: range.id },
      });
      console.log('✓ Created district Central');
    }

    // 3. POLICE STATION
    let station = await prisma.station.findFirst();
    if (!station && district) {
      const created = await prisma.station.create({
        data: {
          name: 'Central Police Station',
          districtId: district.id,
          jurisdictionPath: 'pending',
          alertEmailContacts: ['police@safestay.com'],
          alertWhatsappNumbers: ['+919876543210'],
          alertsEnabled: true,
        },
      });
      station = await prisma.station.update({
        where: { id: created.id },
        data: {
          jurisdictionPath: `${state.id}/${zone.id}/${range.id}/${district.id}/${created.id}`,
        },
      });
      console.log('✓ Created police station');
    }

    // 4. POLICE OFFICER
    let officer = await prisma.policeUser.findFirst();
    if (!officer && station) {
      const rank = await prisma.policeRank.findFirst({ where: { level: 2 } });
      if (rank) {
        const passwordHash = await argon2Hash(DEMO_OFFICER_PASSWORD, { algorithm: Algorithm.Argon2id });
        officer = await prisma.policeUser.create({
          data: {
            badgeId: 'PB001',
            fullName: 'Rajesh Kumar',
            email: 'rajesh@police.com',
            rankId: rank.id,
            stationId: station.id,
            jurisdictionPath: station.jurisdictionPath,
            passwordHash,
            isActive: true,
          },
        });
        console.log(`✓ Created police officer PB001 (password: ${DEMO_OFFICER_PASSWORD})`);
      }
    }

    // 5. HOTELS — passwordHash is a real argon2id hash of DEMO_HOTEL_PASSWORD
    // Each hotel is mapped to the seeded station so criminal-match alerts route correctly.
    const hotelCount = await prisma.hotel.count();
    if (hotelCount === 0 && station) {
      const hotelPasswordHash = await argon2Hash(DEMO_HOTEL_PASSWORD, { algorithm: Algorithm.Argon2id });
      const hotels = await prisma.hotel.createMany({
        data: [
          {
            name: 'Grand Palace Hotel',
            email: 'grand@hotel.com',
            passwordHash: hotelPasswordHash,
            contactNumber: '9876543210',
            address: '123 Main Street, New Delhi',
            licenseNumber: 'LIC001',
            geoLat: 28.7041,
            geoLng: 77.1025,
            totalFloors: 5,
            roomsPerFloor: 10,
            maxGuestsPerRoom: 3,
            isActive: true,
            nearestStationId: station.id,
            jurisdictionPath: station.jurisdictionPath,
          },
          {
            name: 'Taj Mahal View Resort',
            email: 'taj@resort.com',
            passwordHash: hotelPasswordHash,
            contactNumber: '9876543211',
            address: '456 Heritage Road, Agra',
            licenseNumber: 'LIC002',
            geoLat: 27.1751,
            geoLng: 78.0421,
            totalFloors: 8,
            roomsPerFloor: 12,
            maxGuestsPerRoom: 4,
            isActive: true,
            nearestStationId: station.id,
            jurisdictionPath: station.jurisdictionPath,
          },
          {
            name: 'Seaside Retreat',
            email: 'seaside@hotel.com',
            passwordHash: hotelPasswordHash,
            contactNumber: '9876543212',
            address: '789 Beach Road, Mumbai',
            licenseNumber: 'LIC003',
            geoLat: 19.0760,
            geoLng: 72.8777,
            totalFloors: 10,
            roomsPerFloor: 15,
            maxGuestsPerRoom: 3,
            isActive: true,
            nearestStationId: station.id,
            jurisdictionPath: station.jurisdictionPath,
          },
        ],
      });
      console.log(`✓ Created ${hotels.count} test hotels (password: ${DEMO_HOTEL_PASSWORD})`);
    }

    // 6. ROOMS
    const firstHotel = await prisma.hotel.findFirst();
    if (firstHotel) {
      const roomCount = await prisma.room.count({ where: { hotelId: firstHotel.id } });
      if (roomCount === 0) {
        const rooms = [];
        for (let floor = 1; floor <= 2; floor++) {
          for (let num = 1; num <= 5; num++) {
            rooms.push({
              hotelId: firstHotel.id,
              floor: floor,
              roomNumber: `${floor}${num.toString().padStart(2, '0')}`,
              category: num % 2 === 0 ? 'Deluxe' : 'Standard',
              maxGuests: 2,
              status: 'AVAILABLE' as const,
            });
          }
        }
        await prisma.room.createMany({ data: rooms });
        console.log(`✓ Created ${rooms.length} test rooms`);
      }
    }

    // 7. GUESTS
    const guestCount = await prisma.guest.count();
    if (guestCount === 0 && firstHotel) {
      const rooms = await prisma.room.findMany({ where: { hotelId: firstHotel.id }, take: 3 });
      if (rooms.length > 0) {
        const guests = await prisma.guest.createMany({
          data: [
            {
              hotelId: firstHotel.id,
              roomId: rooms[0].id,
              fullName: 'Amit Sharma',
              age: 35,
              gender: 'MALE',
              phoneNumber: '9876543220',
              email: 'amit@email.com',
              aadhaarHash: 'hash1234567890',
              checkInDate: new Date(),
              expectedCheckout: new Date(Date.now() + 86400000),
              isActive: true,
            },
            {
              hotelId: firstHotel.id,
              roomId: rooms[1].id,
              fullName: 'Priya Patel',
              age: 28,
              gender: 'FEMALE',
              phoneNumber: '9876543221',
              email: 'priya@email.com',
              aadhaarHash: 'hash2345678901',
              checkInDate: new Date(),
              expectedCheckout: new Date(Date.now() + 172800000),
              isActive: true,
            },
            {
              hotelId: firstHotel.id,
              roomId: rooms[2].id,
              fullName: 'Vikram Singh',
              age: 42,
              gender: 'MALE',
              phoneNumber: '9876543222',
              email: 'vikram@email.com',
              aadhaarHash: 'hash3456789012',
              checkInDate: new Date(),
              expectedCheckout: new Date(Date.now() + 259200000),
              isActive: true,
            },
          ],
        });

        await prisma.room.updateMany({
          where: { id: { in: [rooms[0].id, rooms[1].id, rooms[2].id] } },
          data: { status: 'OCCUPIED' },
        });

        console.log(`✓ Created ${guests.count} test guests and marked their rooms as OCCUPIED`);
      }
    }

    // 8. CRIMINALS
    const criminalCount = await prisma.criminalProfile.count();
    if (criminalCount === 0 && officer && station) {
      const criminals = await prisma.criminalProfile.createMany({
        data: [
          {
            fullName: 'Suspected Thief 1',
            aliases: ['Master Key', 'Raja'],
            gender: 'MALE',
            approximateAge: 38,
            caseStatus: 'WANTED',
            threatLevel: 'HIGH',
            crimeType: 'THEFT',
            firNumbers: ['FIR/001/2024'],
            crimeDescription: 'Suspected in multiple theft cases across metro cities',
            phones: ['9999888877'],
            firStationId: station.id,
            enteredById: officer.id,
            jurisdictionPath: station.jurisdictionPath,
            isActive: true,
          },
          {
            fullName: 'Suspected Fraudster',
            aliases: ['Doc Singh', 'Investment King'],
            gender: 'MALE',
            approximateAge: 45,
            caseStatus: 'ABSCONDING',
            threatLevel: 'CRITICAL',
            crimeType: 'FRAUD',
            firNumbers: ['FIR/002/2024', 'FIR/003/2024'],
            crimeDescription: 'Large-scale investment fraud affecting 500+ victims',
            phones: ['9999777766'],
            firStationId: station.id,
            enteredById: officer.id,
            jurisdictionPath: station.jurisdictionPath,
            isActive: true,
          },
          {
            fullName: 'Person of Interest',
            aliases: ['Unknown'],
            gender: 'MALE',
            approximateAge: 32,
            caseStatus: 'WANTED',
            threatLevel: 'MEDIUM',
            crimeType: 'ASSAULT',
            firNumbers: ['FIR/004/2024'],
            crimeDescription: 'Assault case under active investigation',
            phones: ['9999666655'],
            firStationId: station.id,
            enteredById: officer.id,
            jurisdictionPath: station.jurisdictionPath,
            isActive: true,
          },
        ],
      });
      console.log(`✓ Created ${criminals.count} test criminal profiles`);
    }

    console.log('\n✅ Database seeding complete!\n');
    console.log('📊 View data in Prisma Studio:');
    console.log('   → Run: npx prisma studio');
    console.log('   → Open: http://localhost:5555\n');

    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Seeding error:', err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

seedDatabase();
