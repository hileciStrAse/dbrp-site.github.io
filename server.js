const express = require('express');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const fs = require('fs');
const webpush = require('web-push');
const { Sequelize, DataTypes } = require('sequelize');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const cookieParser = require('cookie-parser');
const ActivityServiceClass = require('./services/activityService');
const passport = require('passport');
const { DiscordStrategy } = require('passport-discord');
require('dotenv').config();

// Discord bot client instance (başqa fayldan ötürüləcək)
let discordClient = null;

// Autentifikasiya middleware funksiyası
const ensureAuthenticated = (req, res, next) => {
    if (!req.session.discordId) {
        return res.status(401).json({ error: 'Giriş icazəniz yoxdur.' });
    }
    next();
};

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './database.sqlite'
});

const app = express();
const port = process.env.PORT || 5001;

// Express-ə proxy arxasında işlədiyini bildirir (Render üçün vacibdir)
app.set('trust proxy', 1);

// Cookie parser middleware'ini ekle
app.use(cookieParser());

// Sessiya konfiqurasiyası
app.use(session({
    store: new SQLiteStore({
        db: 'sessions.sqlite',
        dir: './'
    }),
    secret: 'dbrp_admin_panel_2024_secure_session_key_123456789',
    resave: true,
    saveUninitialized: true,
    cookie: { 
        secure: process.env.NODE_ENV === 'production' || process.env.RENDER === 'true',
        maxAge: 1000 * 60 * 60 * 24,
        httpOnly: true,
        sameSite: 'Lax',
        path: '/',
        domain: 'dbrpbot.onrender.com'
    }
}));

// Hər sorğuda sessiya vəziyyətini yoxlayan middleware (debug üçün)
app.use((req, res, next) => {
    console.log('-- Middleware Start --');
    console.log('Middleware: Received request to', req.method, req.originalUrl);
    console.log('Middleware: Session object:', req.session);
    console.log('Middleware: Session ID:', req.sessionID);
    console.log('Middleware: Discord ID in session:', req.session && req.session.discordId ? req.session.discordId : 'undefined or session null');
    console.log('-- Middleware End --');
    next();
});

// CORS ayarları
app.use(cors());

// JSON ve URL-encoded verileri işleme
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Statik dosyalar için public klasörünü kullan
app.use(express.static(path.join(__dirname, 'public')));

// Modelləri daxil edin və başlatın
const Admin = require('./models/Admin')(sequelize, DataTypes);
const ConnectedUser = require('./models/ConnectedUser')(sequelize, DataTypes);
const Activity = require('./models/Activity')(sequelize, DataTypes);

// ActivityService instansiyasını yaradın və Activity modelini ötürün
const ActivityService = new ActivityServiceClass(Activity);

// Verilənlər bazasını sinxronizasiya et
async function syncDatabase() {
    try {
        await sequelize.sync();
        console.log('Database synced successfully.');
        const initialAdminId = process.env.ADMIN_DISCORD_ID;
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
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('index.html tapılmadı');
    }
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

// Fəaliyyətləri əldə et
app.get('/api/activities', async (req, res) => {
    const { limit = 20, skip = 0, serverId } = req.query;
    if (!serverId) {
        return res.status(400).json({ success: false, error: 'Server ID daxil edilməlidir.' });
    }
    try {
        const activities = await ActivityService.getServerActivities(serverId, parseInt(limit), parseInt(skip));
        res.json(activities);
    } catch (error) {
        console.error('Fəaliyyətlər əldə edilərkən xəta:', error);
        res.status(500).json({ success: false, error: 'Fəaliyyətlər əldə edilərkən xəta baş verdi.' });
    }
});

// Yeni fəaliyyət əlavə et (Bu endpoint ehtimal ki, artıq bot tərəfindən idarə olunur)
// app.post('/api/activities', async (req, res) => {
//     res.status(405).json({ success: false, error: 'Bu endpoint istifadə edilmir.' });
// });

// Bütün fəaliyyətləri sil (Admin üçün)
app.delete('/api/activities', ensureAuthenticated, async (req, res) => {
    try {
        const adminUser = await Admin.findOne({ where: { discordId: req.session.discordId } });
        if (!adminUser) {
            return res.status(403).json({ success: false, error: 'Bu əməliyyat üçün icazəniz yoxdur.' });
        }

        await ActivityService.deleteAllActivities();
        res.json({ success: true });
    } catch (error) {
        console.error('Bütün fəaliyyətlər silinərkən xəta:', error);
        res.status(500).json({ success: false, error: 'Bütün fəaliyyətlər silinərkən xəta baş verdi.' });
    }
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

// Discord OAuth2 endpoint'ləri
app.get('/auth/discord', (req, res) => {
    console.log('/auth/discord: Redirecting to Discord OAuth with full callback URI');
    const params = {
        client_id: process.env.DISCORD_CLIENT_ID,
        response_type: 'code',
        redirect_uri: 'https://dbrpbot.onrender.com/auth/discord/callback',
        scope: 'identify guilds',
        prompt: 'consent'
    };
    console.log('OAuth2 Parameters:', params);
    const discordAuthUrl = 'https://discord.com/oauth2/authorize?' + new URLSearchParams(params).toString();
    console.log('Generated Discord Auth URL:', discordAuthUrl);
    res.redirect(discordAuthUrl);
});

// Discord OAuth2 callback
app.get('/auth/discord/callback', async (req, res) => {
    console.log('Callback: Received request to /auth/discord/callback');
    console.log('Callback: Full URL:', req.protocol + '://' + req.get('host') + req.originalUrl);
    console.log('Callback: Raw URL:', req.url);
    console.log('Callback: Original URL:', req.originalUrl);
    console.log('Callback: Base URL:', req.baseUrl);
    console.log('Callback: Path:', req.path);
    console.log('Callback: Request details:', {
        method: req.method,
        url: req.originalUrl,
        headers: req.headers,
        query: req.query,
        body: req.body,
        cookies: req.cookies,
        signedCookies: req.signedCookies
    });

    const code = req.query.code;
    const error = req.query.error;
    const errorDescription = req.query.error_description;

    if (error) {
        console.error('Callback: Discord OAuth2 error:', error, errorDescription);
        return res.status(400).send(`
            <html>
                <body>
                    <h1>Discord OAuth2 Hatası</h1>
                    <p>Hata: ${error}</p>
                    <p>Açıklama: ${errorDescription}</p>
                    <p>Lütfen tekrar deneyin: <a href="/auth/discord">Discord ile Giriş Yap</a></p>
                </body>
            </html>
        `);
    }

    if (!code) {
        console.error('Callback: Discord OAuth2 kodu alınmadı.', req.query);
        console.error('Callback: Request headers:', req.headers);
        console.error('Callback: Request cookies:', req.cookies);
        return res.status(400).send(`
            <html>
                <body>
                    <h1>Discord OAuth2 kodu alınmadı</h1>
                    <p>Lütfen aşağıdakileri kontrol edin:</p>
                    <ul>
                        <li>Discord Developer Portal'da Redirect URI'nin <code>https://dbrpbot.onrender.com/auth/discord/callback</code> olarak ayarlandığından emin olun</li>
                        <li>Client ID ve Client Secret'ın doğru olduğundan emin olun</li>
                        <li>Tarayıcınızın çerezlerini temizleyin ve tekrar deneyin</li>
                    </ul>
                    <p>Hata detayları:</p>
                    <pre>${JSON.stringify({
                        query: req.query,
                        headers: req.headers,
                        cookies: req.cookies,
                        url: req.url,
                        originalUrl: req.originalUrl
                    }, null, 2)}</pre>
                    <p>Lütfen tekrar deneyin: <a href="/auth/discord">Discord ile Giriş Yap</a></p>
                </body>
            </html>
        `);
    }

    console.log('Callback: Received code.');

    try {
        // Token əldə et
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: 'https://dbrpbot.onrender.com/auth/discord/callback', // Redirect URI-ni tam callback URL-i edirik
                scope: 'identify+guilds', // Scope-u da uyğunlaşdırırıq
            }),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        const tokenData = await tokenResponse.json();
        if (tokenData.error) {
            console.error(`Callback: Token xətası: ${tokenData.error}`);
            throw new Error(`Token xətası: ${tokenData.error}`);
        }
        console.log('Callback: Token uğurla alındı.');

        // İstifadəçi məlumatlarını əldə et
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: {
                authorization: `${tokenData.token_type} ${tokenData.access_token}`,
            },
        });

        const userData = await userResponse.json();
        if (!userData.id) {
            console.error('Callback: İstifadəçi məlumatları alınmadı və ya ID yoxdur.');
            throw new Error('İstifadəçi məlumatları alına bilmədi');
        }
        console.log('Callback: İstifadəçi məlumatları uğurla alındı:', userData);

        // Sessiyanı yenilə
        req.session.discordId = userData.id;
        req.session.username = userData.username;
        console.log('Callback: Before session save, sessiya obyekti:', req.session);

        // Sessiyanı yadda saxla və yalnız yadda saxlandıqdan sonra davam et
        req.session.save(async (err) => {
            if (err) {
                console.error('Callback: Session save error:', err);
                return res.status(500).send('Session yadda saxlanılarkən xəta baş verdi.');
            }

            console.log('Callback: Session SAVED successfully. Final session state:', req.session);
            console.log('Callback: Preparing for database operations and redirect...');
            
            // ConnectedUser cədvəlinə əlavə et
            try {
                 await ConnectedUser.findOrCreate({
                     where: { discordId: userData.id },
                     defaults: { username: userData.username }
                 });
                 console.log('Callback: ConnectedUser findOrCreate successful.');

                 // Admin yoxlaması
                 if (userData.id === process.env.ADMIN_DISCORD_ID) {
                     await Admin.findOrCreate({
                         where: { discordId: userData.id }
                     });
                     console.log('Callback: Admin girişi uğurlu.');
                 } else {
                     console.log('Callback: Normal istifadəçi girişi.');
                 }

                 // Yönləndirməni session.save callback'in sonuna köçürürük
                 console.log('Callback: Redirecting to final destination...');
                 res.redirect(userData.id === process.env.ADMIN_DISCORD_ID ? '/admin.html' : '/');

            } catch (dbError) {
                console.error('Callback: Database operation error after session save:', dbError);
                return res.status(500).send('Verilənlər bazası əməliyyatı zamanı xəta.');
            }
        });

    } catch (error) {
        console.error('Callback: Ümumi Discord giriş xətası:', error);
        res.status(500).send('Giriş xətası baş verdi.');
    }
});

// Admin yoxlaması üçün middleware
const isAdmin = async (req, res, next) => {
    try {
        console.log('-- isAdmin Middleware Start --');
        console.log('isAdmin: Session object:', req.session);
        console.log('isAdmin: Session ID:', req.sessionID);
        console.log('isAdmin: Discord ID:', req.session && req.session.discordId ? req.session.discordId : 'undefined or session null');
        console.log('isAdmin: process.env.ADMIN_DISCORD_ID:', process.env.ADMIN_DISCORD_ID);

        // Sessiyanı yoxla
        if (!req.session || !req.session.discordId) {
            console.log('isAdmin: Sessiya tapılmadı və ya discordId yoxdur. Discord girişinə yönləndirilir.');
            // Buraya return əlavə edirik ki, funksiya dayansın
            console.log('-- isAdmin Middleware End (Redirecting) --');
            return res.redirect('/auth/discord');
        }

        console.log('isAdmin: Sessiyada Discord ID tapıldı:', req.session.discordId);

        // Admin cədvəlində yoxla
        const admin = await Admin.findOne({ where: { discordId: req.session.discordId } });
        if (admin) {
            console.log('isAdmin: Admin cədvəlində tapıldı:', admin.discordId);
            console.log('-- isAdmin Middleware End (Admin Found) --');
            return next(); // Admin-dirsə, davam et
        }

        // Admin cədvəlində yoxdursa, .env faylında yoxla
        if (req.session.discordId === process.env.ADMIN_DISCORD_ID) {
            console.log('isAdmin: Admin .env faylında tapıldı, cədvələ əlavə edilir.');
            // Admin cədvəlinə əlavə et
            await Admin.create({ discordId: req.session.discordId });
            console.log('isAdmin: Admin cədvələ əlavə edildi.');
            console.log('-- isAdmin Middleware End (Admin Added) --');
            return next(); // Əlavə edildikdən sonra davam et
        }

        console.log('isAdmin: Admin tapılmadı. Ana səhifəyə yönləndirilir.');
        console.log('-- isAdmin Middleware End (Not Admin) --');
        res.redirect('/'); // Admin deyilsə, ana səhifəyə yönləndir

    } catch (error) {
        console.error('isAdmin middleware xətası:', error);
        console.log('-- isAdmin Middleware End (Error) --');
        res.status(500).send('Server xətası baş verdi.');
    }
};

// Admin səhifəsinə giriş
app.get('/admin.html', isAdmin, (req, res) => {
    const adminPath = path.join(__dirname, 'public', 'admin.html');
    if (fs.existsSync(adminPath)) {
        res.sendFile(adminPath);
    } else {
        res.status(404).send('admin.html tapılmadı');
    }
});

// Admin API endpointləri
app.use('/api/admin', isAdmin);

// Admin yoxlama endpointi
app.get('/api/admin/check', isAdmin, (req, res) => {
    res.json({ success: true });
});

// Get all connected users
app.get('/api/admin/connected-users', ensureAuthenticated, async (req, res) => {
    try {
        const users = await ConnectedUser.findAll();
        res.json(users);
    } catch (error) {
        console.error('Bağlı istifadəçiləri gətirmə xətası:', error);
        res.status(500).json({ error: 'Daxili Server Xətası' });
    }
});

// Search connected users by Discord ID
app.get('/api/admin/connected-users/search', ensureAuthenticated, async (req, res) => {
    const { discordId } = req.query;
    if (!discordId) {
        return res.status(400).json({ error: 'Discord ID tələb olunur.' });
    }

    try {
        const user = await ConnectedUser.findOne({
            where: {
                discordId: discordId
            }
        });
        res.json(user ? [user] : []);
    } catch (error) {
        console.error(`Discord ID ${discordId} ilə istifadəçi axtarışı xətası:`, error);
        res.status(500).json({ error: 'Daxili Server Xətası' });
    }
});

// API endpoint to get list of servers (guilds)
app.get('/api/servers', isAdmin, (req, res) => {
    console.log('[/api/servers] endpointine istek geldi.');
    // Bot client'ına app.locals üzerinden erişilir
    if (!app.locals.discordClient) {
        console.error('Discord client instance app.locals-da tapılmadı.');
        return res.status(500).json({ error: 'Bot client instance mövcud deyil.' });
    }

    const servers = app.locals.discordClient.guilds.cache.map(guild => ({
        id: guild.id,
        name: guild.name
    }));

    res.json(servers);
});

// Admin panel route
app.get('/admin', isAdmin, (req, res) => {
    // ... existing code ...
});

// Bot client instansını təyin etmək üçün metod
app.setDiscordClient = (client) => {
    app.locals.discordClient = client;
    console.log('Discord client instance app.locals-a təyin edildi.');
};

app.listen(port, () => {
    console.log(`Server ${port} portunda işləyir`);
});

module.exports = { app, sequelize, discordClient }; 
