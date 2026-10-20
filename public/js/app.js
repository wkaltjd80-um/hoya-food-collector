/**
 * Notion Web Collector - Frontend Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const urlInput = document.getElementById('urlInput');
  const pasteBtn = document.getElementById('pasteBtn');
  const fetchMetaBtn = document.getElementById('fetchMetaBtn');
  
  const previewCard = document.getElementById('previewCard');
  const previewFavicon = document.getElementById('previewFavicon');
  const previewSiteName = document.getElementById('previewSiteName');
  const previewDomain = document.getElementById('previewDomain');
  const inputTitle = document.getElementById('inputTitle');
  const inputLocation = document.getElementById('inputLocation');
  const inputDescription = document.getElementById('inputDescription');
  const previewImage = document.getElementById('previewImage');
  const noImagePlaceholder = document.getElementById('noImagePlaceholder');
  const inputMemo = document.getElementById('inputMemo');
  
  const categoryPills = document.getElementById('categoryPills');
  const selectedCategoryInput = document.getElementById('selectedCategory');
  const addCustomCatBtn = document.getElementById('addCustomCatBtn');
  
  const tagContainer = document.getElementById('tagContainer');
  const tagInput = document.getElementById('tagInput');
  
  const saveNotionBtn = document.getElementById('saveNotionBtn');
  const resetBtn = document.getElementById('resetBtn');
  
  const connectionStatus = document.getElementById('connectionStatus');
  const historyList = document.getElementById('historyList');
  const historyCountBadge = document.getElementById('historyCountBadge');
  const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
  const searchArchiveInput = document.getElementById('searchArchiveInput');
  
  // Modals
  const settingsModal = document.getElementById('settingsModal');
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const testConnectionBtn = document.getElementById('testConnectionBtn');
  const notionApiKeyInput = document.getElementById('notionApiKeyInput');
  const notionTargetIdInput = document.getElementById('notionTargetIdInput');
  const connectionTestResult = document.getElementById('connectionTestResult');
  const toggleKeyVisibility = document.getElementById('toggleKeyVisibility');
  const footerTargetId = document.getElementById('footerTargetId');
  const openNotionLink = document.getElementById('openNotionLink');

  const guideModal = document.getElementById('guideModal');
  const openGuideBtn = document.getElementById('openGuideBtn');
  const closeGuideBtn = document.getElementById('closeGuideBtn');
  const confirmGuideBtn = document.getElementById('confirmGuideBtn');

  // Photo Modal Elements
  const photoModal = document.getElementById('photoModal');
  const closePhotoModalBtn = document.getElementById('closePhotoModalBtn');
  const cancelPhotoModalBtn = document.getElementById('cancelPhotoModalBtn');
  const candidatePhotosGrid = document.getElementById('candidatePhotosGrid');
  const manualPhotoUrlInput = document.getElementById('manualPhotoUrlInput');
  const applyManualPhotoBtn = document.getElementById('applyManualPhotoBtn');
  const changePhotoBtn = document.getElementById('changePhotoBtn');
  const triggerPhonePhotoBtn = document.getElementById('triggerPhonePhotoBtn');
  const phonePhotoFileInput = document.getElementById('phonePhotoFileInput');
  const phonePhotoUploadStatus = document.getElementById('phonePhotoUploadStatus');
  const phoneUploadStatusText = document.getElementById('phoneUploadStatusText');
  const candidateCountBadge = document.getElementById('candidateCountBadge');
  const presetPhotosGrid = document.getElementById('presetPhotosGrid');
  const presetFilterTabs = document.getElementById('presetFilterTabs');

  const toastContainer = document.getElementById('toastContainer');

  // Application State
  let currentTags = ['추천'];
  let currentHistory = [];
  let currentImageData = '';
  let currentExtraImages = [];
  let currentFaviconData = '';
  let currentSiteNameData = '';
  let currentFileUploadId = null;
  let currentActivePresetCategory = 'all';

  // LocalStorage Helpers for Netlify Serverless & Offline Persistence
  function getStoredApiKey() {
    return localStorage.getItem('hoya_notion_key') || '';
  }
  function getStoredTargetId() {
    return localStorage.getItem('hoya_notion_target') || '166ad860bd648097afedff31acfa1fb5';
  }
  function setStoredCredentials(k, t) {
    if (k !== undefined) localStorage.setItem('hoya_notion_key', k);
    if (t) localStorage.setItem('hoya_notion_target', t);
  }

  // ----------------------------------------------------
  // 1. Initialize
  // ----------------------------------------------------
  initApp();

  async function initApp() {
    if (notionApiKeyInput && getStoredApiKey()) {
      notionApiKeyInput.value = getStoredApiKey();
    }
    if (notionTargetIdInput && getStoredTargetId()) {
      notionTargetIdInput.value = getStoredTargetId();
    }
    await checkConnectionStatus();
    await loadHistory();
    renderTags();
  }

  // ----------------------------------------------------
  // 2. Status & Connection Checks
  // ----------------------------------------------------
  async function checkConnectionStatus() {
    try {
      const headers = {};
      const key = getStoredApiKey();
      const target = getStoredTargetId();
      if (key) headers['x-notion-api-key'] = key;
      if (target) headers['x-notion-target-id'] = target;

      const res = await fetch('/api/status', { headers });
      if (res.status === 401) {
        connectionStatus.className = 'status-pill status-warning';
        connectionStatus.innerHTML = `
          <span class="status-dot"></span>
          <span class="status-text"><i class="fa-solid fa-lock"></i> Netlify 사이트 비공개 상태</span>
        `;
        showToast('Netlify 대시보드(Site configuration > Visitor access)에서 사이트를 [Public]으로 변경해야 외부에서 정상 접속됩니다.', 'error');
        return;
      }
      const data = await res.json();

      if (footerTargetId && (data.targetId || target)) {
        footerTargetId.textContent = data.targetId || target;
      }

      const effectiveTid = data.targetId || target;
      if (effectiveTid && openNotionLink) {
        openNotionLink.href = `https://app.notion.com/p/${effectiveTid.replace(/-/g, '')}`;
      }

      const quickSetupBanner = document.getElementById('quickSetupBanner');

      if (data.notionConnected) {
        connectionStatus.className = 'status-pill status-connected';
        connectionStatus.innerHTML = `
          <span class="status-dot"></span>
          <span class="status-text"><i class="fa-solid fa-check"></i> 노션 연동됨 (${data.targetTitle || '데이터베이스'})</span>
        `;
        connectionStatus.title = `타겟: ${data.targetTitle} (${data.targetType})`;
        if (quickSetupBanner) quickSetupBanner.style.display = 'none';
      } else if (!data.hasApiKey) {
        connectionStatus.className = 'status-pill status-warning';
        connectionStatus.innerHTML = `
          <span class="status-dot"></span>
          <span class="status-text"><i class="fa-solid fa-key"></i> 로컬 모드 (클릭하여 API 키 설정)</span>
        `;
        connectionStatus.title = '노션 API Key가 설정되지 않아 로컬 저장 모드로 동작합니다. 클릭하여 API 키를 등록하세요.';
        if (quickSetupBanner) quickSetupBanner.style.display = 'flex';
      } else {
        connectionStatus.className = 'status-pill status-warning';
        connectionStatus.innerHTML = `
          <span class="status-dot"></span>
          <span class="status-text"><i class="fa-solid fa-triangle-exclamation"></i> 노션 권한 확인 필요 (클릭)</span>
        `;
        connectionStatus.title = data.error || '노션 페이지 권한을 확인해주세요.';
        if (quickSetupBanner) quickSetupBanner.style.display = 'flex';
      }

      return data;
    } catch (err) {
      console.error('Failed to check status:', err);
      connectionStatus.className = 'status-pill status-warning';
      connectionStatus.innerHTML = `
        <span class="status-dot"></span>
        <span class="status-text">서버 오프라인</span>
      `;
    }
  }

  // ----------------------------------------------------
  // 3. URL Extraction Logic & Mobile Smart Helper
  // ----------------------------------------------------
  function extractUrlAndHints(rawInput) {
    if (!rawInput) return { url: '', hintTitle: '', hintAddress: '' };
    
    const text = String(rawInput).trim();
    const urlRegex = /(https?:\/\/[^\s"'<>()]+)/i;
    const match = text.match(urlRegex);
    
    let url = '';
    let hintTitle = '';
    let hintAddress = '';
    
    if (match) {
      url = match[1].replace(/[.,!?;:]+$/, '');
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.includes(url) && !l.startsWith('http'));
      for (let line of lines) {
        line = line.replace(/^\[(네이버\s*지도|카카오맵|네이버\s*플레이스|네이버\s*블로그)\]\s*/i, '').trim();
        if (!line) continue;
        if (/(동|읍|면|리|구|로|길|시|도)\s+\d+/.test(line) || /^[가-힣]+(?:시|군|구)/.test(line)) {
          if (!hintAddress) hintAddress = line;
        } else if (!hintTitle && line.length < 50) {
          hintTitle = line;
        }
      }
    } else {
      const domainMatch = text.match(/((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s"'<>()]*)?)/i);
      if (domainMatch) {
        url = 'https://' + domainMatch[1].replace(/[.,!?;:]+$/, '');
      } else {
        url = text;
        if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
      }
    }

    // Instagram Special Handle Extraction
    if (/instagram\.com/i.test(url)) {
      const postMatch = url.match(/instagram\.com\/(?:p|reel|tv)\/([a-zA-Z0-9_-]+)/i);
      const userMatch = url.match(/instagram\.com\/([a-zA-Z0-9._]+)/i);
      if (postMatch) {
        if (!hintTitle) hintTitle = `인스타그램 게시물 (${postMatch[1]})`;
      } else if (userMatch && !['explore', 'reels', 'stories', 'accounts', 'direct'].includes(userMatch[1].toLowerCase())) {
        if (!hintTitle) hintTitle = `@${userMatch[1]} (인스타그램)`;
      }
    }
    
    return { url, hintTitle, hintAddress };
  }

  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        showToast('클립보드가 비어 있습니다.', 'info');
        return;
      }
      const { url, hintTitle, hintAddress } = extractUrlAndHints(text);
      if (url) {
        urlInput.value = url;
        if (hintTitle && inputTitle && !inputTitle.value) inputTitle.value = hintTitle;
        if (hintAddress && inputLocation && !inputLocation.value) inputLocation.value = hintAddress;
        showToast('공유 링크가 자동으로 정리되어 입력되었습니다! ✨', 'info');
        fetchMetadata(url, { hintTitle, hintAddress });
      } else {
        urlInput.value = text.trim();
        showToast('텍스트가 입력되었습니다.', 'info');
      }
    } catch (err) {
      urlInput.focus();
      showToast('입력창을 길게 눌러 [붙여넣기]를 해주세요.', 'info');
    }
  });

  // Handle direct paste into URL input (e.g. mobile long-press paste)
  urlInput.addEventListener('paste', () => {
    setTimeout(() => {
      const raw = urlInput.value;
      if (!raw) return;
      const { url, hintTitle, hintAddress } = extractUrlAndHints(raw);
      if (url && url !== raw) {
        urlInput.value = url;
      }
      if (hintTitle && inputTitle && !inputTitle.value) inputTitle.value = hintTitle;
      if (hintAddress && inputLocation && !inputLocation.value) inputLocation.value = hintAddress;
      if (url && /^https?:\/\//i.test(url)) {
        fetchMetadata(url, { hintTitle, hintAddress });
      }
    }, 60);
  });

  fetchMetaBtn.addEventListener('click', () => {
    const raw = urlInput.value.trim();
    if (!raw) {
      showToast('웹페이지 URL을 먼저 입력해주세요.', 'error');
      urlInput.focus();
      return;
    }
    const { url, hintTitle, hintAddress } = extractUrlAndHints(raw);
    if (url && url !== raw) urlInput.value = url;
    if (hintTitle && inputTitle && !inputTitle.value) inputTitle.value = hintTitle;
    if (hintAddress && inputLocation && !inputLocation.value) inputLocation.value = hintAddress;
    fetchMetadata(url || raw, { hintTitle, hintAddress });
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const raw = urlInput.value.trim();
      if (raw) {
        const { url, hintTitle, hintAddress } = extractUrlAndHints(raw);
        if (url && url !== raw) urlInput.value = url;
        fetchMetadata(url || raw, { hintTitle, hintAddress });
      }
    }
  });

  async function fetchMetadata(url, hints = {}) {
    fetchMetaBtn.classList.add('loading');
    fetchMetaBtn.disabled = true;

    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, ...hints })
      });

      if (res.status === 401) {
        if (hints.hintTitle && inputTitle && !inputTitle.value) inputTitle.value = hints.hintTitle;
        if (hints.hintAddress && inputLocation && !inputLocation.value) inputLocation.value = hints.hintAddress;
        showToast('Netlify 사이트가 [비공개/Site Protection] 상태여서 요청이 차단되었습니다. Netlify 대시보드(Site configuration > Visitor access)에서 [Public]으로 설정해 주세요.', 'error');
        return;
      }

      let data = {};
      try {
        data = await res.json();
      } catch (parseErr) {
        if (hints.hintTitle && inputTitle && !inputTitle.value) inputTitle.value = hints.hintTitle;
        if (hints.hintAddress && inputLocation && !inputLocation.value) inputLocation.value = hints.hintAddress;
        showToast('서버에서 올바른 응답을 받지 못했습니다. 직접 입력해 주세요.', 'error');
        return;
      }

      if (!res.ok) {
        if (hints.hintTitle && inputTitle && !inputTitle.value) inputTitle.value = hints.hintTitle;
        if (hints.hintAddress && inputLocation && !inputLocation.value) inputLocation.value = hints.hintAddress;
        showToast(data.error || '정보를 불러오지 못했습니다. 아래 입력창에 직접 작성해 주세요.', 'error');
        return;
      }

      // Populate Extracted Data
      inputTitle.value = data.title || hints.hintTitle || url;
      if (inputLocation) {
        inputLocation.value = data.location || hints.hintAddress || '';
      }
      inputDescription.value = data.description || '';
      previewSiteName.textContent = data.siteName || '웹사이트';
      
      try {
        const u = new URL(data.url || url);
        previewDomain.textContent = u.hostname;
      } catch (e) {
        previewDomain.textContent = '';
      }

      // Favicon
      currentFaviconData = data.favicon || '';
      if (currentFaviconData) {
        previewFavicon.src = currentFaviconData;
        previewFavicon.style.display = 'block';
      } else {
        previewFavicon.style.display = 'none';
      }

      // Thumbnail Image & Candidates
      currentImageData = data.image || '';
      currentExtraImages = data.extraImages || [];
      if (currentImageData && !currentExtraImages.includes(currentImageData)) {
        currentExtraImages.unshift(currentImageData);
      }
      currentSiteNameData = data.siteName || '';

      if (currentImageData) {
        previewImage.src = currentImageData;
        previewImage.classList.add('has-image');
        noImagePlaceholder.style.display = 'none';
      } else {
        previewImage.classList.remove('has-image');
        previewImage.src = '';
        noImagePlaceholder.style.display = 'flex';
      }

      // If server identified a cuisine category, activate it
      if (data.category) {
        const matchingPill = Array.from(categoryPills.querySelectorAll('.cat-pill[data-category]'))
          .find(p => p.dataset.category === data.category);
        if (matchingPill) {
          categoryPills.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
          matchingPill.classList.add('active');
          selectedCategoryInput.value = data.category;
        }
      } else {
        autoSuggestCategoryAndTags(data.url || url, data.title, data.description);
      }

      showToast('웹페이지 정보를 성공적으로 불러왔습니다! 🎉', 'success');

    } catch (err) {
      console.error(err);
      if (hints.hintTitle && inputTitle && !inputTitle.value) inputTitle.value = hints.hintTitle;
      if (hints.hintAddress && inputLocation && !inputLocation.value) inputLocation.value = hints.hintAddress;
      showToast('정보를 가져오는 중 네트워크 오류가 발생했습니다. 직접 수정이 가능합니다.', 'error');
    } finally {
      fetchMetaBtn.classList.remove('loading');
      fetchMetaBtn.disabled = false;
    }
  }

  // ----------------------------------------------------
  // Food Category & Tags Auto Suggestion
  // ----------------------------------------------------
  function autoSuggestCategoryAndTags(url, title, desc) {
    const combined = `${url} ${title} ${desc}`.toLowerCase();

    let targetCat = '한식';
    if (/스시|초밥|라멘|이자카야|돈카츠|우동|사케|일식/i.test(combined)) {
      targetCat = '일식';
      addTagIfMissing('일식맛집');
    } else if (/짜장|짬뽕|탕수육|중화|중식|딤섬|마라탕|양꼬치/i.test(combined)) {
      targetCat = '중식';
      addTagIfMissing('중식맛집');
    } else if (/파스타|피자|스테이크|리조또|와인|이탈리안|양식/i.test(combined)) {
      targetCat = '이탈리안';
      addTagIfMissing('양식맛집');
    } else if (/카페|커피|베이커리|디저트|케이크|크루아상|에스프레소|브런치/i.test(combined)) {
      targetCat = '카페';
      addTagIfMissing('카페투어');
    } else if (/해물|조개|생선|대게|킹크랩|회|해산물|바다/i.test(combined)) {
      targetCat = '해산물';
      addTagIfMissing('해산물');
    } else if (/프랑스|비스트로|바게트|에스카르고/i.test(combined)) {
      targetCat = '프랑스식';
      addTagIfMissing('프렌치');
    } else if (/삼겹살|갈비|돼지|소고기|국밥|찌개|백반|한식/i.test(combined)) {
      targetCat = '한식';
      addTagIfMissing('한식맛집');
    }

    // Set Category Pill Active
    const pills = categoryPills.querySelectorAll('.cat-pill[data-category]');
    pills.forEach(pill => {
      if (pill.dataset.category === targetCat) {
        pill.classList.add('active');
        selectedCategoryInput.value = targetCat;
      } else {
        pill.classList.remove('active');
      }
    });
  }

  function addTagIfMissing(tag) {
    if (!currentTags.includes(tag)) {
      currentTags.push(tag);
      renderTags();
    }
  }

  // ----------------------------------------------------
  // 4. Categories & Tag Handling
  // ----------------------------------------------------
  categoryPills.addEventListener('click', (e) => {
    const pill = e.target.closest('.cat-pill');
    if (!pill || pill.id === 'addCustomCatBtn') return;

    categoryPills.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    selectedCategoryInput.value = pill.dataset.category || pill.textContent.trim();
  });

  const customCatInputWrap = document.getElementById('customCatInputWrap');
  const customCatInput = document.getElementById('customCatInput');
  const confirmCustomCatBtn = document.getElementById('confirmCustomCatBtn');
  const cancelCustomCatBtn = document.getElementById('cancelCustomCatBtn');

  function showCustomCatInput() {
    if (!customCatInputWrap) return;
    addCustomCatBtn.style.display = 'none';
    customCatInputWrap.style.display = 'inline-flex';
    customCatInput.value = '';
    setTimeout(() => customCatInput.focus(), 50);
  }

  function hideCustomCatInput() {
    if (!customCatInputWrap) return;
    customCatInputWrap.style.display = 'none';
    addCustomCatBtn.style.display = 'inline-flex';
  }

  function submitCustomCat() {
    const val = customCatInput.value.trim();
    if (!val) {
      hideCustomCatInput();
      return;
    }

    // Check if category already exists in pills
    let existingPill = Array.from(categoryPills.querySelectorAll('.cat-pill[data-category]'))
      .find(p => p.dataset.category.toLowerCase() === val.toLowerCase());

    if (existingPill) {
      categoryPills.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
      existingPill.classList.add('active');
      selectedCategoryInput.value = existingPill.dataset.category;
    } else {
      const newPill = document.createElement('button');
      newPill.type = 'button';
      newPill.className = 'cat-pill active';
      newPill.dataset.category = val;
      newPill.textContent = val;

      categoryPills.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
      categoryPills.insertBefore(newPill, addCustomCatBtn);
      selectedCategoryInput.value = val;
    }

    hideCustomCatInput();
    showToast(`'${val}' 카테고리가 선택되었습니다.`, 'info');
  }

  if (addCustomCatBtn) {
    addCustomCatBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showCustomCatInput();
    });
  }

  if (confirmCustomCatBtn) {
    confirmCustomCatBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      submitCustomCat();
    });
  }

  if (cancelCustomCatBtn) {
    cancelCustomCatBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      hideCustomCatInput();
    });
  }

  if (customCatInput) {
    customCatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitCustomCat();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        hideCustomCatInput();
      }
    });
  }

  tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = tagInput.value.replace(/,/g, '').trim();
      if (val && !currentTags.includes(val)) {
        currentTags.push(val);
        renderTags();
        tagInput.value = '';
      }
    } else if (e.key === 'Backspace' && !tagInput.value && currentTags.length > 0) {
      currentTags.pop();
      renderTags();
    }
  });

  function renderTags() {
    // Keep tagInput, remove old badges
    const existingBadges = tagContainer.querySelectorAll('.tag-badge');
    existingBadges.forEach(b => b.remove());

    currentTags.forEach((tag, idx) => {
      const badge = document.createElement('span');
      badge.className = 'tag-badge';
      badge.innerHTML = `
        ${escapeHtml(tag)}
        <i class="fa-solid fa-xmark remove-tag" data-index="${idx}"></i>
      `;
      tagContainer.insertBefore(badge, tagInput);
    });

    tagContainer.querySelectorAll('.remove-tag').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index, 10);
        currentTags.splice(index, 1);
        renderTags();
      });
    });
  }

  // ----------------------------------------------------
  // 5. Save to Notion Action
  // ----------------------------------------------------
  saveNotionBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) {
      showToast('저장할 URL을 입력해주세요.', 'error');
      urlInput.focus();
      return;
    }

    const key = getStoredApiKey();
    const target = getStoredTargetId();

    const payload = {
      url,
      title: inputTitle.value.trim() || url,
      location: inputLocation ? inputLocation.value.trim() : '',
      description: inputDescription.value.trim(),
      category: selectedCategoryInput.value || '한식',
      tags: currentTags,
      memo: inputMemo.value.trim(),
      image: currentImageData,
      fileUploadId: currentFileUploadId,
      siteName: currentSiteNameData || previewSiteName.textContent,
      notionApiKey: key,
      notionTargetId: target
    };

    saveNotionBtn.classList.add('loading');
    saveNotionBtn.disabled = true;

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (key) headers['x-notion-api-key'] = key;
      if (target) headers['x-notion-target-id'] = target;

      const res = await fetch('/api/save-to-notion', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      const result = await res.json();

      if (!res.ok) {
        showToast(result.error || '노션 저장 중 오류가 발생했습니다.', 'error');
        return;
      }

      if (result.item) {
        try {
          const local = JSON.parse(localStorage.getItem('hoya_food_history') || '[]');
          local.unshift(result.item);
          localStorage.setItem('hoya_food_history', JSON.stringify(local.slice(0, 50)));
        } catch (e) {}
      }

      if (result.mode === 'notion') {
        showToast(
          `🎉 노션에 성공적으로 저장되었습니다!`,
          'success',
          result.notionUrl ? { text: '노션에서 보기', url: result.notionUrl } : null
        );
      } else {
        showToast(
          '로컬 대시보드에 저장되었습니다. Notion API 키를 등록하면 실시간 동기화됩니다.',
          'info'
        );
      }

      // Refresh History feed
      await loadHistory();

      // Reset form fields
      resetForm();

    } catch (err) {
      console.error(err);
      showToast('저장 요청 중 통신 오류가 발생했습니다.', 'error');
    } finally {
      saveNotionBtn.classList.remove('loading');
      saveNotionBtn.disabled = false;
    }
  });

  resetBtn.addEventListener('click', () => {
    resetForm();
    showToast('입력창이 초기화되었습니다.', 'info');
  });

  function resetForm() {
    urlInput.value = '';
    inputTitle.value = '';
    if (inputLocation) inputLocation.value = '';
    inputDescription.value = '';
    inputMemo.value = '';
    previewSiteName.textContent = '웹사이트';
    previewDomain.textContent = '';
    previewImage.src = '';
    previewImage.classList.remove('has-image');
    noImagePlaceholder.style.display = 'flex';
    currentImageData = '';
    currentFileUploadId = null;
    currentExtraImages = [];
    currentFaviconData = '';
    currentTags = ['추천'];
    renderTags();
  }

  // ----------------------------------------------------
  // 6. History Archive
  // ----------------------------------------------------
  refreshHistoryBtn.addEventListener('click', () => {
    loadHistory();
    showToast('저장 목록을 새로고침했습니다.', 'info');
  });

  searchArchiveInput.addEventListener('input', () => {
    renderHistoryList(currentHistory);
  });

  async function loadHistory() {
    let list = [];
    try {
      const res = await fetch('/api/history');
      if (res.ok) {
        const fetched = await res.json();
        if (Array.isArray(fetched)) list = fetched;
      }
    } catch (err) {}

    try {
      const local = JSON.parse(localStorage.getItem('hoya_food_history') || '[]');
      if (Array.isArray(local) && local.length > 0) {
        const ids = new Set(list.map(i => i.id));
        local.forEach(item => {
          if (!ids.has(item.id)) list.push(item);
        });
      }
    } catch (e) {}

    list.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    currentHistory = list;
    if (historyCountBadge) historyCountBadge.textContent = `${currentHistory.length}개`;
    renderHistoryList(currentHistory);
  }

  function renderHistoryList(items) {
    const query = searchArchiveInput.value.trim().toLowerCase();
    const filtered = items.filter(item => {
      if (!query) return true;
      const haystack = `${item.title} ${item.description} ${item.memo} ${item.category} ${(item.tags || []).join(' ')}`.toLowerCase();
      return haystack.includes(query);
    });

    if (filtered.length === 0) {
      historyList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><i class="fa-solid fa-inbox"></i></div>
          <p class="empty-title">${query ? '검색 결과가 없습니다' : '아직 저장된 링크가 없습니다'}</p>
          <p class="empty-desc">${query ? '다른 키워드로 검색해 보세요.' : '상단 폼에서 웹 링크를 노션에 저장해 보세요!'}</p>
        </div>
      `;
      return;
    }

    historyList.innerHTML = filtered.map(item => {
      const dateFormatted = new Date(item.savedAt).toLocaleDateString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const tagsHtml = (item.tags || []).map(t => `<span class="history-tag">#${escapeHtml(t)}</span>`).join('');
      const notionBtn = item.notionUrl ? `
        <a href="${item.notionUrl}" target="_blank" class="action-icon-link" title="노션 페이지 열기">
          <i class="fa-brands fa-neos"></i>
        </a>
      ` : '';

      return `
        <div class="history-item" data-id="${item.id}">
          <div class="history-item-top">
            <div class="history-item-meta">
              <span class="history-cat-badge">${escapeHtml(item.category || '일반')}</span>
              <span>${dateFormatted}</span>
              ${item.siteName ? `<span>&bull; ${escapeHtml(item.siteName)}</span>` : ''}
            </div>
            <div class="history-actions">
              ${notionBtn}
              <a href="${item.url}" target="_blank" class="action-icon-link" title="원문 링크 열기">
                <i class="fa-solid fa-arrow-up-right-from-square"></i>
              </a>
              <button type="button" class="action-icon-link copy-link-btn" data-url="${escapeHtml(item.url)}" title="링크 복사">
                <i class="fa-regular fa-copy"></i>
              </button>
              <button type="button" class="action-icon-link delete-btn" data-id="${item.id}" title="기록 삭제">
                <i class="fa-regular fa-trash-can"></i>
              </button>
            </div>
          </div>

          <div class="history-item-main">
            ${item.image ? `<img src="${escapeHtml(item.image)}" alt="thumb" class="history-thumb" onerror="this.style.display='none'">` : ''}
            <div class="history-item-texts">
              <a href="${item.url}" target="_blank" class="history-item-title">${escapeHtml(item.title || item.url)}</a>
              ${item.description ? `<p class="history-item-desc">${escapeHtml(item.description)}</p>` : ''}
            </div>
          </div>

          ${item.memo ? `
            <div class="history-item-memo">
              <i class="fa-solid fa-pencil"></i> ${escapeHtml(item.memo)}
            </div>
          ` : ''}

          ${tagsHtml ? `<div class="history-tags-row">${tagsHtml}</div>` : ''}
        </div>
      `;
    }).join('');

    // Attach event listeners for list action buttons
    historyList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        if (confirm('이 저장 항목을 기록에서 삭제하시겠습니까?')) {
          await deleteHistoryItem(id);
        }
      });
    });

    historyList.querySelectorAll('.copy-link-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const urlToCopy = e.currentTarget.dataset.url;
        await navigator.clipboard.writeText(urlToCopy);
        showToast('링크가 클립보드에 복사되었습니다.', 'info');
      });
    });
  }

  async function deleteHistoryItem(id) {
    try {
      const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('저장 기록이 삭제되었습니다.', 'info');
        await loadHistory();
      }
    } catch (err) {
      showToast('삭제 실패', 'error');
    }
  }

  // ----------------------------------------------------
  // 7. Modals: Settings & Guide
  // ----------------------------------------------------
  function openSettings() {
    connectionTestResult.style.display = 'none';
    settingsModal.classList.add('open');
    setTimeout(() => notionApiKeyInput.focus(), 150);
  }

  openSettingsBtn.addEventListener('click', openSettings);
  if (connectionStatus) connectionStatus.addEventListener('click', openSettings);
  
  const openSettingsFromBanner = document.getElementById('openSettingsFromBanner');
  if (openSettingsFromBanner) openSettingsFromBanner.addEventListener('click', openSettings);

  closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('open');
  });

  openGuideBtn.addEventListener('click', () => {
    guideModal.classList.add('open');
  });

  closeGuideBtn.addEventListener('click', () => {
    guideModal.classList.remove('open');
  });

  confirmGuideBtn.addEventListener('click', () => {
    guideModal.classList.remove('open');
    settingsModal.classList.add('open');
  });

  // Close modal when clicking on backdrop
  [settingsModal, guideModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
  });

  toggleKeyVisibility.addEventListener('click', () => {
    const isPass = notionApiKeyInput.type === 'password';
    notionApiKeyInput.type = isPass ? 'text' : 'password';
    toggleKeyVisibility.innerHTML = isPass ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
  });

  testConnectionBtn.addEventListener('click', async () => {
    testConnectionBtn.disabled = true;
    testConnectionBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> 테스트 중...';
    connectionTestResult.style.display = 'none';

    // Temporarily save current form key if typed
    const currentKey = notionApiKeyInput.value.trim();
    const currentTargetId = notionTargetIdInput.value.trim();

    if (currentKey) {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notionApiKey: currentKey, notionTargetId: currentTargetId })
      });
    }

    try {
      const res = await fetch('/api/status');
      const data = await res.json();

      connectionTestResult.style.display = 'block';

      if (data.notionConnected) {
        connectionTestResult.className = 'connection-test-result success';
        connectionTestResult.innerHTML = `
          <strong><i class="fa-solid fa-circle-check"></i> 노션 연결 성공!</strong><br>
          연결된 대상: <b>${escapeHtml(data.targetTitle)}</b> (${data.targetType})<br>
          속성(컬럼): ${data.properties && data.properties.length > 0 ? data.properties.map(p => `${p.name}(${p.type})`).join(', ') : '기본 페이지 형식'}
        `;
        await checkConnectionStatus();
      } else {
        connectionTestResult.className = 'connection-test-result error';
        connectionTestResult.innerHTML = `
          <strong><i class="fa-solid fa-circle-exclamation"></i> 연결 실패</strong><br>
          ${data.error || 'API 키 또는 페이지/데이터베이스 ID를 확인해 주세요. 노션 페이지 상단 [···] -> [연결]에 해당 봇이 추가되어 있는지 확인하세요.'}
        `;
      }
    } catch (e) {
      connectionTestResult.style.display = 'block';
      connectionTestResult.className = 'connection-test-result error';
      connectionTestResult.textContent = '테스트 통신 실패: ' + e.message;
    } finally {
      testConnectionBtn.disabled = false;
      testConnectionBtn.innerHTML = '<i class="fa-solid fa-plug"></i> 연결 테스트';
    }
  });

  saveSettingsBtn.addEventListener('click', async () => {
    const key = notionApiKeyInput.value.trim();
    const targetId = notionTargetIdInput.value.trim();

    setStoredCredentials(key, targetId);

    saveSettingsBtn.disabled = true;
    saveSettingsBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> 저장 중...';

    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-notion-api-key': key,
          'x-notion-target-id': targetId
        },
        body: JSON.stringify({
          notionApiKey: key,
          notionTargetId: targetId
        })
      });

      showToast('노션 연동 설정이 성공적으로 저장되었습니다!', 'success');
      settingsModal.classList.remove('open');
      await checkConnectionStatus();
    } catch (e) {
      showToast('설정이 브라우저에 저장되었습니다.', 'info');
      settingsModal.classList.remove('open');
      await checkConnectionStatus();
    } finally {
      saveSettingsBtn.disabled = false;
      saveSettingsBtn.innerHTML = '<i class="fa-solid fa-check"></i> 설정 저장';
    }
  });

  // ----------------------------------------------------
  // 7-2. Photo Selection / Change Modal Handling
  // ----------------------------------------------------
  if (changePhotoBtn) {
    changePhotoBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPhotoModal();
    });
  }

  const previewImageContainer = document.getElementById('previewImageContainer');
  if (previewImageContainer) {
    previewImageContainer.addEventListener('click', (e) => {
      // If clicked on container but not on button directly, also open modal
      if (e.target !== changePhotoBtn && !changePhotoBtn.contains(e.target)) {
        openPhotoModal();
      }
    });
  }

  // ----------------------------------------------------
  // 7-2. Photo Selection / Change Modal Handling
  // ----------------------------------------------------
  const PRESET_FOOD_COLLECTION = [
    // 한식
    { name: '🍚 한식 정식 / 찌개', category: '한식', url: 'https://images.unsplash.com/photo-1590301157890-4810ed352733?auto=format&fit=crop&w=800&q=80' },
    { name: '🥩 삼겹살 / 숯불구이', category: '고기/국밥', url: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80' },
    { name: '🍲 돼지국밥 / 탕', category: '고기/국밥', url: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80' },
    { name: '🍗 바삭한 치킨 / 통닭', category: '한식', url: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=800&q=80' },
    // 일식
    { name: '🍣 모둠 초밥 / 스시', category: '일식', url: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=800&q=80' },
    { name: '🍜 일본식 라멘', category: '일식', url: 'https://images.unsplash.com/photo-1557872943-16a5ac26437e?auto=format&fit=crop&w=800&q=80' },
    // 중식
    { name: '🥟 딤섬 / 군만두', category: '중식', url: 'https://images.unsplash.com/photo-1525755662778-989d0524087e?auto=format&fit=crop&w=800&q=80' },
    { name: '🥢 중화 요리 / 볶음', category: '중식', url: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=800&q=80' },
    // 양식
    { name: '🍝 토마토 파스타', category: '양식', url: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=800&q=80' },
    { name: '🍕 화덕 피자', category: '양식', url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80' },
    { name: '🥪 브런치 & 버거', category: '양식', url: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=80' },
    // 카페 & 디저트
    { name: '☕️ 아메리카노 & 라떼', category: '카페', url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=80' },
    { name: '🍰 베이커리 & 케이크', category: '카페', url: 'https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=800&q=80' },
    // 해산물
    { name: '🦐 신선한 해산물 요리', category: '한식', url: 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=800&q=80' }
  ];

  // Helper to compress image file using HTML5 Canvas
  function compressImageFile(file, maxDimension = 1600, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        };
        img.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('파일 읽기 오류'));
      reader.readAsDataURL(file);
    });
  }

  // Handle Smartphone Photo Upload
  if (triggerPhonePhotoBtn && phonePhotoFileInput) {
    triggerPhonePhotoBtn.addEventListener('click', () => {
      phonePhotoFileInput.click();
    });

    phonePhotoFileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        showToast('이미지 파일(JPG, PNG 등)만 선택하실 수 있습니다.', 'error');
        return;
      }

      if (phonePhotoUploadStatus) {
        phonePhotoUploadStatus.style.display = 'flex';
        if (phoneUploadStatusText) {
          phoneUploadStatusText.textContent = '스마트폰 사진을 최적화하여 노션에 안전하게 전송 중입니다...';
        }
      }

      try {
        // Compress client-side
        const compressedBase64 = await compressImageFile(file, 1600, 0.85);

        // Upload to Notion storage via backend
        const key = getStoredApiKey();
        const res = await fetch('/api/upload-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: compressedBase64,
            filename: file.name || 'phone_food.jpg',
            mimeType: 'image/jpeg',
            notionApiKey: key
          })
        });

        const uploadData = await res.json();
        if (!res.ok || !uploadData.fileUploadId) {
          throw new Error(uploadData.error || '노션 파일 업로드에 실패했습니다.');
        }

        currentFileUploadId = uploadData.fileUploadId;
        currentImageData = compressedBase64;

        // Add to candidates so it's visible in candidate gallery
        if (!currentExtraImages.includes(compressedBase64)) {
          currentExtraImages.unshift(compressedBase64);
        }

        selectPhoto(compressedBase64, true, uploadData.fileUploadId);
        renderCandidatePhotos();
        renderPresetFoodPhotos(currentActivePresetCategory);

        showToast('스마트폰 사진이 대표 사진으로 등록되었습니다! 📸', 'success');
        setTimeout(() => {
          closePhotoModal();
        }, 300);

      } catch (err) {
        console.error('Phone upload failed:', err);
        showToast('스마트폰 사진 업로드 실패: ' + (err.message || '다시 시도해 주세요.'), 'error');
      } finally {
        if (phonePhotoUploadStatus) phonePhotoUploadStatus.style.display = 'none';
        phonePhotoFileInput.value = '';
      }
    });
  }

  function openPhotoModal() {
    renderCandidatePhotos();
    renderPresetFoodPhotos(currentActivePresetCategory);

    if (manualPhotoUrlInput) {
      manualPhotoUrlInput.value = (currentImageData && currentImageData.startsWith('http')) ? currentImageData : '';
    }
    if (photoModal) {
      photoModal.classList.add('open');
      if (manualPhotoUrlInput) {
        setTimeout(() => manualPhotoUrlInput.focus(), 120);
      }
    }
  }

  function renderCandidatePhotos() {
    if (!candidatePhotosGrid) return;
    candidatePhotosGrid.innerHTML = '';

    // Collect all candidate images (make sure currentImageData and extra images are combined without duplicates)
    const candidates = [];
    if (currentImageData && typeof currentImageData === 'string') {
      candidates.push(currentImageData);
    }
    if (Array.isArray(currentExtraImages)) {
      currentExtraImages.forEach(img => {
        if (img && typeof img === 'string' && !candidates.includes(img)) {
          candidates.push(img);
        }
      });
    }

    if (candidateCountBadge) {
      candidateCountBadge.textContent = `${candidates.length}장`;
    }

    if (candidates.length === 0) {
      candidatePhotosGrid.innerHTML = `
        <div class="candidate-empty-msg" style="grid-column: 1 / -1; text-align: center; padding: 20px; color: var(--text-dim); font-size: 13px;">
          <i class="fa-regular fa-image" style="font-size: 24px; margin-bottom: 8px; display: block; opacity: 0.6;"></i>
          추출된 후보 사진이 없습니다.<br>
          위의 <strong>[📱 내 스마트폰 사진 선택]</strong> 또는 아래 <strong>[추천 음식 사진]</strong>을 터치해 주세요!
        </div>
      `;
      return;
    }

    candidates.forEach((imgUrl) => {
      const item = document.createElement('div');
      item.className = 'candidate-photo-item' + (imgUrl === currentImageData ? ' selected' : '');
      item.title = '이 사진으로 대표 사진 선택';

      const img = document.createElement('img');
      img.src = imgUrl;
      img.alt = '후보 사진';
      img.loading = 'lazy';
      img.onerror = () => {
        item.style.display = 'none'; // hide broken images
      };

      item.appendChild(img);

      item.addEventListener('click', () => {
        const isUserUpload = imgUrl.startsWith('data:');
        selectPhoto(imgUrl, isUserUpload, isUserUpload ? currentFileUploadId : null);
        renderCandidatePhotos();
        renderPresetFoodPhotos(currentActivePresetCategory);
      });

      candidatePhotosGrid.appendChild(item);
    });
  }

  function renderPresetFoodPhotos(categoryFilter = 'all') {
    if (!presetPhotosGrid) return;
    presetPhotosGrid.innerHTML = '';

    const filtered = categoryFilter === 'all'
      ? PRESET_FOOD_COLLECTION
      : PRESET_FOOD_COLLECTION.filter(p => p.category === categoryFilter);

    filtered.forEach(preset => {
      const item = document.createElement('div');
      item.className = 'preset-photo-item' + (preset.url === currentImageData ? ' selected' : '');
      item.title = `${preset.name} (클릭하여 대표 사진으로 선택)`;

      const img = document.createElement('img');
      img.src = preset.url;
      img.alt = preset.name;
      img.loading = 'lazy';

      const nameBadge = document.createElement('div');
      nameBadge.className = 'preset-name-badge';
      nameBadge.textContent = preset.name;

      item.appendChild(img);
      item.appendChild(nameBadge);

      item.addEventListener('click', () => {
        selectPhoto(preset.url, false, null);
        renderCandidatePhotos();
        renderPresetFoodPhotos(currentActivePresetCategory);
        showToast(`${preset.name} 사진이 선택되었습니다! 🍽️`, 'success');
      });

      presetPhotosGrid.appendChild(item);
    });
  }

  // Handle Preset Category Tabs
  if (presetFilterTabs) {
    presetFilterTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.preset-tab');
      if (!tab) return;
      presetFilterTabs.querySelectorAll('.preset-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentActivePresetCategory = tab.dataset.preset || 'all';
      renderPresetFoodPhotos(currentActivePresetCategory);
    });
  }

  function selectPhoto(imgUrl, isPhoneUpload = false, fileUploadId = null) {
    if (!imgUrl) return;
    currentImageData = imgUrl;

    if (isPhoneUpload && fileUploadId) {
      currentFileUploadId = fileUploadId;
    } else if (!isPhoneUpload) {
      currentFileUploadId = null;
    }

    if (previewImage) {
      previewImage.src = imgUrl;
      previewImage.classList.add('has-image');
      previewImage.style.display = 'block';
    }
    if (noImagePlaceholder) {
      noImagePlaceholder.style.display = 'none';
    }

    if (photoModal && !isPhoneUpload) {
      photoModal.classList.remove('open');
    }
    showToast('대표 사진이 성공적으로 변경되었습니다! 📸', 'success');
  }

  function closePhotoModal() {
    if (photoModal) photoModal.classList.remove('open');
  }

  if (applyManualPhotoBtn && manualPhotoUrlInput) {
    applyManualPhotoBtn.addEventListener('click', () => {
      applyManualPhoto();
    });

    manualPhotoUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyManualPhoto();
      }
    });
  }

  function applyManualPhoto() {
    const url = manualPhotoUrlInput.value.trim();
    if (!url) {
      showToast('이미지 주소(URL)를 입력해 주세요.', 'info');
      manualPhotoUrlInput.focus();
      return;
    }

    if (!/^https?:\/\//i.test(url)) {
      showToast('올바른 이미지 웹 주소(http:// 또는 https://)를 입력해 주세요.', 'error');
      manualPhotoUrlInput.focus();
      return;
    }

    if (!currentExtraImages.includes(url)) {
      currentExtraImages.unshift(url);
    }

    selectPhoto(url, false, null);
  }

  if (closePhotoModalBtn) {
    closePhotoModalBtn.addEventListener('click', closePhotoModal);
  }

  if (cancelPhotoModalBtn) {
    cancelPhotoModalBtn.addEventListener('click', closePhotoModal);
  }

  if (photoModal) {
    photoModal.addEventListener('click', (e) => {
      if (e.target === photoModal) closePhotoModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (photoModal && photoModal.classList.contains('open')) photoModal.classList.remove('open');
      if (mobileModal && mobileModal.classList.contains('open')) mobileModal.classList.remove('open');
    }
  });

  // ----------------------------------------------------
  // 7-3. Mobile PWA & QR Code Modal
  // ----------------------------------------------------
  const openMobileModalBtn = document.getElementById('openMobileModalBtn');
  const mobileModal = document.getElementById('mobileModal');
  const closeMobileModalBtn = document.getElementById('closeMobileModalBtn');
  const cancelMobileModalBtn = document.getElementById('cancelMobileModalBtn');
  const mobileQrCode = document.getElementById('mobileQrCode');
  const mobileUrlDisplay = document.getElementById('mobileUrlDisplay');
  const copyMobileUrlBtn = document.getElementById('copyMobileUrlBtn');
  const pwaInstallPromptBox = document.getElementById('pwaInstallPromptBox');
  const triggerPwaInstallBtn = document.getElementById('triggerPwaInstallBtn');

  let deferredPwaPrompt = null;

  // Listen for native PWA install prompt (Android Chrome)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPwaPrompt = e;
    if (pwaInstallPromptBox) {
      pwaInstallPromptBox.style.display = 'block';
    }
  });

  if (triggerPwaInstallBtn) {
    triggerPwaInstallBtn.addEventListener('click', async () => {
      if (deferredPwaPrompt) {
        deferredPwaPrompt.prompt();
        const { outcome } = await deferredPwaPrompt.userChoice;
        if (outcome === 'accepted') {
          showToast('앱 설치가 완료되었습니다! 스마트폰 홈 화면을 확인해 주세요.', 'success');
        }
        deferredPwaPrompt = null;
        if (pwaInstallPromptBox) pwaInstallPromptBox.style.display = 'none';
      }
    });
  }

  async function openMobileModal() {
    try {
      const res = await fetch('/api/network-info');
      const data = await res.json();
      const mobileUrl = data.mobileUrl || `http://${window.location.hostname}:3000`;
      if (mobileUrlDisplay) {
        mobileUrlDisplay.value = mobileUrl;
      }
      if (mobileQrCode) {
        mobileQrCode.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(mobileUrl)}&margin=10`;
      }
    } catch (e) {
      const fallbackUrl = `http://${window.location.hostname}:3000`;
      if (mobileUrlDisplay) mobileUrlDisplay.value = fallbackUrl;
      if (mobileQrCode) mobileQrCode.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(fallbackUrl)}&margin=10`;
    }

    if (mobileModal) {
      mobileModal.classList.add('open');
    }
  }

  if (openMobileModalBtn) {
    openMobileModalBtn.addEventListener('click', openMobileModal);
  }
  if (closeMobileModalBtn) {
    closeMobileModalBtn.addEventListener('click', () => {
      if (mobileModal) mobileModal.classList.remove('open');
    });
  }
  if (cancelMobileModalBtn) {
    cancelMobileModalBtn.addEventListener('click', () => {
      if (mobileModal) mobileModal.classList.remove('open');
    });
  }
  if (mobileModal) {
    mobileModal.addEventListener('click', (e) => {
      if (e.target === mobileModal) mobileModal.classList.remove('open');
    });
  }
  if (copyMobileUrlBtn && mobileUrlDisplay) {
    copyMobileUrlBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(mobileUrlDisplay.value);
      showToast('휴대폰 접속 주소가 클립보드에 복사되었습니다!', 'success');
    });
  }

  // Register PWA Service Worker for offline capability & Add to Home Screen support
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        console.log('ServiceWorker registered:', reg.scope);
      }).catch((err) => {
        console.warn('ServiceWorker registration error:', err);
      });
    });
  }

  // ----------------------------------------------------
  // 8. Utility: Toast Notification System
  // ----------------------------------------------------
  function showToast(message, type = 'info', action = null) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-triangle-exclamation';

    let actionHtml = '';
    if (action && action.url) {
      actionHtml = `<a href="${action.url}" target="_blank" class="toast-link">${action.text} &rarr;</a>`;
    }

    toast.innerHTML = `
      <i class="fa-solid ${icon}"></i>
      <span>${escapeHtml(message)}</span>
      ${actionHtml}
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
});
