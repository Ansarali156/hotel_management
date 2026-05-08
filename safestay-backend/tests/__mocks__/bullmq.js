/**
 * Jest mock for BullMQ — prevents real Redis connections in test environment.
 * Mirrors only the surface the verification queue and worker code uses.
 */

const mockJob = {
  id: 'mock-job-id',
  data: {},
  attemptsMade: 0,
};

const Queue = jest.fn().mockImplementation(() => ({
  add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  close: jest.fn().mockResolvedValue(undefined),
}));

const Worker = jest.fn().mockImplementation(() => ({
  on: jest.fn().mockReturnThis(),
  close: jest.fn().mockResolvedValue(undefined),
}));

module.exports = { Queue, Worker, mockJob };
module.exports.default = { Queue, Worker };
