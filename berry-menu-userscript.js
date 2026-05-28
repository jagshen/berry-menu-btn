// ==UserScript==
// @name         Berry 极简主页
// @namespace    berrybrowser
// @version      2.0.1
// @description  为 BerryBrowser 提供多彩主页风格切换、悬浮快捷菜单
// @license      MIT
// @author       jagshen
// @match        <all_urls>
// @include      *
// @exclude      about:*
// @exclude      chrome://*
// @run-at       document_end
// @inject-into  page
// @grant        GM_xmlhttpRequest
// @connect      cdn.jsdelivr.net
// ==/UserScript==

(function () {
  'use strict';

  var _DEBUG = false;

  /* ========== 页面上下文桥接 ========== */
  var _page = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  var _doc = document;

  // 防止重复注入
  if (_page.__berryMenuLoaded) return;
  _page.__berryMenuLoaded = true;

  /* ========== 浏览器环境检测 ========== */
  var _isBerry = !!(typeof _page.BerryBrowser !== 'undefined' || _page._berry_homepage);

  /* ========== 存储层（仅 BerryBrowser 原生存储） ========== */
  function storageGet(key, defaultVal) {
    try {
      if (typeof _page.BerryBrowser !== 'undefined' && _page.BerryBrowser.homeStorageGet) {
        var v = _page.BerryBrowser.homeStorageGet(key);
        if (v !== null && v !== undefined && v !== '') return v;
      }
    } catch (e) {}
    return defaultVal || null;
  }

  function storageSet(key, val) {
    try {
      if (typeof _page.BerryBrowser !== 'undefined' && _page.BerryBrowser.homeStorageSet) {
        _page.BerryBrowser.homeStorageSet(key, val);
      }
    } catch (e) {}
  }

  /* ========== 统一导航 ========== */
  function navigateTo(url) {
    if (_isBerry) {
      try { location.href = 'berry://navigate?url=' + encodeURIComponent(url); return; } catch (e) {}
    }
    try { location.href = url; } catch (e) { window.open(url, '_blank'); }
  }

  /* ========== 页面上下文检测 ========== */
  function isHomePage() {
    var href = (location && location.href) || '';
    return href.indexOf('resource://rawfile/home.html') !== -1;
  }

  /* ========== 暴露全局桥接对象 ========== */
  _page.__berryMenu = {
    config: {
      isBerry: _isBerry,
      isHome: isHomePage()
    },
    api: {
      storageGet: storageGet,
      storageSet: storageSet,
      navigateTo: navigateTo
    }
  };

/* ========== 远端 JS 加载器（支持 fetch / GM_xmlhttpRequest / script 标签） ========== */
var REMOTE_JS_URL = 'https://cdn.jsdelivr.net/gh/jagshen/berry-menu-btn@master/berry-menu-remote.js';

// 方式1：fetch
function loadWithFetch() {
  return fetch(REMOTE_JS_URL, { cache: 'no-store' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    })
    .then(function (code) {
      eval(code);
      if (_DEBUG) console.log('[berry-loader] loaded via fetch');
    });
}

// 方式2：GM_xmlhttpRequest
function loadWithGM() {
  return new Promise(function (resolve, reject) {
    if (typeof GM_xmlhttpRequest === 'undefined') {
      reject(new Error('GM_xmlhttpRequest not available'));
      return;
    }
    GM_xmlhttpRequest({
      method: 'GET',
      url: REMOTE_JS_URL,
      onload: function (resp) {
        if (resp.status >= 200 && resp.status < 300) {
          try {
            eval(resp.responseText);
            if (_DEBUG) console.log('[berry-loader] loaded via GM_xmlhttpRequest');
            resolve();
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error('GM_xmlhttpRequest HTTP ' + resp.status));
        }
      },
      onerror: function (err) {
        reject(err);
      }
    });
  });
}

// 方式3：script 标签（最终 fallback）
function loadWithScriptTag() {
  return new Promise(function (resolve, reject) {
    var script = _doc.createElement('script');
    script.src = REMOTE_JS_URL;
    script.onload = function () {
      if (_DEBUG) console.log('[berry-loader] loaded via script tag');
      resolve();
    };
    script.onerror = function (err) {
      console.warn('[berry-loader] script tag also blocked');
      reject(err);
    };
    (_doc.head || _doc.documentElement).appendChild(script);
  });
}

function loadRemoteJS() {
  // 优先 fetch → 失败则 GM → 再失败则 script 标签
  loadWithFetch()
    .catch(function (err) {
      console.warn('[berry-loader] fetch failed:', err);
      return loadWithGM();
    })
    .catch(function (err) {
      console.warn('[berry-loader] GM_xmlhttpRequest failed:', err);
      return loadWithScriptTag();
    })
    .catch(function (err) {
      console.error('[berry-loader] all loading methods failed:', err);
    });
}

  /* ========== 入口逻辑 ========== */
  function init() {
    var isHome = isHomePage();
    // 更新 config（tryInit 可能延迟执行，重新检测）
    _page.__berryMenu.config.isHome = isHome;

    if (_DEBUG) console.log('[berry-loader] init: isHome=' + isHome + ' isBerry=' + _isBerry + ' url=' + location.href);

    // 加载远端核心逻辑
    loadRemoteJS();
  }

  /* ========== 启动（含重试机制，防BerryBrowser对象尚未注入时丢失） ========== */
  function tryInit() {
    var isHome = isHomePage();
    if (isHome) {
      init();
      return;
    }

    // 非主页：检测BerryBrowser是否已就绪
    var hasBerry = (typeof _page.BerryBrowser !== 'undefined' && _page.BerryBrowser.homeStorageGet);

    if (hasBerry) {
      // 重新检测并更新 isBerry
      _page.__berryMenu.config.isBerry = true;
      init();
    } else {
      // BerryBrowser可能还没注入，延迟重试
      var retryCount = 0;
      var maxRetries = 10; // 最多等2秒
      var retryTimer = setInterval(function () {
        retryCount++;
        var ready = (typeof _page.BerryBrowser !== 'undefined' && _page.BerryBrowser.homeStorageGet);
        if (ready) {
          _page.__berryMenu.config.isBerry = true;
        }
        if (ready || retryCount >= maxRetries) {
          clearInterval(retryTimer);
          init();
        }
      }, 200);
    }
  }

  if (_doc.readyState === 'loading') {
    _doc.addEventListener('DOMContentLoaded', tryInit);
  } else {
    if (typeof requestAnimationFrame !== 'undefined') { requestAnimationFrame(tryInit); } else { tryInit(); }
  }

})();
