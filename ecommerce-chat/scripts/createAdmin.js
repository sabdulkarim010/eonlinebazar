#!/usr/bin/env node
/**
 * CLI: Create a chat agent / admin
 * Usage: node scripts/createAdmin.js
 *    or: npm run create-admin
 */
require('dotenv').config();

const readline = require('readline');
const mongoose = require('mongoose');
const Agent = require('../models/Agent.model');

const MONGO_URI =
  process.env.MONGO_URI || 'mongodb://localhost:27017/ecommerce_chat';

const VALID_ROLES = ['AGENT', 'ADMIN', 'SUPER_ADMIN'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createRl() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(String(answer || '').trim()));
  });
}

/**
 * Mask password with asterisks when TTY + setRawMode available.
 */
function askPassword(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
      const rl = createRl();
      rl.question(question, (answer) => {
        rl.close();
        resolve(String(answer || ''));
      });
      return;
    }

    stdout.write(question);
    let password = '';

    const onData = (buf) => {
      const char = buf.toString('utf8');

      if (char === '\n' || char === '\r' || char === '\u0004') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        stdout.write('\n');
        resolve(password);
        return;
      }

      if (char === '\u0003') {
        stdin.setRawMode(false);
        stdout.write('\n');
        process.exit(1);
      }

      if (char === '\u0008' || char === '\u007f') {
        if (password.length > 0) {
          password = password.slice(0, -1);
          stdout.write('\b \b');
        }
        return;
      }

      // Ignore control chars
      if (char.charCodeAt(0) < 32) return;

      password += char;
      stdout.write('*');
    };

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
  });
}

async function main() {
  console.log('\n=== Create Chat Agent / Admin ===\n');
  console.log('Usage: node scripts/createAdmin.js\n');

  const rl = createRl();

  try {
    const name = await ask(rl, 'Name: ');
    if (!name) {
      console.error('❌ Name is required');
      process.exit(1);
    }

    const email = (await ask(rl, 'Email: ')).toLowerCase();
    if (!EMAIL_RE.test(email)) {
      console.error('❌ Invalid email format');
      process.exit(1);
    }

    rl.close();

    const password = await askPassword('Password (min 8 chars): ');
    if (!password || password.length < 8) {
      console.error('❌ Password must be at least 8 characters');
      process.exit(1);
    }

    const rl2 = createRl();
    const roleInput = (
      await ask(rl2, `Role (${VALID_ROLES.join(' / ')}): `)
    ).toUpperCase();
    rl2.close();

    if (!VALID_ROLES.includes(roleInput)) {
      console.error(`❌ Role must be one of: ${VALID_ROLES.join(', ')}`);
      process.exit(1);
    }

    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB connected');

    const existing = await Agent.findOne({ email });
    if (existing) {
      console.error(`❌ Agent already exists with email: ${email}`);
      process.exit(1);
    }

    const agent = await Agent.create({
      name,
      email,
      password,
      role: roleInput,
    });

    console.log('\n✅ Agent created successfully!');
    console.log({
      id: String(agent._id),
      name: agent.name,
      email: agent.email,
      role: agent.role,
    });
    console.log('');
  } catch (err) {
    console.error('❌ Failed:', err.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close().catch(() => {});
  }
}

main();
