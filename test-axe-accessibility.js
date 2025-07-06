const puppeteer = require('puppeteer');
const { AxePuppeteer } = require('@axe-core/puppeteer');
const fs = require('fs');
const path = require('path');

const pagesToTest = [
  'index.html',
  'dashboard.html',
  'pathway-detail.html',
  'edit-pathway.html',
  'edit-bookmark.html',
  'github-settings.html',
  'link-audit.html',
  'bookmarklet.html'
];

async function testPageAccessibility(browser, url) {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2' });
  
  // Run axe accessibility tests
  const results = await new AxePuppeteer(page).analyze();
  
  await page.close();
  
  return {
    url,
    violations: results.violations,
    passes: results.passes.length,
    incomplete: results.incomplete
  };
}

async function runAccessibilityTests() {
  console.log('Starting Axe Accessibility Tests...\n');
  console.log('Make sure you have a local server running on http://localhost:8080\n');
  
  const browser = await puppeteer.launch({ headless: 'new' });
  const allResults = [];
  
  for (const pageFile of pagesToTest) {
    const url = `http://localhost:8080/${pageFile}`;
    console.log(`Testing ${pageFile}...`);
    
    try {
      const results = await testPageAccessibility(browser, url);
      allResults.push(results);
      
      const violationCount = results.violations.length;
      const status = violationCount === 0 ? '✓' : '✗';
      console.log(`${status} ${pageFile}: ${violationCount} violations found`);
      
      // Log violations summary
      if (violationCount > 0) {
        results.violations.forEach(violation => {
          console.log(`  - ${violation.help} (${violation.impact})`);
        });
      }
    } catch (error) {
      console.error(`Error testing ${pageFile}:`, error.message);
    }
  }
  
  await browser.close();
  
  // Generate detailed report
  generateDetailedReport(allResults);
}

function generateDetailedReport(results) {
  console.log('\n=== DETAILED ACCESSIBILITY REPORT ===\n');
  
  let totalViolations = 0;
  let criticalCount = 0;
  let seriousCount = 0;
  let moderateCount = 0;
  let minorCount = 0;
  
  results.forEach(result => {
    console.log(`\n${result.url}`);
    console.log(`Violations: ${result.violations.length}`);
    console.log(`Passed: ${result.passes}`);
    console.log(`Incomplete: ${result.incomplete.length}`);
    
    if (result.violations.length > 0) {
      console.log('\nViolations by Impact:');
      result.violations.forEach(violation => {
        totalViolations++;
        switch(violation.impact) {
          case 'critical': criticalCount++; break;
          case 'serious': seriousCount++; break;
          case 'moderate': moderateCount++; break;
          case 'minor': minorCount++; break;
        }
        
        console.log(`\n  ${violation.impact.toUpperCase()}: ${violation.help}`);
        console.log(`  - Rule: ${violation.id}`);
        console.log(`  - Description: ${violation.description}`);
        console.log(`  - Affected elements: ${violation.nodes.length}`);
        
        // Show first affected element as example
        if (violation.nodes.length > 0) {
          const node = violation.nodes[0];
          console.log(`  - Example: ${node.html.substring(0, 100)}...`);
        }
      });
    }
  });
  
  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Total Pages Tested: ${results.length}`);
  console.log(`Total Violations: ${totalViolations}`);
  console.log(`- Critical: ${criticalCount}`);
  console.log(`- Serious: ${seriousCount}`);
  console.log(`- Moderate: ${moderateCount}`);
  console.log(`- Minor: ${minorCount}`);
  
  // Save detailed report
  const reportPath = path.join(__dirname, 'axe-accessibility-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nDetailed report saved to: ${reportPath}`);
  
  // Create HTML report
  createHTMLReport(results);
}

function createHTMLReport(results) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>PathCurator Accessibility Report</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body class="container py-4">
  <h1>PathCurator Accessibility Test Report</h1>
  <p>Generated: ${new Date().toLocaleString()}</p>
  
  ${results.map(result => `
    <div class="card mb-4">
      <div class="card-header">
        <h2 class="h5 mb-0">${result.url}</h2>
      </div>
      <div class="card-body">
        <div class="row">
          <div class="col-md-4">
            <p><strong>Violations:</strong> ${result.violations.length}</p>
          </div>
          <div class="col-md-4">
            <p><strong>Passed:</strong> ${result.passes}</p>
          </div>
          <div class="col-md-4">
            <p><strong>Incomplete:</strong> ${result.incomplete.length}</p>
          </div>
        </div>
        
        ${result.violations.length > 0 ? `
          <h3 class="h6 mt-3">Violations:</h3>
          <div class="list-group">
            ${result.violations.map(v => `
              <div class="list-group-item">
                <div class="d-flex justify-content-between">
                  <h4 class="h6 mb-1">${v.help}</h4>
                  <span class="badge bg-${v.impact === 'critical' ? 'danger' : v.impact === 'serious' ? 'warning' : 'secondary'}">${v.impact}</span>
                </div>
                <p class="mb-1 small">${v.description}</p>
                <p class="mb-0 text-muted small">Affected elements: ${v.nodes.length}</p>
              </div>
            `).join('')}
          </div>
        ` : '<p class="text-success">✓ No accessibility violations found!</p>'}
      </div>
    </div>
  `).join('')}
</body>
</html>`;
  
  const htmlPath = path.join(__dirname, 'accessibility-report.html');
  fs.writeFileSync(htmlPath, html);
  console.log(`HTML report saved to: ${htmlPath}`);
}

// Run the tests
runAccessibilityTests().catch(console.error);