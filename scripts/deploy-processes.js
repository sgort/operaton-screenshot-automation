#!/usr/bin/env node

/**
 * Deploy BPMN/DMN/CMMN processes to Operaton
 * 
 * This script:
 * 1. Reads process definitions from config
 * 2. Deploys them to Operaton via REST API
 * 3. Tracks deployment status
 */

import 'dotenv/config';
import axios from 'axios';
import FormData from 'form-data';
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

// Create axios instance with auth
const api = axios.create({
  baseURL: config.baseUrl,
  auth: {
    username: config.username,
    password: config.password
  },
  headers: {
    'Accept': 'application/json'
  }
});

/**
 * Check if Operaton is accessible
 */
async function checkConnection() {
  try {
    const response = await api.get('/engine');
    console.log('✓ Connected to Operaton');
    console.log(`  Engine: ${response.data[0]?.name || 'default'}`);
    return true;
  } catch (error) {
    console.error('✗ Failed to connect to Operaton:', error.message);
    if (error.response) {
      console.error(`  Status: ${error.response.status}`);
      console.error(`  Response: ${JSON.stringify(error.response.data)}`);
    }
    return false;
  }
}

/**
 * Get existing deployments
 */
async function getExistingDeployments() {
  try {
    const response = await api.get('/deployment');
    return response.data;
  } catch (error) {
    console.error('Failed to get deployments:', error.message);
    return [];
  }
}

/**
 * Deploy a single process file
 */
async function deployProcess(processConfig, filePath) {
  const form = new FormData();
  
  // Read the file
  const fileContent = await fs.readFile(filePath);
  const fileName = path.basename(filePath);
  
  // Add file to form
  form.append('upload', fileContent, {
    filename: fileName,
    contentType: 'application/octet-stream'
  });
  
  // Deployment metadata
  form.append('deployment-name', processConfig.name);
  form.append('enable-duplicate-filtering', 'true');
  form.append('deploy-changed-only', 'true');
  
  try {
    const response = await api.post('/deployment/create', form, {
      headers: {
        ...form.getHeaders()
      }
    });
    
    console.log(`  ✓ Deployed: ${processConfig.name}`);
    console.log(`    ID: ${response.data.id}`);
    console.log(`    Resources: ${Object.keys(response.data.deployedProcessDefinitions || {}).length} process(es)`);
    
    return response.data;
  } catch (error) {
    console.error(`  ✗ Failed to deploy ${processConfig.name}:`, error.message);
    if (error.response) {
      console.error(`    ${JSON.stringify(error.response.data)}`);
    }
    return null;
  }
}

/**
 * Deploy all processes from config
 */
async function deployAllProcesses() {
  const configData = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
  const results = {
    deployed: [],
    failed: [],
    skipped: []
  };
  
  console.log('\n📦 Deploying BPMN Processes...\n');
  
  // Deploy BPMN processes
  for (const [key, process] of Object.entries(configData.processes)) {
    const filePath = path.join(__dirname, '..', process.file);
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      console.log(`  ⊘ Skipping ${process.name}: File not found (${process.file})`);
      results.skipped.push({ key, reason: 'File not found' });
      continue;
    }
    
    const result = await deployProcess(process, filePath);
    if (result) {
      results.deployed.push({ key, ...result });
    } else {
      results.failed.push({ key, name: process.name });
    }
  }
  
  console.log('\n📊 Deploying DMN Decisions...\n');
  
  // Deploy DMN decisions
  for (const [key, decision] of Object.entries(configData.decisions)) {
    const filePath = path.join(__dirname, '..', decision.file);
    
    try {
      await fs.access(filePath);
    } catch {
      console.log(`  ⊘ Skipping ${decision.name}: File not found (${decision.file})`);
      results.skipped.push({ key, reason: 'File not found' });
      continue;
    }
    
    const result = await deployProcess(decision, filePath);
    if (result) {
      results.deployed.push({ key, ...result });
    } else {
      results.failed.push({ key, name: decision.name });
    }
  }
  
  return results;
}

/**
 * Create sample process files if they don't exist
 */
async function createSampleProcesses() {
  const processesDir = path.join(__dirname, '../processes');
  
  // Create directories
  await fs.mkdir(path.join(processesDir, 'bpmn'), { recursive: true });
  await fs.mkdir(path.join(processesDir, 'dmn'), { recursive: true });
  await fs.mkdir(path.join(processesDir, 'cmmn'), { recursive: true });
  
  // Sample Invoice Process BPMN
  const invoiceBpmn = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="invoice" name="Invoice Receipt" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Invoice received">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_AssignApprover" />
    <bpmn:businessRuleTask id="Task_AssignApprover" name="Assign Approver" camunda:decisionRef="invoice-assign-approver">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:businessRuleTask>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_AssignApprover" targetRef="Task_ApproveInvoice" />
    <bpmn:userTask id="Task_ApproveInvoice" name="Approve Invoice" camunda:assignee="\${approver}">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_ApproveInvoice" targetRef="Gateway_1" />
    <bpmn:exclusiveGateway id="Gateway_1" name="Invoice approved?">
      <bpmn:incoming>Flow_3</bpmn:incoming>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
      <bpmn:outgoing>Flow_5</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:sequenceFlow id="Flow_4" name="yes" sourceRef="Gateway_1" targetRef="Task_PrepareBankTransfer">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\${approved}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_5" name="no" sourceRef="Gateway_1" targetRef="Task_ReviewInvoice">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\${!approved}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:userTask id="Task_PrepareBankTransfer" name="Prepare Bank Transfer" camunda:candidateGroups="accounting">
      <bpmn:incoming>Flow_4</bpmn:incoming>
      <bpmn:outgoing>Flow_6</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:userTask id="Task_ReviewInvoice" name="Review Invoice" camunda:assignee="demo">
      <bpmn:incoming>Flow_5</bpmn:incoming>
      <bpmn:outgoing>Flow_7</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="Flow_6" sourceRef="Task_PrepareBankTransfer" targetRef="EndEvent_1" />
    <bpmn:sequenceFlow id="Flow_7" sourceRef="Task_ReviewInvoice" targetRef="EndEvent_2" />
    <bpmn:endEvent id="EndEvent_1" name="Invoice paid">
      <bpmn:incoming>Flow_6</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:endEvent id="EndEvent_2" name="Invoice rejected">
      <bpmn:incoming>Flow_7</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;

  // Sample DMN Decision
  const invoiceDmn = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/"
             xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/"
             xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/"
             xmlns:camunda="http://camunda.org/schema/1.0/dmn"
             id="Definitions_1"
             name="Invoice Assignment"
             namespace="http://camunda.org/schema/1.0/dmn">
  <decision id="invoice-assign-approver" name="Assign Approver">
    <decisionTable id="DecisionTable_1" hitPolicy="FIRST">
      <input id="Input_1" label="Amount">
        <inputExpression id="InputExpression_1" typeRef="double">
          <text>amount</text>
        </inputExpression>
      </input>
      <input id="Input_2" label="Category">
        <inputExpression id="InputExpression_2" typeRef="string">
          <text>invoiceCategory</text>
        </inputExpression>
      </input>
      <output id="Output_1" label="Approver" name="approver" typeRef="string" />
      <rule id="Rule_1">
        <inputEntry id="InputEntry_1"><text>&lt; 250</text></inputEntry>
        <inputEntry id="InputEntry_2"><text></text></inputEntry>
        <outputEntry id="OutputEntry_1"><text>"demo"</text></outputEntry>
      </rule>
      <rule id="Rule_2">
        <inputEntry id="InputEntry_3"><text>&gt;= 250</text></inputEntry>
        <inputEntry id="InputEntry_4"><text>"Travel Expenses"</text></inputEntry>
        <outputEntry id="OutputEntry_2"><text>"john"</text></outputEntry>
      </rule>
      <rule id="Rule_3">
        <inputEntry id="InputEntry_5"><text>&gt;= 250</text></inputEntry>
        <inputEntry id="InputEntry_6"><text></text></inputEntry>
        <outputEntry id="OutputEntry_3"><text>"mary"</text></outputEntry>
      </rule>
    </decisionTable>
  </decision>
</definitions>`;

  // Write sample files
  const invoiceBpmnPath = path.join(processesDir, 'bpmn/invoice.bpmn');
  const invoiceDmnPath = path.join(processesDir, 'dmn/invoice-assign-approver.dmn');
  
  try {
    await fs.access(invoiceBpmnPath);
    console.log('Sample invoice.bpmn already exists');
  } catch {
    await fs.writeFile(invoiceBpmnPath, invoiceBpmn);
    console.log('✓ Created sample invoice.bpmn');
  }
  
  try {
    await fs.access(invoiceDmnPath);
    console.log('Sample invoice-assign-approver.dmn already exists');
  } catch {
    await fs.writeFile(invoiceDmnPath, invoiceDmn);
    console.log('✓ Created sample invoice-assign-approver.dmn');
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('═'.repeat(60));
  console.log('  Operaton Process Deployment Script');
  console.log('═'.repeat(60));
  console.log(`\nTarget: ${config.baseUrl}\n`);
  
  // Check connection
  if (!await checkConnection()) {
    console.error('\nCannot proceed without connection to Operaton');
    process.exit(1);
  }
  
  // Create sample processes if needed
  console.log('\n📁 Checking sample processes...');
  await createSampleProcesses();
  
  // Get existing deployments
  console.log('\n📋 Existing deployments:');
  const existingDeployments = await getExistingDeployments();
  if (existingDeployments.length === 0) {
    console.log('  (none)');
  } else {
    existingDeployments.slice(0, 5).forEach(d => {
      console.log(`  - ${d.name} (${d.id})`);
    });
    if (existingDeployments.length > 5) {
      console.log(`  ... and ${existingDeployments.length - 5} more`);
    }
  }
  
  // Deploy processes
  const results = await deployAllProcesses();
  
  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('  Deployment Summary');
  console.log('═'.repeat(60));
  console.log(`  Deployed: ${results.deployed.length}`);
  console.log(`  Failed:   ${results.failed.length}`);
  console.log(`  Skipped:  ${results.skipped.length}`);
  console.log('═'.repeat(60) + '\n');
  
  if (results.failed.length > 0) {
    console.log('Failed deployments:');
    results.failed.forEach(f => console.log(`  - ${f.name}`));
  }
  
  if (results.skipped.length > 0) {
    console.log('\nSkipped (files not found):');
    results.skipped.forEach(s => console.log(`  - ${s.key}: ${s.reason}`));
    console.log('\nTo create missing process files:');
    console.log('  1. Copy BPMN/DMN files to processes/ directory');
    console.log('  2. Or use existing files from Camunda examples');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
