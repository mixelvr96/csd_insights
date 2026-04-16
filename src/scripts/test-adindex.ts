import "dotenv/config";

// Test different approaches to fetch AdIndex RSS

// Approach 1: native fetch with browser-like headers
async function tryFetch() {
  console.log("--- Approach 1: native fetch ---");
  try {
    const res = await fetch("https://adindex.ru/rss/news.xml", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });
    console.log(`Status: ${res.status}`);
    const text = await res.text();
    console.log(`Body length: ${text.length}`);
    console.log(`First 200 chars: ${text.substring(0, 200)}`);
  } catch (e: any) {
    console.log(`Failed: ${e.message}`);
  }
}

// Approach 2: try different URL paths
async function tryUrls() {
  const urls = [
    "https://adindex.ru/rss/news.xml",
    "https://adindex.ru/rss.xml",
    "https://adindex.ru/rss",
    "https://adindex.ru/rss/all.xml",
    "https://www.adindex.ru/rss/news.xml",
    "http://adindex.ru/rss/news.xml",
  ];

  for (const url of urls) {
    console.log(`\n--- ${url} ---`);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        signal: AbortSignal.timeout(10000),
        redirect: "follow",
      });
      console.log(`${res.status} (${res.headers.get("content-type")})`);
    } catch (e: any) {
      console.log(`Failed: ${e.code || e.message}`);
    }
  }
}

async function main() {
  await tryFetch();
  await tryUrls();
}

main().catch(console.error);
