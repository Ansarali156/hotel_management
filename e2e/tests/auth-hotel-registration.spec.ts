import { test, expect } from '@playwright/test';

const API = '/api/v1';

test.describe('Hotel registration API E2E', () => {
  test.beforeAll(async ({ request }) => {
    let healthy = false;
    try {
      const health = await request.get('/health');
      healthy = health.ok();
    } catch {
      healthy = false;
    }
    test.skip(
      !healthy,
      'Backend not reachable (GET /health failed). Start docker-compose, migrate, seed:demo, and the API server.'
    );
  });

  test('registers hotel with valid payload then allows login', async ({ request }) => {
    const stamp = Date.now();
    const email = `e2e-reg-${stamp}@hotel.test`;
    const password = 'StrongPass@123';

    const registerRes = await request.post(`${API}/hotels/register`, {
      data: {
        hotelName: `E2E Hotel ${stamp}`,
        email,
        password,
        totalFloors: 2,
        roomsPerFloor: 2,
        roomCategories: ['Single', 'Double'],
        contactNumber: '9876543210',
        address: 'E2E Street',
        licenseNumber: `LIC-E2E-${stamp}`,
        maxGuestsPerRoom: 2,
      },
    });

    expect(registerRes.ok(), await registerRes.text()).toBeTruthy();
    const registerJson = (await registerRes.json()) as {
      success: boolean;
      data: { hotelId: string };
    };
    expect(registerJson.success).toBe(true);
    expect(registerJson.data.hotelId).toBeTruthy();

    const loginRes = await request.post(`${API}/auth/hotel/login`, {
      data: { email, password },
    });
    expect(loginRes.ok(), await loginRes.text()).toBeTruthy();
  });

  test('rejects weak password with validation error', async ({ request }) => {
    const stamp = Date.now();
    const weakRes = await request.post(`${API}/hotels/register`, {
      data: {
        hotelName: `E2E Weak ${stamp}`,
        email: `e2e-weak-${stamp}@hotel.test`,
        password: 'weakpass',
        totalFloors: 1,
        roomsPerFloor: 1,
        roomCategories: ['Single'],
      },
    });

    expect(weakRes.status()).toBe(400);
    const weakJson = (await weakRes.json()) as {
      code?: string;
      error?: string;
    };
    expect(weakJson.code).toBe('VALIDATION_ERROR');
    expect(weakJson.error).toBeTruthy();
  });

  test('rejects duplicate email registration', async ({ request }) => {
    const stamp = Date.now();
    const email = `e2e-dup-${stamp}@hotel.test`;
    const payload = {
      hotelName: `E2E Dup ${stamp}`,
      email,
      password: 'StrongPass@123',
      totalFloors: 1,
      roomsPerFloor: 1,
      roomCategories: ['Single'],
      licenseNumber: `LIC-DUP-${stamp}`,
    };

    const first = await request.post(`${API}/hotels/register`, { data: payload });
    expect(first.ok(), await first.text()).toBeTruthy();

    const second = await request.post(`${API}/hotels/register`, { data: payload });
    expect(second.status()).toBe(409);
    const secondJson = (await second.json()) as { code?: string };
    expect(secondJson.code).toBe('HOTEL_EXISTS');
  });
});