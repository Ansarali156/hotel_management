import swaggerUi from 'swagger-ui-express';
import { env } from './env';
import { Express, Request, Response, NextFunction } from 'express';

const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'SafeStay Network API',
    version: '1.0.0',
    description:
      'Dual-portal hotel management and surveillance backend. ' +
      'Hotel portal: room/guest management. Police portal: criminal profiles, verification, alerts.',
    contact: { name: 'SafeStay Backend' },
  },
  servers: [
    { url: `http://localhost:${env.PORT}/api/${env.API_VERSION}`, description: 'Local Dev' },
  ],
  components: {
    schemas: {
      SuccessResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'object' },
          message: { type: 'string', example: 'Success' },
          code: { type: 'integer', example: 200 },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'string', example: 'Error message' },
          code: { type: 'string', example: 'ERROR_CODE' },
        },
      },
    },
  },
  paths: {
    '/hotels/register': {
      post: {
        tags: ['Hotels'],
        summary: 'Hotel self-registration (public)',
        responses: {
          201: { description: 'Hotel registered, rooms created' },
          409: { description: 'Email already exists' },
        },
      },
    },
    '/guests/checkin': {
      post: {
        tags: ['Guests'],
        summary: 'Check in a guest (hotelId required as query param)',
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['fullName', 'age', 'gender', 'phoneNumber', 'roomNumber', 'checkInDate'],
                properties: {
                  hotelId: { type: 'string', description: 'Hotel ID (query param)' },
                  fullName: { type: 'string' },
                  age: { type: 'integer' },
                  gender: { type: 'string', enum: ['MALE', 'FEMALE', 'OTHER'] },
                  phoneNumber: { type: 'string' },
                  roomNumber: { type: 'string' },
                  checkInDate: { type: 'string', format: 'date-time' },
                  aadhaarNumber: { type: 'string', description: 'Stored encrypted — never returned' },
                  guestPhoto: { type: 'string', format: 'binary' },
                  idDocument: { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Guest checked in, room marked OCCUPIED' },
          400: { description: 'Validation error' },
          404: { description: 'Room not found' },
        },
      },
    },
    '/verification/run': {
      post: {
        tags: ['Verification'],
        summary: 'Queue a background verification sweep',
        responses: {
          202: { description: 'Verification job enqueued' },
        },
      },
    },
  },
};

function requireSwaggerAuth(req: Request, res: Response, next: NextFunction): void {
  if (env.NODE_ENV !== 'production') { next(); return; }
  const b64 = (req.headers.authorization ?? '').replace('Basic ', '');
  const [user, pass] = Buffer.from(b64, 'base64').toString().split(':');
  if (user === env.SWAGGER_USERNAME && pass === env.SWAGGER_PASSWORD) {
    next();
    return;
  }
  res.set('WWW-Authenticate', 'Basic realm="SafeStay API Docs"');
  res.status(401).send('Unauthorized');
}

export const setupSwagger = (app: Express): void => {
  app.use('/api-docs', requireSwaggerAuth, swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    customSiteTitle: 'SafeStay API Docs',
  }));
};
