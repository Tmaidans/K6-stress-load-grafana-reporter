#!/usr/bin/env node

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  outputDir: './test-results',
  k6Script: 'k6_api_load_test.js',
  exportScript: 'export_to_excel.js',
  trendsFile: 'k6-api-metrics-trends.csv',
  testDuration: 20, // seconds
  maxVUs: 5
};

// Utility functions
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const emoji = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
  console.log(`${emoji} [${timestamp}] ${message}`);
}

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    log(`Created directory: ${dirPath}`, 'success');
  }
}

function generateTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    log(`Running: ${command} ${args.join(' ')}`);
    
    const process = spawn(command, args, {
      stdio: 'inherit',
      ...options
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        log(`Command completed successfully: ${command}`, 'success');
        resolve();
      } else {
        log(`Command failed with code ${code}: ${command}`, 'error');
        reject(new Error(`Command failed with code ${code}`));
      }
    });
    
    process.on('error', (error) => {
      log(`Command error: ${error.message}`, 'error');
      reject(error);
    });
  });
}

function runNodeScript(scriptPath, args = []) {
  return runCommand('node', [scriptPath, ...args]);
}

// Main workflow functions
async function step1_ValidateEnvironment() {
  log('🔍 STEP 1: Validating environment...');
  
  // Check if we're in the right directory
  const currentDir = process.cwd();
  if (!currentDir.includes('k6_tests')) {
    throw new Error('Please run this script from the k6_tests directory');
  }
  
  // Check if required files exist
  const requiredFiles = [CONFIG.k6Script, CONFIG.exportScript];
  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
      throw new Error(`Required file not found: ${file}`);
    }
  }
  
  // Ensure output directory exists
  ensureDirectoryExists(CONFIG.outputDir);
  
  log('Environment validation completed', 'success');
}

async function step2_RunK6Test() {
  log('🚀 STEP 2: Running k6 load test...');
  
  const timestamp = generateTimestamp();
  const jsonFileName = `k6-api-test-results-${timestamp}.json`;
  const jsonFilePath = path.join(CONFIG.outputDir, jsonFileName);
  
  log(`Test configuration:`);
  log(`  Duration: ${CONFIG.testDuration} seconds`);
  log(`  Max VUs: ${CONFIG.maxVUs}`);
  log(`  Output: ${jsonFilePath}`);
  
  // Run k6 test
  await runCommand('k6', [
    'run',
    '--out', `json=${jsonFilePath}`,
    CONFIG.k6Script
  ]);
  
  // Verify the JSON file was created
  if (!fs.existsSync(jsonFilePath)) {
    throw new Error('k6 JSON output file was not created');
  }
  
  const fileSize = fs.statSync(jsonFilePath).size;
  log(`k6 test completed. JSON file size: ${(fileSize / 1024).toFixed(1)} KB`, 'success');
  
  return jsonFilePath;
}

async function step3_ExportToExcel(jsonFilePath, appendMode = false) {
  log('📊 STEP 3: Exporting results to Excel...');
  
  const mode = appendMode ? 'trend tracking mode' : 'individual results mode';
  log(`Export mode: ${mode}`);
  
  if (appendMode) {
    await runNodeScript(CONFIG.exportScript, [
      jsonFilePath,
      CONFIG.outputDir,
      '--append'
    ]);
  } else {
    await runNodeScript(CONFIG.exportScript, [
      jsonFilePath,
      CONFIG.outputDir
    ]);
  }
  
  log('Excel export completed', 'success');
}

async function step4_DisplaySummary(jsonFilePath, appendMode) {
  log('📋 STEP 4: Generating summary...');
  
  const trendsFilePath = path.join(CONFIG.outputDir, CONFIG.trendsFile);
  const hasTrendsFile = fs.existsSync(trendsFilePath);
  
  console.log('\n' + '='.repeat(80));
  console.log('🎉 K6 COMPLETE TEST WORKFLOW FINISHED SUCCESSFULLY!');
  console.log('='.repeat(80));
  
  console.log('\n📁 FILES CREATED:');
  console.log(`   📊 k6 Results: ${path.basename(jsonFilePath)}`);
  if (appendMode && hasTrendsFile) {
    const trendsSize = fs.statSync(trendsFilePath).size;
    console.log(`   📈 Trends File: ${CONFIG.trendsFile} (${(trendsSize / 1024).toFixed(1)} KB)`);
  }
  
  console.log('\n📍 LOCATIONS:');
  console.log(`   📂 Output Directory: ${CONFIG.outputDir}`);
  console.log(`   🔍 JSON Results: ${jsonFilePath}`);
  if (appendMode && hasTrendsFile) {
    console.log(`   📊 Excel Trends: ${trendsFilePath}`);
  }
  
  console.log('\n📈 NEXT STEPS:');
  if (appendMode) {
    console.log(`   1. Open ${CONFIG.trendsFile} in Excel`);
    console.log(`   2. Analyze performance trends over time`);
    console.log(`   3. Create charts showing response time patterns`);
    console.log(`   4. Compare endpoint performance across test runs`);
  } else {
    console.log(`   1. Open the generated CSV file in Excel`);
    console.log(`   2. Analyze this test run's performance`);
    console.log(`   3. Run with --append to build trend data`);
  }
  
  console.log('\n🔄 TO RUN AGAIN:');
      console.log(`   node run_k6_complete_test.js [--append]`);
  
  console.log('\n' + '='.repeat(80));
}

// Main execution function
async function main() {
  try {
    const args = process.argv.slice(2);
    const appendMode = args.includes('--append');
    
    console.log('🚀 K6 COMPLETE TEST WORKFLOW');
    console.log('='.repeat(50));
    console.log(`Mode: ${appendMode ? 'Trend Tracking (Append)' : 'Individual Results'}`);
    console.log(`Output Directory: ${CONFIG.outputDir}`);
    console.log(`Test Script: ${CONFIG.k6Script}`);
    console.log('='.repeat(50));
    
    // Execute workflow steps
    await step1_ValidateEnvironment();
    const jsonFilePath = await step2_RunK6Test();
    await step3_ExportToExcel(jsonFilePath, appendMode);
    await step4_DisplaySummary(jsonFilePath, appendMode);
    
    log('🎉 Complete workflow finished successfully!', 'success');
    
  } catch (error) {
    log(`Workflow failed: ${error.message}`, 'error');
    console.error('\n❌ ERROR DETAILS:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Show usage if no arguments or help requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
🚀 K6 COMPLETE TEST WORKFLOW RUNNER

This script automates the entire k6 testing pipeline:
1. Validates environment
2. Runs k6 load test with JSON export
3. Exports results to Excel (CSV)
4. Generates summary report

USAGE:
  node run_k6_complete_test.js [--append]

OPTIONS:
  --append    Add results to trends file for historical tracking
              Without this flag, creates individual result files

EXAMPLES:
  # Run test and create individual results
  node run_k6_complete_test.js
  
  # Run test and append to trends file
  node run_k6_complete_test.js --append

OUTPUT:
  - JSON results file (timestamped)
  - Excel CSV file (individual or trends)
  - Comprehensive summary report

CONFIGURATION:
  Output Directory: ${CONFIG.outputDir}
  Test Duration: ${CONFIG.testDuration} seconds
  Max VUs: ${CONFIG.maxVUs}
  k6 Script: ${CONFIG.k6Script}
`);
  process.exit(0);
}

// Run the workflow
if (require.main === module) {
  main();
}

module.exports = { main, CONFIG };
