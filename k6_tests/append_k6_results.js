const fs = require('fs');
const path = require('path');

// Get the CSV row from command line arguments
const csvRow = process.argv[2];

if (!csvRow) {
  console.error('No CSV row provided');
  process.exit(1);
}

try {
  const desktopPath = require('os').homedir() + '/Desktop';
  const performanceFolder = `${desktopPath}/Performance Results`;
  const csvFilePath = path.join(performanceFolder, 'k6-api-performance-history.csv');
  
  // Create Performance Results directory if it doesn't exist
  if (!fs.existsSync(performanceFolder)) {
    fs.mkdirSync(performanceFolder, { recursive: true });
  }
  
  // Create CSV file with headers if it doesn't exist
  if (!fs.existsSync(csvFilePath)) {
    const headers = "Timestamp,Flow Name,Test Type,Total Requests,Successful Requests,Failed Requests,Success Rate (%),Average Response Time (ms),Median Response Time (ms),P95 Response Time (ms),P99 Response Time (ms),Fastest Endpoint,Fastest Time (ms),Slowest Endpoint,Slowest Time (ms),Requests Per Second,Data Received (KB),Data Sent (KB),Performance Grade\n";
    fs.writeFileSync(csvFilePath, headers);
    console.log(`📄 Created new K6 API performance CSV file: ${csvFilePath}`);
  }
  
  // Append the CSV row to the file
  fs.appendFileSync(csvFilePath, csvRow + '\n');
  console.log(`✅ K6 results automatically appended to: ${csvFilePath}`);
  
} catch (error) {
  console.error(`❌ Failed to append to CSV: ${error.message}`);
  process.exit(1);
} 