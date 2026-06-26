const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

const User = require('./models/User');
const Event = require('./models/Event');
const Booking = require('./models/Bookings');

dotenv.config();

const dns = require('dns');

// Fix MongoDB Atlas SRV lookup issues on some Windows systems
dns.setServers(['8.8.8.8', '1.1.1.1']);

const users = [
    { name: 'Admin User', email: process.env.SEED_ADMIN_EMAIL || 'admin@example.com', password: process.env.SEED_ADMIN_PASSWORD || 'change-this-admin-password', role: 'admin' },
    { name: 'Demo User', email: process.env.SEED_USER_EMAIL || 'user@example.com', password: process.env.SEED_USER_PASSWORD || 'change-this-user-password', role: 'user' },
    { name: 'Alice Smith', email: 'alice@eventer.com', password: 'password123', role: 'user' },
    { name: 'Bob Johnson', email: 'bob@eventer.com', password: 'password123', role: 'user' },
    { name: 'Charlie Dave', email: 'charlie@eventer.com', password: 'password123', role: 'user' },
    { name: 'Diana Prince', email: 'diana@eventer.com', password: 'password123', role: 'user' },
    { name: 'Ethan Hunt', email: 'ethan@eventer.com', password: 'password123', role: 'user' },
    { name: 'Fiona Gallagher', email: 'fiona@eventer.com', password: 'password123', role: 'user' },
    { name: 'George Miller', email: 'george@eventer.com', password: 'password123', role: 'user' },
    { name: 'Hannah Montana', email: 'hannah@eventer.com', password: 'password123', role: 'user' }
];

const events = [
    {
        title: 'React & Node.js Developer Retreat',
        description: 'Join us for a 3-day deep dive into modern full-stack web development. Perfect for developers looking to take their skills to the next level.',
        date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        location: 'Silicon Valley Innovation Center, CA',
        category: 'Technology',
        totalSeats: 200,
        ticketPrice: 0,
        imageUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&q=80&w=800'
    },
    {
        title: 'Neon Nights EDM Festival',
        description: 'Experience an unforgettable night of EDM, techno, and dazzling light shows with top DJs from around the globe.',
        date: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        location: 'Grand Arena, New York',
        category: 'Music',
        totalSeats: 500,
        ticketPrice: 1500,
        imageUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=800'
    },
    {
        title: 'Global Leaders Business Summit',
        description: 'A premium gathering of CEOs, founders, and investors discussing the future of global commerce and AI integration.',
        date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        location: 'The Ritz-Carlton, London',
        category: 'Business',
        totalSeats: 150,
        ticketPrice: 5000,
        imageUrl: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&q=80&w=800'
    },
    {
        title: 'Modern Art Expo 2024',
        description: 'Discover breathtaking contemporary and modern arts from underground and trending artists this season.',
        date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        location: 'Downtown Art Museum',
        category: 'Art',
        totalSeats: 300,
        ticketPrice: 200,
        imageUrl: 'https://images.unsplash.com/photo-1536924940846-227afb31e2a5?auto=format&fit=crop&q=80&w=800'
    },
    {
        title: 'Startup Pitch & Pitch Competition',
        description: 'Watch 25 startups pitch for 1 million dollars in seed funding. Great networking for entrepreneurs and angel investors.',
        date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        location: 'Convention Center, Miami',
        category: 'Business',
        totalSeats: 250,
        ticketPrice: 100,
        imageUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=800'
    },
    {
        title: 'Cloud Computing Architecture Seminar',
        description: 'A purely technical breakdown of scalable cloud solutions, multi-region routing, and serverless compute processing.',
        date: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
        location: 'Tech Hub, Seattle',
        category: 'Technology',
        totalSeats: 100,
        ticketPrice: 600,
        imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=800'
    }
];

const seedDatabase = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URL);

        console.log('✅ MongoDB connection open...');

        await User.deleteMany();
        await Event.deleteMany();
        await Booking.deleteMany();

        console.log('🗑️ Cleared existing data.');

        // Hash passwords
        const salt = await bcrypt.genSalt(10);

        const hashedUsers = users.map(user => ({
            ...user,
            password: bcrypt.hashSync(user.password, salt),
            isVerified: true
        }));

        const createdUsers = await User.insertMany(hashedUsers);

        console.log(`👤 Created ${createdUsers.length} users.`);

        const adminUser = createdUsers.find(user => user.role === 'admin');

        // Add required fields
        const eventsWithAdmin = events.map(event => ({
            ...event,
            availableSeats: event.totalSeats,
            createdBy: adminUser._id
        }));

        const createdEvents = await Event.insertMany(eventsWithAdmin);

        console.log(`🎉 Created ${createdEvents.length} events.`);

        const normalUsers = createdUsers.filter(user => user.role === 'user');

        const bookingsData = [];

        for (const event of createdEvents) {
            const randomCount = Math.floor(Math.random() * 4) + 3;

            const shuffledUsers = [...normalUsers].sort(() => 0.5 - Math.random());

            const selectedUsers = shuffledUsers.slice(0, randomCount);

            for (const user of selectedUsers) {
                const statuses = ['pending', 'confirmed', 'cancelled'];

                const status = statuses[Math.floor(Math.random() * statuses.length)];

                let paymentStatus = 'not_paid';

                if (event.ticketPrice === 0) {
                    paymentStatus = 'paid';
                } else if (status === 'confirmed') {
                    paymentStatus = Math.random() > 0.1 ? 'paid' : 'not_paid';
                }

                bookingsData.push({
                    userId: user._id,
                    eventId: event._id,
                    status,
                    paymentStatus,
                    amount: event.ticketPrice
                });

                if (status === 'confirmed') {
                    event.availableSeats -= 1;
                    await event.save();
                }
            }
        }

        await Booking.insertMany(bookingsData);

        console.log(`🎫 Inserted ${bookingsData.length} bookings.`);

        console.log('\n🚀 Database seeded successfully!');
        console.log('--------------------------------');
        console.log('Seed admin/user credentials were loaded from environment variables.');
        console.log('--------------------------------');

        process.exit();
    } catch (error) {
        console.error('❌ Error seeding data:', error);
        process.exit(1);
    }
};

seedDatabase();
