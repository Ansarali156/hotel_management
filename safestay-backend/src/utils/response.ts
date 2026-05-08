import { Response } from 'express';

export const sendSuccess = (
  res: Response,
  data: unknown,
  message = 'Success',
  statusCode = 200
) => {
  return res.status(statusCode).json({ success: true, data, message, code: statusCode });
};

export const sendCreated = (res: Response, data: unknown, message = 'Created') =>
  sendSuccess(res, data, message, 201);
