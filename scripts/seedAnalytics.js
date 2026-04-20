const mongoose = require('mongoose');
const User = require('../models/User');
const Incident = require('../models/Incident');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/incident_reporting';

const seedData = async () => {
    try {
        console.log('🌱 Connecting to database for seeding...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected.');

        // 1. Create Mock Drivers if they don't exist
        const driverCount = await User.countDocuments({ role: 'driver' });
        if (driverCount < 3) {
            console.log('🚗 Creating mock drivers...');
            const drivers = [
                {
                    name: 'Aslam Driver',
                    email: 'aslam@edhi.com',
                    phone: '+923123456781',
                    cnic: '42101-1234567-1',
                    password: 'password123',
                    role: 'driver',
                    department: 'Edhi Foundation',
                    status: 'active'
                },
                {
                    name: 'Bilal Driver',
                    email: 'bilal@chippa.com',
                    phone: '+923123456782',
                    cnic: '42101-1234567-2',
                    password: 'password123',
                    role: 'driver',
                    department: 'Chippa Ambulance',
                    status: 'active'
                },
                {
                    name: 'Hamza Driver',
                    email: 'hamza@edhi.com',
                    phone: '+923123456783',
                    cnic: '42101-1234567-3',
                    password: 'password123',
                    role: 'driver',
                    department: 'Edhi Foundation',
                    status: 'active'
                }
            ];
            for (const d of drivers) {
                const exists = await User.findOne({ email: d.email });
                if (!exists) await User.create(d);
            }
        }

        // 2. Create Mock Incidents
        const incidentCount = await Incident.countDocuments();
        if (incidentCount < 10) {
            console.log('🚨 Creating mock incidents...');
            const categories = ['Accident', 'Emergency', 'Fire'];
            const priorities = ['critical', 'urgent', 'high', 'medium', 'low'];
            const departments = ['Edhi Foundation', 'Chippa Ambulance'];
            const statuses = ['pending', 'assigned', 'completed', 'rejected'];

            const admin = await User.findOne({ role: 'admin' }) || await User.findOne({ role: 'superadmin' });
            const citizen = await User.findOne({ role: 'citizen' });

            if (!admin || !citizen) {
                console.log('❌ ADMIN or CITIZEN user missing. Please create them first or run /hard-reset');
                process.exit(1);
            }

            for (let i = 0; i < 15; i++) {
                const createdAt = new Date();
                createdAt.setDate(createdAt.getDate() - Math.floor(Math.random() * 20)); // Random date in last 20 days
                
                const status = statuses[Math.floor(Math.random() * statuses.length)];
                let completedAt = null;
                if (status === 'completed') {
                    completedAt = new Date(createdAt);
                    completedAt.setMinutes(completedAt.getMinutes() + 20 + Math.random() * 40);
                }

                await Incident.create({
                    reportedBy: citizen._id,
                    description: `Sample ${categories[i % 3]} incident reported via mobile app.`,
                    category: categories[i % 3],
                    priority: priorities[i % 5],
                    status: status,
                    location: {
                        type: 'Point',
                        coordinates: [67.0011 + (Math.random() * 0.1), 24.8607 + (Math.random() * 0.1)],
                        address: `${Math.floor(Math.random() * 100)} Main St, Karachi`
                    },
                    assignedTo: status !== 'pending' ? {
                        department: departments[i % 2],
                        assignedAt: new Date(createdAt),
                        assignedBy: admin._id
                    } : undefined,
                    timestamps: {
                        reportedAt: createdAt,
                        completedAt: completedAt
                    },
                    createdAt: createdAt
                });
            }
            console.log('✅ 15 Mock incidents created.');
        }

        console.log('✨ Data seeding complete! Refresh your dashboard.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
};

seedData();
