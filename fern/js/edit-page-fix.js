// Temporary fix: Redirect edit links from dist/ to src/
// TODO: Remove this when we eliminate the dist/src build process
(function() {
  function fixEditLinks() {
    const editLinks = document.querySelectorAll('a[href*="github.com"][href*="/edit/"]');
    editLinks.forEach(link => {
      if (link.href.includes('/fern/pages/dist/')) {
        link.href = link.href.replace('/fern/pages/dist/', '/fern/pages/src/');
      }
    });
  }

  // Fix links on initial load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixEditLinks);
  } else {
    setTimeout(fixEditLinks, 100);
  }

  // Fix links on navigation (for SPAs)
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(fixEditLinks, 100);
    }
  }).observe(document.body, { childList: true, subtree: true });
})();