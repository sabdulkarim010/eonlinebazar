#!/usr/bin/env node
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const ContactMessage = require('../backend/src/models/ContactMessage');
  const prisma = require('../backend/src/config/prismaClient');

  const listUnreadMongo = await ContactMessage.countDocuments({
    $or: [
      { status: 'unread' },
      { status: { $exists: false }, isRead: false }
    ]
  });
  const statsUnreadMongo = await ContactMessage.countDocuments({ isRead: false });

  const pgUnread = await prisma.contactMessage.count({ where: { isRead: false } });

  const legacyUnread = await ContactMessage.find({ status: 'unread' }).lean();
  const noStatusUnread = await ContactMessage.find({
    status: { $exists: false },
    isRead: false
  }).lean();

  console.log('Mongo list unreadCount query:', listUnreadMongo);
  console.log('Mongo stats unread (isRead false):', statsUnreadMongo);
  console.log('Postgres isRead false:', pgUnread);
  console.log('Legacy status unread docs:', legacyUnread.length);
  legacyUnread.forEach((d) => console.log(' ', d._id, 'isRead=', d.isRead));
  console.log('No-status isRead false:', noStatusUnread.length);

  const mongoAll = await ContactMessage.find().sort({ createdAt: -1 }).lean();
  for (const m of mongoAll) {
    const pg = await prisma.contactMessage.findUnique({ where: { legacyId: String(m._id) } });
    if (!pg) {
      console.log('MISSING PG', m._id);
      continue;
    }
    const caDiff = new Date(m.createdAt).getTime() !== new Date(pg.createdAt).getTime();
    const uaDiff = m.updatedAt && pg.updatedAt
      && new Date(m.updatedAt).getTime() !== new Date(pg.updatedAt).getTime();
    if (caDiff || uaDiff) {
      console.log('TS drift', m._id, {
        mongoCreated: m.createdAt,
        pgCreated: pg.createdAt,
        mongoUpdated: m.updatedAt,
        pgUpdated: pg.updatedAt,
        isReadMongo: m.isRead,
        isReadPg: pg.isRead
      });
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
