// Manual Jest mock for argon2 — replaces native binary in test environment
const argon2 = {
  hash: jest.fn().mockResolvedValue('$argon2id$hashed'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
  argon2i: 1,
  argon2d: 0,
};
module.exports = argon2;
module.exports.default = argon2;
