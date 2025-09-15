#!/bin/bash

# K6 Load Test with Grafana Export
# This script runs k6 tests and exports results to InfluxDB for Grafana visualization

set -e

# Configuration
SCENARIO=${1:-user_flow}
TEST_FILE=${2:-k6_api_load_test.js}
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")

echo "🚀 Starting K6 Load Test with Grafana Export"
echo "   Scenario: $SCENARIO"
echo "   Test File: $TEST_FILE"
echo "   Timestamp: $TIMESTAMP"

# Check if InfluxDB is running
echo "🔍 Checking InfluxDB connection..."
if ! curl -s http://localhost:8086/ping > /dev/null; then
    echo "❌ InfluxDB is not running. Please start it first:"
    echo "   docker-compose -f ./test-results/docker-compose-grafana.yml up -d influxdb"
    exit 1
fi

# Run k6 test with InfluxDB output
echo "🏃 Running K6 test..."
k6 run \
  --env SCENARIO=$SCENARIO \
  --out influxdb=http://k6:k6password@localhost:8086/k6_load_tests \
  --out json="./test-results/k6-results-$TIMESTAMP.json" \
  $TEST_FILE

echo "✅ Test completed! Results exported to:"
echo "   - InfluxDB: http://localhost:8086"
echo "   - JSON: ./test-results/k6-results-$TIMESTAMP.json"
echo "   - Grafana: http://localhost:3000"

# Optional: Open Grafana in browser (macOS)
if command -v open > /dev/null; then
    echo "🌐 Opening Grafana dashboard..."
    open "http://localhost:3000"
fi
