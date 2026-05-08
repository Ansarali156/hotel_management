import { test, expect } from '@playwright/test';

const API = '/api/v1';

test.describe('Cross-portal token misuse (E2E)', () => {
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

  test('hotel JWT cannot call police-only dashboard stats', async ({ request }) => {
    const email = process.env.E2E_HOTEL_EMAIL ?? 'grand@hotel.com';
    const password = process.env.E2E_HOTEL_PASSWORD ?? 'Hotel@1234';

    const loginRes = await request.post(`${API}/auth/hotel/login`, {
      data: { email, password },
    });
    expect(loginRes.ok(), await loginRes.text()).toBeTruthy();
    const { accessToken } = ((await loginRes.json()) as { data: { accessToken: string } }).data;

    const dash = await request.get(`${API}/dashboard/stats`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(dash.status()).toBe(403);
  });

  test('police JWT cannot call hotel profile', async ({ request }) => {
    const userId = process.env.E2E_POLICE_BADGE ?? 'PB001';
    const password = process.env.E2E_POLICE_PASSWORD ?? 'Officer@1234';

    const loginRes = await request.post(`${API}/auth/police/login`, {
      data: { userId, password },
    });
    expect(loginRes.ok(), await loginRes.text()).toBeTruthy();
    const { accessToken } = ((await loginRes.json()) as { data: { accessToken: string } }).data;

    const prof = await request.get(`${API}/hotels/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(prof.status()).toBe(403);
  });
});
