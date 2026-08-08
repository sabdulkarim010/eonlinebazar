# E‑Commerce Chat — প্রোডাকশন সেটআপ গাইড

এই গাইডে লোকাল ডেভেলপমেন্ট থেকে Ubuntu VPS প্রোডাকশন ডিপ্লয় পর্যন্ত সব ধাপ আছে।

---

## লোকাল ডেভেলপমেন্ট

### Prerequisites
- Node.js **20+**
- MongoDB **7** (লোকাল বা Atlas)
- Git
- (ঐচ্ছিক) OpenAI API key, Cloudinary অ্যাকাউন্ট, Gmail App Password

### ধাপে ধাপে

```bash
# 1. ক্লোন
git clone <your-repo-url> ecommerce-chat
cd ecommerce-chat

# 2. ডিপেন্ডেন্সি
npm install

# 3. এনভায়রনমেন্ট
cp .env.example .env
# .env ফাইল এডিট করুন — নিচের চেকলিস্ট দেখুন

# 4. সিড ডেটা (স্টোর কনফিগ + নলেজ বেস + ডিফল্ট অ্যাডমিন)
npm run seed

# 5. সার্ভার চালান
npm run dev
# → http://localhost:5001/health
```

অতিরিক্ত এজেন্ট তৈরি:

```bash
node scripts/createAdmin.js
```

Admin dashboard (আলাদা ফোল্ডার `admin-dashboard/`):

```bash
cd ../admin-dashboard
npm install
cp .env.example .env
# VITE_API_URL=http://localhost:5001
npm run dev
```

---

## প্রোডাকশন সার্ভার সেটআপ (Ubuntu 22.04 VPS)

### ১. Node.js 20 (nvm)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
node -v   # v20.x
```

### ২. MongoDB 7

```bash
# Official MongoDB 7 repo (Ubuntu 22.04)
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
  sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

sudo apt update
sudo apt install -y mongodb-org
sudo systemctl enable mongod
sudo systemctl start mongod
sudo systemctl status mongod
```

### ৩. PM2 গ্লোবালি

```bash
npm install -g pm2
```

### ৪. রিপো ক্লোন + .env

```bash
cd /var/www   # বা ~/apps
sudo mkdir -p /var/www && sudo chown $USER:$USER /var/www
git clone <your-repo-url> ecommerce-chat
cd ecommerce-chat
npm install
cp .env.example .env
nano .env
```

প্রোডাকশনে গুরুত্বপূর্ণ:
- `PORT=5000`
- `NODE_ENV=production`
- `CLIENT_URL=https://yourchatdomain.com`
- `ADMIN_DASHBOARD_URL=https://yourchatdomain.com`
- শক্তিশালী `JWT_SECRET` (কমপক্ষে ৩২ ক্যারেক্টার)

### ৫. সিড

```bash
npm run seed
# ডিফল্ট অ্যাডমিন পাসওয়ার্ড বদলে নিন!
node scripts/createAdmin.js
```

### ৬–৭. PM2 স্টার্ট + স্টার্টআপ

```bash
mkdir -p logs
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
# উপরের কমান্ড যে sudo লাইন দেখাবে, সেটা রান করুন
```

> **নোট:** `instances: 'max'` ক্লাস্টার মোডে Socket.io‑এর জন্য sticky session লাগে।  
> বিস্তারিত কমেন্ট আছে `ecosystem.config.js`‑এ। ছোট VPS‑এ `instances: 1` ব্যবহার করতে পারেন।

### ৮. Nginx

```bash
sudo apt install -y nginx
sudo cp devops/nginx.conf /etc/nginx/sites-available/ecommerce-chat
sudo nano /etc/nginx/sites-available/ecommerce-chat
# yourchatdomain.com → আপনার ডোমেইন বসান

sudo ln -sf /etc/nginx/sites-available/ecommerce-chat /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### ৯. Certbot SSL

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourchatdomain.com
```

### ১০. টেস্ট

```bash
curl https://yourchatdomain.com/health
```

প্রত্যাশিত JSON: `"status":"ok"`

---

## Admin Dashboard Deploy

```bash
cd /var/www/admin-dashboard   # বা sibling ফোল্ডার
npm install
npm run build

sudo mkdir -p /var/www/admin-dashboard/dist
sudo rsync -a --delete dist/ /var/www/admin-dashboard/dist/
```

Nginx `location /` এই `dist/` সার্ভ করে (`devops/nginx.conf` দেখুন)।

---

## Chat Widget Embed করার নিয়ম

আপনার স্টোরফ্রন্ট HTML‑এ `</body>`‑এর আগে পেস্ট করুন:

```html
<!-- Serve widget ONLY from ecommerce-chat (PORT 5001) — do not copy into main store public/ -->
<link rel="stylesheet" href="https://yourchatdomain.com/css/chat-widget.css">
<script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
<script src="https://yourchatdomain.com/js/chat-widget.js"></script>
<script>
  ChatWidget.init({
    apiUrl: 'https://yourchatdomain.com',
    socketUrl: 'https://yourchatdomain.com',
    guestName: 'Guest',
    type: 'GENERAL'
  });
</script>
```

Local: `http://localhost:5001/js/chat-widget.js`

অর্ডার সাপোর্টের জন্য:

```js
ChatWidget.init({
  apiUrl: 'https://yourchatdomain.com',
  socketUrl: 'https://yourchatdomain.com',
  guestName: 'Guest',
  type: 'ORDER_SUPPORT',
  orderId: 'ORDER_ID_HERE'
});
```

---

## Docker দিয়ে চালানো (ঐচ্ছিক)

```bash
# প্রজেক্ট রুট থেকে
docker compose -f devops/docker-compose.yml up -d --build
curl http://localhost:5001/health
```

---

## পরিবেশ ভেরিয়েবল চেকলিস্ট

| Variable | বর্ণনা |
|----------|--------|
| `PORT` | সার্ভার পোর্ট (লোকাল `5001`, প্রোড `5000`) |
| `CLIENT_URL` | CORS + ফ্রন্টএন্ড URL (ড্যাশবোর্ড / স্টোর) |
| `ADMIN_DASHBOARD_URL` | হ্যান্ডওভার ইমেইলের CTA লিংক |
| `MONGO_URI` | MongoDB কানেকশন স্ট্রিং |
| `JWT_SECRET` | JWT সাইনিং সিক্রেট (মিন ৩২ ক্যারেক্টার) |
| `OPENAI_API_KEY` | AI বট রেসপন্সের জন্য OpenAI কী |
| `CLOUDINARY_CLOUD_NAME` | চ্যাট ইমেজ আপলোড — Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `SMTP_EMAIL` | ইমেইল পাঠানোর Gmail / SMTP ইউজার |
| `SMTP_PASSWORD` | Gmail App Password (নরমাল পাসওয়ার্ড নয়) |
| `NOTIFY_EMAIL` | হ্যান্ডওভার / ডেইলি রিপোর্ট যেখানে যাবে |
| `SMTP_SERVICE` | (ঐচ্ছিক) ডিফল্ট `gmail` |
| `NODE_ENV` | `production` প্রোডাকশনে |

---

## সমস্যা সমাধান (Troubleshooting)

### MongoDB connection refused
```bash
sudo systemctl status mongod
sudo systemctl start mongod
# .env‑এ MONGO_URI ঠিক আছে কিনা চেক করুন
mongosh --eval 'db.runCommand({ ping: 1 })'
```

### Socket.io CORS error
- `CLIENT_URL` অবশ্যই ফ্রন্টএন্ডের exact origin হতে হবে (`https://yourchatdomain.com`)
- Nginx‑এ `/socket.io/` লোকেশনে `Upgrade` ও `Connection` হেডার আছে কিনা দেখুন

### OpenAI API quota exceeded
- OpenAI ড্যাশবোর্ডে বিলিং / কোটা চেক করুন
- সাময়িকভাবে বট নলেজ‑বেস উত্তর দিলেও চলবে; হ্যান্ডওভার কীওয়ার্ড কাজ করবে

### PM2 process keeps crashing
```bash
pm2 logs ecommerce-chat --lines 100
pm2 describe ecommerce-chat
# logs/err.log ও logs/out.log দেখুন
```

### Nginx 502 Bad Gateway
```bash
pm2 status                    # প্রসেস অনলাইন কিনা
curl http://localhost:5001/health
sudo nginx -t
sudo tail -n 50 /var/log/nginx/error.log
```

---

## নিরাপত্তা চেকলিস্ট

- [ ] সিড করা ডিফল্ট অ্যাডমিন পাসওয়ার্ড বদলান
- [ ] শক্তিশালী `JWT_SECRET` সেট করুন (মিন ৩২ ক্যারেক্টার)
- [ ] প্রোডাকশনে MongoDB auth চালু করুন (`mongosh` → user তৈরি → `MONGO_URI` আপডেট)
- [ ] `.env` কখনো গিটে কমিট করবেন না (`.gitignore`‑এ আছে)
- [ ] ফায়ারওয়াল:
  ```bash
  sudo ufw allow 22
  sudo ufw allow 80
  sudo ufw allow 443
  sudo ufw enable
  sudo ufw status
  ```
- [ ] Cloudinary ও SMTP ক্রেডেনশিয়াল রোটেট করুন যদি লিক হয়
- [ ] GitHub Actions secrets: `SERVER_HOST`, `SERVER_USER`, `SSH_PRIVATE_KEY`

---

## দরকারি কমান্ডস

| কাজ | কমান্ড |
|-----|--------|
| অ্যাডমিন তৈরি | `node scripts/createAdmin.js` |
| সিড | `npm run seed` |
| PM2 রিলোড | `pm2 reload ecommerce-chat --update-env` |
| ডেইলি রিপোর্ট API | `POST /api/admin/daily-report` (ADMIN JWT) |
| Docker আপ | `docker compose -f devops/docker-compose.yml up -d` |

---

🚀 সেটআপ শেষ হলে `/health` গ্রিন এবং অ্যাডমিন ড্যাশবোর্ডে লগইন করতে পারবেন।
