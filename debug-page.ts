/**
 * Debug script: Test Playwright rendering + extraction on a single page.
 * Run with: npx tsx debug-page.ts
 */

import { chromium } from 'playwright';
import { extractContacts } from './src/crawler/extractor.js';

const TARGET_URL = 'https://www.aginfotech.co/careers';

async function main() {
    console.log(`\n🔍 Debug: Testing extraction on ${TARGET_URL}\n`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    console.log('1. Navigating...');
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    console.log('2. Waiting for networkidle...');
    try {
        await page.waitForLoadState('networkidle', { timeout: 15000 });
    } catch {
        console.log('   (networkidle timed out, continuing)');
    }

    console.log('3. Scrolling page with mouse.wheel...');
    const scrollHeight = await page.evaluate('document.body.scrollHeight') as number;
    console.log(`   Page scroll height: ${scrollHeight}`);
    const steps = 5;
    const stepSize = Math.floor(scrollHeight / steps);
    for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, stepSize);
        await page.waitForTimeout(400);
    }
    await page.evaluate('window.scrollTo(0, 0)');
    await page.waitForTimeout(500);

    console.log('4. Waiting 5s for final render...');
    await page.waitForTimeout(5000);

    console.log('5. Getting page content...');
    const html = await page.content();

    console.log(`\n📄 HTML length: ${html.length} characters`);

    // Check for specific content in raw HTML
    const hasCareerEmail = html.includes('careers@aginfotech.co');
    const hasHelloEmail = html.includes('hello@aginfotech.co');
    const hasPhone = html.includes('03001244636');
    const hasLinkedIn = html.includes('linkedin.com');
    const hasInstagram = html.includes('instagram.com');
    const mailtoLinks = html.match(/href="mailto:[^"]+"/g) || [];
    const telLinks = html.match(/href="tel:[^"]+"/g) || [];

    console.log(`\n🔎 Raw HTML contains:`);
    console.log(`   careers@aginfotech.co: ${hasCareerEmail}`);
    console.log(`   hello@aginfotech.co:   ${hasHelloEmail}`);
    console.log(`   03001244636:           ${hasPhone}`);
    console.log(`   linkedin.com:          ${hasLinkedIn}`);
    console.log(`   instagram.com:         ${hasInstagram}`);
    console.log(`   mailto: links:         ${JSON.stringify(mailtoLinks)}`);
    console.log(`   tel: links:            ${JSON.stringify(telLinks)}`);

    // Now run our extractor
    console.log('\n6. Running extractContacts()...');
    const result = extractContacts(html, TARGET_URL);

    console.log(`\n✅ Extraction result:`);
    console.log(`   Emails:  ${JSON.stringify(result.emails)}`);
    console.log(`   Phones:  ${JSON.stringify(result.phones)}`);
    console.log(`   Social:  ${JSON.stringify(result.socialMedia)}`);
    console.log(`   WhatsApp: ${JSON.stringify(result.whatsapp)}`);
    console.log(`   Company: ${result.companyName}`);
    console.log(`   Contact page: ${result.isContactPage}`);

    await browser.close();
    console.log('\nDone!');
}

main().catch(console.error);
