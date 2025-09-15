import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    baseline: {
      executor: 'ramping-arrival-rate',
      timeUnit: '1s',
      preAllocatedVUs: 50,    // Much smaller buffer
      maxVUs: 150,            // Much smaller cap
      startRate: 2,           // Start very low
      stages: [
        { target: 5, duration: '20s' },    // ramp to baseline (5 RPS)
        { target: 5, duration: '30s' },    // hold steady baseline
      ],
      tags: { phase: 'baseline' },
      exec: 'journey',
    },

    stress: {
      executor: 'ramping-arrival-rate',
      timeUnit: '1s',
      preAllocatedVUs: 75,
      maxVUs: 200,
      startRate: 5,
      stages: [
        { target: 10, duration: '20s' },   // ramp to 2× (10 RPS)
        { target: 10, duration: '30s' },   // hold stress
        { target: 5, duration: '20s' },    // recover
      ],
      tags: { phase: 'stress' },
      exec: 'journey',
    },

    spike: {
      executor: 'ramping-arrival-rate',
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 300,
      startRate: 5,
      stages: [
        { target: 15, duration: '20s' },   // 3× spike (15 RPS)
        { target: 5, duration: '30s' },    // recovery
      ],
      tags: { phase: 'spike' },
      exec: 'journey',
    },
  },

  thresholds: {
    // Baseline: very lenient thresholds
    'http_req_duration{phase:baseline}': ['p(95)<10000'], // <10s
    'http_req_failed{phase:baseline}':   ['rate<0.10'],   // <10%

    // Stress: very lenient thresholds
    'http_req_duration{phase:stress}': ['p(95)<15000'],   // <15s
    'http_req_failed{phase:stress}':   ['rate<0.15'],     // <15%

    // Spike: very lenient thresholds
    'http_req_duration{phase:spike}': ['p(95)<20000'],    // <20s
    'http_req_failed{phase:spike}':   ['rate<0.20'],      // <20%
  },
  summaryTrendStats: ["min", "med", "avg", "max", "p(90)", "p(95)", "p(99)"],
};

// Get API credentials from environment variables
const API_URL = 'https://playwright.api.dev.internal-kandji.io';
const API_TOKEN = 'a2887a55-1cbc-43bc-8549-2a62b9397925';

// Test run identification and metadata
const TEST_RUN_INFO = {
  runId: new Date().toISOString().replace(/[:.]/g, '-'),
  testType: __ENV.SCENARIO ? `single_scenario_${__ENV.SCENARIO}` : 'multi_scenario_load_test',
  scenarios: __ENV.SCENARIO ? [__ENV.SCENARIO] : ['baseline', 'stress', 'spike'],
  totalDuration: __ENV.SCENARIO === 'baseline' ? '50s' : __ENV.SCENARIO === 'stress' ? '70s' : __ENV.SCENARIO === 'spike' ? '50s' : '2m 50s',
  description: __ENV.SCENARIO ? `${__ENV.SCENARIO.toUpperCase()} scenario load test` : 'Light load validation test with 3 phases',
  environment: 'dev',
  timestamp: new Date().toISOString(),
};

// Test with 9 endpoints sequentially to check each API independently
const apiEndpoints = [
  { name: 'Vulnerabilities by Severity', path: '/v2/dashboards/vulnerabilities_by_severity', method: 'GET', baseUrl: 'https://vulnerability-management.dev.internal-kandji.io', headers: { 'x-tenant-id': '71f27d67-1098-409e-87b0-f7d225f58f32', 'x-enabled-capabilities': 'vulnerability_management' } },
  { name: 'Vulnerabilities by Software', path: '/v2/dashboards/vulnerabilities_by_software', method: 'GET', baseUrl: 'https://vulnerability-management.dev.internal-kandji.io', headers: { 'x-tenant-id': '71f27d67-1098-409e-87b0-f7d225f58f32', 'x-enabled-capabilities': 'vulnerability_management' } },
  { name: 'Device Information', path: '/api/v1/prism/device_information', method: 'GET', baseUrl: 'https://tim.api.dev.internal-kandji.io', headers: { Authorization: `Bearer 7e5d50bd-6b82-439c-9998-fd9c7eea3f04` } },
  { name: 'Visibility Views Count', path: '/v1/views/count', method: 'GET', baseUrl: 'https://visibility-http.dev.internal-kandji.io', headers: { 'x-authenticated-user-id': '1234', 'x-user-role': 'admin', 'x-tenant-id': '71f27d67-1098-409e-87b0-f7d225f58f32' } },
  { name: 'Active Blueprints Count', path: '/v1/landing_page/get_active_blueprints_count', method: 'GET', baseUrl: 'https://visibility-http.dev.internal-kandji.io', headers: { 'x-tenant-id': '71f27d67-1098-409e-87b0-f7d225f58f32' } },
  { name: 'Universal Search Recents', path: '/v1/universal-search/recents?limit=5', method: 'GET', baseUrl: 'https://visibility-http.dev.internal-kandji.io', headers: { 'x-authenticated-user-id': '1234', 'x-tenant-id': '71f27d67-1098-409e-87b0-f7d225f58f32' } },
  { name: 'Threat Activity Graph Tiles', path: '/api/v1/graph-tiles/threat-activity', method: 'GET', baseUrl: 'https://tc-threat-api.dev.internal-kandji.io', headers: { 'x-enabled-capabilities': 'edr', 'x-tenant-id': '71f27d67-1098-409e-87b0-f7d225f58f32' } },
  { name: 'Devices Under Threat Graph Tiles', path: '/api/v1/graph-tiles/devices-under-threat', method: 'GET', baseUrl: 'https://tc-threat-api.dev.internal-kandji.io', headers: { 'x-enabled-capabilities': 'edr', 'x-tenant-id': '71f27d67-1098-409e-87b0-f7d225f58f32' } },
  { name: 'Apps', path: '/api/v1/prism/apps', method: 'GET', baseUrl: 'https://playwright.api.dev.internal-kandji.io', headers: { Authorization: `Bearer ${API_TOKEN}` } },
];

// --- User journey simulation ---
export function journey() {
  step('vuln_severity');      think(2, 6);    // Vulnerabilities by Severity
  step('vuln_software');      think(1, 3);    // Vulnerabilities by Software
  step('device_info');         think(2, 8);    // Device Information
  step('views_count');         think(1, 4);    // Visibility Views Count
  step('blueprints_count');    think(2, 6);    // Active Blueprints Count
  step('search_recents');      think(1, 3);    // Universal Search Recents
  step('threat_activity');    think(2, 8);    // Threat Activity Graph Tiles
  step('devices_threat');     think(1, 4);    // Devices Under Threat Graph Tiles
  step('apps');               think(2, 6);    // Apps
}

function step(name) {
  // Map step names to your actual endpoints
  const endpointMap = {
    'vuln_severity': apiEndpoints[0],      // Vulnerabilities by Severity
    'vuln_software': apiEndpoints[1],      // Vulnerabilities by Software
    'device_info': apiEndpoints[2],         // Device Information
    'views_count': apiEndpoints[3],         // Visibility Views Count
    'blueprints_count': apiEndpoints[4],    // Active Blueprints Count
    'search_recents': apiEndpoints[5],      // Universal Search Recents
    'threat_activity': apiEndpoints[6],    // Threat Activity Graph Tiles
    'devices_threat': apiEndpoints[7],     // Devices Under Threat Graph Tiles
    'apps': apiEndpoints[8],               // Apps
  };

  const endpoint = endpointMap[name];
  if (!endpoint) return;

  const url = `${endpoint.baseUrl}${endpoint.path}`;
  const params = {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'K6-Load-Test/1.0',
      'Cache-Control': 'no-cache',
      ...endpoint.headers,
    },
    tags: {
      endpoint: endpoint.name,
      path: endpoint.path,
      method: endpoint.method,
      load_level: __VU,
      timestamp: new Date().toISOString(),
    },
  };

  const response = http.get(url, params);
  
  check(response, {
    [`${endpoint.name} - status is 200`]: (r) => r.status === 200,
    [`${endpoint.name} - duration < 2000`]: (r) => r.timings.duration < 2000,
    [`${endpoint.name} - returns JSON`]: (r) => r.headers['Content-Type'] && r.headers['Content-Type'].includes('application/json'),
    [`${endpoint.name} - valid JSON response`]: (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch (e) {
        return false;
      }
    },
  });
}

function think(minS, maxS) {
  sleep(minS + Math.random() * (maxS - minS));
}

// Export results to CSV after test completion
export function handleSummary(data) {
  console.log(`\n🚀 K6 API Load Test Results Summary:`);
  console.log(`   Run ID: ${TEST_RUN_INFO.runId}`);
  console.log(`   Test Type: ${TEST_RUN_INFO.testType}`);
  console.log(`   Environment: ${TEST_RUN_INFO.environment}`);
  console.log(`   Description: ${TEST_RUN_INFO.description}`);
  console.log(`   Timestamp: ${TEST_RUN_INFO.timestamp}`);
  console.log(`   Test Duration: ${data.state.testRunDuration || 'N/A'}ms`);
  console.log(`   Virtual Users: ${data.state.vus || 'N/A'}`);
  
  // Display scenario information
  console.log(`\n📊 TEST SCENARIOS:`);
  TEST_RUN_INFO.scenarios.forEach(scenario => {
    console.log(`   • ${scenario.toUpperCase()}: ${scenario === 'baseline' ? '5 RPS' : scenario === 'stress' ? '10 RPS' : '15 RPS'} peak load`);
  });
  
  // Display endpoint information
  console.log(`\n🔍 TESTED ENDPOINTS:`);
  apiEndpoints.forEach(endpoint => {
    console.log(`   ${endpoint.name}: ${endpoint.path}`);
  });
  
  // Show load correlation analysis using built-in metrics
  console.log(`\n📊 LOAD CORRELATION ANALYSIS:`);
  
  if (data.metrics.http_req_duration && data.metrics.http_reqs) {
    const duration = data.metrics.http_req_duration;
    const requests = data.metrics.http_reqs;
    
    if (duration.values && requests.values) {
      console.log(`   Total Requests: ${requests.values.count}`);
      console.log(`   Request Rate: ${requests.values.rate.toFixed(2)} req/s`);
      console.log(`   Response Time - Min: ${Math.round(duration.values.min)}ms, Max: ${Math.round(duration.values.max)}ms`);
      console.log(`   Response Time - P95: ${Math.round(duration.values['p(95)'])}ms, P99: ${Math.round(duration.values['p(99)'])}ms`);
      
      // Calculate load correlation using built-in metrics
      const avgResponseTime = duration.values.avg;
      const requestRate = requests.values.rate;
      
      console.log(`   \n📈 LOAD PERFORMANCE INSIGHTS:`);
      console.log(`   Average Response Time: ${Math.round(avgResponseTime)}ms`);
      console.log(`   Peak Request Rate: ${requestRate.toFixed(2)} RPS`);
      console.log(`   Performance Ratio: ${(avgResponseTime / requestRate).toFixed(2)} ms per RPS`);
      
      // Performance assessment
      if (avgResponseTime < 500) {
        console.log(`   🟢 EXCELLENT: Response time under 500ms`);
      } else if (avgResponseTime < 1000) {
        console.log(`   🟡 GOOD: Response time under 1 second`);
      } else {
        console.log(`   🔴 NEEDS ATTENTION: Response time over 1 second`);
      }
    }
  }
  
  // Show overall k6 metrics
  console.log(`\n📈 OVERALL PERFORMANCE METRICS:`);
  
  if (data.metrics.http_req_failed) {
    const failed = data.metrics.http_req_failed;
    if (failed.values && data.metrics.http_reqs?.values) {
      const failureRate = (failed.values.rate / data.metrics.http_reqs.values.rate) * 100;
      console.log(`   Failed Requests: ${failed.values.count || 0}, Failure Rate: ${failureRate.toFixed(2)}%`);
    }
  }
  
  // Enhanced export information
  console.log(`\n💾 EXPORT INFORMATION:`);
  console.log(`   Run ID: ${TEST_RUN_INFO.runId}`);
  console.log(`   Test Type: ${TEST_RUN_INFO.testType}`);
  console.log(`   Scenarios: ${TEST_RUN_INFO.scenarios.join(', ')}`);
  console.log(`   Environment: ${TEST_RUN_INFO.environment}`);
  console.log(`   \n💡 To enable auto-export, run k6 with:`);
  console.log(`   k6 run --out json="./test-results/k6-api-test-results-${TEST_RUN_INFO.runId}.json" k6_api_load_test.js`);
  
  return {};
}