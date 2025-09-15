#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Function to parse k6 JSON results and show per-endpoint metrics
function parseK6Results(jsonFilePath) {
  try {
    // Read the JSON file
    const fileContent = fs.readFileSync(jsonFilePath, 'utf8');
    
    // Parse each line (k6 outputs one JSON object per line)
    const lines = fileContent.trim().split('\n');
    const metrics = lines.map(line => JSON.parse(line));
    
    // Group metrics by endpoint
    const endpointData = {};
    
    metrics.forEach(metric => {
      if (metric.data && metric.data.tags && metric.data.tags.endpoint) {
        const endpoint = metric.data.tags.endpoint;
        const metricType = metric.metric;
        const value = metric.data.value;
        const time = metric.data.time;
        
        if (!endpointData[endpoint]) {
          endpointData[endpoint] = {
            requests: [],
            durations: [],
            checks: [],
            blocked: [],
            connecting: [],
            sending: [],
            waiting: [],
            receiving: []
          };
        }
        
        // Categorize metrics by type
        switch (metricType) {
          case 'http_reqs':
            endpointData[endpoint].requests.push({ value, time });
            break;
          case 'http_req_duration':
            endpointData[endpoint].durations.push({ value, time });
            break;
          case 'checks':
            endpointData[endpoint].checks.push({ value, time, check: metric.data.tags.check });
            break;
          case 'http_req_blocked':
            endpointData[endpoint].blocked.push({ value, time });
            break;
          case 'http_req_connecting':
            endpointData[endpoint].connecting.push({ value, time });
            break;
          case 'http_req_sending':
            endpointData[endpoint].sending.push({ value, time });
            break;
          case 'http_req_waiting':
            endpointData[endpoint].waiting.push({ value, time });
            break;
          case 'http_req_receiving':
            endpointData[endpoint].receiving.push({ value, time });
            break;
        }
      }
    });
    
    // Calculate statistics for each endpoint
    const endpointStats = {};
    
    Object.keys(endpointData).forEach(endpoint => {
      const data = endpointData[endpoint];
      
      // Calculate duration statistics
      const durations = data.durations.map(d => d.value);
      const sortedDurations = durations.sort((a, b) => a - b);
      
      endpointStats[endpoint] = {
        totalRequests: data.requests.length,
        successRate: (data.checks.filter(c => c.value === 1).length / data.checks.length * 100).toFixed(1),
        responseTimes: {
          min: Math.round(Math.min(...durations)),
          max: Math.round(Math.max(...durations)),
          avg: Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length),
          median: Math.round(sortedDurations[Math.floor(sortedDurations.length / 2)]),
          p95: Math.round(sortedDurations[Math.floor(sortedDurations.length * 0.95)]),
          p99: Math.round(sortedDurations[Math.floor(sortedDurations.length * 0.99)])
        },
        timingBreakdown: {
          blocked: Math.round(data.blocked.reduce((sum, b) => sum + b.value, 0) / data.blocked.length),
          connecting: Math.round(data.connecting.reduce((sum, c) => sum + c.value, 0) / data.connecting.length),
          sending: Math.round(data.sending.reduce((sum, s) => sum + s.value, 0) / data.sending.length),
          waiting: Math.round(data.waiting.reduce((sum, w) => sum + w.value, 0) / data.waiting.length),
          receiving: Math.round(data.receiving.reduce((sum, r) => sum + r.value, 0) / data.receiving.length)
        }
      };
    });
    
    return endpointStats;
    
  } catch (error) {
    console.error('Error parsing k6 results:', error.message);
    return null;
  }
}

// Function to display results in a nice format
function displayResults(endpointStats) {
  if (!endpointStats) {
    console.log('❌ No data to display');
    return;
  }
  
  console.log('\n📊 K6 LOAD TEST RESULTS - PER-ENDPOINT BREAKDOWN');
  console.log('=' .repeat(60));
  
  Object.keys(endpointStats).forEach(endpoint => {
    const stats = endpointStats[endpoint];
    
    console.log(`\n🔍 ${endpoint.toUpperCase()}`);
    console.log('─'.repeat(40));
    console.log(`   Total Requests: ${stats.totalRequests}`);
    console.log(`   Success Rate: ${stats.successRate}%`);
    
    console.log(`\n   ⏱️  Response Times:`);
    console.log(`      Min: ${stats.responseTimes.min}ms`);
    console.log(`      Max: ${stats.responseTimes.max}ms`);
    console.log(`      Average: ${stats.responseTimes.avg}ms`);
    console.log(`      Median: ${stats.responseTimes.median}ms`);
    console.log(`      P95: ${stats.responseTimes.p95}ms`);
    console.log(`      P99: ${stats.responseTimes.p99}ms`);
    
    console.log(`\n   📊 Timing Breakdown:`);
    console.log(`      Blocked: ${stats.timingBreakdown.blocked}ms`);
    console.log(`      Connecting: ${stats.timingBreakdown.connecting}ms`);
    console.log(`      Sending: ${stats.sending}ms`);
    console.log(`      Waiting: ${stats.timingBreakdown.waiting}ms`);
    console.log(`      Receiving: ${stats.timingBreakdown.receiving}ms`);
  });
  
  // Overall comparison
  console.log('\n📈 PERFORMANCE COMPARISON');
  console.log('─'.repeat(40));
  
  const endpoints = Object.keys(endpointStats);
  if (endpoints.length > 1) {
    const fastest = endpoints.reduce((fastest, current) => 
      endpointStats[current].responseTimes.avg < endpointStats[fastest].responseTimes.avg ? current : fastest
    );
    
    const slowest = endpoints.reduce((slowest, current) => 
      endpointStats[current].responseTimes.avg > endpointStats[slowest].responseTimes.avg ? current : slowest
    );
    
    console.log(`   🏆 Fastest: ${fastest} (${endpointStats[fastest].responseTimes.avg}ms avg)`);
    console.log(`   🐌 Slowest: ${slowest} (${endpointStats[slowest].responseTimes.avg}ms avg)`);
    console.log(`   📊 Difference: ${endpointStats[slowest].responseTimes.avg - endpointStats[fastest].responseTimes.avg}ms`);
  }
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node parse_k6_results.js <path-to-k6-json-file>');
    console.log('Example: node parse_k6_results.js "/Users/tim.maids/Desktop/API stuff/api-load-test-results.json"');
    return;
  }
  
  const jsonFilePath = args[0];
  
  if (!fs.existsSync(jsonFilePath)) {
    console.error(`❌ File not found: ${jsonFilePath}`);
    return;
  }
  
  console.log(`📁 Parsing k6 results from: ${jsonFilePath}`);
  
  const endpointStats = parseK6Results(jsonFilePath);
  displayResults(endpointStats);
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { parseK6Results, displayResults };
