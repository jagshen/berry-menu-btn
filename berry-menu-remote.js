/**
 * Berry Menu Remote
 * 依赖 userscript 注入全局对象
 * 包含：主页增强+ 悬浮按钮 + 域名匹配
 * @version 2.2.8
 */
(function () {
  'use strict';

  var _DEBUG = false;
  var _doc = document;
  var _page = window;

  // 防止重复注入
  if (_page.__berryMenuRemoteLoaded) return;
  _page.__berryMenuRemoteLoaded = true;

  _page.BerryMenuRemote = _page.BerryMenuRemote || {};
  var BerryMenuRemote = _page.BerryMenuRemote;

  /* ========== 从userscript 桥接获取 API ========== */
  var bridge = _page.__berryMenu || {};
  var config = bridge.config || {};
  var api = bridge.api || {};

  // 兼容：如果桥接未就绪，自行实现基本功能
  var _isBerry = config.isBerry || !!(typeof _page.BerryBrowser !== 'undefined' || _page._berry_homepage);

  function storageGet(key, defaultVal) {
    if (api.storageGet) return api.storageGet(key, defaultVal);
    try {
      if (typeof _page.BerryBrowser !== 'undefined' && _page.BerryBrowser.homeStorageGet) {
        var v = _page.BerryBrowser.homeStorageGet(key);
        if (v !== null && v !== undefined && v !== '') return v;
      }
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
  }

  function navigateTo(url) {
    if (api.navigateTo) { api.navigateTo(url); return; }
    if (_isBerry) {
      try { location.href = 'berry://navigate?url=' + encodeURIComponent(url); return; } catch (e) {}
    }
    try { location.href = url; } catch (e) { window.open(url, '_blank'); }
  }

  function checkNetworkAlive() {
    return new Promise(function(resolve) {
      if (!navigator.onLine) return resolve(false);
      var img = new Image();
      img.onload = function() { resolve(true); };
      img.onerror = function() { resolve(false); };
      setTimeout(function() { resolve(false); }, 2000);
      img.src = 'https://www.baidu.com/favicon.ico?_t=' + Date.now();
    });
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
      (_doc.body || _doc.documentElement).appendChild(iframe);
    }
    iframe.src = url;
  }

  function removeIframe() {
    var el = _doc.getElementById(IFRAME_ID);
    if (el) el.remove();
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

  /** 域名匹配：一方是另一方的域名后缀即认为匹配（支持子域名跳转） */
  function domainMatches(url1, url2) {
    var d1 = extractCoreDomain(url1);
    var d2 = extractCoreDomain(url2);
    if (!d1 || !d2) return false;
    if (d2.indexOf('.') === -1) return false;
    if (d1 === d2) return true;
    return d1.endsWith('.' + d2);
  }


  /* ══════════════════════════════════════
     显示方式逻辑（always/longpress/dblclick）
     ══════════════════════════════════════ */
  function setupDisplayMethodHome(isFlash) {
    var savedMethod = storageGet('berry_home_switch_method') || 'always';
    var zone = _doc.getElementById('switchZone')
        || _doc.getElementById('menuBtnWrap');
    // 移除旧的热区
    var oldHot = _doc.getElementById('__hotZone');
    if (oldHot) oldHot.remove();
    // zone 找不到时，无论何种模式都不做任何隐藏操作，直接返回
    if (!zone) return;
    if (savedMethod === 'always') {
      zone.style.display = '';
    } else {
      zone.style.display = 'none';
      createHotZone(zone, savedMethod, false, null, isFlash || false);
    }
  }

  function setupDisplayMethodFloat(shadow, isFlash, onToggle) {
    var savedMethod = storageGet('berry_home_switch_method') || 'always';
    var zone = shadow ? shadow.querySelector('#menuBtnWrap') : null;
    var hotZone = _doc.getElementById('__floatHotZone'); // 热区挂在主文档，从主文档查
    // 移除旧热区
    if (hotZone) hotZone.remove();
    if (savedMethod === 'always') {
      if (zone) zone.style.display = '';
    } else {
      if (zone) zone.style.display = 'none';
      createHotZone(zone, savedMethod, true, shadow, isFlash || false, onToggle);
    }
  }

  function createHotZone(targetBtn, method, isShadow, shadow, isFlash, onToggle) {
    var hot = _doc.createElement('div');
    hot.id = isShadow ? '__floatHotZone' : '__hotZone';
    var btnTopNum = (isShadow && !isHomePage()) ? 15 : 45;
    var btnLeft = 16;
    var btnSize = 28;
    hot.style.cssText = 'position:fixed;top:' + btnTopNum + 'px;left:0;width:120px;height:120px;z-index:999999;cursor:default;pointer-events:none;';

    if (method === 'longpress') {
      var timer = null, triggered = false;
      hot.addEventListener('mousedown', function() {
        hot.style.pointerEvents = 'auto';
        clearTimeout(timer); triggered = false;
        timer = setTimeout(function() { triggered = true; show(); }, 500);
      });
      hot.addEventListener('touchstart', function(e) {
        hot.style.pointerEvents = 'auto';
        clearTimeout(timer); triggered = false;
        timer = setTimeout(function() { triggered = true; show(); }, 500);
      }, { passive: true });
      hot.addEventListener('mouseup', function() {
        clearTimeout(timer);
        hot.style.pointerEvents = 'none';
      });
      hot.addEventListener('touchend', function() {
        clearTimeout(timer);
        hot.style.pointerEvents = 'none';
      });
      hot.addEventListener('mouseleave', function() {
        clearTimeout(timer);
        hot.style.pointerEvents = 'none';
      });
    } else if (method === 'dblclick') {
      var dblTimer = null;
      hot.addEventListener('touchstart', function() {
        hot.style.pointerEvents = 'auto';
      }, { passive: true });
      hot.addEventListener('touchend', function() {
        if (dblTimer) {
          clearTimeout(dblTimer); dblTimer = null;
          hot.style.pointerEvents = 'none';
          show();
        } else {
          dblTimer = setTimeout(function() {
            dblTimer = null;
            hot.style.pointerEvents = 'none';
          }, 250);
        }
      });
      hot.addEventListener('mousedown', function() {
        hot.style.pointerEvents = 'auto';
      });
      hot.addEventListener('click', function() {
        if (dblTimer) {
          clearTimeout(dblTimer); dblTimer = null;
          hot.style.pointerEvents = 'none';
          show();
        } else {
          dblTimer = setTimeout(function() {
            dblTimer = null;
            hot.style.pointerEvents = 'none';
          }, 250);
        }
      });
    } else {
      // 常驻模式：热区默认穿透，onToggle 由外部直接绑定到按钮上
    }
    function show() {
      var btn;
      if (isShadow) {
        btn = shadow.querySelector('#menuBtnWrap');
        if (btn) btn.style.display = '';
      } else {
        btn = _doc.getElementById('switchZone');
        if (btn) btn.style.display = '';
      }
      hot.remove();
    }
    _doc.documentElement.appendChild(hot);
    
    // 只在用户手动切换时闪烁
    if (isFlash) {
      // 热区闪烁效果（3次闪烁，每次300ms）
      var flashCount = 0;
      var maxFlashes = 3;
      hot.style.background = 'rgba(10,88,246,0.3)';
      var flashInterval = setInterval(function() {
        if (flashCount >= maxFlashes) {
          clearInterval(flashInterval);
          // 闪烁后完全透明，不显示
          hot.style.background = 'transparent';
          return;
        }
        flashCount++;
        hot.style.background = flashCount % 2 === 0 ? 'rgba(10,88,246,0.3)' : 'transparent';
      }, 300);
    } else {
      // 正常加载时不闪烁，直接透明
      hot.style.background = 'transparent';
    }
  }

  /* ════════════════════════════════════════
     主页场景：通过 BerryHomeMenu API 追加菜单项
     ════════════════════════════════════════ */

  function _handleCustomUrlApply(menuApi, inputEl) {
    if (!inputEl) return;
    var url = inputEl.value.trim();
    if (!url) { menuApi.showTip('请输入网址'); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    storageSet('berry_home_custom_url', url);
    storageSet('berry_home_style', 'custom');
    menuApi.hsSet && menuApi.hsSet('berry_home_custom_url', url);
    menuApi.hsSet && menuApi.hsSet('berry_home_style', 'custom');
    menuApi.selectStyle && menuApi.selectStyle('custom');
    checkNetworkAlive().then(function(online) {
      if (!online) { menuApi.showTip('无网络，重启后生效'); _hideCustomUrl(); return; }
      menuApi.showTip('设置成功，重启生效');
      navigateTo(url);
      _hideCustomUrl();
    });
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
        '<input type="url" id="scriptCustomUrlInput" placeholder="https://www.limestart.cn">' +
        '<button id="scriptCustomUrlApplyBtn">\u524D\u5F80</button>';
      switchSection.parentNode.insertBefore(sectionEl, switchSection);
    } else {
      var html =
        '<div class="custom-url-section" id="scriptCustomUrlSection">' +
        '<input type="url" id="scriptCustomUrlInput" placeholder="https://www.limestart.cn">' +
        '<button id="scriptCustomUrlApplyBtn">\u524D\u5F80</button>' +
        '</div>';
      sectionEl = menuApi.addSection(html);
      if (!sectionEl) return;
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
      '.switch-method-label { font-size: 12px; font-weight: 500; margin-bottom: 8px; color: var(--text-sub, #8e8e93); }',
      '.switch-method-hint { font-size: 11px; color: var(--text-sub, #8e8e93); font-weight: 400; }',
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
      var item = items[i];
      item.addEventListener('click', function() {
        var method = this.getAttribute('data-method');
        storageSet('berry_home_switch_method', method);
        menuApi.hsSet('berry_home_switch_method', method);
        var all = sectionEl.querySelectorAll('.switch-method-item');
        for (var j = 0; j < all.length; j++) all[j].classList.remove('active');
        this.classList.add('active');
        menuApi.showTip('设置成功，重启生效');
        setupDisplayMethodHome(true);
      });
    }
  }

  function doEnhance(menuApi) {
    if (_DEBUG) console.log('[berry-remote] 开始增强原生菜单');
    
    var savedStyle = storageGet('berry_home_style', menuApi.hsGet ? menuApi.hsGet('berry_home_style') : 'default') || 'default';

    menuApi.removePlaceholder && menuApi.removePlaceholder();

    var modeLabel = _doc.querySelector('.mode-label');
    var menuTip = _doc.getElementById('menuTip');

    if (modeLabel) {
      // 让 .mode-label 变成 flex 布局
      modeLabel.style.display = 'flex';
      modeLabel.style.alignItems = 'center';
      modeLabel.style.justifyContent = 'space-between';
      modeLabel.style.gap = '8px';
      modeLabel.style.flexWrap = 'nowrap';
      modeLabel.style.whiteSpace = 'nowrap';

      // 把原始 #menuTip 移入 .mode-label，实现同行显示
      if (menuTip) {
        menuTip.style.margin = '0';
        menuTip.style.padding = '0 3px';
        modeLabel.appendChild(menuTip);
      }

      // 【关键】覆盖原生 showTip，防止原生逻辑把 #menuTip 移回原位置
      var _origShowTip = menuApi.showTip;
      menuApi.showTip = function (msg) {
        // 先调用原生 showTip（它可能会移动 DOM）
        if (typeof _origShowTip === 'function') {
          try { _origShowTip.call(menuApi, msg); } catch (e) { console.warn('[berry-remote] showTip:', e); }
        }
        // 延迟修正位置，等原生逻辑完成 DOM 操作
        setTimeout(function() {
          var tip = _doc.getElementById('menuTip');
          if (tip && tip.parentNode !== modeLabel) {
            modeLabel.appendChild(tip);
          }
        }, 0);
      };
    }

    // 注入 CSS 覆盖 .menu-tip 行内样式（不动 HTML）
    if (!_doc.getElementById('_berryMenuTipCSS')) {
      var tipStyle = _doc.createElement('style');
      tipStyle.id = '_berryMenuTipCSS';
      tipStyle.textContent = [
        '.mode-label{display:flex;align-items:center;justify-content:space-between;gap:8px}',
        /* 对齐原生 .menu-tip 样式：大方块 + 纯 opacity 淡入 */
        '.menu-tip{margin:0;padding:0 3px;background:rgba(10,88,246,0.08);border-radius:12px;display:flex;align-items:center;gap:8px;font-size:13px;color:var(--slider-color,#0a58f6);opacity:0;transition:opacity 0.25s}',
        'html.berry-dark .menu-tip{background:rgba(249,115,22,0.12);color:#f97316}',
        '.menu-tip.show{opacity:1}',
        '.menu-tip .tip-icon{font-size:16px}',
        '.menu-tip .tip-text{flex:1;white-space: nowrap;}'
      ].join('');
      _doc.head.appendChild(tipStyle);
    }

    // 为默认样式添加点击提示
    var defaultItem = _doc.getElementById('styleDefault');
    if (defaultItem) {
      defaultItem.addEventListener('click', function() {
        menuApi.selectStyle && menuApi.selectStyle('default');
        menuApi.showTip('设置成功，重启生效');
      });
    }
    var savedCustomUrl = storageGet('berry_home_custom_url', menuApi.hsGet ? menuApi.hsGet('berry_home_custom_url') : '') || '';

    menuApi.addItem({
      key: 'itab', icon: '\uD83D\uDD17', name: 'iTab\u65B0\u6807\u7B7E\u9875',
      desc: '\u5361\u7247\u7EC4\u4EF6\uFF0C\u597D\u770B\u597D\u7528', active: savedStyle === 'itab',
      onClick: function () {
        _hideCustomUrl();
        storageSet('berry_home_style', 'itab'); menuApi.hsSet && menuApi.hsSet('berry_home_style', 'itab');
        menuApi.selectStyle && menuApi.selectStyle('itab');
        menuApi.showTip('\u8BBE\u7F6E\u6210\u529F\uFF0C\u91CD\u542F\u751F\u6548');
      }
    });

    menuApi.addItem({
      key: 'inftab', icon: '\uD83D\uDCF0', name: 'infTab\u4E3B\u9875',
      desc: '\u4E30\u5BCC\u56FE\u6807\uFF0C\u4E2A\u6027\u5B9A\u5236', active: savedStyle === 'inftab',
      onClick: function () {
        _hideCustomUrl();
        storageSet('berry_home_style', 'inftab'); menuApi.hsSet && menuApi.hsSet('berry_home_style', 'inftab');
        menuApi.selectStyle && menuApi.selectStyle('inftab');
        menuApi.showTip('\u8BBE\u7F6E\u6210\u529F\uFF0C\u91CD\u542F\u751F\u6548');
      }
    });

    menuApi.addItem({
      key: 'custom', icon: '\uD83C\uDF10', name: '\u81EA\u5B9A\u4E49\u94FE\u63A5',
      desc: savedCustomUrl || '\u8F93\u5165\u4EFB\u610F\u7F51\u5740', active: savedStyle === 'custom',
      onClick: function () { _showCustomUrl(menuApi, savedCustomUrl); }
    });

    // 显示方式：控制主页菜单按钮的显示时机
    var savedMethod = storageGet('berry_home_switch_method', menuApi.hsGet ? menuApi.hsGet('berry_home_switch_method') : 'always') || 'always';
    injectSwitchMethodCSS();
    var switchSectionHTML =
      '<div class="switch-method-section">' +
      '<div class="switch-method-label">🔄 显示方式<span class="switch-method-hint">（菜单按钮显示时机，默认左上角区域）</span></div>' +
      '<div class="switch-method-list">' +
      '<div class="switch-method-item' + (savedMethod === 'always' ? ' active' : '') + '" data-method="always"><span>📌</span><span>常驻</span></div>' +
      '<div class="switch-method-item' + (savedMethod === 'longpress' ? ' active' : '') + '" data-method="longpress"><span>⬅️</span><span>长按</span></div>' +
      '<div class="switch-method-item' + (savedMethod === 'dblclick' ? ' active' : '') + '" data-method="dblclick"><span>👆</span><span>双击</span></div>' +
      '</div></div>';
    var switchSectionEl = menuApi.addSection(switchSectionHTML);
    if (switchSectionEl) bindSwitchMethodEvents(switchSectionEl, menuApi);

    // 所有 item 创建完毕后再 selectStyle，确保 applyStyleUI 能找到所有 DOM
    if (savedStyle !== 'custom') {
      menuApi.selectStyle(savedStyle);
    }

    if (savedStyle === 'custom' && savedCustomUrl) _showCustomUrl(menuApi, savedCustomUrl);

    // 根据保存的显示方式初始化菜单按钮状态
    setupDisplayMethodHome(false);

    if (_DEBUG) console.log('[berry-remote] 原生菜单增强完成');
  }

  /* ════════════════════════════════════════
     非主页场景：创建独立悬浮菜单（Shadow DOM）
     ════════════════════════════════════════ */

  function initFloatingMenu() {
    var savedStyle = storageGet('berry_home_style') || 'default';
    var customUrl = storageGet('berry_home_custom_url') || '';
    var currentUrl = location.href || '';

    if (_DEBUG) console.log('[berry-remote] FloatingMenu: savedStyle=' + savedStyle + ' customUrl=' + customUrl);

    /* 判断是否显示按钮 */
    var showBtn = false;

    if (savedStyle === 'custom' && customUrl) {
      showBtn = domainMatches(currentUrl, customUrl);
    }

    if (_DEBUG) console.log('[berry-remote] showBtn=' + showBtn + ' coreDomain(current)=' + extractCoreDomain(currentUrl) + ' coreDomain(saved)=' + extractCoreDomain(customUrl));

    if (!showBtn) return;

    /* ========== 创建 Shadow DOM 宿主 ========== */
    if (_doc.getElementById('globalMenuBtnHost')) return;

    var host = _doc.createElement('div');
    host.id = 'globalMenuBtnHost';
    var isHome = isHomePage();
    var btnTop = isHome ? '45px' : '15px';
    var HOST_BTN_STYLE = 'position:fixed!important;top:' + btnTop + '!important;left:16px!important;width:36px!important;height:36px!important;z-index:999998!important;pointer-events:auto!important;overflow:visible!important';
    var HOST_MENU_STYLE = 'position:fixed!important;top:0!important;left:0!important;width:100%!important;height:100%!important;z-index:999998!important;pointer-events:auto!important;overflow:visible!important';
    host.style.cssText = HOST_BTN_STYLE;
    if (_doc.documentElement) {
      _doc.documentElement.appendChild(host);
    }

    var shadow = host.attachShadow({ mode: 'open' });

    /* ========== 按钮 + 菜单 HTML ========== */
    var savedMethod = storageGet('berry_home_switch_method') || 'always';
    var css = getMenuCSS(isHome);
    var html = getMenuHTML(savedMethod, savedStyle, customUrl);
    shadow.innerHTML = '<style>' + css + '</style>' + html;

    /* ========== 交互 ========== */
    var btn = shadow.querySelector('#menuBtn');
    var overlay = shadow.querySelector('#shadowMenuOverlay');

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

    var _floatTipTimer = null;
    function showFloatTip(msg) {
      var tipEl = shadow.querySelector('#floatMenuTip');
      if (!tipEl) return;
      var textEl = tipEl.querySelector('.f-tip-text');
      if (!textEl) return;
      textEl.textContent = msg;
      tipEl.classList.add('show');
      clearTimeout(_floatTipTimer);
      _floatTipTimer = setTimeout(function() { tipEl.classList.remove('show'); }, 2500);
    }

    BerryMenuRemote.__berryHandleSwitchMethod = function (method) {
      storageSet("berry_home_switch_method", method);
      var fmItems = shadow.querySelectorAll(".f-switch-method-item");
      for (var k = 0; k < fmItems.length; k++) fmItems[k].classList.remove("active");
      var t = shadow.querySelector('[data-fm="' + method + '"]');
      if (t) t.classList.add("active");
      showFloatTip('设置成功');
      setupDisplayMethodFloat(shadow, true, toggleMenu);
    };

    BerryMenuRemote.__berryHandleApply = function () {
      var fui = shadow.querySelector('#floatCustomUrlInput');
      if (!fui) return;
      var url = fui.value.trim();
      if (!url) { url = 'https://www.limestart.cn'; }
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      storageSet('berry_home_custom_url', url);
      storageSet('berry_home_style', 'custom');
      // 先 cleanup，再跳转（navigateTo 可能同步修改 location）
      var isec = shadow.querySelector('#floatCustomUrlSection');
      if (isec) { isec.style.display = 'none'; isec.classList.remove('visible'); }
      closeMenu();
      checkNetworkAlive().then(function(online) {
        if (!online) { showFloatTip('无网络，重启后生效'); return; }
        navigateTo(url);
      });
    };

    BerryMenuRemote.__berryCloseMenu = function () { closeMenu(); };

    /* 暴露全局接口 */
    try { _page.globalMenuBtn = btn; } catch (e) {}
    try { _page.globalMenuBtnHost = host; } catch (e) {}
    try { _page.globalMenuToggle = toggleMenu; } catch (e) {}
    try { _page.globalMenuClose = closeMenu; } catch (e) {}

    if (_DEBUG) console.log('[berry-remote] 悬浮按钮已创建');

    // 初始化显示方式
    setupDisplayMethodFloat(shadow, false, toggleMenu);

    // 统一事件委托（合并两个 overlay click 监听为一个）
    if (overlay) {
      overlay.addEventListener('click', function(e) {
        var target = e.target;
        if (!target) return;

        // 兼容不支持 closest 的旧版引擎
        function closest(el, cls) {
          while (el && el !== overlay) {
            if (el.classList && el.classList.contains(cls)) return el;
            el = el.parentNode;
          }
          return null;
        }

        // 点遮罩背景关闭
        if (target === overlay) { closeMenu(); return; }

        // 风格选择
        var styleTarget = closest(target, 'f-home-style-item');
        if (styleTarget) {
          var styleKey = styleTarget.getAttribute('data-fstyle');
          if (styleKey === 'custom') {
            var inputSec = shadow.querySelector('#floatCustomUrlSection');
            if (inputSec) {
              if (!inputSec.classList.contains('visible')) {
                // 展开输入框，同时高亮 custom
                var allItems = shadow.querySelectorAll('.f-home-style-item');
                for (var j = 0; j < allItems.length; j++) allItems[j].classList.remove('active');
                styleTarget.classList.add('active');
                inputSec.style.display = 'flex';
                inputSec.classList.add('visible');
              } else {
                inputSec.style.display = 'none';
                inputSec.classList.remove('visible');
              }
            }
          } else if (styleKey) {
            storageSet('berry_home_style', styleKey);
            var allItems = shadow.querySelectorAll('.f-home-style-item');
            for (var j = 0; j < allItems.length; j++) allItems[j].classList.remove('active');
            var ti = shadow.querySelector('[data-fstyle="' + styleKey + '"]');
            if (ti) ti.classList.add('active');
            var isec = shadow.querySelector('#floatCustomUrlSection');
            if (isec) { isec.style.display = 'none'; isec.classList.remove('visible'); }
            showFloatTip('设置成功，重启生效');
          }
          return;
        }

        // 显示方式
        var switchTarget = closest(target, 'f-switch-method-item');
        if (switchTarget) {
          var methodKey = switchTarget.getAttribute('data-fm');
          if (methodKey && typeof BerryMenuRemote.__berryHandleSwitchMethod === 'function') {
            BerryMenuRemote.__berryHandleSwitchMethod(methodKey);
          }
          return;
        }

        // 关闭按钮
        if (closest(target, 'f-close-menu')) {
          closeMenu();
        }
      });
    }

    // 自定义链接前往按钮
    var applyBtn = shadow.querySelector('#floatApplyBtn');
    if (applyBtn && BerryMenuRemote.__berryHandleApply) {
      applyBtn.addEventListener('click', BerryMenuRemote.__berryHandleApply);
    }
  }

  /* ========== 悬浮菜单 CSS ========== */
  function getMenuCSS(isHome) {
    var btnTop = isHome ? '45px' : '15px';
    var panelTop = isHome ? '77px' : '47px';
    var btnLeft = '16px';
    var panelMargin = (panelTop + ' 20px 20px 16px');
    return [
      ':host{display:block!important;overflow:visible!important}',
      '.btn-wrap{position:fixed;top:' + btnTop + '!important;left:' + btnLeft + '!important;z-index:999999;pointer-events:auto}',
      '.btn{width:28px;height:28px;border-radius:7px;background:rgba(255,255,255,0.25);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:999999;transition:all 0.2s;border:1.5px solid rgba(255,255,255,0.4);outline:0;box-shadow:0 2px 8px rgba(0,0,0,0.15);-webkit-tap-highlight-color:transparent}',
      '.btn:active{transform:scale(0.92);background:rgba(255,255,255,0.4)}',
      '.btn:hover{background:rgba(255,255,255,0.40);border-color:rgba(255,255,255,0.55);box-shadow:0 2px 12px rgba(0,0,0,0.2)}',
      'html.berry-dark .btn,html.dark .btn,[data-theme="dark"] .btn{background:rgba(30,30,30,0.5);border-color:rgba(255,255,255,0.25);box-shadow:0 2px 8px rgba(0,0,0,0.3)}',
      '.menu-icon{width:16px;height:12px;display:flex;flex-direction:column;justify-content:space-between}',
      '.menu-icon span{display:block;width:100%;height:1.8px;border-radius:2px;background-color:#555}',
      ':host-context(html.berry-dark) .menu-icon span,:host-context(html.dark) .menu-icon span{background-color:#aaa}',
      '.f-menu-overlay{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);z-index:200;align-items:flex-start;justify-content:flex-start;overflow-y:auto;overflow-x:hidden}',
      '.f-menu-overlay.open{display:flex!important}',
      '.f-menu-panel{position:relative;margin:' + panelMargin + ';width:300px;max-width:calc(100vw - 40px);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:24px;padding:2px 12px;box-shadow:0 12px 32px rgba(0,0,0,0.2);border:1px solid rgba(0,0,0,0.08);background:rgba(255,255,255,0.92);pointer-events:auto}',
      '.f-menu-title{font-size:15px;font-weight:600;color:#222;margin-top:6px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid rgba(0,0,0,0.06)}',
      '.f-mode-label{font-size:12px;color:#8e8e93;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:nowrap}',
      '.f-home-style-list{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}',
      '.f-home-style-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;border:1.5px solid rgba(0,0,0,0.08);background:rgba(0,0,0,0.04);cursor:pointer;transition:all 0.15s;-webkit-tap-highlight-color:transparent;pointer-events:auto}',
      '.f-home-style-item:active{background:rgba(0,0,0,0.08);transform:scale(0.98)}',
      '.f-home-style-item.active{border-color:#0a58f6;background:rgba(10,88,246,0.08)}',
      '.f-hs-icon{font-size:20px}',
      '.f-hs-info{flex:1;min-width:0}',
      '.f-hs-name{font-size:13px;font-weight:500;color:#222}',
      ':host-context(html.berry-dark) .f-hs-name,:host-context(html.dark) .f-hs-name{color:#eee}',
      '.f-hs-desc{font-size:11px;color:#8e8e93}',
      ':host-context(html.berry-dark) .f-hs-desc,:host-context(html.dark) .f-hs-desc{color:#aaa}',
      '.f-hs-check{font-size:16px;color:var(--slider-color,#0a58f6);display:none}',
      '.f-home-style-item.active .f-hs-check{display:block}',
      '.f-custom-url-section{display:none;margin:6px 0 8px;gap:8px}',
      '.f-custom-url-section.visible{display:flex}',
      '.f-custom-url-section input[type="url"]{flex:1;height:38px;border-radius:10px;border:1.5px solid var(--border-color, rgba(0,0,0,0.08));background:var(--btn-secondary-bg, rgba(0,0,0,0.04));color:var(--text,#1c1c1e);font-size:13px;padding:0 10px;outline:none;box-sizing:border-box}',
      '.f-custom-url-section input[type="url"]:focus{border-color:var(--slider-color, #0a58f6)}',
      '.f-custom-url-section button{height:38px;padding:0 14px;border-radius:10px;border:none;background:var(--slider-color, #0a58f6);color:#fff;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;box-sizing:border-box;pointer-events:auto;-webkit-tap-highlight-color:transparent}',
      '.f-custom-url-section button:active{opacity:0.8}',
      /* 对齐原生 .menu-tip 样式 */
      '.f-menu-tip{margin:0;padding:0 3px;background:rgba(10,88,246,0.08);border-radius:12px;display:flex;align-items:center;gap:8px;font-size:13px;color:var(--slider-color,#0a58f6);opacity:0;transition:opacity 0.25s}',
      ':host-context(html.berry-dark) .f-menu-tip{background:rgba(249,115,22,0.12);color:#f97316}',
      '.f-menu-tip.show{opacity:1}',
      '.f-menu-tip .f-tip-icon{font-size:16px}',
      '.f-menu-tip .f-tip-text{overflow:hidden;text-overflow:ellipsis;flex:1;white-space:nowrap}',
      '.f-switch-method-label{font-size:12px;font-weight:500;color:#8e8e93;margin-bottom:8px}',
      '.switch-method-hint{font-size:11px;color:#8e8e93;font-weight:400}',
      '.f-switch-method-list{display:flex;gap:6px}',
      '.f-switch-method-item{flex:1;padding:8px 4px;border-radius:10px;border:1.5px solid rgba(0,0,0,0.08);background:rgba(0,0,0,0.04);text-align:center;cursor:pointer;transition:all 0.15s;font-size:11px;color:var(--text,#1c1c1e);display:flex;align-items:center;justify-content:center;gap:2px;-webkit-tap-highlight-color:transparent;pointer-events:auto}',
      '.f-switch-method-item:active{background:rgba(0,0,0,0.08)}',
      '.f-switch-method-item.active{border-color:var(--slider-color,#0a58f6);background:rgba(10,88,246,0.08);color:var(--slider-color,#0a58f6);font-weight:600}',
      ':host-context(html.berry-dark) .f-switch-method-item.active,:host-context(html.dark) .f-switch-method-item.active{background:rgba(249,115,22,0.12);border-color:#f97316;color:#f97316}',
      '.f-close-menu{margin-top:8px;text-align:center;font-size:10px;color:#8e8e93;padding:7px 0;line-height:16px;border-top:1px solid rgba(0,0,0,0.06);cursor:pointer;pointer-events:auto;-webkit-tap-highlight-color:transparent}',
      '.f-close-menu:active{opacity:0.7}'
    ].join('');
  }

  /* ========== 悬浮菜单 HTML（包含按钮，且按钮初始 display 由 savedMethod 决定） ========== */
  function getMenuHTML(savedMethod, savedStyle, savedCustomUrl) {
    var btnDisplay = (savedMethod === 'always') ? 'block' : 'none';
    var btnHtml = '<div class="btn-wrap" id="menuBtnWrap" style="display:' + btnDisplay + ';">' +
                  '<button type="button" class="btn" id="menuBtn" aria-label="打开菜单">' +
                  '<div class="menu-icon"><span></span><span></span><span></span></div>' +
                  '</button></div>';
    
    var items = [
      { key: 'default', icon: '\uD83D\uDCCC', name: '\u5B98\u65B9\u9ED8\u8BA4', desc: '\u5B98\u65B9\u9ED8\u8BA4\uFF0C\u7B80\u7EA6\u5BFC\u822A' },
      { key: 'itab', icon: '\uD83D\uDD17', name: 'iTab\u65B0\u6807\u7B7E\u9875', desc: '\u5361\u7247\u7EC4\u4EF6\uFF0C\u597D\u770B\u597D\u7528' },
      { key: 'inftab', icon: '\uD83D\uDCF0', name: 'infTab\u4E3B\u9875', desc: '\u4E30\u5BCC\u56FE\u6807\uFF0C\u4E2A\u6027\u5B9A\u5236' },
      { key: 'custom', icon: '\uD83C\uDF10', name: '\u81EA\u5B9A\u4E49\u94FE\u63A5', desc: savedCustomUrl || '\u8F93\u5165\u4EFB\u610F\u7F51\u5740' }
    ];
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var active = (it.key === savedStyle) ? ' active' : '';
      html += '<div class="f-home-style-item' + active + '" data-fstyle="' + it.key + '">' +
        '<div class="f-hs-icon">' + it.icon + '</div>' +
        '<div class="f-hs-info"><div class="f-hs-name">' + it.name + '</div><div class="f-hs-desc">' + it.desc + '</div></div>' +
        '<div class="f-hs-check">\u2713</div></div>';
    }

    var customInputVisible = (savedStyle === 'custom' && savedCustomUrl);
    var customInputHtml =
      '<div class="f-custom-url-section' + (customInputVisible ? ' visible' : '') + '" id="floatCustomUrlSection">' +
      '<input type="url" id="floatCustomUrlInput" placeholder="https://www.limestart.cn" value="' + (savedCustomUrl || '').replace(/"/g, '&quot;') + '">' +
      '<button id="floatApplyBtn">\u524D\u5F80</button></div>';

    return btnHtml +
      '<div class="f-menu-overlay" id="shadowMenuOverlay">' +
      '<div class="f-menu-panel">' +
      '<div class="f-menu-title">\u6781\u7B80\u4E3B\u9875</div>' +
      '<div class="f-mode-label"><span>\uD83C\uDFE0 \u6781\u7B80\u98CE\u683C</span>' +
      '<div class="f-menu-tip" id="floatMenuTip"><span class="f-tip-text"></span></div></div>' +
      '<div class="f-home-style-list">' + html + '</div>' +
      customInputHtml +
      '<div class="f-switch-method-label">🔄 显示方式<span class="switch-method-hint">（菜单按钮显示时机，默认左上角区域）</span></div>' +
      '<div class="f-switch-method-list">' +
      '<div class="f-switch-method-item' + (savedMethod === 'always' ? ' active' : '') + '" data-fm="always"><span>📌</span><span>常驻</span></div>' +
      '<div class="f-switch-method-item' + (savedMethod === 'longpress' ? ' active' : '') + '" data-fm="longpress"><span>⬅️</span><span>长按</span></div>' +
      '<div class="f-switch-method-item' + (savedMethod === 'dblclick' ? ' active' : '') + '" data-fm="dblclick"><span>👆</span><span>双击</span></div>' +
      '</div>' +
      '<div class="f-close-menu">\u2715 \u5173\u95ED</div>' +
      '</div></div>'
    ;
  }

  /* ════════════════════════════════════════
     下次启动时加载保存的主页风格
     ════════════════════════════════════════ */

  var STYLE_IFRAME_URLS = {
    itab: 'https://go.itab.link/',
    inftab: 'https://inftab.com/'
  };

  function applySavedStyle(menuApi) {
    var savedStyle = storageGet('berry_home_style') || 'default';

    // 把各风格的 iframe URL 写入 storage，供 极简主页.html 内联脚本下次启动时直接读取
    for (var k in STYLE_IFRAME_URLS) {
      storageSet('berry_home_iframe_url_' + k, STYLE_IFRAME_URLS[k]);
    }

    // default 风格：移除可能残留的 iframe
    if (savedStyle === 'default') {
      removeIframe();
      return Promise.resolve(false);
    }

    // custom 风格：未安装 userscript 时停留官方默认，不跳转
    if (savedStyle === 'custom') {
      var userscriptInstalled = storageGet('berry_userscript_installed');
      if (!userscriptInstalled) {
        removeIframe();
        return Promise.resolve(false);
      }
      return Promise.resolve(false);
    }

    var iframeUrl = STYLE_IFRAME_URLS[savedStyle];
    if (iframeUrl) {
      return checkNetworkAlive().then(function(online) {
        if (online) loadInIframe(iframeUrl);
        return !online; // true = 断网跳过
      });
    }
    return Promise.resolve(false);
  }

  /* ════════════════════════════════════════
     入口：根据页面类型分发
     ════════════════════════════════════════ */

  function main() {
    var isHome = isHomePage();
    if (_DEBUG) console.log('[berry-remote] main: isHome=' + isHome + ' url=' + location.href);

    if (isHome) {
      initHomepageEnhance();
    } else {
      try { storageSet('berry_userscript_installed', '1'); } catch(e) {}
      initFloatingMenu();
    }
  }

  /* ========== 等待 BerryHomeMenu API ========== */
  function initHomepageEnhance() {
    function run(menuApi) {
      applySavedStyle(menuApi).then(function(offline) {
        doEnhance(menuApi);
        if (offline) menuApi.showTip('网络断开，请检查网络');
      });
    }

    var menuApi = _page.BerryHomeMenu;
    if (menuApi) { run(menuApi); return; }

    var retries = 0;
    var pollTimer = setInterval(function () {
      retries++;
      menuApi = _page.BerryHomeMenu;
      if (menuApi) {
        clearInterval(pollTimer);
        applySavedStyle(menuApi);
        doEnhance(menuApi);  // 下次启动时加载保存的风格
      } else if (retries > 30) {
        clearInterval(pollTimer);
        console.warn('[berry-remote] BerryHomeMenu API 未就绪，放弃增强'); // 不再创建悬浮按钮
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
