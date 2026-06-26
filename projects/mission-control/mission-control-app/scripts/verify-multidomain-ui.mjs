import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(process.cwd(), '.env.local'));
loadEnvFile(path.join(process.cwd(), '.env'));

const password = process.env.MISSION_CONTROL_PASSWORD;
if (!password) throw new Error('MISSION_CONTROL_PASSWORD is not configured for local visual verification.');

const baseUrl = process.env.MISSION_CONTROL_VERIFY_URL || 'http://127.0.0.1:3033';
const screenshotDir = process.env.MISSION_CONTROL_SCREENSHOT_DIR || '/tmp/mission-control-ui';
fs.mkdirSync(screenshotDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  defaultViewport: { width: 1728, height: 1117, deviceScaleFactor: 1 },
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.type('input[type="password"]', password, { delay: 1 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]);

  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle0', timeout: 60000 });
  const dashboardUrl = page.url();
  const dashboardText = await page.evaluate(() => document.body.innerText);
  const dashboardRequired = ['Mission Control OS', 'Daily Task Control', '30,000-foot operating map', 'PIER Commercial'];
  for (const phrase of dashboardRequired) {
    if (!dashboardText.includes(phrase)) throw new Error(`Dashboard missing phrase: ${phrase}; url=${dashboardUrl}; text=${dashboardText.slice(0, 500).replace(/\s+/g, ' ')}`);
  }
  await page.screenshot({ path: path.join(screenshotDir, 'global-dashboard.png'), fullPage: true });

  await page.click('a[href="/pier-workspace"]');
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 });
  const workspaceText = await page.evaluate(() => document.body.innerText);
  const workspaceRequired = [
    'PIER Commercial Workspace',
    'PIER Commercial Brokerage',
    'Listing Portal Intake',
    'Listing Revisions',
    'Website Creation',
    'Email Creation',
    'OM Creation',
    'PIER Commercial Company Marketing',
    'WordPress Pulse Drop',
    'Instagram Post Generation',
    'Facebook Post Generation',
  ];
  for (const phrase of workspaceRequired) {
    if (!workspaceText.includes(phrase)) throw new Error(`PIER workspace missing phrase: ${phrase}`);
  }
  await page.screenshot({ path: path.join(screenshotDir, 'pier-workspace.png'), fullPage: true });

  console.log(JSON.stringify({ ok: true, screenshots: [path.join(screenshotDir, 'global-dashboard.png'), path.join(screenshotDir, 'pier-workspace.png')] }, null, 2));
} finally {
  await browser.close();
}
