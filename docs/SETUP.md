# Ecommerce Chat — সম্পূর্ণ সেটআপ গাইড

এই গাইডে লোকাল ডেভেলপমেন্ট থেকে প্রোডাকশন ডিপ্লয় পর্যন্ত সব ধাপ আছে।

---

## লোকাল ডেভেলপমেন্ট

### Prerequisites

| সফটওয়্যার | ভার্সন |
|-----------|--------|
| Node.js   | 20+    |
| MongoDB   | 7+     |
| Git       | যেকোনো |

### ধাপসমূহ

```bash
# ১. রিপো ক্লোন
git clone <your-repo-url> eonlinebazar-fullstack
cd eonlinebazar-fullstack/ecommerce-chat

# ২. ডিপেন্ডেন্সি ইনস্টল
npm install

# ৩. এনভায়রনমেন্ট ফাইল
cp .env.example .env
# .env এ OPENAI_API_KEY, JWT_SECRET, Cloudinary, SMTP ইত্যাদি পূরণ করুন

# ৪. সিড ডেটা (নলেজ বেস + ডিফল্ট এজেন্ট)
npm run seed

# ৫. নতুন অ্যাডমিন তৈরি (ঐচ্ছিক)
npm run create-admin

# ৬. সার্ভার চালু
npm run dev
# → http://localhost:5001/health
```

### Admin Dashboard (লোকাল)

```bash
cd ../admin-dashboard
cp .env.example .env   # VITE_API_URL=http://localhost:5001
npm install
npm run dev
# → http://localhost:5173
```

### Chat Widget টেস্ট

ব্রাউজারে খুলুন: `http://localhost:5001/chat-widget.html`  
(অথবা মূল সাইটের `public/chat-widget.html`)

---

## প্রোডাকশন সার্ভার সেটআপ (Ubuntu 22.04 VPS)

নিচের কমান্ডগুলো সার্ভারে `ssh` করে রান করুন। `yourchatdomain.com` আপনার ডোমেইন দিয়ে রিপ্লেস করুন।

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
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
  sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

sudo apt update
sudo apt install -y mongodb-org
sudo systemctl enable --now mongod
sudo systemctl status mongod
```

### ৩. PM2 গ্লোবাল ইনস্টল

```bash
npm install -g pm2
```

### ৪. রিপো ক্লোন + .env

```bash
cd ~
git clone <your-repo-url> eonlinebazar-fullstack
cd eonlinebazar-fullstack/ecommerce-chat
npm ci --only=production
cp .env.example .env
nano .env   # প্রোডাকশন ভ্যালু সেট করুন — PORT=5000
mkdir -p logs
```

### ৫. সিড + অ্যাডমিন

```bash
npm run seed
npm run create-admin
```

### ৬. PM2 দিয়ে স্টার্ট

```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
# স্ক্রিনে দেখানো কমান্ডটি কপি করে রান করুন (systemd enable)
```

> **নোট:** Cluster mode + Socket.io এর জন্য sticky session দরকার।  
> বিস্তারিত কমেন্ট আছে `server.js` ও `ecosystem.config.js` এ।  
> Sticky session সেটআপ না করা পর্যন্ত `ecosystem.config.js` এ `instances: 1` রাখা নিরাপদ।

### ৭. Nginx

```bash
sudo apt install -y nginx
sudo cp ~/eonlinebazar-fullstack/devops/nginx.conf /etc/nginx/sites-available/ecommerce-chat
sudo ln -sf /etc/nginx/sites-available/ecommerce-chat /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### ৮. SSL (Certbot)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourchatdomain.com
```

### ৯. টেস্ট

```bash
curl https://yourchatdomain.com/health
# {"status":"ok","service":"ecommerce-chat","mongo":"connected"}
```

---

## Admin Dashboard Deploy

```bash
cd ~/eonlinebazar-fullstack/admin-dashboard
npm ci
npm run build

sudo mkdir -p /var/www/admin-dashboard
sudo rsync -a --delete dist/ /var/www/admin-dashboard/dist/
```

Nginx `location /` ইতিমধ্যে `/var/www/admin-dashboard/dist` সার্ভ করে।

---

## Chat Widget Embed করার নিয়ম

আপনার ই-কমার্স সাইটের `</body>` ট্যাগের **আগে** এই স্নিপেট পেস্ট করুন:

```html
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

অর্ডার সাপোর্ট পেজে:

```js
ChatWidget.init({
  apiUrl: 'https://yourchatdomain.com',
  socketUrl: 'https://yourchatdomain.com',
  guestName: 'Customer Name',
  type: 'ORDER_SUPPORT',
  orderId: 'ORD-12345'
});
```

---

## Docker দিয়ে চালানো (ঐচ্ছিক)

```bash
cd ecommerce-chat
# .env ফাইল প্রস্তুত রাখুন
docker compose -f ../devops/docker-compose.yml up -d --build
curl http://localhost:5000/health
```

---

## পরিবেশ ভেরিয়েবল চেকলিস্ট

| ভেরিয়েবল | বর্ণনা | আবশ্যক? |
|-----------|--------|---------|
| `PORT` | সার্ভার পোর্ট (প্রোড: `5000`) | হ্যাঁ |
| `NODE_ENV` | `production` / `development` | হ্যাঁ |
| `MONGO_URI` | MongoDB কানেকশন স্ট্রিং | হ্যাঁ |
| `JWT_SECRET` | JWT সাইনিং সিক্রেট (কমপক্ষে ৩২ অক্ষর) | হ্যাঁ |
| `CLIENT_URL` | ফ্রন্টএন্ড / মেইন সাইট URL (CORS) | হ্যাঁ |
| `ADMIN_DASHBOARD_URL` | অ্যাডমিন ড্যাশবোর্ড URL (ইমেইল CTA) | সুপারিশকৃত |
| `OPENAI_API_KEY` | OpenAI API কী | হ্যাঁ |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary ক্লাউড নেম | আপলোডের জন্য |
| `CLOUDINARY_API_KEY` | Cloudinary API কী | আপলোডের জন্য |
| `CLOUDINARY_API_SECRET` | Cloudinary API সিক্রেট | আপলোডের জন্য |
| `SMTP_EMAIL` | Gmail অ্যাড্রেস (পাঠানোর জন্য) | অ্যালার্টের জন্য |
| `SMTP_PASSWORD` | Gmail App Password | অ্যালার্টের জন্য |
| `NOTIFY_EMAIL` | যেখানে হ্যান্ডওভার/রিপোর্ট যাবে | অ্যালার্টের জন্য |

---

## সমস্যা সমাধান (Troubleshooting)

### MongoDB connection refused
```bash
sudo systemctl status mongod
sudo systemctl start mongod
# .env এ MONGO_URI চেক করুন: mongodb://127.0.0.1:27017/ecommerce_chat
```

### Socket.io CORS error
- `CLIENT_URL` এ সঠিক ডোমেইন আছে কিনা দেখুন
- Nginx এ `/socket.io/` লোকেশনে `Upgrade` ও `Connection` হেডার আছে কিনা নিশ্চিত করুন
- Widget এর `socketUrl` HTTPS হতে হবে প্রোডাকশনে

### OpenAI API quota exceeded
- [OpenAI Usage](https://platform.openai.com/usage) চেক করুন
- বিলিং / কোটা টপ-আপ করুন
- সাময়িকভাবে সিড করা FAQ দিয়ে বট চলতে পারে, কিন্তু AI রিপ্লাই ফেল করবে

### PM2 process keeps crashing
```bash
pm2 logs ecommerce-chat --lines 100
# বা ফাইল থেকে:
tail -n 100 ~/eonlinebazar-fullstack/ecommerce-chat/logs/err.log
```
সাধারণ কারণ: `.env` মিসিং, Mongo ডাউন, পোর্ট অলরেডি ইন ইউজ।

### Nginx 502 Bad Gateway
```bash
pm2 status
curl http://127.0.0.1:5000/health
sudo nginx -t
sudo tail -n 50 /var/log/nginx/error.log
```
ব্যাকএন্ড ডাউন থাকলে বা ভুল পোর্টে প্রক্সি করলে ৫০২ আসে।

---

## নিরাপত্তা চেকলিস্ট

- [ ] ডিফল্ট অ্যাডমিন পাসওয়ার্ড বদলান / `create-admin` দিয়ে নতুন অ্যাকাউন্ট তৈরি করুন
- [ ] শক্তিশালী `JWT_SECRET` সেট করুন (কমপক্ষে ৩২ অক্ষর, র্যান্ডম)
- [ ] প্রোডাকশনে MongoDB authentication চালু করুন
- [ ] `.env` কখনো git এ কমিট করবেন না (`.gitignore` এ আছে কিনা দেখুন)
- [ ] Firewall: শুধু প্রয়োজনীয় পোর্ট খুলুন

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

- [ ] Gmail এর জন্য সাধারণ পাসওয়ার্ড নয় — **App Password** ব্যবহার করুন
- [ ] Cloudinary ও OpenAI কী রোটেট করুন যদি লিক হয়
- [ ] GitHub Actions সিক্রেট: `SERVER_HOST`, `SERVER_USER`, `SSH_PRIVATE_KEY`

---

## দরকারি কমান্ড চিটশিট

```bash
# ব্যাকএন্ড
cd ecommerce-chat && npm run dev
npm run seed
npm run create-admin

# প্রোড
pm2 reload ecommerce-chat --update-env
pm2 logs ecommerce-chat

# দৈনিক ইমেইল রিপোর্ট (ম্যানুয়াল)
curl -X POST https://yourchatdomain.com/api/admin/reports/daily \
  -H "Authorization: Bearer <ADMIN_JWT>"
```

---

## CI/CD (GitHub Actions)

Workflow ফাইল: `.github/workflows/deploy.yml`  
`main` ব্রাঞ্চে push হলে:

1. Node 20 সেটআপ + `npm ci`
2. Admin dashboard বিল্ড
3. SSH দিয়ে সার্ভারে pull → `npm ci` → `pm2 reload` → dashboard `dist` কপি

Repo Secrets সেট করুন: `SERVER_HOST`, `SERVER_USER`, `SSH_PRIVATE_KEY`।
