/**
 * Berry Menu Remote - 主页菜单增强（远程加载版）
 * 仅在主页 resource://rawfile/home.html 内运行
 * 通过 window.__berryGM 桥接油猴脚本的 GM 存储
 * @version 1.0.0
 */
(function () {
  'use strict';

  var _doc = document;

  // 防止重复注入
  if (window.__berryMenuRemoteLoaded) return;
  window.__berryMenuRemoteLoaded = true;

  /* ========== GM 桥接层（油猴脚本在 document_start 注入 __berryGM）========== */
  function gmGet(key, defaultVal) {
    try {
      if (window.__berryGM && typeof window.__berryGM.get === 'function') {
        var v = window.__berryGM.get(key);
        if (v !== undefined && v !== null && v !== '') return v;
      }
    } catch (e) {}
    // fallback: homeStorage
    try {
      if (window.BerryHomeMenu && window.BerryHomeMenu.hsGet) {
        var h = window.BerryHomeMenu.hsGet(key);
        if (h !== undefined && h !== null && h !== '') return h;
      }
    } catch (e) {}
    return defaultVal;
  }

  function gmSet(key, val) {
    try {
      if (window.__berryGM && typeof window.__berryGM.set === 'function') {
        window.__berryGM.set(key, val);
      }
    } catch (e) {}
  }

  /* ========== 导航 ========== */
  function navigateTo(url) {
    if (typeof window.BerryBrowser !== 'undefined') {
      try { location.href = 'berry://navigate?url=' + encodeURIComponent(url); return; } catch (e) {}
    }
    try { location.href = url; } catch (e) { window.open(url, '_blank'); }
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
    console.log('[berry-remote] iframe load: ' + url);
  }

  function removeIframe() {
    var iframe = _doc.getElementById(IFRAME_ID);
    if (iframe) { iframe.remove(); console.log('[berry-remote] iframe removed'); }
  }

  /* ========== 自定义 URL 输入框 ========== */
  function _handleCustomUrlApply(api, inputEl) {
    if (!inputEl) return;
    var url = inputEl.value.trim();
    if (!url) { api.showToast('please enter URL'); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    gmSet('berry_home_custom_url', url);
    gmSet('berry_home_style', 'custom');
    api.hsSet('berry_home_custom_url', url);
    api.hsSet('berry_home_style', 'custom');
    api.selectStyle('custom');
    navigateTo(url);
  }

  function _showCustomUrl(api, defaultValue) {
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
      sectionEl = api.addSection(html);
      if (!sectionEl) return;
      if (extContainer) {
        var sw = extContainer.querySelector('.switch-method-section');
        if (sw) { sw.parentNode.insertBefore(sectionEl, sw); }
      }
    }

    var input = sectionEl.querySelector('#scriptCustomUrlInput');
    if (input && defaultValue) input.value = defaultValue;
    var btn = sectionEl.querySelector('#scriptCustomUrlApplyBtn');
    if (btn) {
      btn.addEventListener('click', function () { _handleCustomUrlApply(api, input); });
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

  /* ========== 切换方式 ========== */
  function injectSwitchMethodCSS() {
    if (_doc.getElementById('_berrySwitchMethodCSS')) return;
    var style = _doc.createElement('style');
    style.id = '_berrySwitchMethodCSS';
    style.textContent = [
      '.switch-method-section { margin-bottom: 8px; }',
      '.switch-method-label { font-size: 12px; font-weight: 500; margin-bottom: 6px; color: var(--text-sub, #8e8e93); }',
      '.switch-method-list { display: flex; gap: 6px; }',
      '.switch-method-item {',
      '  flex: 1; padding: 8px 4px; border-radius: 10px;',
      '  border: 1.5px solid var(--border-color, rgba(0,0,0,0.08));',
      '  background: var(--btn-secondary-bg, rgba(0,0,0,0.04));',
      '  text-align: center; cursor: pointer; transition: all 0.15s;',
      '  font-size: 11px; color: var(--text, #1c1c1e);',
      '  display: flex; align-items: center; justify-content: center; gap: 2px;',
      '}',
      '.switch-method-item:active { background: var(--btn-active-bg, rgba(0,0,0,0.08)); }',
      '.switch-method-item.active {',
      '  border-color: var(--slider-color, #0a58f6);',
      '  background: rgba(10,88,246,0.08);',
      '  color: var(--slider-color, #0a58f6); font-weight: 600;',
      '}',
      'html.berry-dark .switch-method-item.active {',
      '  background: rgba(249,115,22,0.12);',
      '  border-color: #f97316; color: #f97316;',
      '}'
    ].join('\n');
    _doc.head.appendChild(style);
  }

  function bindSwitchMethodEvents(sectionEl, api) {
    var items = sectionEl.querySelectorAll('.switch-method-item');
    for (var i = 0; i < items.length; i++) {
      (function (item) {
        item.addEventListener('click', function () {
          var method = item.getAttribute('data-method');
          api.hsSet('berry_home_switch_method', method);
          gmSet('berry_home_switch_method', method);
          var all = sectionEl.querySelectorAll('.switch-method-item');
          for (var j = 0; j < all.length; j++) all[j].classList.remove('active');
          item.classList.add('active');
          api.showToast('\u5207\u6362\u65B9\u5F0F\u5DF2\u8BBE\u4E3A\uFF1A' + ({ longpress: '\u957F\u6309', tap: '\u70B9\u51FB', menu: '\u83DC\u5355' })[method]);
        });
      })(items[i]);
    }
  }

  /* ========== 主逻辑：增强原生菜单 ========== */
  function doEnhance(api) {
    console.log('[berry-remote] enhancing native menu');

    api.removePlaceholder();

    var savedStyle = gmGet('berry_home_style', api.hsGet('berry_home_style')) || 'default';
    var savedCustomUrl = gmGet('berry_home_custom_url', api.hsGet('berry_home_custom_url')) || '';

    // itab
    api.addItem({
      key: 'itab',
      icon: '\uD83D\uDD17',
      name: 'iTab\u65B0\u6807\u7B7E\u9875',
      desc: '\u5361\u7247\u7EC4\u4EF6\uFF0C\u597D\u770B\u597D\u7528',
      active: savedStyle === 'itab',
      onClick: function () {
        _hideCustomUrl();
        removeIframe();
        gmSet('berry_home_style', 'itab');
        api.hsSet('berry_home_style', 'itab');
        loadInIframe('https://go.itab.link/');
      }
    });

    // inftab
    api.addItem({
      key: 'inftab',
      icon: '\uD83D\uDCF0',
      name: 'infTab\u4E3B\u9875',
      desc: '\u4E30\u5BCC\u56FE\u6807\uFF0C\u4E2A\u6027\u5B9A\u5236',
      active: savedStyle === 'inftab',
      onClick: function () {
        _hideCustomUrl();
        removeIframe();
        gmSet('berry_home_style', 'inftab');
        api.hsSet('berry_home_style', 'inftab');
        loadInIframe('https://inftab.com/');
      }
    });

    // custom
    api.addItem({
      key: 'custom',
      icon: '\uD83C\uDF10',
      name: '\u81EA\u5B9A\u4E49\u8BBF\u95EE\u94FE\u63A5',
      desc: '\u8F93\u5165\u4EFB\u610F\u7F51\u5740',
      active: savedStyle === 'custom',
      onClick: function () {
        _showCustomUrl(api, savedCustomUrl);
      }
    });

    // switch method section
    var savedMethod = api.hsGet('berry_home_switch_method') || 'menu';
    injectSwitchMethodCSS();

    var switchSectionHTML =
      '<div class="switch-method-section">' +
        '<div class="switch-method-label">\uD83D\uDD04 \u5207\u6362\u65B9\u5F0F</div>' +
        '<div class="switch-method-list">' +
          '<div class="switch-method-item' + (savedMethod === 'longpress' ? ' active' : '') + '" data-method="longpress"><span>\u2B05\uFE0F</span><span>\u957F\u6309</span></div>' +
          '<div class="switch-method-item' + (savedMethod === 'tap' ? ' active' : '') + '" data-method="tap"><span>\uD83D\uDC46</span><span>\u70B9\u51FB</span></div>' +
          '<div class="switch-method-item' + (savedMethod === 'menu' ? ' active' : '') + '" data-method="menu"><span>\u2630</span><span>\u83DC\u5355</span></div>' +
        '</div>' +
      '</div>';

    var switchSectionEl = api.addSection(switchSectionHTML);
    if (switchSectionEl) bindSwitchMethodEvents(switchSectionEl, api);

    if (savedStyle === 'custom' && savedCustomUrl) {
      _showCustomUrl(api, savedCustomUrl);
    }

    if (typeof api.onStyleChange === 'function') {
      api.onStyleChange(function (newStyle) {
        if (newStyle === 'default') removeIframe();
      });
    }

    api.selectStyle(savedStyle);

    // auto-load
    if (savedStyle === 'custom' && savedCustomUrl) {
      setTimeout(function () { navigateTo(savedCustomUrl); }, 300);
    } else if (savedStyle === 'itab') {
      setTimeout(function () { loadInIframe('https://go.itab.link/'); }, 300);
    } else if (savedStyle === 'inftab') {
      setTimeout(function () { loadInIframe('https://inftab.com/'); }, 300);
    }

    console.log('[berry-remote] menu enhancement done');
  }

  /* ========== 等待 BerryHomeMenu API ========== */
  function initHomepageEnhance() {
    var api = window.BerryHomeMenu;
    if (api) { doEnhance(api); return; }

    var retries = 0;
    var pollTimer = setInterval(function () {
      retries++;
      api = window.BerryHomeMenu;
      if (api) {
        clearInterval(pollTimer);
        doEnhance(api);
      } else if (retries > 30) {
        clearInterval(pollTimer);
        console.warn('[berry-remote] BerryHomeMenu API not ready after 3s');
      }
    }, 100);
  }

  /* ========== 启动 ========== */
  if (_doc.readyState === 'loading') {
    _doc.addEventListener('DOMContentLoaded', initHomepageEnhance);
  } else {
    initHomepageEnhance();
  }

})();
