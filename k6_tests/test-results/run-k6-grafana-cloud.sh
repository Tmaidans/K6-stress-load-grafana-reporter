#!/bin/bash

# Grafana Cloud K6 Test Runner
# This script runs k6 tests and sends results to Grafana Cloud

set -e

# Configuration
SCENARIO=${1:-light}
TEST_FILE="k6_api_load_test.js"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")

echo "🚀 Starting K6 Load Test with Grafana Cloud Export"
echo "   Scenario: $SCENARIO"
echo "   Test File: $TEST_FILE"
echo "   Timestamp: $TIMESTAMP"

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
k6 cloud run $TEST_FILE --env SCENARIO=$SCENARIO

echo "✅ Test completed! Results available in k6 cloud dashboard."
echo "🌐 Check your k6 cloud dashboard for real-time results."

# Optional: Also run locally with Grafana Cloud export
echo ""
echo "💡 To also export to Grafana Cloud InfluxDB, run:"
echo "   k6 run --env SCENARIO=$SCENARIO --out influxdb=https://your-username:your-api-key@your-instance.grafana.net:8086/k6_load_tests $TEST_FILE"
