#!/usr/bin/env node

/**
 * Reset Operaton Environment
 *
 * Deletes:
 * - All process instances (running and completed)
 * - All deployments
 * - All created users and groups
 * - All batches
 * - All history data
 */

import 'dotenv/config';
import axios from 'axios';
import readline from 'readline';

// Configuration
const config = {
  baseUrl: process.env.OPERATON_REST_URL || 'https://operaton-doc.open-regels.nl/engine-rest',
  username: process.env.OPERATON_USERNAME || 'demo',
  password: process.env.OPERATON_PASSWORD || 'demo',
};

// API client
const api = axios.create({
  baseURL: config.baseUrl,
  auth: {
    username: config.username,
    password: config.password,
  },
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

// Parse command line arguments
const args = process.argv.slice(2);
const forceMode = args.includes('--force');
const instancesOnly = args.includes('--instances-only');
const deploymentsOnly = args.includes('--deployments-only');
const usersOnly = args.includes('--users-only');
const historyOnly = args.includes('--history-only');

// Users created by our scripts (don't delete demo or admin users)
const CREATED_USERS = ['john', 'mary', 'peter'];
const CREATED_GROUPS = ['accounting', 'management', 'sales'];

/**
 * Delay helper
 */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Ask for confirmation
 */
async function confirm(message) {
  if (forceMode) return true;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    rl.question(`${message} [y/N] `, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

// ============================================================================
// DELETE FUNCTIONS
// ============================================================================

/**
 * Delete all running process instances
 */
async function deleteProcessInstances() {
  console.log('\n🗑️  Deleting process instances...');

  try {
    // Get all running instances
    const response = await api.get('/process-instance', { params: { maxResults: 1000 } });
    const instances = response.data;

    if (instances.length === 0) {
      console.log('  No running instances found');
      return 0;
    }

    console.log(`  Found ${instances.length} running instance(s)`);

    // Delete each instance
    let deleted = 0;
    for (const instance of instances) {
      try {
        await api.delete(`/process-instance/${instance.id}`, {
          params: { skipCustomListeners: true, skipIoMappings: true },
        });
        deleted++;
      } catch (error) {
        // Try force delete
        try {
          await api.delete(`/process-instance/${instance.id}`, {
            params: { skipCustomListeners: true, skipIoMappings: true, skipSubprocesses: true },
          });
          deleted++;
        } catch (e) {
          console.log(`  ⚠ Could not delete instance ${instance.id}`);
        }
      }
    }

    console.log(`  ✓ Deleted ${deleted} process instance(s)`);
    return deleted;
  } catch (error) {
    console.error('  ✗ Error deleting instances:', error.message);
    return 0;
  }
}

/**
 * Delete all historic process instances
 */
async function deleteHistoricInstances() {
  console.log('\n🗑️  Deleting historic process instances...');

  try {
    // Get all historic instances
    const response = await api.get('/history/process-instance', { params: { maxResults: 1000 } });
    const instances = response.data;

    if (instances.length === 0) {
      console.log('  No historic instances found');
      return 0;
    }

    console.log(`  Found ${instances.length} historic instance(s)`);

    // Delete each instance
    let deleted = 0;
    for (const instance of instances) {
      try {
        await api.delete(`/history/process-instance/${instance.id}`);
        deleted++;
      } catch (error) {
        console.log(`  ⚠ Could not delete historic instance ${instance.id}`);
      }
    }

    console.log(`  ✓ Deleted ${deleted} historic instance(s)`);
    return deleted;
  } catch (error) {
    console.error('  ✗ Error deleting historic instances:', error.message);
    return 0;
  }
}

/**
 * Delete all deployments
 */
async function deleteDeployments() {
  console.log('\n🗑️  Deleting deployments...');

  try {
    // Get all deployments
    const response = await api.get('/deployment');
    const deployments = response.data;

    if (deployments.length === 0) {
      console.log('  No deployments found');
      return 0;
    }

    console.log(`  Found ${deployments.length} deployment(s)`);

    // Delete each deployment
    let deleted = 0;
    for (const deployment of deployments) {
      try {
        await api.delete(`/deployment/${deployment.id}`, {
          params: { cascade: true, skipCustomListeners: true, skipIoMappings: true },
        });
        deleted++;
        console.log(`    Deleted: ${deployment.name || deployment.id}`);
      } catch (error) {
        console.log(
          `  ⚠ Could not delete deployment ${deployment.id}: ${error.response?.data?.message || error.message}`
        );
      }
      await delay(100);
    }

    console.log(`  ✓ Deleted ${deleted} deployment(s)`);
    return deleted;
  } catch (error) {
    console.error('  ✗ Error deleting deployments:', error.message);
    return 0;
  }
}

/**
 * Delete batches
 */
async function deleteBatches() {
  console.log('\n🗑️  Deleting batches...');

  try {
    const response = await api.get('/batch');
    const batches = response.data;

    if (batches.length === 0) {
      console.log('  No batches found');
      return 0;
    }

    console.log(`  Found ${batches.length} batch(es)`);

    let deleted = 0;
    for (const batch of batches) {
      try {
        await api.delete(`/batch/${batch.id}`, { params: { cascade: true } });
        deleted++;
      } catch (error) {
        console.log(`  ⚠ Could not delete batch ${batch.id}`);
      }
    }

    console.log(`  ✓ Deleted ${deleted} batch(es)`);
    return deleted;
  } catch (error) {
    console.error('  ✗ Error deleting batches:', error.message);
    return 0;
  }
}

/**
 * Delete historic batches
 */
async function deleteHistoricBatches() {
  console.log('\n🗑️  Deleting historic batches...');

  try {
    const response = await api.get('/history/batch');
    const batches = response.data;

    if (batches.length === 0) {
      console.log('  No historic batches found');
      return 0;
    }

    let deleted = 0;
    for (const batch of batches) {
      try {
        await api.delete(`/history/batch/${batch.id}`);
        deleted++;
      } catch (error) {
        // Ignore
      }
    }

    console.log(`  ✓ Deleted ${deleted} historic batch(es)`);
    return deleted;
  } catch (error) {
    return 0;
  }
}

/**
 * Delete created users
 */
async function deleteUsers() {
  console.log('\n🗑️  Deleting created users...');

  let deleted = 0;
  for (const userId of CREATED_USERS) {
    try {
      await api.delete(`/user/${userId}`);
      console.log(`    Deleted user: ${userId}`);
      deleted++;
    } catch (error) {
      if (error.response?.status !== 404) {
        console.log(`  ⚠ Could not delete user ${userId}`);
      }
    }
  }

  console.log(`  ✓ Deleted ${deleted} user(s)`);
  return deleted;
}

/**
 * Delete created groups
 */
async function deleteGroups() {
  console.log('\n🗑️  Deleting created groups...');

  let deleted = 0;
  for (const groupId of CREATED_GROUPS) {
    try {
      await api.delete(`/group/${groupId}`);
      console.log(`    Deleted group: ${groupId}`);
      deleted++;
    } catch (error) {
      if (error.response?.status !== 404) {
        console.log(`  ⚠ Could not delete group ${groupId}`);
      }
    }
  }

  console.log(`  ✓ Deleted ${deleted} group(s)`);
  return deleted;
}

/**
 * Delete decision instances
 */
async function deleteDecisionInstances() {
  console.log('\n🗑️  Deleting decision instances...');

  try {
    const response = await api.get('/history/decision-instance', { params: { maxResults: 1000 } });
    const instances = response.data;

    if (instances.length === 0) {
      console.log('  No decision instances found');
      return 0;
    }

    console.log(`  Found ${instances.length} decision instance(s)`);

    let deleted = 0;
    for (const instance of instances) {
      try {
        await api.delete(`/history/decision-instance/${instance.id}`);
        deleted++;
      } catch (error) {
        // Some may not be deletable individually
      }
    }

    console.log(`  ✓ Deleted ${deleted} decision instance(s)`);
    return deleted;
  } catch (error) {
    return 0;
  }
}

/**
 * Clear all jobs
 */
async function deleteJobs() {
  console.log('\n🗑️  Deleting jobs...');

  try {
    const response = await api.get('/job', { params: { maxResults: 1000 } });
    const jobs = response.data;

    if (jobs.length === 0) {
      console.log('  No jobs found');
      return 0;
    }

    console.log(`  Found ${jobs.length} job(s)`);

    let deleted = 0;
    for (const job of jobs) {
      try {
        await api.delete(`/job/${job.id}`);
        deleted++;
      } catch (error) {
        // Some jobs can't be deleted directly
      }
    }

    console.log(`  ✓ Deleted ${deleted} job(s)`);
    return deleted;
  } catch (error) {
    return 0;
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('═'.repeat(60));
  console.log('  Operaton Environment Reset');
  console.log('═'.repeat(60));
  console.log(`\nTarget: ${config.baseUrl}`);

  // Test connection
  try {
    await api.get('/engine');
    console.log('✓ Connected to Operaton\n');
  } catch (error) {
    console.error('✗ Failed to connect to Operaton:', error.message);
    process.exit(1);
  }

  // Determine what to delete
  const deleteAll = !instancesOnly && !deploymentsOnly && !usersOnly && !historyOnly;

  // Confirm action
  let confirmMessage = 'This will delete ';
  if (deleteAll) {
    confirmMessage += 'ALL data from Operaton';
  } else {
    const parts = [];
    if (instancesOnly) parts.push('process instances');
    if (deploymentsOnly) parts.push('deployments');
    if (usersOnly) parts.push('users and groups');
    if (historyOnly) parts.push('history data');
    confirmMessage += parts.join(', ');
  }
  confirmMessage += '. Continue?';

  if (!forceMode) {
    console.log('\n⚠️  WARNING: This action cannot be undone!\n');
  }

  if (!(await confirm(confirmMessage))) {
    console.log('\nAborted.');
    process.exit(0);
  }

  const stats = {
    instances: 0,
    historicInstances: 0,
    deployments: 0,
    users: 0,
    groups: 0,
    batches: 0,
    jobs: 0,
    decisions: 0,
  };

  // Execute deletions based on flags
  if (deleteAll || instancesOnly) {
    stats.jobs = await deleteJobs();
    stats.instances = await deleteProcessInstances();
  }

  if (deleteAll || historyOnly) {
    stats.historicInstances = await deleteHistoricInstances();
    stats.decisions = await deleteDecisionInstances();
    await deleteHistoricBatches();
  }

  if (deleteAll) {
    stats.batches = await deleteBatches();
  }

  if (deleteAll || deploymentsOnly) {
    // Need to delete instances first before deployments
    if (!instancesOnly && !deleteAll) {
      await deleteJobs();
      await deleteProcessInstances();
      await deleteHistoricInstances();
    }
    stats.deployments = await deleteDeployments();
  }

  if (deleteAll || usersOnly) {
    stats.users = await deleteUsers();
    stats.groups = await deleteGroups();
  }

  // Print summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  Reset Summary');
  console.log('═'.repeat(60));
  console.log(`  Process instances deleted:  ${stats.instances}`);
  console.log(`  Historic instances deleted: ${stats.historicInstances}`);
  console.log(`  Deployments deleted:        ${stats.deployments}`);
  console.log(`  Users deleted:              ${stats.users}`);
  console.log(`  Groups deleted:             ${stats.groups}`);
  console.log(`  Batches deleted:            ${stats.batches}`);
  console.log(`  Jobs deleted:               ${stats.jobs}`);
  console.log(`  Decision instances deleted: ${stats.decisions}`);
  console.log('═'.repeat(60));

  console.log('\n✓ Environment reset complete');
  console.log('\nTo start fresh, run:');
  console.log('  make deploy     # Deploy processes');
  console.log('  make data       # Generate test data');
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
