#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function analyzeK6StreamingResults(jsonFile) {
  console.log(`🔍 Analyzing K6 Streaming Results: ${jsonFile}\n`);
  
  try {
    const content = fs.readFileSync(jsonFile, 'utf8');
    const lines = content.trim().split('\n');
    
    // Parse streaming JSON
    const metrics = {};
    const requests = [];
    const checks = [];
    
    lines.forEach(line => {
      try {
        const data = JSON.parse(line);
        
        if (data.type === 'Metric') {
          // Store metric definitions
          metrics[data.metric] = data.data;
        } else if (data.metric) {
          // Store metric values
          if (!metrics[data.metric]) {
            metrics[data.metric] = { values: [] };
          }
          if (!metrics[data.metric].values) {
            metrics[data.metric].values = [];
          }
          metrics[data.metric].values.push(data.data);
        } else if (data.type === 'Point') {
          // Store point data
          if (!metrics[data.metric]) {
            metrics[data.metric] = { values: [] };
          }
          if (!metrics[data.metric].values) {
            metrics[data.metric].values = [];
          }
          metrics[data.metric].values.push(data.data);
        } else if (data.type === 'Check') {
          checks.push(data.data);
        }
      } catch (e) {
        // Skip invalid JSON lines
      }
    });
    
    // Calculate summary statistics
    const httpReqs = metrics['http_reqs']?.values || [];
    const httpReqDuration = metrics['http_req_duration']?.values || [];
    const httpReqFailed = metrics['http_req_failed']?.values || [];
    const vus = metrics['vus']?.values || [];
    
    console.log('📊 OVERALL TEST SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total Requests: ${httpReqs.length}`);
    console.log(`Total Duration Points: ${httpReqDuration.length}`);
    console.log(`Average Response Time: ${calculateAverage(httpReqDuration.map(d => d.value))}ms`);
    console.log(`P95 Response Time: ${calculatePercentile(httpReqDuration.map(d => d.value), 95)}ms`);
    console.log(`P99 Response Time: ${calculatePercentile(httpReqDuration.map(d => d.value), 99)}ms`);
    console.log(`Error Rate: ${(calculateAverage(httpReqFailed.map(d => d.value)) * 100).toFixed(2)}%`);
    console.log(`Max VUs: ${Math.max(...vus.map(d => d.value))}`);
    
    // Analyze by endpoint
    console.log('\n📈 RESPONSE TIME BREAKDOWN BY ENDPOINT');
    console.log('='.repeat(80));
    
    const endpointStats = {};
    
    // Group by endpoint
    httpReqDuration.forEach(point => {
      const endpoint = point.tags?.endpoint || point.tags?.name || 'Unknown';
      const duration = point.value;
      
      if (!endpointStats[endpoint]) {
        endpointStats[endpoint] = {
          durations: [],
          errors: 0
        };
      }
      
      endpointStats[endpoint].durations.push(duration);
    });
    
    // Count errors by endpoint
    httpReqFailed.forEach(point => {
      if (point.value === 1) {
        const endpoint = point.tags?.endpoint || point.tags?.name || 'Unknown';
        if (endpointStats[endpoint]) {
          endpointStats[endpoint].errors++;
        }
      }
    });
    
    // Calculate statistics for each endpoint
    Object.keys(endpointStats).forEach(endpoint => {
      const stats = endpointStats[endpoint];
      const durations = stats.durations.sort((a, b) => a - b);
      
      if (durations.length === 0) return;
      
      const count = durations.length;
      const avg = durations.reduce((a, b) => a + b, 0) / count;
      const p50 = calculatePercentile(durations, 50);
      const p90 = calculatePercentile(durations, 90);
      const p95 = calculatePercentile(durations, 95);
      const p99 = calculatePercentile(durations, 99);
      const min = Math.min(...durations);
      const max = Math.max(...durations);
      const errorRate = (stats.errors / count * 100).toFixed(2);
      
      console.log(`\n🔗 ${endpoint}`);
      console.log(`   Requests: ${count}`);
      console.log(`   Average: ${avg.toFixed(2)}ms`);
      console.log(`   Min: ${min.toFixed(2)}ms | Max: ${max.toFixed(2)}ms`);
      console.log(`   P50: ${p50.toFixed(2)}ms | P90: ${p90.toFixed(2)}ms`);
      console.log(`   P95: ${p95.toFixed(2)}ms | P99: ${p99.toFixed(2)}ms`);
      console.log(`   Errors: ${stats.errors} (${errorRate}%)`);
    });
    
    // Performance insights
    console.log('\n💡 PERFORMANCE INSIGHTS');
    console.log('='.repeat(50));
    
    const avgResponseTime = calculateAverage(httpReqDuration.map(d => d.value));
    const p95ResponseTime = calculatePercentile(httpReqDuration.map(d => d.value), 95);
    const errorRate = calculateAverage(httpReqFailed.map(d => d.value)) * 100;
    
    if (avgResponseTime < 200) {
      console.log('🟢 EXCELLENT: Average response time under 200ms');
    } else if (avgResponseTime < 500) {
      console.log('🟡 GOOD: Average response time under 500ms');
    } else if (avgResponseTime < 1000) {
      console.log('🟠 ACCEPTABLE: Average response time under 1s');
    } else {
      console.log('🔴 NEEDS IMPROVEMENT: Average response time over 1s');
    }
    
    if (p95ResponseTime < 500) {
      console.log('🟢 EXCELLENT: P95 response time under 500ms');
    } else if (p95ResponseTime < 1000) {
      console.log('🟡 GOOD: P95 response time under 1s');
    } else {
      console.log('🟠 ACCEPTABLE: P95 response time over 1s');
    }
    
    if (errorRate < 1) {
      console.log('🟢 EXCELLENT: Error rate under 1%');
    } else if (errorRate < 5) {
      console.log('🟡 GOOD: Error rate under 5%');
    } else {
      console.log('🔴 NEEDS IMPROVEMENT: Error rate over 5%');
    }
    
    // Generate CSV for further analysis
    const csvFile = jsonFile.replace('.json', '-detailed-analysis.csv');
    generateCSV(endpointStats, csvFile);
    console.log(`\n📄 Detailed analysis saved to: ${csvFile}`);
    
  } catch (error) {
    console.error('❌ Error analyzing results:', error.message);
  }
}

function calculateAverage(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function calculatePercentile(values, percentile) {
  if (values.length === 0) return 0;
  const sorted = values.sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function generateCSV(endpointStats, filename) {
  const headers = ['Endpoint', 'Requests', 'Avg (ms)', 'Min (ms)', 'Max (ms)', 'P50 (ms)', 'P90 (ms)', 'P95 (ms)', 'P99 (ms)', 'Errors', 'Error Rate (%)'];
  const rows = [headers.join(',')];
  
  Object.keys(endpointStats).forEach(endpoint => {
    const stats = endpointStats[endpoint];
    const durations = stats.durations.sort((a, b) => a - b);
    
    if (durations.length === 0) return;
    
    const count = durations.length;
    const avg = (durations.reduce((a, b) => a + b, 0) / count).toFixed(2);
    const min = Math.min(...durations).toFixed(2);
    const max = Math.max(...durations).toFixed(2);
    const p50 = calculatePercentile(durations, 50).toFixed(2);
    const p90 = calculatePercentile(durations, 90).toFixed(2);
    const p95 = calculatePercentile(durations, 95).toFixed(2);
    const p99 = calculatePercentile(durations, 99).toFixed(2);
    const errorRate = (stats.errors / count * 100).toFixed(2);
    
    rows.push([endpoint, count, avg, min, max, p50, p90, p95, p99, stats.errors, errorRate].join(','));
  });
  
  fs.writeFileSync(filename, rows.join('\n'));
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('🔍 K6 Streaming Results Analyzer');
    console.log('Usage: node analyze-k6-streaming.js <json-file>');
    console.log('\nAvailable result files:');
    
    const resultDir = './test-results';
    const files = fs.readdirSync(resultDir)
      .filter(file => file.endsWith('.json') && file.startsWith('k6-results'))
      .sort()
      .reverse(); // Most recent first
    
    files.forEach((file, index) => {
      const stats = fs.statSync(path.join(resultDir, file));
      const date = stats.mtime.toLocaleString();
      console.log(`  ${index + 1}. ${file} (${date})`);
    });
    
    console.log('\nExample: node analyze-k6-streaming.js test-results/k6-results-2025-09-12_15-32-09.json');
    return;
  }
  
  const jsonFile = args[0];
  if (!fs.existsSync(jsonFile)) {
    console.error(`❌ File not found: ${jsonFile}`);
    return;
  }
  
  analyzeK6StreamingResults(jsonFile);
}

if (require.main === module) {
  main();
}

module.exports = { analyzeK6StreamingResults };
