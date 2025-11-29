#!/usr/bin/env node

/**
 * Check connection to Operaton instance
 */

import 'dotenv/config';
import axios from 'axios';

const config = {
  baseUrl: process.env.OPERATON_REST_URL || 'https://operaton-doc.open-regels.nl/engine-rest',
  webUrl: process.env.OPERATON_BASE_URL || 'https://operaton-doc.open-regels.nl',
  username: process.env.OPERATON_USERNAME || 'demo',
  password: process.env.OPERATON_PASSWORD || 'demo',
};

async function checkRestApi() {
  console.log(`\nChecking REST API: ${config.baseUrl}`);

  try {
    const response = await axios.get(`${config.baseUrl}/engine`, {
      auth: {
        username: config.username,
        password: config.password,
      },
      timeout: 10000,
    });

    const engines = response.data;
    console.log('  ✓ REST API accessible');
    console.log(`  ✓ Engine(s): ${engines.map(e => e.name).join(', ')}`);
    return true;
  } catch (error) {
    console.log('  ✗ REST API not accessible');
    if (error.response) {
      console.log(`    Status: ${error.response.status}`);
      if (error.response.status === 401) {
        console.log('    → Check username/password in .env file');
      }
    } else if (error.code === 'ECONNREFUSED') {
      console.log('    → Connection refused. Is Operaton running?');
    } else if (error.code === 'ENOTFOUND') {
      console.log('    → Host not found. Check OPERATON_REST_URL in .env');
    } else {
      console.log(`    Error: ${error.message}`);
    }
    return false;
  }
}

async function checkWebApps() {
  console.log(`\nChecking Web Apps: ${config.webUrl}`);

  const apps = ['cockpit', 'tasklist', 'admin'];

  for (const app of apps) {
    const url = `${config.webUrl}/operaton/app/${app}/default/`;
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        maxRedirects: 5,
      });
      console.log(`  ✓ ${app.charAt(0).toUpperCase() + app.slice(1)} accessible`);
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 302) {
        // Login page or redirect is expected
        console.log(
          `  ✓ ${app.charAt(0).toUpperCase() + app.slice(1)} accessible (requires login)`
        );
      } else {
        console.log(`  ✗ ${app.charAt(0).toUpperCase() + app.slice(1)} not accessible`);
      }
    }
  }
}

async function checkVersion() {
  console.log('\nChecking Version Info:');

  try {
    const response = await axios.get(`${config.baseUrl}/version`, {
      auth: {
        username: config.username,
        password: config.password,
      },
    });
    console.log(`  Version: ${response.data.version || 'unknown'}`);
  } catch {
    console.log('  Version: Could not determine');
  }
}

async function main() {
  console.log('═'.repeat(50));
  console.log('  Operaton Connection Check');
  console.log('═'.repeat(50));

  const restOk = await checkRestApi();

  if (restOk) {
    await checkVersion();
    await checkWebApps();

    console.log(`\n${'═'.repeat(50)}`);
    console.log('  ✓ Connection successful!');
    console.log('═'.repeat(50));
    console.log('\nYou can now run:');
    console.log('  make deploy   # Deploy processes');
    console.log('  make data     # Generate test data');
    console.log('  make capture  # Capture screenshots');
  } else {
    console.log(`\n${'═'.repeat(50)}`);
    console.log('  ✗ Connection failed');
    console.log('═'.repeat(50));
    console.log('\nTroubleshooting:');
    console.log('  1. Verify Operaton is running');
    console.log('  2. Check .env file configuration');
    console.log('  3. Verify network connectivity');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
