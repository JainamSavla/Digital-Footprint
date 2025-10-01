console.log("Digital Footprints content script loaded");

// Get current hostname and URL
const currentURL = window.location.href;
const currentHostname = window.location.hostname.toLowerCase();
const normalizedHostname = currentHostname.replace(/^www\./i, "");

console.log("Current URL:", currentURL);
console.log("Current hostname:", currentHostname);
console.log("Normalized hostname:", normalizedHostname);

// Improve blocking check to properly handle time limits
function checkIfBlocked() {
  return new Promise((resolve) => {
    const today = getDateString(new Date());

    chrome.storage.sync.get(
      ["blockedWebsitesArray", "websiteTimeLimits"],
      function (data) {
        const blockedSites = data.blockedWebsitesArray || [];
        const timeLimits = data.websiteTimeLimits || {};

        console.log("Checking blocked sites:", blockedSites);
        console.log("Checking time limits:", timeLimits);

        // First check if site is in the permanent blocklist
        for (let site of blockedSites) {
          let cleanSite = site
            .toLowerCase()
            .trim()
            .replace(/^https?:\/\//i, "")
            .replace(/^www\./i, "")
            .replace(/\/.*$/, "");

          // Check for a match
          if (
            normalizedHostname === cleanSite ||
            normalizedHostname.endsWith("." + cleanSite) ||
            normalizedHostname.includes(cleanSite)
          ) {
            console.log("Site is in permanent blocklist");
            resolve({ blocked: true, reason: "permanent" });
            return;
          }
        }

        // Then check time limits
        chrome.storage.local.get(today, function (todayData) {
          const todayUsage = todayData[today] || {};

          // Check each site with time limits
          for (const site in timeLimits) {
            let cleanSite = site
              .toLowerCase()
              .trim()
              .replace(/^https?:\/\//i, "")
              .replace(/^www\./i, "")
              .replace(/\/.*$/, "");

            // Check for a match
            if (
              normalizedHostname === cleanSite ||
              normalizedHostname.endsWith("." + cleanSite) ||
              normalizedHostname.includes(cleanSite)
            ) {
              const timeLimit = timeLimits[site];
              const timeUsed = todayUsage[site] || 0;

              console.log(
                `Site has time limit: ${timeLimit}s, used: ${timeUsed}s`
              );

              // Check if time limit reached
              if (timeUsed >= timeLimit) {
                console.log("Time limit reached, blocking site");
                resolve({
                  blocked: true,
                  reason: "timelimit",
                  timeLimit: timeLimit,
                  timeUsed: timeUsed,
                });
                return;
              }
            }
          }

          // Not blocked
          resolve({ blocked: false });
        });
      }
    );
  });
}

// Helper function to get date string
function getDateString(date) {
  const year = date.getFullYear();
  let month = date.getMonth() + 1;
  let day = date.getDate();

  if (month < 10) month = "0" + month;
  if (day < 10) day = "0" + day;

  return `${year}-${month}-${day}`;
}

// Update block page to show reason
function blockPage(blockInfo) {
  console.log("BLOCKING", currentHostname, "Reason:", blockInfo.reason);

  // Stop all loading immediately
  window.stop();

  // Clear the page content
  document.head.innerHTML = "";
  document.body.innerHTML = "";

  let reasonMessage = "This website has been blocked by Digital Footprints";

  // Customize message based on block reason
  if (blockInfo.reason === "timelimit") {
    const minutes = Math.floor(blockInfo.limit / 60);
    reasonMessage = `You've reached your time limit of ${minutes} minutes for today`;
  }

  // Create the blocked page content
  const blockedHTML = `
    <head>
      <title>Site Blocked - Digital Footprints</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          background: linear-gradient(135deg, #174b42 0%, #2d7a6b 100%);
          color: white;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          text-align: center;
          overflow: hidden;
        }
        .container {
          max-width: 600px;
          padding: 40px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          backdrop-filter: blur(10px);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        h1 {
          font-size: 3.5em;
          margin-bottom: 20px;
          text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
        }
        .blocked-icon {
          font-size: 5em;
          margin-bottom: 30px;
          color: #ff6b6b;
        }
        p {
          font-size: 1.3em;
          line-height: 1.6;
          margin-bottom: 15px;
          opacity: 0.9;
        }
        .website-name {
          color: #ffd93d;
          font-weight: bold;
          font-size: 1.1em;
        }
        .footer {
          margin-top: 30px;
          font-size: 0.9em;
          opacity: 0.7;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="blocked-icon">🚫</div>
        <h1>Access Blocked</h1>
        <p>${reasonMessage}</p>
        <p>Blocked site: <span class="website-name">${currentHostname}</span></p>
        <div class="footer">
          <p>Manage your blocked sites in the extension popup</p>
        </div>
      </div>
    </body>
  `;

  // Replace the entire document
  document.open();
  document.write(blockedHTML);
  document.close();

  // Prevent any further navigation
  window.addEventListener("beforeunload", function (e) {
    e.preventDefault();
    return "";
  });
}

// Function to initialize blocking check
async function initializeBlocking() {
  try {
    // Skip blocking for extension pages and special URLs
    if (
      currentURL.startsWith("chrome://") ||
      currentURL.startsWith("chrome-extension://") ||
      currentURL.startsWith("moz-extension://") ||
      currentURL.startsWith("about:") ||
      currentURL.startsWith("file://")
    ) {
      console.log("Skipping blocking for special URL:", currentURL);
      return;
    }

    const blockResult = await checkIfBlocked();
    console.log("Block check result:", blockResult);

    if (blockResult.blocked) {
      blockPage(blockResult);
    }
  } catch (error) {
    console.error("Error checking blocked sites:", error);
  }
}

// Run blocking check immediately if DOM is already loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeBlocking);
} else {
  initializeBlocking();
}

// Also run on page load as backup
window.addEventListener("load", initializeBlocking);

// Listen for storage changes to update blocking in real-time
chrome.storage.onChanged.addListener(function (changes, namespace) {
  if (
    (changes.blockedWebsitesArray || changes.websiteTimeLimits) &&
    namespace === "sync"
  ) {
    console.log("Block list or time limits updated, rechecking...");
    initializeBlocking();
  }
});

// Prevent navigation to blocked sites
window.addEventListener("beforeunload", async function (e) {
  const shouldBlock = await checkIfBlocked();
  if (shouldBlock) {
    e.preventDefault();
    e.returnValue = "";
    return "";
  }
});

console.log("Content script initialization complete");

// ===== SOCIAL MEDIA FEED BLOCKER FUNCTIONALITY =====

// Social Media Feed Blocker Class
class SocialMediaFeedBlocker {
  constructor() {
    console.log("SocialMediaFeedBlocker constructor called");
    
    this.settings = {
      // LinkedIn
      linkedinHomeFeed: false,
      linkedinNewsFeed: false,

      // YouTube
      youtubeShorts: false,
      youtubeHomeFeed: false,
      youtubeSidebar: false,
      youtubeEndScreen: false,
      youtubeComments: false,

      // X/Twitter
      twitterForYou: false,
      twitterTrending: false,
      twitterSuggested: false,
      twitterSidebar: false,
      twitterMedia: false,

      // Reddit
      redditFeed: false,
      redditComments: false,

      // Instagram
      instagramReels: false,
      instagramExplore: false,
      instagramSuggested: false,
      instagramSuggestedReels: false,
      instagramFollowCounts: false,
    };

    this.currentSite = this.detectCurrentSite();
    console.log("Detected current site:", this.currentSite);
    
    if (this.currentSite) {
      this.init();
    } else {
      console.log("No supported social media site detected, skipping initialization");
    }
  }

  detectCurrentSite() {
    const hostname = window.location.hostname;
    if (hostname.includes("linkedin.com")) return "linkedin";
    if (hostname.includes("youtube.com")) return "youtube";
    if (hostname.includes("twitter.com") || hostname.includes("x.com"))
      return "twitter";
    if (hostname.includes("reddit.com")) return "reddit";
    if (hostname.includes("instagram.com")) return "instagram";
    return null;
  }

  init() {
    if (!this.currentSite) {
      console.log("No current site detected, exiting init");
      return;
    }

    console.log(`Initializing Social Media Feed Blocker for ${this.currentSite}`);

    // Load settings from storage
    chrome.storage.sync.get(Object.keys(this.settings), (result) => {
      console.log("Loaded settings from storage:", result);
      Object.keys(this.settings).forEach((key) => {
        this.settings[key] = result[key] === true;
      });
      console.log("Applied settings:", this.settings);
      this.applyCurrentState();
    });

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes) => {
      let hasChanges = false;
      Object.keys(changes).forEach((key) => {
        if (this.settings.hasOwnProperty(key)) {
          this.settings[key] = changes[key].newValue;
          hasChanges = true;
        }
      });
      if (hasChanges) {
        this.applyCurrentState();
      }
    });

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "updateSettings") {
        Object.keys(request.settings).forEach((key) => {
          if (this.settings.hasOwnProperty(key)) {
            this.settings[key] = request.settings[key];
          }
        });
        this.applyCurrentState();
        sendResponse({ success: true });
      }
    });

    // Apply state when DOM is ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () =>
        this.applyCurrentState()
      );
    } else {
      this.applyCurrentState();
    }

    // Watch for dynamic content changes
    this.observeChanges();
  }

  applyCurrentState() {
    console.log(
      `Applying current state for ${this.currentSite}:`,
      this.settings
    );

    // Remove all existing classes
    document.body.className = document.body.className.replace(
      /\bfeed-blocker-\S+/g,
      ""
    );

    // Apply site-specific blocking
    switch (this.currentSite) {
      case "linkedin":
        this.applyLinkedInBlocking();
        break;
      case "youtube":
        this.applyYouTubeBlocking();
        break;
      case "twitter":
        this.applyTwitterBlocking();
        break;
      case "reddit":
        this.applyRedditBlocking();
        break;
      case "instagram":
        this.applyInstagramBlocking();
        break;
    }
  }

  // LINKEDIN BLOCKING
  applyLinkedInBlocking() {
    if (this.settings.linkedinHomeFeed) {
      document.body.classList.add("feed-blocker-linkedin-home");
      this.hideLinkedInHomeFeed();
    } else {
      this.showLinkedInHomeFeed();
    }

    if (this.settings.linkedinNewsFeed) {
      document.body.classList.add("feed-blocker-linkedin-news");
      this.hideLinkedInNewsFeed();
    } else {
      this.showLinkedInNewsFeed();
    }

    this.preserveLinkedInEssentials();
  }

  hideLinkedInHomeFeed() {
    const homeFeedSelectors = [
      ".feed-shared-update-v2",
      ".occludable-update",
      ".feed-shared-news-article",
      ".feed-shared-article",
      ".feed-shared-video",
      ".feed-shared-celebration-update",
      ".feed-shared-job-update",
      ".feed-shared-company-update",
      '[data-urn*="urn:li:activity"]',
    ];

    homeFeedSelectors.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((element) => {
        if (!this.isLinkedInEssential(element)) {
          element.style.display = "none";
          element.classList.add("feed-blocker-hidden");
        }
      });
    });
  }

  showLinkedInHomeFeed() {
    document.querySelectorAll(".feed-blocker-hidden").forEach((element) => {
      if (
        element.matches(
          '.feed-shared-update-v2, .occludable-update, .feed-shared-news-article, .feed-shared-article, .feed-shared-video, .feed-shared-celebration-update, .feed-shared-job-update, .feed-shared-company-update, [data-urn*="urn:li:activity"]'
        )
      ) {
        element.style.display = "";
        element.classList.remove("feed-blocker-hidden");
      }
    });
  }

  hideLinkedInNewsFeed() {
    const newsSelectors = [
      ".news-module",
      ".ad-banner-container",
      '[data-test-id="news-module"]',
      '[data-test-id="ad-banner"]',
      ".news-outlet",
      ".linkedin-news",
      '[aria-label*="LinkedIn News"]',
      '[aria-label*="Today\'s news and views"]',
    ];

    newsSelectors.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((element) => {
        element.style.display = "none";
        element.classList.add("feed-blocker-hidden");
      });
    });

    // Hide news sections in sidebar
    const sidebar = document.querySelector(".scaffold-layout__sidebar");
    if (sidebar) {
      const sections = sidebar.querySelectorAll("section, .artdeco-card");
      sections.forEach((section) => {
        if (
          this.isLinkedInNewsSection(section) &&
          !this.isLinkedInProfileSection(section)
        ) {
          section.style.display = "none";
          section.classList.add("feed-blocker-hidden");
        }
      });
    }
  }

  showLinkedInNewsFeed() {
    document.querySelectorAll(".feed-blocker-hidden").forEach((element) => {
      if (
        element.matches(
          '.news-module, .ad-banner-container, [data-test-id="news-module"], [data-test-id="ad-banner"], .news-outlet, .linkedin-news, [aria-label*="LinkedIn News"], [aria-label*="Today\'s news and views"]'
        )
      ) {
        element.style.display = "";
        element.classList.remove("feed-blocker-hidden");
      }
    });
  }

  isLinkedInNewsSection(section) {
    const sectionText = section.textContent || "";
    const newsKeywords = [
      "LinkedIn News",
      "Today's news",
      "Trending",
      "Get the latest",
      "See more news",
      "Breaking",
      "Industry news",
    ];
    return newsKeywords.some((keyword) =>
      sectionText.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  isLinkedInProfileSection(section) {
    const profileIndicators = [
      ".identity-outlet",
      ".feed-identity-module",
      ".profile-card",
      '[data-test-id*="profile"]',
      '[data-test-id*="identity"]',
    ];
    return profileIndicators.some(
      (selector) => section.querySelector(selector) || section.matches(selector)
    );
  }

  isLinkedInEssential(element) {
    const essentialSelectors = [
      ".share-creation-state",
      ".share-box-feed-entry",
      ".share-box",
      '[data-test-id="share-box"]',
      ".global-nav",
      ".scaffold-layout__header",
      ".identity-outlet",
      ".feed-identity-module",
    ];
    return essentialSelectors.some(
      (selector) =>
        element.querySelector(selector) ||
        element.matches(selector) ||
        element.closest(selector)
    );
  }

  preserveLinkedInEssentials() {
    const essentialSelectors = [
      ".share-creation-state",
      ".share-box-feed-entry",
      ".artdeco-card.share-creation-state",
      ".share-box",
      '[data-test-id="share-box"]',
      ".global-nav",
      ".scaffold-layout__header",
      ".identity-outlet",
      ".feed-identity-module",
    ];
    essentialSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.style.display = "";
        element.classList.remove("feed-blocker-hidden");
      });
    });
  }

  // YOUTUBE BLOCKING
  applyYouTubeBlocking() {
    if (this.settings.youtubeShorts) {
      document.body.classList.add("feed-blocker-youtube-shorts");
      this.hideYouTubeShorts();
    }

    if (this.settings.youtubeHomeFeed) {
      document.body.classList.add("feed-blocker-youtube-home");
      this.hideYouTubeHomeFeed();
    }

    if (this.settings.youtubeSidebar) {
      document.body.classList.add("feed-blocker-youtube-sidebar");
      this.hideYouTubeSidebar();
    }

    if (this.settings.youtubeEndScreen) {
      document.body.classList.add("feed-blocker-youtube-endscreen");
      this.hideYouTubeEndScreen();
    }

    if (this.settings.youtubeComments) {
      document.body.classList.add("feed-blocker-youtube-comments");
      this.hideYouTubeComments();
    }
  }

  hideYouTubeShorts() {
    const shortsSelectors = [
      "ytd-reel-shelf-renderer",
      "ytd-rich-shelf-renderer[is-shorts]",
      '[aria-label*="Shorts"]',
      'a[href*="/shorts/"]',
      "#shorts-container",
      ".ytd-reel-shelf-renderer",
    ];

    shortsSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.style.display = "none";
        element.classList.add("feed-blocker-hidden");
      });
    });
  }

  hideYouTubeHomeFeed() {
    const homeFeedSelectors = [
      "ytd-rich-item-renderer",
      "ytd-video-renderer",
      "#contents.ytd-rich-grid-renderer ytd-rich-item-renderer",
      '.ytd-browse[page-subtype="home"] #contents ytd-rich-item-renderer',
    ];

    homeFeedSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.style.display = "none";
        element.classList.add("feed-blocker-hidden");
      });
    });
  }

  hideYouTubeSidebar() {
    const sidebarSelectors = [
      "#related",
      ".watch-sidebar",
      "ytd-watch-next-secondary-results-renderer",
      "#secondary",
    ];

    sidebarSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.style.display = "none";
        element.classList.add("feed-blocker-hidden");
      });
    });
  }

  hideYouTubeEndScreen() {
    const endScreenSelectors = [
      ".ytp-endscreen-content",
      ".ytp-ce-element",
      ".ytp-cards-button",
      "ytd-compact-autoplay-renderer",
    ];

    endScreenSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.style.display = "none";
        element.classList.add("feed-blocker-hidden");
      });
    });
  }

  hideYouTubeComments() {
    const commentSelectors = [
      "#comments",
      "ytd-comments",
      "#comment-teaser",
      "ytd-comment-thread-renderer",
    ];

    commentSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.style.display = "none";
        element.classList.add("feed-blocker-hidden");
      });
    });
  }

  // TWITTER/X BLOCKING
  applyTwitterBlocking() {
    if (this.settings.twitterForYou) {
      document.body.classList.add("feed-blocker-twitter-foryou");
      this.hideTwitterForYou();
    }

    if (this.settings.twitterTrending) {
      document.body.classList.add("feed-blocker-twitter-trending");
      this.hideTwitterTrending();
    }

    if (this.settings.twitterSuggested) {
      document.body.classList.add("feed-blocker-twitter-suggested");
      this.hideTwitterSuggested();
    }

    if (this.settings.twitterSidebar) {
      document.body.classList.add("feed-blocker-twitter-sidebar");
      this.hideTwitterSidebar();
    }

    if (this.settings.twitterMedia) {
      document.body.classList.add("feed-blocker-twitter-media");
      this.hideTwitterMedia();
    }
  }

  hideTwitterForYou() {
    const forYouSelectors = [
      '[data-testid="primaryColumn"] section[role="region"]',
      '[aria-label="Timeline: Your Home Timeline"]',
      '[data-testid="tweet"]',
      'article[data-testid="tweet"]',
    ];

    forYouSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        if (
          !element.querySelector('[data-testid="compose"]') &&
          !element.closest('[data-testid="compose"]')
        ) {
          element.style.display = "none";
          element.classList.add("feed-blocker-hidden");
        }
      });
    });
  }

  hideTwitterTrending() {
    const trendingSelectors = [
      '[data-testid="trend"]',
      '[aria-label*="Trending"]',
      '[data-testid="sidebarColumn"] section:has([data-testid="trend"])',
      '.r-1h8ys4a:has([data-testid="trend"])',
    ];

    trendingSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.style.display = "none";
        element.classList.add("feed-blocker-hidden");
      });
    });
  }

  hideTwitterSuggested() {
    const suggestedSelectors = [
      '[data-testid="UserCell"]',
      '[data-testid="sidebarColumn"] section:has([data-testid="UserCell"])',
      '[aria-label*="Who to follow"]',
    ];

    suggestedSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.style.display = "none";
        element.classList.add("feed-blocker-hidden");
      });
    });
  }

  hideTwitterSidebar() {
    const sidebarSelectors = [
      '[data-testid="sidebarColumn"] > div > div > div:not(:first-child)',
      ".r-1h8ys4a .r-1kbdv8c",
    ];

    sidebarSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        if (!element.querySelector('[data-testid="searchbox"]')) {
          element.style.display = "none";
          element.classList.add("feed-blocker-hidden");
        }
      });
    });
  }

  hideTwitterMedia() {
    const mediaSelectors = [
      '[data-testid="tweet"] [data-testid="tweetPhoto"]',
      '[data-testid="tweet"] [data-testid="videoPlayer"]',
      '[data-testid="tweet"] [data-testid="card.wrapper"]',
    ];

    mediaSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.style.display = "none";
        element.classList.add("feed-blocker-hidden");
      });
    });
  }

  // REDDIT BLOCKING
  applyRedditBlocking() {
    if (this.settings.redditFeed) {
      document.body.classList.add("feed-blocker-reddit-feed");
      this.hideRedditFeed();
    }

    if (this.settings.redditComments) {
      document.body.classList.add("feed-blocker-reddit-comments");
      this.hideRedditComments();
    }
  }

  hideRedditFeed() {
    const feedSelectors = [
      ".Post",
      '[data-testid="post-container"]',
      ".thing",
      ".entry",
      "shreddit-post",
      'article[data-testid="post-container"]',
      ".scrollerItem",
    ];

    feedSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.style.display = "none";
        element.classList.add("feed-blocker-hidden");
      });
    });
  }

  hideRedditComments() {
    const commentSelectors = [
      ".Comment",
      ".comment",
      ".commentarea",
      '[data-testid="comment"]',
      "shreddit-comment",
      ".entry .usertext",
      "#siteTable .comment",
    ];

    commentSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.style.display = "none";
        element.classList.add("feed-blocker-hidden");
      });
    });
  }

  // INSTAGRAM BLOCKING
  applyInstagramBlocking() {
    if (this.settings.instagramReels) {
      document.body.classList.add("feed-blocker-instagram-reels");
      this.hideInstagramReels();
    }

    if (this.settings.instagramExplore) {
      document.body.classList.add("feed-blocker-instagram-explore");
      this.hideInstagramExplore();
    }

    if (this.settings.instagramSuggested) {
      document.body.classList.add("feed-blocker-instagram-suggested");
      this.hideInstagramSuggestedPosts();
    }

    if (this.settings.instagramSuggestedReels) {
      document.body.classList.add("feed-blocker-instagram-suggested-reels");
      this.hideInstagramSuggestedReels();
    }

    if (this.settings.instagramFollowCounts) {
      document.body.classList.add("feed-blocker-instagram-counts");
      this.hideInstagramFollowCounts();
    }
  }

  hideInstagramReels() {
    const reelsSelectors = [
      'a[href*="/reels/"]',
      '[aria-label*="Reels"]',
      'section[data-testid="xdt-reels-viewer"]',
      ".reels-tab",
    ];

    reelsSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.style.display = "none";
        element.classList.add("feed-blocker-hidden");
      });
    });
  }

  hideInstagramExplore() {
    const exploreSelectors = [
      'a[href="/explore/"]',
      '[aria-label*="Explore"]',
      'main[role="main"] article',
      "section article",
    ];

    if (window.location.pathname === "/explore/") {
      exploreSelectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((element) => {
          element.style.display = "none";
          element.classList.add("feed-blocker-hidden");
        });
      });
    }
  }

  hideInstagramSuggestedPosts() {
    const suggestedSelectors = [
      'article:has([data-testid="suggested-post-label"])',
      'div:has(span:contains("Suggested for you"))',
      ".suggested-post",
    ];

    suggestedSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.style.display = "none";
        element.classList.add("feed-blocker-hidden");
      });
    });
  }

  hideInstagramSuggestedReels() {
    const suggestedReelsSelectors = [
      'div:has(span:contains("Suggested reels"))',
      ".suggested-reels",
    ];

    suggestedReelsSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.style.display = "none";
        element.classList.add("feed-blocker-hidden");
      });
    });
  }

  hideInstagramFollowCounts() {
    const countSelectors = [
      'a[href*="/followers/"]',
      'a[href*="/following/"]',
      'span:contains("followers")',
      'span:contains("following")',
    ];

    countSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.style.visibility = "hidden";
        element.classList.add("feed-blocker-hidden");
      });
    });
  }

  observeChanges() {
    const observer = new MutationObserver((mutations) => {
      let shouldReapply = false;

      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check for new content based on current site
            const contentSelectors = {
              linkedin: [
                ".feed-shared-update-v2",
                ".occludable-update",
                ".news-module",
              ],
              youtube: [
                "ytd-rich-item-renderer",
                "ytd-reel-shelf-renderer",
                "#related",
              ],
              twitter: [
                '[data-testid="tweet"]',
                '[data-testid="trend"]',
                '[data-testid="UserCell"]',
              ],
              reddit: [".Post", '[data-testid="post-container"]', ".Comment"],
              instagram: ["article", 'a[href*="/reels/"]'],
            };

            const selectors = contentSelectors[this.currentSite] || [];

            if (
              node.matches &&
              selectors.some(
                (selector) =>
                  node.matches(selector) || node.querySelector(selector)
              )
            ) {
              shouldReapply = true;
            }
          }
        });
      });

      if (shouldReapply) {
        setTimeout(() => this.applyCurrentState(), 100);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // Method to show all hidden elements (for toggling back)
  showAllHidden() {
    document.querySelectorAll(".feed-blocker-hidden").forEach((element) => {
      element.style.display = "";
      element.style.visibility = "";
      element.classList.remove("feed-blocker-hidden");
    });
  }
}

// Initialize the social media feed blocker
console.log("Attempting to initialize Social Media Feed Blocker...");
console.log("Current hostname:", window.location.hostname);
console.log("Current URL:", window.location.href);

try {
  const socialMediaFeedBlocker = new SocialMediaFeedBlocker();
  console.log("Social Media Feed Blocker initialized successfully");
} catch (error) {
  console.error("Error initializing Social Media Feed Blocker:", error);
}
