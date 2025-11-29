#!/usr/bin/env node

/**
 * Capture screenshots of Operaton webapps
 * 
 * Uses Puppeteer to:
 * 1. Login to Operaton
 * 2. Navigate to various pages
 * 3. Capture screenshots
 * 4. Organize output for documentation
 */

import 'dotenv/config';
import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '../config/screenshots.json');
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(__dirname, '../output/screenshots');

// Configuration
const config = {
  baseUrl: process.env.OPERATON_BASE_URL || 'https://operaton-doc.open-regels.nl',
  restUrl: process.env.OPERATON_REST_URL || 'https://operaton-doc.open-regels.nl/engine-rest',
  username: process.env.OPERATON_USERNAME || 'demo',
  password: process.env.OPERATON_PASSWORD || 'demo',
  viewport: {
    width: parseInt(process.env.SCREENSHOT_WIDTH) || 1920,
    height: parseInt(process.env.SCREENSHOT_HEIGHT) || 1080
  },
  deviceScaleFactor: parseInt(process.env.SCREENSHOT_SCALE) || 2,
  headless: process.env.HEADLESS !== 'false',
  debug: process.env.DEBUG === 'true'
};

// API client for dynamic data
const api = axios.create({
  baseURL: config.restUrl,
  auth: {
    username: config.username,
    password: config.password
  }
});

/**
 * Get dynamic data needed for screenshots
 */
async function getDynamicData() {
  const data = {
    processInstances: [],
    tasks: [],
    decisionInstances: []
  };
  
  try {
    // Get running process instances
    const instances = await api.get('/process-instance', { params: { maxResults: 10 } });
    data.processInstances = instances.data;
    
    // Get tasks
    const tasks = await api.get('/task', { params: { maxResults: 10 } });
    data.tasks = tasks.data;
    
    // Get decision instances
    const decisions = await api.get('/history/decision-instance', { params: { maxResults: 10 } });
    data.decisionInstances = decisions.data;
  } catch (error) {
    console.warn('Warning: Could not fetch dynamic data:', error.message);
  }
  
  return data;
}

/**
 * Login to Operaton
 */
async function login(page, app = 'cockpit') {
  const loginUrl = `${config.baseUrl}/operaton/app/${app}/default/`;
  
  console.log(`  Navigating to: ${loginUrl}`);
  await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  
  // Wait for login form or check if already logged in
  try {
    // Check if we're on the login page
    const loginForm = await page.$('form[name="login"]');
    if (loginForm) {
      console.log('  Logging in...');
      
      // Fill in credentials
      await page.type('input[name="username"]', config.username);
      await page.type('input[name="password"]', config.password);
      
      // Submit form
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        page.click('button[type="submit"]')
      ]);
      
      console.log('  ✓ Logged in successfully');
    } else {
      console.log('  ✓ Already logged in');
    }
  } catch (error) {
    console.warn('  ⚠ Login handling:', error.message);
  }
  
  // Wait for app to load
  await page.waitForTimeout(2000);
}

/**
 * Navigate to a specific page within an app
 */
async function navigateTo(page, path, waitForSelector = null) {
  const url = path.startsWith('http') ? path : `${config.baseUrl}${path}`;
  
  console.log(`  Navigating to: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  
  if (waitForSelector) {
    try {
      await page.waitForSelector(waitForSelector, { timeout: 10000 });
    } catch {
      console.warn(`  ⚠ Selector not found: ${waitForSelector}`);
    }
  }
  
  // Give page time to fully render
  await page.waitForTimeout(1500);
}

/**
 * Take a screenshot
 */
async function takeScreenshot(page, outputPath, options = {}) {
  const fullPath = path.join(OUTPUT_DIR, outputPath);
  
  // Ensure directory exists
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  
  const screenshotOptions = {
    path: fullPath,
    type: 'png',
    ...options
  };
  
  // If selector is specified, screenshot just that element
  if (options.selector) {
    const element = await page.$(options.selector);
    if (element) {
      await element.screenshot({ path: fullPath });
    } else {
      console.warn(`  ⚠ Element not found: ${options.selector}`);
      await page.screenshot(screenshotOptions);
    }
  } else {
    await page.screenshot(screenshotOptions);
  }
  
  console.log(`  ✓ Screenshot saved: ${outputPath}`);
  return fullPath;
}

/**
 * Execute custom actions before taking screenshot
 */
async function executeActions(page, actions) {
  for (const action of actions) {
    switch (action) {
      case 'enableHeatmap':
        // Click heatmap toggle if available
        try {
          await page.click('[cam-widget-search-pill-action="toggleHeatmap"]');
          await page.waitForTimeout(1000);
        } catch {
          console.warn('  ⚠ Heatmap toggle not found');
        }
        break;
        
      case 'openCreateFilterDialog':
        try {
          await page.click('[ng-click="createFilter()"]');
          await page.waitForSelector('.modal-dialog', { timeout: 5000 });
          await page.waitForTimeout(500);
        } catch {
          console.warn('  ⚠ Create filter dialog not found');
        }
        break;
        
      case 'openFilterDetail':
        try {
          await page.click('.filter-name');
          await page.waitForTimeout(500);
        } catch {
          console.warn('  ⚠ Filter detail not found');
        }
        break;
        
      default:
        console.warn(`  ⚠ Unknown action: ${action}`);
    }
  }
}

/**
 * Resolve variables in URL path
 */
function resolvePath(pathTemplate, variables, dynamicData) {
  let resolvedPath = pathTemplate;
  
  // Replace static variables
  for (const [key, value] of Object.entries(variables || {})) {
    resolvedPath = resolvedPath.replace(`{${key}}`, value);
  }
  
  // Replace dynamic variables
  if (resolvedPath.includes('{processInstanceId}') && dynamicData.processInstances.length > 0) {
    resolvedPath = resolvedPath.replace('{processInstanceId}', dynamicData.processInstances[0].id);
  }
  
  if (resolvedPath.includes('{taskId}') && dynamicData.tasks.length > 0) {
    resolvedPath = resolvedPath.replace('{taskId}', dynamicData.tasks[0].id);
  }
  
  if (resolvedPath.includes('{decisionInstanceId}') && dynamicData.decisionInstances.length > 0) {
    resolvedPath = resolvedPath.replace('{decisionInstanceId}', dynamicData.decisionInstances[0].id);
  }
  
  return resolvedPath;
}

/**
 * Process a single screenshot definition
 */
async function captureScreenshot(page, screenshot, configData, dynamicData) {
  console.log(`\n📸 ${screenshot.id}: ${screenshot.description}`);
  
  const category = configData.categories[screenshot.category];
  if (!category) {
    console.error(`  ✗ Unknown category: ${screenshot.category}`);
    return false;
  }
  
  // Build full URL
  const resolvedPath = resolvePath(screenshot.path, screenshot.variables, dynamicData);
  
  // Check if path has unresolved variables
  if (resolvedPath.includes('{')) {
    console.warn(`  ⚠ Skipping - unresolved variables in path: ${resolvedPath}`);
    return false;
  }
  
  const fullPath = `${category.baseUrl}${resolvedPath}`;
  
  try {
    // Navigate to page
    await navigateTo(page, fullPath, screenshot.waitForSelector);
    
    // Execute any pre-screenshot actions
    if (screenshot.actions) {
      await executeActions(page, screenshot.actions);
    }
    
    // Take screenshot
    await takeScreenshot(page, screenshot.outputFile, {
      selector: screenshot.selector,
      fullPage: screenshot.fullPage
    });
    
    return true;
  } catch (error) {
    console.error(`  ✗ Failed: ${error.message}`);
    return false;
  }
}

/**
 * Main capture workflow
 */
async function main() {
  console.log('═'.repeat(60));
  console.log('  Operaton Screenshot Capture');
  console.log('═'.repeat(60));
  console.log(`\nTarget: ${config.baseUrl}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Headless: ${config.headless}\n`);
  
  // Load configuration
  const configData = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
  
  // Get dynamic data
  console.log('📊 Fetching dynamic data...');
  const dynamicData = await getDynamicData();
  console.log(`  Process instances: ${dynamicData.processInstances.length}`);
  console.log(`  Tasks: ${dynamicData.tasks.length}`);
  console.log(`  Decision instances: ${dynamicData.decisionInstances.length}`);
  
  // Launch browser
  console.log('\n🌐 Launching browser...');
  const browser = await puppeteer.launch({
    headless: config.headless ? 'new' : false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      `--window-size=${config.viewport.width},${config.viewport.height}`
    ]
  });
  
  const page = await browser.newPage();
  
  // Set viewport
  await page.setViewport({
    width: config.viewport.width,
    height: config.viewport.height,
    deviceScaleFactor: config.deviceScaleFactor
  });
  
  // Track results
  const results = {
    captured: [],
    skipped: [],
    failed: []
  };
  
  try {
    // Login to Cockpit first
    console.log('\n🔐 Logging in to Cockpit...');
    await login(page, 'cockpit');
    
    // Process each screenshot
    for (const screenshot of configData.screenshots) {
      // Check if we need to switch apps
      const category = configData.categories[screenshot.category];
      
      // Simple app switching - just navigate to the right app
      if (category.baseUrl.includes('/tasklist/')) {
        await login(page, 'tasklist');
      } else if (category.baseUrl.includes('/admin/')) {
        await login(page, 'admin');
      } else if (category.baseUrl.includes('/welcome/')) {
        await login(page, 'welcome');
      }
      
      const success = await captureScreenshot(page, screenshot, configData, dynamicData);
      
      if (success) {
        results.captured.push(screenshot.id);
      } else {
        results.failed.push(screenshot.id);
      }
    }
    
  } catch (error) {
    console.error('\n✗ Fatal error:', error.message);
    if (config.debug) {
      console.error(error.stack);
    }
  } finally {
    await browser.close();
  }
  
  // Print summary
  console.log('\n' + '═'.repeat(60));
  console.log('  Capture Summary');
  console.log('═'.repeat(60));
  console.log(`  Captured: ${results.captured.length}`);
  console.log(`  Skipped:  ${results.skipped.length}`);
  console.log(`  Failed:   ${results.failed.length}`);
  console.log('═'.repeat(60) + '\n');
  
  if (results.failed.length > 0) {
    console.log('Failed screenshots:');
    results.failed.forEach(id => console.log(`  - ${id}`));
  }
  
  console.log('\nScreenshots saved to:', OUTPUT_DIR);
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
