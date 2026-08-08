#!/bin/bash
set -e

echo "=== EonlineBazar Server Setup ==="

# 0. Prerequisites
sudo apt-get update
sudo apt-get install -y curl git ca-certificates

# 1. Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Install PM2
npm install -g pm2

# 3. Install Nginx
sudo apt-get install -y nginx

# 4. Install Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# 5. Create directories
sudo mkdir -p /var/www/html/chat-admin
sudo mkdir -p /var/www/eonlinebazar

# 6. Clone the repo (replace with actual repo URL)
cd /var/www
git clone https://github.com/sabdulkarim010/eonlinebazar.git eonlinebazar

# 7. Setup main store
cd /var/www/eonlinebazar
npm ci --only=production

# 8. Setup chat server
cd /var/www/eonlinebazar/ecommerce-chat
npm ci --only=production

# 9. Create .env for chat server
cat > /var/www/eonlinebazar/ecommerce-chat/.env << 'EOF'
PORT=5001
MONGO_URI=your_mongodb_atlas_uri_here
JWT_SECRET=your_strong_jwt_secret_here
OPENAI_API_KEY=your_openai_key_here
CLIENT_URL=https://eonlinebazar.com
NODE_ENV=production
EOF

echo "⚠️  Edit /var/www/eonlinebazar/ecommerce-chat/.env with real values!"

# 10. Start chat server with PM2
cd /var/www/eonlinebazar/ecommerce-chat
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup

# 11. Copy nginx config
sudo cp /var/www/eonlinebazar/devops/nginx.conf /etc/nginx/sites-available/eonlinebazar
sudo ln -sf /etc/nginx/sites-available/eonlinebazar /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

# 12. Get SSL certificate
sudo certbot --nginx -d eonlinebazar.com -d www.eonlinebazar.com --non-interactive --agree-tos -m your@email.com

# 13. Seed chat database
cd /var/www/eonlinebazar/ecommerce-chat
node seed.js

echo ""
echo "✅ Setup complete!"
echo "Chat Admin: https://eonlinebazar.com/chat-admin/login"
echo "Login: admin@yourshop.com / Admin@1234"
echo "⚠️  Change password after first login!"
