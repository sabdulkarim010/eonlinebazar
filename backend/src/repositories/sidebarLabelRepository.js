'use strict';

const prisma = require('../config/prismaClient');

async function findAllMap() {
  const rows = await prisma.sidebarLabel.findMany({
    orderBy: { menuKey: 'asc' }
  });
  const map = {};
  rows.forEach((row) => {
    map[row.menuKey] = row.label;
  });
  return map;
}

async function upsertLabel(menuKey, label, adminId) {
  const record = await prisma.sidebarLabel.upsert({
    where: { menuKey },
    create: { menuKey, label, adminId },
    update: { label, adminId }
  });
  return record;
}

async function deleteAll() {
  const result = await prisma.sidebarLabel.deleteMany({});
  return result.count || 0;
}

module.exports = {
  findAllMap,
  upsertLabel,
  deleteAll
};
