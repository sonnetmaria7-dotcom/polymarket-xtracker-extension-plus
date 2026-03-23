const USERS_API = 'https://xtracker.polymarket.com/api/users';
const TRACKING_API = (id) => `https://xtracker.polymarket.com/api/trackings/${id}?includeStats=true`;
const SUMMARY_ID = 'xtracker-overlay-summary';
const BADGE_CLASS = 'xtracker-overlay-badge';

let cachedUsers = null;
let cachedTracking = null;
let lastRenderKey = null;

function normalizeText(value) {
  return (value || '')
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim()
    .toLowerCase();
}

function cleanUrl(url) {
  try {
    const parsed = new URL(url, location.origin);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return (url || '').replace(/\/$/, '');
  }
}

function formatNum(value, digits = 1) {
  if (!Number.isFinite(value)) return '—';
  const fixed = value.toFixed(digits);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function formatDurationHours(hours) {
  if (!Number.isFinite(hours) || hours < 0) return '—';
  if (hours < 1) return `${formatNum(hours * 60, 0)} 分钟`;
  if (hours < 24) return `${formatNum(hours, 1)} 小时`;
  return `${formatNum(hours / 24, 2)} 天`;
}

function parseRange(label) {
  const text = (label || '').trim();
  let match = text.match(/^(\d+)\s*-\s*(\d+)$/);
  if (match) return { lower: Number(match[1]), upper: Number(match[2]), label: text };
  match = text.match(/^(\d+)\s*\+$/);
  if (match) return { lower: Number(match[1]), upper: Infinity, label: text };
  match = text.match(/^under\s*(\d+)$/i);
  if (match) return { lower: 0, upper: Number(match[1]) - 1, label: text };
  match = text.match(/^(\d+)\s*or more$/i);
  if (match) return { lower: Number(match[1]), upper: Infinity, label: text };
  return null;
}

function findTitleElement() {
  return document.querySelector('h1');
}

function getCurrentTitle() {
  return findTitleElement()?.textContent?.trim() || '';
}

async function fetchUsers() {
  if (cachedUsers) return cachedUsers;
  const response = await fetch(USERS_API, { credentials: 'omit' });
  if (!response.ok) throw new Error(`xtracker users api failed: ${response.status}`);
  const json = await response.json();
  cachedUsers = json?.data || [];
  return cachedUsers;
}

async function fetchTrackingDetails(id) {
  if (cachedTracking?.id === id) return cachedTracking;
  const response = await fetch(TRACKING_API(id), { credentials: 'omit' });
  if (!response.ok) throw new Error(`xtracker tracking api failed: ${response.status}`);
  const json = await response.json();
  cachedTracking = json?.data || null;
  return cachedTracking;
}

async function findTrackingForCurrentMarket() {
  const title = getCurrentTitle();
  if (!title) return null;

  const users = await fetchUsers();
  const currentUrl = cleanUrl(location.href);
  const normalizedTitle = normalizeText(title);
  const slug = location.pathname.replace(/\/$/, '');

  let matched = null;
  for (const user of users) {
    for (const tracking of user.trackings || []) {
      const marketLink = cleanUrl(tracking.marketLink || '');
      const sameLink = marketLink && marketLink === currentUrl;
      const sameSlug = marketLink && marketLink.endsWith(slug);
      const sameTitle = normalizeText(tracking.title) === normalizedTitle;
      if (sameLink || sameSlug || sameTitle) {
        matched = { ...tracking, user };
        break;
      }
    }
    if (matched) break;
  }

  if (!matched) return null;
  const details = await fetchTrackingDetails(matched.id);
  return details ? { ...details, user: matched.user } : null;
}

function getRemainingDays(endDate) {
  const remainingMs = new Date(endDate).getTime() - Date.now();
  return Math.max(remainingMs / 86400000, 0);
}

function getRemainingHours(endDate) {
  return getRemainingDays(endDate) * 24;
}

function estimateRates(total, remainingHours, range) {
  if (!Number.isFinite(total)) return null;
  if (!Number.isFinite(remainingHours) || remainingHours <= 0) return null;

  const needToLower = Math.max(range.lower - total, 0);
  const roomToUpper = range.upper === Infinity ? Infinity : Math.max(range.upper - total, 0);

  return {
    perHourMin: needToLower / remainingHours,
    perDayMin: (needToLower / remainingHours) * 24,
    perHourMax: Number.isFinite(roomToUpper) ? roomToUpper / remainingHours : Infinity,
    perDayMax: Number.isFinite(roomToUpper) ? (roomToUpper / remainingHours) * 24 : Infinity,
  };
}

/**
 * Compute sliding-window velocity from stats.daily (hourly buckets from API).
 * Each bucket is treated as [date, date + 1h) with an hourly count.
 * We weight partially overlapped buckets proportionally, so the result is a
 * true rolling-window average instead of a rough whole-hour approximation.
 */
function windowVelocityFromDaily(daily, windowHours, now) {
  if (!Array.isArray(daily) || daily.length === 0) return null;

  const windowMs = windowHours * 3600000;
  const startMs = now - windowMs;
  let weightedCount = 0;
  let coveredMs = 0;

  for (const bucket of daily) {
    const bucketStart = new Date(bucket.date).getTime();
    if (Number.isNaN(bucketStart)) continue;
    const bucketEnd = bucketStart + 3600000;
    const overlapMs = Math.max(0, Math.min(bucketEnd, now) - Math.max(bucketStart, startMs));
    if (overlapMs <= 0) continue;

    const count = Number(bucket.count) || 0;
    const weight = overlapMs / 3600000;
    weightedCount += count * weight;
    coveredMs += overlapMs;
  }

  if (coveredMs <= 0) return null;
  return weightedCount / (coveredMs / 3600000);
}

function inferObservedVelocity(tracking) {
  const total = Number(tracking?.stats?.total ?? tracking?.stats?.cumulative ?? 0);
  const start = new Date(tracking?.startDate).getTime();
  const end = new Date(tracking?.endDate).getTime();
  const now = Date.now();

  if (!Number.isFinite(total) || Number.isNaN(start) || Number.isNaN(end)) return null;

  const elapsedHours = Math.max((Math.min(now, end) - start) / 3600000, 0);
  if (elapsedHours <= 0) return null;

  const perHour = total / elapsedHours;
  const daily = tracking?.stats?.daily || [];

  return {
    elapsedHours,
    perHour,
    perDay: perHour * 24,
    w4h:  windowVelocityFromDaily(daily, 4,  now),
    w12h: windowVelocityFromDaily(daily, 12, now),
    w24h: windowVelocityFromDaily(daily, 24, now),
  };
}

function isTradingPanel(card) {
  if (!card) return false;
  const text = (card.textContent || '').replace(/\s+/g, ' ').trim();
  return ['Limit Price', 'Shares', 'Set Expiration', 'Balance $', 'Buy Sell', 'To win', 'Total']
    .some((part) => text.includes(part));
}

function findOutcomeNodes() {
  const candidates = [...document.querySelectorAll('p, span, div')];
  const hits = [];
  const seen = new Set();

  for (const node of candidates) {
    const text = node.textContent?.trim();
    if (!text) continue;
    if (!parseRange(text)) continue;

    let card = null;
    let current = node;
    for (let i = 0; i < 8 && current; i += 1, current = current.parentElement) {
      const hasBuyYes = [...(current.querySelectorAll?.('button') || [])].some((btn) => /buy\s+yes/i.test(btn.textContent || ''));
      if (hasBuyYes) {
        card = current;
        break;
      }
    }

    if (!card || isTradingPanel(card) || seen.has(card)) continue;
    seen.add(card);
    hits.push({ labelNode: node, card, text });
  }

  return hits;
}

function buildSummary(tracking, observed) {
  document.getElementById(SUMMARY_ID)?.remove();

  const target = findTitleElement()?.closest('div');
  if (!target || !tracking?.stats) return;

  const total = Number(tracking.stats.total ?? tracking.stats.cumulative ?? 0);
  const remainingDays = getRemainingDays(tracking.endDate);
  const remainingHours = remainingDays * 24;
  const wrapper = document.createElement('div');
  wrapper.id = SUMMARY_ID;
  wrapper.className = 'xtracker-overlay-summary';
  wrapper.innerHTML = `
    <div class="xtracker-row"><strong>XTracker</strong>：@${tracking.user?.handle || 'unknown'} ｜ 当前已发 <strong>${total}</strong> 条</div>
    <div class="xtracker-row">时间：${formatDate(tracking.startDate)} → ${formatDate(tracking.endDate)}</div>
    <div class="xtracker-row">剩余：<strong>${formatNum(remainingDays, 2)}</strong> 天 / <strong>${formatNum(remainingHours, 1)}</strong> 小时</div>
    <div class="xtracker-row">全程均速：<strong>${formatNum(observed?.perHour, 2)}</strong> /h ｜ <strong>${formatNum(observed?.perDay, 1)}</strong> /天</div>
    <div class="xtracker-row">滚动均速：4h <strong>${observed?.w4h != null ? formatNum(observed.w4h, 2) : '—'}</strong> ｜ 12h <strong>${observed?.w12h != null ? formatNum(observed.w12h, 2) : '—'}</strong> ｜ 24h <strong>${observed?.w24h != null ? formatNum(observed.w24h, 2) : '—'}</strong> 条/小时</div>
  `;

  target.parentElement?.insertBefore(wrapper, target.nextSibling);
}

function clearBadges() {
  document.querySelectorAll(`.${BADGE_CLASS}`).forEach((node) => node.remove());
}

function bestVelocity(observed) {
  // prefer the shortest reliable window; fall back to full-history
  if (observed?.w4h != null && observed.w4h >= 0) return observed.w4h;
  if (observed?.w12h != null && observed.w12h >= 0) return observed.w12h;
  if (observed?.w24h != null && observed.w24h >= 0) return observed.w24h;
  return observed?.perHour ?? null;
}

function buildBadgeText(range, total, remainingHours, observed) {
  if (remainingHours <= 0) {
    if (total >= range.lower && (range.upper === Infinity || total <= range.upper)) {
      return { cls: 'hit', text: '已收盘，最终落在该区间' };
    }
    return { cls: 'dead', text: '已收盘，最终不在该区间' };
  }

  if (Number.isFinite(range.upper) && total > range.upper) {
    return { cls: 'dead', text: `已超上限 ${range.upper}` };
  }

  const rates = estimateRates(total, remainingHours, range);
  if (!rates) return { cls: 'low', text: '无法计算' };

  if (total >= range.lower && (range.upper === Infinity || total <= range.upper)) {
    if (range.upper === Infinity) {
      return { cls: 'hit', text: '当前就在该区间' };
    }

    const vel = bestVelocity(observed);
    const upperEta = vel > 0 ? (range.upper - total) / vel : Infinity;
    return {
      cls: 'hit',
      text: `区间内｜上限速率 ≤ ${formatNum(rates.perHourMax, 2)}/h ｜ 触顶约 ${formatDurationHours(upperEta)}`
    };
  }

  const vel = bestVelocity(observed);
  const lowerEta = vel > 0 ? (range.lower - total) / vel : Infinity;

  if (range.upper === Infinity) {
    return {
      cls: vel != null && vel >= rates.perHourMin ? 'watch' : 'low',
      text: `至少 ${formatNum(rates.perHourMin, 2)}/h ｜ ${formatNum(rates.perDayMin, 1)}/天 ｜ 触达约 ${formatDurationHours(lowerEta)}`
    };
  }

  const inside = vel != null && vel >= rates.perHourMin && vel <= rates.perHourMax;
  const nearUpper = vel != null && vel > rates.perHourMax;
  return {
    cls: inside ? 'watch' : nearUpper ? 'dead' : 'low',
    text: `${formatNum(rates.perHourMin, 2)}~${formatNum(rates.perHourMax, 2)}/h ｜ ${formatNum(rates.perDayMin, 1)}~${formatNum(rates.perDayMax, 1)}/天 ｜ 下限约 ${formatDurationHours(lowerEta)}`
  };
}

function renderBadges(tracking, observed) {
  if (!tracking?.stats) return;
  clearBadges();

  const total = Number(tracking.stats.total ?? tracking.stats.cumulative ?? 0);
  const remainingHours = getRemainingHours(tracking.endDate);
  const outcomes = findOutcomeNodes();

  for (const { labelNode, text } of outcomes) {
    const range = parseRange(text);
    if (!range) continue;

    const desc = buildBadgeText(range, total, remainingHours, observed);
    const badge = document.createElement('span');
    badge.className = `${BADGE_CLASS} ${BADGE_CLASS}--${desc.cls}`;
    badge.textContent = desc.text;
    labelNode.appendChild(badge);
  }
}

function showNotSupported(message) {
  clearBadges();
  document.getElementById(SUMMARY_ID)?.remove();
  const target = findTitleElement()?.closest('div');
  if (!target) return;
  const wrapper = document.createElement('div');
  wrapper.id = SUMMARY_ID;
  wrapper.className = 'xtracker-overlay-summary';
  wrapper.textContent = message;
  target.parentElement?.insertBefore(wrapper, target.nextSibling);
}

async function render() {
  const title = getCurrentTitle();
  const key = `${location.pathname}::${title}`;
  if (!title || key === lastRenderKey) return;

  try {
    const tracking = await findTrackingForCurrentMarket();
    if (!tracking?.stats) {
      showNotSupported('没在 xtracker 上匹配到这个市场，或者这个页面不是 tweet count 这类市场。');
      lastRenderKey = key;
      return;
    }

    const observed = inferObservedVelocity(tracking);
    buildSummary(tracking, observed);
    renderBadges(tracking, observed);
    lastRenderKey = key;
  } catch (error) {
    console.error('[xtracker-overlay]', error);
    showNotSupported(`XTracker 数据读取失败：${error.message}`);
    lastRenderKey = key;
  }
}

const observer = new MutationObserver(() => {
  window.clearTimeout(observer._timer);
  observer._timer = window.setTimeout(() => {
    lastRenderKey = null;
    render();
  }, 600);
});

observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('popstate', () => {
  lastRenderKey = null;
  setTimeout(render, 300);
});
window.addEventListener('load', () => {
  lastRenderKey = null;
  setTimeout(render, 800);
});
setTimeout(render, 1200);
