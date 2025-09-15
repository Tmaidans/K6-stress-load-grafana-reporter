# K6 Load Testing Suite with Grafana Monitoring

This folder contains a comprehensive k6 load testing suite with advanced monitoring capabilities, including both local Grafana dashboards and k6 Cloud integration. The suite provides detailed performance analysis, real-time monitoring, and professional reporting for API load testing.

## File Structure

### Core Test Files

- **`k6_api_load_test.js`** - Main k6 load test script with multiple scenarios, API endpoints, thresholds, and InfluxDB export
- **`k6_baseline_test.js`** - Baseline performance test script for establishing performance benchmarks
- **`run_k6_complete_test.js`** - Main runner script that orchestrates the entire testing workflow
- **`webAppPerformance_TM.spec.ts`** - Playwright performance test for web application

### Grafana Monitoring Files

- **`grafana-setup.js`** - Complete Grafana setup utility with InfluxDB configuration and dashboard generation
- **`grafana-k6-dashboard.json`** - Pre-configured Grafana dashboard for K6 metrics (InfluxDB 2.x format)
- **`docker-compose-grafana.yml`** - Docker Compose setup for InfluxDB 1.8 + Grafana stack
- **`grafana-datasource.yml`** - InfluxDB datasource configuration for Grafana
- **`test-results/grafana-k6-dashboard-influxdb1.json`** - InfluxDB 1.x compatible dashboard
- **`test-results/detailed-k6-dashboard.json`** - Comprehensive dashboard with detailed analysis panels
- **`test-results/simple-working-dashboard.json`** - Basic working dashboard for troubleshooting

### Cloud Testing Files

- **`grafana-cloud-setup.js`** - Setup utility for k6 Cloud and Grafana Cloud integration
- **`test-results/run-k6-grafana-cloud.sh`** - Script for running tests in k6 Cloud
- **`test-results/grafana-cloud-config.json`** - Configuration file for cloud testing setup

### Analysis and Reporting Tools

- **`analyze-k6-results.js`** - Analyzes k6 JSON results and provides detailed performance breakdown
- **`analyze-k6-streaming.js`** - Analyzes k6 streaming JSON format results with endpoint-by-endpoint analysis
- **`export_to_excel.js`** - Parses k6 JSON results and exports to CSV format
- **`parse_k6_results.js`** - Parses and analyzes k6 test results
- **`append_k6_results.js`** - Appends results to existing CSV files for trend analysis

### Test Reports and Results

- **`ctrf-report.json`** - CTRF (Common Test Results Format) report for test results
- **`test-results/`** - Directory containing all test output files (JSON, CSV, analysis reports)
- **`test-results/k6-results-*.json`** - Timestamped k6 test results in streaming JSON format
- **`test-results/*-detailed-analysis.csv`** - Detailed CSV analysis reports per test run

## Usage

### Local Grafana Monitoring Setup

1. **Setup Grafana monitoring stack:**

```bash
cd tests/k6_tests
node grafana-setup.js setup
```

2. **Start the monitoring services:**

```bash
docker-compose -f docker-compose-grafana.yml up -d
```

3. **Run a k6 test with Grafana export:**

```bash
# Using the generated script
./test-results/run-k6-grafana.sh light

# Or manually with InfluxDB output
k6 run --env SCENARIO=light --out influxdb=http://k6:k6password@localhost:8086/k6_load_tests k6_api_load_test.js
```

4. **View results in Grafana:**
   - Open http://localhost:3000
   - Login: admin/admin
   - Create dashboard manually (import may have issues with InfluxDB 1.x compatibility)
   - Use queries like: `SELECT "value" FROM "http_req_duration" WHERE $timeFilter GROUP BY "endpoint"`

### K6 Cloud Testing

1. **Setup k6 Cloud integration:**

```bash
cd tests/k6_tests
node grafana-cloud-setup.js
```

2. **Login to k6 Cloud:**

```bash
k6 cloud login --token YOUR_K6_CLOUD_TOKEN
```

3. **Run tests in k6 Cloud:**

```bash
# Using the generated script
./test-results/run-k6-grafana-cloud.sh light

# Or directly
k6 cloud run k6_api_load_test.js --env SCENARIO=light
```

### Available Test Scenarios

The k6 test script includes multiple scenarios:

- **`light`** - Quick validation test (1-2 VUs, 5 minutes) - perfect for development
- **`user_flow`** - Realistic user interactions with think time
- **`dashboard`** - All APIs hit simultaneously for load testing
- **`user_flow_benchmark`** - Baseline performance measurement (15-25 VUs, 24min)
- **`dashboard_benchmark`** - API load baseline measurement (20-25 VUs, 19min)

### Running Tests

```bash
# Run specific scenario locally
k6 run --env SCENARIO=light k6_api_load_test.js

# Run with InfluxDB export
k6 run --env SCENARIO=light --out influxdb=http://k6:k6password@localhost:8086/k6_load_tests k6_api_load_test.js

# Run in k6 Cloud
k6 cloud run k6_api_load_test.js --env SCENARIO=light

# Run complete test workflow
node run_k6_complete_test.js
```

### Analysis and Reporting

```bash
# Analyze k6 streaming JSON results
node analyze-k6-streaming.js test-results/k6-results-YYYY-MM-DD_HH-MM-SS.json

# Export results to Excel
node export_to_excel.js <json_file_path> <output_directory> [--append]

# Run Playwright performance test
npx playwright test webAppPerformance_TM.spec.ts
```

## Monitoring and Analysis

### Local Grafana Dashboard

The local Grafana setup provides comprehensive monitoring with:

- **Real-time Metrics**: Request rate, response times, error rates, and virtual users
- **Individual Request Analysis**: Timeline view of each request's response time
- **Endpoint Performance**: Detailed breakdown by API endpoint with P50, P90, P95, P99 percentiles
- **Time Series Analysis**: Response time trends over test duration
- **Error Rate Monitoring**: Failed request tracking per endpoint
- **Load Test Scenarios**: Current test phase and scenario information

### K6 Cloud Integration

For professional monitoring and reporting, the suite includes k6 Cloud integration:

- **Cloud-based Testing**: Run tests on k6's infrastructure
- **Professional Dashboards**: Built-in k6 Cloud dashboards with advanced analytics
- **Real-time Monitoring**: Live test execution monitoring
- **Detailed Reports**: Comprehensive test reports and analysis
- **Team Collaboration**: Share results and collaborate on performance analysis

### Performance Analysis Tools

The suite includes several analysis tools for detailed performance evaluation:

#### Command Line Analysis

```bash
# Analyze streaming JSON results with detailed breakdown
node analyze-k6-streaming.js test-results/k6-results-2025-09-12_15-32-09.json

# Output includes:
# - Overall test summary with key metrics
# - Endpoint-by-endpoint response time analysis
# - P50, P90, P95, P99 percentiles per endpoint
# - Error rate analysis
# - Performance insights and recommendations
# - CSV export for further analysis
```

#### Grafana Queries for Manual Dashboard Creation

When creating dashboards manually in Grafana, use these InfluxDB queries:

```sql
-- Individual request response times over time
SELECT "value" FROM "http_req_duration" WHERE $timeFilter GROUP BY "endpoint"

-- Response time by endpoint with time grouping
SELECT mean("value") FROM "http_req_duration" WHERE $timeFilter GROUP BY "endpoint", time(30s)

-- Total requests count
SELECT sum("value") FROM "http_reqs" WHERE $timeFilter

-- Average response time
SELECT mean("value") FROM "http_req_duration" WHERE $timeFilter

-- Error rate over time
SELECT mean("value") FROM "http_req_failed" WHERE $timeFilter GROUP BY time(30s)

-- Virtual users over time
SELECT mean("value") FROM "vus" WHERE $timeFilter GROUP BY time(30s)
```

### Environment Configuration

```bash
# InfluxDB Configuration (Local)
INFLUXDB_HOST=localhost
INFLUXDB_PORT=8086
INFLUXDB_DB=k6_load_tests
INFLUXDB_USER=k6
INFLUXDB_PASSWORD=k6password

# Grafana Configuration (Local)
GRAFANA_HOST=localhost
GRAFANA_PORT=3000
GRAFANA_USER=admin
GRAFANA_PASSWORD=admin

# K6 Cloud Configuration
K6_CLOUD_TOKEN=your_k6_cloud_token_here
```

## Test Configuration

### Test Scenarios and Thresholds

Each scenario has specific configuration:

- **Light Scenario**: 1-2 VUs, 5 minutes duration, 0.5-2 iterations/s
- **User Flow Scenario**: 10-15 VUs, 15 minutes duration, realistic user behavior
- **Dashboard Scenario**: 15-20 VUs, 10 minutes duration, simultaneous API calls
- **Benchmark Scenarios**: 15-25 VUs, 19-24 minutes duration, performance baselines

### Performance Thresholds

- **Response Time**: P95 < 2000ms (Heavy APIs), P95 < 500ms (Light APIs)
- **Error Rate**: < 15% (Heavy APIs), < 1% (Light APIs)
- **Request Rate**: Varies by scenario (0.5-2 req/s for light, higher for load tests)

### Test Endpoints

The k6 test covers multiple API endpoints:

1. **Device Information API** (`/api/v1/prism/device_information`) - Device management
2. **Apps API** (`/api/v1/prism/apps`) - Application management
3. **Visibility Views Count** (`/v1/views/count`) - Dashboard metrics
4. **Universal Search Recents** (`/v1/universal-search/recents`) - Search functionality
5. **Threat Activity Graph Tiles** (`/api/v1/graph-tiles/threat-activity`) - Security metrics
6. **Devices Under Threat** (`/api/v1/graph-tiles/devices-under-threat`) - Security analysis
7. **Vulnerabilities by Severity** (`/v2/dashboards/vulnerabilities_by_severity`) - Security dashboard
8. **Vulnerabilities by Software** (`/v2/dashboards/vulnerabilities_by_software`) - Security dashboard
9. **Active Blueprints Count** (`/v1/landing_page/get_active_blueprints_count`) - Blueprint metrics

## Output Files and Reports

### Generated Files

- **JSON Results**: `test-results/k6-results-YYYY-MM-DD_HH-MM-SS.json` - Streaming JSON format
- **CSV Analysis**: `test-results/*-detailed-analysis.csv` - Detailed endpoint analysis
- **CTRF Report**: `ctrf-report.json` - Standardized test reporting format
- **Grafana Configs**: Various dashboard and datasource configuration files

### Analysis Output

The analysis tools generate comprehensive reports including:

- **Overall Performance Summary**: Total requests, average response time, error rates
- **Endpoint-by-Endpoint Analysis**: Individual performance metrics per API
- **Percentile Analysis**: P50, P90, P95, P99 response times
- **Performance Insights**: Automated recommendations based on thresholds
- **CSV Export**: Detailed metrics for further analysis in Excel or other tools

## Troubleshooting

### Common Issues

1. **Grafana Dashboard Import Issues**: Use manual dashboard creation with provided InfluxDB queries
2. **InfluxDB Connection Errors**: Ensure Docker containers are running and credentials are correct
3. **k6 Cloud Authentication**: Verify API token is valid and properly configured
4. **Data Not Appearing**: Check time range in Grafana and ensure test data was exported to InfluxDB

### Docker Container Management

```bash
# Start monitoring stack
docker-compose -f docker-compose-grafana.yml up -d

# Stop monitoring stack
docker-compose -f docker-compose-grafana.yml down

# Check container status
docker ps

# View logs
docker logs k6-influxdb
docker logs k6-grafana
```

## Migration and History

- **Moved from**: `tests/web_app/` folder
- **Enhanced with**: Grafana monitoring, k6 Cloud integration, detailed analysis tools
- **Updated**: All file references to use relative paths within k6_tests folder
- **Added**: Multiple test scenarios, cloud testing capabilities, comprehensive reporting
