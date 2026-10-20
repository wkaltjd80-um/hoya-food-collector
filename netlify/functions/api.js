/**
 * Netlify Serverless Function for Notion Web Collector
 * Handles scraping, metadata extraction, and Notion API integration.
 * Zero external dependencies (uses Node.js 18+ standard fetch).
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-notion-api-key, x-notion-target-id',
  'Content-Type': 'application/json; charset=utf-8'
};

function sendResponse(statusCode, data) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(data)
  };
}

function formatNotionId(rawId) {
  if (!rawId) return '';
  const clean = rawId.replace(/[^a-zA-Z0-9]/g, '').trim();
  if (clean.length === 32) {
    return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
  }
  return rawId;
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
    .trim();
}

// Scrape real food photos and details from Naver Place
async function fetchRealNaverPlaceData(targetUrl) {
  let placeId = null;
  const match = targetUrl.match(/(?:place|restaurant)\/(\d+)/i) || targetUrl.match(/id=(\d+)/i);
  if (match) placeId = match[1];

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
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      if (!res.ok) return null;
      const html = await res.text();

      const extracted = {
        title: '',
        category: '',
        location: '',
        image: '',
        extraImages: []
      };

      const titleMatch = html.match(/<span class="Fc1rA">([^<]+)<\/span>/i) ||
                         html.match(/<span class="GHAhO">([^<]+)<\/span>/i) ||
                         html.match(/<meta property="og:title" content="([^"]+)"/i);
      if (titleMatch && titleMatch[1]) {
        extracted.title = decodeHtmlEntities(titleMatch[1]);
      }

      const catMatch = html.match(/<span class="DJJvD">([^<]+)<\/span>/i);
      if (catMatch && catMatch[1]) {
        const rawCat = decodeHtmlEntities(catMatch[1]);
        if (/국밥|찌개|불고기|갈비|삼겹살|고기|백반|김치|순대|냉면|비빔밥|한식/i.test(rawCat)) {
          extracted.category = '한식';
        } else if (/짜장|짬뽕|탕수육|마라|중화/i.test(rawCat)) {
          extracted.category = '중식';
        } else if (/스시|초밥|라멘|우동|돈까스|일식/i.test(rawCat)) {
          extracted.category = '일식';
        } else if (/파스타|피자|스테이크|양식|이탈리/i.test(rawCat)) {
          extracted.category = '이탈리안';
        } else if (/회|해물|조개|게장|생선|대게/i.test(rawCat)) {
          extracted.category = '해산물';
        } else if (/카페|커피|베이커리|디저트/i.test(rawCat)) {
          extracted.category = '카페';
        } else {
          extracted.category = rawCat;
        }
      }

      const locMatch = html.match(/<span class="LDgIH">([^<]+)<\/span>/i) ||
                       html.match(/<span class="IHDesign">([^<]+)<\/span>/i);
      if (locMatch && locMatch[1]) {
        const fullAddr = decodeHtmlEntities(locMatch[1]);
        const words = fullAddr.split(/\s+/);
        const dongWord = words.find(w => /(동|읍|면|리|구|로|길)$/.test(w));
        extracted.location = dongWord || words[1] || words[0];
      }

      const photoRegex = /https:\/\/ldb-phinf\.pstatic\.net\/[^"'\s\)]+/g;
      const foundPhotos = html.match(photoRegex) || [];
      const cleanPhotos = [];

      for (const p of foundPhotos) {
        let clean = p.split('?')[0].replace(/&amp;/g, '&');
        clean = clean.replace(/\\u002F/g, '/');
        if (!cleanPhotos.includes(clean) && !clean.includes('static.naver')) {
          cleanPhotos.push(clean);
        }
      }

      if (cleanPhotos.length > 0) {
        extracted.image = cleanPhotos[0];
        extracted.extraImages = cleanPhotos.slice(0, 10);
      }

      return extracted;
    } catch (e) {
      console.warn('Failed to scrape mobile Naver place:', e);
    }
  }
  return null;
}

// Extract metadata from arbitrary HTML
async function extractMetadata(html, targetUrl) {
  const parsedUrl = new URL(targetUrl);
  const result = {
    url: targetUrl,
    title: '',
    description: '',
    image: '',
    extraImages: [],
    favicon: '',
    siteName: parsedUrl.hostname,
    location: '',
    category: ''
  };

  const isNaverMap = targetUrl.includes('map.naver.com') || targetUrl.includes('place.naver.com') || targetUrl.includes('naver.me');
  if (isNaverMap) {
    const naverData = await fetchRealNaverPlaceData(targetUrl);
    if (naverData) {
      if (naverData.title) result.title = naverData.title;
      if (naverData.category) result.category = naverData.category;
      if (naverData.location) result.location = naverData.location;
      if (naverData.image) result.image = naverData.image;
      if (naverData.extraImages && naverData.extraImages.length > 0) {
        result.extraImages = naverData.extraImages;
      }
      result.siteName = '네이버 지도';
      result.description = `${result.title || '식당'} - 네이버 플레이스 장소 정보`;
    }

    if (!result.title) {
      try {
        const decoded = decodeURIComponent(targetUrl);
        const searchMatch = decoded.match(/\/search\/([^/?#]+)/);
        if (searchMatch && searchMatch[1]) {
          const rawSearch = searchMatch[1].trim();
          result.title = rawSearch;
          result.siteName = '네이버 지도';
          result.description = `${rawSearch} - 네이버 지도 장소 정보`;
          const parts = rawSearch.split(/\s+/);
          if (parts.length > 1) result.location = parts[0];
        }
      } catch (e) {}
    }
  }

  // Fallback HTML parsing
  if (!result.title && html) {
    const ogTitleMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]+content=["']([^"']*)["']/i) ||
                         html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["'](?:og:title|twitter:title)["']/i);
    if (ogTitleMatch && ogTitleMatch[1]) {
      result.title = decodeHtmlEntities(ogTitleMatch[1]);
    } else {
      const titleTagMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      result.title = (titleTagMatch && titleTagMatch[1]) ? decodeHtmlEntities(titleTagMatch[1]) : targetUrl;
    }
  }

  if (!result.description && html) {
    const ogDescMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:og:description|twitter:description|description)["'][^>]+content=["']([^"']*)["']/i) ||
                        html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["'](?:og:description|twitter:description|description)["']/i);
    if (ogDescMatch && ogDescMatch[1]) {
      result.description = decodeHtmlEntities(ogDescMatch[1]);
    }
  }

  if (!result.image && html) {
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
  }

  result.favicon = `https://www.google.com/s2/favicons?domain=${parsedUrl.hostname}&sz=64`;
  return result;
}

// Resolve Notion Database or Page
async function resolveNotionTarget(formattedId, apiKey) {
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
        id: dbData.id,
        title: dbData.title?.[0]?.plain_text || '노션 데이터베이스',
        schema: dbData
      };
    }
  } catch (e) {}

  try {
    const pageRes = await fetch(`https://api.notion.com/v1/pages/${formattedId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28'
      }
    });
    if (pageRes.ok) {
      const pageData = await pageRes.json();
      let pageTitle = '노션 페이지';
      if (pageData.properties?.title?.title?.[0]?.plain_text) {
        pageTitle = pageData.properties.title.title[0].plain_text;
      }

      // Check for child databases inside the page
      const blocksRes = await fetch(`https://api.notion.com/v1/blocks/${formattedId}/children?page_size=100`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Notion-Version': '2022-06-28'
        }
      });
      if (blocksRes.ok) {
        const blocksData = await blocksRes.json();
        const childDbBlock = blocksData.results?.find(b => b.type === 'child_database');
        if (childDbBlock) {
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

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: ''
    };
  }

  // Parse path
  const fullPath = event.path || '';
  const pathname = fullPath.replace(/^\/\.netlify\/functions\/api/, '').replace(/^\/api/, '') || '/';
  const method = event.httpMethod;

  // Resolve API Key and Target ID
  const apiKey = process.env.NOTION_API_KEY ||
                 event.headers['x-notion-api-key'] ||
                 '';
  const rawTargetId = process.env.NOTION_TARGET_ID ||
                      event.headers['x-notion-target-id'] ||
                      '166ad860bd648097afedff31acfa1fb5';
  const targetId = formatNotionId(rawTargetId);

  // Parse Body
  let body = {};
  if (event.body) {
    try {
      body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
    } catch (e) {
      body = {};
    }
  }

  try {
    // 1. API: Extract metadata
    if (pathname === '/extract' && method === 'POST') {
      const url = body.url ? body.url.trim() : '';
      if (!url) return sendResponse(400, { error: 'URL을 입력해주세요.' });

      let targetUrl = url;
      if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;

      if (targetUrl.includes('map.naver.com') || targetUrl.includes('place.naver.com') || targetUrl.includes('naver.me')) {
        const meta = await extractMetadata('', targetUrl);
        return sendResponse(200, meta);
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(targetUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });
        clearTimeout(timeoutId);
        const html = await res.text();
        const meta = await extractMetadata(html, targetUrl);
        return sendResponse(200, meta);
      } catch (err) {
        return sendResponse(200, await extractMetadata('', targetUrl));
      }
    }

    // 2. API: Status & Connection Check
    if (pathname === '/status' && method === 'GET') {
      const effectiveKey = apiKey || body.notionApiKey || '';
      const effectiveTarget = targetId || formatNotionId(body.notionTargetId);

      if (!effectiveKey) {
        return sendResponse(200, {
          notionConnected: false,
          targetId: effectiveTarget,
          hasApiKey: false,
          error: 'Notion API Secret Key가 설정되지 않았습니다. [설정]에서 등록해 주세요.'
        });
      }

      const resolved = await resolveNotionTarget(effectiveTarget, effectiveKey);
      if (resolved) {
        return sendResponse(200, {
          notionConnected: true,
          targetId: effectiveTarget,
          hasApiKey: true,
          targetType: resolved.type,
          targetTitle: resolved.title,
          properties: resolved.schema?.properties ? Object.keys(resolved.schema.properties).map(k => ({
            name: k,
            type: resolved.schema.properties[k].type
          })) : []
        });
      }

      return sendResponse(200, {
        notionConnected: false,
        targetId: effectiveTarget,
        hasApiKey: true,
        error: 'Notion 연결 실패: API 키 또는 페이지 ID를 확인하고 노션 페이지 상단 [···] -> [연결]에 통합 봇이 추가되어 있는지 확인하세요.'
      });
    }

    // 3. API: Save to Notion
    if ((pathname === '/save-to-notion' || pathname === '/notion/save') && method === 'POST') {
      const { url, title, description, category, tags, memo, image, location, siteName } = body;
      const effectiveKey = body.notionApiKey || apiKey;
      const effectiveTarget = formatNotionId(body.notionTargetId || targetId);

      if (!url) return sendResponse(400, { error: '저장할 URL이 필요합니다.' });
      if (!effectiveKey) return sendResponse(400, { error: 'Notion API 키가 필요합니다. 상단 [설정]에 입력해 주세요.' });

      const resolved = await resolveNotionTarget(effectiveTarget, effectiveKey);
      if (!resolved) {
        return sendResponse(400, { error: 'Notion 페이지 또는 데이터베이스를 찾을 수 없습니다. [설정]과 봇 연결을 확인하세요.' });
      }

      const pageTitle = (title || url).trim();
      const children = [];

      if (url) children.push({ object: 'block', type: 'bookmark', bookmark: { url } });
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
      if (description) {
        children.push({
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: [{ type: 'text', text: { content: description.slice(0, 2000) } }] }
        });
      }

      let payload = {};

      if (resolved.type === 'database') {
        const schemaProps = resolved.schema.properties || {};
        const properties = {};

        const titleKey = Object.keys(schemaProps).find(k => schemaProps[k].type === 'title') || '이름';
        properties[titleKey] = { title: [{ text: { content: pageTitle } }] };

        const locationKey = Object.keys(schemaProps).find(k => /위치|지역|장소/i.test(k));
        if (locationKey && schemaProps[locationKey].type === 'rich_text') {
          let locText = location || '';
          if (!locText) {
            const parts = pageTitle.split(/\s+/);
            if (parts.length > 1) locText = parts[0];
          }
          if (locText) properties[locationKey] = { rich_text: [{ text: { content: locText } }] };
        }

        const cuisineKey = Object.keys(schemaProps).find(k => /요리|종류|카테고리|분류/i.test(k));
        if (cuisineKey && schemaProps[cuisineKey].type === 'select') {
          let selectedCuisine = (category || '한식').replace(/^[^\w가-힣]+\s*/, '').trim();
          if (selectedCuisine) properties[cuisineKey] = { select: { name: selectedCuisine } };
        }

        const urlKey = Object.keys(schemaProps).find(k => schemaProps[k].type === 'url') ||
                       Object.keys(schemaProps).find(k => /링크|url|주소/i.test(k));
        if (urlKey && schemaProps[urlKey].type === 'url' && url) {
          properties[urlKey] = { url: url.slice(0, 2000) };
        }

        const filesKey = Object.keys(schemaProps).find(k => schemaProps[k].type === 'files');
        if (filesKey && image && image.startsWith('http')) {
          properties[filesKey] = {
            files: [{ name: 'thumbnail.jpg', type: 'external', external: { url: image } }]
          };
        }

        const menuKey = Object.keys(schemaProps).find(k => /대표|메뉴/i.test(k));
        if (menuKey && schemaProps[menuKey].type === 'rich_text' && memo) {
          properties[menuKey] = { rich_text: [{ text: { content: memo.slice(0, 500) } }] };
        }

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
          children
        };
      } else {
        payload = {
          parent: { page_id: resolved.id },
          properties: { title: [{ text: { content: pageTitle } }] },
          children
        };
      }

      if (image && image.startsWith('http')) {
        payload.cover = { type: 'external', external: { url: image } };
      }

      const notionRes = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${effectiveKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const responseJson = await notionRes.json();
      if (!notionRes.ok) {
        return sendResponse(notionRes.status, {
          error: responseJson.message || '노션 페이지 생성 실패',
          details: responseJson
        });
      }

      const savedItem = {
        id: Date.now().toString(),
        savedAt: new Date().toISOString(),
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
      };

      return sendResponse(200, {
        success: true,
        mode: 'notion',
        item: savedItem,
        notionUrl: responseJson.url,
        message: '노션 맛집 갤러리에 카드 형태로 예쁘게 저장되었습니다! 🎉'
      });
    }

    // 4. API: Network info
    if (pathname === '/network-info' && method === 'GET') {
      return sendResponse(200, {
        platform: 'Netlify Cloud',
        deployed: true
      });
    }

    // 5. API: Config (echo back)
    if (pathname === '/config' && method === 'POST') {
      return sendResponse(200, {
        success: true,
        config: {
          targetId: body.notionTargetId || targetId,
          hasApiKey: !!(body.notionApiKey || apiKey)
        }
      });
    }

    return sendResponse(404, { error: 'Not Found' });

  } catch (err) {
    console.error('Serverless function error:', err);
    return sendResponse(500, { error: '서버리스 함수 실행 오류: ' + err.message });
  }
};
