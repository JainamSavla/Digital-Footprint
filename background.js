function isValidURL(givenURL){
  if(givenURL){
    if(givenURL.includes(".")){
      return true;
    }
    else{
      return false;
    }
  }
  else{
    return false;
  }
}

function secondsToString(seconds,compressed=false){
    let hours = parseInt(seconds/3600);
    seconds = seconds%3600;
    let minutes= parseInt(seconds/60);
    seconds = seconds%60;
    let timeString = "";
    if(hours){
      timeString += hours + " hrs ";
    }
    if(minutes){
      timeString += minutes + " min ";
    }
    if(seconds){
      timeString += seconds+ " sec ";
    }
    if(!compressed){
      return timeString;
    }
    else{
      if(hours){
        return(`${hours}h`);
      }
      if(minutes){
        return(`${minutes}m`);
      }
      if(seconds){
        return(`${seconds}s`);
      }
    }
};

function getDateString(nDate){
  let nDateDate=nDate.getDate();
  let nDateMonth=nDate.getMonth()+1;
  let nDateYear=nDate.getFullYear();
  if(nDateDate<10){nDateDate="0"+nDateDate;};
  if(nDateMonth<10){nDateMonth="0"+nDateMonth;};
  let presentDate = nDateYear+"-"+nDateMonth+"-"+nDateDate;
  return presentDate;
}

function getDomain(tablink){
  if(tablink){
    let url =  tablink[0].url;
    return url.split("/")[2];
  }
  else{
    return null;
  }
};

// Enhanced function to normalize domain names for consistent matching
function normalizeDomain(domain) {
  if (!domain) return null;
  return domain.toLowerCase().replace(/^www\./i, "");
}

// Enhanced function to check if domains match
function domainsMatch(domain1, domain2) {
  const normalized1 = normalizeDomain(domain1);
  const normalized2 = normalizeDomain(domain2);
  
  return normalized1 === normalized2 || 
         normalized1.endsWith("." + normalized2) ||
         normalized2.endsWith("." + normalized1) ||
         normalized1.includes(normalized2) ||
         normalized2.includes(normalized1);
}

function updateTime(){
    chrome.tabs.query({"active":true,"lastFocusedWindow": true},function(activeTab){
        let domain = getDomain(activeTab);
        if(isValidURL(domain)){
          let today = new Date();
          let presentDate = getDateString(today);
          
          // First get time limits to check against
          chrome.storage.sync.get("websiteTimeLimits", function(limitData) {
            const websiteTimeLimits = limitData.websiteTimeLimits || {};
            
            chrome.storage.local.get(presentDate, function(storedObject){
              if(!storedObject[presentDate]) {
                storedObject[presentDate] = {};
              }
              
              // Find matching time-limited site
              let matchingTimeLimitSite = null;
              for (const site in websiteTimeLimits) {
                if (domainsMatch(domain, site)) {
                  matchingTimeLimitSite = site;
                  break;
                }
              }
              
              // Use the matching site key or the original domain for consistent tracking
              const storageKey = matchingTimeLimitSite || domain;
              
              // Get current time and update
              let timeSoFar = 0;
              if(storedObject[presentDate][storageKey]){
                timeSoFar = storedObject[presentDate][storageKey] + 1;
              } else {
                timeSoFar = 1;
              }
              
              // Update stored time
              storedObject[presentDate][storageKey] = timeSoFar;
              
              // Check if there's a time limit for this domain
              const timeLimit = matchingTimeLimitSite ? websiteTimeLimits[matchingTimeLimitSite] : null;
              
              console.log(`Domain: ${domain}, Storage key: ${storageKey}, Time used: ${timeSoFar}s, Limit: ${timeLimit}s`);
              
              // Store the updated time
              chrome.storage.local.set(storedObject, function(){
                try {
                  // Set badge with current time
                  const badgeText = secondsToString(timeSoFar, true);
                  chrome.action.setBadgeText({text: badgeText});
                  
                  // Check if time limit is reached
                  if (timeLimit && timeSoFar >= timeLimit) {
                    console.log(`⚠️ TIME LIMIT REACHED for ${domain}: ${timeSoFar}/${timeLimit}s`);
                    chrome.action.setBadgeBackgroundColor({color: '#d32f2f'});
                    
                    // Only reload if we're on the limited site
                    if(activeTab && activeTab.length > 0 && activeTab[0].url && 
                       activeTab[0].url.includes(domain)) {
                      
                      // Don't reload repeatedly - check if the site was just blocked
                      if (!activeTab[0].url.includes('access-blocked')) {
                        chrome.tabs.update(activeTab[0].id, {
                          url: chrome.runtime.getURL('blocked.html') + 
                               '?site=' + encodeURIComponent(domain) + 
                               '&reason=timelimit' +
                               '&used=' + timeSoFar +
                               '&limit=' + timeLimit
                        });
                      }
                    }
                  } else {
                    chrome.action.setBadgeBackgroundColor({color: '#1976d2'});
                  }
                } catch (error) {
                  console.error("Error updating badge:", error);
                }
              });
            });
          });
        } else {
          try {
            chrome.action.setBadgeText({text: ''});
          } catch (error) {
            console.error("Error clearing badge:", error);
          }
        }
    });
};

var intervalID;

intervalID = setInterval(updateTime,1000);
setInterval(checkFocus,500)

function checkFocus(){
  chrome.windows.getCurrent(function(window){
    if(window.focused){
      if(!intervalID){
        intervalID = setInterval(updateTime,1000);
      }
    }
    else{
      if(intervalID){
        clearInterval(intervalID);
        intervalID=null;
      }
    }
  });
}

// Enhanced function to check if a URL should be blocked
function isURLBlocked(url, blockedSites, timeLimits, todayUsage) {
  if (!url) return { blocked: false };
  
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const normalizedHostname = hostname.replace(/^www\./i, "");
    
    console.log(`Checking URL: ${url}, hostname: ${normalizedHostname}`);
    
    // First check permanent blocks
    if (blockedSites && blockedSites.length > 0) {
      for (let site of blockedSites) {
        if (domainsMatch(normalizedHostname, site)) {
          console.log(`Permanently blocked: ${site} matches ${normalizedHostname}`);
          return { blocked: true, reason: "permanent", site: site };
        }
      }
    }
    
    // Then check time-limited sites
    if (timeLimits && todayUsage) {
      for (let site in timeLimits) {
        if (domainsMatch(normalizedHostname, site)) {
          const timeLimit = timeLimits[site];
          const timeUsed = todayUsage[site] || 0;
          
          console.log(`Time limit check for ${site}: ${timeUsed}/${timeLimit} seconds used`);
          
          if (timeUsed >= timeLimit) {
            console.log(`Time limit exceeded: ${site}`);
            return { blocked: true, reason: "timelimit", site: site, used: timeUsed, limit: timeLimit };
          }
        }
      }
    }
  } catch (e) {
    console.error("Error parsing URL:", url, e);
  }
  
  return { blocked: false };
}

// Listen for tab updates to block navigation to blocked sites
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'loading' && tab.url) {
    // Skip checking our own block page
    if (tab.url.includes(chrome.runtime.getURL('blocked.html'))) {
      return;
    }
    
    const today = getDateString(new Date());
    
    chrome.storage.sync.get(["blockedWebsitesArray", "websiteTimeLimits"], function(data) {
      const blockedSites = data.blockedWebsitesArray || [];
      const timeLimits = data.websiteTimeLimits || {};
      
      chrome.storage.local.get(today, function(todayData) {
        const todayUsage = todayData[today] || {};
        const blockResult = isURLBlocked(tab.url, blockedSites, timeLimits, todayUsage);
        
        if (blockResult.blocked) {
          console.log("Blocking navigation to:", tab.url, "Reason:", blockResult.reason);
          
          // Redirect to our block page instead of injecting script
          chrome.tabs.update(tabId, {
            url: chrome.runtime.getURL('blocked.html') + 
                 '?site=' + encodeURIComponent(blockResult.site) + 
                 '&reason=' + blockResult.reason +
                 (blockResult.used ? '&used=' + blockResult.used : '') +
                 (blockResult.limit ? '&limit=' + blockResult.limit : '')
          });
        }
      });
    });
  }
});

// Listen for storage changes to update blocking in real-time
chrome.storage.onChanged.addListener(function(changes, namespace) {
  if ((changes.blockedWebsitesArray || changes.websiteTimeLimits) && namespace === 'sync') {
    console.log('Block list or time limits updated');
    
    // Check all open tabs to apply changes immediately
    chrome.tabs.query({}, function(tabs) {
      const today = getDateString(new Date());
      
      chrome.storage.sync.get(["blockedWebsitesArray", "websiteTimeLimits"], function(data) {
        const blockedSites = data.blockedWebsitesArray || [];
        const timeLimits = data.websiteTimeLimits || {};
        
        chrome.storage.local.get(today, function(todayData) {
          const todayUsage = todayData[today] || {};
          
          for (let tab of tabs) {
            if (tab.url && tab.url.startsWith('http')) {
              const blockResult = isURLBlocked(tab.url, blockedSites, timeLimits, todayUsage);
              
              if (blockResult.blocked) {
                // Force reload to apply blocking
                chrome.tabs.reload(tab.id);
              }
            }
          }
        });
      });
    });
  }
});