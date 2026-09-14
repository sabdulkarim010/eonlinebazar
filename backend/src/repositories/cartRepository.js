/********************************************************************
 * Project: EonlineBazar
 * File: cartRepository.js
 * Location: backend/src/repositories/cartRepository.js
 * Description: Prisma repository for Cart + CartItem rows.
 *   CartItem.productId is REQUIRED (Cascade FK) — missing Product aborts item insert.
 *   Stage 2 Step 3, Part 7 — User owned tables dual-write (2026-09-14).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');
const { resolvePostgresUserId } = require('./userRepository');

function toShape(record) {
  if (!record) return null;
  return { ...record, _id: record.id };
}

async function resolveProductIdRequired(mongoProductRef) {
  const ref = String(mongoProductRef || '').trim();
  if (!ref) {
    throw new Error('Cart item product reference is required.');
  }

  let row = await prisma.product.findUnique({ where: { legacyId: ref } });
  if (!row) row = await prisma.product.findUnique({ where: { productId: ref } });
  if (!row) {
    console.error('[DUAL-WRITE-CART-ITEM-FAIL]', {
      timestamp: new Date().toISOString(),
      model: 'CartItem',
      field: 'productId',
      mongoRefId: ref,
      message: 'Product not yet in Postgres — required FK; whole cart item write skipped'
    });
    throw new Error(`Product ${ref} not yet in Postgres for cart item`);
  }
  return row.id;
}

async function findByLegacyId(legacyId) {
  if (!legacyId) return null;
  const record = await prisma.cart.findUnique({ where: { legacyId: String(legacyId) } });
  return toShape(record);
}

async function findByUserId(userId) {
  if (!userId) return [];
  const records = await prisma.cart.findMany({
    where: { userId: String(userId) },
    orderBy: { updatedAt: 'desc' }
  });
  return records.map(toShape);
}

function mapItemToCreate(cartId, item, productPgId) {
  const plain = item.toObject ? item.toObject() : item;
  return {
    cartId,
    productId: productPgId,
    name: String(plain.name || 'Product').trim(),
    price: plain.price != null ? plain.price : 0,
    image: String(plain.image || ''),
    emojiIcon: plain.emojiIcon != null ? String(plain.emojiIcon) : null,
    variantImage: plain.variantImage != null ? String(plain.variantImage) : null,
    icon: String(plain.icon || plain.emojiIcon || '📦').trim() || '📦',
    quantity: Number(plain.quantity) || 1,
    selected: plain.selected !== false,
    variantId: String(plain.variantId || ''),
    variantLabel: String(plain.variantLabel || ''),
    variantAttribute: String(plain.variantAttribute || ''),
    variantValue: String(plain.variantValue || ''),
    variantSku: String(plain.variantSku || ''),
    selectedColor: String(plain.selectedColor || plain.color || ''),
    selectedSize: String(plain.selectedSize || plain.size || '')
  };
}

/** Mirror exact Mongo cart document — replaces all CartItem rows (no userId uniqueness enforced). */
async function syncFromMongo(mongoCart) {
  const plain = mongoCart.toObject ? mongoCart.toObject() : mongoCart;
  const legacyId = plain._id != null ? String(plain._id) : null;
  if (!legacyId) throw new Error('Cart legacyId is required for sync.');

  const pgUserId = await resolvePostgresUserId(plain.userId);
  if (!pgUserId) {
    throw new Error('User not yet in Postgres for cart sync');
  }

  const items = Array.isArray(plain.items) ? plain.items : [];
  const resolvedItems = [];
  for (const item of items) {
    const productRef = item.productId?._id || item.productId;
    // eslint-disable-next-line no-await-in-loop
    const productPgId = await resolveProductIdRequired(productRef);
    resolvedItems.push({ item, productPgId });
  }

  const shared = {
    userId: pgUserId,
    lastActivityAt: plain.lastActivityAt ? new Date(plain.lastActivityAt) : new Date(),
    abandonedNotifiedAt: plain.abandonedNotifiedAt
      ? new Date(plain.abandonedNotifiedAt)
      : null
  };

  let cart = await prisma.cart.findUnique({ where: { legacyId } });
  if (cart) {
    cart = await prisma.cart.update({
      where: { id: cart.id },
      data: shared
    });
  } else {
    cart = await prisma.cart.create({
      data: { legacyId, ...shared }
    });
  }

  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

  for (const { item, productPgId } of resolvedItems) {
    // eslint-disable-next-line no-await-in-loop
    await prisma.cartItem.create({
      data: mapItemToCreate(cart.id, item, productPgId)
    });
  }

  return toShape(cart);
}

async function clearByUserLegacyId(mongoUserLegacyId) {
  const pgUserId = await resolvePostgresUserId(mongoUserLegacyId);
  if (!pgUserId) return { deleted: 0 };
  const result = await prisma.cart.deleteMany({ where: { userId: pgUserId } });
  return { deleted: result.count };
}

module.exports = {
  findByLegacyId,
  findByUserId,
  syncFromMongo,
  clearByUserLegacyId,
  resolveProductIdRequired
};
