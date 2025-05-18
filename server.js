const express = require('express');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const fs = require('fs');
const webpush = require('web-push');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5001;
const activitiesFile = './activities.json';

// CORS ayarları
app.use(cors());

// JSON ve URL-encoded verileri işleme
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Statik dosyalar için public klasörünü kullan
app.use(express.static('public'));

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

app.listen(port, () => {
    console.log(`Server ${port} portunda işləyir`);
}); 
