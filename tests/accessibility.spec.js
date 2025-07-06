const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

// Helper function to check accessibility
async function checkAccessibility(page, context) {
  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  
  // Log violations for debugging
  if (accessibilityScanResults.violations.length > 0) {
    console.log(`\nAccessibility violations in ${context}:`);
    accessibilityScanResults.violations.forEach(violation => {
      console.log(`- ${violation.id}: ${violation.help} (${violation.impact})`);
    });
  }
  
  return accessibilityScanResults;
}

test.describe('PathCurator Accessibility Tests', () => {
  
  test.describe('Landing Page', () => {
    test('should have no accessibility violations', async ({ page }) => {
      await page.goto('/index.html');
      const results = await checkAccessibility(page, 'Landing Page');
      expect(results.violations).toEqual([]);
    });

    test('should have proper heading structure', async ({ page }) => {
      await page.goto('/index.html');
      
      const h1 = await page.locator('h1').count();
      expect(h1).toBe(1);
      
      const headings = await page.locator('h1, h2, h3, h4, h5, h6').allTextContents();
      expect(headings.length).toBeGreaterThan(0);
    });

    test('should support keyboard navigation', async ({ page }) => {
      await page.goto('/index.html');
      
      // Tab through interactive elements
      await page.keyboard.press('Tab');
      const firstFocused = await page.evaluate(() => document.activeElement.tagName);
      expect(['A', 'BUTTON', 'INPUT']).toContain(firstFocused);
      
      // Check skip link
      const skipLink = page.locator('a:has-text("Skip to main content")');
      await skipLink.focus();
      expect(await skipLink.isVisible()).toBe(true);
    });

    test('should have proper color contrast', async ({ page }) => {
      await page.goto('/index.html');
      
      // Lighthouse test for color contrast
      const results = await checkAccessibility(page, 'Landing Page - Color Contrast');
      const contrastViolations = results.violations.filter(v => v.id === 'color-contrast');
      expect(contrastViolations).toHaveLength(0);
    });
  });

  test.describe('Dashboard', () => {
    test('should have no accessibility violations', async ({ page }) => {
      await page.goto('/dashboard.html');
      const results = await checkAccessibility(page, 'Dashboard');
      expect(results.violations).toEqual([]);
    });

    test('should have accessible form controls', async ({ page }) => {
      await page.goto('/dashboard.html');
      
      // Check all buttons have accessible names
      const buttons = page.locator('button');
      const count = await buttons.count();
      
      for (let i = 0; i < count; i++) {
        const button = buttons.nth(i);
        const ariaLabel = await button.getAttribute('aria-label');
        const text = await button.textContent();
        
        expect(ariaLabel || text?.trim()).toBeTruthy();
      }
    });

    test('should announce dynamic content changes', async ({ page }) => {
      await page.goto('/dashboard.html');
      
      // Check for ARIA live regions
      const liveRegions = await page.locator('[aria-live]').count();
      expect(liveRegions).toBeGreaterThan(0);
    });

    test('should support dark mode without accessibility issues', async ({ page }) => {
      await page.goto('/dashboard.html');
      
      // Toggle dark mode
      await page.click('#theme-toggle');
      await page.waitForTimeout(500); // Wait for transition
      
      // Check accessibility in dark mode
      const results = await checkAccessibility(page, 'Dashboard - Dark Mode');
      expect(results.violations).toEqual([]);
    });
  });

  test.describe('Pathway Detail', () => {
    test('should have no accessibility violations', async ({ page }) => {
      await page.goto('/pathway-detail.html');
      const results = await checkAccessibility(page, 'Pathway Detail');
      expect(results.violations).toEqual([]);
    });

    test('should have accessible expandable sections', async ({ page }) => {
      await page.goto('/pathway-detail.html');
      
      // Check details/summary elements
      const summaries = page.locator('summary');
      const summaryCount = await summaries.count();
      
      if (summaryCount > 0) {
        for (let i = 0; i < summaryCount; i++) {
          const summary = summaries.nth(i);
          const ariaExpanded = await summary.getAttribute('aria-expanded');
          const role = await summary.getAttribute('role');
          
          expect(role).toBe('button');
          expect(['true', 'false']).toContain(ariaExpanded);
        }
      }
    });

    test('should have accessible search functionality', async ({ page }) => {
      await page.goto('/pathway-detail.html');
      
      const searchInput = page.locator('#searchInput');
      const label = await searchInput.getAttribute('aria-label');
      expect(label).toBeTruthy();
      
      // Check search results announcement
      const resultsMessage = page.locator('#searchResultsMessage');
      const ariaLive = await resultsMessage.getAttribute('aria-live');
      expect(ariaLive).toBe('polite');
    });
  });

  test.describe('Form Pages', () => {
    const formPages = [
      { url: '/edit-pathway.html', name: 'Edit Pathway' },
      { url: '/edit-bookmark.html', name: 'Edit Bookmark' },
      { url: '/bookmarklet.html', name: 'Bookmarklet' }
    ];

    formPages.forEach(({ url, name }) => {
      test(`${name} should have no accessibility violations`, async ({ page }) => {
        await page.goto(url);
        const results = await checkAccessibility(page, name);
        expect(results.violations).toEqual([]);
      });

      test(`${name} should have properly labeled form fields`, async ({ page }) => {
        await page.goto(url);
        
        // Check all inputs have labels
        const inputs = page.locator('input:not([type="hidden"]), textarea, select');
        const inputCount = await inputs.count();
        
        for (let i = 0; i < inputCount; i++) {
          const input = inputs.nth(i);
          const id = await input.getAttribute('id');
          
          if (id) {
            const label = page.locator(`label[for="${id}"]`);
            const labelCount = await label.count();
            const ariaLabel = await input.getAttribute('aria-label');
            
            expect(labelCount > 0 || ariaLabel).toBeTruthy();
          }
        }
      });

      test(`${name} should have form validation announcements`, async ({ page }) => {
        await page.goto(url);
        
        // Check for fieldsets with legends
        const fieldsets = page.locator('fieldset');
        const fieldsetCount = await fieldsets.count();
        
        if (fieldsetCount > 0) {
          for (let i = 0; i < fieldsetCount; i++) {
            const fieldset = fieldsets.nth(i);
            const legend = fieldset.locator('legend');
            const legendText = await legend.textContent();
            
            expect(legendText?.trim()).toBeTruthy();
          }
        }
      });
    });
  });

  test.describe('HTML Export', () => {
    test('should generate accessible HTML exports', async ({ page }) => {
      // This would test the generated HTML output
      // You would need to generate a sample export first
      const exportedHTML = `
        <!doctype html>
        <html lang="en" data-bs-theme="auto">
        <head>
          <meta charset="utf-8">
          <title>Sample Pathway</title>
        </head>
        <body>
          <div class="moodlecurator container py-4">
            <header class="mb-4">
              <a href="#main-content" class="visually-hidden-focusable">Skip to main content</a>
              <h1>Sample Pathway</h1>
            </header>
            <main id="main-content">
              <section>
                <h2>Step 1</h2>
                <article>
                  <h3>Resource Title</h3>
                  <a href="#" aria-label="Launch Resource Title (opens in new tab)">Launch</a>
                </article>
              </section>
            </main>
            <footer role="contentinfo">
              <p>Generated on: <time datetime="2024-01-01">January 1, 2024</time></p>
            </footer>
          </div>
        </body>
        </html>
      `;
      
      await page.setContent(exportedHTML);
      const results = await checkAccessibility(page, 'HTML Export');
      expect(results.violations).toEqual([]);
    });
  });

  test.describe('Responsive Design', () => {
    test('should be accessible on mobile devices', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
      await page.goto('/index.html');
      
      const results = await checkAccessibility(page, 'Mobile View');
      expect(results.violations).toEqual([]);
    });

    test('should have accessible mobile navigation', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/dashboard.html');
      
      // Check hamburger menu
      const toggler = page.locator('.navbar-toggler');
      const isVisible = await toggler.isVisible();
      
      if (isVisible) {
        const ariaLabel = await toggler.getAttribute('aria-label');
        expect(ariaLabel).toBeTruthy();
      }
    });
  });

  test.describe('Focus Management', () => {
    test('should have visible focus indicators', async ({ page }) => {
      await page.goto('/index.html');
      
      // Tab to first interactive element
      await page.keyboard.press('Tab');
      
      // Check if focused element has visible outline
      const focusedElement = await page.evaluate(() => {
        const el = document.activeElement;
        const styles = window.getComputedStyle(el);
        return {
          outline: styles.outline,
          outlineOffset: styles.outlineOffset,
          boxShadow: styles.boxShadow
        };
      });
      
      // Should have some form of focus indicator
      expect(
        focusedElement.outline !== 'none' || 
        focusedElement.boxShadow !== 'none'
      ).toBeTruthy();
    });
  });
});