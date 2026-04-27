const { setServers } = require("node:dns/promises");
setServers(["1.1.1.1", "8.8.8.8"]);

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const colors = require('colors');


// Load env vars
dotenv.config({ path: './config/config.env' });

// Load models
const User = require('./models/User');
const Hotel = require('./models/Hotel');
const Booking = require('./models/Booking');

// Connect to DB
mongoose.connect(process.env.MONGO_URI);

const seedData = async () => {
  try {
    // Clear existing data
    console.log('Clearing existing data...'.yellow);
    await User.deleteMany();
    await Hotel.deleteMany();
    await Booking.deleteMany();
    console.log('Data cleared'.green);

    // Create users
    console.log('Creating users...'.yellow);
    
    const adminUser = await User.create({
      name: 'Admin User',
      telephone: '0812345678',
      email: 'admin@hotel.com',
      password: 'admin123',
      role: 'admin'
    });

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

    await User.create({
      name: 'P User',
      telephone: '0800000000',
      email: 'p@gmail.com',
      password: '123456',
      role: 'user'
    });

    console.log(`Created ${5} users`.green);

    // Create hotels
    console.log('Creating hotels...'.yellow);
    
    const hotel1 = await Hotel.create({
      name: 'Grand Hotel Bangkok',
      address: '123 Sukhumvit Road, Watthana, Bangkok 10110',
      telephone: '021234567',
      pricePerNight: 2500
    });

    const hotel2 = await Hotel.create({
      name: 'Riverside Resort Chiang Mai',
      address: '456 Ping River Road, Muang, Chiang Mai 50000',
      telephone: '053987654',
      pricePerNight: 1800
    });

    const hotel3 = await Hotel.create({
      name: 'Beach Paradise Phuket',
      address: '789 Patong Beach Road, Kathu, Phuket 83150',
      telephone: '076555666',
      pricePerNight: 3200
    });

    const hotel4 = await Hotel.create({
      name: 'Mountain View Hotel Pai',
      address: '321 Mountain Road, Pai, Mae Hong Son 58130',
      telephone: '053698745',
      pricePerNight: 1200
    });

    const hotel5 = await Hotel.create({
      name: 'City Center Hotel Pattaya',
      address: '654 Beach Road, Pattaya City, Chonburi 20150',
      telephone: '038123456',
      pricePerNight: 2000
    });

    console.log(`Created ${5} hotels`.green);

    // Create bookings
    console.log('Creating bookings...'.yellow);
    
    // User 1 bookings
    await Booking.create({
      checkInDate: new Date('2024-12-25'),
      numberOfNights: 2,
      totalPrice: 2500 * 2,
      amountPaid: 2500 * 2,
      paymentStatus: 'paid',
      status: 'confirmed',
      user: user1._id,
      hotel: hotel1._id
    });

    await Booking.create({
      checkInDate: new Date('2025-01-15'),
      numberOfNights: 3,
      totalPrice: 1800 * 3,
      amountPaid: 1800 * 3,
      paymentStatus: 'paid',
      status: 'confirmed',
      user: user1._id,
      hotel: hotel2._id
    });

    // User 2 bookings
    await Booking.create({
      checkInDate: new Date('2024-12-28'),
      numberOfNights: 1,
      totalPrice: 3200 * 1,
      amountPaid: 3200 * 1,
      paymentStatus: 'paid',
      status: 'confirmed',
      user: user2._id,
      hotel: hotel3._id
    });

    await Booking.create({
      checkInDate: new Date('2025-02-10'),
      numberOfNights: 2,
      totalPrice: 1200 * 2,
      amountPaid: 1200 * 2,
      paymentStatus: 'paid',
      status: 'confirmed',
      user: user2._id,
      hotel: hotel4._id
    });

    // User 3 bookings
    await Booking.create({
      checkInDate: new Date('2025-01-05'),
      numberOfNights: 3,
      totalPrice: 2000 * 3,
      amountPaid: 2000 * 3,
      paymentStatus: 'paid',
      status: 'confirmed',
      user: user3._id,
      hotel: hotel5._id
    });

    await Booking.create({
      checkInDate: new Date('2025-03-20'),
      numberOfNights: 2,
      totalPrice: 2500 * 2,
      amountPaid: 2500 * 2,
      paymentStatus: 'paid',
      status: 'confirmed',
      user: user3._id,
      hotel: hotel1._id
    });

    console.log(`Created ${6} bookings`.green);

    console.log('\n================================='.cyan);
    console.log('Database seeded successfully!'.green.bold);
    console.log('================================='.cyan);
    console.log('\nTest Accounts:'.yellow.bold);
    console.log('Admin:'.cyan);
    console.log('  Email: admin@hotel.com');
    console.log('  Password: admin123');
    console.log('\nRegular Users:'.cyan);
    console.log('  Email: john@example.com | Password: password123');
    console.log('  Email: jane@example.com | Password: password123');
    console.log('  Email: bob@example.com  | Password: password123');
    console.log('  Email: p@gmail.com      | Password: 123456');
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
    await User.deleteMany();
    await Hotel.deleteMany();
    await Booking.deleteMany();
    console.log('All data cleared successfully!'.green.bold);
    process.exit(0);
  } catch (err) {
    console.error('Error clearing data:'.red, err);
    process.exit(1);
  }
};

// Check command line arguments
if (process.argv[2] === '-d') {
  clearData();
} else {
  seedData();
}
