import http from 'k6/http';
import { check, sleep } from 'k6';

// --- knobs you to tweak quickly ---
const BASELINE_RPS = Number(__ENV.BASELINE_RPS || 330);
const STRESS_RPS   = Number(__ENV.STRESS_RPS   || BASELINE_RPS * 2);   // 660
const SPIKE_RPS    = Number(__ENV.SPIKE_RPS    || Math.round(BASELINE_RPS * 3)); // ~1000

// Rough VU capacity: VUs ≈ RPS × (avg RTT + avg think)
// For safety we just give a big buffer:
const VU_BASELINE_PRE = Number(__ENV.VU_BASELINE_PRE || 1200);
const VU_STRESS_PRE   = Number(__ENV.VU_STRESS_PRE   || 1800);
const VU_SPIKE_PRE    = Number(__ENV.VU_SPIKE_PRE    || 2400);

export const options = {
  // InfluxDB output configuration for Grafana (InfluxDB 1.x)
  ext: {
    influxdb: {
      url: __ENV.INFLUXDB_URL || 'http://localhost:8086',
      database: __ENV.INFLUXDB_DB || 'k6_load_tests',
      username: __ENV.INFLUXDB_USER || 'k6',
      password: __ENV.INFLUXDB_PASSWORD || 'k6password',
      tagsAsFields: ['endpoint', 'path', 'method', 'phase'],
      measurement: 'k6_metrics'
    }
  },
  scenarios: (() => {
    const runScenario = __ENV.SCENARIO || 'user_flow';

    // ---- User Flow Simulation (realistic user interactions) ----
    if (runScenario === 'user_flow') {
      return {
        user_flow: {
          executor: 'ramping-arrival-rate',
          timeUnit: '1s',
          preAllocatedVUs: 2,
          maxVUs: 8,
          startRate: 1,
          stages: [
            { target: 3,  duration: '15s' },   // Ramp up to 3 users
            { target: 3,  duration: '30s' },   // Steady state
            { target: 5,  duration: '15s' },   // Peak load
            { target: 5,  duration: '1m' },    // Sustain peak
            { target: 2,  duration: '15s' },   // Ramp down
          ],
          tags: { phase: 'user_flow' },
          exec: 'userFlowJourney',
          gracefulStop: '5s',
        },
      };
    }

    // ---- Dashboard Load Test (all APIs simultaneously) ----
    if (runScenario === 'dashboard') {
      return {
        dashboard: {
          executor: 'ramping-arrival-rate',
          timeUnit: '1s',
          preAllocatedVUs: 2,
          maxVUs: 8,
          startRate: 1,
          stages: [
            { target: 3,  duration: '10s' },   // Quick ramp up
            { target: 3,  duration: '30s' },   // Baseline load
            { target: 5,  duration: '10s' },   // Peak load
            { target: 5,  duration: '1m' },    // Sustain peak
            { target: 2,  duration: '10s' },   // Ramp down
          ],
          tags: { phase: 'dashboard' },
          exec: 'dashboardJourney',
          gracefulStop: '5s',
        },
      };
    }

    // ---- User Flow Benchmark Test (baseline performance measurement) ----
    if (runScenario === 'user_flow_benchmark') {
      return {
        user_flow_benchmark: {
          executor: 'ramping-arrival-rate',
          timeUnit: '1s',
          preAllocatedVUs: 3,
          maxVUs: 15,
          startRate: 1,
          stages: [
            { target: 5,  duration: '2m' },   // Ramp up
            { target: 10, duration: '15m' },  // Steady state baseline
            { target: 15, duration: '5m' },   // Peak load
            { target: 5,  duration: '2m' },   // Ramp down
          ],
          tags: { phase: 'user_flow_benchmark' },
          exec: 'userFlowJourney',
          gracefulStop: '5s',
        },
      };
    }

    // ---- Dashboard Benchmark Test (API load baseline measurement) ----
    if (runScenario === 'dashboard_benchmark') {
      return {
        dashboard_benchmark: {
          executor: 'ramping-arrival-rate',
          timeUnit: '1s',
          preAllocatedVUs: 5,
          maxVUs: 25,
          startRate: 3,
          stages: [
            { target: 10, duration: '2m' },   // Ramp up
            { target: 20, duration: '10m' },  // Steady dashboard load
            { target: 25, duration: '5m' },   // Peak dashboard
            { target: 10, duration: '2m' },   // Ramp down
          ],
          tags: { phase: 'dashboard_benchmark' },
          exec: 'dashboardJourney',
          gracefulStop: '5s',
        },
      };
    }

    // ---- Light Test (quick validation with minimal load) ----
    if (runScenario === 'light') {
      return {
        light: {
          executor: 'ramping-arrival-rate',
          timeUnit: '1s',
          preAllocatedVUs: 1,
          maxVUs: 2,
          startRate: 1,
          stages: [
            { target: 1,  duration: '30s' },   // Ramp up to 1 user
            { target: 1,  duration: '2m' },    // Steady state - 1 user
            { target: 2,  duration: '30s' },   // Ramp up to 2 users
            { target: 2,  duration: '2m' },    // Steady state - 2 users
            { target: 1,  duration: '30s' },   // Ramp down to 1 user
            { target: 0,  duration: '30s' },   // Ramp down to 0
          ],
          tags: { phase: 'light' },
          exec: 'lightJourney',
          gracefulStop: '10s',
        },
      };
    }

    // ---- Default: run user flow ----
    return {
      user_flow: {
        executor: 'ramping-arrival-rate',
        timeUnit: '1s',
        preAllocatedVUs: 2,
        maxVUs: 8,
        startRate: 1,
        stages: [
          { target: 3,  duration: '15s' },
          { target: 3,  duration: '30s' },
          { target: 5,  duration: '30s' },
          { target: 2,  duration: '15s' },
        ],
        tags: { phase: 'user_flow' },
        exec: 'userFlowJourney',
        gracefulStop: '5s',
      },
    };
  })(),

  // thresholds for our scenarios
  thresholds: {
    'http_req_duration{phase:user_flow}': ['p(95)<2000'],
    'http_req_failed{phase:user_flow}':   ['rate<0.02'],

    'http_req_duration{phase:dashboard}': ['p(95)<3000'],
    'http_req_failed{phase:dashboard}':   ['rate<0.05'],

    'http_req_duration{phase:user_flow_benchmark}': ['p(95)<2000'],
    'http_req_failed{phase:user_flow_benchmark}':   ['rate<0.02'],

    'http_req_duration{phase:dashboard_benchmark}': ['p(95)<3000'],
    'http_req_failed{phase:dashboard_benchmark}':   ['rate<0.05'],

    'http_req_duration{phase:light}': ['p(95)<5000'],
    'http_req_failed{phase:light}':   ['rate<0.1'],
  },
  summaryTrendStats: ["min", "med", "avg", "max", "p(90)", "p(95)", "p(99)"],
};

// Get API credentials from environment variables
const API_URL = 'https://playwright.api.dev.internal-kandji.io';
const API_TOKEN = 'a2887a55-1cbc-43bc-8549-2a62b9397925';

// Test run identification and metadata
const TEST_RUN_INFO = {
  runId: new Date().toISOString().replace(/[:.]/g, '-'),
  testType: __ENV.SCENARIO ? `single_scenario_${__ENV.SCENARIO}` : 'user_flow_test',
  scenarios: __ENV.SCENARIO ? [__ENV.SCENARIO] : ['user_flow'],
  totalDuration: __ENV.SCENARIO === 'user_flow' ? '2m 15s' : 
                 __ENV.SCENARIO === 'dashboard' ? '2m' : 
                 __ENV.SCENARIO === 'user_flow_benchmark' ? '24m' :
                 __ENV.SCENARIO === 'dashboard_benchmark' ? '19m' :
                 __ENV.SCENARIO === 'light' ? '5m' : '2m 15s',
  description: __ENV.SCENARIO === 'user_flow' ? 'User Flow Simulation - Realistic user interactions' : 
               __ENV.SCENARIO === 'dashboard' ? 'Dashboard Load Test - All APIs simultaneously' : 
               __ENV.SCENARIO === 'user_flow_benchmark' ? 'User Flow Benchmark - Baseline performance measurement' :
               __ENV.SCENARIO === 'dashboard_benchmark' ? 'Dashboard Benchmark - API load baseline measurement' :
               __ENV.SCENARIO === 'light' ? 'Light Test - Quick validation with minimal load (1-2 VUs)' :
               'User Flow Simulation - Realistic user interactions',
  environment: 'dev',
  timestamp: new Date().toISOString(),
};

// Test with 9 endpoints sequentially to check each API independently
const apiEndpoints = [
  { name: 'Vulnerabilities by Severity', path: '/v2/dashboards/vulnerabilities_by_severity', method: 'GET', baseUrl: 'https://vulnerability-management.dev.internal-kandji.io', headers: { 'x-tenant-id': '765accfe-8c19-4706-94e8-c683fc6ab034', 'x-enabled-capabilities': 'vulnerability_management' } },
  { name: 'Vulnerabilities by Software', path: '/v2/dashboards/vulnerabilities_by_software', method: 'GET', baseUrl: 'https://vulnerability-management.dev.internal-kandji.io', headers: { 'x-tenant-id': '765accfe-8c19-4706-94e8-c683fc6ab034', 'x-enabled-capabilities': 'vulnerability_management' } },
  { name: 'Device Information', path: '/api/v1/prism/device_information', method: 'GET', baseUrl: 'https://tim.api.dev.internal-kandji.io', headers: { Authorization: `Bearer 7e5d50bd-6b82-439c-9998-fd9c7eea3f04` } },
  { name: 'Visibility Views Count', path: '/v1/views/count', method: 'GET', baseUrl: 'https://visibility-http.dev.internal-kandji.io', headers: { 'x-authenticated-user-id': '1234', 'x-user-role': 'admin', 'x-tenant-id': '765accfe-8c19-4706-94e8-c683fc6ab034' } },
  { name: 'Active Blueprints Count', path: '/v1/landing_page/get_active_blueprints_count', method: 'GET', baseUrl: 'https://visibility-http.dev.internal-kandji.io', headers: { 'x-tenant-id': '765accfe-8c19-4706-94e8-c683fc6ab034' } },
  { name: 'Universal Search Recents', path: '/v1/universal-search/recents?limit=5', method: 'GET', baseUrl: 'https://visibility-http.dev.internal-kandji.io', headers: { 'x-authenticated-user-id': '1234', 'x-tenant-id': '765accfe-8c19-4706-94e8-c683fc6ab034' } },
  { name: 'Threat Activity Graph Tiles', path: '/api/v1/graph-tiles/threat-activity', method: 'GET', baseUrl: 'https://tc-threat-api.dev.internal-kandji.io', headers: { 'x-enabled-capabilities': 'edr', 'x-tenant-id': '765accfe-8c19-4706-94e8-c683fc6ab034' } },
  { name: 'Devices Under Threat Graph Tiles', path: '/api/v1/graph-tiles/devices-under-threat', method: 'GET', baseUrl: 'https://tc-threat-api.dev.internal-kandji.io', headers: { 'x-enabled-capabilities': 'edr', 'x-tenant-id': '765accfe-8c19-4706-94e8-c683fc6ab034' } },
  { name: 'Apps', path: '/api/v1/prism/apps', method: 'GET', baseUrl: 'https://playwright.api.dev.internal-kandji.io', headers: { Authorization: `Bearer ${API_TOKEN}` } },
];

// --- User Flow Journey (realistic user interactions with think time) ---
export function userFlowJourney() {
  // Simulate a user checking vulnerabilities first
  step('vuln_severity');      think(2, 5);    // User reads vulnerability data
  step('vuln_software');      think(3, 8);    // User analyzes software vulnerabilities
  
  // User navigates to device management
  step('device_info');        think(2, 4);    // User checks device information
  step('apps');               think(4, 10);   // User reviews installed apps
  
  // User explores visibility features
  step('views_count');        think(1, 3);    // Quick check of views
  step('search_recents');     think(2, 6);    // User searches for recent items
  
  // User checks EDR/threat information
  step('threat_activity');    think(3, 7);    // User reviews threat activity
  step('devices_threat');     think(2, 5);    // User checks devices under threat
  
  // User checks blueprints
  step('blueprints_count');   think(1, 3);    // Quick blueprint count check
}

// --- Dashboard Journey (all APIs hit simultaneously for load testing) ---
export async function dashboardJourney() {
  // Hit all APIs in parallel to simulate dashboard load
  const promises = [
    stepAsync('vuln_severity'),
    stepAsync('vuln_software'),
    stepAsync('device_info'),
    stepAsync('views_count'),
    stepAsync('blueprints_count'),
    stepAsync('search_recents'),
    stepAsync('threat_activity'),
    stepAsync('devices_threat'),
    stepAsync('apps')
  ];
  
  // Wait for all API calls to complete
  await Promise.all(promises);
  
  // Short think time between dashboard refreshes
  think(0.5, 2);
}

// --- Light Journey (minimal load for quick validation) ---
export function lightJourney() {
  // Light test - hit a subset of APIs with longer think times
  step('device_info');        think(3, 8);    // Check device info
  step('apps');               think(2, 5);    // Check apps
  step('views_count');        think(1, 3);    // Quick views check
  step('search_recents');     think(2, 4);    // Check recent searches
  step('threat_activity');    think(3, 6);    // Check threat activity
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
      'x-loadtest': 'true',
      ...endpoint.headers,
    },
    tags: {
      endpoint: endpoint.name,
      path: endpoint.path,
      method: endpoint.method,
      phase: __ENV.SCENARIO || 'user_flow',
      load_level: __VU,
      test_run_id: TEST_RUN_INFO.runId,
      environment: TEST_RUN_INFO.environment,
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

// Async version for parallel API calls in dashboard journey
function stepAsync(name) {
  return new Promise((resolve) => {
    const endpointMap = {
      'vuln_severity': apiEndpoints[0],
      'vuln_software': apiEndpoints[1],
      'device_info': apiEndpoints[2],
      'views_count': apiEndpoints[3],
      'blueprints_count': apiEndpoints[4],
      'search_recents': apiEndpoints[5],
      'threat_activity': apiEndpoints[6],
      'devices_threat': apiEndpoints[7],
      'apps': apiEndpoints[8],
    };

    const endpoint = endpointMap[name];
    if (!endpoint) {
      resolve();
      return;
    }

    const url = `${endpoint.baseUrl}${endpoint.path}`;
    const params = {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'K6-Load-Test/1.0',
        'Cache-Control': 'no-cache',
        'x-loadtest': 'true',
        ...endpoint.headers,
      },
      tags: {
        endpoint: endpoint.name,
        path: endpoint.path,
        method: endpoint.method,
        phase: __ENV.SCENARIO || 'user_flow',
        load_level: __VU,
        test_run_id: TEST_RUN_INFO.runId,
        environment: TEST_RUN_INFO.environment,
        timestamp: new Date().toISOString(),
      },
    };

    const response = http.get(url, params);
    
    check(response, {
      [`${endpoint.name} - status is 200`]: (r) => r.status === 200,
      [`${endpoint.name} - duration < 3000`]: (r) => r.timings.duration < 3000,
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
    
    resolve();
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
    if (scenario === 'user_flow') {
      console.log(`   • ${scenario.toUpperCase()}: Realistic user interactions with think time`);
    } else if (scenario === 'dashboard') {
      console.log(`   • ${scenario.toUpperCase()}: All APIs hit simultaneously for load testing`);
    } else if (scenario === 'user_flow_benchmark') {
      console.log(`   • ${scenario.toUpperCase()}: Baseline performance measurement (15-25 VUs, 24min)`);
    } else if (scenario === 'dashboard_benchmark') {
      console.log(`   • ${scenario.toUpperCase()}: API load baseline measurement (20-25 VUs, 19min)`);
    } else if (scenario === 'light') {
      console.log(`   • ${scenario.toUpperCase()}: Quick validation with minimal load (1-2 VUs, 5min)`);
    }
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
  
  // Grafana export information
  console.log(`\n📊 GRAFANA EXPORT:`);
  console.log(`   InfluxDB URL: ${__ENV.INFLUXDB_URL || 'http://localhost:8086'}`);
  console.log(`   Database: ${__ENV.INFLUXDB_DB || 'k6_load_tests'}`);
  console.log(`   Grafana Dashboard: http://${__ENV.GRAFANA_HOST || 'localhost'}:${__ENV.GRAFANA_PORT || '3000'}`);
  console.log(`   \n💡 To run with Grafana export:`);
  console.log(`   k6 run --env SCENARIO=user_flow --out influxdb=http://k6:k6password@localhost:8086/k6_load_tests k6_api_load_test.js`);
  console.log(`   \n💡 To run specific scenarios:`);
  console.log(`   k6 run --env SCENARIO=light k6_api_load_test.js`);
  console.log(`   k6 run --env SCENARIO=user_flow k6_api_load_test.js`);
  console.log(`   k6 run --env SCENARIO=dashboard k6_api_load_test.js`);
  console.log(`   k6 run --env SCENARIO=user_flow_benchmark k6_api_load_test.js`);
  console.log(`   k6 run --env SCENARIO=dashboard_benchmark k6_api_load_test.js`);
  console.log(`   \n💡 To enable auto-export, run k6 with:`);
  console.log(`   k6 run --out json="./test-results/k6-api-test-results-${TEST_RUN_INFO.runId}.json" k6_api_load_test.js`);
  console.log(`   \n🚀 Quick Grafana setup:`);
  console.log(`   node grafana-setup.js setup`);
  
  return {};
}





