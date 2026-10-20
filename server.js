const http = require('http');
const fs = require('fs');
const path = require('path');
const urlModule = require('url');
const os = require('os');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getLocalIpAddress() {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
  } catch (e) {}
  return 'localhost';
}

function getConfig() {
  let fileConfig = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch (e) {
      console.error('Failed to read config file:', e);
    }
  }
  return {
    notionApiKey: process.env.NOTION_API_KEY || fileConfig.notionApiKey || '',
    notionTargetId: process.env.NOTION_TARGET_ID || fileConfig.notionTargetId || '166ad860bd648097afedff31acfa1fb5'
  };
}

function saveConfig(newConfig) {
  const current = getConfig();
  const updated = { ...current, ...newConfig };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

function getHistory() {
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    } catch (e) {
      return [];
    }
  }
  return [];
}

function addHistoryItem(item) {
  const history = getHistory();
  const newItem = {
    id: Date.now().toString(),
    savedAt: new Date().toISOString(),
    ...item
  };
  history.unshift(newItem);
  const trimmed = history.slice(0, 100);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf-8');
  return newItem;
}

function removeHistoryItem(id) {
  const history = getHistory();
  const filtered = history.filter(item => item.id !== id);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
  return filtered;
}

function formatNotionId(rawId) {
  if (!rawId) return '';
  const clean = rawId.replace(/[^a-zA-Z0-9]/g, '').trim();
  if (clean.length === 32) {
    return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
  }
  return rawId;
}

// Helper to fetch real photos from Naver Place
async function fetchRealNaverPlaceData(targetUrl) {
  let placeId = null;
  const match = targetUrl.match(/(?:place|restaurant)\/(\d+)/i) || targetUrl.match(/id=(\d+)/i);
  if (match) {
    placeId = match[1];
  }

  // Handle naver.me short links
  if (!placeId && targetUrl.includes('naver.me')) {
    try {
      const headRes = await fetch(targetUrl, { redirect: 'follow' });
      const m = headRes.url.match(/(?:place|restaurant)\/(\d+)/i);
      if (m) placeId = m[1];
    } catch (e) {}
  }

  if (placeId) {
    try {
      const res = await fetch(`https://m.place.naver.com/restaurant/${placeId}/home`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9'
        }
      });
      if (res.ok) {
        const text = await res.text();
        const ogTitle = text.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i);
        const ogImg = text.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i);
        const ogDesc = text.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i);

        let realImg = '';
        if (ogImg && ogImg[1]) {
          const raw = decodeHtmlEntities(ogImg[1]);
          const srcMatch = raw.match(/src=([^&]+)/);
          realImg = srcMatch ? decodeURIComponent(srcMatch[1]) : raw;
        }

        let title = ogTitle ? decodeHtmlEntities(ogTitle[1]) : '';
        title = title.replace(/\s*:\s*네이버 플레이스.*$/, '').trim();

        // Extract candidate photos from the restaurant
        const photoMatches = text.match(/https:\/\/(?:ldb-phinf|search)\.pstatic\.net\/[^"'\s<>]+\.(?:jpg|jpeg|png|webp)/gi) || [];
        const extraImages = [];
        const seen = new Set();
        if (realImg) {
          extraImages.push(realImg);
          seen.add(realImg);
        }
        for (const raw of photoMatches) {
          let clean = decodeHtmlEntities(raw);
          if (clean.includes('src=')) {
            const sm = clean.match(/src=([^&]+)/);
            if (sm) clean = decodeURIComponent(sm[1]);
          }
          if (!seen.has(clean) && !clean.includes('og-map') && !clean.includes('static/map') && !clean.includes('icon')) {
            seen.add(clean);
            extraImages.push(clean);
          }
          if (extraImages.length >= 10) break;
        }

        return {
          title,
          image: realImg || extraImages[0] || '',
          extraImages,
          description: ogDesc ? decodeHtmlEntities(ogDesc[1]) : '',
          placeId
        };
      }
    } catch (e) {
      console.warn('Place fetch error:', e.message);
    }
  }
  return null;
}

// Robust HTML metadata extractor with special Naver Map & Place handling
async function extractMetadata(html, targetUrl) {
  const result = {
    url: targetUrl,
    title: '',
    description: '',
    image: '',
    extraImages: [],
    siteName: '',
    favicon: '',
    location: '',
    category: '한식'
  };

  try {
    const parsedUrl = new URL(targetUrl);
    result.siteName = parsedUrl.hostname.replace(/^www\./, '');
    result.favicon = `https://www.google.com/s2/favicons?domain=${parsedUrl.hostname}&sz=64`;

    // 1. If Naver Place / Naver Map with place ID, fetch real photo directly from Naver Place
    if (targetUrl.includes('naver.com') || targetUrl.includes('naver.me')) {
      const placeData = await fetchRealNaverPlaceData(targetUrl);
      if (placeData) {
        if (placeData.title) result.title = placeData.title;
        if (placeData.image) result.image = placeData.image;
        if (placeData.extraImages) result.extraImages = placeData.extraImages;
        if (placeData.description) result.description = placeData.description;
        result.siteName = '네이버 플레이스';
      }
    }

    // 2. Special Handling for Naver Map search URLs
    if (targetUrl.includes('map.naver.com')) {
      try {
        const decoded = decodeURIComponent(targetUrl);
        const searchMatch = decoded.match(/\/search\/([^/?#]+)/);
        if (searchMatch && searchMatch[1]) {
          const rawSearch = searchMatch[1].trim();
          if (!result.title) result.title = rawSearch;
          result.siteName = '네이버 지도';
          if (!result.description) result.description = `${rawSearch} - 네이버 지도 장소 정보`;
          
          const parts = rawSearch.split(/\s+/);
          if (parts.length > 1) {
            result.location = parts[0]; // e.g. 구산동, 삼계동, 율하, 주촌
          }

          // Category inference
          if (/국밥|찌개|불고기|갈비|삼겹살|고기|백반|김치|순대|냉면|비빔밥/i.test(rawSearch)) {
            result.category = '한식';
          } else if (/짜장|짬뽕|탕수육|마라|중화/i.test(rawSearch)) {
            result.category = '중식';
          } else if (/스시|초밥|라멘|우동|돈까스|일식/i.test(rawSearch)) {
            result.category = '일식';
          } else if (/파스타|피자|스테이크|이탈리/i.test(rawSearch)) {
            result.category = '이탈리안';
          } else if (/회|해물|조개|게장|생선|대게/i.test(rawSearch)) {
            result.category = '해산물';
          } else if (/카페|커피|베이커리|디저트/i.test(rawSearch)) {
            result.category = '카페';
          }
        }
      } catch (e) {}
    }

    // 2. Title extraction from HTML
    if (!result.title) {
      const ogTitleMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]+content=["']([^"']*)["']/i) ||
                           html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["'](?:og:title|twitter:title)["']/i);
      if (ogTitleMatch && ogTitleMatch[1]) {
        result.title = decodeHtmlEntities(ogTitleMatch[1]);
      } else {
        const titleTagMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        if (titleTagMatch && titleTagMatch[1]) {
          result.title = decodeHtmlEntities(titleTagMatch[1]);
        } else {
          result.title = targetUrl;
        }
      }
    }

    // 3. Description extraction
    if (!result.description) {
      const ogDescMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:og:description|twitter:description|description)["'][^>]+content=["']([^"']*)["']/i) ||
                          html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["'](?:og:description|twitter:description|description)["']/i);
      if (ogDescMatch && ogDescMatch[1]) {
        result.description = decodeHtmlEntities(ogDescMatch[1]);
      }
    }

    // 4. Image extraction
    const ogImgMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']*)["']/i) ||
                       html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
    if (ogImgMatch && ogImgMatch[1]) {
      let rawImg = ogImgMatch[1].trim();
      if (rawImg.startsWith('http')) {
        result.image = rawImg;
      } else {
        try {
          result.image = new URL(rawImg, parsedUrl.origin).href;
        } catch (e) {}
      }
    }

    // 5. Site Name
    const ogSiteName = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)["']/i);
    if (ogSiteName && ogSiteName[1]) {
      result.siteName = decodeHtmlEntities(ogSiteName[1]);
    }

    // 6. Favicon
    const iconMatch = html.match(/<link[^>]+rel=["'](?:shortcut icon|icon)["'][^>]+href=["']([^"']*)["']/i);
    if (iconMatch && iconMatch[1]) {
      let rawFavicon = iconMatch[1].trim();
      if (rawFavicon.startsWith('http')) {
        result.favicon = rawFavicon;
      } else {
        try {
          result.favicon = new URL(rawFavicon, parsedUrl.origin).href;
        } catch (e) {}
      }
    }

    // 7. Beautiful default food image fallback if no image found for restaurant/food search
    if (!result.image && (targetUrl.includes('map.naver.com') || /맛집|식당|푸드|요리|국밥/i.test(result.title))) {
      result.image = 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80';
    }

  } catch (err) {
    console.error('Metadata parse error:', err.message);
  }

  return result;
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
    .trim();
}

// MIME types dictionary
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
  '.manifest': 'application/manifest+json'
};

// Helper: Resolve effective database
// If target is directly a database -> return it.
// If target is a page that CONTAINS a child_database -> return the child_database!
async function resolveNotionTarget(formattedId, apiKey) {
  // 1. Test directly as Database
  try {
    const dbRes = await fetch(`https://api.notion.com/v1/databases/${formattedId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28'
      }
    });
    if (dbRes.ok) {
      const dbData = await dbRes.json();
      return {
        type: 'database',
        id: formattedId,
        title: dbData.title?.[0]?.plain_text || '노션 데이터베이스',
        schema: dbData
      };
    }
  } catch (e) {}

  // 2. Test as Page and look for child_database
  try {
    const pageRes = await fetch(`https://api.notion.com/v1/pages/${formattedId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28'
      }
    });

    if (pageRes.ok) {
      const pageData = await pageRes.json();
      const pageTitle = pageData.properties?.title?.title?.[0]?.plain_text || '노션 페이지';

      // Inspect child blocks to see if there is an inline database
      const blocksRes = await fetch(`https://api.notion.com/v1/blocks/${formattedId}/children`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Notion-Version': '2022-06-28'
        }
      });

      if (blocksRes.ok) {
        const blocksData = await blocksRes.json();
        const childDbBlock = (blocksData.results || []).find(b => b.type === 'child_database');

        if (childDbBlock) {
          // Retrieve child database schema
          const childDbRes = await fetch(`https://api.notion.com/v1/databases/${childDbBlock.id}`, {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Notion-Version': '2022-06-28'
            }
          });

          if (childDbRes.ok) {
            const childDbData = await childDbRes.json();
            return {
              type: 'database',
              id: childDbBlock.id,
              title: `${childDbData.title?.[0]?.plain_text || '추천 식당'} (${pageTitle})`,
              schema: childDbData,
              isChildOfPage: true,
              parentPageId: formattedId
            };
          }
        }
      }

      return {
        type: 'page',
        id: formattedId,
        title: pageTitle
      };
    }
  } catch (e) {}

  return null;
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = urlModule.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // Parse JSON Body Helper
  const parseJsonBody = () => new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
  });

  const sendJson = (statusCode, data) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  };

  try {
    // 1. API: Extract metadata from web page
    if (pathname === '/api/extract' && method === 'POST') {
      const { url } = await parseJsonBody();
      if (!url) {
        return sendJson(400, { error: 'URL을 입력해주세요.' });
      }

      let targetUrl = url.trim();
      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
      }

      // If it's a Naver map / place URL, we can parse immediately
      if (targetUrl.includes('map.naver.com') || targetUrl.includes('place.naver.com') || targetUrl.includes('naver.me')) {
        const meta = await extractMetadata('', targetUrl);
        return sendJson(200, meta);
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 9000);

        const response = await fetch(targetUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
          }
        });
        clearTimeout(timeoutId);

        const html = await response.text();
        const meta = await extractMetadata(html, targetUrl);
        return sendJson(200, meta);

      } catch (err) {
        console.warn('Scraping error:', err.message);
        try {
          const parsed = new URL(targetUrl);
          return sendJson(200, {
            url: targetUrl,
            title: parsed.hostname + ' 웹 링크',
            description: '웹페이지 상세 정보를 자동으로 불러오지 못했습니다. 직접 입력하여 저장할 수 있습니다.',
            image: '',
            siteName: parsed.hostname,
            favicon: `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`,
            isPartial: true
          });
        } catch (e) {
          return sendJson(400, { error: '올바른 웹 URL 주소가 아닙니다.' });
        }
      }
    }

    // 2. API: Check Status & Notion Connection
    if (pathname === '/api/status' && method === 'GET') {
      const config = getConfig();
      const statusData = {
        hasApiKey: !!config.notionApiKey,
        targetId: config.notionTargetId,
        notionConnected: false,
        targetType: null,
        targetTitle: null,
        properties: []
      };

      if (!config.notionApiKey) {
        return sendJson(200, statusData);
      }

      const formattedId = formatNotionId(config.notionTargetId);
      const target = await resolveNotionTarget(formattedId, config.notionApiKey);

      if (target) {
        statusData.notionConnected = true;
        statusData.targetType = target.type;
        statusData.targetTitle = target.title;
        if (target.schema && target.schema.properties) {
          statusData.properties = Object.keys(target.schema.properties).map(k => ({
            name: k,
            type: target.schema.properties[k].type
          }));
        }
        return sendJson(200, statusData);
      } else {
        statusData.error = '노션 페이지/데이터베이스를 찾을 수 없거나 권한이 없습니다. (페이지 우측 상단 ··· -> 연결(Connect)에서 봇을 추가해주세요)';
        return sendJson(200, statusData);
      }
    }

    // 3. API: Save to Notion
    if (pathname === '/api/save-to-notion' && method === 'POST') {
      const { url, title, description, category, tags, memo, image, siteName, location } = await parseJsonBody();
      const config = getConfig();

      if (!config.notionApiKey) {
        // Save to local archive and notify user
        const localItem = addHistoryItem({
          url,
          title: title || url,
          description: description || '',
          category: category || '일반',
          tags: tags || [],
          memo: memo || '',
          image: image || '',
          siteName: siteName || '',
          status: 'local_saved'
        });

        return sendJson(200, {
          success: true,
          mode: 'local',
          item: localItem,
          message: '로컬 대시보드에 성공적으로 저장되었습니다! [설정]에서 Notion API Key를 입력하시면 노션으로 즉시 자동 동기화됩니다.'
        });
      }

      const formattedId = formatNotionId(config.notionTargetId);
      const resolved = await resolveNotionTarget(formattedId, config.notionApiKey);

      if (!resolved) {
        return sendJson(400, { error: '노션 타겟 페이지 또는 데이터베이스를 찾을 수 없습니다.' });
      }

      const pageTitle = (title || url || '새 맛집/링크').slice(0, 100);

      // Build children content blocks
      const children = [];

      // 1) Web Bookmark block
      if (url) {
        children.push({
          object: 'block',
          type: 'bookmark',
          bookmark: { url }
        });
      }

      // 2) Memo callout block
      if (memo) {
        children.push({
          object: 'block',
          type: 'callout',
          callout: {
            rich_text: [{ type: 'text', text: { content: `💡 메모: ${memo}` } }],
            icon: { type: 'emoji', emoji: '📝' }
          }
        });
      }

      // 3) Description paragraph block
      if (description) {
        children.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: description.slice(0, 2000) } }]
          }
        });
      }

      let payload = {};

      if (resolved.type === 'database') {
        const schemaProps = resolved.schema.properties || {};
        const properties = {};

        // 1. Title property
        const titleKey = Object.keys(schemaProps).find(k => schemaProps[k].type === 'title') || '이름';
        properties[titleKey] = {
          title: [{ text: { content: pageTitle } }]
        };

        // 2. Location (위치) rich_text property
        const locationKey = Object.keys(schemaProps).find(k => /위치|지역|장소/i.test(k));
        if (locationKey && schemaProps[locationKey].type === 'rich_text') {
          // Extract location from explicit field or first word of title
          let locText = location || '';
          if (!locText) {
            const parts = pageTitle.split(/\s+/);
            if (parts.length > 1 && /(동|읍|면|리|구|시|로|길)$/.test(parts[0])) {
              locText = parts[0];
            } else if (parts.length > 1) {
              locText = parts[0];
            }
          }
          if (locText) {
            properties[locationKey] = {
              rich_text: [{ text: { content: locText } }]
            };
          }
        }

        // 3. Cuisine / Category (요리 종류 / 카테고리) select property
        const cuisineKey = Object.keys(schemaProps).find(k => /요리|종류|카테고리|분류|category/i.test(k));
        if (cuisineKey && schemaProps[cuisineKey].type === 'select') {
          let selectedCuisine = category || '한식';
          // Clean up emoji if present
          selectedCuisine = selectedCuisine.replace(/^[^\w가-힣]+\s*/, '').trim();
          if (selectedCuisine) {
            properties[cuisineKey] = { select: { name: selectedCuisine } };
          }
        }

        // 4. URL property if database has one
        const urlKey = Object.keys(schemaProps).find(k => schemaProps[k].type === 'url') ||
                       Object.keys(schemaProps).find(k => /링크|url|주소/i.test(k));
        if (urlKey && schemaProps[urlKey].type === 'url' && url) {
          properties[urlKey] = { url: url.slice(0, 2000) };
        }

        // 5. Files property (파일과 미디어)
        const filesKey = Object.keys(schemaProps).find(k => schemaProps[k].type === 'files');
        if (filesKey && image && image.startsWith('http')) {
          properties[filesKey] = {
            files: [
              {
                name: 'thumbnail.jpg',
                type: 'external',
                external: { url: image }
              }
            ]
          };
        }

        // 6. Representative Menu (대표 요리)
        const menuKey = Object.keys(schemaProps).find(k => /대표|메뉴/i.test(k));
        if (menuKey && schemaProps[menuKey].type === 'rich_text' && memo) {
          properties[menuKey] = {
            rich_text: [{ text: { content: memo.slice(0, 500) } }]
          };
        }

        // 7. Multi-select Tags
        const multiKey = Object.keys(schemaProps).find(k => schemaProps[k].type === 'multi_select') ||
                         Object.keys(schemaProps).find(k => /태그|tags/i.test(k));
        if (multiKey && schemaProps[multiKey].type === 'multi_select' && tags && tags.length > 0) {
          properties[multiKey] = {
            multi_select: tags.map(t => ({ name: t.trim() })).filter(t => t.name)
          };
        }

        payload = {
          parent: { database_id: resolved.id },
          properties,
          children,
          icon: { type: 'emoji', emoji: '🍽️' }
        };

        if (image && image.startsWith('http')) {
          payload.cover = { type: 'external', external: { url: image } };
        }

      } else {
        // Target is regular Page
        payload = {
          parent: { page_id: resolved.id },
          properties: {
            title: {
              title: [{ type: 'text', text: { content: pageTitle } }]
            }
          },
          children,
          icon: { type: 'emoji', emoji: '🍽️' }
        };
      }

      // Execute Notion API Create Page
      const createRes = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.notionApiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const responseJson = await createRes.json();

      if (!createRes.ok) {
        console.error('Notion API Error:', responseJson);
        return sendJson(500, {
          error: '노션 저장 실패: ' + (responseJson.message || '알 수 없는 오류'),
          details: responseJson
        });
      }

      const savedItem = addHistoryItem({
        url,
        title: pageTitle,
        description: description || '',
        category: category || '한식',
        tags: tags || [],
        memo: memo || '',
        image: image || '',
        siteName: siteName || '',
        status: 'synced_to_notion',
        notionUrl: responseJson.url,
        notionId: responseJson.id
      });

      return sendJson(200, {
        success: true,
        mode: 'notion',
        item: savedItem,
        notionUrl: responseJson.url,
        message: '노션 맛집 갤러리에 카드 형태로 예쁘게 저장되었습니다! 🎉'
      });
    }

    // 4. API: Save Configuration
    if (pathname === '/api/config' && method === 'POST') {
      const body = await parseJsonBody();
      const updated = saveConfig(body);
      return sendJson(200, {
        success: true,
        config: {
          targetId: updated.notionTargetId,
          hasApiKey: !!updated.notionApiKey
        }
      });
    }

    // 5. API: Get History
    if (pathname === '/api/history' && method === 'GET') {
      return sendJson(200, getHistory());
    }

    // 6. API: Delete History Item
    if (pathname.startsWith('/api/history/') && method === 'DELETE') {
      const id = pathname.replace('/api/history/', '');
      const updated = removeHistoryItem(id);
      return sendJson(200, { success: true, history: updated });
    }

    // 7. API: Network info for mobile access
    if (pathname === '/api/network-info' && method === 'GET') {
      const ip = getLocalIpAddress();
      return sendJson(200, {
        ip,
        port: PORT,
        mobileUrl: `http://${ip}:${PORT}`
      });
    }

    // Static File Serving
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        const indexPath = path.join(PUBLIC_DIR, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return fs.createReadStream(indexPath).pipe(res);
        }
        res.writeHead(404);
        return res.end('Not Found');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    });

  } catch (err) {
    console.error('Server error:', err);
    sendJson(500, { error: '서버 내부 오류: ' + err.message });
  }
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`✨ Notion Web Collector Server Started!`);
  console.log(`🔗 Local URL: http://localhost:${PORT}`);
  console.log(`🎯 Target Notion ID: 166ad860-bd64-8097-afed-ff31acfa1fb5`);
  console.log(`=======================================================`);
});
