const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 5001;

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

// Hata yakalama middleware'i
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Bir şeyler ters gitti!');
});

// Sunucuyu başlat
app.listen(port, '0.0.0.0', () => {
    console.log(`Sunucu http://localhost:${port} adresinde çalışıyor`);
}).on('error', (err) => {
    console.error('Sunucu başlatılırken hata oluştu:', err);
}); 