// Simple test script for blockquote processing

// Implementation of our improved markdownToHTML function
function markdownToHTML(mdText) {
  if (!mdText) return '';

  try {
    // 1. First, convert all blockquotes to a special marker (before HTML escaping)
    // Match both '> text' and '>text' formats for better compatibility
    let html = mdText.replace(/^>\s*(.*?)$/gm, '@@BLOCKQUOTE@@$1@@/BLOCKQUOTE@@');
    
    // 2. Now do the standard HTML escaping (won't affect our markers)
    html = html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
      
    // 3. Convert the blockquote markers back to HTML tags
    html = html.replace(/@@BLOCKQUOTE@@(.*?)@@\/BLOCKQUOTE@@/g, '<blockquote>$1</blockquote>');
    
    // Apply other Markdown processing
    
    // Headings
    html = html
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>');
    
    // Bold and italic
    html = html
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" rel="noopener noreferrer" target="_blank">$1</a>');
    
    return html;
  } catch (error) {
    console.error('Error parsing markdown:', error);
    return mdText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

// Test cases
const testCases = [
  {
    name: "Basic Blockquote",
    input: "> This is a simple blockquote.",
    expected: "<blockquote>This is a simple blockquote.</blockquote>"
  },
  {
    name: "Blockquote without space",
    input: ">This is a blockquote without space after >",
    expected: "<blockquote>This is a blockquote without space after &gt;</blockquote>"
  },
  {
    name: "Multi-line Blockquote",
    input: "> This is the first line of a blockquote.\n> This is the second line of the same blockquote.",
    expected: "<blockquote>This is the first line of a blockquote.</blockquote>\n<blockquote>This is the second line of the same blockquote.</blockquote>"
  },
  {
    name: "Blockquote with Formatting",
    input: "> This blockquote has **bold** and *italic* text.",
    expected: "<blockquote>This blockquote has <strong>bold</strong> and <em>italic</em> text.</blockquote>"
  },
  {
    name: "Blockquote with link",
    input: "> This blockquote has a [link](https://example.com) in it.",
    expected: "<blockquote>This blockquote has a <a href=\"https://example.com\" rel=\"noopener noreferrer\" target=\"_blank\">link</a> in it.</blockquote>"
  },
  {
    name: "Blockquote with > character",
    input: "> This blockquote contains a > character.",
    expected: "<blockquote>This blockquote contains a &gt; character.</blockquote>"
  },
  {
    name: "Mixed content with blockquote",
    input: "Normal paragraph.\n\n> This is a blockquote.\n\nAnother normal paragraph.",
    expected: "Normal paragraph.\n\n<blockquote>This is a blockquote.</blockquote>\n\nAnother normal paragraph."
  }
];

// Run the tests
function runTests() {
  console.log("Running blockquote tests...\n");
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach((test, index) => {
    const result = markdownToHTML(test.input);
    const success = result === test.expected;
    
    console.log(`Test ${index + 1}: ${test.name}`);
    console.log(`Input: ${test.input}`);
    console.log(`Result: ${result}`);
    console.log(`Expected: ${test.expected}`);
    console.log(`Status: ${success ? 'PASS' : 'FAIL'}`);
    
    if (!success) {
      console.log("Difference:");
      for (let i = 0; i < Math.max(result.length, test.expected.length); i++) {
        if (result[i] !== test.expected[i]) {
          console.log(`Position ${i}: Got "${result[i] || ''}" Expected "${test.expected[i] || ''}"`);
        }
      }
      failed++;
    } else {
      passed++;
    }
    
    console.log("\n-------------------\n");
  });
  
  console.log(`Test Results: ${passed} passed, ${failed} failed`);
}

// Execute tests
runTests();

// For browser use (if opened in a browser)
if (typeof window !== 'undefined') {
  window.markdownToHTML = markdownToHTML;
  window.runTests = runTests;
}

// For Node.js use
if (typeof module !== 'undefined') {
  module.exports = { markdownToHTML, runTests };
}