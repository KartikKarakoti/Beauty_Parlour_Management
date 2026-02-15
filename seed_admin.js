const db = require('./db');
const bcrypt = require('bcrypt');

const seedAdmin = async () => {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error('Usage: node seed_admin.js <username> <password>');
        process.exit(1);
    }

    const [username, password] = args;

    try {
        // Ensure table exists
        await db.query(`
            CREATE TABLE IF NOT EXISTS admins (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL
            )
        `);

        // Hash password
        const saltRounds = 10;
        const hash = await bcrypt.hash(password, saltRounds);

        // Insert
        await db.query(`
            INSERT INTO admins (username, password_hash)
            VALUES ($1, $2)
            ON CONFLICT (username) DO NOTHING
        `, [username, hash]);

        console.log(`Admin user '${username}' seeded successfully.`);
    } catch (err) {
        console.error('Error seeding admin:', err);
    } finally {
        process.exit();
    }
};

seedAdmin();
