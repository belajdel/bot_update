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
let lastPostData = {
    lastPostUrl: '',
    lastCheckTime: '',
    lastPostTime: '',
    lastPostContent: ''
};

// Initialize data directory and load last post
async function initializeData() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });

        try {
            const data = await fs.readFile(LAST_POST_FILE, 'utf-8');
            const parsed = JSON.parse(data);
            lastPostData = { ...lastPostData, ...parsed };
            console.log('✅ Loaded last post data from file');
        } catch (error) {
            console.log('📝 No previous post data found or file empty, starting fresh');
            await saveLastPost();
        }
    } catch (error) {
        console.error('Error initializing data:', error);
    }
}

// Save last post data
async function saveLastPost() {
    try {
        await fs.writeFile(LAST_POST_FILE, JSON.stringify(lastPostData, null, 2));
    } catch (error) {
        console.error('Error saving last post:', error);
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
    lastPostData.lastCheckTime = new Date().toISOString();

    const fetchedPosts = await scrapePosts();

    if (fetchedPosts.length === 0) {
        console.log('⚠️  Failed to scrape or no posts found');
        await saveLastPost();
        return { success: false, message: 'No posts found' };
    }

    // Reverse to process oldest first to maintain chronological order in Discord
    const newPosts = [];
    const lastUrl = lastPostData.lastPostUrl;

    for (const post of fetchedPosts) {
        if (post.url === lastUrl) break;
        newPosts.push(post);
    }

    // Reverse back so we post in order
    newPosts.reverse();

    if (newPosts.length === 0) {
        console.log('ℹ️  No new posts found');
        await saveLastPost();
        return { success: true, message: 'No new posts', isNew: false };
    }

    console.log(`🆕 ${newPosts.length} new post(s) detected!`);

    let sentCount = 0;
    for (const post of newPosts) {
        // Update state with the absolute latest as we go
        lastPostData.lastPostUrl = post.url;
        lastPostData.lastPostTime = post.timestamp;
        lastPostData.lastPostContent = post.content;

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
                sentCount++;
                // Small delay between posts to prevent rate limits
                await new Promise(r => setTimeout(r, 2000));
            } catch (error) {
                console.error('❌ Error posting to Discord:', error);
            }
        }
    }

    await saveLastPost();
    return {
        success: sentCount > 0,
        message: `Processed ${newPosts.length} posts, sent ${sentCount} successfully.`,
        isNew: true,
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
    res.json({
        status: 'running',
        lastCheck: lastPostData.lastCheckTime,
        lastPost: {
            url: lastPostData.lastPostUrl,
            time: lastPostData.lastPostTime,
            preview: (lastPostData.lastPostContent || '').substring(0, 100)
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
