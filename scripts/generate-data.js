#!/usr/bin/env node

/**
 * Generate test data for Operaton screenshots
 *
 * Creates:
 * - Users and groups
 * - Process instances (running and completed)
 * - User tasks (assigned and unassigned)
 * - Decision instances
 * - Failed jobs (for error screenshots)
 * - Batch operations
 */

import 'dotenv/config';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '../config/screenshots.json');

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

// Track created resources for cleanup
const createdResources = {
  users: [],
  groups: [],
  processInstances: [],
  tasks: [],
};

/**
 * Create a user
 */
async function createUser(userData) {
  try {
    // Check if user exists
    const existing = await api.get(`/user/${userData.id}/profile`).catch(() => null);
    if (existing?.data) {
      console.log(`  ⊘ User ${userData.id} already exists`);
      return existing.data;
    }

    const response = await api.post('/user/create', {
      profile: {
        id: userData.id,
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
      },
      credentials: {
        password: userData.password,
      },
    });

    console.log(`  ✓ Created user: ${userData.id}`);
    createdResources.users.push(userData.id);
    return response.data;
  } catch (error) {
    if (
      error.response?.status === 500 &&
      error.response?.data?.message?.includes('already exists')
    ) {
      console.log(`  ⊘ User ${userData.id} already exists`);
      return null;
    }
    console.error(
      `  ✗ Failed to create user ${userData.id}:`,
      error.response?.data?.message || error.message
    );
    return null;
  }
}

/**
 * Create a group
 */
async function createGroup(groupData) {
  try {
    // Check if group exists
    const existing = await api.get(`/group/${groupData.id}`).catch(() => null);
    if (existing?.data) {
      console.log(`  ⊘ Group ${groupData.id} already exists`);
      return existing.data;
    }

    const response = await api.post('/group/create', {
      id: groupData.id,
      name: groupData.name,
      type: groupData.type || 'WORKFLOW',
    });

    console.log(`  ✓ Created group: ${groupData.id}`);
    createdResources.groups.push(groupData.id);
    return response.data;
  } catch (error) {
    if (
      error.response?.status === 500 &&
      error.response?.data?.message?.includes('already exists')
    ) {
      console.log(`  ⊘ Group ${groupData.id} already exists`);
      return null;
    }
    console.error(
      `  ✗ Failed to create group ${groupData.id}:`,
      error.response?.data?.message || error.message
    );
    return null;
  }
}

/**
 * Add user to group
 */
async function addUserToGroup(userId, groupId) {
  try {
    await api.put(`/group/${groupId}/members/${userId}`);
    console.log(`  ✓ Added ${userId} to group ${groupId}`);
  } catch (error) {
    // Ignore if already member
    if (!error.response?.data?.message?.includes('already member')) {
      console.error(
        `  ✗ Failed to add ${userId} to ${groupId}:`,
        error.response?.data?.message || error.message
      );
    }
  }
}

/**
 * Start a process instance
 */
async function startProcessInstance(processKey, variables = {}, businessKey = null) {
  try {
    const payload = {
      variables: Object.fromEntries(
        Object.entries(variables).map(([key, value]) => [
          key,
          { value, type: typeof value === 'number' ? 'Double' : 'String' },
        ])
      ),
    };

    if (businessKey) {
      payload.businessKey = businessKey;
    }

    const response = await api.post(`/process-definition/key/${processKey}/start`, payload);

    console.log(`  ✓ Started process: ${processKey} (${response.data.id})`);
    createdResources.processInstances.push(response.data.id);
    return response.data;
  } catch (error) {
    console.error(
      `  ✗ Failed to start ${processKey}:`,
      error.response?.data?.message || error.message
    );
    return null;
  }
}

/**
 * Get tasks for a user
 */
async function getTasks(assignee = null, candidateGroup = null) {
  try {
    const params = {};
    if (assignee) params.assignee = assignee;
    if (candidateGroup) params.candidateGroup = candidateGroup;

    const response = await api.get('/task', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to get tasks:', error.response?.data?.message || error.message);
    return [];
  }
}

/**
 * Claim a task
 */
async function claimTask(taskId, userId) {
  try {
    await api.post(`/task/${taskId}/claim`, { userId });
    console.log(`  ✓ Claimed task ${taskId} for ${userId}`);
    return true;
  } catch (error) {
    console.error(`  ✗ Failed to claim task:`, error.response?.data?.message || error.message);
    return false;
  }
}

/**
 * Complete a task
 */
async function completeTask(taskId, variables = {}) {
  try {
    await api.post(`/task/${taskId}/complete`, {
      variables: Object.fromEntries(
        Object.entries(variables).map(([key, value]) => [
          key,
          { value, type: typeof value === 'boolean' ? 'Boolean' : 'String' },
        ])
      ),
    });
    console.log(`  ✓ Completed task ${taskId}`);
    return true;
  } catch (error) {
    console.error(`  ✗ Failed to complete task:`, error.response?.data?.message || error.message);
    return false;
  }
}

/**
 * Get process definitions
 */
async function getProcessDefinitions() {
  try {
    const response = await api.get('/process-definition', { params: { latestVersion: true } });
    return response.data;
  } catch (error) {
    console.error('Failed to get process definitions:', error.message);
    return [];
  }
}

/**
 * Get decision definitions
 */
async function getDecisionDefinitions() {
  try {
    const response = await api.get('/decision-definition', { params: { latestVersion: true } });
    return response.data;
  } catch (error) {
    console.error('Failed to get decision definitions:', error.message);
    return [];
  }
}

/**
 * Evaluate a decision
 */
async function evaluateDecision(decisionKey, variables) {
  try {
    const response = await api.post(`/decision-definition/key/${decisionKey}/evaluate`, {
      variables: Object.fromEntries(
        Object.entries(variables).map(([key, value]) => [
          key,
          { value, type: typeof value === 'number' ? 'Double' : 'String' },
        ])
      ),
    });
    console.log(`  ✓ Evaluated decision: ${decisionKey}`);
    return response.data;
  } catch (error) {
    console.error(
      `  ✗ Failed to evaluate ${decisionKey}:`,
      error.response?.data?.message || error.message
    );
    return null;
  }
}

/**
 * Create test scenario data
 */
async function createTestScenarios(configData) {
  const scenarios = {
    simpleWorkflow: {
      description: 'Basic workflow with tasks',
      instances: 5,
    },
    completedWorkflows: {
      description: 'Completed process instances for history',
      instances: 10,
    },
    tasksForDemo: {
      description: 'Tasks assigned to demo user',
      count: 5,
    },
  };

  const results = {
    instances: [],
    tasks: [],
    decisions: [],
  };

  // Get available process definitions
  const definitions = await getProcessDefinitions();
  console.log(`\nFound ${definitions.length} process definition(s)`);

  if (definitions.length === 0) {
    console.log('⚠ No process definitions found. Run deploy-processes.js first.');
    return results;
  }

  // Find invoice process (or use first available)
  const invoiceProcess = definitions.find(d => d.key === 'invoice') || definitions[0];

  console.log(`\n📋 Creating scenarios with process: ${invoiceProcess.key}`);

  // Scenario 1: Create active instances
  console.log('\n--- Scenario: Active Process Instances ---');
  for (let i = 0; i < scenarios.simpleWorkflow.instances; i++) {
    const instance = await startProcessInstance(
      invoiceProcess.key,
      {
        amount: Math.floor(Math.random() * 2000) + 100,
        creditor: `Vendor ${i + 1}`,
        invoiceNumber: `INV-${Date.now()}-${i}`,
        invoiceCategory: ['Travel Expenses', 'Misc', 'Software License'][i % 3],
      },
      `BK-${Date.now()}-${i}`
    );

    if (instance) {
      results.instances.push(instance);
    }

    // Small delay to avoid overwhelming the server
    await new Promise(r => setTimeout(r, 200));
  }

  // Scenario 2: Create and complete some instances
  console.log('\n--- Scenario: Completed Process Instances ---');
  for (let i = 0; i < Math.min(3, scenarios.completedWorkflows.instances); i++) {
    const instance = await startProcessInstance(invoiceProcess.key, {
      amount: 150, // Low amount for auto-approval
      creditor: `Completed Vendor ${i + 1}`,
      invoiceNumber: `INV-COMP-${Date.now()}-${i}`,
      invoiceCategory: 'Misc',
    });

    if (instance) {
      // Wait for task to be created
      await new Promise(r => setTimeout(r, 500));

      // Get and complete the first task
      const tasks = await getTasks();
      const instanceTask = tasks.find(t => t.processInstanceId === instance.id);

      if (instanceTask) {
        await completeTask(instanceTask.id, { approved: true });
      }
    }

    await new Promise(r => setTimeout(r, 200));
  }

  // Get decision definitions
  const decisions = await getDecisionDefinitions();
  console.log(`\nFound ${decisions.length} decision definition(s)`);

  // Evaluate some decisions
  if (decisions.length > 0) {
    console.log('\n--- Scenario: Decision Instances ---');
    const invoiceDecision =
      decisions.find(d => d.key === 'invoice-assign-approver') || decisions[0];

    for (let i = 0; i < 3; i++) {
      const result = await evaluateDecision(invoiceDecision.key, {
        amount: [100, 500, 1000][i],
        invoiceCategory: 'Travel Expenses',
      });

      if (result) {
        results.decisions.push(result);
      }

      await new Promise(r => setTimeout(r, 200));
    }
  }

  return results;
}

/**
 * Setup users and groups
 */
async function setupUsersAndGroups(configData) {
  console.log('\n👥 Creating users...');

  for (const user of configData.users) {
    await createUser(user);
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n👥 Creating groups...');

  for (const group of configData.groups) {
    await createGroup(group);
    await new Promise(r => setTimeout(r, 100));
  }

  // Add users to groups
  console.log('\n🔗 Adding users to groups...');

  // Demo user to camunda-admin
  await addUserToGroup('demo', 'camunda-admin');
  await addUserToGroup('john', 'accounting');
  await addUserToGroup('mary', 'management');
  await addUserToGroup('peter', 'sales');
}

/**
 * Generate summary report
 */
function generateReport(results) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  Data Generation Summary');
  console.log('═'.repeat(60));
  console.log(`  Users created:     ${createdResources.users.length}`);
  console.log(`  Groups created:    ${createdResources.groups.length}`);
  console.log(`  Process instances: ${results.instances.length}`);
  console.log(`  Decisions evaluated: ${results.decisions.length}`);
  console.log(`${'═'.repeat(60)}\n`);
}

/**
 * Main execution
 */
async function main() {
  console.log('═'.repeat(60));
  console.log('  Operaton Test Data Generator');
  console.log('═'.repeat(60));
  console.log(`\nTarget: ${config.baseUrl}\n`);

  // Load configuration
  const configData = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));

  // Test connection
  try {
    await api.get('/engine');
    console.log('✓ Connected to Operaton\n');
  } catch (error) {
    console.error('✗ Failed to connect to Operaton:', error.message);
    process.exit(1);
  }

  // Setup users and groups
  await setupUsersAndGroups(configData);

  // Create test scenarios
  console.log('\n📊 Creating test scenarios...');
  const results = await createTestScenarios(configData);

  // Print summary
  generateReport(results);

  // Show next steps
  console.log('Next steps:');
  console.log('  1. Verify data in Operaton webapps');
  console.log('  2. Run: npm run capture-screenshots');
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
