#!/usr/bin/env node

/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2025 Operaton
 *
 * Simulate various process scenarios for screenshot capture
 *
 * Creates:
 * - Process instances with tokens at specific activities
 * - Completed instances for history views
 * - Tasks in various states (assigned, unassigned, overdue)
 * - Multi-instance scenarios
 * - Subprocess executions
 */

import 'dotenv/config';
import axios from 'axios';
import _fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
const runTokens = args.includes('--tokens') || args.length === 0;
const runHistory = args.includes('--history') || args.length === 0;
const runTasks = args.includes('--tasks') || args.length === 0;

/**
 * Delay helper
 */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

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
 * Start a process instance
 */
async function startProcess(processKey, variables = {}, businessKey = null) {
  try {
    const payload = {
      variables: Object.fromEntries(
        Object.entries(variables).map(([key, value]) => {
          let type = 'String';
          if (typeof value === 'number') type = Number.isInteger(value) ? 'Integer' : 'Double';
          if (typeof value === 'boolean') type = 'Boolean';
          return [key, { value, type }];
        })
      ),
    };

    if (businessKey) {
      payload.businessKey = businessKey;
    }

    const response = await api.post(`/process-definition/key/${processKey}/start`, payload);
    return response.data;
  } catch (error) {
    console.error(`Failed to start ${processKey}:`, error.response?.data?.message || error.message);
    return null;
  }
}

/**
 * Get tasks for a process instance
 */
async function getTasksForInstance(processInstanceId) {
  try {
    const response = await api.get('/task', {
      params: { processInstanceId },
    });
    return response.data;
  } catch {
    return [];
  }
}

/**
 * Complete a task
 */
async function completeTask(taskId, variables = {}) {
  try {
    await api.post(`/task/${taskId}/complete`, {
      variables: Object.fromEntries(
        Object.entries(variables).map(([key, value]) => {
          let type = 'String';
          if (typeof value === 'boolean') type = 'Boolean';
          if (typeof value === 'number') type = Number.isInteger(value) ? 'Integer' : 'Double';
          return [key, { value, type }];
        })
      ),
    });
    return true;
  } catch (error) {
    console.error(
      `Failed to complete task ${taskId}:`,
      error.response?.data?.message || error.message
    );
    return false;
  }
}

/**
 * Claim a task
 */
async function _claimTask(taskId, userId) {
  try {
    await api.post(`/task/${taskId}/claim`, { userId });
    return true;
  } catch {
    return false;
  }
}

/**
 * Set task due date
 */
async function setTaskDueDate(taskId, dueDate) {
  try {
    await api.put(`/task/${taskId}`, { dueDate });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get activity instances for a process
 */
async function getActivityInstances(processInstanceId) {
  try {
    const response = await api.get(`/process-instance/${processInstanceId}/activity-instances`);
    return response.data;
  } catch {
    return null;
  }
}

// ============================================================================
// SCENARIO: Token Positions
// ============================================================================

async function simulateTokenPositions() {
  console.log('\n📍 Simulating Token Positions\n');
  console.log('Creating instances with tokens at various activities...\n');

  const definitions = await getProcessDefinitions();
  const invoiceProcess = definitions.find(d => d.key === 'invoice');

  if (!invoiceProcess) {
    console.log('⚠ Invoice process not found. Deploy processes first.');
    return;
  }

  const scenarios = [
    {
      name: 'Token at Approve Invoice',
      variables: {
        amount: 500,
        invoiceCategory: 'Travel Expenses',
        creditor: 'Token Demo 1',
        invoiceNumber: 'TOK-001',
      },
      businessKey: 'TOKEN-APPROVE-001',
      stopAt: 'approveInvoice',
    },
    {
      name: 'Token at Review Invoice',
      variables: {
        amount: 500,
        invoiceCategory: 'Travel Expenses',
        creditor: 'Token Demo 2',
        invoiceNumber: 'TOK-002',
      },
      businessKey: 'TOKEN-REVIEW-001',
      completeFirst: { approved: false },
      stopAt: 'reviewInvoice',
    },
    {
      name: 'Token at Prepare Bank Transfer',
      variables: {
        amount: 500,
        invoiceCategory: 'Travel Expenses',
        creditor: 'Token Demo 3',
        invoiceNumber: 'TOK-003',
      },
      businessKey: 'TOKEN-BANK-001',
      completeFirst: { approved: true },
      stopAt: 'prepareBankTransfer',
    },
  ];

  for (const scenario of scenarios) {
    console.log(`  Creating: ${scenario.name}`);

    const instance = await startProcess('invoice', scenario.variables, scenario.businessKey);
    if (!instance) continue;

    await delay(500);

    // If we need to complete tasks to reach a certain point
    if (scenario.completeFirst) {
      const tasks = await getTasksForInstance(instance.id);
      if (tasks.length > 0) {
        await completeTask(tasks[0].id, scenario.completeFirst);
        console.log(`    ✓ Completed task to advance token`);
      }
    }

    // Verify token position
    await delay(300);
    const activities = await getActivityInstances(instance.id);
    if (activities) {
      const activeActivities = findActiveActivities(activities);
      console.log(`    ✓ Token at: ${activeActivities.join(', ') || 'unknown'}`);
    }
  }

  console.log('\n  ✓ Token position scenarios created');
}

/**
 * Recursively find active activities
 */
function findActiveActivities(activityInstance, result = []) {
  if (
    activityInstance.activityType &&
    activityInstance.activityType !== 'processDefinition' &&
    activityInstance.childActivityInstances?.length === 0
  ) {
    result.push(activityInstance.activityName || activityInstance.activityId);
  }

  for (const child of activityInstance.childActivityInstances || []) {
    findActiveActivities(child, result);
  }

  return result;
}

// ============================================================================
// SCENARIO: History Data
// ============================================================================

async function simulateHistoryData() {
  console.log('\n📜 Generating History Data\n');
  console.log('Creating and completing process instances...\n');

  const definitions = await getProcessDefinitions();
  const invoiceProcess = definitions.find(d => d.key === 'invoice');

  if (!invoiceProcess) {
    console.log('⚠ Invoice process not found.');
    return;
  }

  // Create a variety of completed instances
  const completionScenarios = [
    // Approved and paid invoices
    { amount: 100, approved: true, category: 'Misc', count: 3 },
    { amount: 500, approved: true, category: 'Travel Expenses', count: 2 },
    { amount: 1500, approved: true, category: 'Software License', count: 2 },

    // Rejected invoices (not clarified)
    { amount: 300, approved: false, clarified: false, category: 'Misc', count: 2 },

    // Clarified and then approved
    {
      amount: 400,
      approved: false,
      clarified: true,
      thenApproved: true,
      category: 'Travel Expenses',
      count: 1,
    },
  ];

  let completedCount = 0;

  for (const scenario of completionScenarios) {
    for (let i = 0; i < scenario.count; i++) {
      const variables = {
        amount: scenario.amount + Math.floor(Math.random() * 50),
        invoiceCategory: scenario.category,
        creditor: `History Vendor ${completedCount + 1}`,
        invoiceNumber: `HIST-${Date.now()}-${completedCount}`,
      };

      console.log(`  Starting instance ${completedCount + 1}...`);
      const instance = await startProcess('invoice', variables, `HISTORY-${completedCount}`);
      if (!instance) continue;

      await delay(400);

      // Get and complete first task (Approve Invoice)
      let tasks = await getTasksForInstance(instance.id);
      if (tasks.length > 0) {
        await completeTask(tasks[0].id, { approved: scenario.approved });
        await delay(300);
      }

      // If not approved, handle review
      if (!scenario.approved) {
        tasks = await getTasksForInstance(instance.id);
        if (tasks.length > 0) {
          await completeTask(tasks[0].id, { clarified: scenario.clarified || false });
          await delay(300);

          // If clarified, complete the approval again
          if (scenario.clarified && scenario.thenApproved) {
            tasks = await getTasksForInstance(instance.id);
            if (tasks.length > 0) {
              await completeTask(tasks[0].id, { approved: true });
              await delay(300);
            }
          }
        }
      }

      // If approved path, complete bank transfer
      if (scenario.approved || (scenario.clarified && scenario.thenApproved)) {
        tasks = await getTasksForInstance(instance.id);
        if (tasks.length > 0) {
          await completeTask(tasks[0].id, {});
          await delay(300);
        }
      }

      completedCount++;
    }
  }

  console.log(`\n  ✓ Created and processed ${completedCount} instances for history`);
}

// ============================================================================
// SCENARIO: Tasks in Various States
// ============================================================================

async function simulateTaskStates() {
  console.log('\n📋 Creating Tasks in Various States\n');

  const definitions = await getProcessDefinitions();
  const invoiceProcess = definitions.find(d => d.key === 'invoice');

  if (!invoiceProcess) {
    console.log('⚠ Invoice process not found.');
    return;
  }

  const taskScenarios = [
    // Unassigned tasks (for candidate groups)
    {
      name: 'Unassigned accounting task',
      variables: {
        amount: 600,
        invoiceCategory: 'Travel Expenses',
        creditor: 'Task Demo Unassigned',
        invoiceNumber: 'TASK-U-001',
      },
      action: 'completeToBank', // Get to Prepare Bank Transfer (candidate group)
    },

    // Assigned tasks
    {
      name: 'Task assigned to demo',
      variables: {
        amount: 150,
        invoiceCategory: 'Misc',
        creditor: 'Task Demo Assigned',
        invoiceNumber: 'TASK-A-001',
      },
      action: 'none', // Stays at Approve Invoice assigned to demo
    },

    // Overdue task
    {
      name: 'Overdue task',
      variables: {
        amount: 200,
        invoiceCategory: 'Misc',
        creditor: 'Task Demo Overdue',
        invoiceNumber: 'TASK-O-001',
      },
      action: 'setOverdue',
    },

    // Task with follow-up date
    {
      name: 'Task with follow-up',
      variables: {
        amount: 250,
        invoiceCategory: 'Misc',
        creditor: 'Task Demo FollowUp',
        invoiceNumber: 'TASK-F-001',
      },
      action: 'setFollowUp',
    },

    // Multiple tasks for same user
    {
      name: 'Multiple tasks scenario 1',
      variables: {
        amount: 180,
        invoiceCategory: 'Misc',
        creditor: 'Multi Task 1',
        invoiceNumber: 'TASK-M-001',
      },
      action: 'none',
    },
    {
      name: 'Multiple tasks scenario 2',
      variables: {
        amount: 190,
        invoiceCategory: 'Misc',
        creditor: 'Multi Task 2',
        invoiceNumber: 'TASK-M-002',
      },
      action: 'none',
    },
  ];

  for (const scenario of taskScenarios) {
    console.log(`  Creating: ${scenario.name}`);

    const instance = await startProcess(
      'invoice',
      scenario.variables,
      scenario.variables.invoiceNumber
    );
    if (!instance) continue;

    await delay(500);

    const tasks = await getTasksForInstance(instance.id);

    switch (scenario.action) {
      case 'completeToBank':
        // Complete approval to get to bank transfer task
        if (tasks.length > 0) {
          await completeTask(tasks[0].id, { approved: true });
          await delay(300);
          console.log(`    ✓ Advanced to Prepare Bank Transfer (unassigned)`);
        }
        break;

      case 'setOverdue':
        if (tasks.length > 0) {
          // Set due date to yesterday
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          await setTaskDueDate(tasks[0].id, yesterday.toISOString());
          console.log(`    ✓ Set task as overdue`);
        }
        break;

      case 'setFollowUp':
        if (tasks.length > 0) {
          // Set follow-up date to tomorrow
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          try {
            await api.put(`/task/${tasks[0].id}`, {
              followUp: tomorrow.toISOString(),
            });
            console.log(`    ✓ Set follow-up date`);
          } catch (e) {
            console.log(`    ⚠ Could not set follow-up: ${e.message}`);
          }
        }
        break;

      default:
        console.log(`    ✓ Task created and waiting`);
    }
  }

  console.log('\n  ✓ Task state scenarios created');
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('═'.repeat(60));
  console.log('  Operaton Simulation Scenarios');
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

  // Run requested scenarios
  if (runTokens) {
    await simulateTokenPositions();
  }

  if (runHistory) {
    await simulateHistoryData();
  }

  if (runTasks) {
    await simulateTaskStates();
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('  Simulation Complete');
  console.log('═'.repeat(60));
  console.log('\nYour Operaton instance now has:');
  console.log('  • Process instances with tokens at various activities');
  console.log('  • Completed instances for history views');
  console.log('  • Tasks in various states (assigned, overdue, etc.)');
  console.log('\nRun: make capture  (to capture screenshots)');
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
