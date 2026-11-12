// Win Log website: download buttons and GitHub links.
//
// 1. Works out whether the visitor uses a Mac, Windows or something else
//    (Linux, a phone, a tablet) and sets <html data-os="mac|windows|other">.
//    style.css uses that to show the right download button first.
// 2. Builds every GitHub link on the page from config.js.
// 3. Asks the GitHub API once for the latest release. Each download button then
//    points straight at its file, and the version number is shown.
// 4. Opens a FAQ answer when a link (or the address bar) points at it.
//
// If anything goes wrong (JavaScript off, offline, rate limit, no release yet,
// a file missing from the release), each button keeps its link to the Releases
// page. Every step is guarded, so this file never throws.
//
// It is loaded in <head> on purpose: step 1 runs before the page is first
// drawn, so the buttons do not jump around.

(function () {
  'use strict';

  const API_TIMEOUT_MS = 6000;

  // Release files are found by the end of their name, for example
  // Win-Log-1.0.0-mac.dmg and Win-Log-1.0.0-windows-setup.exe.
  const ASSET_SUFFIXES = { mac: '-mac.dmg', windows: '-windows-setup.exe' };

  // Paths after https://github.com/<owner>/<repo>, by data-gh value.
  const LINK_PATHS = {
    repo: '',
    releases: '/releases',
    latest: '/releases/latest',
    issues: '/issues',
    license: '/blob/{branch}/LICENSE',
    privacy: '/blob/{branch}/PRIVACY.md',
  };

  // Runs fn and returns its result. Errors are logged, never thrown.
  function safely(fn, fallback) {
    try {
      return fn();
    } catch (err) {
      if (window.console && console.warn) console.warn('Win Log website:', err);
      return fallback;
    }
  }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function eachElement(selector, fn) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), fn);
  }

  // ---------------------------------------------------------------------------
  // 1. Which kind of computer is this?

  function detectOS() {
    const nav = window.navigator || {};

    // User-Agent Client Hints first (Chrome, Edge and other Chromium browsers).
    const hints = nav.userAgentData;
    const hinted = hints && typeof hints.platform === 'string' ? hints.platform.toLowerCase() : '';
    if (hinted) {
      if (hints.mobile) return 'other';
      if (hinted === 'macos') return 'mac';
      if (hinted === 'windows') return 'windows';
      return 'other'; // Linux, Chrome OS, Android and so on
    }

    // Then the user agent string and navigator.platform (Safari, Firefox).
    const ua = String(nav.userAgent || '');
    const platform = String(nav.platform || '');
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return 'other';
    if (/^Win/i.test(platform) || /Windows NT/i.test(ua)) return 'windows';
    if (/^Mac/i.test(platform) || /Macintosh|Mac OS X/i.test(ua)) {
      // iPads ask for desktop pages and then say they are a Mac.
      // Macs have no touch screen, iPads do.
      return nav.maxTouchPoints > 1 ? 'other' : 'mac';
    }
    return 'other';
  }

  // ---------------------------------------------------------------------------
  // 2. GitHub links, built from config.js

  function readSite() {
    const site = window.WINLOG_SITE;
    if (!site || typeof site !== 'object') return null;
    const owner = String(site.owner || '');
    const repo = String(site.repo || '');
    const branch = String(site.branch || 'main');
    // Only plain GitHub names, so they are safe to put in a URL as they are.
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner)) return null;
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(repo)) return null;
    if (!/^[A-Za-z0-9._/-]{1,100}$/.test(branch)) return null;
    return { owner: owner, repo: repo, branch: branch };
  }

  function githubUrl(site, key) {
    const tail = LINK_PATHS[key].replace('{branch}', site.branch);
    return 'https://github.com/' + site.owner + '/' + site.repo + tail;
  }

  function fillLinks(site) {
    eachElement('a[data-gh]', function (link) {
      const key = link.getAttribute('data-gh');
      if (Object.prototype.hasOwnProperty.call(LINK_PATHS, key)) link.href = githubUrl(site, key);
    });
    // Until the API answers, the download buttons go to the latest release page.
    eachElement('a[data-download]', function (link) {
      link.href = githubUrl(site, 'latest');
    });
  }

  // ---------------------------------------------------------------------------
  // 3. The latest release from the GitHub API

  // Resolves with the release object. Rejects on any failure, including a
  // timeout, "no release yet" (404) and rate limits (403 or 429).
  function fetchLatestRelease(site) {
    return new Promise(function (resolve, reject) {
      if (typeof window.fetch !== 'function') {
        reject(new Error('This browser cannot fetch'));
        return;
      }
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = setTimeout(function () {
        if (controller) controller.abort();
        reject(new Error('GitHub did not answer in time'));
      }, API_TIMEOUT_MS);

      const url = 'https://api.github.com/repos/' + site.owner + '/' + site.repo + '/releases/latest';
      Promise.resolve()
        .then(function () {
          return window.fetch(url, {
            headers: { Accept: 'application/vnd.github+json' },
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            signal: controller ? controller.signal : undefined,
          });
        })
        .then(function (response) {
          if (!response.ok) throw new Error('GitHub answered ' + response.status);
          return response.json();
        })
        .then(
          function (release) {
            clearTimeout(timer);
            resolve(release);
          },
          function (err) {
            clearTimeout(timer);
            reject(err);
          }
        );
    });
  }

  // Accepts only https://github.com/<owner>/<repo>/releases/download/... links:
  // files from this project's own releases, nothing else.
  function safeDownloadUrl(site, value) {
    if (typeof value !== 'string') return '';
    try {
      const url = new URL(value);
      const prefix = ('/' + site.owner + '/' + site.repo + '/releases/download/').toLowerCase();
      if (
        url.protocol === 'https:' &&
        url.hostname === 'github.com' &&
        url.pathname.toLowerCase().indexOf(prefix) === 0
      ) {
        return url.href;
      }
    } catch (err) {
      // Not a URL.
    }
    return '';
  }

  function findDownloadUrl(site, assets, suffix) {
    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      if (!asset || typeof asset.name !== 'string') continue;
      const name = asset.name.toLowerCase();
      if (name.length <= suffix.length || name.slice(-suffix.length) !== suffix) continue;
      if (asset.state && asset.state !== 'uploaded') continue; // still uploading
      const url = safeDownloadUrl(site, asset.browser_download_url);
      if (url) return url;
    }
    return '';
  }

  function versionFromTag(tag) {
    if (typeof tag !== 'string') return '';
    const match = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag.trim());
    return match ? match[1] : '';
  }

  function applyRelease(site, release) {
    if (!release || typeof release !== 'object') return;
    const assets = Array.isArray(release.assets) ? release.assets : [];

    Object.keys(ASSET_SUFFIXES).forEach(function (os) {
      const url = findDownloadUrl(site, assets, ASSET_SUFFIXES[os]);
      if (!url) return; // this button keeps its link to the Releases page
      eachElement('a[data-download="' + os + '"]', function (link) {
        link.href = url;
      });
    });

    const version = versionFromTag(release.tag_name);
    const label = document.getElementById('latest-version');
    if (version && label) {
      label.textContent = 'Version ' + version;
      label.hidden = false;
    }
  }

  // ---------------------------------------------------------------------------
  // 4. FAQ answers are <details> elements. Open one when a link points at it.

  function openDetailsFor(hash) {
    if (typeof hash !== 'string' || hash.charAt(0) !== '#' || hash.length < 2) return;
    let id;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch (err) {
      return;
    }
    const target = document.getElementById(id);
    if (target && target.tagName === 'DETAILS') target.open = true;
  }

  // ---------------------------------------------------------------------------
  // Start

  const os = safely(detectOS, 'other');
  safely(function () {
    document.documentElement.setAttribute('data-os', os);
  });

  const site = safely(readSite, null);

  // Start the request now, while the page is still loading. Its result is used
  // once the page is ready. The empty catch marks a failure as handled.
  const releaseRequest =
    site && typeof Promise === 'function' ? safely(function () { return fetchLatestRelease(site); }, null) : null;
  if (releaseRequest) releaseRequest.catch(function () {});

  onReady(function () {
    if (site) safely(function () { fillLinks(site); });

    if (releaseRequest) {
      releaseRequest
        .then(function (release) {
          safely(function () { applyRelease(site, release); });
        })
        .catch(function () {
          // Offline, rate limited, no release yet or a timeout: the buttons
          // keep their links to the Releases page.
        });
    }

    safely(function () {
      openDetailsFor(window.location.hash);
      window.addEventListener('hashchange', function () {
        safely(function () { openDetailsFor(window.location.hash); });
      });
      document.addEventListener('click', function (event) {
        safely(function () {
          const start = event.target;
          const link = start && start.closest ? start.closest('a[href^="#"]') : null;
          if (link) openDetailsFor(link.getAttribute('href'));
        });
      });
    });
  });
})();
