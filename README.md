# Renk Kart

Ahşap renk-mantık oyuncağından esinlenen 3D bulmaca/yarış oyunu. Taşları oluklarda kaydırıp karttaki deseni kur.

## Çalıştırma

```bash
node server.js
```

Sonra tarayıcıda `http://localhost:5178` adresini aç. (Herhangi bir statik sunucu da olur; Three.js ve PeerJS CDN'den yüklendiği için internet gerekir.)

## Modlar

- **Tek Başına** — sıradaki / rastgele / günün kartı; yıldız (hamle sayısına göre), ipucu (kart başına 3), geri al, baştan.
- **Zamana Karşı** — 3 dakikada çözebildiğin kadar kart, rekor kaydı.
- **Bota Karşı** — Çırak / Usta / Efsane; tek tur, 3'te 2 veya 5'te 3. Botun tahtası karşıda canlı oynanır.
- **Online** — oda kur, 5 haneli kodu ya da davet bağlantısını paylaş (PeerJS ile tarayıcıdan tarayıcıya; sunucu kurmak gerekmez). Arkadaşınla internet üzerinden oynamak için oyunu herkese açık bir statik adreste yayınla (GitHub Pages, Netlify vb.).
- **Kartlar** — 3 zorlukta 999'ar kart (toplam 2.997), 4 farklı tahta düzeni (orta kanal, çift kanal, sol/sağ kanal + cep).

## Ayarlar

6 tema (Ahşap, Gece, Şeker, Deniz, Retro, Kontrast), ses, renk körü sembolleri, üstten görünüm, hızlı animasyon. İlerleme tarayıcıda saklanır.

## Dosyalar

- `js/core.js` — tahta modeli, kart üretimi, karıştırma, çözücü (bot ve ipucu)
- `js/scene.js` — Three.js sahnesi ve animasyonlar
- `js/theme.js` — temalar ve kart çizimi
- `js/app.js` — oyun akışı ve arayüz
- `js/net.js` — online bağlantı
- `js/audio.js` — sentez sesler
