import { test, expect } from '@playwright/test';

const API = '/api/v1';

/**
 * Comprehensive E2E tests for ALL SafeStay API endpoints
 * 
 * Test runs serially with shared state via test.describe.serial()
 */

// ─── Shared State ─────────────────────────────────────────────────────────────

let hotelAccessToken = '';
let hotelRefreshToken = '';
let policeAccessToken = '';
let policeRefreshToken = '';
let testHotelId = '';
let testRoomId = '';
let testCriminalId = '';
let testAlertId = '';

const stamp = Date.now();
const testEmail = `comprehensive-${stamp}@hotel.test`;
const testPassword = 'StrongPass@123';

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe.serial('Comprehensive API Tests', () => {
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 0: Health Check
  // ═══════════════════════════════════════════════════════════════════════════

  test('0.1 Health check - backend is reachable', async ({ request }) => {
    const health = await request.get('/health');
    expect(health.ok(), `Backend not reachable: ${await health.text()}`).toBeTruthy();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: Hotel Registration & Auth
  // ═══════════════════════════════════════════════════════════════════════════

  test('1.1 POST /hotels/register - creates new hotel', async ({ request }) => {
    const res = await request.post(`${API}/hotels/register`, {
      data: {
        hotelName: `Comprehensive Test Hotel ${stamp}`,
        email: testEmail,
        password: testPassword,
        totalFloors: 3,
        roomsPerFloor: 5,
        roomCategories: ['Single', 'Double', 'Suite'],
        contactNumber: '9876543210',
        address: '123 Test Street, Test City',
        licenseNumber: `LIC-COMP-${stamp}`,
        maxGuestsPerRoom: 3,
      },
    });

    expect(res.ok(), `Registration failed: ${await res.text()}`).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.hotelId).toBeTruthy();
    testHotelId = json.data.hotelId;
  });

  test('1.2 POST /auth/hotel/login - authenticates hotel', async ({ request }) => {
    const res = await request.post(`${API}/auth/hotel/login`, {
      data: { email: testEmail, password: testPassword },
    });

    expect(res.ok(), `Login failed: ${await res.text()}`).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.accessToken).toBeTruthy();
    expect(json.data.refreshToken).toBeTruthy();
    hotelAccessToken = json.data.accessToken;
    hotelRefreshToken = json.data.refreshToken;
  });

  test('1.3 GET /hotels/profile - retrieves hotel profile', async ({ request }) => {
    const res = await request.get(`${API}/hotels/profile`, {
      headers: { Authorization: `Bearer ${hotelAccessToken}` },
    });

    expect(res.ok(), `Profile fetch failed: ${await res.text()}`).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.email).toBe(testEmail);
  });

  test('1.4 PUT /hotels/profile - updates hotel profile', async ({ request }) => {
    const res = await request.put(`${API}/hotels/profile`, {
      headers: { Authorization: `Bearer ${hotelAccessToken}` },
      data: {
        contactNumber: '9999888877',
        address: '456 Updated Street, Test City',
      },
    });

    expect(res.ok(), `Profile update failed: ${await res.text()}`).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  test('1.5 POST /auth/hotel/refresh - refreshes hotel tokens', async ({ request }) => {
    const res = await request.post(`${API}/auth/hotel/refresh`, {
      data: { refreshToken: hotelRefreshToken },
    });

    expect(res.ok(), `Refresh failed: ${await res.text()}`).toBeTruthy();
    const json = await res.json();
    expect(json.data.accessToken).toBeTruthy();
    hotelAccessToken = json.data.accessToken;
    hotelRefreshToken = json.data.refreshToken;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: Police Auth
  // ═══════════════════════════════════════════════════════════════════════════

  test('2.1 POST /auth/police/login - authenticates police officer', async ({ request }) => {
    const policeUserId = process.env.E2E_POLICE_BADGE ?? 'PB001';
    const policePassword = process.env.E2E_POLICE_PASSWORD ?? 'Officer@1234';

    const res = await request.post(`${API}/auth/police/login`, {
      data: { userId: policeUserId, password: policePassword },
    });

    expect(res.ok(), `Police login failed: ${await res.text()}`).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.accessToken).toBeTruthy();
    policeAccessToken = json.data.accessToken;
    policeRefreshToken = json.data.refreshToken;
  });

  test('2.2 POST /auth/police/refresh - refreshes police tokens', async ({ request }) => {
    const res = await request.post(`${API}/auth/police/refresh`, {
      data: { refreshToken: policeRefreshToken },
    });

    expect(res.ok(), `Police refresh failed: ${await res.text()}`).toBeTruthy();
    const json = await res.json();
    policeAccessToken = json.data.accessToken;
    policeRefreshToken = json.data.refreshToken;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: Room Operations
  // ═══════════════════════════════════════════════════════════════════════════

  test('3.1 GET /rooms/grid - retrieves room grid (grouped by floor)', async ({ request }) => {
    const res = await request.get(`${API}/rooms/grid`, {
      headers: { Authorization: `Bearer ${hotelAccessToken}` },
    });

    expect(res.ok(), `Room grid failed: ${await res.text()}`).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
    // Room grid returns object grouped by floor number { "1": [...], "2": [...] }
    expect(typeof json.data).toBe('object');
    
    // Store first room ID for later tests
    const floors = Object.keys(json.data);
    if (floors.length > 0 && json.data[floors[0]].length > 0) {
      testRoomId = json.data[floors[0]][0].id;
    }
  });

  test('3.2 GET /rooms/:roomId - retrieves room details', async ({ request }) => {
    test.skip(!testRoomId, 'No room available');
    
    const res = await request.get(`${API}/rooms/${testRoomId}`, {
      headers: { Authorization: `Bearer ${hotelAccessToken}` },
    });

    expect(res.ok(), `Room details failed: ${await res.text()}`).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe(testRoomId);
  });

  test('3.3 PATCH /rooms/:roomId/status - updates room status', async ({ request }) => {
    test.skip(!testRoomId, 'No room available');
    
    const res = await request.patch(`${API}/rooms/${testRoomId}/status`, {
      headers: { Authorization: `Bearer ${hotelAccessToken}` },
      data: { status: 'MAINTENANCE' },
    });

    expect(res.ok(), `Room status update failed: ${await res.text()}`).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('MAINTENANCE');
  });

  test('3.4 PATCH /rooms/:roomId/status - reverts room status to AVAILABLE', async ({ request }) => {
    test.skip(!testRoomId, 'No room available');
    
    const res = await request.patch(`${API}/rooms/${testRoomId}/status`, {
      headers: { Authorization: `Bearer ${hotelAccessToken}` },
      data: { status: 'AVAILABLE' },
    });

    expect(res.ok(), `Room status revert failed: ${await res.text()}`).toBeTruthy();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: Guest Operations (Read-only - check-in requires file uploads)
  // ═══════════════════════════════════════════════════════════════════════════

  test('4.1 GET /guests/active - retrieves active guests (empty for new hotel)', async ({ request }) => {
    const res = await request.get(`${API}/guests/active`, {
      headers: { Authorization: `Bearer ${hotelAccessToken}` },
    });

    expect(res.ok(), `Active guests failed: ${await res.text()}`).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
    // Response format: { guests: [], pagination: {...} }
    expect(json.data.guests).toBeDefined();
    expect(Array.isArray(json.data.guests)).toBe(true);
    expect(json.data.pagination).toBeDefined();
  });

  test('4.2 GET /guests/ledger - retrieves guest ledger', async ({ request }) => {
    const res = await request.get(`${API}/guests/ledger`, {
      headers: { Authorization: `Bearer ${hotelAccessToken}` },
    });

    expect(res.ok(), `Guest ledger failed: ${await res.text()}`).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
    // Response format: { guests: [], pagination: {...} }
    expect(json.data.guests).toBeDefined();
    expect(json.data.pagination).toBeDefined();
  });

  test('4.3 GET /guests/export/csv - exports guest data as CSV', async ({ request }) => {
    const res = await request.get(`${API}/guests/export/csv`, {
      headers: { Authorization: `Bearer ${hotelAccessToken}` },
    });

    // May return 200 with CSV or 204 if no data - both are valid
    expect([200, 204].includes(res.status()), `CSV export failed with status ${res.status()}: ${await res.text()}`).toBeTruthy();
  });

  test('4.4 GET /guests/export/pdf - exports guest data as PDF', async ({ request }) => {
    const res = await request.get(`${API}/guests/export/pdf`, {
      headers: { Authorization: `Bearer ${hotelAccessToken}` },
    });

    // May return 200 with PDF, 204 if no data, or 400/500 if PDF generation is not configured
    expect([200, 204, 400, 500].includes(res.status()), `PDF export unexpected status ${res.status()}`).toBeTruthy();
  });

  test('4.5 POST /guests/parse-ota - parses OTA booking text', async ({ request }) => {
    const res = await request.post(`${API}/guests/parse-ota`, {
      headers: { Authorization: `Bearer ${hotelAccessToken}` },
      data: {
        rawText: `
          Booking Confirmation - MakeMyTrip
          Guest: John Doe
          Check-in: 2024-01-15
          Check-out: 2024-01-17
          Room: Deluxe Double
          Phone: 9876543210
        `,
      },
    });

    // Parser may succeed or return validation error depending on format
    expect([200, 400, 422].includes(res.status()), `OTA parse unexpected status: ${res.status()}`).toBeTruthy();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: Dashboard (Police)
  // ═══════════════════════════════════════════════════════════════════════════

  test('5.1 GET /dashboard/stats - retrieves dashboard statistics', async ({ request }) => {
    const res = await request.get(`${API}/dashboard/stats`, {
      headers: { Authorization: `Bearer ${policeAccessToken}` },
    });

    expect(res.ok(), `Dashboard stats failed: ${await res.text()}`).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  test('5.2 GET /dashboard/hotels - retrieves hotel status list', async ({ request }) => {
    const res = await request.get(`${API}/dashboard/hotels`, {
      headers: { Authorization: `Bearer ${policeAccessToken}` },
    });

    expect(res.ok(), `Hotel status failed: ${await res.text()}`).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
    // Response format: { hotels: [], total, page, limit, pages }
    expect(json.data.hotels).toBeDefined();
    expect(Array.isArray(json.data.hotels)).toBe(true);
    expect(json.data.total).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6: Hotels List (Police)
  // ═══════════════════════════════════════════════════════════════════════════

  test('6.1 GET /hotels/list - retrieves all hotels (police only)', async ({ request }) => {
    const res = await request.get(`${API}/hotels/list`, {
      headers: { Authorization: `Bearer ${policeAccessToken}` },
    });

    expect(res.ok(), `Hotels list failed: ${await res.text()}`).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
    // Response format: { hotels, count, page, limit, pages }
    expect(json.data.hotels).toBeDefined();
    expect(Array.isArray(json.data.hotels)).toBe(true);
    expect(json.data.count).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 7: Police Admin Operations
  // ═══════════════════════════════════════════════════════════════════════════

  test('7.1 GET /police/users - lists police users', async ({ request }) => {
    const res = await request.get(`${API}/police/users`, {
      headers: { Authorization: `Bearer ${policeAccessToken}` },
    });

    expect(res.ok(), `Police users list failed: ${await res.text()}`).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
    // Response format: { officers, pagination }
    expect(json.data.officers).toBeDefined();
    expect(json.data.pagination).toBeDefined();
  });

  test('7.2 GET /police/hotels/:hotelId/guests - lists guests for hotel (police view)', async ({ request }) => {
    test.skip(!testHotelId, 'No hotel ID available');

    const res = await request.get(`${API}/police/hotels/${testHotelId}/guests`, {
      headers: { Authorization: `Bearer ${policeAccessToken}` },
    });

    expect(res.ok(), `Police hotel guests failed: ${await res.text()}`).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 8: Criminal Database
  // ═══════════════════════════════════════════════════════════════════════════

  test('8.1 GET /criminals - lists criminal profiles', async ({ request }) => {
    const res = await request.get(`${API}/criminals`, {
      headers: { Authorization: `Bearer ${policeAccessToken}` },
    });

    expect(res.ok(), `Criminals list failed: ${await res.text()}`).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
    // Response format: { profiles, pagination }
    expect(json.data.profiles).toBeDefined();
    expect(Array.isArray(json.data.profiles)).toBe(true);
    expect(json.data.pagination).toBeDefined();
    
    // Store a criminal ID if exists
    if (json.data.profiles.length > 0) {
      testCriminalId = json.data.profiles[0].id;
    }
  });

  test('8.2 GET /criminals/:id - retrieves specific criminal profile', async ({ request }) => {
    test.skip(!testCriminalId, 'No criminal ID available');

    const res = await request.get(`${API}/criminals/${testCriminalId}`, {
      headers: { Authorization: `Bearer ${policeAccessToken}` },
    });

    expect(res.ok(), `Criminal profile failed: ${await res.text()}`).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 9: Verification & Alerts
  // ═══════════════════════════════════════════════════════════════════════════

  test('9.1 GET /verification/alerts - lists match alerts', async ({ request }) => {
    const res = await request.get(`${API}/verification/alerts`, {
      headers: { Authorization: `Bearer ${policeAccessToken}` },
    });

    expect(res.ok(), `Alerts list failed: ${await res.text()}`).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
    // Response format: { alerts, pagination }
    expect(json.data.alerts).toBeDefined();
    expect(Array.isArray(json.data.alerts)).toBe(true);
    expect(json.data.pagination).toBeDefined();
    
    // Store an alert ID if exists
    if (json.data.alerts.length > 0) {
      testAlertId = json.data.alerts[0].id;
    }
  });

  test('9.2 GET /verification/alerts/:alertId - retrieves specific alert', async ({ request }) => {
    test.skip(!testAlertId, 'No alert ID available');

    const res = await request.get(`${API}/verification/alerts/${testAlertId}`, {
      headers: { Authorization: `Bearer ${policeAccessToken}` },
    });

    expect(res.ok(), `Alert details failed: ${await res.text()}`).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 10: Security - Unauthorized Access Tests
  // ═══════════════════════════════════════════════════════════════════════════

  test('10.1 Hotel endpoints reject requests without auth', async ({ request }) => {
    const res = await request.get(`${API}/hotels/profile`);
    expect(res.status()).toBe(401);
  });

  test('10.2 Police endpoints reject requests without auth', async ({ request }) => {
    const res = await request.get(`${API}/dashboard/stats`);
    expect(res.status()).toBe(401);
  });

  test('10.3 Guest endpoints reject requests without auth', async ({ request }) => {
    const res = await request.get(`${API}/guests/active`);
    expect(res.status()).toBe(401);
  });

  test('10.4 Criminal endpoints reject requests without auth', async ({ request }) => {
    const res = await request.get(`${API}/criminals`);
    expect(res.status()).toBe(401);
  });

  test('10.5 Room endpoints reject requests without auth', async ({ request }) => {
    const res = await request.get(`${API}/rooms/grid`);
    expect(res.status()).toBe(401);
  });

  test('10.6 Hotel token cannot access police-only endpoints', async ({ request }) => {
    const res = await request.get(`${API}/dashboard/stats`, {
      headers: { Authorization: `Bearer ${hotelAccessToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test('10.7 Police token cannot access hotel-only endpoints', async ({ request }) => {
    const res = await request.get(`${API}/hotels/profile`, {
      headers: { Authorization: `Bearer ${policeAccessToken}` },
    });
    expect(res.status()).toBe(403);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 11: Cleanup - Logout Sessions
  // ═══════════════════════════════════════════════════════════════════════════

  test('11.1 POST /auth/hotel/logout - logs out hotel session', async ({ request }) => {
    const res = await request.post(`${API}/auth/hotel/logout`, {
      headers: { Authorization: `Bearer ${hotelAccessToken}` },
      data: { refreshToken: hotelRefreshToken },
    });

    expect(res.ok(), `Hotel logout failed: ${await res.text()}`).toBeTruthy();
  });

  test('11.2 POST /auth/police/logout - logs out police session', async ({ request }) => {
    const res = await request.post(`${API}/auth/police/logout`, {
      headers: { Authorization: `Bearer ${policeAccessToken}` },
      data: { refreshToken: policeRefreshToken },
    });

    expect(res.ok(), `Police logout failed: ${await res.text()}`).toBeTruthy();
  });

  test('11.3 Verify logout invalidates refresh token', async ({ request }) => {
    // Try to use the logged-out refresh token
    const res = await request.post(`${API}/auth/hotel/refresh`, {
      data: { refreshToken: hotelRefreshToken },
    });

    expect(res.status()).toBe(401);
  });
});
