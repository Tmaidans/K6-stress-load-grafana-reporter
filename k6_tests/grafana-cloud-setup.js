#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Grafana Cloud Configuration
const GRAFANA_CLOUD_CONFIG = {
  // You'll need to get these from your Grafana Cloud instance
  influxdb: {
    url: 'https://your-instance.grafana.net:8086',
    database: 'k6_load_tests',
    username: 'your-username',
    password: 'your-api-key'
  },
  grafana: {
    url: 'https://your-instance.grafana.net',
    username: 'your-username',
    password: 'your-password'
  }
};

function generateGrafanaCloudScript() {
  const script = `#!/bin/bash

# Grafana Cloud K6 Test Runner
# This script runs k6 tests and sends results to Grafana Cloud

set -e

# Configuration
SCENARIO=\${1:-light}
TEST_FILE="k6_api_load_test.js"
TIMESTAMP=\$(date +"%Y-%m-%d_%H-%M-%S")

echo "🚀 Starting K6 Load Test with Grafana Cloud Export"
echo "   Scenario: \$SCENARIO"
echo "   Test File: \$TEST_FILE"
echo "   Timestamp: \$TIMESTAMP"

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo "❌ k6 is not installed. Please install k6 first."
    echo "   Visit: https://k6.io/docs/getting-started/installation/"
    exit 1
fi

# Check if user is logged into k6 cloud
if ! k6 cloud --help &> /dev/null; then
    echo "❌ k6 cloud is not available. Please install k6 cloud extension:"
    echo "   k6 install cloud"
    exit 1
fi

echo "🔍 Checking k6 cloud connection..."
k6 cloud --version

echo "🏃 Running K6 test in the cloud..."

# Run the test in k6 cloud
k6 cloud run \$TEST_FILE --env SCENARIO=\$SCENARIO

echo "✅ Test completed! Results available in k6 cloud dashboard."
echo "🌐 Check your k6 cloud dashboard for real-time results."

# Optional: Also run locally with Grafana Cloud export
echo ""
echo "💡 To also export to Grafana Cloud InfluxDB, run:"
echo "   k6 run --env SCENARIO=\$SCENARIO --out influxdb=https://your-username:your-api-key@your-instance.grafana.net:8086/k6_load_tests \$TEST_FILE"
`;

  return script;
}

function generateGrafanaCloudConfig() {
  const config = {
    grafana_cloud: {
      influxdb: {
        url: "https://your-instance.grafana.net:8086",
        database: "k6_load_tests",
        username: "your-username",
        password: "your-api-key"
      },
      grafana: {
        url: "https://your-instance.grafana.net",
        username: "your-username",
        password: "your-password"
      }
    },
    instructions: {
      setup: [
        "1. Sign up for Grafana Cloud at https://grafana.com/products/cloud/",
        "2. Get your InfluxDB credentials from Grafana Cloud → Data Sources → InfluxDB",
        "3. Update the configuration in this file with your credentials",
        "4. Run: k6 cloud login --token YOUR_K6_CLOUD_TOKEN",
        "5. Run: ./run-k6-grafana-cloud.sh light"
      ],
      k6_cloud: [
        "1. Go to https://app.k6.io/ and sign up",
        "2. Get your API token from Settings → API Tokens",
        "3. Run: k6 cloud login --token YOUR_TOKEN",
        "4. Run: k6 cloud run k6_api_load_test.js --env SCENARIO=light"
      ]
    }
  };

  return config;
}

function main() {
  console.log('🌐 Setting up K6 with Grafana Cloud integration...\n');

  // Create output directory
  const outputDir = './test-results';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate Grafana Cloud script
  const script = generateGrafanaCloudScript();
  fs.writeFileSync(path.join(outputDir, 'run-k6-grafana-cloud.sh'), script);
  fs.chmodSync(path.join(outputDir, 'run-k6-grafana-cloud.sh'), '755');

  // Generate configuration file
  const config = generateGrafanaCloudConfig();
  fs.writeFileSync(path.join(outputDir, 'grafana-cloud-config.json'), JSON.stringify(config, null, 2));

  console.log('✅ Files generated:');
  console.log('   📄 ./test-results/run-k6-grafana-cloud.sh');
  console.log('   📄 ./test-results/grafana-cloud-config.json');
  console.log('');
  console.log('🚀 Next steps:');
  console.log('   1. Sign up for k6 Cloud: https://app.k6.io/');
  console.log('   2. Get your API token from k6 Cloud settings');
  console.log('   3. Run: k6 cloud login --token YOUR_TOKEN');
  console.log('   4. Run: ./test-results/run-k6-grafana-cloud.sh light');
  console.log('');
  console.log('💡 Alternative - Grafana Cloud InfluxDB:');
  console.log('   1. Sign up for Grafana Cloud: https://grafana.com/products/cloud/');
  console.log('   2. Get InfluxDB credentials from your Grafana Cloud instance');
  console.log('   3. Update the configuration in grafana-cloud-config.json');
  console.log('   4. Run k6 with InfluxDB output to Grafana Cloud');
}

if (require.main === module) {
  main();
}

module.exports = { generateGrafanaCloudScript, generateGrafanaCloudConfig };
