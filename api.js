const express = require('express');
const puppeteer = require('puppeteer');
const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.API_PORT || 3000;
const CHECK_INTERVAL = process.env.CHECK_INTERVAL || 10; // minutes
const FB_PAGE_URL = process.env.FB_PAGE_URL || 'https://www.facebook.com/1GenerationZ';

// Import Discord bot post function
let discordPostUpdate = null;
try {
    const discordBot = require('./bot-functions');
    discordPostUpdate = discordBot.postUpdate;
} catch (error) {
    console.log('⚠️  Discord bot functions not loaded yet. Will retry when needed.');
}

// Data storage
const DATA_DIR = path.join(__dirname, 'data');
const LAST_POST_FILE = path.join(DATA_DIR, 'last-post.json');

// In-memory state
let state = {
    lastCheckTime: '',
    posts: [] // Array of { url, time, content, image, isPublished }
};

// Initialize data directory and load state
async function initializeData() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });

        try {
            const data = await fs.readFile(LAST_POST_FILE, 'utf-8');
            const parsed = JSON.parse(data);

            // Migration/Compatibility check
            if (parsed.lastPostUrl && !parsed.posts) {
                state.posts = [{
                    url: parsed.lastPostUrl,
                    time: parsed.lastPostTime,
                    content: parsed.lastPostContent,
                    isPublished: true
                }];
                state.lastCheckTime = parsed.lastCheckTime;
            } else {
                state = { ...state, ...parsed };
            }
            console.log('✅ Loaded state from file');
        } catch (error) {
            console.log('📝 No previous state found or file empty, starting fresh');
            await saveState();
        }
    } catch (error) {
        console.error('Error initializing data:', error);
    }
}

// Save state data
async function saveState() {
    try {
        // Keep only last 20 posts to prevent file bloat
        if (state.posts.length > 20) {
            state.posts = state.posts.slice(0, 20);
        }
        await fs.writeFile(LAST_POST_FILE, JSON.stringify(state, null, 2));
    } catch (error) {
        console.error('Error saving state:', error);
    }
}

// Helper to wait in Puppeteer
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to truncate text at the end of a sentence
function cleanTruncate(text, maxLength = 800) {
    if (text.length <= maxLength) return text;

    // Take a snippet that is slightly longer than the limit to find a boundary
    const snippet = text.substring(0, maxLength);

    // Find the last sentence-ending punctuation (. or ! or ?)
    const lastSentence = Math.max(
        snippet.lastIndexOf('. '),
        snippet.lastIndexOf('! '),
        snippet.lastIndexOf('? '),
        snippet.lastIndexOf('.\n'),
        snippet.lastIndexOf('!\n'),
        snippet.lastIndexOf('?\n')
    );

    if (lastSentence > maxLength * 0.5) {
        return text.substring(0, lastSentence + 1) + '...';
    }

    // If no good sentence break, find the last space
    const lastSpace = snippet.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.7) {
        return text.substring(0, lastSpace) + '...';
    }

    return snippet.trim() + '...';
}

// Scrape Facebook page for posts
async function scrapePosts() {
    let browser = null;

    try {
        console.log('🔍 Launching browser to scrape Facebook...');

        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();

        // Set user agent to avoid detection
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log(`📱 Navigating to ${FB_PAGE_URL}...`);
        await page.goto(FB_PAGE_URL, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Wait for posts to load
        await delay(3000);

        // Scroll down a bit to load more posts
        await page.evaluate(() => window.scrollBy(0, 1000));
        await delay(2000);

        // Try to find the latest posts
        const posts = await page.evaluate(() => {
            const selectors = [
                '[role="article"]',
                '.x1yzt60o.x1n2onr6.xh8yej3.x1ja2u2z'
            ];

            let postElements = [];
            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    postElements = Array.from(elements);
                    break;
                }
            }

            return postElements.map(el => {
                // Try to find the message content
                const messageSelectors = [
                    'div[data-ad-preview="message"]',
                    'div[data-ad-comet-preview="message"]',
                    '.x1iorvi4.x1pi30zi.x1l90r2v.x1swvt13'
                ];

                let messageEl = null;
                for (const sel of messageSelectors) {
                    messageEl = el.querySelector(sel);
                    if (messageEl) break;
                }

                const content = messageEl ? (messageEl.innerText || messageEl.textContent || '') : '';

                // Try to find post link
                const linkElement = el.querySelector('a[href*="/posts/"], a[href*="/photo"], a[href*="/videos/"], a[href*="/permalink"]');
                let postUrl = linkElement ? linkElement.href : null;

                // Try to find image
                const imgElement = el.querySelector('img.x1ey2m1c, img.x1b1988l, img.x1ll5mko');
                const imageUrl = imgElement ? imgElement.src : null;

                // Clean URL (remove tracking params)
                if (postUrl) {
                    try {
                        const urlObj = new URL(postUrl);
                        postUrl = urlObj.origin + urlObj.pathname;
                    } catch (e) { }
                }

                return {
                    content: content, // Get full content here, truncate later
                    url: postUrl,
                    image: imageUrl,
                    timestamp: new Date().toISOString()
                };
            }).filter(p => p.url && p.content);
        });

        await browser.close();

        if (!posts || posts.length === 0) {
            console.log('⚠️  Could not find any posts on the page');
            return [];
        }

        // Truncate content nicely
        const processedPosts = posts.map(p => ({
            ...p,
            content: cleanTruncate(p.content)
        }));

        console.log(`✅ Successfully scraped ${processedPosts.length} posts`);
        return processedPosts;

    } catch (error) {
        console.error('❌ Error scraping Facebook:', error.message);
        if (browser) {
            await browser.close();
        }
        return [];
    }
}

// Check for new posts and send to Discord
async function checkForNewPosts() {
    console.log('🔄 Checking for new posts...');
    state.lastCheckTime = new Date().toISOString();

    const fetchedPosts = await scrapePosts();

    if (fetchedPosts.length === 0) {
        console.log('⚠️  Failed to scrape or no posts found');
        await saveState();
        return { success: false, message: 'No posts found' };
    }

    // Identify new posts
    const existingUrls = new Set(state.posts.map(p => p.url));
    const newPostsScraped = fetchedPosts.filter(p => !existingUrls.has(p.url));

    if (newPostsScraped.length > 0) {
        console.log(`🆕 ${newPostsScraped.length} new post(s) detected!`);
        // Add new posts to the start of our tracking list
        const preparedPosts = newPostsScraped.map(p => ({
            url: p.url,
            time: p.timestamp,
            content: p.content,
            image: p.image,
            isPublished: false
        }));
        state.posts = [...preparedPosts, ...state.posts];
    }

    // Process all unpublished posts
    const unpublishedPosts = state.posts.filter(p => p.isPublished === false);

    if (unpublishedPosts.length === 0) {
        console.log('ℹ️  No pending posts to publish');
        await saveState();
        return { success: true, message: 'No new posts to publish', isNew: false };
    }

    console.log(`📤 Attempting to publish ${unpublishedPosts.length} post(s)...`);

    let sentCount = 0;
    // Reverse unpublished posts to post oldest first (chronological order)
    const toPublish = [...unpublishedPosts].reverse();

    for (const post of toPublish) {
        // Find the index in the original state.posts array
        const stateIdx = state.posts.findIndex(p => p.url === post.url);

        // Send to Discord
        if (discordPostUpdate) {
            try {
                await discordPostUpdate({
                    title: '📱 New Post from 1GenerationZ',
                    description: post.content,
                    url: post.url,
                    image: post.image,
                    color: '#1877F2' // Facebook blue
                });

                // Mark as published in state
                if (stateIdx !== -1) {
                    state.posts[stateIdx].isPublished = true;
                }
                sentCount++;

                // Save state after each successful post
                await saveState();

                // Small delay between posts to prevent rate limits
                await new Promise(r => setTimeout(r, 2000));
            } catch (error) {
                console.error(`❌ Error posting to Discord (${post.url}):`, error);
                // We don't set isPublished to true, so it will be retried next time
            }
        } else {
            console.warn('⚠️ Discord post function not available');
        }
    }

    return {
        success: sentCount > 0,
        message: `Processed ${unpublishedPosts.length} pending posts, sent ${sentCount} successfully.`,
        isNew: newPostsScraped.length > 0,
        count: sentCount
    };
}

// API Routes
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get status
app.get('/api/status', (req, res) => {
    const lastPost = state.posts[0] || {};
    res.json({
        status: 'running',
        lastCheck: state.lastCheckTime,
        pendingPosts: state.posts.filter(p => !p.isPublished).length,
        lastPost: {
            url: lastPost.url,
            time: lastPost.time,
            isPublished: lastPost.isPublished,
            preview: (lastPost.content || '').substring(0, 100)
        },
        checkInterval: `${CHECK_INTERVAL} minutes`,
        fbPageUrl: FB_PAGE_URL
    });
});

// Get latest posts (manual trigger)
app.get('/api/latest-posts', async (req, res) => {
    try {
        const posts = await scrapePosts();
        if (posts.length > 0) {
            res.json({ success: true, posts });
        } else {
            res.status(500).json({ success: false, message: 'Failed to scrape posts' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Manually trigger check for new posts
app.post('/api/check-now', async (req, res) => {
    try {
        const result = await checkForNewPosts();
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start server
async function startServer() {
    await initializeData();

    app.listen(PORT, () => {
        console.log(`✅ API server running on http://localhost:${PORT}`);
        console.log(`📊 Status: http://localhost:${PORT}/api/status`);
        console.log(`🔍 Check interval: Every ${CHECK_INTERVAL} minutes`);
    });

    // Schedule periodic checks
    const cronExpression = `*/${CHECK_INTERVAL} * * * *`;
    cron.schedule(cronExpression, async () => {
        console.log('\n⏰ Scheduled check triggered');
        await checkForNewPosts();
    });

    console.log('✅ Scheduled task initialized');

    // Do an initial check immediately
    console.log('\n🚀 Running initial check...');
    await checkForNewPosts();
}

startServer();

module.exports = { checkForNewPosts, scrapePosts };
