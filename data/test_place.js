const placeId = '15124398';

async function test() {
  try {
    const res = await fetch(`https://m.place.naver.com/restaurant/${placeId}/home`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9'
      }
    });

    const html = await res.text();
    const ogImg = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i);
    console.log('Mobile place og:image:', ogImg ? ogImg[1] : 'none');

    // Check JSON in window.__APOLLO_STATE__ or __NEXT_DATA__
    const apolloMatch = html.match(/window\.__APOLLO_STATE__\s*=\s*({[\s\S]*?});/);
    if (apolloMatch) {
      const state = JSON.parse(apolloMatch[1]);
      const images = [];
      for (const k in state) {
        if (state[k].url && typeof state[k].url === 'string' && state[k].url.includes('pstatic.net')) {
          images.push(state[k].url);
        }
        if (state[k].images && Array.isArray(state[k].images)) {
          for (const img of state[k].images) {
            if (img.url) images.push(img.url);
          }
        }
      }
      console.log('Found APOLLO images:', images.slice(0, 5));
    } else {
      // Find image links in html
      const matches = html.match(/https:\/\/[^"'\s<>]+ldb[^"'\s<>]*\.(?:jpg|jpeg|png|webp)/gi);
      console.log('Found LDB images:', (matches || []).slice(0, 5));
    }

    // Check title
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    console.log('Title:', titleMatch ? titleMatch[1] : 'none');

  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
