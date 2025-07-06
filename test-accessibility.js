const fs = require('fs');
const path = require('path');
const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');

// List of pages to test
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

async function runLighthouse(url) {
  const chrome = await chromeLauncher.launch({chromeFlags: ['--headless']});
  const options = {
    logLevel: 'info',
    output: 'json',
    onlyCategories: ['accessibility'],
    port: chrome.port
  };
  
  const runnerResult = await lighthouse(url, options);
  
  // Get the accessibility score
  const accessibilityScore = runnerResult.lhr.categories.accessibility.score * 100;
  
  // Get accessibility audit details
  const audits = runnerResult.lhr.audits;
  const issues = [];
  
  for (const [auditName, audit] of Object.entries(audits)) {
    if (audit.score !== null && audit.score < 1 && audit.details && audit.details.items) {
      issues.push({
        id: auditName,
        title: audit.title,
        description: audit.description,
        score: audit.score,
        items: audit.details.items
      });
    }
  }
  
  await chrome.kill();
  
  return {
    url,
    score: accessibilityScore,
    issues
  };
}

async function testAllPages() {
  console.log('Starting Lighthouse Accessibility Tests...\n');
  
  const results = [];
  
  // Start a simple HTTP server (you'll need to run this separately)
  console.log('Make sure you have a local server running on http://localhost:8080');
  console.log('You can use: python -m http.server 8080\n');
  
  for (const page of pagesToTest) {
    const url = `http://localhost:8080/${page}`;
    console.log(`Testing ${page}...`);
    
    try {
      const result = await runLighthouse(url);
      results.push(result);
      console.log(`✓ ${page}: ${result.score}% accessibility score`);
      
      if (result.issues.length > 0) {
        console.log(`  Found ${result.issues.length} accessibility issues`);
      }
    } catch (error) {
      console.error(`✗ Error testing ${page}:`, error.message);
    }
  }
  
  // Generate report
  generateReport(results);
}

function generateReport(results) {
  console.log('\n=== ACCESSIBILITY TEST REPORT ===\n');
  
  const totalScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  console.log(`Average Accessibility Score: ${totalScore.toFixed(1)}%\n`);
  
  results.forEach(result => {
    console.log(`\n${result.url}`);
    console.log(`Score: ${result.score}%`);
    
    if (result.issues.length > 0) {
      console.log('Issues:');
      result.issues.forEach(issue => {
        console.log(`  - ${issue.title} (${issue.id})`);
        if (issue.items.length > 0) {
          console.log(`    Affected elements: ${issue.items.length}`);
        }
      });
    } else {
      console.log('  ✓ No accessibility issues found!');
    }
  });
  
  // Save detailed report
  const reportPath = path.join(__dirname, 'accessibility-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nDetailed report saved to: ${reportPath}`);
}

// Run the tests
testAllPages().catch(console.error);