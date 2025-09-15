#!/usr/bin/env node

/**
 * Grafana Setup and Export Utility for K6 Load Tests
 * 
 * This script helps set up Grafana monitoring for k6 load tests by:
 * 1. Configuring InfluxDB output for k6
 * 2. Setting up Grafana dashboards
 * 3. Providing export utilities for test results
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const CONFIG = {
  influxdb: {
    host: process.env.INFLUXDB_HOST || 'localhost',
    port: process.env.INFLUXDB_PORT || '8086',
    database: process.env.INFLUXDB_DB || 'k6_load_tests',
    username: process.env.INFLUXDB_USER || 'k6',
    password: process.env.INFLUXDB_PASSWORD || 'k6password',
    retention: process.env.INFLUXDB_RETENTION || '30d'
  },
  grafana: {
    host: process.env.GRAFANA_HOST || 'localhost',
    port: process.env.GRAFANA_PORT || '3000',
    username: process.env.GRAFANA_USER || 'admin',
    password: process.env.GRAFANA_PASSWORD || 'admin'
  },
  outputDir: process.env.K6_OUTPUT_DIR || './test-results'
};

class GrafanaSetup {
  constructor() {
    this.ensureOutputDir();
  }

  ensureOutputDir() {
    if (!fs.existsSync(CONFIG.outputDir)) {
      fs.mkdirSync(CONFIG.outputDir, { recursive: true });
      console.log(`✅ Created output directory: ${CONFIG.outputDir}`);
    }
  }

  /**
   * Generate k6 command with InfluxDB output
   */
  generateK6Command(testFile = 'k6_api_load_test.js', scenario = 'user_flow') {
    const influxUrl = `http://${CONFIG.influxdb.username}:${CONFIG.influxdb.password}@${CONFIG.influxdb.host}:${CONFIG.influxdb.port}/${CONFIG.influxdb.database}`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    const command = `k6 run \\
  --env SCENARIO=${scenario} \\
  --out influxdb=${influxUrl} \\
  --out json="${CONFIG.outputDir}/k6-results-${timestamp}.json" \\
  ${testFile}`;

    return command;
  }

  /**
   * Create InfluxDB database and user
   */
  async setupInfluxDB() {
    console.log('🔧 Setting up InfluxDB...');
    
    const setupScript = `
-- Create database
CREATE DATABASE ${CONFIG.influxdb.database};

-- Create retention policy
CREATE RETENTION POLICY "k6_retention" ON "${CONFIG.influxdb.database}" 
  DURATION ${CONFIG.influxdb.retention} REPLICATION 1 DEFAULT;

-- Create user (if not exists)
CREATE USER "${CONFIG.influxdb.username}" WITH PASSWORD '${CONFIG.influxdb.password}';

-- Grant privileges
GRANT ALL ON "${CONFIG.influxdb.database}" TO "${CONFIG.influxdb.username}";
    `;

    const scriptPath = path.join(CONFIG.outputDir, 'influxdb-setup.influxql');
    fs.writeFileSync(scriptPath, setupScript);
    
    console.log(`✅ InfluxDB setup script created: ${scriptPath}`);
    console.log(`📝 InfluxDB 1.x will be automatically configured via Docker environment variables`);
    console.log(`   Database: ${CONFIG.influxdb.database}`);
    console.log(`   User: ${CONFIG.influxdb.username}`);
  }

  /**
   * Generate Grafana dashboard configuration
   */
  generateGrafanaDashboard() {
    const dashboard = {
      "dashboard": {
        "id": null,
        "title": "K6 Load Test Performance Dashboard",
        "tags": ["k6", "load-testing", "performance"],
        "style": "dark",
        "timezone": "browser",
        "panels": [
          {
            "id": 1,
            "title": "Request Rate (RPS)",
            "type": "stat",
            "targets": [
              {
                "expr": "rate(http_reqs[1m])",
                "refId": "A"
              }
            ],
            "fieldConfig": {
              "defaults": {
                "color": {
                  "mode": "thresholds"
                },
                "thresholds": {
                  "steps": [
                    {"color": "green", "value": 0},
                    {"color": "yellow", "value": 100},
                    {"color": "red", "value": 500}
                  ]
                },
                "unit": "reqps"
              }
            },
            "gridPos": {"h": 8, "w": 12, "x": 0, "y": 0}
          },
          {
            "id": 2,
            "title": "Response Time (P95)",
            "type": "stat",
            "targets": [
              {
                "expr": "histogram_quantile(0.95, rate(http_req_duration_bucket[5m]))",
                "refId": "A"
              }
            ],
            "fieldConfig": {
              "defaults": {
                "color": {
                  "mode": "thresholds"
                },
                "thresholds": {
                  "steps": [
                    {"color": "green", "value": 0},
                    {"color": "yellow", "value": 1000},
                    {"color": "red", "value": 2000}
                  ]
                },
                "unit": "ms"
              }
            },
            "gridPos": {"h": 8, "w": 12, "x": 12, "y": 0}
          },
          {
            "id": 3,
            "title": "Error Rate",
            "type": "stat",
            "targets": [
              {
                "expr": "rate(http_req_failed[1m]) * 100",
                "refId": "A"
              }
            ],
            "fieldConfig": {
              "defaults": {
                "color": {
                  "mode": "thresholds"
                },
                "thresholds": {
                  "steps": [
                    {"color": "green", "value": 0},
                    {"color": "yellow", "value": 1},
                    {"color": "red", "value": 5}
                  ]
                },
                "unit": "percent"
              }
            },
            "gridPos": {"h": 8, "w": 12, "x": 0, "y": 8}
          },
          {
            "id": 4,
            "title": "Virtual Users",
            "type": "stat",
            "targets": [
              {
                "expr": "vus",
                "refId": "A"
              }
            ],
            "fieldConfig": {
              "defaults": {
                "color": {
                  "mode": "palette-classic"
                },
                "unit": "short"
              }
            },
            "gridPos": {"h": 8, "w": 12, "x": 12, "y": 8}
          },
          {
            "id": 5,
            "title": "Response Time Trends",
            "type": "timeseries",
            "targets": [
              {
                "expr": "histogram_quantile(0.50, rate(http_req_duration_bucket[1m]))",
                "refId": "A",
                "legendFormat": "P50"
              },
              {
                "expr": "histogram_quantile(0.95, rate(http_req_duration_bucket[1m]))",
                "refId": "B",
                "legendFormat": "P95"
              },
              {
                "expr": "histogram_quantile(0.99, rate(http_req_duration_bucket[1m]))",
                "refId": "C",
                "legendFormat": "P99"
              }
            ],
            "fieldConfig": {
              "defaults": {
                "unit": "ms",
                "color": {
                  "mode": "palette-classic"
                }
              }
            },
            "gridPos": {"h": 8, "w": 24, "x": 0, "y": 16}
          },
          {
            "id": 6,
            "title": "Request Rate by Endpoint",
            "type": "timeseries",
            "targets": [
              {
                "expr": "rate(http_reqs{endpoint!=\"\"}[1m])",
                "refId": "A",
                "legendFormat": "{{endpoint}}"
              }
            ],
            "fieldConfig": {
              "defaults": {
                "unit": "reqps",
                "color": {
                  "mode": "palette-classic"
                }
              }
            },
            "gridPos": {"h": 8, "w": 24, "x": 0, "y": 24}
          },
          {
            "id": 7,
            "title": "Response Time by Endpoint",
            "type": "timeseries",
            "targets": [
              {
                "expr": "histogram_quantile(0.95, rate(http_req_duration_bucket{endpoint!=\"\"}[1m]))",
                "refId": "A",
                "legendFormat": "{{endpoint}} P95"
              }
            ],
            "fieldConfig": {
              "defaults": {
                "unit": "ms",
                "color": {
                  "mode": "palette-classic"
                }
              }
            },
            "gridPos": {"h": 8, "w": 24, "x": 0, "y": 32}
          }
        ],
        "time": {
          "from": "now-1h",
          "to": "now"
        },
        "refresh": "5s"
      }
    };

    const dashboardPath = path.join(CONFIG.outputDir, 'grafana-k6-dashboard.json');
    fs.writeFileSync(dashboardPath, JSON.stringify(dashboard, null, 2));
    
    console.log(`✅ Grafana dashboard configuration created: ${dashboardPath}`);
    return dashboardPath;
  }

  /**
   * Generate Docker Compose file for InfluxDB + Grafana
   */
  generateDockerCompose() {
    const dockerCompose = `version: '3.8'

services:
  influxdb:
    image: influxdb:2.7
    container_name: k6-influxdb
    ports:
      - "8086:8086"
    environment:
      - DOCKER_INFLUXDB_INIT_MODE=setup
      - DOCKER_INFLUXDB_INIT_USERNAME=${CONFIG.influxdb.username}
      - DOCKER_INFLUXDB_INIT_PASSWORD=${CONFIG.influxdb.password}
      - DOCKER_INFLUXDB_INIT_ORG=k6-org
      - DOCKER_INFLUXDB_INIT_BUCKET=${CONFIG.influxdb.database}
      - DOCKER_INFLUXDB_INIT_ADMIN_TOKEN=k6-admin-token
    volumes:
      - influxdb-data:/var/lib/influxdb2
      - influxdb-config:/etc/influxdb2
    networks:
      - k6-monitoring

  grafana:
    image: grafana/grafana:latest
    container_name: k6-grafana
    ports:
      - "${CONFIG.grafana.port}:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=${CONFIG.grafana.username}
      - GF_SECURITY_ADMIN_PASSWORD=${CONFIG.grafana.password}
      - GF_INSTALL_PLUGINS=grafana-influxdb-datasource
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana-k6-dashboard.json:/etc/grafana/provisioning/dashboards/k6-dashboard.json
    networks:
      - k6-monitoring
    depends_on:
      - influxdb

volumes:
  influxdb-data:
  influxdb-config:
  grafana-data:

networks:
  k6-monitoring:
    driver: bridge
`;

    const composePath = path.join(CONFIG.outputDir, 'docker-compose-grafana.yml');
    fs.writeFileSync(composePath, dockerCompose);
    
    console.log(`✅ Docker Compose file created: ${composePath}`);
    return composePath;
  }

  /**
   * Generate run script for k6 with Grafana export
   */
  generateRunScript() {
    const runScript = `#!/bin/bash

# K6 Load Test with Grafana Export
# This script runs k6 tests and exports results to InfluxDB for Grafana visualization

set -e

# Configuration
SCENARIO=\${1:-user_flow}
TEST_FILE=\${2:-k6_api_load_test.js}
TIMESTAMP=\$(date +"%Y-%m-%d_%H-%M-%S")

echo "🚀 Starting K6 Load Test with Grafana Export"
echo "   Scenario: \$SCENARIO"
echo "   Test File: \$TEST_FILE"
echo "   Timestamp: \$TIMESTAMP"

# Check if InfluxDB is running
echo "🔍 Checking InfluxDB connection..."
if ! curl -s http://${CONFIG.influxdb.host}:${CONFIG.influxdb.port}/ping > /dev/null; then
    echo "❌ InfluxDB is not running. Please start it first:"
    echo "   docker-compose -f ${CONFIG.outputDir}/docker-compose-grafana.yml up -d influxdb"
    exit 1
fi

# Run k6 test with InfluxDB output
echo "🏃 Running K6 test..."
k6 run \\
  --env SCENARIO=\$SCENARIO \\
  --out influxdb=http://${CONFIG.influxdb.username}:${CONFIG.influxdb.password}@${CONFIG.influxdb.host}:${CONFIG.influxdb.port}/${CONFIG.influxdb.database} \\
  --out json="${CONFIG.outputDir}/k6-results-\$TIMESTAMP.json" \\
  \$TEST_FILE

echo "✅ Test completed! Results exported to:"
echo "   - InfluxDB: http://${CONFIG.influxdb.host}:${CONFIG.influxdb.port}"
echo "   - JSON: ${CONFIG.outputDir}/k6-results-\$TIMESTAMP.json"
echo "   - Grafana: http://${CONFIG.grafana.host}:${CONFIG.grafana.port}"

# Optional: Open Grafana in browser (macOS)
if command -v open > /dev/null; then
    echo "🌐 Opening Grafana dashboard..."
    open "http://${CONFIG.grafana.host}:${CONFIG.grafana.port}"
fi
`;

    const scriptPath = path.join(CONFIG.outputDir, 'run-k6-grafana.sh');
    fs.writeFileSync(scriptPath, runScript);
    
    // Make script executable
    try {
      execSync(`chmod +x "${scriptPath}"`);
    } catch (error) {
      console.log(`⚠️  Please make the script executable: chmod +x "${scriptPath}"`);
    }
    
    console.log(`✅ Run script created: ${scriptPath}`);
    return scriptPath;
  }

  /**
   * Generate environment configuration file
   */
  generateEnvConfig() {
    const envConfig = `# K6 Grafana Export Configuration
# Copy this to .env and modify as needed

# InfluxDB Configuration
INFLUXDB_HOST=localhost
INFLUXDB_PORT=8086
INFLUXDB_DB=k6_load_tests
INFLUXDB_USER=k6
INFLUXDB_PASSWORD=k6password
INFLUXDB_RETENTION=30d

# Grafana Configuration
GRAFANA_HOST=localhost
GRAFANA_PORT=3000
GRAFANA_USER=admin
GRAFANA_PASSWORD=admin

# Output Directory
K6_OUTPUT_DIR=./test-results
`;

    const envPath = path.join(CONFIG.outputDir, '.env.grafana');
    fs.writeFileSync(envPath, envConfig);
    
    console.log(`✅ Environment configuration created: ${envPath}`);
    return envPath;
  }

  /**
   * Setup complete Grafana monitoring stack
   */
  async setup() {
    console.log('🚀 Setting up K6 Grafana Monitoring Stack...\n');
    
    // Generate all configuration files
    await this.setupInfluxDB();
    this.generateGrafanaDashboard();
    this.generateDockerCompose();
    this.generateRunScript();
    this.generateEnvConfig();
    
    console.log('\n📋 Setup Complete! Next steps:');
    console.log('1. Start the monitoring stack:');
    console.log(`   docker-compose -f ${CONFIG.outputDir}/docker-compose-grafana.yml up -d`);
    console.log('\n2. Run a k6 test with Grafana export:');
    console.log(`   ${CONFIG.outputDir}/run-k6-grafana.sh user_flow`);
    console.log('\n3. View results in Grafana:');
    console.log(`   http://${CONFIG.grafana.host}:${CONFIG.grafana.port}`);
    console.log('   (Login: admin/admin)');
    console.log('\n4. Import the dashboard:');
    console.log(`   - Go to Grafana → Dashboards → Import`);
    console.log(`   - Upload: ${CONFIG.outputDir}/grafana-k6-dashboard.json`);
  }
}

// CLI Interface
if (require.main === module) {
  const setup = new GrafanaSetup();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'setup':
      setup.setup();
      break;
    case 'command':
      const scenario = process.argv[3] || 'user_flow';
      console.log(setup.generateK6Command('k6_api_load_test.js', scenario));
      break;
    case 'dashboard':
      setup.generateGrafanaDashboard();
      break;
    case 'docker':
      setup.generateDockerCompose();
      break;
    default:
      console.log('K6 Grafana Setup Utility');
      console.log('Usage:');
      console.log('  node grafana-setup.js setup          - Complete setup');
      console.log('  node grafana-setup.js command [scenario] - Generate k6 command');
      console.log('  node grafana-setup.js dashboard      - Generate dashboard only');
      console.log('  node grafana-setup.js docker         - Generate docker-compose only');
  }
}

module.exports = GrafanaSetup;
