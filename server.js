const express = require('express');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcrypt');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(__dirname)); // Serve static files

// Session Configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret_key', // Change this in production
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Initialize Database Tables
const initDb = async () => {
    try {
        // Appointments Table
        // Create tables if they don't exist
        await db.query(`
            CREATE TABLE IF NOT EXISTS appointments (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(255) NOT NULL,
                phone VARCHAR(50) NOT NULL,
                category VARCHAR(100) NOT NULL,
                service VARCHAR(100) NOT NULL,
                appointment_date DATE NOT NULL,
                appointment_time TIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Migration: Add category column if it doesn't exist (for existing tables)
        await db.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='category') THEN
                    ALTER TABLE appointments ADD COLUMN category VARCHAR(100) DEFAULT 'General';
                END IF;
            END $$;
        `);

        // Admins Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS admins (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL
            )
        `);

        console.log('Database initialized successfully.');
    } catch (err) {
        console.error('Error initializing database:', err);
    }
};

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html'));
});

// Admin Routes
app.get('/admin', (req, res) => {
    if (req.session.adminId) {
        res.redirect('/admin/dashboard');
    } else {
        res.sendFile(path.join(__dirname, 'admin_login.html'));
    }
});

app.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await db.query('SELECT * FROM admins WHERE username = $1', [username]);
        if (result.rows.length === 0) {
            return res.status(401).send('Invalid credentials');
        }

        const admin = result.rows[0];
        const match = await bcrypt.compare(password, admin.password_hash);

        if (match) {
            req.session.adminId = admin.id;
            res.redirect('/admin/dashboard');
        } else {
            res.status(401).send('Invalid credentials');
        }
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/admin/dashboard', (req, res) => {
    if (!req.session.adminId) {
        return res.redirect('/admin');
    }
    res.sendFile(path.join(__dirname, 'admin_dashboard.html'));
});

app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/api/appointments', async (req, res) => {
    if (!req.session.adminId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const result = await db.query('SELECT * FROM appointments ORDER BY appointment_date DESC, appointment_time ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching appointments:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Reset all appointments
app.post('/api/appointments/reset-all', async (req, res) => {
    if (!req.session.adminId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        await db.query('DELETE FROM appointments');
        res.json({ message: "All appointments have been cleared successfully." });
    } catch (err) {
        console.error('Error resetting appointments:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Delete individual appointment
app.delete('/api/appointments/:id', async (req, res) => {
    if (!req.session.adminId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const { id } = req.params;
    console.log(`[Admin] Attempting to delete appointment ID: ${id}`);
    try {
        const result = await db.query('DELETE FROM appointments WHERE id = $1', [parseInt(id)]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Appointment not found.' });
        }
        res.json({ message: "Appointment deleted successfully." });
    } catch (err) {
        console.error('Error deleting appointment:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/submit-appointment', async (req, res) => {
    const { fullName, phone, category, service, date, time } = req.body;

    if (!fullName || !phone || !category || !service || !date || !time) {
        return res.status(400).send('All fields are required.');
    }

    try {
        const query = `
            INSERT INTO appointments (full_name, phone, category, service, appointment_date, appointment_time)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;
        const values = [fullName, phone, category, service, date, time];
        const result = await db.query(query, values);

        console.log('New Appointment Booked:', result.rows[0]);

        // Redirect to success page
        res.redirect('/success.html');
    } catch (err) {
        console.error('Error saving appointment:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Start Server
app.listen(PORT, async () => {
    await initDb();
    console.log(`Server is running at http://localhost:${PORT}`);
});
