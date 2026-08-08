# DigitalOcean Server — প্রথমবার Setup Guide

এই গাইড **শুধু একবার** চালাতে হবে — নতুন DigitalOcean droplet-এ chat system setup করার জন্য।  
পরবর্তী deploy GitHub Actions দিয়ে হবে।

> `YOUR_SERVER_IP` জায়গায় আপনার Droplet-এর IP বসান।

---

## Step 1: Server-এ প্রথমবার login করুন

```bash
ssh root@YOUR_SERVER_IP
```

---

## Step 2: Node.js install করুন

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
```

Version দেখুন — `v20.x.x` আসা উচিত।

---

## Step 3: PM2 install করুন

```bash
npm install -g pm2
```

---

## Step 4: Nginx install করুন

```bash
sudo apt-get install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

## Step 5: Repo clone করুন

```bash
cd /var/www
git clone https://github.com/sabdulkarim010/eonlinebazar.git
cd eonlinebazar
```

---

## Step 6: Chat server setup করুন

```bash
cd /var/www/eonlinebazar/ecommerce-chat
npm install
```

---

## Step 7: .env file বানান

ফাইল তৈরি করুন:

```bash
nano /var/www/eonlinebazar/ecommerce-chat/.env
```

নিচের মানগুলো দিন (placeholder গুলো নিজের মান দিয়ে বদলান):

```env
PORT=5001
MONGO_URI=mongodb+srv://...your atlas uri...
JWT_SECRET=any-long-random-string-minimum-32-chars
OPENAI_API_KEY=sk-...your key...
CLIENT_URL=https://eonlinebazar.com
NODE_ENV=production
```

Save করে বের হোন (`Ctrl+O`, Enter, `Ctrl+X`)।

---

## Step 8: Database seed করুন

```bash
node seed.js
```

---

## Step 9: PM2 দিয়ে চালু করুন

```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

`pm2 startup` যে command দেখাবে, সেটা কপি করে রান করুন (reboot-এর পরও PM2 চালু থাকবে)।

---

## Step 10: Chat admin folder বানান

```bash
sudo mkdir -p /var/www/html/chat-admin
```

---

## Step 11: Nginx config দিন

```bash
sudo cp /var/www/eonlinebazar/devops/nginx.conf \
  /etc/nginx/sites-available/eonlinebazar
sudo ln -sf /etc/nginx/sites-available/eonlinebazar \
  /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

---

## Step 12: SSL certificate নিন

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d eonlinebazar.com -d www.eonlinebazar.com
```

Domain-এর DNS A record এই server IP-তে point করা থাকতে হবে।

---

## Step 13: Verify করুন

```bash
pm2 status
curl http://localhost:5001/health
```

`pm2 status`-এ chat server `online` থাকবে, আর health endpoint সঠিক response দিলে setup সম্পন্ন।

---

## পরবর্তী deploy

এর পর কোড push করলে `.github/workflows/deploy-chat.yml` স্বয়ংক্রিয়ভাবে deploy করবে। এই এককালীন setup আর করতে হবে না।
