#!/usr/bin/env node

/**
 * Create intentional incidents for screenshot capture
 *
 * Generates various error states:
 * - Failed script tasks
 * - Failed service tasks
 * - Failed job execution
 * - External task failures
 * - Expression evaluation errors
 */

import 'dotenv/config';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs/promises';
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
const createScriptErrors = args.includes('--script-errors') || args.length === 0;
const createServiceErrors = args.includes('--service-errors') || args.length === 0;
const createExpressionErrors = args.includes('--expression-errors') || args.length === 0;
const createJobErrors = args.includes('--job-errors') || args.length === 0;

/**
 * Delay helper
 */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Deploy a BPMN process
 */
async function deployProcess(name, bpmnXml) {
  const form = new FormData();

  form.append('deployment-name', name);
  form.append('enable-duplicate-filtering', 'false');
  form.append('upload', Buffer.from(bpmnXml), {
    filename: `${name}.bpmn`,
    contentType: 'application/octet-stream',
  });

  try {
    const response = await api.post('/deployment/create', form, {
      headers: form.getHeaders(),
    });
    console.log(`  ✓ Deployed: ${name}`);
    return response.data;
  } catch (error) {
    console.error(`  ✗ Failed to deploy ${name}:`, error.response?.data?.message || error.message);
    return null;
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
    // Expected for some error scenarios
    return null;
  }
}

/**
 * Get incidents
 */
async function getIncidents() {
  try {
    const response = await api.get('/incident');
    return response.data;
  } catch (error) {
    return [];
  }
}

/**
 * Get jobs with failures
 */
async function getFailedJobs() {
  try {
    const response = await api.get('/job', {
      params: { withException: true },
    });
    return response.data;
  } catch (error) {
    return [];
  }
}

// ============================================================================
// FAILING PROCESS DEFINITIONS
// ============================================================================

/**
 * BPMN: Process with failing script task
 */
const FAILING_SCRIPT_PROCESS = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  id="Definitions_FailingScript"
                  targetNamespace="http://operaton.org/examples/incidents">
  <bpmn:process id="failing-script-process" name="Failing Script Process" isExecutable="true" camunda:historyTimeToLive="30">
    <bpmn:startEvent id="start">
      <bpmn:outgoing>flow1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="flow1" sourceRef="start" targetRef="failingScript" />
    <bpmn:scriptTask id="failingScript" name="Failing Script Task" scriptFormat="javascript">
      <bpmn:incoming>flow1</bpmn:incoming>
      <bpmn:outgoing>flow2</bpmn:outgoing>
      <bpmn:script>
        // This script intentionally throws an error
        throw new Error("Intentional script failure for incident demo");
      </bpmn:script>
    </bpmn:scriptTask>
    <bpmn:sequenceFlow id="flow2" sourceRef="failingScript" targetRef="end" />
    <bpmn:endEvent id="end">
      <bpmn:incoming>flow2</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;

/**
 * BPMN: Process with failing service task (delegate expression)
 */
const FAILING_SERVICE_PROCESS = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  id="Definitions_FailingService"
                  targetNamespace="http://operaton.org/examples/incidents">
  <bpmn:process id="failing-service-process" name="Failing Service Process" isExecutable="true" camunda:historyTimeToLive="30">
    <bpmn:startEvent id="start">
      <bpmn:outgoing>flow1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="flow1" sourceRef="start" targetRef="failingService" />
    <bpmn:serviceTask id="failingService" name="Failing Service Task" camunda:delegateExpression="\${nonExistentBean}">
      <bpmn:incoming>flow1</bpmn:incoming>
      <bpmn:outgoing>flow2</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:sequenceFlow id="flow2" sourceRef="failingService" targetRef="end" />
    <bpmn:endEvent id="end">
      <bpmn:incoming>flow2</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;

/**
 * BPMN: Process with expression evaluation error
 */
const FAILING_EXPRESSION_PROCESS = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  id="Definitions_FailingExpression"
                  targetNamespace="http://operaton.org/examples/incidents">
  <bpmn:process id="failing-expression-process" name="Failing Expression Process" isExecutable="true" camunda:historyTimeToLive="30">
    <bpmn:startEvent id="start">
      <bpmn:outgoing>flow1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="flow1" sourceRef="start" targetRef="gateway" />
    <bpmn:exclusiveGateway id="gateway" name="Check condition">
      <bpmn:incoming>flow1</bpmn:incoming>
      <bpmn:outgoing>flowYes</bpmn:outgoing>
      <bpmn:outgoing>flowNo</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:sequenceFlow id="flowYes" name="yes" sourceRef="gateway" targetRef="taskYes">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${undefinedVariable == true}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="flowNo" name="no" sourceRef="gateway" targetRef="taskNo">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${undefinedVariable == false}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:userTask id="taskYes" name="Yes Path">
      <bpmn:incoming>flowYes</bpmn:incoming>
      <bpmn:outgoing>flow2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:userTask id="taskNo" name="No Path">
      <bpmn:incoming>flowNo</bpmn:incoming>
      <bpmn:outgoing>flow3</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="flow2" sourceRef="taskYes" targetRef="end" />
    <bpmn:sequenceFlow id="flow3" sourceRef="taskNo" targetRef="end" />
    <bpmn:endEvent id="end">
      <bpmn:incoming>flow2</bpmn:incoming>
      <bpmn:incoming>flow3</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;

/**
 * BPMN: Process with async job that fails
 */
const FAILING_JOB_PROCESS = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  id="Definitions_FailingJob"
                  targetNamespace="http://operaton.org/examples/incidents">
  <bpmn:process id="failing-job-process" name="Failing Job Process" isExecutable="true" camunda:historyTimeToLive="30">
    <bpmn:startEvent id="start">
      <bpmn:outgoing>flow1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="flow1" sourceRef="start" targetRef="asyncTask" />
    <bpmn:serviceTask id="asyncTask" name="Async Failing Task" camunda:asyncBefore="true" camunda:delegateExpression="\${nonExistentAsyncBean}">
      <bpmn:incoming>flow1</bpmn:incoming>
      <bpmn:outgoing>flow2</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:sequenceFlow id="flow2" sourceRef="asyncTask" targetRef="end" />
    <bpmn:endEvent id="end">
      <bpmn:incoming>flow2</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;

/**
 * BPMN: Process with external task that can timeout
 */
const EXTERNAL_TASK_PROCESS = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  id="Definitions_ExternalTask"
                  targetNamespace="http://operaton.org/examples/incidents">
  <bpmn:process id="external-task-process" name="External Task Process" isExecutable="true" camunda:historyTimeToLive="30">
    <bpmn:startEvent id="start">
      <bpmn:outgoing>flow1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="flow1" sourceRef="start" targetRef="externalTask" />
    <bpmn:serviceTask id="externalTask" name="External Task" camunda:type="external" camunda:topic="incident-demo-topic">
      <bpmn:incoming>flow1</bpmn:incoming>
      <bpmn:outgoing>flow2</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:sequenceFlow id="flow2" sourceRef="externalTask" targetRef="end" />
    <bpmn:endEvent id="end">
      <bpmn:incoming>flow2</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;

// ============================================================================
// INCIDENT CREATION FUNCTIONS
// ============================================================================

async function createScriptIncidents() {
  console.log('\n📛 Creating Script Task Incidents\n');

  // Deploy failing script process
  await deployProcess('failing-script-process', FAILING_SCRIPT_PROCESS);
  await delay(500);

  // Start instances (they will fail at the script task)
  for (let i = 0; i < 3; i++) {
    console.log(`  Starting failing script instance ${i + 1}...`);
    await startProcess('failing-script-process', {}, `SCRIPT-FAIL-${Date.now()}-${i}`);
    await delay(300);
  }

  console.log('  ✓ Script task incidents created');
}

async function createServiceIncidents() {
  console.log('\n📛 Creating Service Task Incidents\n');

  // Deploy failing service process
  await deployProcess('failing-service-process', FAILING_SERVICE_PROCESS);
  await delay(500);

  // Start instances
  for (let i = 0; i < 2; i++) {
    console.log(`  Starting failing service instance ${i + 1}...`);
    await startProcess('failing-service-process', {}, `SERVICE-FAIL-${Date.now()}-${i}`);
    await delay(300);
  }

  console.log('  ✓ Service task incidents created');
}

async function createExpressionIncidents() {
  console.log('\n📛 Creating Expression Evaluation Incidents\n');

  // Deploy process with bad expression
  await deployProcess('failing-expression-process', FAILING_EXPRESSION_PROCESS);
  await delay(500);

  // Start without required variable
  console.log('  Starting instance without required variable...');
  await startProcess('failing-expression-process', {}, `EXPR-FAIL-${Date.now()}`);

  console.log('  ✓ Expression evaluation incidents created');
}

async function createJobIncidents() {
  console.log('\n📛 Creating Async Job Incidents\n');

  // Deploy async failing process
  await deployProcess('failing-job-process', FAILING_JOB_PROCESS);
  await delay(500);

  // Start instances
  for (let i = 0; i < 2; i++) {
    console.log(`  Starting async failing instance ${i + 1}...`);
    await startProcess('failing-job-process', {}, `JOB-FAIL-${Date.now()}-${i}`);
    await delay(500);
  }

  // Wait for jobs to be executed and fail
  console.log('  Waiting for job execution...');
  await delay(2000);

  console.log('  ✓ Async job incidents created');
}

async function createExternalTaskIncidents() {
  console.log('\n📛 Creating External Task Incidents\n');

  // Deploy external task process
  await deployProcess('external-task-process', EXTERNAL_TASK_PROCESS);
  await delay(500);

  // Start instances (they will wait for external workers)
  for (let i = 0; i < 2; i++) {
    console.log(`  Starting external task instance ${i + 1}...`);
    await startProcess('external-task-process', {}, `EXT-TASK-${Date.now()}-${i}`);
    await delay(300);
  }

  // Fetch and fail external tasks
  console.log('  Fetching external tasks to fail them...');
  await delay(500);

  try {
    // Fetch external tasks
    const fetchResponse = await api.post('/external-task/fetchAndLock', {
      workerId: 'incident-creator',
      maxTasks: 5,
      topics: [
        {
          topicName: 'incident-demo-topic',
          lockDuration: 60000,
        },
      ],
    });

    const tasks = fetchResponse.data;
    console.log(`  Found ${tasks.length} external tasks`);

    // Fail each task
    for (const task of tasks) {
      await api.post(`/external-task/${task.id}/failure`, {
        workerId: 'incident-creator',
        errorMessage: 'Intentional failure for incident demo',
        errorDetails:
          'This external task was intentionally failed to demonstrate incident handling in the Operaton webapps.',
        retries: 0,
        retryTimeout: 0,
      });
      console.log(`  ✓ Failed external task ${task.id}`);
    }
  } catch (error) {
    console.log(`  ⚠ Could not fail external tasks: ${error.message}`);
  }

  console.log('  ✓ External task incidents created');
}

// ============================================================================
// SUMMARY
// ============================================================================

async function printSummary() {
  console.log(`\n${'─'.repeat(60)}`);
  console.log('  Incident Summary');
  console.log('─'.repeat(60));

  const incidents = await getIncidents();
  const failedJobs = await getFailedJobs();

  console.log(`\n  Total incidents: ${incidents.length}`);
  console.log(`  Failed jobs: ${failedJobs.length}`);

  if (incidents.length > 0) {
    // Group by type
    const byType = {};
    for (const incident of incidents) {
      const type = incident.incidentType || 'unknown';
      byType[type] = (byType[type] || 0) + 1;
    }

    console.log('\n  Incidents by type:');
    for (const [type, count] of Object.entries(byType)) {
      console.log(`    ${type}: ${count}`);
    }
  }

  console.log(`\n${'─'.repeat(60)}`);
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('═'.repeat(60));
  console.log('  Operaton Incident Creator');
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

  // Create requested incident types
  if (createScriptErrors) {
    await createScriptIncidents();
  }

  if (createServiceErrors) {
    await createServiceIncidents();
  }

  if (createExpressionErrors) {
    await createExpressionIncidents();
  }

  if (createJobErrors) {
    await createJobIncidents();
    await createExternalTaskIncidents();
  }

  // Print summary
  await printSummary();

  console.log('\nYour Operaton instance now has incidents for:');
  console.log('  • Cockpit incident views');
  console.log('  • Failed job drill-down');
  console.log('  • Job retry functionality');
  console.log('  • External task failure handling');
  console.log('\nRun: make capture  (to capture screenshots)');
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
