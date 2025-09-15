#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Function to parse k6 results and extract endpoint data
function parseK6Results(jsonFilePath) {
  try {
    const fileContent = fs.readFileSync(jsonFilePath, 'utf8');
    const lines = fileContent.trim().split('\n');
    const metrics = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    }).filter(metric => metric !== null);

    const endpointData = {};
    
    // Track global data metrics
    let globalDataReceived = 0;
    let globalDataSent = 0;
    


    metrics.forEach(metric => {
      // Handle check metrics separately since they don't have endpoint tags
      if (metric.metric === 'checks' && metric.data && metric.data.tags && metric.data.tags.check) {
        const checkName = metric.data.tags.check;
        let checkEndpoint = 'Unknown';
        
        // Try to extract endpoint from check name (e.g., "Device Information - status is 200")
        if (checkName && checkName.includes(' - ')) {
          checkEndpoint = checkName.split(' - ')[0];
        }
        
        // Initialize endpoint data if it doesn't exist
        if (!endpointData[checkEndpoint]) {
          endpointData[checkEndpoint] = {
            requests: [],
            durations: [],
            checks: [],
            blocked: [],
            connecting: [],
            sending: [],
            waiting: [],
            receiving: [],
            dataReceived: [],
            dataSent: []
          };
        }
        
        endpointData[checkEndpoint].checks.push({ 
          value: metric.data.value, 
          time: metric.data.time, 
          check: checkName 
        });
        
      } else if (metric.data && metric.data.tags && metric.data.tags.endpoint) {
        // Handle metrics that have endpoint tags
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
            receiving: [],
            dataReceived: [],
            dataSent: []
          };
        }
        
        // Categorize metrics by type
        switch (metricType) {
          case 'http_reqs':
            endpointData[endpoint].requests.push({ value, time, tags: metric.data.tags });
            break;
          case 'http_req_duration':
            endpointData[endpoint].durations.push({ value, time, tags: metric.data.tags });
            break;
          case 'http_req_blocked':
            endpointData[endpoint].blocked.push({ value, time, tags: metric.data.tags });
            break;
          case 'http_req_connecting':
            endpointData[endpoint].connecting.push({ value, time, tags: metric.data.tags });
            break;
          case 'http_req_sending':
            endpointData[endpoint].sending.push({ value, time, tags: metric.data.tags });
            break;
          case 'http_req_waiting':
            endpointData[endpoint].waiting.push({ value, time, tags: metric.data.tags });
            break;
          case 'http_req_receiving':
            endpointData[endpoint].receiving.push({ value, time, tags: metric.data.tags });
            break;
          case 'data_received':
            endpointData[endpoint].dataReceived.push({ value, time, tags: metric.data.tags });
            break;
          case 'data_sent':
            endpointData[endpoint].dataSent.push({ value, time, tags: metric.data.tags });
            break;
        }
      } else if (metric.metric === 'data_received' || metric.metric === 'data_sent') {
        // Capture global data metrics (not endpoint-specific)
        if (metric.metric === 'data_received') {
          globalDataReceived = metric.data.value;
        } else if (metric.metric === 'data_sent') {
          globalDataSent = metric.data.value;
        }
      }
    });
    
    // Distribute global data metrics across endpoints proportionally
    const totalEndpoints = Object.keys(endpointData).length;
    if (totalEndpoints > 0) {
      Object.keys(endpointData).forEach(endpoint => {
        const endpointRequests = endpointData[endpoint].requests.length;
        const totalRequests = Object.values(endpointData).reduce((sum, data) => sum + data.requests.length, 0);
        
        if (totalRequests > 0) {
          // Calculate proportional data for this endpoint
          const proportion = endpointRequests / totalRequests;
          endpointData[endpoint].globalDataReceived = Math.round(globalDataReceived * proportion);
          endpointData[endpoint].globalDataSent = Math.round(globalDataSent * proportion);
        }
      });
    }
    

    
    return endpointData;
    
  } catch (error) {
    console.error('Error parsing k6 results:', error.message);
    return null;
  }
}

// Function to calculate statistics for an endpoint
function calculateEndpointStats(endpoint, data) {
  const durations = data.durations.map(d => d.value);
  const sortedDurations = durations.sort((a, b) => a - b);
  
  // Calculate actual test duration from timestamps
  let testDuration = 0;
  if (data.requests.length > 0) {
    const startTime = new Date(data.requests[0].time);
    const endTime = new Date(data.requests[data.requests.length - 1].time);
    testDuration = Math.max(1, (endTime - startTime) / 1000); // Convert to seconds, minimum 1 second
  }
  
  // Calculate load correlation metrics using built-in k6 data
  let peakRequestRate = 0;
  let responseTimeAtPeak = 0;
  let maxLoadLevel = 0;
  
  // Extract load level from tags if available
  if (data.requests.length > 0) {
    const loadLevels = data.requests
      .map(r => r.tags?.load_level)
      .filter(level => level !== undefined)
      .map(level => parseInt(level));
    
    if (loadLevels.length > 0) {
      maxLoadLevel = Math.max(...loadLevels);
      
      // Find response times during peak load
      const peakLoadDurations = data.durations
        .filter(d => d.tags?.load_level === maxLoadLevel.toString())
        .map(d => d.value);
      
      if (peakLoadDurations.length > 0) {
        responseTimeAtPeak = Math.round(
          peakLoadDurations.reduce((sum, val) => sum + val, 0) / peakLoadDurations.length
        );
      }
    }
  }
  
  // Calculate peak request rate from request count and actual test duration
  peakRequestRate = Math.round((data.requests.length / testDuration) * 10) / 10; // Round to 1 decimal
  
  return {
    endpoint: endpoint,
    dateTime: new Date().toISOString(),
    totalRequests: data.requests.length,
    successRate: data.checks.length > 0 ? 
      (data.checks.filter(c => c.value === 1).length / data.checks.length * 100).toFixed(1) : 0,
    minResponseTime: Math.round(Math.min(...durations) || 0),
    maxResponseTime: Math.round(Math.max(...durations) || 0),
    avgResponseTime: Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length || 0),
    medianResponseTime: Math.round(sortedDurations[Math.floor(sortedDurations.length / 2)] || 0),
    p95ResponseTime: Math.round(sortedDurations[Math.floor(sortedDurations.length * 0.95)] || 0),
    p99ResponseTime: Math.round(sortedDurations[Math.floor(sortedDurations.length * 0.99)] || 0),

    avgBlockedTime: data.blocked.length > 0 ? Math.round(data.blocked.reduce((sum, b) => sum + b.value, 0) / data.blocked.length * 100) / 100 : 0,
    avgConnectingTime: data.connecting.length > 0 ? Math.round(data.connecting.reduce((sum, c) => sum + c.value, 0) / data.connecting.length * 100) / 100 : 0,
    avgSendingTime: data.sending.length > 0 ? Math.round(data.sending.reduce((sum, s) => sum + s.value, 0) / data.sending.length * 100) / 100 : 0,
    avgWaitingTime: data.waiting.length > 0 ? Math.round(data.waiting.reduce((sum, w) => sum + w.value, 0) / data.waiting.length * 100) / 100 : 0,
    avgReceivingTime: data.receiving.length > 0 ? Math.round(data.receiving.reduce((sum, r) => sum + r.value, 0) / data.receiving.length * 100) / 100 : 0,
    totalDataReceivedKB: Math.round((data.globalDataReceived || 0) / 1024),
    totalDataSentKB: Math.round((data.globalDataSent || 0) / 1024),
    requestsPerSecond: (data.requests.length / testDuration).toFixed(2), // Actual test duration
    peakRequestRate: peakRequestRate,
    responseTimeAtPeak: responseTimeAtPeak,
    maxLoadLevel: maxLoadLevel
  };
}

// Function to create CSV content
function createCSV(endpointStats) {
  const headers = [
    'Endpoint',
    'Date/Time',
    'Total Requests',
    'Success Rate (%)',
    'Min Response Time (ms)',
    'Max Response Time (ms)',
    'Avg Response Time (ms)',
    'Median Response Time (ms)',
    'P95 Response Time (ms)',
    'P99 Response Time (ms)',
    'Avg Blocked Time (ms)',
    'Avg Connecting Time (ms)',
    'Avg Sending Time (ms)',
    'Avg Waiting Time (ms)',
    'Avg Receiving Time (ms)',
    'Total Data Received (KB)',
    'Total Data Sent (KB)',
    'Requests Per Second',
    'Peak Request Rate (RPS)',
    'Response Time at Peak (ms)',
    'Max Load Level (VUs)'
  ];
  
  const rows = Object.values(endpointStats).map(stats => [
    stats.endpoint,
    stats.dateTime,
    stats.totalRequests,
    stats.successRate,
    stats.minResponseTime,
    stats.maxResponseTime,
    stats.avgResponseTime,
    stats.medianResponseTime,
    stats.p95ResponseTime,
    stats.p99ResponseTime,
    stats.avgBlockedTime,
    stats.avgConnectingTime,
    stats.avgSendingTime,
    stats.avgWaitingTime,
    stats.avgReceivingTime,
    stats.totalDataReceivedKB,
    stats.totalDataSentKB,
    stats.requestsPerSecond,
    stats.peakRequestRate,
    stats.responseTimeAtPeak,
    stats.maxLoadLevel
  ]);
  
  return [headers, ...rows].map(row => 
    row.map(field => `"${field}"`).join(',')
  ).join('\n');
}

// Function to export to Excel (CSV format that Excel can open)
function exportToExcel(jsonFilePath, outputDir, appendMode = false) {
  try {
    console.log(`📁 Parsing k6 results from: ${jsonFilePath}`);
    
    const endpointData = parseK6Results(jsonFilePath);
    if (!endpointData) {
      console.error('❌ Failed to parse k6 results');
      return;
    }
    
    // Debug: Show what we found
    console.log(`🔍 Found ${Object.keys(endpointData).length} endpoints`);
    Object.keys(endpointData).forEach(endpoint => {
      const data = endpointData[endpoint];
      console.log(`   ${endpoint}: ${data.requests.length} requests, ${data.globalDataReceived || 0} bytes received, ${data.globalDataSent || 0} bytes sent`);
      console.log(`   ${endpoint}: ${data.checks.length} checks, ${data.durations.length} durations, ${data.blocked.length} blocked times`);
      
      // Debug duration values
      if (data.durations.length > 0) {
        const sampleDurations = data.durations.slice(0, 5).map(d => `${d.value}ms`);
        console.log(`   ${endpoint} sample durations:`, sampleDurations.join(', '));
      }
      
      // Debug load levels
      if (data.requests.length > 0) {
        const loadLevels = [...new Set(data.requests.map(r => r.tags?.load_level).filter(Boolean))].sort();
        console.log(`   ${endpoint} load levels found:`, loadLevels.join(', '));
      }
      
      // Show check details
      if (data.checks.length > 0) {
        console.log(`   ${endpoint} checks:`, data.checks.map(c => `${c.check}: ${c.value}`).join(', '));
      }
    });
    
    // Calculate stats for each endpoint
    const endpointStats = {};
    Object.keys(endpointData).forEach(endpoint => {
      endpointStats[endpoint] = calculateEndpointStats(endpoint, endpointData[endpoint]);
    });
    
    // Generate output filename
    const excelFileName = appendMode ? 'k6-api-metrics-trends.csv' : `k6-api-metrics-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    const excelFilePath = path.join(outputDir, excelFileName);
    
    let csvContent;
    
    if (appendMode && fs.existsSync(excelFilePath)) {
      // Append mode: read existing CSV and add new rows
      console.log(`📝 Appending to existing trends file: ${excelFileName}`);
      
      const existingContent = fs.readFileSync(excelFilePath, 'utf8');
      const existingLines = existingContent.trim().split('\n');
      const headers = existingLines[0];
      
      // Create new rows (without headers since they already exist)
      const newRows = Object.values(endpointStats).map(stats => [
        stats.endpoint,
        stats.dateTime,
        stats.totalRequests,
        stats.successRate,
        stats.minResponseTime,
        stats.maxResponseTime,
        stats.avgResponseTime,
        stats.medianResponseTime,
        stats.p95ResponseTime,
        stats.p99ResponseTime,
        stats.avgBlockedTime,
        stats.avgConnectingTime,
        stats.avgSendingTime,
        stats.avgWaitingTime,
        stats.avgReceivingTime,
        stats.totalDataReceivedKB,
        stats.totalDataSentKB,
        stats.requestsPerSecond,
        stats.peakRequestRate,
        stats.responseTimeAtPeak,
        stats.maxLoadLevel
      ].map(field => `"${field}"`).join(','));
      
      // Combine existing content with new rows, adding empty line between runs
      csvContent = existingContent + '\n\n' + newRows.join('\n');
      
    } else {
      // Create new file with headers
      console.log(`🆕 Creating new ${appendMode ? 'trends' : 'results'} file: ${excelFileName}`);
      csvContent = createCSV(endpointStats);
    }
    
    // Write CSV file
    fs.writeFileSync(excelFilePath, csvContent, 'utf8');
    
    console.log(`\n✅ Excel export completed successfully!`);
    console.log(`📊 File: ${excelFileName}`);
    console.log(`📍 Location: ${excelFilePath}`);
    console.log(`📈 Endpoints exported: ${Object.keys(endpointStats).join(', ')}`);
    console.log(`💾 Mode: ${appendMode ? 'Appended to trends file' : 'New file created'}`);
    
    // Display summary
    console.log(`\n📋 EXPORT SUMMARY:`);
    Object.keys(endpointStats).forEach(endpoint => {
      const stats = endpointStats[endpoint];
      console.log(`\n🔍 ${endpoint}:`);
      console.log(`   Requests: ${stats.totalRequests}`);
      console.log(`   Success Rate: ${stats.successRate}%`);
      console.log(`   Avg Response Time: ${stats.avgResponseTime}ms`);
      console.log(`   P95 Response Time: ${stats.p95ResponseTime}ms`);
    });
    
    if (appendMode) {
      console.log(`\n📈 TREND TRACKING:`);
      console.log(`   Data appended to: ${excelFileName}`);
      console.log(`   Each test run adds new rows for trend analysis`);
      console.log(`   Open in Excel to see performance over time`);
    }
    
  } catch (error) {
    console.error('❌ Error exporting to Excel:', error.message);
  }
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node export_to_excel.js <path-to-k6-json-file> [output-directory] [--append]');
    console.log('Example: node export_to_excel.js "./test-results/k6-results.json"');
    console.log('Example: node export_to_excel.js "results.json" "./test-results"');
    console.log('Example: node export_to_excel.js "results.json" "./test-results" --append');
    console.log('\n📈 TREND MODE:');
    console.log('   Use --append flag to add data to existing trends file');
    console.log('   Creates k6-api-metrics-trends.csv for historical tracking');
    return;
  }
  
  const jsonFilePath = args[0];
  const outputDir = args[1] || path.dirname(jsonFilePath);
  const appendMode = args.includes('--append');
  
  if (!fs.existsSync(jsonFilePath)) {
    console.error(`❌ JSON file not found: ${jsonFilePath}`);
    return;
  }
  
  if (!fs.existsSync(outputDir)) {
    console.error(`❌ Output directory not found: ${outputDir}`);
    return;
  }
  
  exportToExcel(jsonFilePath, outputDir, appendMode);
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { parseK6Results, calculateEndpointStats, createCSV, exportToExcel };
