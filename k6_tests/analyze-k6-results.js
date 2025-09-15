#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function analyzeK6Results(jsonFile) {
  console.log(`🔍 Analyzing K6 Results: ${jsonFile}\n`);
  
  try {
    const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
    
    // Extract metrics
    const metrics = data.metrics;
    const httpReqs = metrics['http_reqs'] || {};
    const httpReqDuration = metrics['http_req_duration'] || {};
    const httpReqFailed = metrics['http_req_failed'] || {};
    
    console.log('📊 OVERALL TEST SUMMARY');
    console.log('='.repeat(50));
    console.log(`Test Duration: ${(data.root_group.duration / 1000000 / 1000).toFixed(2)}s`);
    console.log(`Total Requests: ${httpReqs.count || 0}`);
    console.log(`Request Rate: ${(httpReqs.rate || 0).toFixed(2)} req/s`);
    console.log(`Average Response Time: ${(httpReqDuration.avg || 0).toFixed(2)}ms`);
    console.log(`P95 Response Time: ${(httpReqDuration.p95 || 0).toFixed(2)}ms`);
    console.log(`P99 Response Time: ${(httpReqDuration.p99 || 0).toFixed(2)}ms`);
    console.log(`Error Rate: ${((httpReqFailed.rate || 0) * 100).toFixed(2)}%`);
    console.log(`Failed Requests: ${httpReqFailed.count || 0}`);
    
    // Analyze by endpoint
    console.log('\n📈 RESPONSE TIME BREAKDOWN BY ENDPOINT');
    console.log('='.repeat(80));
    
    const endpointStats = {};
    
    // Process each request
    data.root_group.checks.forEach(check => {
      if (check.type === 'http_req_duration') {
        const endpoint = check.tags.endpoint || check.tags.name || 'Unknown';
        const duration = check.value;
        
        if (!endpointStats[endpoint]) {
          endpointStats[endpoint] = {
            count: 0,
            totalDuration: 0,
            durations: [],
            errors: 0
          };
        }
        
        endpointStats[endpoint].count++;
        endpointStats[endpoint].totalDuration += duration;
        endpointStats[endpoint].durations.push(duration);
      }
    });
    
    // Calculate statistics for each endpoint
    Object.keys(endpointStats).forEach(endpoint => {
      const stats = endpointStats[endpoint];
      const durations = stats.durations.sort((a, b) => a - b);
      
      const avg = stats.totalDuration / stats.count;
      const p50 = durations[Math.floor(durations.length * 0.5)];
      const p90 = durations[Math.floor(durations.length * 0.9)];
      const p95 = durations[Math.floor(durations.length * 0.95)];
      const p99 = durations[Math.floor(durations.length * 0.99)];
      const min = Math.min(...durations);
      const max = Math.max(...durations);
      
      console.log(`\n🔗 ${endpoint}`);
      console.log(`   Requests: ${stats.count}`);
      console.log(`   Average: ${avg.toFixed(2)}ms`);
      console.log(`   Min: ${min.toFixed(2)}ms | Max: ${max.toFixed(2)}ms`);
      console.log(`   P50: ${p50.toFixed(2)}ms | P90: ${p90.toFixed(2)}ms`);
      console.log(`   P95: ${p95.toFixed(2)}ms | P99: ${p99.toFixed(2)}ms`);
    });
    
    // Error analysis
    console.log('\n❌ ERROR ANALYSIS');
    console.log('='.repeat(50));
    
    const errorStats = {};
    data.root_group.checks.forEach(check => {
      if (check.type === 'http_req_failed' && check.value === 1) {
        const endpoint = check.tags.endpoint || check.tags.name || 'Unknown';
        errorStats[endpoint] = (errorStats[endpoint] || 0) + 1;
      }
    });
    
    if (Object.keys(errorStats).length > 0) {
      Object.keys(errorStats).forEach(endpoint => {
        console.log(`${endpoint}: ${errorStats[endpoint]} errors`);
      });
    } else {
      console.log('No errors detected! ✅');
    }
    
    // Performance insights
    console.log('\n💡 PERFORMANCE INSIGHTS');
    console.log('='.repeat(50));
    
    const avgResponseTime = httpReqDuration.avg || 0;
    const p95ResponseTime = httpReqDuration.p95 || 0;
    const errorRate = (httpReqFailed.rate || 0) * 100;
    
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
    const csvFile = jsonFile.replace('.json', '-analysis.csv');
    generateCSV(endpointStats, csvFile);
    console.log(`\n📄 Detailed analysis saved to: ${csvFile}`);
    
  } catch (error) {
    console.error('❌ Error analyzing results:', error.message);
  }
}

function generateCSV(endpointStats, filename) {
  const headers = ['Endpoint', 'Requests', 'Avg (ms)', 'Min (ms)', 'Max (ms)', 'P50 (ms)', 'P90 (ms)', 'P95 (ms)', 'P99 (ms)'];
  const rows = [headers.join(',')];
  
  Object.keys(endpointStats).forEach(endpoint => {
    const stats = endpointStats[endpoint];
    const durations = stats.durations.sort((a, b) => a - b);
    
    const avg = (stats.totalDuration / stats.count).toFixed(2);
    const min = Math.min(...durations).toFixed(2);
    const max = Math.max(...durations).toFixed(2);
    const p50 = durations[Math.floor(durations.length * 0.5)].toFixed(2);
    const p90 = durations[Math.floor(durations.length * 0.9)].toFixed(2);
    const p95 = durations[Math.floor(durations.length * 0.95)].toFixed(2);
    const p99 = durations[Math.floor(durations.length * 0.99)].toFixed(2);
    
    rows.push([endpoint, stats.count, avg, min, max, p50, p90, p95, p99].join(','));
  });
  
  fs.writeFileSync(filename, rows.join('\n'));
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('🔍 K6 Results Analyzer');
    console.log('Usage: node analyze-k6-results.js <json-file>');
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
    
    console.log('\nExample: node analyze-k6-results.js test-results/k6-results-2025-09-12_15-32-09.json');
    return;
  }
  
  const jsonFile = args[0];
  if (!fs.existsSync(jsonFile)) {
    console.error(`❌ File not found: ${jsonFile}`);
    return;
  }
  
  analyzeK6Results(jsonFile);
}

if (require.main === module) {
  main();
}

module.exports = { analyzeK6Results };
