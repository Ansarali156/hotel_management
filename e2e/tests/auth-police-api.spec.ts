import { test, expect } from '@playwright/test';

const API = '/api/v1';

test.describe('Police auth API E2E', () => {
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

  test('login → refresh rotation → reuse revokes family', async ({ request }) => {
    const userId = process.env.E2E_POLICE_BADGE ?? 'PB001';
    const password = process.env.E2E_POLICE_PASSWORD ?? 'Officer@1234';

    const loginRes = await request.post(`${API}/auth/police/login`, {
      data: { userId, password },
    });
    expect(loginRes.ok(), await loginRes.text()).toBeTruthy();
    const loginJson = (await loginRes.json()) as {
      success: boolean;
      data: { accessToken: string; refreshToken: string };
    };
    expect(loginJson.success).toBe(true);
    const { accessToken, refreshToken: r1 } = loginJson.data;

    const dash = await request.get(`${API}/dashboard/stats`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(dash.ok(), await dash.text()).toBeTruthy();

    const ref1 = await request.post(`${API}/auth/police/refresh`, {
      data: { refreshToken: r1 },
    });
    expect(ref1.ok(), await ref1.text()).toBeTruthy();
    const ref1Json = (await ref1.json()) as {
      data: { accessToken: string; refreshToken: string };
    };
    const { refreshToken: r2 } = ref1Json.data;

    const replayR1 = await request.post(`${API}/auth/police/refresh`, {
      data: { refreshToken: r1 },
    });
    expect(replayR1.status()).toBe(401);

    const replayR2 = await request.post(`${API}/auth/police/refresh`, {
      data: { refreshToken: r2 },
    });
    expect(replayR2.status()).toBe(401);
  });
});
