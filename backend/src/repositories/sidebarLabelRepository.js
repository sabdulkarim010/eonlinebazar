'use strict';

function getPrisma() {
  return require('../config/prismaClient');
}

async function findAllMap() {
  try {
    const prisma = getPrisma();
    if (!prisma?.sidebarLabel?.findMany) {
      console.warn('[SidebarLabel] sidebarLabel model not available on Prisma client');
      return {};
    }
    const rows = await prisma.sidebarLabel.findMany({
      orderBy: { menuKey: 'asc' }
    });
    return Object.fromEntries(rows.map((row) => [row.menuKey, row.label]));
  } catch (err) {
    console.warn('[SidebarLabel] DB error:', err.message);
    return {};
  }
}

async function upsertLabel(menuKey, label, adminId) {
  try {
    const prisma = getPrisma();
    if (!prisma?.sidebarLabel?.upsert) {
      const err = new Error('SidebarLabel model not available on Prisma client');
      err.code = 'SIDEBAR_LABEL_UNAVAILABLE';
      throw err;
    }
    const record = await prisma.sidebarLabel.upsert({
      where: { menuKey },
      create: { menuKey, label, adminId },
      update: { label, adminId }
    });
    return record;
  } catch (err) {
    console.warn('[SidebarLabel] upsert error:', err.message);
    throw err;
  }
}

async function deleteAll() {
  try {
    const prisma = getPrisma();
    if (!prisma?.sidebarLabel?.deleteMany) {
      console.warn('[SidebarLabel] sidebarLabel model not available on Prisma client');
      return 0;
    }
    const result = await prisma.sidebarLabel.deleteMany({});
    return result.count || 0;
  } catch (err) {
    console.warn('[SidebarLabel] deleteAll error:', err.message);
    return 0;
  }
}

module.exports = {
  findAllMap,
  upsertLabel,
  deleteAll
};
