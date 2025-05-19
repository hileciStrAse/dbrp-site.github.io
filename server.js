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
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const bcrypt = require('bcrypt');
require('dotenv').config();
const { Op } = require('sequelize');

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
const Activity = require('./models/Activity')(sequelize, DataTypes);

// ConnectedUser modelini yenilə: parol və is_verified sahələri əlavə et
const UpdatedConnectedUser = sequelize.define('ConnectedUser', {
    discordId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    username: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    connectedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
    password: {
        type: DataTypes.STRING, // Hashed parol üçün
        allowNull: true, // Hələ parol qoymayan Discord istifadəçiləri ola bilər
    },
    is_verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false, // Başlanğıcda doğrulanmamış
    },
}, { timestamps: true });

// Model təyinatını dəyişdir
UpdatedConnectedUser.init(UpdatedConnectedUser.getAttributes(), { sequelize, modelName: 'ConnectedUser' });

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

// Yeni Qeydiyyatı Başlatma Endpointi (FIN kod və Şifrə ilə)
app.post('/api/register/initiate', async (req, res) => {
    const { finCode, password } = req.body;

    if (!finCode || !password) {
        return res.status(400).json({ success: false, message: 'FIN Kod və şifrə tələb olunur.' });
    }

    try {
        // FIN kod ilə istifadəçi ID-sini və digər məlumatları API-dən tapırıq
        const finDataUrl = 'https://dbrp.onrender.com/bot_api/users/vesiqe'; // Verilərin olduğu URL

        const response = await fetch(finDataUrl);

        if (!response.ok) {
            console.error(`FIN verilənləri URL-dən çəkilərkən xəta: ${response.status} ${response.statusText}`);
            return res.status(response.status).json({ success: false, message: `Verilənlər çəkilərkən xəta: ${response.statusText}` });
        }

        const users = await response.json();

        if (!Array.isArray(users)) {
             console.error('FIN verilərlərindən gözlənilməyən format:', users);
             return res.status(500).json({ success: false, message: 'Xarici API-dən gözlənilməyən məlumat formatı.' });
        }

        // FIN koda görə istifadəçini tapın
        const apiUser = users.find(user => user.fin_kod && user.fin_kod.toUpperCase() === finCode.toUpperCase());

        if (!apiUser) {
             return res.status(404).json({ success: false, message: 'Bu FIN kod ilə bağlı istifadəçi tapılmadı.' });
        }

        // Bizim verilənlər bazamızda bu discordId ilə istifadəçi artıq qeydiyyatdan keçibmi yoxla
        const existingUser = await UpdatedConnectedUser.findOne({ where: { discordId: apiUser.id } });

        if (existingUser && existingUser.password) {
             // Əgər artıq qeydiyyatdan keçibsə və şifrəsi varsa
             return res.status(409).json({ success: false, message: 'Bu FIN kod ilə bağlı istifadəçi artıq qeydiyyatdan keçib.' });
        }

        // Şifrəni həşləyin və sessiyada müvəqqəti saxlayın
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Sessiyaya qeydiyyat məlumatlarını müvəqqəti yazırıq
        req.session.regFinCode = finCode;
        req.session.regHashedPassword = hashedPassword;
        req.session.regApiUser = apiUser; // API-dən gələn məlumatlar
        
        req.session.save((err) => {
            if (err) {
                console.error('Qeydiyyat başlama sessiya yadda saxlama xətası:', err);
                return res.status(500).json({ success: false, message: 'Server xətası baş verdi.' });
            }
            console.log('Qeydiyyat məlumatları sessiyaya yazıldı, Discord OAuth-a yönləndirilir.');
            // Discord OAuth2 səhifəsinə yönləndir (state parametri ilə qeydiyyat olduğunu bildiririk)
            const params = {
                client_id: process.env.DISCORD_CLIENT_ID,
                response_type: 'code',
                redirect_uri: 'https://dbrpbot.onrender.com/auth/discord/callback',
                scope: 'identify guilds',
                prompt: 'consent',
                state: 'register' // Qeydiyyat axını olduğunu bildirən state
            };
            const discordAuthUrl = 'https://discord.com/oauth2/authorize?' + new URLSearchParams(params).toString();
            console.log('Yönləndirilən URL:', discordAuthUrl);
            res.json({ success: true, redirectUrl: discordAuthUrl }); // Redirect URL-i client-ə göndəririk
        });

    } catch (error) {
        console.error('Qeydiyyat başlama zamanı server xətası:', error);
        // Xarici API-dən gələn xəta mesajını istifadəçiyə göstərin
        if (error.message.includes('Verilənlər çəkilərken xəta') || error.message.includes('Xarici API-dən gözlənilməyən məlumat formatı')) {
             res.status(500).json({ success: false, message: 'Verilənlər mənbəyi ilə əlaqə qurularkən xəta baş verdi.' });
        } else {
             res.status(500).json({ success: false, message: 'Qeydiyyat başlama zamanı server xətası baş verdi.' });
        }
    }
});

// Mövcud Qeydiyyat Endpointini dəyişdiririk (artıq Discord callback tərəfindən çağırılacaq)
// app.post('/api/register', ...)

// Discord OAuth2 callback endpointini yenilə
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
    const state = req.query.state; // State parametrini alırıq

    if (error) {
        console.error('Callback: Discord OAuth2 error:', error, errorDescription);
        return res.status(400).send(`
            <html>
                <body>
                    <h1>Discord OAuth2 Hatası</h1>
                    <p>Hata: ${error}</p>
                    <p>Açıklama: ${errorDescription}</p>
                    <p>Lütfen tekrar deneyin: <a href="/auth/discord/callback">Discord ile Giriş Yap</a></p>
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
                    <p>Lütfen tekrar deneyin: <a href="/auth/discord/callback">Discord ile Giriş Yap</a></p>
                </body>
            </html>
        `);
    }

    console.log('Callback: Received code.');
    console.log('Callback: Received state:', state);

    try {
        // Token əldə et
        console.log('Callback: Token endpointinə sorğu göndərilir...');
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: 'https://dbrpbot.onrender.com/auth/discord/callback',
                scope: 'identify guilds',
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
        req.session.username = userData.username; // Discord-dan gələn username
        // Digər sessiya məlumatları da burada yenilənə bilər
        console.log('Callback: Before session save, sessiya obyekti:', req.session);

        // Sessiyanı yadda saxla
        req.session.save(async (err) => {
            if (err) {
                console.error('Callback: Session save error:', err);
                return res.status(500).send('Session yadda saxlanılarkən xəta baş verdi.');
            }

            console.log('Callback: Session SAVED successfully. Final session state:', req.session);

            // Qeydiyyat axınıdırsa
            if (state === 'register' && req.session.regFinCode && req.session.regHashedPassword && req.session.regApiUser) {
                console.log('Callback: Qeydiyyat axını aşkar edildi.');
                const { regFinCode, regHashedPassword, regApiUser } = req.session;

                // API-dən gələn istifadəçi məlumatları ilə Discord-dan gələn ID-ni yoxla
                if (regApiUser.id === userData.id) {
                    console.log('Callback: API-dən gələn Discord ID ilə Discord OAuth ID uyğun gəlir.');
                    try {
                        // İstifadəçi artıq bizdə qeydiyyatdan keçibmi? (Discord ID-yə görə)
                        const existingUser = await UpdatedConnectedUser.findOne({ where: { discordId: userData.id } });

                        if (existingUser) {
                             // Əgər varsa, amma şifrəsi yoxdursa (əvvəl Discord girişi edibsə), yenilə
                             if (!existingUser.password) {
                                 console.log('Callback: Mövcud istifadəçi tapıldı, şifrə əlavə edilir.');
                                 existingUser.password = regHashedPassword;
                                 // Discord-dan gələn son istifadəçi adını yeniləyə bilərik
                                 existingUser.username = userData.username;
                                 existingUser.is_verified = true; // Doğrulandı
                                 await existingUser.save();
                                 console.log('Callback: Mövcud istifadəçi uğurla yeniləndi.');
                                 // Qeydiyyat məlumatlarını sessiyadan sil
                                 delete req.session.regFinCode;
                                 delete req.session.regHashedPassword;
                                 delete req.session.regApiUser;
                                 req.session.save(() => {
                                     res.redirect('/dashboard.html?registered=true'); // Ana səhifəyə yönləndir
                                 });
                                 
                             } else {
                                 // Artıq həm Discord ilə, həm də şifrə ilə qeydiyyatdan keçib
                                 console.log('Callback: İstifadəçi artıq tam qeydiyyatlıdır.');
                                  // Qeydiyyat məlumatlarını sessiyadan sil
                                 delete req.session.regFinCode;
                                 delete req.session.regHashedPassword;
                                 delete req.session.regApiUser;
                                 req.session.save(() => {
                                     res.redirect('/dashboard.html?already_registered=true'); // Giriş səhifəsinə yönləndir
                                 });
                            }
                        } else {
                            // Yeni istifadəçi yaradın
                            console.log('Callback: Yeni istifadəçi yaradılır.');
                            await UpdatedConnectedUser.create({
                                discordId: userData.id,
                                username: userData.username,
                                password: regHashedPassword,
                                is_verified: true,
                                connectedAt: new Date()
                            });
                            console.log('Callback: Yeni istifadəçi uğurla yaradıldı.');
                            // Qeydiyyat məlumatlarını sessiyadan sil
                            delete req.session.regFinCode;
                            delete req.session.regHashedPassword;
                            delete req.session.regApiUser;
                            req.session.save(() => {
                                res.redirect('/dashboard.html?registered=true'); // Ana səhifəyə yönləndir
                            });
                        }

                    } catch (dbError) {
                        console.error('Callback: Qeydiyyat zamanı verilənlər bazası xətası:', dbError);
                        // Qeydiyyat məlumatlarını sessiyadan sil
                         delete req.session.regFinCode;
                         delete req.session.regHashedPassword;
                         delete req.session.regApiUser;
                         req.session.save(() => {
                             res.status(500).send('Qeydiyyat zamanı verilənlər bazası xətası.');
                         });
                    }
                } else {
                     // API-dən gələn Discord ID ilə Discord OAuth ID uyğun gəlmir
                     console.error('Callback: API-dən gələn Discord ID (%s) ilə Discord OAuth ID (%s) uyğun gəlmir.', regApiUser.id, userData.id);
                      // Qeydiyyat məlumatlarını sessiyadan sil
                     delete req.session.regFinCode;
                     delete req.session.regHashedPassword;
                     delete req.session.regApiUser;
                     req.session.save(() => {
                          res.status(400).send('FIN kodunuzla əlaqəli Discord hesabı fərqlidir. Zəhmət olmasa, doğru Discord hesabı ilə giriş edin.');
                     });
                }
            } else {
                 // Normal Discord girişi axınıdır
                 console.log('Callback: Normal Discord girişi axını aşkar edildi.');
                 // Buradakı mövcud Discord giriş məntiqi saxlanılır
                 // ... Buraya Discord girişi zamanı istifadəçi yaratma/yeniləmə məntiqi gələcək (əgər fərqli bir prosesdirsə) ...
                 try {
                     // Discord girişi zamanı istifadəçini DB-də tap və ya yarat
                     const [user, created] = await UpdatedConnectedUser.findOrCreate({
                          where: { discordId: userData.id },
                          defaults: { username: userData.username, is_verified: false } // Discord girişi ilə ilkin olaraq verified deyil
                     });
                     console.log(`Callback: Discord girişi. İstifadəçi ${created ? 'yaradıldı' : 'tapıldı'}:`, user.discordId);

                     // Əgər istifadəçi FIN kod ilə qeydiyyatdan keçibsə (verified == true), onu admin paneli və ya ana səhifəyə yönləndir
                     // Əgər Discord girişi ilə gəlibsə və hələ verified deyilsə, onu FIN kod qeydiyyatı səhifəsinə yönləndirə bilərik?

                     // Sadəlik üçün: Əgər normal Discord girişi edibsə və admin ID-dirsə admin panelə, yoxsa ana səhifəyə yönləndir
                     // Qeydiyyat axını yoxdursa və Discord ID admin ID-dirsə admin panelə yönləndir
                     if (userData.id === process.env.ADMIN_DISCORD_ID) {
                         res.redirect('/admin.html');
                     } else {
                         // Normal istifadəçini ana səhifəyə yönləndir
                         res.redirect('/');
                     }

                 } catch (dbError) {
                     console.error('Callback: Discord girişi zamanı verilənlər bazası xətası:', dbError);
                     res.status(500).send('Giriş zamanı verilənlər bazası xətası.');
                 }
            }
        });

    } catch (error) {
        console.error('Callback: Ümumi Discord giriş xətası:', error);
        // Qeydiyyat məlumatlarını sessiyadan sil (xəta zamanı) - təhlükəsizlik üçün
        delete req.session.regFinCode;
        delete req.session.regHashedPassword;
        delete req.session.regApiUser;
        req.session.save(() => {
             res.status(500).send('Giriş/Qeydiyyat zamanı xəta baş verdi.');
        });
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

        // Sessiyanı və Discord ID-ni yoxla
        if (!req.session || !req.session.discordId) {
            console.log('isAdmin: Sessiya tapılmadı və ya discordId yoxdur.');
            console.log('isAdmin: Yönləndirilir: /auth/discord/callback');
            console.log('-- isAdmin Middleware End (Redirecting) --');
            return res.redirect('/auth/discord/callback'); // Redirect if no session or no discordId
        }

        console.log('isAdmin: Sessiyada tapılan Discord ID:', req.session.discordId);
        console.log('isAdmin: Müqayisə edilir: Session ID == ADMIN_DISCORD_ID');

        // Sessiondaki Discord ID'nin .env'deki ADMIN_DISCORD_ID ile tam eşleştiğini yoxla
        if (req.session.discordId === process.env.ADMIN_DISCORD_ID) {
            console.log('isAdmin: Discord ID ADMIN_DISCORD_ID ilə uyğun gəlir. Admin girişi icazəlidir.');
            console.log('-- isAdmin Middleware End (Admin Match) --');
            return next(); // If matches, proceed
        } else {
            console.log('isAdmin: Discord ID ADMIN_DISCORD_ID ilə uyğun gəlmir.');
            console.log('isAdmin: Giriş qadağandır. Status 403');
            console.log('-- isAdmin Middleware End (No Admin Match) --');
            // If not matches, send Forbidden
            return res.status(403).send('Bu səhifəyə giriş icazəniz yoxdur.');
            // res.redirect('/'); // Və ya ana səhifəyə yönləndir
        }

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
        const users = await UpdatedConnectedUser.findAll();
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
        const user = await UpdatedConnectedUser.findOne({
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
app.get('/api/servers', isAdmin, async (req, res) => {
    console.log('[/api/servers] endpointine istek geldi.');

    const pythonBotApiUrl = process.env.PYTHON_BOT_API_URL || 'http://dbrp.onready.com/bot_api/servers'; // Python bot API ünvanı

    try {
        console.log(`[/api/servers] Python bot API-sinə sorğu göndərilir: ${pythonBotApiUrl}`);
        const response = await fetch(pythonBotApiUrl);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[/api/servers] Python bot API xətası: HTTP status ${response.status}, Detallar: ${errorText}`);
            return res.status(response.status).json({ error: `Python bot API xətası: ${response.status}`, details: errorText });
        }

        const servers = await response.json();
        console.log(`[/api/servers] Python bot API-dən ${servers.length} server məlumatı alındı.`);
        res.json(servers); // Client-ə server siyahısını göndər

    } catch (error) {
        console.error('[/api/servers] Python bot API-sinə sorğu göndərilərkən xəta:', error);
        res.status(500).json({ error: 'Server siyahısını əldə edilərkən xəta baş verdi.', details: error.message });
    }
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

// FIN kod ilə istifadəçi tapmaq endpointi
app.get('/api/user/fin/:finCode', async (req, res) => {
    const finCode = req.params.finCode.toUpperCase();
    const finDataUrl = 'https://dbrp.onrender.com/bot_api/users/vesiqe'; // Verilərin olduğu URL

    try {
        // Bütün istifadəçi məlumatlarını URL-dən çəkin
        const response = await fetch(finDataUrl);

        if (!response.ok) {
            console.error(`FIN verilənləri URL-dən çəkilərkən xəta: ${response.status} ${response.statusText}`);
            return res.status(response.status).json({ success: false, message: `Verilənlər çəkilərkən xəta: ${response.statusText}` });
        }

        const users = await response.json();

        if (!Array.isArray(users)) {
             console.error('FIN verilərlərindən gözlənilməyən format:', users);
             return res.status(500).json({ success: false, message: 'Xarici API-dən gözlənilməyən məlumat formatı.' });
        }

        // Çəkilmiş siyahıdan FIN koda görə istifadəçini tapın
        const foundUser = users.find(user => user.fin_kod && user.fin_kod.toUpperCase() === finCode);

        if (!foundUser) {
             // API-də tapılmadı (siyahıda yoxdur)
             return res.status(404).json({ success: false, message: 'Bu FIN kod ilə bağlı istifadəçi tapılmadı.' });
        }

        // Bizim verilənlər bazamızda bu discordId ilə istifadəçi var mı yoxla
        const connectedUser = await UpdatedConnectedUser.findOne({ where: { discordId: foundUser.id } });

        if (!connectedUser) {
             // API siyahısında tapıldı, amma bizim DB-də yoxdursa, bu o deməkdir ki, saytda qeydiyyatdan keçməyib
             return res.status(404).json({ success: false, message: 'Bu FIN kod ilə bağlı istifadəçi tapıldı, lakin saytda qeydiyyatdan keçməyib.' });
        }

        // Hər iki yerdə tapıldı, Discord ID-ni qaytar
        res.json({ success: true, discordId: foundUser.id });

    } catch (error) {
        console.error('FIN kod ilə istifadəçi tapılarkən server xətası:', error);
        res.status(500).json({ success: false, message: 'Server xətası baş verdi.' });
    }
});

// FIN kod və Discord ID uyğunluğunu yoxlamaq endpointi (qeydiyyat üçün)
app.post('/api/verify/fin', async (req, res) => {
    const { finCode, discordId } = req.body;
    const finDataUrl = 'https://dbrp.onrender.com/bot_api/users/vesiqe'; // Verilərin olduğu URL

    if (!finCode || !discordId) {
        return res.status(400).json({ success: false, message: 'FIN kod və Discord ID təmin edilməlidir.' });
    }

    try {
        // Bütün istifadəçi məlumatlarını URL-dən çəkin
        const response = await fetch(finDataUrl);

        if (!response.ok) {
            console.error(`FIN verilənləri URL-dən çəkilərkən xəta: ${response.status} ${response.statusText}`);
            return res.status(response.status).json({ success: false, message: `Verilənlər çəkilərkən xəta: ${response.statusText}` });
        }

        const users = await response.json();
        
        if (!Array.isArray(users)) {
             console.error('FIN verilərlərindən gözlənilməyən format:', users);
             return res.status(500).json({ success: false, message: 'Xarici API-dən gözlənilməyən məlumat formatı.' });
        }

        // Çəkilmiş siyahıdan FIN kod və Discord ID uyğunluğunu yoxlayın
        const isMatch = users.some(user => 
            user.fin_kod && user.fin_kod.toUpperCase() === finCode.toUpperCase() && 
            user.id && user.id === discordId
        );

        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'FIN kod və Discord ID uyğun deyil və ya tapılmadı.' });
        }

        res.json({ success: true, isValid: isMatch });

    } catch (error) {
        console.error('FIN kod doğrulama zamanı server xətası:', error);
        res.status(500).json({ success: false, message: 'Server xətası baş verdi.' });
    }
});

// İstifadəçi profili endpointi
app.get('/api/user/profile', ensureAuthenticated, async (req, res) => {
    try {
        const response = await fetch('https://discord.com/api/users/@me', {
            headers: {
                authorization: `Bearer ${req.session.accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Discord API xətası');
        }
        
        const userData = await response.json();
        res.json(userData);
    } catch (error) {
        console.error('Profil məlumatları alınarkən xəta:', error);
        res.status(500).json({ error: 'Server xətası' });
    }
});

// Hesabdan çıxış endpointi
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Hesabdan çıxış zamanı xəta:', err);
            return res.status(500).json({ error: 'Server xətası' });
        }
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

app.listen(port, () => {
    console.log(`Server ${port} portunda işləyir`);
});

module.exports = { app, sequelize, discordClient }; 
