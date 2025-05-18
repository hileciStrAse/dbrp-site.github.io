const express = require('express');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const fs = require('fs');
const webpush = require('web-push');
const { Sequelize, DataTypes } = require('sequelize');
const session = require('express-session');
require('dotenv').config();

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './database.sqlite'
});

const app = express();
const port = process.env.PORT || 5001;

// SQLite verilənlər bazası bağlantısı
// const sequelize = new Sequelize({
//     dialect: 'sqlite',
//     storage: './database.sqlite' // Verilənlər bazası faylının yolu
// });

// Modelləri daxil edin və başlatın
const Admin = require('./models/Admin')(sequelize, DataTypes); // Admin modelini daxil edin
const ConnectedUser = require('./models/ConnectedUser')(sequelize, DataTypes); // ConnectedUser modelini daxil edin

// Sessiya konfiqurasiyası
app.use(session({
    secret: process.env.SESSION_SECRET || 'your_default_secret', // Çox güclü bir secret istifadə edin
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production' } // HTTPS istifadə edirsinizsə 'secure: true' edin
}));

// CORS ayarları
app.use(cors());

// JSON ve URL-encoded verileri işleme
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Statik dosyalar için public klasörünü kullan
app.use(express.static('public'));

// Verilənlər bazası modeli (Admin)
// const Admin = sequelize.define('Admin', {
//     discordId: {
//         type: DataTypes.STRING,
//         unique: true,
//         allowNull: false
//     }
// });

// Verilənlər bazasını sinxronizasiya et
async function syncDatabase() {
    try {
        await sequelize.sync();
        console.log('Database synced successfully.');
        // Başlanğıc admin ID-lərini əlavə edin (əgər yoxdursa)
        const initialAdminId = process.env.ADMIN_DISCORD_ID; // .env faylında təyin edin
        if (initialAdminId) {
            const existingAdmin = await Admin.findOne({ where: { discordId: initialAdminId } });
            if (!existingAdmin) {
                await Admin.create({ discordId: initialAdminId });
                console.log(`Initial admin ${initialAdminId} added to database.`);
            }
        }
    } catch (error) {
        console.error('Error syncing database:', error);
    }
}

syncDatabase();

// Ana sayfa route'u
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Xidmət şərtləri route'u
app.get('/terms', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

// Məxfilik siyasəti route'u
app.get('/privacy', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

// Emrler route'u
app.get('/emrler', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'emrler.html'));
});

// Kontakt route'u
app.get('/kontakt', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'kontakt.html'));
});

// Kontakt formu üçün email göndərən endpoint
app.post('/api/contact', async (req, res) => {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
        return res.status(400).json({ success: false, error: 'Bütün sahələr doldurulmalıdır.' });
    }
    try {
        // Nodemailer transporter (gmail üçün)
        let transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'adeadem123321@gmail.com',
                pass: 'afal slaf hysp xlzj' // Burada Gmail üçün App Password istifadə edilməlidir!
            }
        });
        await transporter.sendMail({
            from: email,
            to: 'adeadem123321@gmail.com',
            replyTo: email,
            subject: `Yeni Kontakt Mesajı - ${name}`,
            text: `Ad: ${name}\nEmail: ${email}\nMesaj: ${message}`,
            html: `<b>Ad:</b> ${name}<br><b>Email:</b> ${email}<br><b>Mesaj:</b><br>${message}`
        });
        res.json({ success: true });
    } catch (err) {
        console.error('Email göndərilərkən xəta:', err);
        res.status(500).json({ success: false, error: 'Email göndərilə bilmədi.' });
    }
});

// Fəaliyyətləri oxu
app.get('/api/activities', (req, res) => {
    if (fs.existsSync(activitiesFile)) {
        const data = fs.readFileSync(activitiesFile, 'utf-8');
        res.json(JSON.parse(data));
    } else {
        res.json([]);
    }
});

// Yeni fəaliyyət əlavə et
app.post('/api/activities', (req, res) => {
    const { title, description, date, icon } = req.body;
    if (!title || !description || !date || !icon) {
        return res.status(400).json({ success: false, error: 'Bütün sahələr doldurulmalıdır.' });
    }
    let activities = [];
    if (fs.existsSync(activitiesFile)) {
        activities = JSON.parse(fs.readFileSync(activitiesFile, 'utf-8'));
    }
    activities.unshift({ id: Date.now().toString(), title, description, date, icon });
    fs.writeFileSync(activitiesFile, JSON.stringify(activities, null, 2));
    res.json({ success: true });
});

// VAPID açarlarını bura əlavə et (öz açarlarınla əvəz et)
webpush.setVapidDetails(
  'mailto:adeadem123321@gmail.com',
  'BF_gMcKgs2qIU5L028tm1dM-GutD60RlEjAuqsZEjT9wudyvxrTCdUf_-ERupEtl_JeJMEw53i_t-MOVa_1b1AI',   // publicKey
  'cqgyT5FPm7ArwccmH3UiDLxUpqtTmkxuos7E0l2OW-k'   // privateKey
);

const subsFile = './subscriptions.json';
const announcementsFile = './announcements.json';

// Abunə əlavə et
app.post('/api/subscribe', (req, res) => {
    const sub = req.body;
    let subscriptions = [];
    if (fs.existsSync(subsFile)) {
        subscriptions = JSON.parse(fs.readFileSync(subsFile, 'utf-8'));
    }
    if (!subscriptions.find(s => JSON.stringify(s) === JSON.stringify(sub))) {
        subscriptions.push(sub);
        fs.writeFileSync(subsFile, JSON.stringify(subscriptions, null, 2));
    }
    res.status(201).json({});
});

// Duyuruları oxu
app.get('/api/announcements', (req, res) => {
    if (fs.existsSync(announcementsFile)) {
        const data = fs.readFileSync(announcementsFile, 'utf-8');
        res.json(JSON.parse(data));
    } else {
        res.json([]);
    }
});

// Yeni duyuru əlavə et və push göndər
app.post('/api/announcements', (req, res) => {
    const { title, message, date } = req.body;
    if (!title || !message || !date) {
        return res.status(400).json({ success: false, error: 'Bütün sahələr doldurulmalıdır.' });
    }
    let announcements = [];
    if (fs.existsSync(announcementsFile)) {
        announcements = JSON.parse(fs.readFileSync(announcementsFile, 'utf-8'));
    }
    const newAnn = { id: Date.now().toString(), title, message, date };
    announcements.unshift(newAnn);
    fs.writeFileSync(announcementsFile, JSON.stringify(announcements, null, 2));

    // Push notification göndər
    let subscriptions = [];
    if (fs.existsSync(subsFile)) {
        subscriptions = JSON.parse(fs.readFileSync(subsFile, 'utf-8'));
    }
    const payload = JSON.stringify({ title, message });
    subscriptions.forEach(sub => {
        webpush.sendNotification(sub, payload).catch(err => console.error(err));
    });

    res.json({ success: true });
});

// Admin paneli üçün duyuru yönetimi endpoint'ləri (Database ilə)
app.get('/api/admin/announcements', async (req, res) => {
    try {
        const announcements = await AnnouncementService.getAllAnnouncements();
        res.json(announcements);
    } catch (error) {
        console.error('Elanlar əldə edilərkən xəta:', error);
        res.status(500).json({ success: false, error: 'Elanlar əldə edilərkən xəta baş verdi.' });
    }
});

app.post('/api/announcements', async (req, res) => {
    const { title, message } = req.body;
    if (!title || !message) {
        return res.status(400).json({ success: false, error: 'Başlıq və mətn daxil edilməlidir.' });
    }
    try {
        const newAnn = await AnnouncementService.createAnnouncement(title, message);

        // Push notification göndər
        let subscriptions = [];
        if (fs.existsSync(subsFile)) {
            subscriptions = JSON.parse(fs.readFileSync(subsFile, 'utf-8'));
        }
        const payload = JSON.stringify({ title, message });
        subscriptions.forEach(sub => {
            webpush.sendNotification(sub, payload).catch(err => console.error(err));
        });

        res.json({ success: true, announcement: newAnn });
    } catch (error) {
        console.error('Elan göndərilərkən xəta:', error);
        res.status(500).json({ success: false, error: 'Elan göndərilərkən xəta baş verdi.' });
    }
});

app.delete('/api/admin/announcements/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await AnnouncementService.deleteAnnouncement(id);
        if (result) {
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, error: 'Elan tapılmadı.' });
        }
    } catch (error) {
        console.error('Elan silinərkən xəta:', error);
        res.status(500).json({ success: false, error: 'Elan silinərkən xəta baş verdi.' });
    }
});

// Fəaliyyət yönetimi endpoint'ləri (Database ilə)
app.get('/api/activities', async (req, res) => {
    const { limit = 20, skip = 0 } = req.query;
    try {
        const activities = await ActivityService.getServerActivities(req.query.serverId, parseInt(limit), parseInt(skip));
        res.json(activities);
    } catch (error) {
        console.error('Fəaliyyətlər əldə edilərkən xəta:', error);
        res.status(500).json({ success: false, error: 'Fəaliyyətlər əldə edilərkən xəta baş verdi.' });
    }
});

app.delete('/api/activities', async (req, res) => {
    try {
        await ActivityService.deleteAllActivities(); // Assuming deleteAllActivities exists in ActivityService
        res.json({ success: true });
    } catch (error) {
        console.error('Bütün fəaliyyətlər silinərkən xəta:', error);
        res.status(500).json({ success: false, error: 'Bütün fəaliyyətlər silinərkən xəta baş verdi.' });
    }
});

// Discord OAuth2 endpoint'ləri
app.get('/auth/discord', (req, res) => {
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.DISCORD_REDIRECT_URI)}&response_type=code&scope=identify`;
    res.redirect(discordAuthUrl);
});

app.get('/auth/discord/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.status(400).send('Discord OAuth2 kodu alınmadı.');
    }

    try {
        const oauth2Data = new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: process.env.DISCORD_REDIRECT_URI,
            scope: 'identify',
        });

        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: oauth2Data,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        const oauth2 = await tokenResponse.json();

        if (oauth2.error) {
            console.error('Discord OAuth2 token xətası:', oauth2.error);
            return res.status(400).send('Discord OAuth2 token alınmadı.');
        }

        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: {
                authorization: `${oauth2.token_type} ${oauth2.access_token}`,
            },
        });

        const user = await userResponse.json();

        // İstifadəçi ID-sini sessiyaya əlavə edin
        req.session.discordId = user.id;

        // İstifadəçi məlumatlarını ConnectedUser cədvəlinə əlavə edin (əgər yoxdursa)
        const [connectedUser, created] = await ConnectedUser.findOrCreate({
            where: { discordId: user.id },
            defaults: {
                username: user.username // Və ya user.global_name
            }
        });

        // İstifadəçini ana səhifəyə və ya admin panelinə yönləndirin
        // Yalnız .env-də təyin olunmuş ADMIN_DISCORD_ID sahibidirsə admin paneline yönləndir
        if (user.id === process.env.ADMIN_DISCORD_ID) {
             res.redirect('/admin');
        } else {
             res.redirect('/');
        }

    } catch (error) {
        console.error('Discord OAuth2 callback xətası:', error);
        res.status(500).send('Discord OAuth2 callback xətası baş verdi.');
    }
});

// Admin paneli route (Autentifikasiya yoxlaması ilə)
app.get('/admin', async (req, res) => {
    // Sessiyada Discord ID-nin olub olmadığını yoxla
    if (!req.session.discordId) {
        // Yoxdursa, istifadəçini Discord OAuth2-ə yönləndir
        return res.redirect('/auth/discord');
    }

    try {
        // Discord ID-nin admin olub olmadığını verilənlər bazasında yoxla
        const adminUser = await Admin.findOne({ where: { discordId: req.session.discordId } });

        if (adminUser) {
            // Admindirsə, admin panelini göstər
            res.sendFile(path.join(__dirname, 'public', 'admin.html'));
        } else {
            // Admin deyilsə, icazənin olmadığını bildir
            res.status(403).send('Bu səhifəyə giriş icazəniz yoxdur.');
        }
    } catch (error) {
        console.error('Admin paneli autentifikasiya xətası:', error);
        res.status(500).send('Server xətası baş verdi.');
    }
});

// Bağlı İstifadəçilər endpoint'i (Database ilə, Admin üçün)
app.get('/api/admin/connected-users', async (req, res) => {
    // Admin autentifikasiyasını yoxla
    if (!req.session.discordId) {
        return res.status(401).json({ success: false, error: 'Giriş icazəniz yoxdur.' });
    }
    try {
        const adminUser = await Admin.findOne({ where: { discordId: req.session.discordId } });
        if (!adminUser) {
            return res.status(403).json({ success: false, error: 'Bu əməliyyat üçün icazəniz yoxdur.' });
        }

        const connectedUsers = await ConnectedUser.findAll({
            attributes: ['discordId', 'username', 'connectedAt'],
            order: [['connectedAt', 'DESC']]
        });
        res.json(connectedUsers);
    } catch (error) {
        console.error('Bağlı istifadəçilər əldə edilərkən xəta:', error);
        res.status(500).json({ success: false, error: 'Bağlı istifadəçilər əldə edilərkən xəta baş verdi.' });
    }
});

app.listen(port, () => {
    console.log(`Server ${port} portunda işləyir`);
}); 
