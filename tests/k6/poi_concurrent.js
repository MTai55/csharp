/**
 * k6 Load Test — Nhieu user vao POI cung luc
 *
 * Cai k6 (Windows):
 *   winget install k6 --source winget
 *
 * Chay co ban:
 *   & "C:\Program Files\k6\k6.exe" run tests\k6\poi_concurrent.js
 *
 * Tuy chinh qua bien moi truong:
 *   & "C:\Program Files\k6\k6.exe" run `
 *       --env BASE_URL=http://localhost:5010 `
 *       --env PROFILE=heavy `
 *       --env P99_MS=3000 `
 *       tests\k6\poi_concurrent.js
 *
 * Profiles: light | medium (mac dinh) | heavy
 *   light  — spike: 10 VU,  steady: 3 VU, max: 15 VU
 *   medium — spike: 20 VU,  steady: 5 VU, max: 30 VU
 *   heavy  — spike: 50 VU,  steady:10 VU, max: 60 VU
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

// ── Config ────────────────────────────────────────────────────
const PROFILES = {
    light:  { spikeVus: 10, steadyVus:  3, maxVus: 15 },
    medium: { spikeVus: 20, steadyVus:  5, maxVus: 30 },
    heavy:  { spikeVus: 50, steadyVus: 10, maxVus: 60 },
};

const profile    = PROFILES[__ENV.PROFILE] ?? PROFILES.medium;
const BASE_URL   = __ENV.BASE_URL  || 'http://localhost:5010';
const P99_MS     = parseInt(__ENV.P99_MS   || '2000');
const FAIL_PCT   = parseFloat(__ENV.FAIL_PCT || '0.05');

// Tai khoan test — them/bot account theo nhu cau
const TEST_ACCOUNTS = (() => {
    if (__ENV.ACCOUNTS) {
        return JSON.parse(__ENV.ACCOUNTS);
    }
    const pw = __ENV.TEST_PASSWORD || 'Test@123';
    return [1, 2, 3, 4, 5].map(i => ({
        email: `test${i}@tourguide.test`,
        password: pw,
    }));
})();

// POIs test — override bang --env POIS='[{"placeId":1,"lat":10.77,"lon":106.69}]'
const TEST_POIS = (() => {
    if (__ENV.POIS) return JSON.parse(__ENV.POIS);
    return [
        { placeId: 2,  lat: 10.7581, lon: 106.7020 },
        { placeId: 1,  lat: 10.7695, lon: 106.6909 },
        { placeId: 9,  lat: 10.7702, lon: 106.6680 },
        { placeId: 11, lat: 10.7821, lon: 106.6912 },
        { placeId: 13, lat: 10.7736, lon: 106.7031 },
    ];
})();

// ── Custom metrics ─────────────────────────────────────────────
const checkinFailRate   = new Rate('checkin_fail_rate');
const checkinDuration   = new Trend('checkin_duration_ms', true);
const checkoutDuration  = new Trend('checkout_duration_ms', true);
const totalCheckins     = new Counter('total_checkins');
const totalCheckouts    = new Counter('total_checkouts');
const duplicateCheckins = new Counter('duplicate_checkins');

// ── Scenarios ─────────────────────────────────────────────────
export const options = {
    summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],

    scenarios: {
        // KB1: spike — N user vao cung mot luc
        poi_spike: {
            executor: 'shared-iterations',
            vus: profile.spikeVus,
            iterations: profile.spikeVus,
            maxDuration: '30s',
            tags: { scenario: 'spike' },
        },
        // KB2: steady — lien tuc trong 1 phut
        poi_steady: {
            executor: 'constant-vus',
            vus: profile.steadyVus,
            duration: '1m',
            startTime: '35s',
            tags: { scenario: 'steady' },
        },
        // KB3: rampup — tang dan len max
        poi_rampup: {
            executor: 'ramping-vus',
            startVUs: 1,
            stages: [
                { duration: '30s', target: Math.floor(profile.maxVus / 3) },
                { duration: '30s', target: profile.maxVus },
                { duration: '20s', target: 0 },
            ],
            startTime: '2m',
            tags: { scenario: 'rampup' },
        },
    },

    thresholds: {
        http_req_failed:     [`rate < ${FAIL_PCT}`],
        checkin_duration_ms: [`p(99) < ${P99_MS}`],
        checkin_fail_rate:   [`rate < ${FAIL_PCT}`],
    },
};

// ── Setup ──────────────────────────────────────────────────────
export function setup() {
    const profileName = __ENV.PROFILE || 'medium';
    console.log('\n==============================');
    console.log('  TOURGUIDE LOAD TEST - SETUP');
    console.log('==============================');
    console.log(`  API     : ${BASE_URL}`);
    console.log(`  Profile : ${profileName}  (spike:${profile.spikeVus} steady:${profile.steadyVus} max:${profile.maxVus})`);
    console.log(`  POIs    : ${TEST_POIS.map(p => p.placeId).join(', ')}`);
    console.log(`  Accounts: ${TEST_ACCOUNTS.length}`);

    const tokens = {};
    for (const acc of TEST_ACCOUNTS) {
        const res = http.post(
            `${BASE_URL}/api/auth/login`,
            JSON.stringify({ email: acc.email, password: acc.password }),
            { headers: { 'Content-Type': 'application/json' } }
        );
        if (res.status === 200) {
            tokens[acc.email] = JSON.parse(res.body).accessToken;
            console.log(`  [OK] ${acc.email}`);
        } else {
            console.warn(`  [FAIL] ${acc.email} -> ${res.status}`);
        }
    }

    const loginCount = Object.keys(tokens).length;
    console.log(`\n  Login: ${loginCount}/${TEST_ACCOUNTS.length} thanh cong`);
    console.log('==============================\n');

    if (loginCount === 0) {
        throw new Error('Khong co token nao - dung test');
    }
    return { tokens };
}

// ── Main ───────────────────────────────────────────────────────
export default function (data) {
    const accounts = Object.entries(data.tokens);
    const [, token] = accounts[__VU % accounts.length];
    const poi = TEST_POIS[Math.floor(Math.random() * TEST_POIS.length)];
    const scenario = __ENV.K6_SCENARIO_NAME || 'unknown';

    const headers = {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
    };

    // ── Buoc 1: Check-in ──────────────────────────────────────
    const t0 = Date.now();
    const checkinRes = http.post(
        `${BASE_URL}/api/tracking/checkin`,
        JSON.stringify({
            placeId:      poi.placeId,
            latitude:     poi.lat  + (Math.random() - 0.5) * 0.0002,
            longitude:    poi.lon  + (Math.random() - 0.5) * 0.0002,
            autoDetected: true,
        }),
        { headers, tags: { name: 'checkin', scenario } }
    );
    const checkinMs = Date.now() - t0;
    checkinDuration.add(checkinMs);
    totalCheckins.add(1);

    const checkinOk = check(checkinRes, {
        'checkin: status 200': (r) => r.status === 200,
        'checkin: co visitId':  (r) => {
            try { return JSON.parse(r.body).visitId > 0; } catch { return false; }
        },
    });
    checkinFailRate.add(!checkinOk);

    if (!checkinOk) {
        const status = checkinRes.status;
        const detail = checkinRes.body?.substring(0, 100) ?? '';
        if (status === 409) {
            duplicateCheckins.add(1);
            console.warn(`[VU${__VU}][${scenario}] Duplicate checkin | place=${poi.placeId}`);
        } else {
            console.warn(`[VU${__VU}][${scenario}] Checkin FAIL ${status} | place=${poi.placeId} | ${checkinMs}ms | ${detail}`);
        }
        sleep(1);
        return;
    }

    const visitId = JSON.parse(checkinRes.body).visitId;

    // ── Buoc 2: Dung o POI 2-5 giay ──────────────────────────
    sleep(2 + Math.random() * 3);

    // ── Buoc 3: Check-out ─────────────────────────────────────
    const t1 = Date.now();
    const checkoutRes = http.put(
        `${BASE_URL}/api/tracking/checkout/${visitId}`,
        null,
        { headers, tags: { name: 'checkout', scenario } }
    );
    checkoutDuration.add(Date.now() - t1);
    totalCheckouts.add(1);

    check(checkoutRes, {
        'checkout: status 200': (r) => r.status === 200,
    });

    if (checkoutRes.status !== 200) {
        console.warn(`[VU${__VU}][${scenario}] Checkout FAIL ${checkoutRes.status} | visitId=${visitId}`);
    }

    sleep(1);
}

// ── Teardown ───────────────────────────────────────────────────
export function teardown() {
    console.log('\n[teardown] Test hoan thanh.\n');
}

// ── Custom summary ─────────────────────────────────────────────
export function handleSummary(data) {
    const m = data.metrics;

    const ms   = (v, d = 0) => v != null ? `${v.toFixed(d)}ms` : ' N/A ';
    const pct  = (v)        => v != null ? `${(v * 100).toFixed(1)}%` : ' N/A';
    const pad  = (s, n)     => String(s).padStart(n);
    const padL = (s, n)     => String(s).padEnd(n);

    // Bar chart: val ms relative to maxMs, width chars wide
    const bar = (val, maxMs = 2000, width = 24) => {
        if (val == null) return '░'.repeat(width);
        const filled = Math.min(Math.round((val / maxMs) * width), width);
        return '█'.repeat(filled) + '░'.repeat(width - filled);
    };

    // ── Lay metrics ───────────────────────────────────────────
    const avgCheckin  = m.checkin_duration_ms?.values?.avg;
    const medCheckin  = m.checkin_duration_ms?.values?.med;
    const p90Checkin  = m.checkin_duration_ms?.values?.['p(90)'];
    const p95Checkin  = m.checkin_duration_ms?.values?.['p(95)'];
    const p99Checkin  = m.checkin_duration_ms?.values?.['p(99)'];
    const avgCheckout = m.checkout_duration_ms?.values?.avg;
    const p99Checkout = m.checkout_duration_ms?.values?.['p(99)'];
    const avgHttp     = m.http_req_duration?.values?.avg;
    const totalReqs   = m.http_reqs?.values?.count ?? 0;
    const rps         = m.http_reqs?.values?.rate ?? 0;
    const totalCI     = m.total_checkins?.values?.count ?? 0;
    const totalCO     = m.total_checkouts?.values?.count ?? 0;
    const dupCI       = m.duplicate_checkins?.values?.count ?? 0;
    const failHttp    = m.http_req_failed?.values?.rate ?? 0;
    const failCI      = m.checkin_fail_rate?.values?.rate ?? 0;
    const errCount    = Math.round(failHttp * totalReqs);
    const testDurS    = (m.iteration_duration?.values?.max ?? 0) / 1000;

    // ── Thresholds ────────────────────────────────────────────
    const th_http = data.thresholds?.http_req_failed;
    const th_rate = data.thresholds?.checkin_fail_rate;
    const th_p99  = data.thresholds?.checkin_duration_ms;

    const okHttp  = th_http ? !Object.values(th_http).some(t => !t.ok) : true;
    const okRate  = th_rate ? !Object.values(th_rate).some(t => !t.ok) : true;
    const okP99   = th_p99  ? !Object.values(th_p99).some(t => !t.ok)  : true;
    const allPass = okHttp && okRate && okP99;

    const icon  = (ok) => ok ? '[PASS]' : '[FAIL]';
    const W = 56;
    const SEP  = '='.repeat(W);
    const sep2 = '-'.repeat(W);

    // ── Latency bar chart (max = 2000ms = threshold) ──────────
    const barMax = 2000;
    const latencyRows = [
        ['avg', avgCheckin],
        ['med', medCheckin],
        ['p90', p90Checkin],
        ['p95', p95Checkin],
        ['p99', p99Checkin],
    ].map(([label, val]) => {
        const threshold = label === 'p99' ? ' <- nguong 2000ms' : '';
        return `    ${padL(label, 3)}  [${bar(val, barMax, 20)}]  ${pad(ms(val), 7)}${threshold}`;
    });

    // ── Threshold rows ────────────────────────────────────────
    const failLimit = `< ${(FAIL_PCT * 100).toFixed(0)}%`;
    const thRows = [
        [okHttp, 'HTTP   fail rate', pct(failHttp),  failLimit],
        [okRate, 'Checkin fail rate', pct(failCI),    failLimit],
        [okP99,  'Checkin p99',       ms(p99Checkin), `< ${P99_MS}ms`],
    ].map(([ok, label, actual, limit]) =>
        `    ${icon(ok)}  ${padL(label, 18)} ${pad(actual, 7)}  (limit: ${limit})`
    );

    const report = [
        '',
        SEP,
        `  TOURGUIDE LOAD TEST - KET QUA`,
        SEP,
        '',
        `  3 kich ban  |  ${totalReqs} requests  |  ${rps.toFixed(1)} req/s  |  ~${testDurS.toFixed(0)}s`,
        `  Profile: ${__ENV.PROFILE || 'medium'}  (spike:${profile.spikeVus} steady:${profile.steadyVus} max:${profile.maxVus})`,
        '',
        `  KB1  Spike    ${pad(profile.spikeVus, 2)} VU dong thoi                  30s`,
        `  KB2  Steady    ${pad(profile.steadyVus, 2)} VU lien tuc                  60s`,
        `  KB3  Ramp-up   1 -> ${pad(profile.maxVus, 2)} VU tang dan               80s`,
        '',
        sep2,
        '  TONG QUAN',
        sep2,
        `    Requests   : ${pad(totalReqs, 5)}   RPS     : ${rps.toFixed(1)} req/s`,
        `    Check-in   : ${pad(totalCI,   5)}   Check-out: ${totalCO}`,
        `    Loi HTTP   : ${pad(errCount,  5)}   (${pct(failHttp)})   Duplicate: ${dupCI}`,
        `    Avg HTTP   : ${ms(avgHttp)}`,
        '',
        sep2,
        `  LATENCY CHECKIN  (0ms ${'─'.repeat(10)} 1000ms ${'─'.repeat(5)} 2000ms)`,
        sep2,
        ...latencyRows,
        '',
        `    Checkout avg: ${ms(avgCheckout)}   p99: ${ms(p99Checkout)}`,
        '',
        sep2,
        '  THRESHOLDS',
        sep2,
        ...thRows,
        '',
        SEP,
        allPass
            ? `  KET LUAN: TAT CA THRESHOLD PASS - HE THONG ON DINH`
            : `  KET LUAN: CO THRESHOLD FAIL - KIEM TRA CHI TIET`,
        SEP,
        '',
    ].join('\n');

    return {
        stdout: report + '\n' + textSummary(data, { indent: '  ', enableColors: false }),
    };
}
