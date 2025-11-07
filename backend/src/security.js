const { randomBytes, pbkdf2Sync, createHmac, timingSafeEqual } = require('node:crypto');
const { JWT_SECRET } = require('./config');

const ITERATIONS = 120000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(plain, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return { salt, hash, iterations: ITERATIONS, digest: DIGEST };
}

function verifyPassword(plain, user) {
  if (!user) return false;
  const {
    password_salt: salt,
    password_hash: hash,
    password_iterations: iterations = ITERATIONS,
    password_digest: digest = DIGEST,
  } = user;
  if (!salt || !hash) return false;
  const candidate = pbkdf2Sync(plain, salt, Number(iterations), KEY_LENGTH, digest).toString('hex');
  const storedBuf = Buffer.from(hash, 'hex');
  const candidateBuf = Buffer.from(candidate, 'hex');
  if (storedBuf.length !== candidateBuf.length) {
    return false;
  }
  return timingSafeEqual(storedBuf, candidateBuf);
}

function base64UrlEncode(input) {
  return Buffer.from(JSON.stringify(input)).toString('base64url');
}

function signToken(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);
  const signature = createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, signature] = parts;
  const expected = createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  if (signature !== expected) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
    if (payload.exp && Date.now() >= payload.exp) {
      return null;
    }
    return payload;
  } catch (err) {
    return null;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
};
