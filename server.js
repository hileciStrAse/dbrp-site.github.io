const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const exphbs = require('express-handlebars');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const nodemailer = require('nodemailer');
require('dotenv').config();
const MongoStore = require('connect-mongo');

const app = express();

// Handlebars konfiqurasiyası
app.engine('hbs', exphbs.engine({
    extname: '.hbs',
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, 'views/layouts'),
    partialsDir: path.join(__dirname, 'views/partials'),
    helpers: {
        eq: function (v1, v2) {
            return v1 === v2;
        }
    }
}));
app.set('view engine', 'hbs');

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session konfiqurasiyası
app.use(session({
    secret: process.env.SESSION_SECRET || 'discord-bot-secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: { maxAge: 60000 * 60 * 24 } // 24 saat
}));

// Passport konfiqurasiyası
app.use(passport.initialize());
app.use(passport.session());


// Discord OAuth2 strategiyası
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.NODE_ENV === 'production' 
        ? process.env.DISCORD_REDIRECT_URI 
        : process.env.LOCAL_REDIRECT_URI || 'http://localhost:3000/auth/discord/callback',
    scope: ['identify', 'guilds']
}, async function(accessToken, refreshToken, profile, done) {
    try {
        let user = await User.findOneAndUpdate(
            { discordId: profile.id },
            {
                username: profile.username,
                discriminator: profile.discriminator,
                avatar: profile.avatar,
                guilds: profile.guilds,
                lastLogin: Date.now()
            },
            { upsert: true, new: true }
        );
        return done(null, user);
    } catch (err) {
        console.error('Error in passport strategy:', err);
        return done(err);
    }
}));

// Serialization
passport.serializeUser(function(user, done) {
    done(null, user);
});

passport.deserializeUser(function(obj, done) {
    done(null, obj);
});

// Discord OAuth2 routeları
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', 
    passport.authenticate('discord', { 
        failureRedirect: '/login' 
    }), 
    function(req, res) {
        res.redirect('/dashboard'); // Uğurlu giriş zamanı dashboard-a yönləndir
    }
);

// Giriş yoxlaması üçün middleware
function checkAuth(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect('/login');
}

// MongoDB qoşulması və ilkin əmr yüklənməsi startServer funksiyasına köçürüldü.

// Command modeli
const commandSchema = new mongoose.Schema({
    name: String,
    description: String,
    usage: String,
    category: String,
    permissions: String  // İcazələr üçün yeni sahə əlavə edildi
});

const Command = mongoose.model('Command', commandSchema);

// Middleware - istifadəçi giriş etmişmi?
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

// Bot status və uptime (simulyasiya)
const getBotStatus = () => {
    return {
        status: 'Online',
        uptime: '99.9%',
        name: 'DBRP Bot',
        version: '1.0.0',
        servers: 120,
        users: 5000
    };
};

// Routes
app.get('/', (req, res) => {
    const botStatus = getBotStatus();
    res.render('home', {
        title: 'Ana Səhifə',
        botStatus: botStatus,
        user: req.user
    });
});

app.get('/commands', async (req, res) => {
    try {
        const commands = await Command.find({}).sort({ category: 1, name: 1 }).lean();
        const categories = [...new Set(commands.map(cmd => cmd.category))].sort();
        
        console.log(`[Route /commands] Fetched ${commands.length} commands.`);
        if (commands.length > 0) {
            console.log("[Route /commands] First command example:", commands[0].name);
        }

        res.render('commands', {
            title: 'Bot Əmrləri',
            commands: commands,
            categories: categories,
            user: req.user
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server xətası');
    }
});

app.get('/login', (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/dashboard');
    }
    res.render('login', {
        title: 'Giriş'
    });
});

app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback', 
    passport.authenticate('discord', { 
        failureRedirect: '/login'
    }), 
    (req, res) => {
        res.redirect('/dashboard');
    }
);

app.get('/dashboard', checkAuth, (req, res) => {
    res.render('dashboard', {
        title: 'İdarə Paneli',
        user: req.user
    });
});

app.get('/contact', (req, res) => {
    res.render('contact', {
        title: 'Əlaqə',
        user: req.user
    });
});

app.get('/terms', (req, res) => {
    res.render('terms', {
        title: 'İstifadə Şərtləri',
        user: req.user
    });
});

app.get('/privacy', (req, res) => {
    res.render('privacy', {
        title: 'Məxfilik Siyasəti',
        user: req.user
    });
});

app.post('/contact', async (req, res) => {
    const { name, email, message } = req.body;
    
    // Burada nodemailer ilə mail göndərmə əlavə edilə bilər
    // Sadəlik üçün simulyasiya edirik
    
    res.render('contact', {
        title: 'Əlaqə',
        user: req.user,
        success: 'Mesajınız uğurla göndərildi!'
    });
});

app.get('/logout', (req, res) => {
    req.logout(function(err) {
        if (err) { return next(err); }
        res.redirect('/');
    });
});

// Test üçün bəzi əmrlər əlavə edək
const seedCommands = async () => {
    try {
        // Əvvəlcə bütün əmrləri sil
        await Command.deleteMany({});
        console.log('Bütün əmrlər silindi, yenidən əlavə ediləcək');
        // Yoxla
        const count = await Command.countDocuments();
        if (count === 0) {
            // Təqdim edilən əmrlər strukturu
            const commandsData = {
                "AdminEconomy": { 
                    "addbalans": { 
                        "description": "İstifadəçinin balansına pul əlavə edir (Yalnız Sahib istifadə edə bilər)." 
                    }, 
                    "cixartbalans": { 
                        "description": "İstifadəçinin balansından pul çıxarır (Yalnız Sahib istifadə edə bilər)." 
                    }, 
                    "maas_bildirim_kanali_qur": { 
                        "description": "Maaş bildirişlərinin göndəriləcəyi kanalı seçir (Yalnız Sahib istifadə edə bilər)." 
                    }, 
                    "maaslar": { 
                        "description": "Rol maaşlarını göstərir və idarə edir (Prezident və ya Sahib istifadə edə bilər)." 
                    }, 
                    "resetbalans": { 
                        "description": "İstifadəçinin balansını sıfırlayır (Yalnız Sahib istifadə edə bilər)." 
                    }, 
                    "setbalans": { 
                        "description": "İstifadəçinin balansını əl ilə təyin edir (Yalnız Sahib istifadə edə bilər)." 
                    }, 
                    "setvip": { 
                        "description": "İstifadəçinin VIP statusunu dəyişir (Yalnız Sahib istifadə edə bilər)." 
                    }, 
                    "vergi_deyis": { 
                        "description": "Marketdəki satış vergisini dəyişir (Prezident və ya Sahib istifadə edə bilər)." 
                    }, 
                    "xezine_add": { 
                        "description": "Şəxsi balansdan dövlət xəzinəsinə pul köçürür (Prezident və ya Sahib istifadə edə bilər)." 
                    }, 
                    "xezine_balans": { 
                        "description": "Dövlət xəzinəsindəki pulu göstərir (Prezident və ya Sahib istifadə edə bilər)." 
                    }, 
                    "xezine_gotur": { 
                        "description": "Dövlət xəzinəsindən şəxsi balansa pul çəkir (Prezident və ya Sahib istifadə edə bilər)." 
                    } 
                }, 
                "Business": { 
                    "biznesac": { 
                        "description": "Yeni bir biznes açır." 
                    }, 
                    "biznesim": { 
                        "description": "Sahib olduğunuz biznes haqqında məlumat verir." 
                    }, 
                    "biznesinvest": { 
                        "description": "Başqasının biznesinə investisiya edir." 
                    }, 
                    "biznessil": { 
                        "description": "Sahib olduğunuz biznesi silir." 
                    }, 
                    "qiymet_qoy": { 
                        "description": "Biznesinizdəki məhsulun qiymətini təyin edir." 
                    }, 
                    "topdan_al": { 
                        "description": "Biznes üçün topdan məhsul alır." 
                    } 
                }, 
                "DailyGift": { 
                    "gundelik_hediyye": { 
                        "description": "Gündəlik pulsuz hədiyyə alın." 
                    }, 
                    "missiyalar": { 
                        "description": "Aktiv missiyalarınızı göstərir." 
                    } 
                }, 
                "Economy": { 
                    "balans": { 
                        "description": "Özünüzün və ya başqasının balansını göstərir." 
                    }, 
                    "gonder": { 
                        "description": "Başqa istifadəçiyə pul köçürür." 
                    }, 
                    "kart": { 
                        "description": "Bank kartınızı göstərir." 
                    }, 
                    "maasal": { 
                        "description": "Gündəlik maaşınızı alın." 
                    } 
                }, 
                "Gallery": { 
                    "masinsat": { 
                        "description": "Qarajınızdakı maşını satmaq üçün təklif göndərir." 
                    }, 
                    "mulkiyyet": { 
                        "description": "Sahib olduğunuz ev və maşınları göstərir." 
                    }, 
                    "qaraj": { 
                        "description": "Öz və ya başqasının qarajını göstərir." 
                    }, 
                    "qarajitemizle": { 
                        "description": "İstifadəçinin qarajını təmizləyir (Yalnız Sahib istifadə edə bilər)." 
                    } 
                }, 
                "Government": { 
                    "dovlet_muessiseleri": { 
                        "description": "Dövlət müəssisələrinin siyahısını göstərir." 
                    }, 
                    "dovlet_muessisesi_qur": { 
                        "description": "Yeni dövlət müəssisəsi yaradır (Yalnız Prezident istifadə edə bilər)." 
                    } 
                }, 
                "Makler": { 
                    "ev_tikmeye_basla": { 
                        "description": "Ev tikintisinə başlayır." 
                    }, 
                    "fehle_tut": { 
                        "description": "Tikinti üçün fəhlə işə götürür." 
                    }, 
                    "fehlelerim": { 
                        "description": "İşə aldığınız fəhlələri və enerjilərini göstərir." 
                    }, 
                    "material_al": { 
                        "description": "Tikinti materialı alır." 
                    }, 
                    "materiallarim": { 
                        "description": "Sahib olduğunuz tikinti materiallarını göstərir." 
                    }, 
                    "tikinti_status": { 
                        "description": "Davam edən tikintinin vəziyyətini göstərir." 
                    }, 
                    "tikintiden_fehle_cixart": { 
                        "description": "Tikintidən fəhləni çıxarır." 
                    }, 
                    "tikintiye_fehle_elave_et": { 
                        "description": "Tikintiyə fəhlə əlavə edir." 
                    } 
                }, 
                "Marketplace": { 
                    "esyaver": { 
                        "description": "Əşyanızı başqasına verir." 
                    }, 
                    "inventar": { 
                        "description": "İnventarınızı şəkil şəklində göstərir." 
                    }, 
                    "marketgoster": { 
                        "description": "Marketdə satılan məhsulları göstərir." 
                    } 
                }, 
                "RealEstate": { 
                    "ev_al": { 
                        "description": "Hazır ev alır." 
                    }, 
                    "evimi_deyis": { 
                        "description": "Əsas evinizi dəyişdirir." 
                    }, 
                    "evler": { 
                        "description": "Mövcud ev növlərini və qiymətlərini göstərir." 
                    }, 
                    "evlerim": { 
                        "description": "Sahib olduğunuz evləri göstərir." 
                    } 
                }, 
                "Registration": { 
                    "qeydiyyat_mesaji_gonder": { 
                        "description": "Qeydiyyat mesajını göndərir (Yalnız Sahib istifadə edə bilər)." 
                    }, 
                    "vesiqe_ver": { 
                        "description": "İstifadəçiyə şəxsiyyət vəsiqəsi verir (Yalnız Admin istifadə edə bilər)." 
                    }, 
                    "vesiqem": { 
                        "description": "Şəxsiyyət vəsiqənizi göstərir." 
                    } 
                }, 
                "Statistics": { 
                    "statistika_dayandir": { 
                        "description": "Statistika yeniləməsini dayandırır (Yalnız Sahib istifadə edə bilər)." 
                    }, 
                    "statistika_qur": { 
                        "description": "Statistika mesajını qurur (Yalnız Sahib istifadə edə bilər)." 
                    }, 
                    "statistika_yenile": { 
                        "description": "Statistika mesajını yeniləyir (Yalnız Sahib istifadə edə bilər)." 
                    } 
                }
            };

            // Əmrləri MongoDB-yə əlavə etmək üçün massiv
            const commands = [];

            // Əmrləri formatla və massivə əlavə et
            for (const category in commandsData) {
                for (const cmdName in commandsData[category]) {
                    const cmdInfo = commandsData[category][cmdName];
                    
                    // İcazələri təyin et
                    let permissions = "Hamı";
                    if (cmdInfo.description.includes("(Yalnız Sahib istifadə edə bilər)")) {
                        permissions = "Sahib";
                    } else if (cmdInfo.description.includes("(Yalnız Admin istifadə edə bilər)")) {
                        permissions = "Admin";
                    } else if (cmdInfo.description.includes("(Prezident və ya Sahib istifadə edə bilər)")) {
                        permissions = "Prezident/Sahib";
                    }
                    
                    // Əmri massivə əlavə et
                    commands.push({
                        name: cmdName,
                        description: cmdInfo.description.replace(/\([^)]*\)/g, "").trim(), // Mötərizələri təmizlə
                        usage: `!${cmdName}`,
                        category: category,
                        permissions: permissions
                    });
                }
            }
            
            if (commands.length > 0) {
                console.log('[seedCommands] Əmrlər verilənlər bazasına əlavə edilir...');
                await Command.insertMany(commands);
                console.log('[seedCommands] Bütün yeni bot əmrləri uğurla verilənlər bazasına əlavə edildi.');
            } else {
                console.log('[seedCommands] Verilənlər bazasına əlavə etmək üçün heç bir əmr hazırlanmadı.');
            }
            
            const countAfterInsert = await Command.countDocuments();
            console.log(`[seedCommands] Əlavə edildikdən sonra verilənlər bazasındakı əmrlərin ümumi sayı: ${countAfterInsert}`);
        }
    } catch (err) {
        console.error('[seedCommands] Əmrləri əlavə edərkən və ya seedCommands funksiyasında gözlənilməz xəta baş verdi:', err); 
    } finally { 
        console.log('[seedCommands] Funksiya başa çatdı.'); 
    }
};

async function checkAndSeedCommands() {
    console.log('[checkAndSeedCommands] Funksiya başladıldı.');
    try {
        const count = await Command.countDocuments();
        console.log(`[checkAndSeedCommands] Verilənlər bazasında mövcud əmrlərin sayı: ${count}`);
        if (count === 0) {
            console.log('[checkAndSeedCommands] Verilənlər bazasında heç bir əmr tapılmadı. seedCommands çağırılır...');
            await seedCommands();
        } else {
            console.log(`[checkAndSeedCommands] ${count} əmr artıq verilənlər bazasında mövcuddur. Yenidən əlavə etməyə ehtiyac yoxdur.`);
        }
    } catch (err) {
        console.error('[checkAndSeedCommands] Əmrləri yoxlayarkən xəta baş verdi:', err);
    } finally {
        console.log('[checkAndSeedCommands] Funksiya başa çatdı.');
    }
}

// Server başlatma funksiyası
async function startServer() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB-yə uğurla qoşuldu');
        
        // checkAndSeedCommands funksiyasını MongoDB bağlantısından sonra çağırın
        await checkAndSeedCommands(); 
        console.log('[startServer] checkAndSeedCommands funksiyası tamamlandı.');

        const PORT = process.env.PORT || 8080;
        app.listen(PORT, () => {
            console.log(`Server ${PORT} portunda işləyir`);
        });
    } catch (err) {
        console.error('Server başladılarkən və ya əmrlər yoxlanılarkən xəta baş verdi:', err);
        process.exit(1); // Xəta baş verdikdə prosesi dayandırın
    }
}

startServer(); // Serveri başlat
