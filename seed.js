const { setServers } = require("node:dns/promises");
setServers(["1.1.1.1", "8.8.8.8"]);

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const colors = require('colors');

dotenv.config({ path: './config/config.env' });

const User = require('./models/User');
const Hotel = require('./models/Hotel');
const Booking = require('./models/Booking');
const BookingRequest = require('./models/BookingRequest');

mongoose.connect(process.env.MONGO_URI);

const seedData = async () => {
  try {
    console.log('Clearing existing data...'.yellow);
    await BookingRequest.deleteMany();
    await Booking.deleteMany();
    await Hotel.deleteMany();
    await User.deleteMany();
    console.log('Data cleared'.green);

    // ─────────────────────────────────────────────
    // USERS
    // ─────────────────────────────────────────────
    console.log('Creating users...'.yellow);

    // Admin (US3-1 ~ US3-6)
    const adminUser = await User.create({
      name: 'Admin User',
      telephone: '0812345678',
      email: 'admin@hotel.com',
      password: 'admin123',
      role: 'admin'
    });

    // Hotel owners (US4-1 ~ US4-5)
    const owner1 = await User.create({
      name: 'Somchai Jaidee',
      telephone: '0891234567',
      email: 'owner1@hotel.com',
      password: 'owner123',
      role: 'owner'
    });

    const owner2 = await User.create({
      name: 'Malee Srisuk',
      telephone: '0892345678',
      email: 'owner2@hotel.com',
      password: 'owner123',
      role: 'owner'
    });

    // Regular users (US1-1 ~ US1-4, US2-1 ~ US2-4)
    const user1 = await User.create({
      name: 'John Doe',
      telephone: '0823456789',
      email: 'john@example.com',
      password: 'password123',
      role: 'user'
    });

    const user2 = await User.create({
      name: 'Jane Smith',
      telephone: '0834567890',
      email: 'jane@example.com',
      password: 'password123',
      role: 'user'
    });

    const user3 = await User.create({
      name: 'Bob Wilson',
      telephone: '0845678901',
      email: 'bob@example.com',
      password: 'password123',
      role: 'user'
    });

    // User for testing deactivated account (US1-4)
    const deactivatedUser = await User.create({
      name: 'Deactivated User',
      telephone: '0856789012',
      email: 'deactivated@example.com',
      password: 'password123',
      role: 'user',
      isActive: false
    });

    // Custom test user (p@gmail.com)
    const pUser = await User.create({
      name: 'P User',
      telephone: '0800000000',
      email: 'p@gmail.com',
      password: '123456',
      role: 'user'
    });

    console.log(`Created 8 users`.green);

    // ─────────────────────────────────────────────
    // HOTELS (US3-5, US4-1 ~ US4-5)
    // ─────────────────────────────────────────────
    console.log('Creating hotels...'.yellow);

    // Hotel owned by owner1
    const hotel1 = await Hotel.create({
      name: 'Grand Hotel Bangkok',
      address: '123 Sukhumvit Road, Watthana, Bangkok 10110',
      telephone: '021234567',
      description: 'A luxury hotel in the heart of Bangkok with world-class amenities and stunning city views.',
      amenities: ['Swimming Pool', 'Fitness Center', 'Spa', 'Restaurant', 'Free Wi-Fi', 'Parking'],
      pricePerNight: 2500,
      ownerId: owner1._id,
      roomTypes: [
        { id: 'standard', name: 'Standard Room', pricePerNight: 1500, totalRooms: 20,
          amenities: ['Single Bed', 'Private Bathroom', '32" TV', 'Free Wi-Fi', 'Air Conditioning'] },
        { id: 'deluxe',   name: 'Deluxe Room',   pricePerNight: 2500, totalRooms: 12,
          amenities: ['Queen Size Bed', 'Private Bathroom', '43" TV', 'Free Wi-Fi', 'Air Conditioning', 'City View', 'Minibar'] },
        { id: 'suite',    name: 'Suite Room',    pricePerNight: 5000, totalRooms: 5,
          amenities: ['King Size Bed', 'Private Bathroom + Bathtub', '55" TV', 'Free Wi-Fi', 'Air Conditioning', 'Panoramic View', 'Living Room', 'Free Breakfast for 2'] },
      ]
    });

    // Hotel owned by owner1 (second hotel)
    const hotel2 = await Hotel.create({
      name: 'Riverside Resort Chiang Mai',
      address: '456 Ping River Road, Muang, Chiang Mai 50000',
      telephone: '053987654',
      description: 'A serene riverside resort surrounded by lush greenery and mountain views.',
      amenities: ['River View', 'Infinity Pool', 'Yoga Studio', 'Restaurant', 'Free Wi-Fi'],
      pricePerNight: 1800,
      ownerId: owner1._id,
      roomTypes: [
        { id: 'standard', name: 'Standard Room', pricePerNight: 1000, totalRooms: 15,
          amenities: ['Single Bed', 'Private Bathroom', '32" TV', 'Free Wi-Fi', 'Air Conditioning', 'River View'] },
        { id: 'deluxe',   name: 'Deluxe Room',   pricePerNight: 1800, totalRooms: 10,
          amenities: ['Queen Size Bed', 'Private Bathroom', '43" TV', 'Free Wi-Fi', 'Air Conditioning', 'River View', 'Balcony'] },
        { id: 'suite',    name: 'Suite Room',    pricePerNight: 3500, totalRooms: 4,
          amenities: ['King Size Bed', 'Private Bathroom + Bathtub', '55" TV', 'Free Wi-Fi', 'Air Conditioning', 'River View', 'Private Balcony', 'Living Room', 'Free Breakfast for 2'] },
      ]
    });

    // Hotel owned by owner2
    const hotel3 = await Hotel.create({
      name: 'Beach Paradise Phuket',
      address: '789 Patong Beach Road, Kathu, Phuket 83150',
      telephone: '076555666',
      description: 'A beachfront paradise with direct access to Patong Beach and stunning sea views.',
      amenities: ['Beachfront', 'Private Pool', 'Water Sports', 'Restaurant', 'Bar', 'Free Wi-Fi'],
      pricePerNight: 3200,
      ownerId: owner2._id,
      roomTypes: [
        { id: 'standard', name: 'Standard Room', pricePerNight: 2000, totalRooms: 18,
          amenities: ['Double Bed', 'Private Bathroom', '40" TV', 'Free Wi-Fi', 'Air Conditioning', 'Pool Access'] },
        { id: 'deluxe',   name: 'Deluxe Room',   pricePerNight: 3200, totalRooms: 10,
          amenities: ['Queen Size Bed', 'Private Bathroom', '50" TV', 'Free Wi-Fi', 'Air Conditioning', 'Sea View', 'Pool Access', 'Minibar'] },
        { id: 'suite',    name: 'Suite Room',    pricePerNight: 6500, totalRooms: 6,
          amenities: ['King Size Bed', 'Jacuzzi', '65" TV', 'Free Wi-Fi', 'Air Conditioning', 'Direct Sea View', 'Private Pool', 'Living Room', 'Free Breakfast for 2', 'Butler Service'] },
      ]
    });

    const hotel4 = await Hotel.create({
      name: 'Mountain View Hotel Pai',
      address: '321 Mountain Road, Pai, Mae Hong Son 58130',
      telephone: '053698745',
      description: 'A cozy mountain retreat with breathtaking views and peaceful atmosphere.',
      amenities: ['Mountain View', 'Trekking Tours', 'Restaurant', 'Free Wi-Fi', 'Bicycle Rental'],
      pricePerNight: 1200,
      ownerId: owner2._id,
      roomTypes: [
        { id: 'standard', name: 'Standard Room', pricePerNight: 800,  totalRooms: 12,
          amenities: ['Single Bed', 'Private Bathroom', '32" TV', 'Free Wi-Fi', 'Fan', 'Mountain View'] },
        { id: 'deluxe',   name: 'Deluxe Room',   pricePerNight: 1200, totalRooms: 8,
          amenities: ['Queen Size Bed', 'Private Bathroom', '40" TV', 'Free Wi-Fi', 'Air Conditioning', 'Mountain View', 'Balcony'] },
        { id: 'suite',    name: 'Suite Room',    pricePerNight: 2500, totalRooms: 3,
          amenities: ['King Size Bed', 'Private Bathroom + Bathtub', '50" TV', 'Free Wi-Fi', 'Air Conditioning', 'Panoramic Mountain View', 'Private Terrace', 'Free Breakfast for 2'] },
      ]
    });

    const hotel5 = await Hotel.create({
      name: 'City Center Hotel Pattaya',
      address: '654 Beach Road, Pattaya City, Chonburi 20150',
      telephone: '038123456',
      description: 'A modern city hotel steps away from Pattaya Beach and entertainment district.',
      amenities: ['Rooftop Pool', 'Fitness Center', 'Restaurant', 'Bar', 'Free Wi-Fi', 'Parking'],
      pricePerNight: 2000,
      roomTypes: [
        { id: 'standard', name: 'Standard Room', pricePerNight: 1200, totalRooms: 16,
          amenities: ['Double Bed', 'Private Bathroom', '40" TV', 'Free Wi-Fi', 'Air Conditioning'] },
        { id: 'deluxe',   name: 'Deluxe Room',   pricePerNight: 2000, totalRooms: 10,
          amenities: ['Queen Size Bed', 'Private Bathroom', '50" TV', 'Free Wi-Fi', 'Air Conditioning', 'City View', 'Minibar'] },
        { id: 'suite',    name: 'Suite Room',    pricePerNight: 4000, totalRooms: 4,
          amenities: ['King Size Bed', 'Private Bathroom + Bathtub', '55" TV', 'Free Wi-Fi', 'Air Conditioning', 'Sea View', 'Living Room', 'Minibar', 'Free Breakfast for 2'] },
      ]
    });

    // Link hotels to owners
    await User.findByIdAndUpdate(owner1._id, { hotel: hotel1._id });
    await User.findByIdAndUpdate(owner2._id, { hotel: hotel3._id });

    console.log(`Created 5 hotels`.green);

    // ─────────────────────────────────────────────
    // BOOKINGS
    // ─────────────────────────────────────────────
    console.log('Creating bookings...'.yellow);

    // ── Paid confirmed bookings (US2-2 confirmation, US2-4 cancel, US4-1 stats) ──
    const booking1 = await Booking.create({
      checkInDate: new Date('2025-01-15'),
      numberOfNights: 3,
      roomType: 'deluxe',
      totalPrice: 2500 * 3,
      amountPaid: 2500 * 3,
      paymentStatus: 'paid',
      status: 'confirmed',
      user: user1._id,
      hotel: hotel1._id
    });

    const booking2 = await Booking.create({
      checkInDate: new Date('2025-02-10'),
      numberOfNights: 2,
      roomType: 'standard',
      totalPrice: 1000 * 2,
      amountPaid: 1000 * 2,
      paymentStatus: 'paid',
      status: 'confirmed',
      user: user1._id,
      hotel: hotel2._id
    });

    const booking3 = await Booking.create({
      checkInDate: new Date('2025-03-05'),
      numberOfNights: 1,
      roomType: 'suite',
      totalPrice: 6500 * 1,
      amountPaid: 6500 * 1,
      paymentStatus: 'paid',
      status: 'confirmed',
      user: user2._id,
      hotel: hotel3._id
    });

    const booking4 = await Booking.create({
      checkInDate: new Date('2025-04-20'),
      numberOfNights: 2,
      roomType: 'standard',
      totalPrice: 800 * 2,
      amountPaid: 800 * 2,
      paymentStatus: 'paid',
      status: 'confirmed',
      user: user2._id,
      hotel: hotel4._id
    });

    const booking5 = await Booking.create({
      checkInDate: new Date('2025-05-01'),
      numberOfNights: 3,
      roomType: 'deluxe',
      totalPrice: 2000 * 3,
      amountPaid: 2000 * 3,
      paymentStatus: 'paid',
      status: 'confirmed',
      user: user3._id,
      hotel: hotel5._id
    });

    // ── Future booking for US2-3 (change date) and US2-4 (cancel with refund) ──
    const futureBooking1 = await Booking.create({
      checkInDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
      numberOfNights: 2,
      roomType: 'deluxe',
      totalPrice: 2500 * 2,
      amountPaid: 2500 * 2,
      paymentStatus: 'paid',
      status: 'confirmed',
      user: user1._id,
      hotel: hotel1._id
    });

    const futureBooking2 = await Booking.create({
      checkInDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
      numberOfNights: 1,
      roomType: 'standard',
      totalPrice: 1000 * 1,
      amountPaid: 1000 * 1,
      paymentStatus: 'paid',
      status: 'confirmed',
      user: user2._id,
      hotel: hotel2._id
    });

    // ── Unpaid booking (US2-1 payment flow) ──
    const unpaidBooking = await Booking.create({
      checkInDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      numberOfNights: 2,
      roomType: 'suite',
      totalPrice: 5000 * 2,
      amountPaid: 0,
      paymentStatus: 'unpaid',
      status: 'pending',
      user: pUser._id,
      hotel: hotel1._id
    });

    // ── Cancelled booking (US2-4 already cancelled scenario) ──
    await Booking.create({
      checkInDate: new Date('2025-06-15'),
      numberOfNights: 2,
      roomType: 'standard',
      totalPrice: 1200 * 2,
      amountPaid: 0,
      paymentStatus: 'refunded',
      status: 'cancelled',
      cancelledBy: 'user',
      cancellationReason: 'Change of travel plans',
      cancelledAt: new Date('2025-06-01'),
      refundRate: 1,
      refundAmount: 1200 * 2,
      user: user3._id,
      hotel: hotel5._id
    });

    // ── Booking with pending edit request (US3-6, US2-3) ──
    const pendingEditBooking = await Booking.create({
      checkInDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
      numberOfNights: 2,
      roomType: 'deluxe',
      totalPrice: 1800 * 2,
      amountPaid: 1800 * 2,
      paymentStatus: 'paid',
      status: 'pending', // pending because of edit request
      user: user3._id,
      hotel: hotel2._id
    });

    // ── Monthly spread for stats chart (US3-3, US4-1) ──
    const months = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    for (const month of months) {
      await Booking.create({
        checkInDate: new Date(2025, month, 10),
        numberOfNights: 2,
        roomType: month % 3 === 0 ? 'standard' : month % 3 === 1 ? 'deluxe' : 'suite',
        totalPrice: month % 3 === 0 ? 1500 * 2 : month % 3 === 1 ? 2500 * 2 : 5000 * 2,
        amountPaid: month % 3 === 0 ? 1500 * 2 : month % 3 === 1 ? 2500 * 2 : 5000 * 2,
        paymentStatus: 'paid',
        status: 'confirmed',
        user: [user1, user2, user3][month % 3]._id,
        hotel: hotel1._id
      });
    }

    console.log(`Created bookings`.green);

    // ─────────────────────────────────────────────
    // BOOKING REQUESTS (US3-6, US2-3)
    // ─────────────────────────────────────────────
    console.log('Creating booking requests...'.yellow);

    // Pending edit request (US3-6 Scenario 1 — admin can process)
    await BookingRequest.create({
      booking: pendingEditBooking._id,
      type: 'edit',
      status: 'pending',
      requestedBy: user3._id,
      newCheckInDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      newNumberOfNights: 3
    });

    // Pending cancel request (US3-6 Scenario 1 — delete type)
    const cancelRequestBooking = await Booking.create({
      checkInDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
      numberOfNights: 1,
      roomType: 'standard',
      totalPrice: 1000,
      amountPaid: 1000,
      paymentStatus: 'paid',
      status: 'pending',
      user: user1._id,
      hotel: hotel2._id
    });

    await BookingRequest.create({
      booking: cancelRequestBooking._id,
      type: 'delete',
      status: 'pending',
      requestedBy: user1._id
    });

    // Already processed request (US3-6 Scenario 2 — already approved)
    const processedBooking = await Booking.create({
      checkInDate: new Date('2025-08-01'),
      numberOfNights: 2,
      roomType: 'deluxe',
      totalPrice: 2500 * 2,
      amountPaid: 2500 * 2,
      paymentStatus: 'paid',
      status: 'confirmed',
      user: user2._id,
      hotel: hotel1._id
    });

    await BookingRequest.create({
      booking: processedBooking._id,
      type: 'edit',
      status: 'approved',
      requestedBy: user2._id,
      adminReason: 'Approved — dates confirmed available',
      newCheckInDate: new Date('2025-08-10'),
      newNumberOfNights: 3
    });

    console.log(`Created booking requests`.green);

    // ─────────────────────────────────────────────
    // SUMMARY
    // ─────────────────────────────────────────────
    console.log('\n================================='.cyan);
    console.log('Database seeded successfully!'.green.bold);
    console.log('================================='.cyan);

    console.log('\nTest Accounts:'.yellow.bold);
    console.log('Admin:'.cyan);
    console.log('  Email: admin@hotel.com       | Password: admin123');
    console.log('\nHotel Owners:'.cyan);
    console.log('  Email: owner1@hotel.com      | Password: owner123  (Grand Hotel Bangkok, Riverside Resort)');
    console.log('  Email: owner2@hotel.com      | Password: owner123  (Beach Paradise Phuket, Mountain View Hotel)');
    console.log('\nRegular Users:'.cyan);
    console.log('  Email: john@example.com      | Password: password123');
    console.log('  Email: jane@example.com      | Password: password123');
    console.log('  Email: bob@example.com       | Password: password123');
    console.log('  Email: p@gmail.com           | Password: 123456  (has unpaid booking)');
    console.log('\nDeactivated Account:'.cyan);
    console.log('  Email: deactivated@example.com | Password: password123  (account is inactive)');

    console.log('\nKey Data for Testing:'.yellow.bold);
    console.log('  US1-4: Login with deactivated@example.com → should show deactivated error');
    console.log('  US2-1: p@gmail.com has an unpaid booking → go to /bookings → Pay Now');
    console.log('  US2-3: john@example.com has a future booking → Edit dates');
    console.log('  US2-4: jane@example.com has a future booking → Cancel (full refund)');
    console.log('  US3-6: Admin → /admin/requests → 2 pending requests to process');
    console.log('  US4-1: owner1@hotel.com → /owner → Grand Hotel Bangkok dashboard');
    console.log('  US4-2: owner1@hotel.com → Financial Report with date range');
    console.log('\n=================================\n'.cyan);

    process.exit(0);
  } catch (err) {
    console.error('Error seeding data:'.red, err);
    process.exit(1);
  }
};

const clearData = async () => {
  try {
    console.log('Clearing all data...'.yellow);
    await BookingRequest.deleteMany();
    await Booking.deleteMany();
    await Hotel.deleteMany();
    await User.deleteMany();
    console.log('All data cleared successfully!'.green.bold);
    process.exit(0);
  } catch (err) {
    console.error('Error clearing data:'.red, err);
    process.exit(1);
  }
};

if (process.argv[2] === '-d') {
  clearData();
} else {
  seedData();
}
