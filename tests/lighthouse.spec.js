const { test, expect } = require('@playwright/test');
const { playAudit } = require('playwright-lighthouse');
const path = require('path');

// Lighthouse thresholds
const thresholds = {
  accessibility: 95,
  'best-practices': 90,
  seo: 85,
  pwa: 50, // Not a PWA, so lower threshold
};

// Lighthouse config
const lighthouseConfig = {
  logLevel: 'info',
  output: 'html',
  onlyCategories: ['accessibility', 'best-practices', 'seo'],
  formFactor: 'desktop',
  screenEmulation: {
    disabled: true,
  },
};

test.describe('Lighthouse Accessibility Audits', () => {
  const pages = [
    { url: '/index.html', name: 'Landing Page', minScore: 95 },
    { url: '/dashboard.html', name: 'Dashboard', minScore: 95 },
    { url: '/pathway-detail.html', name: 'Pathway Detail', minScore: 95 },
    { url: '/edit-pathway.html', name: 'Edit Pathway', minScore: 93 },
    { url: '/edit-bookmark.html', name: 'Edit Bookmark', minScore: 93 },
    { url: '/github-settings.html', name: 'GitHub Settings', minScore: 93 },
    { url: '/link-audit.html', name: 'Link Audit', minScore: 93 },
    { url: '/bookmarklet.html', name: 'Bookmarklet', minScore: 93 },
  ];

  pages.forEach(({ url, name, minScore }) => {
    test(`${name} should meet accessibility standards`, async ({ page, browserName }) => {
      // Skip webkit as Lighthouse doesn't support it
      test.skip(browserName === 'webkit', 'Lighthouse not supported on WebKit');
      
      await page.goto(url);
      
      // Run Lighthouse audit
      const auditResults = await playAudit({
        page,
        thresholds,
        config: lighthouseConfig,
        reports: {
          formats: {
            html: true,
          },
          name: `lighthouse-${name.toLowerCase().replace(/\s+/g, '-')}`,
          directory: path.join(__dirname, '..', 'lighthouse-reports'),
        },
      });
      
      // Check accessibility score
      const accessibilityScore = auditResults.categories.accessibility.score * 100;
      console.log(`${name} Accessibility Score: ${accessibilityScore}%`);
      
      expect(accessibilityScore).toBeGreaterThanOrEqual(minScore);
      
      // Log any accessibility issues
      if (accessibilityScore < 100) {
        const audits = auditResults.audits;
        console.log(`\nAccessibility issues in ${name}:`);
        
        Object.entries(audits).forEach(([key, audit]) => {
          if (audit.score !== null && audit.score < 1 && 
              audit.details && audit.details.items && audit.details.items.length > 0) {
            console.log(`- ${audit.title}: ${audit.description}`);
          }
        });
      }
    });
  });

  test('HTML Export should be accessible', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Lighthouse not supported on WebKit');
    
    // Create a sample HTML export content
    const exportContent = `
      <!doctype html>
      <html lang="en" data-bs-theme="auto">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Test Pathway Export</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
      </head>
      <body>
        <div class="container py-4">
          <header class="mb-4">
            <a href="#main-content" class="visually-hidden-focusable">Skip to main content</a>
            <h1>Test Pathway</h1>
          </header>
          <main id="main-content">
            <section class="step-container">
              <details>
                <summary role="button" aria-expanded="false">
                  <h2>Step 1: Introduction</h2>
                </summary>
                <div class="step-content">
                  <article>
                    <h3>Resource 1</h3>
                    <p>Description of resource</p>
                    <a href="#" aria-label="Launch Resource 1 (opens in new tab)">Launch</a>
                  </article>
                </div>
              </details>
            </section>
          </main>
          <footer role="contentinfo">
            <p>Generated on: <time datetime="2024-01-01">January 1, 2024</time></p>
          </footer>
        </div>
      </body>
      </html>
    `;
    
    await page.setContent(exportContent);
    
    const auditResults = await playAudit({
      page,
      thresholds: { accessibility: 95 },
      config: lighthouseConfig,
    });
    
    const accessibilityScore = auditResults.categories.accessibility.score * 100;
    console.log(`HTML Export Accessibility Score: ${accessibilityScore}%`);
    
    expect(accessibilityScore).toBeGreaterThanOrEqual(95);
  });
});

test.describe('Performance Impact on Accessibility', () => {
  test('should maintain accessibility under slow network conditions', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Lighthouse not supported on WebKit');
    
    // Simulate slow 3G
    await page.route('**/*', route => {
      setTimeout(() => route.continue(), 100);
    });
    
    await page.goto('/dashboard.html');
    
    const auditResults = await playAudit({
      page,
      config: {
        ...lighthouseConfig,
        throttling: {
          rttMs: 150,
          throughputKbps: 1600,
          cpuSlowdownMultiplier: 4,
        },
      },
    });
    
    const accessibilityScore = auditResults.categories.accessibility.score * 100;
    expect(accessibilityScore).toBeGreaterThanOrEqual(90);
  });
});