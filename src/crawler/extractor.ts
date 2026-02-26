/**
 * Contact data extraction from HTML pages.
 *
 * Extracts emails, phones, addresses, social media links, WhatsApp,
 * Skype, company name, and meta descriptions using regex + DOM parsing.
 */

import { load as cheerioLoad } from 'cheerio';
import type { PageExtraction, SocialMediaResult, ContactResult } from '../types/index.js';

// ─── Regex Patterns ──────────────────────────────────────────

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const OBFUSCATED_EMAIL_REGEX =
    /[a-zA-Z0-9._%+\-]+\s*[\[\(]\s*at\s*[\]\)]\s*[a-zA-Z0-9.\-]+\s*[\[\(]\s*dot\s*[\]\)]\s*[a-zA-Z]{2,}/gi;
const WHATSAPP_REGEX_SRC = /(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)(\+?\d{7,15})/;
const SKYPE_REGEX_SRC = /skype:([a-zA-Z0-9._\-]+)/;

// Social media domain matchers
const SOCIAL_PATTERNS: { key: keyof SocialMediaResult; pattern: RegExp }[] = [
    { key: 'linkedin', pattern: /https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[^\s"'<>]+/gi },
    { key: 'twitter', pattern: /https?:\/\/(?:www\.)?twitter\.com\/[^\s"'<>]+/gi },
    { key: 'x', pattern: /https?:\/\/(?:www\.)?x\.com\/[^\s"'<>]+/gi },
    { key: 'facebook', pattern: /https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>]+/gi },
    { key: 'instagram', pattern: /https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>]+/gi },
    { key: 'youtube', pattern: /https?:\/\/(?:www\.)?youtube\.com\/(?:channel|c|user|@)[^\s"'<>]+/gi },
    { key: 'tiktok', pattern: /https?:\/\/(?:www\.)?tiktok\.com\/@[^\s"'<>]+/gi },
    { key: 'pinterest', pattern: /https?:\/\/(?:www\.)?pinterest\.com\/[^\s"'<>]+/gi },
];

// Contact page URL patterns
const CONTACT_PAGE_REGEX = /\/(contact|about|reach-us|get-in-touch|kontakt)/i;

// Common junk emails to filter
const JUNK_EMAILS = new Set([
    'example@example.com',
    'test@test.com',
    'your@email.com',
    'name@domain.com',
    'email@domain.com',
    'user@example.com',
    'info@example.com',
]);

// Common image/asset file extensions to filter from emails
const ASSET_EMAIL_REGEX = /\.(png|jpg|jpeg|gif|svg|webp|css|js|woff|woff2|ttf|eot)$/i;

/**
 * Normalize a phone number from a tel: href.
 * Keeps + prefix and digits only, rejects if digit count is out of range.
 */
function normalizeTelPhone(raw: string): string | null {
    const cleaned = raw.trim();
    const hasPlus = cleaned.startsWith('+');
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return null;
    return hasPlus ? `+${digits}` : digits;
}

/**
 * Decode obfuscated email: "user [at] domain [dot] com" → "user@domain.com"
 */
function decodeObfuscatedEmail(text: string): string {
    return text
        .replace(/\s*[\[\(]\s*at\s*[\]\)]\s*/gi, '@')
        .replace(/\s*[\[\(]\s*dot\s*[\]\)]\s*/gi, '.')
        .trim();
}

/**
 * Extract all contact data from an HTML string and page URL.
 */
export function extractContacts(html: string, pageUrl: string): PageExtraction {
    const extraction: PageExtraction = {
        url: pageUrl,
        emails: [],
        phones: [],
        socialMedia: {},
        whatsapp: [],
        skype: [],
        isContactPage: false,
        companyName: null,
        description: null,
    };

    // ── Detect contact page ──────────────────────────────────
    try {
        const pathname = new URL(pageUrl).pathname;
        extraction.isContactPage = CONTACT_PAGE_REGEX.test(pathname);
    } catch {
        // invalid URL
    }

    // ── Load HTML into cheerio for DOM parsing ───────────────
    const $ = cheerioLoad(html);

    // ── 1. Emails ────────────────────────────────────────────
    const rawEmails = html.match(EMAIL_REGEX) || [];
    rawEmails.forEach((e) => {
        const lower = e.toLowerCase();
        if (!JUNK_EMAILS.has(lower) && !ASSET_EMAIL_REGEX.test(lower)) {
            extraction.emails.push(lower);
        }
    });

    // From mailto: links
    $('a[href^="mailto:"]').each((_: number, el: unknown) => {
        const href = $(el as never).attr('href');
        if (href) {
            const email = href.replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase();
            if (email && !JUNK_EMAILS.has(email) && !ASSET_EMAIL_REGEX.test(email)) {
                extraction.emails.push(email);
            }
        }
    });

    // Obfuscated emails
    const obfuscated = html.match(OBFUSCATED_EMAIL_REGEX) || [];
    obfuscated.forEach((o) => {
        const decoded = decodeObfuscatedEmail(o).toLowerCase();
        if (/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(decoded) && !JUNK_EMAILS.has(decoded)) {
            extraction.emails.push(decoded);
        }
    });

    // ── 2. Phone numbers (from tel: links only — most reliable source) ────
    $('a[href^="tel:"]').each((_: number, el: unknown) => {
        const href = $(el as never).attr('href');
        if (href) {
            const normalized = normalizeTelPhone(href.replace(/^tel:/i, ''));
            if (normalized) extraction.phones.push(normalized);
        }
    });

    // ── 3. Social media profile URLs ────────────────────────
    const allLinks: string[] = [];
    $('a[href]').each((_: number, el: unknown) => {
        const href = $(el as never).attr('href');
        if (href) allLinks.push(href);
    });
    const allLinksText = allLinks.join(' ') + ' ' + html;

    for (const { key, pattern } of SOCIAL_PATTERNS) {
        const fresh = new RegExp(pattern.source, pattern.flags);
        const matches = allLinksText.match(fresh);
        if (matches && matches.length > 0) {
            extraction.socialMedia[key] = matches[0].replace(/['">\s]+$/, '');
        }
    }

    // ── 5. WhatsApp numbers ─────────────────────────────────
    const waRegex = new RegExp(WHATSAPP_REGEX_SRC.source, 'gi');
    let waMatch: RegExpExecArray | null;
    while ((waMatch = waRegex.exec(html)) !== null) {
        if (waMatch[1]) extraction.whatsapp.push(waMatch[1]);
    }

    // ── 6. Skype handles ────────────────────────────────────
    const skypeRegex = new RegExp(SKYPE_REGEX_SRC.source, 'gi');
    let skypeMatch: RegExpExecArray | null;
    while ((skypeMatch = skypeRegex.exec(html)) !== null) {
        if (skypeMatch[1]) extraction.skype.push(skypeMatch[1]);
    }

    // ── 7. Company name ─────────────────────────────────────
    const ogSiteName = $('meta[property="og:site_name"]').attr('content');
    const titleText = $('title').text().trim();
    const h1Text = $('h1').first().text().trim();
    extraction.companyName = ogSiteName || titleText || h1Text || null;

    // ── 8. Description ──────────────────────────────────────
    const metaDesc = $('meta[name="description"]').attr('content');
    const ogDesc = $('meta[property="og:description"]').attr('content');
    extraction.description = metaDesc || ogDesc || null;

    return extraction;
}

/**
 * Merge multiple per-page extractions into one deduplicated ContactResult.
 */
export function mergeExtractions(
    domain: string,
    pages: PageExtraction[],
    excludedPaths: string[]
): ContactResult {
    const emailsSet = new Set<string>();
    const phonesSet = new Set<string>();
    const whatsappSet = new Set<string>();
    const skypeSet = new Set<string>();
    const contactPagesSet = new Set<string>();
    const pagesScannedSet = new Set<string>();

    const socialMedia: SocialMediaResult = {
        linkedin: null,
        twitter: null,
        x: null,
        facebook: null,
        instagram: null,
        youtube: null,
        tiktok: null,
        pinterest: null,
    };

    let companyName: string | null = null;
    let description: string | null = null;

    for (const page of pages) {
        pagesScannedSet.add(page.url);

        page.emails.forEach((e) => emailsSet.add(e));
        page.phones.forEach((p) => phonesSet.add(p));
        page.whatsapp.forEach((w) => whatsappSet.add(w));
        page.skype.forEach((s) => skypeSet.add(s));

        if (page.isContactPage) contactPagesSet.add(page.url);

        // Merge social: first non-null wins
        for (const key of Object.keys(socialMedia) as (keyof SocialMediaResult)[]) {
            if (!socialMedia[key] && page.socialMedia[key]) {
                socialMedia[key] = page.socialMedia[key]!;
            }
        }

        if (!companyName && page.companyName) companyName = page.companyName;
        if (!description && page.description) description = page.description;
    }

    return {
        domain,
        companyName,
        description,
        emails: [...emailsSet],
        phones: [...phonesSet],
        socialMedia,
        whatsapp: [...whatsappSet],
        skype: [...skypeSet],
        contactPages: [...contactPagesSet],
        pagesScanned: [...pagesScannedSet],
        excludedPaths,
    };
}
