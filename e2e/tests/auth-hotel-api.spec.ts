import { test, expect } from '@playwright/test';

const API = '/api/v1';

test.describe('Hotel auth API E2E', () => {
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

  test('login → profile → refresh rotation → reuse revokes family', async ({ request }) => {
    const email = process.env.E2E_HOTEL_EMAIL ?? 'grand@hotel.com';
    const password = process.env.E2E_HOTEL_PASSWORD ?? 'Hotel@1234';

    const loginRes = await request.post(`${API}/auth/hotel/login`, {
      data: { email, password },
    });
    expect(loginRes.ok(), await loginRes.text()).toBeTruthy();
    const loginJson = (await loginRes.json()) as {
      success: boolean;
      data: { accessToken: string; refreshToken: string };
    };
    expect(loginJson.success).toBe(true);
    const { accessToken, refreshToken: r1 } = loginJson.data;

    const prof = await request.get(`${API}/hotels/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(prof.ok(), await prof.text()).toBeTruthy();

    const ref1 = await request.post(`${API}/auth/hotel/refresh`, {
      data: { refreshToken: r1 },
    });
    expect(ref1.ok(), await ref1.text()).toBeTruthy();
    const ref1Json = (await ref1.json()) as {
      data: { accessToken: string; refreshToken: string };
    };
    const { accessToken: a2, refreshToken: r2 } = ref1Json.data;

    const prof2 = await request.get(`${API}/hotels/profile`, {
      headers: { Authorization: `Bearer ${a2}` },
    });
    expect(prof2.ok(), await prof2.text()).toBeTruthy();

    const replayR1 = await request.post(`${API}/auth/hotel/refresh`, {
      data: { refreshToken: r1 },
    });
    expect(replayR1.status()).toBe(401);

    const replayR2 = await request.post(`${API}/auth/hotel/refresh`, {
      data: { refreshToken: r2 },
    });
    expect(replayR2.status()).toBe(401);
  });

  test('logout rejects further refresh for that session', async ({ request }) => {
    const email = process.env.E2E_HOTEL_EMAIL ?? 'grand@hotel.com';
    const password = process.env.E2E_HOTEL_PASSWORD ?? 'Hotel@1234';

    const loginRes = await request.post(`${API}/auth/hotel/login`, {
      data: { email, password },
    });
    expect(loginRes.ok(), await loginRes.text()).toBeTruthy();
    const loginJson = (await loginRes.json()) as {
      data: { accessToken: string; refreshToken: string };
    };
    const { accessToken, refreshToken } = loginJson.data;

    const out = await request.post(`${API}/auth/hotel/logout`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { refreshToken },
    });
    expect(out.ok(), await out.text()).toBeTruthy();

    const refAfter = await request.post(`${API}/auth/hotel/refresh`, {
      data: { refreshToken },
    });
    expect(refAfter.status()).toBe(401);
  });

  test('bearer-only logout revokes stored refresh (cannot rotate after)', async ({ request }) => {
    const email = process.env.E2E_HOTEL_EMAIL ?? 'grand@hotel.com';
    const password = process.env.E2E_HOTEL_PASSWORD ?? 'Hotel@1234';

    const loginRes = await request.post(`${API}/auth/hotel/login`, {
      data: { email, password },
    });
    expect(loginRes.ok(), await loginRes.text()).toBeTruthy();
    const loginJson = (await loginRes.json()) as {
      data: { accessToken: string; refreshToken: string };
    };
    const { accessToken, refreshToken } = loginJson.data;

    const out = await request.post(`${API}/auth/hotel/logout`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {},
    });
    expect(out.ok(), await out.text()).toBeTruthy();

    const refAfter = await request.post(`${API}/auth/hotel/refresh`, {
      data: { refreshToken },
    });
    expect(refAfter.status()).toBe(401);
  });
});
