const express = require('express');
const crypto = require('crypto');
const emergency = require('../utils/emergencyService');
const { getClientIp } = require('../utils/deviceParser');

const router = express.Router();

const URL_TOKEN = process.env.EMERGENCY_URL_TOKEN;
const MASTER_KEY = process.env.EMERGENCY_MASTER_KEY;
const OWNER_NAME = process.env.EMERGENCY_OWNER_NAME || 'Owner';

function emergencyGuard(req, res, next) {
    if (!URL_TOKEN || !MASTER_KEY) {
        return res.status(404).send('Not found');
    }
    next();
}

function verifyMasterKey(req, res, next) {
    const provided = req.headers['x-master-key'] || req.body.masterKey;
    if (!provided) {
        return res.status(401).json({ success: false, message: 'Master key required' });
    }

    const keyBuffer = Buffer.from(MASTER_KEY);
    const providedBuffer = Buffer.from(String(provided));
    if (
        keyBuffer.length !== providedBuffer.length ||
        !crypto.timingSafeEqual(keyBuffer, providedBuffer)
    ) {
        const ip = getClientIp(req);
        console.warn(`[EMERGENCY] Invalid master key attempt from IP: ${ip} at ${new Date().toISOString()}`);
        emergency.logEmergencyAction('Invalid Master Key Attempt', ip).catch(() => {});
        return res.status(401).json({ success: false, message: 'Invalid master key' });
    }
    next();
}

function tokenMatches(req) {
    return req.params.token === URL_TOKEN;
}

router.get('/:token/control', emergencyGuard, (req, res) => {
    if (!tokenMatches(req)) {
        return res.status(404).send('Not found');
    }
    res.send(getEmergencyPanelHTML(OWNER_NAME));
});

router.post('/:token/api/status', emergencyGuard, verifyMasterKey, async (req, res) => {
    if (!tokenMatches(req)) return res.status(404).json({});
    try {
        const status = await emergency.getSystemStatus();
        res.json({ success: true, data: status });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/:token/api/blocked-ips', emergencyGuard, verifyMasterKey, async (req, res) => {
    if (!tokenMatches(req)) return res.status(404).json({});
    try {
        const ips = await emergency.getAllBlockedIPs();
        res.json({ success: true, data: ips });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/:token/api/unblock-ip', emergencyGuard, verifyMasterKey, async (req, res) => {
    if (!tokenMatches(req)) return res.status(404).json({});
    try {
        const { ip } = req.body;
        if (!ip) return res.status(400).json({ success: false, message: 'IP required' });
        const result = await emergency.unblockIP(ip, getClientIp(req));
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/:token/api/unblock-all', emergencyGuard, verifyMasterKey, async (req, res) => {
    if (!tokenMatches(req)) return res.status(404).json({});
    try {
        const result = await emergency.unblockAllIPs(getClientIp(req));
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/:token/api/reset-password', emergencyGuard, verifyMasterKey, async (req, res) => {
    if (!tokenMatches(req)) return res.status(404).json({});
    try {
        const { username, newPassword } = req.body;
        if (!username || !newPassword) {
            return res.status(400).json({ success: false, message: 'Username and password required' });
        }
        if (newPassword.length < 8) {
            return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
        }
        const result = await emergency.resetAdminPassword(username, newPassword, getClientIp(req));
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/:token/api/admins', emergencyGuard, verifyMasterKey, async (req, res) => {
    if (!tokenMatches(req)) return res.status(404).json({});
    try {
        const admins = await emergency.listAdmins();
        res.json({ success: true, data: admins });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/:token/api/security-logs', emergencyGuard, verifyMasterKey, async (req, res) => {
    if (!tokenMatches(req)) return res.status(404).json({});
    try {
        const logs = await emergency.getRecentSecurityLogs();
        res.json({ success: true, data: logs });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

function getEmergencyPanelHTML(ownerName) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>🔐 Emergency Control</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',sans-serif;background:#0f0f23;color:#e2e8f0;min-height:100vh}
.lock-screen{
  display:flex;align-items:center;justify-content:center;
  min-height:100vh;padding:20px;
}
.lock-box{
  background:#1a1a2e;border:2px solid #ff6b35;border-radius:16px;
  padding:36px;width:100%;max-width:420px;
  box-shadow:0 0 40px rgba(255,107,53,0.3);
}
.lock-icon{font-size:2.5rem;text-align:center;margin-bottom:16px}
.lock-title{
  text-align:center;font-size:1.3rem;font-weight:700;
  color:#ff6b35;margin-bottom:6px;
}
.lock-sub{text-align:center;font-size:0.85rem;color:#94a3b8;margin-bottom:24px}
.field{margin-bottom:14px}
.field label{display:block;font-size:0.8rem;font-weight:600;color:#94a3b8;margin-bottom:6px}
.field input{
  width:100%;padding:12px;
  background:#0f0f23;border:1.5px solid #334155;border-radius:8px;
  color:#e2e8f0;font-size:0.9rem;outline:none;
}
.field input:focus{border-color:#ff6b35}
.btn-auth{
  width:100%;padding:13px;background:#ff6b35;color:white;
  border:none;border-radius:8px;font-size:1rem;font-weight:700;
  cursor:pointer;margin-top:8px;transition:background 0.2s;
}
.btn-auth:hover{background:#ea580c}
.error-msg{
  background:#450a0a;border:1px solid #ef4444;color:#fca5a5;
  padding:10px;border-radius:8px;font-size:0.85rem;margin-top:12px;
  display:none;text-align:center;
}
.dashboard{display:none;padding:20px;max-width:900px;margin:0 auto}
.dash-header{
  display:flex;justify-content:space-between;align-items:center;
  padding:16px 0;border-bottom:1px solid #1e293b;margin-bottom:20px;
}
.dash-title{font-size:1.2rem;font-weight:700;color:#ff6b35}
.dash-sub{font-size:0.8rem;color:#64748b;margin-top:2px}
.btn-logout{
  padding:8px 16px;background:#1e293b;color:#94a3b8;
  border:1px solid #334155;border-radius:8px;cursor:pointer;font-size:0.85rem;
}
.btn-logout:hover{color:#ef4444;border-color:#ef4444}
.status-grid{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));
  gap:12px;margin-bottom:20px;
}
.stat-card{
  background:#1a1a2e;border:1px solid #1e293b;border-radius:10px;
  padding:16px;
}
.stat-label{font-size:0.72rem;color:#64748b;text-transform:uppercase;letter-spacing:0.5px}
.stat-val{font-size:1.5rem;font-weight:800;margin-top:6px}
.stat-card.danger .stat-val{color:#ef4444}
.stat-card.ok .stat-val{color:#10b981}
.stat-card.warn .stat-val{color:#f59e0b}
.stat-card.info .stat-val{color:#6366f1}
.section{background:#1a1a2e;border:1px solid #1e293b;border-radius:12px;padding:20px;margin-bottom:16px}
.section-title{font-size:0.95rem;font-weight:700;color:#e2e8f0;margin-bottom:14px;
  display:flex;align-items:center;gap:8px}
.ip-item{
  display:flex;justify-content:space-between;align-items:center;
  padding:10px 12px;background:#0f0f23;border-radius:8px;
  margin-bottom:8px;
}
.ip-addr{font-family:monospace;color:#f97316;font-size:0.9rem}
.ip-time{font-size:0.75rem;color:#64748b}
.btn-unblock{
  padding:5px 12px;background:#10b981;color:white;
  border:none;border-radius:6px;font-size:0.78rem;cursor:pointer;font-weight:600;
}
.btn-unblock:hover{background:#059669}
.btn-danger{
  padding:10px 20px;background:#ef4444;color:white;
  border:none;border-radius:8px;font-size:0.9rem;font-weight:700;cursor:pointer;
  width:100%;margin-top:8px;
}
.btn-danger:hover{background:#dc2626}
.btn-success-full{
  padding:10px 20px;background:#10b981;color:white;
  border:none;border-radius:8px;font-size:0.9rem;font-weight:700;cursor:pointer;
  width:100%;
}
.btn-success-full:hover{background:#059669}
.reset-row{display:flex;gap:8px;margin-top:10px}
.reset-row input{
  flex:1;padding:10px;background:#0f0f23;
  border:1.5px solid #334155;border-radius:8px;
  color:#e2e8f0;font-size:0.9rem;outline:none;
}
.reset-row input:focus{border-color:#f59e0b}
.btn-reset{
  padding:10px 16px;background:#f59e0b;color:white;
  border:none;border-radius:8px;font-weight:700;cursor:pointer;white-space:nowrap;
}
.alert{
  padding:12px 16px;border-radius:8px;font-size:0.875rem;
  margin-top:12px;display:none;
}
.alert-ok{background:#052e16;border:1px solid #10b981;color:#6ee7b7}
.alert-err{background:#450a0a;border:1px solid #ef4444;color:#fca5a5}
.log-item{
  padding:8px 12px;background:#0f0f23;border-radius:6px;
  margin-bottom:6px;font-size:0.8rem;
}
.log-event{color:#93c5fd;font-weight:600}
.log-ip{color:#f97316;font-family:monospace}
.log-time{color:#64748b}
.no-items{color:#475569;text-align:center;padding:20px;font-size:0.875rem}
.admin-item{
  padding:10px 12px;background:#0f0f23;border-radius:8px;
  margin-bottom:8px;
}
.admin-name{font-weight:700;color:#e2e8f0}
.admin-role{
  display:inline-block;padding:2px 8px;background:#1e293b;
  border-radius:4px;font-size:0.72rem;color:#94a3b8;margin-left:8px;
}
.admin-status{font-size:0.75rem;color:#64748b;margin-top:4px}
</style>
</head>
<body>

<div class="lock-screen" id="lockScreen">
  <div class="lock-box">
    <div class="lock-icon">🔐</div>
    <div class="lock-title">Emergency Control Panel</div>
    <div class="lock-sub">EOnlineBazar · Owner Access Only<br>Welcome, ${ownerName}</div>
    <div class="field">
      <label>Master Key</label>
      <input type="password" id="masterKeyInput"
             placeholder="Enter your master key..."
             onkeydown="if(event.key==='Enter')unlock()">
    </div>
    <button class="btn-auth" onclick="unlock()">🔓 Access Panel</button>
    <div class="error-msg" id="lockError">❌ Invalid master key. Access denied.</div>
  </div>
</div>

<div class="dashboard" id="dashboard">
  <div class="dash-header">
    <div>
      <div class="dash-title">🔐 Emergency Control Panel</div>
      <div class="dash-sub">EOnlineBazar · Owner: ${ownerName}</div>
    </div>
    <button class="btn-logout" onclick="logout()">Lock Panel</button>
  </div>

  <div class="status-grid" id="statusGrid">
    <div class="stat-card info">
      <div class="stat-label">Database</div>
      <div class="stat-val" id="s-db">...</div>
    </div>
    <div class="stat-card danger">
      <div class="stat-label">Blocked IPs</div>
      <div class="stat-val" id="s-blocked">...</div>
    </div>
    <div class="stat-card warn">
      <div class="stat-label">Failed Logins (24h)</div>
      <div class="stat-val" id="s-attempts">...</div>
    </div>
    <div class="stat-card ok">
      <div class="stat-label">Total Orders</div>
      <div class="stat-val" id="s-orders">...</div>
    </div>
    <div class="stat-card info">
      <div class="stat-label">Uptime</div>
      <div class="stat-val" id="s-uptime" style="font-size:1rem">...</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">🚫 Blocked IP Addresses</div>
    <div id="ipList"><div class="no-items">Loading...</div></div>
    <div class="alert alert-ok" id="unblock-alert"></div>
    <button class="btn-danger" onclick="unblockAll()">
      🔓 Unblock ALL IPs (Emergency Reset)
    </button>
  </div>

  <div class="section">
    <div class="section-title">🔑 Reset Admin Password</div>
    <div id="adminList" style="margin-bottom:12px">
      <div class="no-items">Loading...</div>
    </div>
    <div class="reset-row">
      <input type="text" id="reset-username" placeholder="Admin username">
      <input type="password" id="reset-password" placeholder="New password (min 8 chars)">
      <button class="btn-reset" onclick="resetPassword()">Reset</button>
    </div>
    <div class="alert" id="reset-alert"></div>
  </div>

  <div class="section">
    <div class="section-title">📋 Recent Security Logs</div>
    <button class="btn-success-full" onclick="loadLogs()"
            style="margin-bottom:12px">Load Logs</button>
    <div id="logList"><div class="no-items">Click "Load Logs" to view</div></div>
  </div>
</div>

<script>
let masterKey = '';
const BASE = window.location.pathname.replace('/control','');

function unlock() {
  const key = document.getElementById('masterKeyInput').value.trim();
  if (!key) return;
  masterKey = key;

  apiCall('status', {}).then(data => {
    if (data.success) {
      document.getElementById('lockScreen').style.display = 'none';
      document.getElementById('dashboard').style.display = 'block';
      loadDashboard();
    } else {
      showLockError();
    }
  }).catch(() => showLockError());
}

function logout() {
  masterKey = '';
  document.getElementById('lockScreen').style.display = 'flex';
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('masterKeyInput').value = '';
}

function showLockError() {
  const el = document.getElementById('lockError');
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 4000);
}

async function apiCall(endpoint, body) {
  body = body || {};
  const res = await fetch(BASE + '/api/' + endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-master-key': masterKey
    },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function loadDashboard() {
  const status = await apiCall('status');
  if (status.success) {
    document.getElementById('s-db').textContent = status.data.database;
    document.getElementById('s-blocked').textContent = status.data.blockedIpCount;
    document.getElementById('s-attempts').textContent = status.data.recentFailedLogins;
    document.getElementById('s-orders').textContent = status.data.totalOrders;
    document.getElementById('s-uptime').textContent = status.data.uptime;
  }
  loadBlockedIPs();
  loadAdmins();
}

async function loadBlockedIPs() {
  const data = await apiCall('blocked-ips');
  const el = document.getElementById('ipList');
  if (!data.success || !data.data.length) {
    el.innerHTML = '<div class="no-items">✅ No blocked IPs</div>';
    return;
  }
  el.innerHTML = data.data.map(function(ip) {
    return '<div class="ip-item">' +
      '<div><div class="ip-addr">' + ip.ip + '</div>' +
      '<div class="ip-time">' + (ip.reason || 'Blocked') + ' · ' +
      new Date(ip.createdAt || ip.blockedAt).toLocaleString() + '</div></div>' +
      '<button class="btn-unblock" onclick="unblockOne(\\'' + ip.ip.replace(/'/g, "\\\\'") + '\\')">Unblock</button>' +
      '</div>';
  }).join('');
}

async function unblockOne(ip) {
  const data = await apiCall('unblock-ip', { ip: ip });
  const alert = document.getElementById('unblock-alert');
  alert.textContent = data.message;
  alert.style.display = 'block';
  alert.className = 'alert ' + (data.success ? 'alert-ok' : 'alert-err');
  setTimeout(function() { alert.style.display = 'none'; }, 4000);
  if (data.success) {
    loadBlockedIPs();
    loadDashboard();
  }
}

async function unblockAll() {
  if (!confirm('Unblock ALL IPs? This clears all login attempt records too.')) return;
  const data = await apiCall('unblock-all');
  const alert = document.getElementById('unblock-alert');
  alert.textContent = data.message;
  alert.style.display = 'block';
  alert.className = 'alert ' + (data.success ? 'alert-ok' : 'alert-err');
  setTimeout(function() { alert.style.display = 'none'; }, 5000);
  if (data.success) { loadBlockedIPs(); loadDashboard(); }
}

async function loadAdmins() {
  const data = await apiCall('admins');
  const el = document.getElementById('adminList');
  if (!data.success || !data.data.length) {
    el.innerHTML = '<div class="no-items">No admins found</div>';
    return;
  }
  el.innerHTML = data.data.map(function(a) {
    return '<div class="admin-item">' +
      '<div><span class="admin-name">' + a.username + '</span>' +
      '<span class="admin-role">' + a.role + '</span></div>' +
      '<div class="admin-status">Status: ' + a.status +
      ' · 2FA: ' + (a.twoFactorEnabled ? 'ON' : 'OFF') + '</div>' +
      '</div>';
  }).join('');
  if (data.data[0]) {
    document.getElementById('reset-username').value = data.data[0].username;
  }
}

async function resetPassword() {
  const username = document.getElementById('reset-username').value.trim();
  const newPassword = document.getElementById('reset-password').value.trim();
  const alert = document.getElementById('reset-alert');

  if (!username || !newPassword) {
    alert.textContent = 'Both username and new password are required';
    alert.style.display = 'block';
    alert.className = 'alert alert-err';
    return;
  }

  if (!confirm('Reset password for ' + username + '? This will also disable 2FA.')) return;

  const data = await apiCall('reset-password', { username: username, newPassword: newPassword });
  alert.textContent = data.message;
  alert.style.display = 'block';
  alert.className = 'alert ' + (data.success ? 'alert-ok' : 'alert-err');
  setTimeout(function() { alert.style.display = 'none'; }, 5000);
  if (data.success) document.getElementById('reset-password').value = '';
}

async function loadLogs() {
  const data = await apiCall('security-logs');
  const el = document.getElementById('logList');
  if (!data.success || !data.data.length) {
    el.innerHTML = '<div class="no-items">No logs found</div>';
    return;
  }
  el.innerHTML = data.data.map(function(log) {
    return '<div class="log-item">' +
      '<span class="log-event">' + log.action + '</span> · ' +
      '<span class="log-ip">' + (log.ipAddress || '—') + '</span> · ' +
      '<span class="log-time">' + new Date(log.createdAt).toLocaleString() + '</span>' +
      '</div>';
  }).join('');
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && document.getElementById('lockScreen').style.display !== 'none') {
    unlock();
  }
});
</script>
</body>
</html>`;
}

module.exports = router;
