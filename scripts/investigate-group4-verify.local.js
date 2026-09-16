#!/usr/bin/env node
'use strict';
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Attendance = require('../backend/src/models/attendance');
  const Employee = require('../backend/src/models/employee');
  const prisma = require('../backend/src/config/prismaClient');

  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 0, 0, 0, 0);

  const mongoGroups = await Attendance.aggregate([
    { $match: { date: { $gte: start, $lte: end } } },
    { $group: { _id: { staffId: '$staffId', staffUsername: '$staffUsername' }, recorded: { $sum: 1 } } },
    { $sort: { '_id.staffUsername': 1 } }
  ]);
  console.log('Mongo summary groups:', JSON.stringify(mongoGroups, null, 2));

  const pgRows = await prisma.attendance.findMany({
    where: { date: { gte: start, lte: end } },
    select: { staffId: true, staffUsername: true, adminId: true, employeeId: true, legacyId: true }
  });
  const pgKeys = new Map();
  pgRows.forEach((r) => {
    const k = `${r.staffId}::${r.staffUsername || ''}`;
    pgKeys.set(k, (pgKeys.get(k) || 0) + 1);
  });
  console.log('Postgres row group keys:', [...pgKeys.entries()]);

  const emp = await Employee.findOne({ status: 'active' }).sort({ createdAt: -1 }).lean();
  if (emp) {
    const pgEmp = await prisma.employee.findUnique({ where: { legacyId: String(emp._id) } });
    console.log('Employee sample _id:', String(emp._id));
    console.log('Mongo linkedAdminId:', emp.linkedAdminId);
    console.log('PG linkedAdminId:', pgEmp?.linkedAdminId);
    console.log('PG linked admin legacy:', pgEmp?.linkedAdminId
      ? (await prisma.admin.findUnique({ where: { id: pgEmp.linkedAdminId }, select: { legacyId: true } }))?.legacyId
      : null);
    console.log('Mongo __v:', emp.__v);
    console.log('Mongo createdAt:', emp.createdAt?.toISOString());
    console.log('PG createdAt:', pgEmp?.createdAt?.toISOString());
  }

  await mongoose.disconnect();
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
