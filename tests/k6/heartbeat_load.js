/**
 * k6 Load Test — Heartbeat đồng thời (100 device cập nhật LastSeenAt cùng lúc)
 *
 * Mobile app gọi Supabase trực tiếp mỗi 5s.
 * Test này mô phỏng gánh nặng nếu nhiều device online cùng lúc.
 *
 * Chạy: k6 run heartbeat_load.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL    = __ENV.BASE_URL    || 'http://localhost:5010';
const SUPABASE_URL = __ENV.SUPABASE_URL || '';  // https://xxx.supabase.co
const SUPABASE_KEY = __ENV.SUPABASE_KEY || '';  // anon key

const heartbeatDuration = new Trend('heartbeat_ms', true);
const heartbeatFail     = new Rate('heartbeat_fail');

export const options = {
    // 100 device online đồng thời, mỗi device ping mỗi 5s trong 1 phút
    scenarios: {
        heartbeat_100_devices: {
            executor: 'constant-vus',
            vus: 100,
            duration: '1m',
        },
    },
    thresholds: {
        heartbeat_ms:   ['p(95) < 500'],   // 95% dưới 500ms
        heartbeat_fail: ['rate < 0.01'],    // dưới 1% lỗi
        http_req_failed: ['rate < 0.01'],
    },
};

// Tạo DeviceId giả: 10 ký tự uppercase
function makeDeviceId(vuId) {
    return `TEST${String(vuId).padStart(6, '0')}`;
}

export default function () {
    const deviceId = makeDeviceId(__VU);
    const now = new Date().toISOString();

    if (SUPABASE_URL && SUPABASE_KEY) {
        // ── Mode A: Gọi Supabase trực tiếp (giống mobile app) ────
        const start = Date.now();
        const res = http.patch(
            `${SUPABASE_URL}/rest/v1/DeviceRegistrations?DeviceId=eq.${deviceId}`,
            JSON.stringify({ last_seen_at: now }),
            {
                headers: {
                    'Content-Type':  'application/json',
                    'apikey':        SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Prefer':        'return=minimal',
                },
                tags: { name: 'supabase_heartbeat' },
            }
        );
        heartbeatDuration.add(Date.now() - start);
        const ok = check(res, { 'heartbeat: 2xx': (r) => r.status >= 200 && r.status < 300 });
        heartbeatFail.add(!ok);

    } else {
        // ── Mode B: Gọi qua API (nếu có endpoint heartbeat) ──────
        // Thay endpoint này nếu bạn thêm route heartbeat vào API
        const start = Date.now();
        const res = http.post(
            `${BASE_URL}/api/devices/${deviceId}/heartbeat`,
            null,
            { tags: { name: 'api_heartbeat' } }
        );
        heartbeatDuration.add(Date.now() - start);
        const ok = check(res, {
            'heartbeat API: 2xx': (r) => r.status >= 200 && r.status < 300,
        });
        heartbeatFail.add(!ok);
    }

    // Ping mỗi 5 giây giống app thực
    sleep(5);
}
