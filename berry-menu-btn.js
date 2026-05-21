// ==UserScript==
// @name         Berry 主页菜单
// @namespace    http://berrybrowser.com/
// @version      4.19
// @description  在Berry主页增强原生菜单（追加itab/InfTab/自定义URL等选项），其他页面显示独立悬浮菜单；支持 Chrome 浏览器
// @author       jagshen
// @match        <all_urls>
// @include      *
// @exclude      about:*
// @exclude      chrome://*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document_end
// @inject-into  page
// ==/UserScript==

(function () {
  'use strict';

  /* ========== 页面上下文桥接（GM 沙箱模式下需要 unsafeWindow）========== */
  var _page = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  var _doc  = document; // @inject-into page 保证 document 是页面的

  // 防止重复注入
  if (_doc.getElementById('globalMenuBtnHost')) return;

  /* ========== 浏览器环境检测 ========== */
  var _isBerry = !!(typeof _page.BerryBrowser !== 'undefined' || _page._berry_homepage);
  /** 统一导航：Berry 用 berry:// 协议，Chrome 用 location.href */
  function navigateTo(url) {
    if (_isBerry) {
      try { location.href = 'berry://navigate?url=' + encodeURIComponent(url); return; } catch(e) {}
    }
    try { location.href = url; } catch(e) { window.open(url, '_blank'); }
  }

  /* ========== iframe 内嵌模式（itab/inftab 使用）========== */
  var IFRAME_ID = 'berryHomeIframe';

  /** 在当前页面创建全屏 iframe 加载指定 URL */
  function loadInIframe(url) {
    var iframe = _doc.getElementById(IFRAME_ID);
    if (!iframe) {
      iframe = _doc.createElement('iframe');
      iframe.id = IFRAME_ID;
      iframe.setAttribute('allowfullscreen', '');
      iframe.setAttribute('allow', 'clipboard-read; clipboard-write');
      iframe.style.cssText = [
        'position:fixed',
        'top:0',
        'left:0',
        'width:100%',
        'height:100%',
        'border:none',
        'z-index:100',
        'background:#fff'
      ].join(';');
      _doc.body.appendChild(iframe);
    }
    iframe.src = url;
    console.log('[berry-menu-btn] iframe 加载: ' + url);
  }

  /** 移除 iframe */
  function removeIframe() {
    var iframe = _doc.getElementById(IFRAME_ID);
    if (iframe) {
      iframe.remove();
      console.log('[berry-menu-btn] iframe 已移除');
    }
  }

  /* ========== 跨域存储（Tampermonkey GM 存储，所有域名共享）========== */
  function gmGet(key, defaultVal) {
    try {
      if (typeof GM_getValue === 'function') {
        var v = GM_getValue(key);
        if (v !== undefined && v !== null && v !== '') return v;
      }
    } catch(e) {}
    return defaultVal;
  }

  function gmSet(key, val) {
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(key, val);
      }
    } catch(e) {}
  }

  /* ========== 页面上下文检测 ========== */
  function checkBerry() {
    var href = (location && location.href) || '';
    return href.indexOf('resource://rawfile/home.html') !== -1;
  }

  /* ========== 延迟到 DOMContentLoaded 后执行 ========== */
  function init() {
    var isHome = checkBerry();
    var url = location.href || '';
    console.log('[berry-menu-btn] init: isHome=' + isHome + ' url=' + url);

    /* ========== 主页场景：增强原生菜单 ========== */
    if (isHome) {
      initHomepageEnhance();
      return;
    }

    /* ========== 非主页场景：创建独立悬浮菜单（Shadow DOM）========== */
    initFloatingMenu();
  }

  /* ════════════════════════════════════════
     主页场景：通过 BerryHomeMenu API 追加菜单项
     ════════════════════════════════════════ */
  function initHomepageEnhance() {
    // 等待 BerryHomeMenu API 就绪（可能比脚本后加载）
    var api = _page.BerryHomeMenu;
    if (!api) {
      // 轮询等待，最多 2 秒
      var retries = 0;
      var pollTimer = setInterval(function() {
        retries++;
        api = _page.BerryHomeMenu;
        if (api) {
          clearInterval(pollTimer);
          doEnhance(api);
        } else if (retries > 20) { // 2秒超时
          clearInterval(pollTimer);
          console.warn('[berry-menu-btn] BerryHomeMenu API 未就绪，回退到悬浮菜单');
          initFloatingMenu();
        }
      }, 100);
      return;
    }
    doEnhance(api);
  }

  /** 自定义 URL 输入框的 click handler（提取公共逻辑） */
  function _handleCustomUrlApply(api, inputEl) {
    if (!inputEl) return;
    var url = inputEl.value.trim();
    if (!url) { api.showToast('请输入网址'); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    gmSet('berry_home_custom_url', url);
    gmSet('berry_home_style', 'custom');
    api.hsSet('berry_home_custom_url', url);
    api.hsSet('berry_home_style', 'custom');
    api.selectStyle('custom');
    navigateTo(url);
  }

  /** 动态注入自定义 URL 输入框 —— 始终插入到切换方式上方 */
  function _showCustomUrl(api, defaultValue) {
    _hideCustomUrl();

    injectCustomUrlCSS();

    var sectionEl;
    // 策略1：尝试直接 DOM 操作插入到切换方式上方
    var extContainer = _doc.getElementById('extMenuItems');
    var switchSection = extContainer ? extContainer.querySelector('.switch-method-section') : null;

    if (extContainer && switchSection) {
      sectionEl = _doc.createElement('div');
      sectionEl.className = 'custom-url-section';
      sectionEl.id = 'scriptCustomUrlSection';
      sectionEl.innerHTML =
        '<input type="url" id="scriptCustomUrlInput" placeholder="https://example.com">' +
        '<button id="scriptCustomUrlApplyBtn">前往</button>';
      switchSection.parentNode.insertBefore(sectionEl, switchSection);
      console.log('[berry-menu-btn] 自定义输入框已插入到切换方式上方');
    } else {
      // 策略2（fallback）：使用 api.addSection
      console.warn('[berry-menu-btn] 回退到 addSection 方式, extContainer=' + !!extContainer + ' switchSection=' + !!switchSection);
      var html =
        '<div class="custom-url-section" id="scriptCustomUrlSection">' +
          '<input type="url" id="scriptCustomUrlInput" placeholder="https://example.com">' +
          '<button id="scriptCustomUrlApplyBtn">前往</button>' +
        '</div>';
      sectionEl = api.addSection(html);
      if (!sectionEl) return;

      // 尝试移动位置到切换方式上方
      if (extContainer) {
        var sw = extContainer.querySelector('.switch-method-section');
        if (sw) { sw.parentNode.insertBefore(sectionEl, sw); }
      }
    }

    var input = sectionEl.querySelector('#scriptCustomUrlInput');
    if (input && defaultValue) input.value = defaultValue;
    var btn = sectionEl.querySelector('#scriptCustomUrlApplyBtn');
    if (btn) {
      btn.addEventListener('click', function() { _handleCustomUrlApply(api, input); });
    }
  }

  /** 隐藏自定义 URL 输入框 */
  function _hideCustomUrl() {
    var el = _doc.getElementById('scriptCustomUrlSection');
    if (el) el.remove();
  }

  /** 注入自定义URL区域的 CSS（仅首次） */
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

  function doEnhance(api) {
    console.log('[berry-menu-btn] 开始增强原生菜单');

    // 1. 移除"更多主页选择"占位提示，替换为真实选项
    api.removePlaceholder();

    // 2. 读取已保存的风格和自定义URL（优先 GM 跨域存储）
    var savedStyle = gmGet('berry_home_style', api.hsGet('berry_home_style')) || 'default';
    var savedCustomUrl = gmGet('berry_home_custom_url', api.hsGet('berry_home_custom_url')) || '';

    // 3. 追加 itab 主页选项
    api.addItem({
      key: 'itab',
      icon: '🔗',
      name: 'iTab新标签页',
      desc: '卡片组件，好看好用',
      active: savedStyle === 'itab',
      onClick: function(key) {
        _hideCustomUrl();
        removeIframe();
        gmSet('berry_home_style', 'itab');
        api.hsSet('berry_home_style', 'itab');
        loadInIframe('https://go.itab.link/');
      }
    });

    // 4. 追加 InfTab 主页选项
    api.addItem({
      key: 'inftab',
      icon: '📰',
      name: 'infTab主页',
      desc: '丰富图标，个性定制',
      active: savedStyle === 'inftab',
      onClick: function(key) {
        _hideCustomUrl();
        removeIframe();
        gmSet('berry_home_style', 'inftab');
        api.hsSet('berry_home_style', 'inftab');
        loadInIframe('https://inftab.com/');
      }
    });

    // 5. 追加自定义 URL 选项（点击时动态显示输入框）
    api.addItem({
      key: 'custom',
      icon: '🌐',
      name: '自定义访问链接',
      desc: '输入任意网址',
      active: savedStyle === 'custom',
      onClick: function(key) {
        _showCustomUrl(api, savedCustomUrl);
      }
    });

    // 6. 先添加「切换方式」区域到 extMenuItems（必须在 _showCustomUrl 之前！）
    var savedMethod = api.hsGet('berry_home_switch_method') || 'menu';

    var switchSectionHTML =
      '<div class="switch-method-section">' +
        '<div class="switch-method-label">🔄 切换方式</div>' +
        '<div class="switch-method-list">' +
          '<div class="switch-method-item' + (savedMethod === 'longpress' ? ' active' : '') + '" data-method="longpress">' +
            '<span>⬅️</span><span>长按</span></div>' +
          '<div class="switch-method-item' + (savedMethod === 'tap' ? ' active' : '') + '" data-method="tap">' +
            '<span>👆</span><span>点击</span></div>' +
          '<div class="switch-method-item' + (savedMethod === 'menu' ? ' active' : '') + '" data-method="menu">' +
            '<span>☰</span><span>菜单</span></div>' +
        '</div>' +
      '</div>';

    // 注入切换方式区域的样式（如果页面还没有）
    injectSwitchMethodCSS();

    var switchSectionEl = api.addSection(switchSectionHTML);

    // 绑定切换方式事件
    if (switchSectionEl) {
      bindSwitchMethodEvents(switchSectionEl, api);
    }

    // 7. 如果当前是 custom 风格且已有 URL，展开输入框（此时切换方式已存在 ✅）
    if (savedStyle === 'custom' && savedCustomUrl) {
      _showCustomUrl(api, savedCustomUrl);
    }

    // 8. 监听风格切换回调——切回 default 时移除 iframe
    if (typeof api.onStyleChange === 'function') {
      api.onStyleChange(function(newStyle) {
        console.log('[berry-menu-btn] onStyleChange: ' + newStyle);
        if (newStyle === 'default') {
          removeIframe();
        }
      });
    }

    // 9. 通过 selectStyle 应用选中状态（复用 HTML 内置逻辑）
    api.selectStyle(savedStyle);

    // 10. 非默认模式时自动加载
    if (savedStyle === 'custom' && savedCustomUrl) {
      console.log('[berry-menu-btn] 自定义地址模式，自动跳转到: ' + savedCustomUrl);
      setTimeout(function() { navigateTo(savedCustomUrl); }, 300);
    } else if (savedStyle === 'itab') {
      console.log('[berry-menu-btn] Itab 模式，iframe 加载 go.itab.link');
      setTimeout(function() { loadInIframe('https://go.itab.link/'); }, 300);
    } else if (savedStyle === 'inftab') {
      console.log('[berry-menu-btn] InfTab 模式，iframe 加载 inftab.com');
      setTimeout(function() { loadInIframe('https://inftab.com/'); }, 300);
    }

    // 11. 仅在油猴注入时替换原生按钮；<script src> 远程加载时原生按钮已存在，无需替换
    if (typeof GM_getValue === 'function') {
      replaceNativeButton(api);
    }

    console.log('[berry-menu-btn] 原生菜单增强完成');
  }

  /** 替换原生按钮为自带的毛玻璃按钮，但控制原生遮罩层 */
  function replaceNativeButton(api) {
    var nativeBtn = api.getSwitchZone();
    if (nativeBtn) {
      nativeBtn.style.visibility = 'hidden';
      nativeBtn.style.pointerEvents = 'none';
    }

    var host = _doc.createElement('div');
    host.id = 'globalMenuBtnHost';
    host.style.cssText = [
      'position:fixed',
      'top:30px',
      'left:16px',
      'z-index:2147483646',
      'pointer-events:none'
    ].join(';');
    if (_doc.documentElement) {
      _doc.documentElement.appendChild(host);
    }

    var shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = SHARED_BTN_HTML;

    var btn = shadow.getElementById('menuBtn');
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      api.toggle();
    });
  }

  /** 共享的按钮 HTML（主页场景 + 非主页场景共用）—— 与原生 .menu-btn / .menu-icon 100% 一致 */
  var SHARED_BTN_HTML = '<style>' +
    '.btn-wrap{position:relative;z-index:2147483647;pointer-events:auto}' +
    '.btn{' +
      'width:28px;height:28px;border-radius:7px;' +
      'background:rgba(255,255,255,0.25);' +
      'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);' +
      'display:flex;align-items:center;justify-content:center;' +
      'cursor:pointer;z-index:2147483647;' +
      'transition:all 0.2s;border:1.5px solid rgba(255,255,255,0.4);' +
      'outline:0;' +
      'box-shadow:0 2px 8px rgba(0,0,0,0.15)}' +
    '.btn:active{transform:scale(0.92);background:rgba(255,255,255,0.4)}' +
    '.btn:hover{background:rgba(255,255,255,0.40);border-color:rgba(255,255,255,0.55);box-shadow:0 2px 12px rgba(0,0,0,0.2)}' +
    'html.berry-dark .btn,html.dark .btn,[data-theme="dark"] .btn{background:rgba(30,30,30,0.5);border-color:rgba(255,255,255,0.25);box-shadow:0 2px 8px rgba(0,0,0,0.3)}' +
    'html.berry-dark .btn:active,html.dark .btn:active,[data-theme="dark"] .btn:active{background:rgba(50,50,50,0.6)}' +
    '.menu-icon{width:16px;height:12px;display:flex;flex-direction:column;justify-content:space-between}' +
    '.menu-icon span{display:block;width:100%;height:1.8px;border-radius:2px;background-color:#555}' +
    ':host-context(html.berry-dark) .menu-icon span,' +
    ':host-context(html.dark) .menu-icon span,' +
    ':host-context([data-theme="dark"]) .menu-icon span{background-color:#aaa}' +
    '</style>' +
    '<div class="btn-wrap">' +
      '<button class="btn" id="menuBtn" aria-label="\u6253\u5F00\u83DC\u5355">' +
        '<div class="menu-icon"><span></span><span></span><span></span></div>' +
      '</button>' +
    '</div>';

  /** 注入切换方式的 CSS 样式 */
  function injectSwitchMethodCSS() {
    if (_doc.getElementById('_berrySwitchMethodCSS')) return;
    var style = _doc.createElement('style');
    style.id = '_berrySwitchMethodCSS';
    style.textContent = [
      '.switch-method-section { margin-bottom: 8px; }',
      '.switch-method-label { font-size: 12px; font-weight: 500; margin-bottom: 6px; color: var(--text-sub, #8e8e93); }',
      '.switch-method-list { display: flex; gap: 6px; }',
      '.switch-method-item {',
      '  flex: 1;',
      '  padding: 8px 4px;',
      '  border-radius: 10px;',
      '  border: 1.5px solid var(--border-color, rgba(0,0,0,0.08));',
      '  background: var(--btn-secondary-bg, rgba(0,0,0,0.04));',
      '  text-align: center;',
      '  cursor: pointer;',
      '  transition: all 0.15s;',
      '  font-size: 11px;',
      '  color: var(--text, #1c1c1e);',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  gap: 2px;',
      '}',
      '.switch-method-item:active { background: var(--btn-active-bg, rgba(0,0,0,0.08)); }',
      '.switch-method-item.active {',
      '  border-color: var(--slider-color, #0a58f6);',
      '  background: rgba(10,88,246,0.08);',
      '  color: var(--slider-color, #0a58f6);',
      '  font-weight: 600;',
      '}',
      'html.berry-dark .switch-method-item.active {',
      '  background: rgba(249,115,22,0.12);',
      '  border-color: #f97316;',
      '  color: #f97316;',
      '}'
    ].join('\n');
    _doc.head.appendChild(style);
  }

  /** 绑定切换方式的事件 */
  function bindSwitchMethodEvents(sectionEl, api) {
    var items = sectionEl.querySelectorAll('.switch-method-item');
    for (var i = 0; i < items.length; i++) {
      (function(item) {
        item.addEventListener('click', function() {
          var method = item.getAttribute('data-method');
          api.hsSet('berry_home_switch_method', method);

          // 切换 active 状态
          var all = sectionEl.querySelectorAll('.switch-method-item');
          for (var j = 0; j < all.length; j++) all[j].classList.remove('active');
          item.classList.add('active');

          var labels = { longpress: '长按', tap: '点击', menu: '菜单' };
          api.showToast('切换方式已设为：' + labels[method]);
        });
      })(items[i]);
    }
  }

  /* ════════════════════════════════════════
     非主页场景：创建独立悬浮菜单（Shadow DOM）
     ════════════════════════════════════════ */
  function initFloatingMenu() {
    /* ========== 创建 Shadow DOM 宿主 ========== */
    var host = _doc.createElement('div');
    host.id = 'globalMenuBtnHost';
    if (_doc.documentElement) {
      _doc.documentElement.insertBefore(host, _doc.documentElement.firstChild);
    }

    var shadow = host.attachShadow({ mode: 'open' });

    /* ========== 工具函数（GM 跨域 → BerryBrowser → localStorage）========== */
    function _hsGet(key) {
      // 1. 优先 GM 存储（跨域共享）
      var gmVal = gmGet(key);
      if (gmVal !== undefined && gmVal !== null && gmVal !== '') return gmVal;
      // 2. Berry 原生存储
      try {
        if (typeof _page.BerryBrowser !== 'undefined' && _page.BerryBrowser.homeStorageGet) {
          var v = _page.BerryBrowser.homeStorageGet(key);
          if (v !== null && v !== undefined && v !== '') return v;
        }
      } catch (e) {}
      // 3. localStorage
      try { return localStorage.getItem(key); } catch (e) {}
      return null;
    }

    function _hsSet(key, val) {
      // 1. 写入 GM（跨域）
      gmSet(key, val);
      // 2. Berry 原生存储
      try {
        if (typeof _page.BerryBrowser !== 'undefined' && _page.BerryBrowser.homeStorageSet) {
          _page.BerryBrowser.homeStorageSet(key, val);
        }
      } catch (e) {}
      // 3. localStorage
      try { localStorage.setItem(key, val); } catch (e) {}
    }

    function showToast(msg) {
      var existing = shadow.getElementById('menuToast');
      if (existing) existing.remove();
      var toast = _doc.createElement('div');
      toast.id = 'menuToast';
      toast.style.cssText = [
        'position:fixed', 'bottom:80px', 'left:50%',
        'transform:translateX(-50%)', 'background:rgba(0,0,0,0.75)',
        'color:#fff', 'padding:8px 16px', 'border-radius:8px',
        'font-size:13px', 'z-index:2147483647',
        'pointer-events:none', 'transition:opacity 0.3s'
      ].join(';');
      toast.textContent = msg;
      shadow.appendChild(toast);
      setTimeout(function () {
        toast.style.opacity = '0';
        setTimeout(function () { toast.remove(); }, 300);
      }, 1500);
    }

    /* ========== 按钮可见性控制（优先 GM 跨域存储读取）========== */
    var savedStyle = gmGet('berry_home_style', _hsGet('berry_home_style')) || 'default';
    var customUrl = gmGet('berry_home_custom_url', _hsGet('berry_home_custom_url')) || '';
    var currentUrl = location.href || '';
    var showBtn = false;

    console.log('[berry-menu-btn] FloatingMenu: savedStyle=' + savedStyle + ' customUrl=' + customUrl + ' url=' + currentUrl);

    if (savedStyle === 'default') {
      showBtn = false;
    } else if (savedStyle === 'itab') {
      // iframe 模式下不会离开主页，此分支仅兜底用户直接访问 itab 域名的情况
      showBtn = (currentUrl.indexOf('go.itab.link') !== -1 || currentUrl.indexOf('itab.com') !== -1);
    } else if (savedStyle === 'inftab') {
      // 同上，兜底用户直接访问 inftab 域名
      showBtn = (currentUrl.indexOf('inftab.com') !== -1);
    } else if (savedStyle === 'custom' && customUrl) {
      try {
        var nC = customUrl.replace('https://', '').replace('http://', '').replace(/\/$/, '');
        var nU = currentUrl.replace('https://', '').replace('http://', '').replace(/\/$/, '');
        showBtn = (nU === nC);
      } catch (e) {}
    }

    if (!showBtn) {
      host.style.setProperty('display', 'none', 'important');
    } else {
      host.style.setProperty('top', '30px', 'important');
    }

    /* ========== 样式 + HTML（按钮样式复用 SHARED_BTN_HTML） ========== */
    var css = getSimpleMenuCSS();
    var html = getSimpleMenuHTML(_hsGet('berry_home_switch_method') || 'menu', savedStyle, customUrl);
    shadow.innerHTML = '<style>' + css + '</style>' + SHARED_BTN_HTML + html;

    /* ========== 交互逻辑 ========== */
    var btn     = shadow.getElementById('menuBtn');
    var overlay = shadow.getElementById('shadowMenuOverlay');

    console.log('[berry-menu-btn] FloatingMenu init: btn=' + !!btn + ' overlay=' + !!overlay + ' showBtn=' + showBtn);

    function toggleMenu() { if (overlay) overlay.classList.toggle('open'); }
    function closeMenu() { if (overlay) overlay.classList.remove('open'); }

    if (btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        console.log('[berry-menu-btn] FloatingMenu btn clicked!');
        toggleMenu();
      });
    } else {
      console.warn('[berry-menu-btn] FloatingMenu \u6309\u5143\u7D20\u672A\u627E\u5230!');
    }

    if (overlay) {
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) closeMenu();
      });
    }

    // 暴露全局点击处理函数（供 HTML 内联 onclick 调用 —— 绕过 ArkWeb Shadow DOM addEventListener 问题）
    _page.__berryHandleStyleClick = function(styleKey) {
      console.log('[berry-menu-btn] onclick 切换: ' + styleKey);

      if (styleKey === 'custom') {
        var inputSec = shadow.querySelector('#floatCustomUrlSection') || shadow.querySelector('.f-custom-url-section');
        if (!inputSec) { console.warn('[berry-menu-btn] floatCustomUrlSection 未找到!'); return; }
        var curD = inputSec.style.display;
        if (curD === 'none' || (!curD && !inputSec.classList.contains('visible'))) {
          inputSec.style.display = 'flex';
          inputSec.classList.add('visible');
          console.log('[berry-menu-btn] 自定义: 显示');
        } else {
          inputSec.style.display = 'none';
          inputSec.classList.remove('visible');
          console.log('[berry-menu-btn] 自定义: 隐藏');
        }
        // 标记选中态
        var allItems = shadow.querySelectorAll('.f-home-style-item');
        for (var j = 0; j < allItems.length; j++) allItems[j].classList.remove('active');
        var ci = shadow.querySelector('[data-fstyle="custom"]');
        if (ci) ci.classList.add('active');
        return;
      }

      _hsSet('berry_home_style', styleKey);
      allItems = shadow.querySelectorAll('.f-home-style-item');
      for (j = 0; j < allItems.length; j++) allItems[j].classList.remove('active');
      var ti = shadow.querySelector('[data-fstyle="' + styleKey + '"]');
      if (ti) ti.classList.add('active');

      var isec = shadow.querySelector('#floatCustomUrlSection') || shadow.querySelector('.f-custom-url-section');
      if (isec) { isec.style.display = 'none'; isec.classList.remove('visible'); }

      var sn = { default: '官方默认', itab: 'iTab', inftab: 'infTab' };
      showToast('已切换到' + (sn[styleKey] || styleKey));
      closeMenu();

      // 非主页场景统一导航回主页（主页 doEnhance 的自动加载逻辑会处理 iframe）
      if (styleKey === 'default' || styleKey === 'itab' || styleKey === 'inftab') {
        removeIframe();
        setTimeout(function() {
          var homeUrl;
          if (typeof _page.BerryBrowser !== 'undefined') {
            homeUrl = 'berry://navigate?url=' + encodeURIComponent('resource://rawfile/home.html');
          } else if (_isBerry) {
            homeUrl = 'resource://rawfile/home.html';
          } else {
            homeUrl = '';
          }
          if (homeUrl) {
            try { location.href = homeUrl; } catch(ex) { window.open(homeUrl, '_blank'); }
          }
        }, 100);
      }
    };

    _page.__berryHandleSwitchMethod = function(method) {
      _hsSet('berry_home_switch_method', method);
      var fmItems = shadow.querySelectorAll('.f-switch-method-item');
      for (var k = 0; k < fmItems.length; k++) fmItems[k].classList.remove('active');
      var t = shadow.querySelector('[data-fm="' + method + '"]');
      if (t) t.classList.add('active');
      showToast('切换方式: ' + ({ longpress: '长按', tap: '点击', menu: '菜单' })[method]);
    };

    _page.__berryHandleApply = function() {
      var fui = shadow.getElementById('floatCustomUrlInput') || shadow.querySelector('.f-custom-url-section input');
      if (!fui) return;
      var url = fui.value.trim();
      if (!url) { showToast('请输入网址'); return; }
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      _hsSet('berry_home_custom_url', url);
      _hsSet('berry_home_style', 'custom');
      showToast('已设置，跳转中…');
      closeMenu();
      setTimeout(function() { navigateTo(url); }, 500);
    };

    _page.__berryCloseMenu = function() { closeMenu(); };

    console.log('[berry-menu-btn] 内联 onclick 处理函数已暴露');

    /* 暴露全局接口（非严格模式下） */
    try { _page.globalMenuBtn  = btn; } catch(e) {}
    try { _page.globalMenuBtnHost = host; } catch(e) {}
    try { _page.globalMenuToggle = toggleMenu; } catch(e) {}
    try { _page.globalMenuClose = closeMenu; } catch(e) {}
  }

  /** 悬浮菜单 CSS（与主页原生面板 1:1 复刻） */
  function getSimpleMenuCSS() {
    return [
      /* 宿主：按钮容器 */
      ':host{position:fixed!important;top:30px!important;left:16px!important;z-index:2147483647!important;display:block}',
      /* 遮罩层 — 与原生 .menu-overlay 完全一致 */
      '.f-menu-overlay{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);z-index:200;align-items:flex-start;justify-content:flex-start;overflow-y:auto;overflow-x:hidden}',
      '.f-menu-overlay.open{display:flex!important}',
      /* 面板 — 与原生 .menu-panel 完全一致 */
      '.f-menu-panel{position:relative;margin:62px 16px 20px;width:300px;max-width:calc(100vw-32px);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:24px;padding:2px 12px;box-shadow:0 12px 32px rgba(0,0,0,0.2);border:1px solid rgba(0,0,0,0.08);background:rgba(255,255,255,0.92)}',
      /* 标题 — 与原生 .menu-title 一致 */
      '.f-menu-title{font-size:15px;font-weight:600;color:#222;margin-top:6px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid rgba(0,0,0,0.06)}',
      /* 模式标签 — 与原生 .mode-label 一致 */
      '.f-mode-label{font-size:12px;color:#8e8e93;margin-bottom:8px}',
      /* 选项列表 — 与原生 .home-style-list 一致 */
      '.f-home-style-list{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}',
      /* 选项行 — 与原生 .home-style-item 一致 */
      '.f-home-style-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;border:1.5px solid rgba(0,0,0,0.08);background:rgba(0,0,0,0.04);cursor:pointer;transition:all 0.15s;-webkit-tap-highlight-color:transparent;pointer-events:auto}',
      '.f-home-style-item:hover{background:rgba(0,0,0,0.06)}',
      '.f-home-style-item:active{background:rgba(0,0,0,0.08);transform:scale(0.98)}',
      '.f-home-style-item.active{border-color:#0a58f6;background:rgba(10,88,246,0.08)}',
      /* 图标/信息/勾选 — 与原生 hs-* 一致 */
      '.f-hs-icon{font-size:20px}',
      '.f-hs-info{flex:1;min-width:0}',
      '.f-hs-name{font-size:13px;font-weight:500;color:#222}',
      '.f-hs-desc{font-size:11px;color:#8e8e93}',
      '.f-hs-check{font-size:16px;color:#0a58f6;display:none}',
      '.f-home-style-item.active .f-hs-check{display:block}',
      /* 自定义URL输入区（预渲染，默认隐藏） */
      '.f-custom-url-section{display:none;margin:6px 0 8px;gap:8px}',
      '.f-custom-url-section.visible{display:flex}',
      '.f-custom-url-section input[type="url"]{flex:1;height:34px;border-radius:10px;border:1.5px solid rgba(0,0,0,0.08);background:rgba(0,0,0,0.04);color:#222;font-size:13px;padding:0 10px;outline:none;box-sizing:border-box}',
      '.f-custom-url-section input[type="url"]:focus{border-color:#0a58f6}',
      '.f-custom-url-section button{height:34px;padding:0 12px;border-radius:10px;border:none;background:#0a58f6;color:#fff;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;box-sizing:border-box;pointer-events:auto}',
      '.f-custom-url-section button:active{opacity:0.8}',
      /* 切换方式 */
      '.f-switch-method-label{font-size:12px;color:#8e8e93;margin-bottom:8px}',
      '.f-switch-method-list{display:flex;gap:6px}',
      '.f-switch-method-item{flex:1;padding:8px 4px;border-radius:10px;border:1.5px solid rgba(0,0,0,0.08);background:rgba(0,0,0,0.04);text-align:center;cursor:pointer;transition:all 0.15s;font-size:11px;color:#333;display:flex;align-items:center;justify-content:center;gap:2px;-webkit-tap-highlight-color:transparent;pointer-events:auto}',
      '.f-switch-method-item:active{background:rgba(0,0,0,0.08)}',
      '.f-switch-method-item.active{border-color:#0a58f6;background:rgba(10,88,246,0.08);color:#0a58f6;font-weight:600}',
      /* 关闭按钮 — 与原生完全一致：✕ 关闭 / 10px / padding 7px */
      '.f-close-menu{margin-top:8px;text-align:center;font-size:10px;color:#8e8e93;padding:7px 0;line-height:16px;border-top:1px solid rgba(0,0,0,0.06);cursor:pointer;pointer-events:auto}',
      '.f-close-menu:active{opacity:0.7}'
    ].join('');
  }

  /** 悬浮菜单 HTML（与主页原生面板结构/文案 1:1）—— 自定义输入框预渲染默认隐藏 */
  function getSimpleMenuHTML(savedMethod, savedStyle, savedCustomUrl) {
    var items = [
      { key: 'default', icon: '\uD83D\uDCCC', name: '\u5B98\u65B9\u9ED8\u8BA4', desc: '\u5B98\u65B9\u9ED8\u8BA4\uFF0C\u7B80\u7EA6\u5BFC\u822A' },
      { key: 'itab', icon: '\uD83D\uDD17', name: 'iTab\u65B0\u6807\u7B7E\u9875', desc: '\u5361\u7247\u7EC4\u4EF6\uFF0C\u597D\u770B\u597D\u7528' },
      { key: 'inftab', icon: '\uD83D\uDCF0', name: 'infTab\u4E3B\u9875', desc: '\u5BCC\u5BDB\u56FE\u6807\uFF0C\u4E2A\u6027\u5B9A\u5236' },
      { key: 'custom', icon: '\uD83C\uDF10', name: '\u81EA\u5B9A\u4E49\u8BBF\u95EE\u94FE\u63A5', desc: savedCustomUrl || '\u8F93\u5165\u4EFB\u610F\u7F51\u5740' }
    ];
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var active = (it.key === savedStyle) ? ' active' : '';
      html += '<div class="f-home-style-item' + active + '" data-fstyle="' + it.key + '" onclick="__berryHandleStyleClick(\'' + it.key + '\')">' +
        '<div class="f-hs-icon">' + it.icon + '</div>' +
        '<div class="f-hs-info">' +
          '<div class="f-hs-name">' + it.name + '</div>' +
          '<div class="f-hs-desc">' + it.desc + '</div>' +
        '</div>' +
        '<div class="f-hs-check">\u2713</div>' +
        '</div>';
    }

    // 自定义URL输入框 —— 始终预渲染，根据状态决定是否默认显示
    var customInputVisible = (savedStyle === 'custom' && savedCustomUrl);
    var customInputHtml =
      '<div class="f-custom-url-section' + (customInputVisible ? ' visible' : '') + '" id="floatCustomUrlSection">' +
        '<input type="url" id="floatCustomUrlInput" placeholder="https://example.com" value="' + (savedCustomUrl || '').replace(/"/g, '&quot;') + '">' +
        '<button id="floatCustomUrlApplyBtn" onclick="__berryHandleApply()">\u524D\u5F80</button>' +
      '</div>';

    return (
      '<div class="f-menu-overlay" id="shadowMenuOverlay">' +
        '<div class="f-menu-panel">' +
          '<div class="f-menu-title">\u4E3B\u9875\u8BBE\u7F6E</div>' +
          '<div class="f-mode-label">\uD83C\uDFE0 \u4E3B\u9875\u98CE\u683C</div>' +
          '<div class="f-home-style-list">' + html + '</div>' +
          customInputHtml +
          '<div class="f-switch-method-label">&#x1F504; \u5207\u6362\u65B9\u5F0F</div>' +
          '<div class="f-switch-method-list">' +
            '<div class="f-switch-method-item' + (savedMethod==='longpress'?' active':'')+'" data-fm="longpress" onclick="__berryHandleSwitchMethod(\'longpress\')"><span>\u2B05\uFE0F</span><span>\u957F\u6309</span></div>' +
            '<div class="f-switch-method-item' + (savedMethod==='tap'?' active':'')+'" data-fm="tap" onclick="__berryHandleSwitchMethod(\'tap\')"><span>\uD83D\uDC46</span><span>\u70B9\u51FB</span></div>' +
            '<div class="f-switch-method-item' + (savedMethod==='menu'?' active':'')+'" data-fm="menu" onclick="__berryHandleSwitchMethod(\'menu\')"><span>&#x2630;</span><span>\u83DC\u5355</span></div>' +
          '</div>' +
          '<div class="f-close-menu" onclick="__berryCloseMenu()">\u2715 \u5173\u95ED</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ========== 根据 DOM 就绪状态决定执行时机 ========== */
  if (_doc.readyState === 'loading') {
    _doc.addEventListener('DOMContentLoaded', init);
  } else {
    if (requestAnimationFrame) { requestAnimationFrame(init); } else { init(); }
  }

})();
