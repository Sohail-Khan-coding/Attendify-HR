require('dotenv').config();

const connectDB = require('./config/db');
const User = require('./models/User');
const bcrypt = require('bcryptjs');

(async () => {
    await connectDB();

    const adminPass = await bcrypt.hash('Admin@12345', 12);
    const employeePass = await bcrypt.hash('Employee@12345', 12);

    await User.findOneAndUpdate(
        { email: 'admin@attendify.local' },
        {
            $set: {
                name: 'System Administrator',
                email: 'admin@attendify.local',
                password: adminPass,
                role: 'admin',
                active: true
            }
        },
        { upsert: true, new: true }
    );

    await User.updateMany(
        { role: 'employee' },
        {
            $set: {
                'leaveAllowance.annual': Number(
                    process.env.ANNUAL_LEAVE_DAYS || 24
                )
            }
        }
    );

    await User.findOneAndUpdate(
        { email: 'employee@attendify.local' },
        {
            $set: {
                name: 'Ali Ahmed',
                email: 'employee@attendify.local',
                password: employeePass,
                role: 'employee',
                employeeId: 'EMP-001',
                department: 'Operations',
                designation: 'Operations Officer',
                phone: '0300-0000000',
                active: true,
                leaveAllowance: {
                    annual: Number(
                        process.env.ANNUAL_LEAVE_DAYS || 24
                    ),
                    sick: 8,
                    casual: 10
                }
            }
        },
        { upsert: true, new: true }
    );

    console.log(
        'Seed complete. Admin and employee demo accounts created.'
    );

    process.exit(0);

})().catch(e => {
    console.error(e);
    process.exit(1);
});