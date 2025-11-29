#!/usr/bin/env node

/**
 * Show current status of Operaton environment
 */

import 'dotenv/config';
import axios from 'axios';

const config = {
  baseUrl: process.env.OPERATON_REST_URL || 'https://operaton-doc.open-regels.nl/engine-rest',
  username: process.env.OPERATON_USERNAME || 'demo',
  password: process.env.OPERATON_PASSWORD || 'demo',
};

const api = axios.create({
  baseURL: config.baseUrl,
  auth: {
    username: config.username,
    password: config.password
  }
});

async function getCount(endpoint, params = {}) {
  try {
    const response = await api.get(`${endpoint}/count`, { params });
    return response.data.count;
  } catch {
    return '?';
  }
}

async function main() {
  console.log(`Target: ${config.baseUrl}\n`);
  
  try {
    await api.get('/engine');
  } catch (error) {
    console.error('✗ Cannot connect to Operaton');
    process.exit(1);
  }
  
  const stats = {
    deployments: await getCount('/deployment'),
    processDefinitions: await getCount('/process-definition'),
    decisionDefinitions: await getCount('/decision-definition'),
    runningInstances: await getCount('/process-instance'),
    historicInstances: await getCount('/history/process-instance'),
    tasks: await getCount('/task'),
    incidents: await getCount('/incident'),
    jobs: await getCount('/job'),
    failedJobs: await getCount('/job', { withException: true }),
    users: await getCount('/user'),
    groups: await getCount('/group'),
  };
  
  console.log('Deployments:');
  console.log(`  Deployments:          ${stats.deployments}`);
  console.log(`  Process definitions:  ${stats.processDefinitions}`);
  console.log(`  Decision definitions: ${stats.decisionDefinitions}`);
  console.log('');
  console.log('Runtime:');
  console.log(`  Running instances:    ${stats.runningInstances}`);
  console.log(`  Tasks:                ${stats.tasks}`);
  console.log(`  Jobs:                 ${stats.jobs}`);
  console.log(`  Failed jobs:          ${stats.failedJobs}`);
  console.log(`  Incidents:            ${stats.incidents}`);
  console.log('');
  console.log('History:');
  console.log(`  Historic instances:   ${stats.historicInstances}`);
  console.log('');
  console.log('Identity:');
  console.log(`  Users:                ${stats.users}`);
  console.log(`  Groups:               ${stats.groups}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
