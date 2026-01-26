from facebook_page_scraper import FacebookPageScraper

# Configuration
page_name = "1GenerationZ"  # The ID from your URL
posts_count = 50            # How many posts to look back
browser = "chrome"          # You need Chrome installed
proxy = None                # Use a proxy if you get blocked

scraper = FacebookPageScraper(page_name, posts_count, browser, proxy=proxy)
posts_data = scraper.get_posts_data()

# Extract just the links
print(f"--- Found {len(posts_data)} posts ---")
for post in posts_data:
    print(post.get('post_url'))