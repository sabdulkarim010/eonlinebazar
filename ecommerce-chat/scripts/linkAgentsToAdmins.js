/**
 * One-time migration: link ecommerce-chat Agent rows to main-store Admin accounts.
 *
 * Usage (from repo root):
 *   cd ecommerce-chat
 *   node scripts/linkAgentsToAdmins.js
 *
 * Env:
 *   MONGO_URI          — chat DB (default mongodb://localhost:27017/ecommerce_chat)
 *   STORE_MONGODB_URI  — main store DB (falls back to repo-root MONGODB_URI)
 */

require('../config/loadEnv');
const path = require('path');
const mongoose = require('mongoose');

const CHAT_URI =
  process.env.MONGO_URI || 'mongodb://localhost:27017/ecommerce_chat';

function loadStoreMongoUri() {
  if (process.env.STORE_MONGODB_URI) {
    return process.env.STORE_MONGODB_URI;
  }
  require('dotenv').config({
    path: path.join(__dirname, '..', '..', '.env'),
  });
  require('dotenv').config({
    path: path.join(__dirname, '..', '..', 'backend', '.env'),
  });
  return process.env.MONGODB_URI || process.env.MONGO_URI || null;
}

async function linkAgentsToAdmins() {
  const storeUri = loadStoreMongoUri();
  if (!storeUri) {
    console.error(
      'STORE_MONGODB_URI or repo-root MONGODB_URI is required for admin lookup.'
    );
    process.exit(1);
  }

  const chatConn = mongoose.createConnection(CHAT_URI);
  const storeConn = mongoose.createConnection(storeUri);

  await Promise.all([
    chatConn.asPromise(),
    storeConn.asPromise(),
  ]);

  const agentsCol = chatConn.collection('agents');
  const adminsCol = storeConn.collection('admins');

  const agents = await agentsCol
    .find({
      $or: [{ adminId: { $exists: false } }, { adminId: null }],
    })
    .toArray();

  console.log(`Found ${agents.length} agent(s) without adminId`);

  for (const agent of agents) {
    const email = agent.email ? String(agent.email).toLowerCase() : '';
    const usernameFromEmail = email.includes('@') ? email.split('@')[0] : '';

    const admin = await adminsCol.findOne({
      $or: [
        ...(email ? [{ email }] : []),
        ...(agent.storeAdminUsername
          ? [{ username: agent.storeAdminUsername }]
          : []),
        ...(usernameFromEmail ? [{ username: usernameFromEmail }] : []),
      ],
    });

    if (admin) {
      await agentsCol.updateOne(
        { _id: agent._id },
        {
          $set: {
            adminId: admin._id,
            storeAdminUsername:
              agent.storeAdminUsername || admin.username || null,
          },
        }
      );
      console.log(
        `Linked agent ${agent.email || agent._id} → admin ${admin.username}`
      );
    } else {
      console.log(`No admin found for agent: ${agent.email || agent._id}`);
    }
  }

  console.log('Migration complete');
  await chatConn.close();
  await storeConn.close();
  process.exit(0);
}

linkAgentsToAdmins().catch((err) => {
  console.error(err);
  process.exit(1);
});
