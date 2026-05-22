/**
 * Berry Menu Remote - 核心UI逻辑（远程加载版）
 * 依赖 userscript 注入的 window.__berryMenu 全局对象
 * 包含：主页增强 + 悬浮按钮(Shadow DOM) + 域名匹配
 * @version 2.0.4
 */
(function () {
  'use strict';

  var _doc = document;
  var _page = window;

  // 防止重复注入
  if (_page.__berryMenuRemoteLoaded) return;
  _page.__berryMenuRemoteLoaded = true;

  /* ========== 从 userscript 桥接获取 API ========== */
  var bridge = _page.__berryMenu || {};
  var config = bridge.config || {};
  var api = bridge.api || {};

  // 兼容：如果桥接未就绪，自行实现基本功能
  var _isBerry = config.isBerry || !!(typeof _page.BerryBrowser !== 'undefined' || _page._berry_homepage);

  function storageGet(key, defaultVal) {
    if (api.storageGet) return api.storageGet(key, defaultVal);
    // fallback
    try {
      if (typeof _page.BerryBrowser !== 'undefined' && _page.BerryBrowser.homeStorageGet) {
        var v = _page.BerryBrowser.homeStorageGet(key);
        if (v !== null && v !== undefined && v !== '') return v;
      }
    } catch (e) {}
    try {
      var lv = localStorage.getItem(key);
      if (lv !== null && lv !== '') return lv;
    } catch (e) {}
    return defaultVal || null;
  }

  function storageSet(key, val) {
    if (api.storageSet) { api.storageSet(key, val); return; }
    try {
      if (typeof _page.BerryBrowser !== 'undefined' && _page.BerryBrowser.homeStorageSet) {
        _page.BerryBrowser.homeStorageSet(key, val);
      }
    } catch (e) {}
    try { localStorage.setItem(key, val); } catch (e) {}
  }

  function navigateTo(url) {
    if (api.navigateTo) { api.navigateTo(url); return; }
    if (_isBerry) {
      try { location.href = 'berry://navigate?url=' + encodeURIComponent(url); return; } catch (e) {}
    }
    try { location.href = url; } catch (e) { window.open(url, '_blank'); }
  }

  /* ========== 页面上下文检测 ========== */
  function isHomePage() {
    if (config.isHome !== undefined) return config.isHome;
    var href = (location && location.href) || '';
    return href.indexOf('resource://rawfile/home.html') !== -1;
  }

  /* ========== iframe 内嵌模式 ========== */
  var IFRAME_ID = 'berryHomeIframe';

  function loadInIframe(url) {
    var iframe = _doc.getElementById(IFRAME_ID);
    if (!iframe) {
      iframe = _doc.createElement('iframe');
      iframe.id = IFRAME_ID;
      iframe.setAttribute('allowfullscreen', '');
      iframe.setAttribute('allow', 'clipboard-read; clipboard-write');
      iframe.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;border:none;z-index:100;background:#fff';
      _doc.body.appendChild(iframe);
    }
    iframe.src = url;
  }

  function removeIframe() {
    var iframe = _doc.getElementById(IFRAME_ID);
    if (iframe) iframe.remove();
  }

  /* ========== 域名匹配 ========== */

  /** 提取核心域名：去掉协议、路径、www./m./mobile.前缀 */
  function extractCoreDomain(urlOrHost) {
    if (!urlOrHost) return '';
    var host = urlOrHost;
    host = host.replace(/^https?:\/\//i, '');
    host = host.split('/')[0].split('?')[0].split('#')[0];
    host = host.split(':')[0];
    host = host.replace(/^(www\.|m\.|mobile\.|wap\.)/i, '');
    return host.toLowerCase();
  }

  /** 域名匹配：核心域名相同即认为匹配 */
  function domainMatches(url1, url2) {
    var d1 = extractCoreDomain(url1);
    var d2 = extractCoreDomain(url2);
    if (!d1 || !d2) return false;
    return d1 === d2;
  }

  /* ════════════════════════════════════════
     主页场景：通过 BerryHomeMenu API 追加菜单项
     ════════════════════════════════════════ */

  function showHomeToast(msg) {
    var existing = _doc.getElementById('scriptHomeToast');
    if (existing) existing.remove();
    var toast = _doc.createElement('div');
    toast.id = 'scriptHomeToast';
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;z-index:2147483647;pointer-events:none;transition:opacity 0.3s';
    toast.textContent = msg;
    _doc.body.appendChild(toast);
    setTimeout(function () {
      toast.style.opacity = '0';
      setTimeout(function () { if (toast.parentNode) toast.remove(); }, 300);
    }, 1500);
  }

  function _handleCustomUrlApply(menuApi, inputEl) {
    if (!inputEl) return;
    var url = inputEl.value.trim();
    if (!url) { showHomeToast('请输入网址'); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    storageSet('berry_home_custom_url', url);
    storageSet('berry_home_style', 'custom');
    menuApi.hsSet('berry_home_custom_url', url);
    menuApi.hsSet('berry_home_style', 'custom');
    menuApi.selectStyle('custom');
    showHomeToast('设置生效，下次启动[自定义]');
    navigateTo(url);
  }

  function _showCustomUrl(menuApi, defaultValue) {
    _hideCustomUrl();
    injectCustomUrlCSS();

    var sectionEl;
    var extContainer = _doc.getElementById('extMenuItems');
    var switchSection = extContainer ? extContainer.querySelector('.switch-method-section') : null;

    if (extContainer && switchSection) {
      sectionEl = _doc.createElement('div');
      sectionEl.className = 'custom-url-section';
      sectionEl.id = 'scriptCustomUrlSection';
      sectionEl.innerHTML =
        '<input type="url" id="scriptCustomUrlInput" placeholder="https://example.com">' +
        '<button id="scriptCustomUrlApplyBtn">\u524D\u5F80</button>';
      switchSection.parentNode.insertBefore(sectionEl, switchSection);
    } else {
      var html =
        '<div class="custom-url-section" id="scriptCustomUrlSection">' +
        '<input type="url" id="scriptCustomUrlInput" placeholder="https://example.com">' +
        '<button id="scriptCustomUrlApplyBtn">\u524D\u5F80</button>' +
        '</div>';
      sectionEl = menuApi.addSection(html);
      if (!sectionEl) return;
      if (extContainer) {
        var sw = extContainer.querySelector('.switch-method-section');
        if (sw) sw.parentNode.insertBefore(sectionEl, sw);
      }
    }

    var input = sectionEl.querySelector('#scriptCustomUrlInput');
    if (input && defaultValue) input.value = defaultValue;
    var btn = sectionEl.querySelector('#scriptCustomUrlApplyBtn');
    if (btn) {
      btn.addEventListener('click', function () { _handleCustomUrlApply(menuApi, input); });
    }
  }

  function _hideCustomUrl() {
    var el = _doc.getElementById('scriptCustomUrlSection');
    if (el) el.remove();
  }

  function injectCustomUrlCSS() {
    if (_doc.getElementById('_berryCustomUrlCSS')) return;
    var style = _doc.createElement('style');
    style.id = '_berryCustomUrlCSS';
    style.textContent = [
      '.custom-url-section { display: flex; margin-bottom: 8px; gap: 8px; }',
      '.custom-url-section input[type="url"] {',
      '  flex: 1; height: 38px; border-radius: 10px;',
      '  border: 1.5px solid var(--border-color, rgba(0,0,0,0.08));',
      '  background: var(--btn-secondary-bg, rgba(0,0,0,0.04));',
      '  color: var(--text, #1c1c1e); font-size: 13px; padding: 0 10px; outline: none;',
      '}',
      '.custom-url-section input[type="url"]:focus { border-color: var(--slider-color, #0a58f6); }',
      '.custom-url-section button {',
      '  height: 38px; padding: 0 14px; border-radius: 10px; border: none;',
      '  background: var(--slider-color, #0a58f6); color: #fff;',
      '  font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap;',
      '}',
      '.custom-url-section button:active { opacity: 0.8; }'
    ].join('\n');
    _doc.head.appendChild(style);
  }

  function injectSwitchMethodCSS() {
    if (_doc.getElementById('_berrySwitchMethodCSS')) return;
    var style = _doc.createElement('style');
    style.id = '_berrySwitchMethodCSS';
    style.textContent = [
      '.switch-method-section { margin-bottom: 8px; }',
      '.switch-method-label { font-size: 12px; font-weight: 500; margin-bottom: 6px; color: var(--text-sub, #8e8e93); }',
      '.switch-method-list { display: flex; gap: 6px; }',
      '.switch-method-item { flex:1; padding:8px 4px; border-radius:10px; border:1.5px solid var(--border-color, rgba(0,0,0,0.08)); background:var(--btn-secondary-bg, rgba(0,0,0,0.04)); text-align:center; cursor:pointer; transition:all 0.15s; font-size:11px; color:var(--text, #1c1c1e); display:flex; align-items:center; justify-content:center; gap:2px; }',
      '.switch-method-item:active { background: var(--btn-active-bg, rgba(0,0,0,0.08)); }',
      '.switch-method-item.active { border-color:var(--slider-color, #0a58f6); background:rgba(10,88,246,0.08); color:var(--slider-color, #0a58f6); font-weight:600; }',
      'html.berry-dark .switch-method-item.active { background:rgba(249,115,22,0.12); border-color:#f97316; color:#f97316; }'
    ].join('\n');
    _doc.head.appendChild(style);
  }

  function bindSwitchMethodEvents(sectionEl, menuApi) {
    var items = sectionEl.querySelectorAll('.switch-method-item');
    for (var i = 0; i < items.length; i++) {
      (function (item) {
        item.addEventListener('click', function () {
          var method = item.getAttribute('data-method');
          storageSet('berry_home_switch_method', method);
          menuApi.hsSet('berry_home_switch_method', method);
          var all = sectionEl.querySelectorAll('.switch-method-item');
          for (var j = 0; j < all.length; j++) all[j].classList.remove('active');
          item.classList.add('active');
          menuApi.showToast('\u5207\u6362\u65B9\u5F0F\u5DF2\u8BBE\u4E3A\uFF1A' + ({ longpress: '\u957F\u6309', tap: '\u70B9\u51FB', menu: '\u83DC\u5355' })[method]);
        });
      })(items[i]);
    }
  }

  function doEnhance(menuApi) {
    console.log('[berry-remote] 开始增强原生菜单');
    menuApi.removePlaceholder();

    var savedStyle = storageGet('berry_home_style', menuApi.hsGet('berry_home_style')) || 'default';

    // 为默认样式添加点击提示
    var defaultItem = _doc.getElementById('styleDefault');
    if (defaultItem) {
      defaultItem.addEventListener('click', function() {
        menuApi.selectStyle('default');
        showHomeToast('设置生效，下次启动[官方默认]');
      });
    }
    var savedCustomUrl = storageGet('berry_home_custom_url', menuApi.hsGet('berry_home_custom_url')) || '';

    menuApi.addItem({
      key: 'itab', icon: '\uD83D\uDD17', name: 'iTab\u65B0\u6807\u7B7E\u9875',
      desc: '\u5361\u7247\u7EC4\u4EF6\uFF0C\u597D\u770B\u597D\u7528', active: savedStyle === 'itab',
      onClick: function () {
        _hideCustomUrl();
        storageSet('berry_home_style', 'itab'); menuApi.hsSet('berry_home_style', 'itab');
        menuApi.selectStyle('itab');
        showHomeToast('\u8BBE\u7F6E\u751F\u6548\uFF0C\u4E0B\u6B21\u542F\u52A8[iTab]');
      }
    });

    menuApi.addItem({
      key: 'inftab', icon: '\uD83D\uDCF0', name: 'infTab\u4E3B\u9875',
      desc: '\u4E30\u5BCC\u56FE\u6807\uFF0C\u4E2A\u6027\u5B9A\u5236', active: savedStyle === 'inftab',
      onClick: function () {
        _hideCustomUrl();
        storageSet('berry_home_style', 'inftab'); menuApi.hsSet('berry_home_style', 'inftab');
        menuApi.selectStyle('inftab');
        showHomeToast('\u8BBE\u7F6E\u751F\u6548\uFF0C\u4E0B\u6B21\u542F\u52A8[infTab]');
      }
    });

    menuApi.addItem({
      key: 'custom', icon: '\uD83C\uDF10', name: '\u81EA\u5B9A\u4E49\u8BBF\u95EE\u94FE\u63A5',
      desc: savedCustomUrl || '\u8F93\u5165\u4EFB\u610F\u7F51\u5740', active: savedStyle === 'custom',
      onClick: function () { _showCustomUrl(menuApi, savedCustomUrl); }
    });

    // 切换方式
    var savedMethod = storageGet('berry_home_switch_method', menuApi.hsGet('berry_home_switch_method')) || 'menu';
    injectSwitchMethodCSS();
    var switchSectionHTML =
      '<div class="switch-method-section">' +
      '<div class="switch-method-label">\uD83D\uDD04 \u5207\u6362\u65B9\u5F0F</div>' +
      '<div class="switch-method-list">' +
      '<div class="switch-method-item' + (savedMethod === 'longpress' ? ' active' : '') + '" data-method="longpress"><span>\u2B05\uFE0F</span><span>\u957F\u6309</span></div>' +
      '<div class="switch-method-item' + (savedMethod === 'tap' ? ' active' : '') + '" data-method="tap"><span>\uD83D\uDC46</span><span>\u70B9\u51FB</span></div>' +
      '<div class="switch-method-item' + (savedMethod === 'menu' ? ' active' : '') + '" data-method="menu"><span>\u2630</span><span>\u83DC\u5355</span></div>' +
      '</div></div>';
    var switchSectionEl = menuApi.addSection(switchSectionHTML);
    if (switchSectionEl) bindSwitchMethodEvents(switchSectionEl, menuApi);

    if (savedStyle === 'custom' && savedCustomUrl) _showCustomUrl(menuApi, savedCustomUrl);

    if (typeof menuApi.onStyleChange === 'function') {
      menuApi.onStyleChange(function (newStyle) {
        if (newStyle === 'default') removeIframe();
      });
    }
    // custom模式不通知原生，避免重复导航
    if (savedStyle !== 'custom') {
      menuApi.selectStyle(savedStyle);
    }

    console.log('[berry-remote] 原生菜单增强完成');
  }

  /* ════════════════════════════════════════
     非主页场景：创建独立悬浮菜单（Shadow DOM）
     ════════════════════════════════════════ */

  function initFloatingMenu() {
    var savedStyle = storageGet('berry_home_style') || 'default';
    var customUrl = storageGet('berry_home_custom_url') || '';
    var currentUrl = location.href || '';

    console.log('[berry-remote] FloatingMenu: savedStyle=' + savedStyle + ' customUrl=' + customUrl);

    /* 判断是否显示按钮 */
    var showBtn = false;

    if (savedStyle === 'default') {
      showBtn = false;
    } else if (savedStyle === 'itab') {
      showBtn = (currentUrl.indexOf('go.itab.link') !== -1 || currentUrl.indexOf('itab.com') !== -1);
    } else if (savedStyle === 'inftab') {
      showBtn = (currentUrl.indexOf('inftab.com') !== -1);
    } else if (savedStyle === 'custom') {
      if (customUrl) {
        showBtn = domainMatches(currentUrl, customUrl);
      } else {
        showBtn = true;
      }
    }

    console.log('[berry-remote] showBtn=' + showBtn + ' coreDomain(current)=' + extractCoreDomain(currentUrl) + ' coreDomain(saved)=' + extractCoreDomain(customUrl));

    if (!showBtn) return;

    /* ========== 创建 Shadow DOM 宿主 ========== */
    if (_doc.getElementById('globalMenuBtnHost')) return;

    var host = _doc.createElement('div');
    host.id = 'globalMenuBtnHost';
    var isHome = isHomePage();
    var btnTop = isHome ? '45px' : '30px';
    var HOST_BTN_STYLE = 'position:fixed!important;top:' + btnTop + '!important;left:16px!important;width:36px!important;height:36px!important;z-index:2147483646!important;pointer-events:auto!important;overflow:visible!important';
    var HOST_MENU_STYLE = 'position:fixed!important;top:0!important;left:0!important;width:100%!important;height:100%!important;z-index:2147483646!important;pointer-events:auto!important;overflow:visible!important';
    host.style.cssText = HOST_BTN_STYLE;
    if (_doc.documentElement) {
      _doc.documentElement.appendChild(host);
    }

    var shadow = host.attachShadow({ mode: 'open' });

    function showHomeToast(msg) {
      var existing = _doc.getElementById('scriptHomeToast');
      if (existing) existing.remove();
      var toast = _doc.createElement('div');
      toast.id = 'scriptHomeToast';
      toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;z-index:2147483647;pointer-events:none;transition:opacity 0.3s';
      toast.textContent = msg;
      _doc.body.appendChild(toast);
      setTimeout(function () {
        toast.style.opacity = '0';
        setTimeout(function () { if (toast.parentNode) toast.remove(); }, 300);
      }, 1500);
    }

    /* ========== 按钮 + 菜单 HTML ========== */
    var savedMethod = storageGet('berry_home_switch_method') || 'menu';
    var css = getMenuCSS(isHome);
    var html = getMenuHTML(savedMethod, savedStyle, customUrl);

    shadow.innerHTML = '<style>' + css + '</style>' + BTN_HTML + html;

    /* ========== 交互 ========== */
    var btn = shadow.getElementById('menuBtn');
    var overlay = shadow.getElementById('shadowMenuOverlay');

    function toggleMenu() {
      if (overlay) {
        overlay.classList.toggle('open');
        if (overlay.classList.contains('open')) {
          host.style.cssText = HOST_MENU_STYLE;
        } else {
          host.style.cssText = HOST_BTN_STYLE;
        }
      }
    }
    function closeMenu() {
      if (overlay) {
        overlay.classList.remove('open');
        host.style.cssText = HOST_BTN_STYLE;
      }
    }

    if (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleMenu();
      });
    }

    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeMenu();
      });
    }

    /* ========== 全局 onclick 处理 ========== */
    _page.__berryHandleStyleClick = function (styleKey) {
      if (styleKey === 'custom') {
        var inputSec = shadow.getElementById('floatCustomUrlSection');
        if (!inputSec) return;
        var curD = inputSec.style.display;
        if (curD === 'none' || !inputSec.classList.contains('visible')) {
          inputSec.style.display = 'flex';
          inputSec.classList.add('visible');
        } else {
          inputSec.style.display = 'none';
          inputSec.classList.remove('visible');
        }
        var allItems = shadow.querySelectorAll('.f-home-style-item');
        for (var j = 0; j < allItems.length; j++) allItems[j].classList.remove('active');
        var ci = shadow.querySelector('[data-fstyle="custom"]');
        if (ci) ci.classList.add('active');
        return;
      }

      storageSet('berry_home_style', styleKey);
      var allItems = shadow.querySelectorAll('.f-home-style-item');
      for (var j = 0; j < allItems.length; j++) allItems[j].classList.remove('active');
      var ti = shadow.querySelector('[data-fstyle="' + styleKey + '"]');
      if (ti) ti.classList.add('active');

      var isec = shadow.getElementById('floatCustomUrlSection');
      if (isec) { isec.style.display = 'none'; isec.classList.remove('visible'); }

      var nameMap = { default: '官方默认', itab: 'iTab', inftab: 'infTab', custom: '自定义' };
      showHomeToast('设置生效，下次启动[' + nameMap[styleKey] + ']');
    };



    _page.__berryHandleSwitchMethod = function (method) {
      storageSet('berry_home_switch_method', method);
      var fmItems = shadow.querySelectorAll('.f-switch-method-item');
      for (var k = 0; k < fmItems.length; k++) fmItems[k].classList.remove('active');
      var t = shadow.querySelector('[data-fm="' + method + '"]');
      if (t) t.classList.add('active');
      showHomeToast('\u5207\u6362\u65B9\u5F0E\u5DF2\u8BBE\u4E3A\uFF1A' + ({ longpress: '\u957F\u6309', tap: '\u70B9\u51FB', menu: '\u83DC\u5355' })[method]);
    };

    _page.__berryHandleApply = function () {
      var fui = shadow.getElementById('floatCustomUrlInput');
      if (!fui) return;
      var url = fui.value.trim();
      if (!url) { showFloatTip('\u8BF7\u8F93\u5165\u7F51\u5740'); return; }
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      storageSet('berry_home_custom_url', url);
      storageSet('berry_home_style', 'custom');
      showFloatTip('设置生效，下次启动[自定义]');
      navigateTo(url);
      closeMenu();
      var isec = shadow.getElementById('floatCustomUrlSection');
      if (isec) { isec.style.display = 'none'; isec.classList.remove('visible'); }
    };

    _page.__berryCloseMenu = function () { closeMenu(); };

    /* 暴露全局接口 */
    try { _page.globalMenuBtn = btn; } catch (e) {}
    try { _page.globalMenuBtnHost = host; } catch (e) {}
    try { _page.globalMenuToggle = toggleMenu; } catch (e) {}
    try { _page.globalMenuClose = closeMenu; } catch (e) {}

    console.log('[berry-remote] 悬浮按钮已创建');
  }

  /* ========== 按钮 HTML ========== */
  var BTN_HTML = '<div class="btn-wrap">' +
    '<button type="button" class="btn" id="menuBtn" aria-label="\u6253\u5F00\u83DC\u5355">' +
    '<div class="menu-icon"><span></span><span></span><span></span></div>' +
    '</button></div>';

  /* ========== 悬浮菜单 CSS ========== */
  function getMenuCSS(isHome) {
    var btnTop = isHome ? '45px' : '30px';
    var panelTop = isHome ? '77px' : '62px';
    return [
      ':host{display:block!important;overflow:visible!important}',
      '.btn-wrap{position:fixed;top:' + btnTop + '!important;left:16px!important;z-index:2147483647;pointer-events:auto}',
      '.btn{width:28px;height:28px;border-radius:7px;background:rgba(255,255,255,0.25);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:2147483647;transition:all 0.2s;border:1.5px solid rgba(255,255,255,0.4);outline:0;box-shadow:0 2px 8px rgba(0,0,0,0.15)}',
      '.btn:active{transform:scale(0.92);background:rgba(255,255,255,0.4)}',
      '.btn:hover{background:rgba(255,255,255,0.40);border-color:rgba(255,255,255,0.55);box-shadow:0 2px 12px rgba(0,0,0,0.2)}',
      'html.berry-dark .btn,html.dark .btn,[data-theme="dark"] .btn{background:rgba(30,30,30,0.5);border-color:rgba(255,255,255,0.25);box-shadow:0 2px 8px rgba(0,0,0,0.3)}',
      '.menu-icon{width:16px;height:12px;display:flex;flex-direction:column;justify-content:space-between}',
      '.menu-icon span{display:block;width:100%;height:1.8px;border-radius:2px;background-color:#555}',
      ':host-context(html.berry-dark) .menu-icon span,:host-context(html.dark) .menu-icon span{background-color:#aaa}',
      '.f-menu-overlay{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);z-index:200;align-items:flex-start;justify-content:flex-start;overflow-y:auto;overflow-x:hidden}',
      '.f-menu-overlay.open{display:flex!important}',
      '.f-menu-panel{position:relative;margin:' + panelTop + ' 16px 20px;width:300px;max-width:calc(100vw - 32px);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:24px;padding:2px 12px;box-shadow:0 12px 32px rgba(0,0,0,0.2);border:1px solid rgba(0,0,0,0.08);background:rgba(255,255,255,0.92)}',
      '.f-menu-title{font-size:15px;font-weight:600;color:#222;margin-top:6px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid rgba(0,0,0,0.06)}',
      '.f-mode-label{font-size:12px;color:#8e8e93;margin-bottom:8px}',
      '.f-home-style-list{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}',
      '.f-home-style-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;border:1.5px solid rgba(0,0,0,0.08);background:rgba(0,0,0,0.04);cursor:pointer;transition:all 0.15s;-webkit-tap-highlight-color:transparent;pointer-events:auto}',
      '.f-home-style-item:active{background:rgba(0,0,0,0.08);transform:scale(0.98)}',
      '.f-home-style-item.active{border-color:#0a58f6;background:rgba(10,88,246,0.08)}',
      '.f-hs-icon{font-size:20px}',
      '.f-hs-info{flex:1;min-width:0}',
      '.f-hs-name{font-size:13px;font-weight:500;color:#222}',
      '.f-hs-desc{font-size:11px;color:#8e8e93}',
      '.f-hs-check{font-size:16px;color:#0a58f6;display:none}',
      '.f-home-style-item.active .f-hs-check{display:block}',
      '.f-custom-url-section{display:none;margin:6px 0 8px;gap:8px}',
      '.f-custom-url-section.visible{display:flex}',
      '.f-custom-url-section input[type="url"]{flex:1;height:34px;border-radius:10px;border:1.5px solid rgba(0,0,0,0.08);background:rgba(0,0,0,0.04);color:#222;font-size:13px;padding:0 10px;outline:none;box-sizing:border-box}',
      '.f-custom-url-section input[type="url"]:focus{border-color:#0a58f6}',
      '.f-custom-url-section button{height:34px;padding:0 12px;border-radius:10px;border:none;background:#0a58f6;color:#fff;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;box-sizing:border-box;pointer-events:auto}',
      '.f-custom-url-section button:active{opacity:0.8}',
      '.f-menu-tip{margin:8px 0;padding:10px 12px;background:rgba(10,88,246,0.08);border-radius:12px;display:flex;align-items:center;gap:8px;font-size:13px;color:#0a58f6;opacity:0;transition:opacity 0.25s}',
      '.f-menu-tip.show{opacity:1}',
      '.f-menu-tip .f-tip-icon{font-size:16px}',
      '.f-menu-tip .f-tip-text{flex:1}',
      '.f-switch-method-label{font-size:12px;color:#8e8e93;margin-bottom:8px}',
      '.f-switch-method-list{display:flex;gap:6px}',
      '.f-switch-method-item{flex:1;padding:8px 4px;border-radius:10px;border:1.5px solid rgba(0,0,0,0.08);background:rgba(0,0,0,0.04);text-align:center;cursor:pointer;transition:all 0.15s;font-size:11px;color:#333;display:flex;align-items:center;justify-content:center;gap:2px;-webkit-tap-highlight-color:transparent;pointer-events:auto}',
      '.f-switch-method-item:active{background:rgba(0,0,0,0.08)}',
      '.f-switch-method-item.active{border-color:#0a58f6;background:rgba(10,88,246,0.08);color:#0a58f6;font-weight:600}',
      '.f-close-menu{margin-top:8px;text-align:center;font-size:10px;color:#8e8e93;padding:7px 0;line-height:16px;border-top:1px solid rgba(0,0,0,0.06);cursor:pointer;pointer-events:auto}',
      '.f-close-menu:active{opacity:0.7}'
    ].join('');
  }

  /* ========== 悬浮菜单 HTML ========== */
  function getMenuHTML(savedMethod, savedStyle, savedCustomUrl) {
    var items = [
      { key: 'default', icon: '\uD83D\uDCCC', name: '\u5B98\u65B9\u9ED8\u8BA4', desc: '\u5B98\u65B9\u9ED8\u8BA4\uFF0C\u7B80\u7EA6\u5BFC\u822A' },
      { key: 'itab', icon: '\uD83D\uDD17', name: 'iTab\u65B0\u6807\u7B7E\u9875', desc: '\u5361\u7247\u7EC4\u4EF6\uFF0C\u597D\u770B\u597D\u7528' },
      { key: 'inftab', icon: '\uD83D\uDCF0', name: 'infTab\u4E3B\u9875', desc: '\u4E30\u5BCC\u56FE\u6807\uFF0C\u4E2A\u6027\u5B9A\u5236' },
      { key: 'custom', icon: '\uD83C\uDF10', name: '\u81EA\u5B9A\u4E49\u8BBF\u95EE\u94FE\u63A5', desc: savedCustomUrl || '\u8F93\u5165\u4EFB\u610F\u7F51\u5740' }
    ];
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var active = (it.key === savedStyle) ? ' active' : '';
      html += '<div class="f-home-style-item' + active + '" data-fstyle="' + it.key + '" onclick="__berryHandleStyleClick(\'' + it.key + '\')">' +
        '<div class="f-hs-icon">' + it.icon + '</div>' +
        '<div class="f-hs-info"><div class="f-hs-name">' + it.name + '</div><div class="f-hs-desc">' + it.desc + '</div></div>' +
        '<div class="f-hs-check">\u2713</div></div>';
    }

    var customInputVisible = (savedStyle === 'custom' && savedCustomUrl);
    var customInputHtml =
      '<div class="f-custom-url-section' + (customInputVisible ? ' visible' : '') + '" id="floatCustomUrlSection">' +
      '<input type="url" id="floatCustomUrlInput" placeholder="https://example.com" value="' + (savedCustomUrl || '').replace(/"/g, '&quot;') + '">' +
      '<button onclick="__berryHandleApply()">\u524D\u5F80</button></div>';

    return (
      '<div class="f-menu-overlay" id="shadowMenuOverlay">' +
      '<div class="f-menu-panel">' +
      '<div class="f-menu-title">\u4E3B\u9875\u8BBE\u7F6E</div>' +
      '<div class="f-mode-label">\uD83C\uDFE0 \u4E3B\u9875\u98CE\u683C</div>' +
      '<div class="f-home-style-list">' + html + '</div>' +
      customInputHtml +
      '<div class="f-menu-tip" id="floatMenuTip"><span class="f-tip-icon">\u26A1</span><span class="f-tip-text"></span></div>' +
      '<div class="f-switch-method-label">\uD83D\uDD04 \u5207\u6362\u65B9\u5F0F</div>' +
      '<div class="f-switch-method-list">' +
      '<div class="f-switch-method-item' + (savedMethod === 'longpress' ? ' active' : '') + '" data-fm="longpress" onclick="__berryHandleSwitchMethod(\'longpress\')"><span>\u2B05\uFE0F</span><span>\u957F\u6309</span></div>' +
      '<div class="f-switch-method-item' + (savedMethod === 'tap' ? ' active' : '') + '" data-fm="tap" onclick="__berryHandleSwitchMethod(\'tap\')"><span>\uD83D\uDC46</span><span>\u70B9\u51FB</span></div>' +
      '<div class="f-switch-method-item' + (savedMethod === 'menu' ? ' active' : '') + '" data-fm="menu" onclick="__berryHandleSwitchMethod(\'menu\')"><span>\u2630</span><span>\u83DC\u5355</span></div>' +
      '</div>' +
      '<div class="f-close-menu" onclick="__berryCloseMenu()">\u2715 \u5173\u95ED</div>' +
      '</div></div>'
    );
  }

  /* ════════════════════════════════════════
     下次启动时加载保存的主页风格
     ════════════════════════════════════════ */

  function applySavedStyle() {
    var savedStyle = storageGet('berry_home_style') || 'default';
    var savedCustomUrl = storageGet('berry_home_custom_url') || '';

    if (savedStyle === 'itab') {
      setTimeout(function () { loadInIframe('https://go.itab.link/'); }, 50);
    } else if (savedStyle === 'inftab') {
      setTimeout(function () { loadInIframe('https://inftab.com/'); }, 50);
    } else if (savedStyle === 'custom' && savedCustomUrl) {
      setTimeout(function () { navigateTo(savedCustomUrl); }, 50);
    }
  }

  /* ════════════════════════════════════════
     入口：根据页面类型分发
     ════════════════════════════════════════ */

  function main() {
    var isHome = isHomePage();
    console.log('[berry-remote] main: isHome=' + isHome + ' url=' + location.href);

    if (isHome) {
      initHomepageEnhance();
    } else {
      initFloatingMenu();
    }
  }

  /* ========== 等待 BerryHomeMenu API ========== */
  function initHomepageEnhance() {
    var menuApi = _page.BerryHomeMenu;
    if (menuApi) {
      doEnhance(menuApi);
      applySavedStyle();  // 下次启动时加载保存的风格
      return;
    }

    var retries = 0;
    var pollTimer = setInterval(function () {
      retries++;
      menuApi = _page.BerryHomeMenu;
      if (menuApi) {
        clearInterval(pollTimer);
        doEnhance(menuApi);
        applySavedStyle();  // 下次启动时加载保存的风格
      } else if (retries > 30) {
        clearInterval(pollTimer);
        console.warn('[berry-remote] BerryHomeMenu API 未就绪，回退悬浮菜单');
        initFloatingMenu();
      }
    }, 100);
  }

  /* ========== 启动 ========== */
  if (_doc.readyState === 'loading') {
    _doc.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }

})();