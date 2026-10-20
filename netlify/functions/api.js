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
  const clean = String(rawId).replace(/[^a-zA-Z0-9]/g, '').trim();
  if (clean.length === 32) {
    return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
  }
  return rawId;
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#x1c;/gi, '')
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .trim();
}

function cleanTitle(raw) {
  if (!raw) return '';
  return decodeHtmlEntities(raw)
    .replace(/(?:[\s\-_|:]+네이버\s*(?:지도|플레이스|MY PLACE)?|[\s\-_|:]*네이버\s*(?:지도|플레이스|MY PLACE))$/i, '')
    .replace(/(?:[\s\-_|:]+카카오맵?|[\s\-_|:]*카카오맵)$/i, '')
    .replace(/(?:[\s\-_|:]+Naver\s*(?:Map|Place)?|[\s\-_|:]*Naver\s*(?:Map|Place))$/i, '')
    .trim();
}

const DEFAULT_FOOD_PHOTOS = {
  '한식': 'https://images.unsplash.com/photo-1590301157890-4810ed352733?auto=format&fit=crop&w=800&q=80',
  '고기': 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80',
  '국밥': 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80',
  '일식': 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=800&q=80',
  '이탈리안': 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=800&q=80',
  '중식': 'https://images.unsplash.com/photo-1525755662778-989d0524087e?auto=format&fit=crop&w=800&q=80',
  '해산물': 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=800&q=80',
  '카페': 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=80',
  '프랑스식': 'https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?auto=format&fit=crop&w=800&q=80',
  '기타': 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80'
};

// Safely extract URL, Title hint, and Address hint from mobile shares (Naver Map, Kakao Map, etc.)
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
  
  return { url, hintTitle, hintAddress };
}

// Resolve short URLs (naver.me, kko.kakao.com, etc.)
async function resolveShortUrl(targetUrl) {
  let resolvedUrl = targetUrl;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    clearTimeout(timeoutId);
    if (res.url) resolvedUrl = res.url;
    
    if (resolvedUrl.includes('naver.me') || resolvedUrl.includes('kko.kakao.com')) {
      const html = await res.text();
      const metaRefresh = html.match(/content=["']\d+;\s*url=([^"']+)["']/i);
      if (metaRefresh && metaRefresh[1]) {
        resolvedUrl = metaRefresh[1];
      }
      const placeIdMatch = html.match(/(?:place|restaurant)\/(\d+)/i) || html.match(/id=(\d+)/i);
      if (placeIdMatch) {
        resolvedUrl = `https://m.place.naver.com/restaurant/${placeIdMatch[1]}/home`;
      }
    }
  } catch (e) {
    console.warn('Short url resolution error:', e.message);
  }
  return resolvedUrl;
}

// Scrape high-quality Naver Place details and real food photos
async function scrapeNaverPlace(targetUrl, hints = {}) {
  let currentUrl = targetUrl;
  let placeId = null;

  const match = currentUrl.match(/(?:place|restaurant)\/(\d+)/i) || currentUrl.match(/id=(\d+)/i);
  if (match) placeId = match[1];

  if (!placeId && currentUrl.includes('naver.me')) {
    currentUrl = await resolveShortUrl(currentUrl);
    const m = currentUrl.match(/(?:place|restaurant)\/(\d+)/i) || currentUrl.match(/id=(\d+)/i);
    if (m) placeId = m[1];
  }

  // Handle Search URL (e.g. map.naver.com/p/search/...)
  if (!placeId && currentUrl.includes('/search/')) {
    try {
      const decoded = decodeURIComponent(currentUrl);
      const searchMatch = decoded.match(/\/search\/([^/?#]+)/);
      if (searchMatch && searchMatch[1]) {
        const rawSearch = searchMatch[1].trim();
        const parts = rawSearch.split(/\s+/);
        let location = parts.length > 1 ? parts[0] : '';
        return {
          title: rawSearch,
          category: '한식',
          location: location || hints.hintAddress || '',
          description: `${rawSearch} - 네이버 지도 검색 정보`,
          image: '',
          extraImages: [],
          siteName: '네이버 지도'
        };
      }
    } catch (e) {}
  }

  if (placeId) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(`https://m.place.naver.com/restaurant/${placeId}/home`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const html = await res.text();
        const extracted = {
          title: '',
          category: '',
          location: '',
          description: '',
          image: '',
          extraImages: [],
          siteName: '네이버 플레이스'
        };

        // 1. Parse window.__APOLLO_STATE__ (rich official JSON)
        const stateMatch = html.match(/window\.__APOLLO_STATE__\s*=\s*({.+?});/s);
        if (stateMatch) {
          try {
            const data = JSON.parse(stateMatch[1]);
            const placeKey = `PlaceDetailBase:${placeId}`;
            const placeData = data[placeKey] || Object.values(data).find(v => v?.__typename === 'PlaceDetailBase');
            
            if (placeData) {
              extracted.title = cleanTitle(placeData.name);
              
              const rawCat = placeData.category || '';
              if (/국밥|찌개|불고기|갈비|삼겹살|고기|백반|김치|순대|냉면|비빔밥|한식|보쌈|족발/i.test(rawCat)) {
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
                extracted.category = rawCat || '한식';
              }

              const fullAddr = placeData.address || placeData.roadAddress || '';
              if (fullAddr) {
                const words = fullAddr.split(/\s+/);
                const dongWord = words.find(w => /(동|읍|면|리)$/.test(w)) || words.find(w => /(구|로|길)$/.test(w));
                extracted.location = dongWord || words[1] || words[0];
              }

              const descParts = [];
              if (placeData.visitorReviewsTotal) descParts.push(`방문자리뷰 ${placeData.visitorReviewsTotal.toLocaleString()}명`);
              if (placeData.cafeBlogReviewsTotal) descParts.push(`블로그리뷰 ${placeData.cafeBlogReviewsTotal.toLocaleString()}개`);
              if (placeData.microReviews && placeData.microReviews[0]) descParts.push(`"${placeData.microReviews[0]}"`);
              if (placeData.roadAddress) descParts.push(`📍 ${placeData.roadAddress}`);
              if (placeData.virtualPhone || placeData.phone) descParts.push(`📞 ${placeData.virtualPhone || placeData.phone}`);
              extracted.description = descParts.join(' · ') || `${extracted.title} - 네이버 플레이스 장소 정보`;
            }

            // Extract high resolution photos
            const photos = [];
            for (const [k, v] of Object.entries(data)) {
              if (v && typeof v === 'object') {
                const img = v.originalUrl || v.thumbnailUrl || v.imageUrl;
                if (img && typeof img === 'string' && img.startsWith('http') && !img.includes('static.naver')) {
                  let cleanImg = img.split('?')[0].replace(/&amp;/g, '&');
                  if (!photos.includes(cleanImg)) photos.push(cleanImg);
                }
              }
            }

            if (photos.length > 0) {
              extracted.image = photos[0];
              extracted.extraImages = photos.slice(0, 10);
            }
          } catch (e) {}
        }

        // Fallback meta parsing
        if (!extracted.title) {
          const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) ||
                               html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i);
          if (ogTitleMatch && ogTitleMatch[1]) {
            extracted.title = cleanTitle(ogTitleMatch[1]);
          }
        }

        if (!extracted.image) {
          const ogImgMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i) ||
                             html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i);
          if (ogImgMatch && ogImgMatch[1]) {
            let rawImg = decodeHtmlEntities(ogImgMatch[1]);
            const srcMatch = rawImg.match(/src=([^&]+)/);
            if (srcMatch) {
              extracted.image = decodeURIComponent(srcMatch[1]);
            } else {
              extracted.image = rawImg;
            }
            if (extracted.image && !extracted.extraImages.includes(extracted.image)) {
              extracted.extraImages.unshift(extracted.image);
            }
          }
        }

        if (extracted.title) {
          if (!extracted.location && hints.hintAddress) extracted.location = hints.hintAddress;
          return extracted;
        }
      }
    } catch (e) {
      console.warn('Failed scraping place:', e.message);
    }
  }

  if (hints.hintTitle) {
    return {
      title: hints.hintTitle,
      category: '한식',
      location: hints.hintAddress || '',
      description: `${hints.hintTitle} - 네이버 지도`,
      image: '',
      extraImages: [],
      siteName: '네이버 지도'
    };
  }

  return null;
}

// Scrape Kakao Map details
async function scrapeKakaoPlace(targetUrl, hints = {}) {
  let currentUrl = targetUrl;
  if (currentUrl.includes('kko.kakao.com')) {
    currentUrl = await resolveShortUrl(currentUrl);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(currentUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const html = await res.text();
      const extracted = {
        title: '',
        category: '한식',
        location: '',
        description: '',
        image: '',
        extraImages: [],
        siteName: '카카오맵'
      };

      const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) ||
                           html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i);
      if (ogTitleMatch && ogTitleMatch[1]) {
        extracted.title = cleanTitle(ogTitleMatch[1]);
      }

      const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i) ||
                          html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["']/i);
      if (ogDescMatch && ogDescMatch[1]) {
        const fullAddr = decodeHtmlEntities(ogDescMatch[1]);
        extracted.description = fullAddr;
        const words = fullAddr.split(/\s+/);
        const dongWord = words.find(w => /(동|읍|면|리)$/.test(w)) || words.find(w => /(구|로|길)$/.test(w));
        extracted.location = dongWord || words[1] || words[0] || '';
      }

      const ogImgMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i) ||
                         html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i);
      if (ogImgMatch && ogImgMatch[1]) {
        let img = decodeHtmlEntities(ogImgMatch[1]);
        if (img.startsWith('//')) img = 'https:' + img;
        extracted.image = img;
        extracted.extraImages.push(img);
      }

      if (extracted.title) {
        if (!extracted.location && hints.hintAddress) extracted.location = hints.hintAddress;
        return extracted;
      }
    }
  } catch (e) {
    console.warn('Failed scraping kakao place:', e.message);
  }

  if (hints.hintTitle) {
    return {
      title: hints.hintTitle,
      category: '한식',
      location: hints.hintAddress || '',
      description: `${hints.hintTitle} - 카카오맵`,
      image: '',
      extraImages: [],
      siteName: '카카오맵'
    };
  }

  return null;
}

// Extract metadata from arbitrary HTML or URL with zero crashing
async function extractMetadata(html, targetUrl, hints = {}) {
  let hostname = '';
  try {
    const parsed = new URL(targetUrl);
    hostname = parsed.hostname;
  } catch (e) {
    hostname = 'unknown';
  }

  const result = {
    url: targetUrl,
    title: hints.hintTitle || '',
    description: '',
    image: '',
    extraImages: [],
    favicon: hostname && hostname !== 'unknown' ? `https://www.google.com/s2/favicons?domain=${hostname}&sz=64` : '',
    siteName: hostname.replace(/^www\./, ''),
    location: hints.hintAddress || '',
    category: '한식'
  };

  const isNaverMap = targetUrl.includes('map.naver.com') || targetUrl.includes('place.naver.com') || targetUrl.includes('naver.me');
  if (isNaverMap) {
    const naverData = await scrapeNaverPlace(targetUrl, hints);
    if (naverData) {
      if (naverData.title) result.title = naverData.title;
      if (naverData.category) result.category = naverData.category;
      if (naverData.location) result.location = naverData.location;
      if (naverData.image) result.image = naverData.image;
      if (naverData.extraImages?.length) result.extraImages = naverData.extraImages;
      if (naverData.description) result.description = naverData.description;
      result.siteName = naverData.siteName || '네이버 플레이스';
      return result;
    }
  }

  const isKakaoMap = targetUrl.includes('map.kakao.com') || targetUrl.includes('kko.kakao.com') || targetUrl.includes('place.map.kakao.com');
  if (isKakaoMap) {
    const kakaoData = await scrapeKakaoPlace(targetUrl, hints);
    if (kakaoData) {
      if (kakaoData.title) result.title = kakaoData.title;
      if (kakaoData.category) result.category = kakaoData.category;
      if (kakaoData.location) result.location = kakaoData.location;
      if (kakaoData.image) result.image = kakaoData.image;
      if (kakaoData.extraImages?.length) result.extraImages = kakaoData.extraImages;
      if (kakaoData.description) result.description = kakaoData.description;
      result.siteName = kakaoData.siteName || '카카오맵';
      return result;
    }
  }

  const isInstagram = targetUrl.includes('instagram.com');
  if (isInstagram) {
    const postMatch = targetUrl.match(/instagram\.com\/(?:p|reel|tv)\/([a-zA-Z0-9_-]+)/i);
    const userMatch = targetUrl.match(/instagram\.com\/([a-zA-Z0-9._]+)/i);
    result.siteName = 'Instagram';
    result.category = '기타';
    result.image = DEFAULT_FOOD_PHOTOS['기타'];
    result.extraImages = Object.values(DEFAULT_FOOD_PHOTOS);
    if (postMatch) {
      result.title = hints.hintTitle || `인스타그램 맛집 게시물 (${postMatch[1]})`;
      result.description = `인스타그램 릴스/피드 링크 (${targetUrl})`;
    } else if (userMatch && !['explore', 'reels', 'stories', 'accounts', 'direct'].includes(userMatch[1].toLowerCase())) {
      result.title = hints.hintTitle || `@${userMatch[1]} (인스타그램)`;
      result.description = `인스타그램 @${userMatch[1]} 프로필 / 추천 맛집`;
    }
    return result;
  }

  // Fallback to fetch HTML if not already fetched
  let docHtml = html;
  if (!docHtml && targetUrl && /^https?:\/\//i.test(targetUrl)) {
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
      if (res.ok) docHtml = await res.text();
    } catch (e) {}
  }

  if (docHtml) {
    const ogTitleMatch = docHtml.match(/<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]+content=["']([^"']*)["']/i) ||
                         docHtml.match(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["'](?:og:title|twitter:title)["']/i);
    if (ogTitleMatch && ogTitleMatch[1]) {
      result.title = decodeHtmlEntities(ogTitleMatch[1]);
    } else if (!result.title) {
      const titleTagMatch = docHtml.match(/<title[^>]*>([^<]*)<\/title>/i);
      if (titleTagMatch && titleTagMatch[1]) {
        result.title = decodeHtmlEntities(titleTagMatch[1]);
      }
    }

    const ogDescMatch = docHtml.match(/<meta[^>]+(?:property|name)=["'](?:og:description|twitter:description|description)["'][^>]+content=["']([^"']*)["']/i) ||
                        docHtml.match(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["'](?:og:description|twitter:description|description)["']/i);
    if (ogDescMatch && ogDescMatch[1]) {
      result.description = decodeHtmlEntities(ogDescMatch[1]);
    }

    const ogImgMatch = docHtml.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']*)["']/i) ||
                       docHtml.match(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
    if (ogImgMatch && ogImgMatch[1]) {
      let rawImg = decodeHtmlEntities(ogImgMatch[1]);
      if (rawImg.startsWith('http')) {
        result.image = rawImg;
      } else if (rawImg.startsWith('//')) {
        result.image = 'https:' + rawImg;
      } else {
        try {
          result.image = new URL(rawImg, targetUrl).href;
        } catch (e) {}
      }
      if (result.image) result.extraImages.push(result.image);
    }
  }

  if (!result.title) result.title = hints.hintTitle || targetUrl;

  // Ensure an appetizing photo is always available even if scraping blocked images
  if (!result.image) {
    result.image = DEFAULT_FOOD_PHOTOS[result.category] || DEFAULT_FOOD_PHOTOS['한식'];
  }
  if (!result.extraImages || result.extraImages.length === 0) {
    result.extraImages = [result.image, ...Object.values(DEFAULT_FOOD_PHOTOS).filter(u => u !== result.image)];
  } else if (!result.extraImages.includes(result.image)) {
    result.extraImages.unshift(result.image);
  }

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
      const rawInput = body.url ? String(body.url).trim() : '';
      if (!rawInput) return sendResponse(400, { error: 'URL을 입력해주세요.' });

      const { url: cleanUrl, hintTitle, hintAddress } = extractUrlAndHints(rawInput);
      const effectiveHints = {
        hintTitle: body.hintTitle || hintTitle,
        hintAddress: body.hintAddress || hintAddress
      };

      try {
        const meta = await extractMetadata('', cleanUrl, effectiveHints);
        return sendResponse(200, meta);
      } catch (extractErr) {
        console.error('Extract error fallback:', extractErr);
        // Fallback gracefully rather than crashing with 500
        const fallbackImg = DEFAULT_FOOD_PHOTOS['한식'];
        return sendResponse(200, {
          url: cleanUrl || rawInput,
          title: effectiveHints.hintTitle || cleanUrl || rawInput,
          description: '',
          image: fallbackImg,
          extraImages: Object.values(DEFAULT_FOOD_PHOTOS),
          favicon: '',
          siteName: '웹페이지',
          location: effectiveHints.hintAddress || '',
          category: '한식'
        });
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

    // 2-1. API: Upload phone photo directly to Notion files storage
    if (pathname === '/upload-image' && method === 'POST') {
      const { imageBase64, filename, mimeType } = body;
      const effectiveKey = body.notionApiKey || apiKey;

      if (!imageBase64) return sendResponse(400, { error: '업로드할 이미지 데이터가 없습니다.' });
      if (!effectiveKey) return sendResponse(400, { error: 'Notion API 키가 설정되지 않았습니다. 상단 [설정]을 확인하세요.' });

      try {
        const cleanBase64 = String(imageBase64).replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
        const buffer = Buffer.from(cleanBase64, 'base64');
        const safeFilename = (filename || 'phone_food.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
        const safeMime = mimeType || 'image/jpeg';

        // 1. Create file upload session in Notion
        const initRes = await fetch('https://api.notion.com/v1/file_uploads', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${effectiveKey}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            filename: safeFilename,
            content_type: safeMime
          })
        });

        const uploadInfo = await initRes.json();
        if (!initRes.ok) {
          return sendResponse(initRes.status, {
            error: uploadInfo.message || '노션 파일 업로드 세션 생성 실패',
            details: uploadInfo
          });
        }

        // 2. Upload binary buffer to Notion's upload_url
        const fd = new FormData();
        fd.append('file', new Blob([buffer], { type: safeMime }), safeFilename);

        const sendRes = await fetch(uploadInfo.upload_url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${effectiveKey}`,
            'Notion-Version': '2022-06-28'
          },
          body: fd
        });

        const sendInfo = await sendRes.json();
        if (!sendRes.ok) {
          return sendResponse(sendRes.status, {
            error: sendInfo.message || '노션 파일 바이너리 전송 실패',
            details: sendInfo
          });
        }

        return sendResponse(200, {
          success: true,
          fileUploadId: uploadInfo.id,
          filename: safeFilename
        });
      } catch (uploadErr) {
        console.error('Image upload error:', uploadErr);
        return sendResponse(500, { error: '스마트폰 사진 업로드 처리 실패: ' + (uploadErr.message || '오류') });
      }
    }

    // 3. API: Save to Notion
    if ((pathname === '/save-to-notion' || pathname === '/notion/save') && method === 'POST') {
      const { url, title, description, category, tags, memo, image, location, siteName, fileUploadId } = body;
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

      // If user uploaded a photo from their phone, include it as an image block at the very top!
      if (fileUploadId) {
        children.push({
          object: 'block',
          type: 'image',
          image: { type: 'file_upload', file_upload: { id: fileUploadId } }
        });
      }

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

      // Attach representative cover photo
      if (fileUploadId) {
        payload.cover = { type: 'file_upload', file_upload: { id: fileUploadId } };
      } else if (image && image.startsWith('http')) {
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
    return sendResponse(500, { error: '서버리스 처리 오류: ' + (err.message || '알 수 없는 오류') });
  }
};
