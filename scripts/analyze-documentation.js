#!/usr/bin/env node

/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2025 Operaton
 *
 * Analyze documentation to identify screenshots that need replacement
 *
 * This script:
 * 1. Scans markdown files for image references
 * 2. Categorizes them by webapp (cockpit, tasklist, admin)
 * 3. Identifies which ones are Camunda-specific
 * 4. Generates a replacement plan
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Patterns that indicate Camunda-specific screenshots
const CAMUNDA_PATTERNS = [
  /camunda/i,
  /cockpit/i,
  /tasklist/i,
  /admin-/i,
  /webapp/i,
  /dashboard/i,
  /process-definition/i,
  /process-instance/i,
  /decision-/i,
  /task-/i,
  /filter-/i,
  /batch/i,
  /migration/i,
  /cleanup/i,
];

// Categories for screenshots
const CATEGORIES = {
  cockpit: {
    patterns: [
      /cockpit/i,
      /dashboard/i,
      /process-/i,
      /decision-/i,
      /batch/i,
      /migration/i,
      /heatmap/i,
    ],
    description: 'Cockpit webapp screenshots',
  },
  tasklist: {
    patterns: [/tasklist/i, /task-/i, /filter/i, /form/i],
    description: 'Tasklist webapp screenshots',
  },
  admin: {
    patterns: [/admin-/i, /user/i, /group/i, /tenant/i, /authorization/i, /system/i],
    description: 'Admin webapp screenshots',
  },
  welcome: {
    patterns: [/welcome/i, /profile/i],
    description: 'Welcome page screenshots',
  },
  modeler: {
    patterns: [/modeler/i, /diagram/i, /bpmn-/i],
    description: 'Modeler screenshots',
  },
  other: {
    patterns: [],
    description: 'Other screenshots',
  },
};

/**
 * Categorize a screenshot based on its path/name
 */
function categorizeScreenshot(imagePath) {
  const pathLower = imagePath.toLowerCase();

  for (const [category, config] of Object.entries(CATEGORIES)) {
    for (const pattern of config.patterns) {
      if (pattern.test(pathLower)) {
        return category;
      }
    }
  }

  return 'other';
}

/**
 * Check if screenshot is likely Camunda-specific (needs replacement)
 */
function isCamundaSpecific(imagePath) {
  const pathLower = imagePath.toLowerCase();
  return CAMUNDA_PATTERNS.some(pattern => pattern.test(pathLower));
}

/**
 * Extract image references from markdown content
 */
function extractImageReferences(content, filePath) {
  const images = [];

  // Markdown image syntax: ![alt](path)
  const mdRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;

  while ((match = mdRegex.exec(content)) !== null) {
    const imagePath = match[2];

    // Skip external URLs
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      continue;
    }

    const ext = path.extname(imagePath).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext)) {
      images.push({
        alt: match[1],
        path: imagePath,
        fullMatch: match[0],
        sourceFile: filePath,
        lineNumber: content.substring(0, match.index).split('\n').length,
      });
    }
  }

  // HTML img tags
  const htmlRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/g;

  while ((match = htmlRegex.exec(content)) !== null) {
    const imagePath = match[1];

    if (imagePath.startsWith('http')) continue;

    images.push({
      alt: '',
      path: imagePath,
      fullMatch: match[0],
      sourceFile: filePath,
      lineNumber: content.substring(0, match.index).split('\n').length,
    });
  }

  return images;
}

/**
 * Analyze a single markdown file
 */
async function analyzeFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const images = extractImageReferences(content, filePath);

  return images.map(img => ({
    ...img,
    category: categorizeScreenshot(img.path),
    needsReplacement: isCamundaSpecific(img.path),
  }));
}

/**
 * Find all markdown files in documentation
 */
function findMarkdownFiles(docsPath) {
  const pattern = path.join(docsPath, '**/*.{md,mdx}');
  return glob(pattern, { ignore: ['**/node_modules/**'] });
}

/**
 * Generate replacement report
 */
function generateReport(allImages) {
  const report = {
    summary: {
      total: allImages.length,
      needsReplacement: allImages.filter(i => i.needsReplacement).length,
      byCategory: {},
    },
    byCategory: {},
    replacementPlan: [],
  };

  // Group by category
  for (const image of allImages) {
    if (!report.byCategory[image.category]) {
      report.byCategory[image.category] = [];
    }
    report.byCategory[image.category].push(image);
  }

  // Calculate stats per category
  for (const [category, images] of Object.entries(report.byCategory)) {
    report.summary.byCategory[category] = {
      total: images.length,
      needsReplacement: images.filter(i => i.needsReplacement).length,
    };
  }

  // Build replacement plan
  const toReplace = allImages.filter(i => i.needsReplacement);
  const uniquePaths = [...new Set(toReplace.map(i => i.path))];

  for (const imagePath of uniquePaths) {
    const references = toReplace.filter(i => i.path === imagePath);
    report.replacementPlan.push({
      imagePath,
      category: references[0].category,
      referencedIn: references.map(r => ({
        file: r.sourceFile,
        line: r.lineNumber,
      })),
    });
  }

  return report;
}

/**
 * Generate markdown report file
 */
function generateMarkdownReport(report) {
  let md = `# Operaton Screenshot Replacement Plan

Generated: ${new Date().toISOString().replace('T', ' ').substring(0, 19)}

## Summary

| Metric | Count |
|--------|-------|
| Total screenshots | ${report.summary.total} |
| Need replacement | ${report.summary.needsReplacement} |

## By Category

| Category | Total | Need Replacement |
|----------|-------|------------------|
`;

  for (const [category, stats] of Object.entries(report.summary.byCategory)) {
    md += `| ${category} | ${stats.total} | ${stats.needsReplacement} |\n`;
  }

  md += `
## Replacement Plan

Screenshots that need to be replaced with Operaton equivalents:

`;

  // Group by category
  for (const [category] of Object.entries(CATEGORIES)) {
    const items = report.replacementPlan.filter(i => i.category === category);
    if (items.length === 0) continue;

    md += `### ${category.charAt(0).toUpperCase() + category.slice(1)} (${items.length})\n\n`;

    for (const item of items.slice(0, 20)) {
      md += `- **${path.basename(item.imagePath)}**\n`;
      md += `  - Path: \`${item.imagePath}\`\n`;
      md += `  - Referenced in: ${item.referencedIn.length} file(s)\n`;
      item.referencedIn.slice(0, 3).forEach(ref => {
        md += `    - ${path.relative('.', ref.file)}:${ref.line}\n`;
      });
      if (item.referencedIn.length > 3) {
        md += `    - ... and ${item.referencedIn.length - 3} more\n`;
      }
      md += '\n';
    }

    if (items.length > 20) {
      md += `... and ${items.length - 20} more ${category} screenshots\n\n`;
    }
  }

  md += `
## Next Steps

1. **Deploy processes to Operaton**
   \`\`\`bash
   npm run deploy-processes
   \`\`\`

2. **Generate test data**
   \`\`\`bash
   npm run generate-data
   \`\`\`

3. **Capture screenshots**
   \`\`\`bash
   npm run capture-screenshots
   \`\`\`

4. **Copy screenshots to documentation**
   - Review captured screenshots in \`output/screenshots/\`
   - Copy to appropriate locations in docs
   - Update any path references if needed

## Configuration

To customize which screenshots to capture, edit \`config/screenshots.json\`.
`;

  return md;
}

/**
 * Main execution
 */
async function main() {
  console.log('═'.repeat(60));
  console.log('  Documentation Screenshot Analyzer');
  console.log(`${'═'.repeat(60)}\n`);

  // Get docs path from command line or use default
  const docsPath = process.argv[2] || '../../docs';

  console.log(`Scanning: ${docsPath}\n`);

  // Find all markdown files
  const mdFiles = await findMarkdownFiles(docsPath);
  console.log(`Found ${mdFiles.length} markdown files\n`);

  // Analyze each file
  const allImages = [];

  for (const file of mdFiles) {
    const images = await analyzeFile(file);
    allImages.push(...images);
  }

  console.log(`Found ${allImages.length} image references\n`);

  // Generate report
  const report = generateReport(allImages);

  // Print summary
  console.log('Summary:');
  console.log(`  Total screenshots: ${report.summary.total}`);
  console.log(`  Need replacement:  ${report.summary.needsReplacement}`);
  console.log('\nBy category:');

  for (const [category, stats] of Object.entries(report.summary.byCategory)) {
    console.log(`  ${category}: ${stats.total} total, ${stats.needsReplacement} need replacement`);
  }

  // Save report
  const outputDir = path.join(__dirname, '../output');
  await fs.mkdir(outputDir, { recursive: true });

  const jsonPath = path.join(outputDir, 'screenshot-analysis.json');
  const mdPath = path.join(outputDir, 'REPLACEMENT_PLAN.md');

  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(mdPath, generateMarkdownReport(report));

  console.log(`\nReports saved to:`);
  console.log(`  - ${jsonPath}`);
  console.log(`  - ${mdPath}`);
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
