# Notification Setup Guide — EonlineBazar

**Last updated:** 2026-09-21

Transactional email and WhatsApp alerts no longer use SMTP or paid gateways (UltraMsg). The stack is:

- **Email:** Resend API (primary) → Brevo API (fallback) → console log
- **WhatsApp:** Baileys (self-hosted, QR scan — free)

Configure in **Admin → System Settings → Notifications** or via `.env`.

---

## Email (Resend)

1. Go to [https://resend.com](https://resend.com) → sign up (free tier: 3,000 emails/month)
2. Add and verify your domain, or use `onboarding@resend.dev` for testing
3. Create an API key → copy to `RESEND_API_KEY` in `.env`
4. Set `RESEND_FROM_EMAIL` (must match a verified domain), e.g. `EonlineBazar <noreply@eonlinebazar.com>`
5. Restart the server: `pm2 restart all` or `npm start`

## Email (Brevo fallback)

1. Go to [https://app.brevo.com](https://app.brevo.com) → sign up (free: ~300 emails/day)
2. **Settings → SMTP & API → API Keys** → create key
3. Copy to `BREVO_API_KEY` in `.env`
4. Set `BREVO_FROM_EMAIL=noreply@yourdomain.com`

## WhatsApp (Baileys)

1. Set `WA_ENABLED=true` in `.env` (or enable the toggle in Admin → Settings → Notifications)
2. Restart: `pm2 restart all`
3. Open **Admin → System Settings → Notifications → WhatsApp**
4. Scan the QR code with your phone (WhatsApp → Linked Devices)
5. Connection persists like WhatsApp Web (session stored in `.wa-auth/` — gitignored)

Test messages go to `ADMIN_WHATSAPP_NUMBER` in `.env`.

---

## Environment variables

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM_EMAIL` | Verified sender address |
| `BREVO_API_KEY` | Brevo fallback API key |
| `BREVO_FROM_EMAIL` | Brevo sender email |
| `EMAIL_PROVIDER` | `resend` \| `brevo` \| `disabled` |
| `WA_ENABLED` | `true` to start Baileys on boot |
| `ADMIN_WHATSAPP_NUMBER` | E.164-ish digits for test messages |

---

## Notes

- Resend free: 3,000 emails/month
- Brevo free: 300 emails/day
- Baileys: completely free; uses your phone number
- WhatsApp may disconnect if the phone has no internet
- DigitalOcean blocks outbound SMTP — do **not** rely on `SMTP_*` for production mail

---

## API (admin)

| Method | Path |
|--------|------|
| GET | `/api/admin/settings/notification-config` |
| POST | `/api/admin/settings/notification-config` |
| POST | `/api/admin/settings/test-email` |
| GET | `/api/admin/settings/whatsapp-status` |
| POST | `/api/admin/settings/whatsapp-enable` |
| POST | `/api/admin/settings/whatsapp-disconnect` |
| POST | `/api/admin/settings/test-whatsapp` |
| GET | `/api/admin/settings/gateway-status` |
