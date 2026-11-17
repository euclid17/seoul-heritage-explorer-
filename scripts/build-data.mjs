/**
 * build-data.mjs — 국가유산청 API에서 서울(ccbaCtcd=11) 유산 데이터를 수집하여
 * public/data/seoul-heritage.json으로 저장하는 스크립트
 */

// 국가유산청 서버 SSL 인증서 이슈 우회
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { XMLParser } from 'fast-xml-parser';
import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'seoul-heritage.json');

const API_BASE = 'https://www.khs.go.kr/cha';
const LIST_URL = `${API_BASE}/SearchKindOpenapiList.do`;
const DETAIL_URL = `${API_BASE}/SearchKindOpenapiDt.do`;
const IMAGE_URL = `${API_BASE}/SearchImageOpenapi.do`;

const PAGE_SIZE = 100;
const CONCURRENCY = 6;
const DELAY_MS = 150;
const MAX_RETRIES = 2;

// ★ 중요: parseTagValue: false로 설정하여 ccbaAsno의 0000010000000 앞자리 0이 숫자로 변환되어 유실되지 않도록 함
const parser = new XMLParser({
  ignoreAttributes: false,
  cdataPropName: '__cdata',
  textNodeName: '#text',
  trimValues: true,
  parseTagValue: false,
});

// ── HTTP fetcher ──

function fetchXml(url, retries = MAX_RETRIES) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 30000 }, (res) => {
      let data = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = parser.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`XML parse error: ${e.message}`));
        }
      });
    });
    req.on('error', (err) => {
      if (retries > 0) {
        setTimeout(() => fetchXml(url, retries - 1).then(resolve, reject), 800);
      } else {
        reject(err);
      }
    });
    req.on('timeout', () => {
      req.destroy();
      if (retries > 0) {
        setTimeout(() => fetchXml(url, retries - 1).then(resolve, reject), 800);
      } else {
        reject(new Error('Request timed out'));
      }
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── CDATA value extractor ──

function cdataVal(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v).trim();
  if (typeof v === 'object') {
    if (v.__cdata != null) return String(v.__cdata).trim();
    if (v['#text'] != null) return String(v['#text']).trim();
  }
  return String(v).trim();
}

// ── Date formatter: YYYYMMDD → YYYY-MM-DD ──

function formatDate(raw) {
  const s = String(raw || '').trim();
  if (s.length === 8 && /^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return s;
}

// ── Clean text: remove special characters, collapse whitespace ──

function cleanText(raw) {
  if (!raw) return '';
  let s = cdataVal(raw);
  s = s
    .replace(/<[^>]*>/g, '')          // strip HTML tags
    .replace(/&[a-zA-Z]+;/g, ' ')     // strip HTML entities
    .replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, '') // zero-width / soft hyphen
    .replace(/Ο/g, 'O')              // Greek capital omicron → O
    .replace(/­/g, '')                // soft hyphen literal
    .replace(/\s+/g, ' ')            // collapse whitespace
    .trim();
  return s;
}

// ── Make summary from first 2-3 sentences ──

function makeSummary(content) {
  if (!content) return '';
  const sentences = content.split(/(?<=[.!?다요음함임])\s+/);
  const summary = sentences.slice(0, 3).join(' ');
  return summary.length > 300 ? summary.slice(0, 297) + '…' : summary;
}

// ── Fix image URL: http → https ──

function fixImageUrl(url) {
  if (!url) return '';
  const s = String(url).trim();
  if (!s || s === 'null' || s === 'undefined') return '';
  return s.replace(/^http:\/\//i, 'https://');
}

// ── Build heritage.go.kr source URL ──

function buildSourceUrl(kdcd, asno, ctcd) {
  return `https://www.heritage.go.kr/heri/cul/culSelectDetail.do?ccbaKdcd=${kdcd}&ccbaAsno=${asno}&ccbaCtcd=${ctcd}`;
}

// ── Step 1: Fetch all list items ──

async function fetchAllListItems() {
  console.log('\n📋 목록 수집 시작...');

  const firstUrl = `${LIST_URL}?ccbaCtcd=11&ccbaCncl=N&pageUnit=${PAGE_SIZE}&pageIndex=1`;
  const firstResult = await fetchXml(firstUrl);
  const totalCnt = parseInt(cdataVal(firstResult.result.totalCnt), 10);
  const totalPages = Math.ceil(totalCnt / PAGE_SIZE);

  console.log(`   총 ${totalCnt}건, ${totalPages}페이지`);

  let allItems = [];
  const firstItems = firstResult.result.item;
  if (Array.isArray(firstItems)) allItems.push(...firstItems);
  else if (firstItems) allItems.push(firstItems);

  for (let page = 2; page <= totalPages; page++) {
    const url = `${LIST_URL}?ccbaCtcd=11&ccbaCncl=N&pageUnit=${PAGE_SIZE}&pageIndex=${page}`;
    try {
      const result = await fetchXml(url);
      const items = result.result.item;
      if (Array.isArray(items)) allItems.push(...items);
      else if (items) allItems.push(items);
      process.stdout.write(`   📄 ${page}/${totalPages} (${allItems.length}건)\r`);
    } catch (e) {
      console.error(`\n   ❌ 페이지 ${page} 실패: ${e.message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\n   ✅ 목록 수집 완료: ${allItems.length}건`);
  return allItems;
}

// ── Step 2: Fetch detail + images for each item ──

async function fetchDetailAndImages(item) {
  const kdcd = cdataVal(item.ccbaKdcd);
  // 13자리 0-패딩 보장
  const rawAsno = cdataVal(item.ccbaAsno);
  const asno = rawAsno.length < 13 ? rawAsno.padStart(13, '0') : rawAsno;
  const ctcd = cdataVal(item.ccbaCtcd) || '11';

  // Fetch detail
  const detailUrl = `${DETAIL_URL}?ccbaKdcd=${kdcd}&ccbaAsno=${asno}&ccbaCtcd=${ctcd}`;
  let detail = {};
  try {
    const detailResult = await fetchXml(detailUrl);
    detail = detailResult.result?.item || {};
  } catch (e) {
    // ignore
  }

  // Fetch images
  const imageUrl = `${IMAGE_URL}?ccbaKdcd=${kdcd}&ccbaAsno=${asno}&ccbaCtcd=${ctcd}`;
  let images = [];
  try {
    const imgResult = await fetchXml(imageUrl);
    const imgItem = imgResult.result?.item;
    if (imgItem) {
      if (Array.isArray(imgItem.imageUrl)) {
        for (let i = 0; i < imgItem.imageUrl.length; i++) {
          const u = fixImageUrl(cdataVal(imgItem.imageUrl[i]));
          const d = Array.isArray(imgItem.ccimDesc) ? cdataVal(imgItem.ccimDesc[i]) : '';
          if (u) {
            images.push({ url: u, caption: d });
          }
        }
      } else if (imgItem.imageUrl) {
        const u = fixImageUrl(cdataVal(imgItem.imageUrl));
        const d = cdataVal(imgItem.ccimDesc);
        if (u) {
          images.push({ url: u, caption: d });
        }
      }
    }
  } catch (e) {
    // ignore
  }

  const content = cleanText(detail.content);
  let mainImage = fixImageUrl(cdataVal(detail.imageUrl));
  if (!mainImage && images.length > 0) {
    mainImage = images[0].url;
  }
  if (images.length === 0 && mainImage) {
    images.push({ url: mainImage, caption: '' });
  }

  const rawEra = cleanText(detail.ccceName);
  const rawAddr = cleanText(detail.ccbaLcad);
  const rawDate = formatDate(cdataVal(detail.ccbaAsdt));
  const rawAdmin = cleanText(detail.ccbaAdmin || item.ccbaAdmin);

  return {
    id: `${kdcd}-${asno}-${ctcd}`,
    name: cdataVal(item.ccbaMnm1),
    hanja: cdataVal(item.ccbaMnm2 || detail.ccbaMnm2),
    kind: cdataVal(item.ccmaName || detail.ccmaName),
    kindCode: kdcd,
    gu: cdataVal(item.ccsiName || detail.ccsiName),
    era: rawEra,
    address: rawAddr,
    designatedAt: rawDate,
    admin: rawAdmin,
    image: mainImage,
    images: images,
    summary: makeSummary(content),
    content,
    lat: parseFloat(cdataVal(item.latitude)) || null,
    lng: parseFloat(cdataVal(item.longitude)) || null,
    sourceUrl: buildSourceUrl(kdcd, asno, ctcd),
  };
}

// ── Concurrent batch processor ──

async function processInBatches(items, processor, concurrency, delayMs) {
  const results = new Array(items.length);
  let idx = 0;
  const total = items.length;
  let completed = 0;

  async function worker() {
    while (idx < total) {
      const i = idx++;
      try {
        const result = await processor(items[i]);
        results[i] = result;
      } catch (e) {
        results[i] = null;
      }
      completed++;
      if (completed % 25 === 0 || completed === total) {
        process.stdout.write(`   🔍 ${completed}/${total} 완료\r`);
      }
      await sleep(delayMs);
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  return results.filter(Boolean);
}

// ── Main ──

async function main() {
  console.log('🏯 서울국가유산 데이터 수집 시작');
  console.log('='.repeat(50));

  const listItems = await fetchAllListItems();

  console.log('\n🔎 상세 정보 + 이미지 수집 시작...');
  console.log(`   동시 ${CONCURRENCY}개, 요청 간격 ${DELAY_MS}ms`);
  const heritageItems = await processInBatches(listItems, fetchDetailAndImages, CONCURRENCY, DELAY_MS);

  const output = {
    updatedAt: new Date().toISOString().split('T')[0],
    count: heritageItems.length,
    items: heritageItems,
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`\n\n✅ 완료!`);
  console.log(`   총 ${output.count}건 저장 → ${OUTPUT_FILE}`);
  console.log(`   사진 있는 항목: ${heritageItems.filter((i) => i.image).length}건`);
  console.log(`   사진 없는 항목: ${heritageItems.filter((i) => !i.image).length}건`);

  const sample = heritageItems[0];
  if (sample) {
    console.log('\n📌 샘플 데이터:');
    console.log(JSON.stringify(sample, null, 2).slice(0, 600));
  }
}

main().catch((e) => {
  console.error('❌ 치명적 오류:', e);
  process.exit(1);
});
