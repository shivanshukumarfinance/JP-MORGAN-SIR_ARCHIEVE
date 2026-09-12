/* ============================================================
   THE MORGAN ARCHIVE — script.js
   Independent educational project. Not affiliated with
   JPMorgan Chase & Co.
   ============================================================ */

'use strict';

/* ============================================================
   1. APP STATE & STORAGE
   ============================================================ */

const STORAGE_KEY = 'morganArchive.v1';

// Safe localStorage wrapper — the app must still work if storage is unavailable
const Store = (() => {
  let available = true;
  try {
    const t = '__test__';
    window.localStorage.setItem(t, t);
    window.localStorage.removeItem(t);
  } catch (e) {
    available = false;
  }
  const memory = {};
  return {
    available,
    get(key) {
      try {
        if (!available) return memory[key] ?? null;
        return window.localStorage.getItem(key);
      } catch { return memory[key] ?? null; }
    },
    set(key, val) {
      try {
        if (!available) { memory[key] = val; return true; }
        window.localStorage.setItem(key, val);
        return true;
      } catch { memory[key] = val; return false; }
    },
    remove(key) {
      try {
        if (!available) { delete memory[key]; return; }
        window.localStorage.removeItem(key);
      } catch {}
    }
  };
})();

// Default state shape
function defaultState() {
  return {
    completedLessons: {},   // { lessonId: true }
    completedDays: {},      // { dayNumber: true }
    completedDeals: {},     // { dealId: true }
    visitedSections: {},    // { sectionId: true }
    xp: 0,
    quizBest: 0,
    quizHistory: [],
    streak: { current: 0, longest: 0, lastDate: null },
    currentDay: 1,
    settings: { dark: true, sound: false, anim: true },
    mastery: {
      historical: 0, financial: 0, character: 0,
      power: 0, deals: 0, modern: 0, critical: 0
    }
  };
}

// Global app state
let state = loadState();

function loadState() {
  const raw = Store.get(STORAGE_KEY);
  if (!raw) return defaultState();
  try {
    const parsed = JSON.parse(raw);
    // Merge with defaults to tolerate future schema changes
    return Object.assign(defaultState(), parsed);
  } catch {
    return defaultState();
  }
}

function saveState() {
  Store.set(STORAGE_KEY, JSON.stringify(state));
}

function resetState() {
  state = defaultState();
  saveState();
}

/* ============================================================
   2. UTILITIES
   ============================================================ */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== false && v != null) {
      node.setAttribute(k, v);
    }
  }
  children.flat().forEach(c => {
    if (c == null || c === false) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function daysBetween(a, b) {
  const ms = new Date(b) - new Date(a);
  return Math.round(ms / 86400000);
}

/* ============================================================
   3. TOASTS & MODALS
   ============================================================ */

const Toast = (() => {
  const host = $('#toasts');
  return {
    show(title, message, timeout = 3200) {
      if (!host) return;
      const t = el('div', { class: 'toast' },
        el('strong', {}, title),
        el('span', {}, message)
      );
      host.appendChild(t);
      setTimeout(() => {
        t.classList.add('hide');
        setTimeout(() => t.remove(), 320);
      }, timeout);
    }
  };
})();

const Modal = {
  open(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.hidden = false;
    document.body.style.overflow = 'hidden';
    const focusTarget = m.querySelector('input,button');
    if (focusTarget) setTimeout(() => focusTarget.focus(), 50);
  },
  close(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.hidden = true;
    document.body.style.overflow = '';
  },
  closeAll() {
    $$('.modal').forEach(m => { m.hidden = true; });
    document.body.style.overflow = '';
  }
};

// Wire up close buttons
document.addEventListener('click', e => {
  if (e.target.matches('[data-close]')) {
    const m = e.target.closest('.modal');
    if (m) Modal.close(m.id);
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') Modal.closeAll();
});

/* ============================================================
   4. XP, LEVELS, STREAK
   ============================================================ */

const LEVELS = [
  { xp: 0,    name: 'Level 1 — Visitor' },
  { xp: 250,  name: 'Level 2 — Reader' },
  { xp: 500,  name: 'Level 3 — Student' },
  { xp: 1000, name: 'Level 4 — Analyst' },
  { xp: 2000, name: 'Level 5 — Banker' },
  { xp: 3500, name: 'Level 6 — Deal Maker' },
  { xp: 6000, name: 'Level 7 — Morgan Scholar' }
];

function currentLevel() {
  let lvl = LEVELS[0];
  for (const l of LEVELS) if (state.xp >= l.xp) lvl = l;
  return lvl;
}

function addXP(amount, reason) {
  state.xp = (state.xp || 0) + amount;
  saveState();
  updateXPUI();
  Toast.show(`+${amount} XP`, reason || 'Progress recorded');
}

function updateXPUI() {
  const lvl = currentLevel();
  $('#statXP') && ($('#statXP').textContent = state.xp);
  $('#statLevel') && ($('#statLevel').textContent = lvl.name.split(' — ')[0]);
  $('#sidebarXP') && ($('#sidebarXP').textContent = state.xp);
}

function recordVisit() {
  const today = todayKey();
  const s = state.streak || { current:0, longest:0, lastDate:null };
  if (s.lastDate === today) return;
  if (!s.lastDate) s.current = 1;
  else {
    const diff = daysBetween(s.lastDate, today);
    if (diff === 1) s.current += 1;
    else if (diff > 1) s.current = 1;
  }
  s.lastDate = today;
  s.longest = Math.max(s.longest || 0, s.current);
  state.streak = s;
  saveState();
  updateStreakUI();
}

function updateStreakUI() {
  const s = state.streak || {};
  $('#sidebarStreak') && ($('#sidebarStreak').textContent = s.current || 0);
}

/* ============================================================
   5. NAVIGATION
   ============================================================ */

const NAV_ROUTES = [
  'dashboard','life','personal','character','power','academy','empire',
  'deals','panic','decisions','controversies','mind','academy30',
  'modern','career','glossary','quiz','mastery','morganai','sources'
];

function navigate(route) {
  if (!NAV_ROUTES.includes(route)) route = 'dashboard';
  $$('.section').forEach(s => s.classList.toggle('active', s.dataset.section === route));
  $$('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.route === route));
  state.visitedSections = state.visitedSections || {};
  state.visitedSections[route] = true;
  saveState();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  closeSidebar();
  // Lazy render per section
  renderSection(route);
}

function renderSection(route) {
  switch (route) {
    case 'dashboard':   renderDashboard(); break;
    case 'life':        renderLife(); break;
    case 'personal':    renderPersonal(); break;
    case 'character':   renderCharacter(); break;
    case 'power':       renderPowerMap(); break;
    case 'academy':     renderAcademy(); break;
    case 'empire':      renderEmpire(); break;
    case 'deals':       renderDeals(); break;
    case 'panic':       renderPanic(); break;
    case 'decisions':   renderDecision('decision'); break;
    case 'controversies': renderControversies(); break;
    case 'mind':        renderDecision('mind'); break;
    case 'academy30':   renderAcademy30(); break;
    case 'modern':      renderModern(); break;
    case 'career':      renderCareer(); break;
    case 'glossary':    renderGlossary(); break;
    case 'quiz':        renderQuizCenter(); break;
    case 'mastery':     renderMastery(); break;
    case 'morganai':    renderAI(); break;
    case 'sources':     /* static */ break;
  }
}

// Sidebar toggle (mobile)
function openSidebar() {
  $('#sidebar')?.classList.add('open');
  $('#sidebarOverlay')?.classList.add('show');
  $('#menuToggle')?.classList.add('open');
  $('#menuToggle')?.setAttribute('aria-expanded','true');
}
function closeSidebar() {
  $('#sidebar')?.classList.remove('open');
  $('#sidebarOverlay')?.classList.remove('show');
  $('#menuToggle')?.classList.remove('open');
  $('#menuToggle')?.setAttribute('aria-expanded','false');
}

/* ============================================================
   6. HEADER & GLOBAL EVENTS
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  initLoader();
  initIcons();
  initTheme();
  initNavigation();
  initHeader();
  initScrollTop();
  initSettings();
  initSearchModal();
  recordVisit();
  updateXPUI();
  updateStreakUI();
  updateProgressUI();
  renderDashboard();
  // Small welcome toast on first visit
  if (!state.visitedSections || !state.visitedSections.dashboard) {
    setTimeout(() => Toast.show('Welcome to the Archive','Begin the 30-day journey to earn your first XP.'), 900);
  }
});

function initLoader() {
  const loader = $('#loader');
  if (!loader) return;
  setTimeout(() => loader.classList.add('hidden'), 550);
}

function initIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function initTheme() {
  const dark = state.settings?.dark !== false;
  document.body.classList.toggle('light', !dark);
  if (!state.settings?.anim) document.body.classList.add('no-anim');
}

function initNavigation() {
  // Click on nav links
  $$('.nav-link').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      navigate(a.dataset.route);
    });
  });
  // Pillars on the dashboard
  document.addEventListener('click', e => {
    const p = e.target.closest('.pillar[data-route]');
    if (p) navigate(p.dataset.route);
  });
  // Hamburger
  $('#menuToggle')?.addEventListener('click', () => {
    const s = $('#sidebar');
    if (s?.classList.contains('open')) closeSidebar(); else openSidebar();
  });
  $('#sidebarOverlay')?.addEventListener('click', closeSidebar);
  // Default route
  navigate('dashboard');
}

function initHeader() {
  $('#searchOpen')?.addEventListener('click', () => Modal.open('searchModal'));
  $('#settingsOpen')?.addEventListener('click', () => Modal.open('settingsModal'));
}

function initScrollTop() {
  const btn = $('#scrollTop');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('show', window.scrollY > 400);
  }, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

function initSettings() {
  const setDark = $('#setDark');
  const setSound = $('#setSound');
  const setAnim = $('#setAnim');
  if (!setDark) return;
  state.settings = state.settings || { dark: true, sound: false, anim: true };
  setDark.checked = state.settings.dark !== false;
  setSound.checked = !!state.settings.sound;
  setAnim.checked = state.settings.anim !== false;

  setDark.addEventListener('change', () => {
    state.settings.dark = setDark.checked;
    document.body.classList.toggle('light', !setDark.checked);
    saveState();
  });
  setSound.addEventListener('change', () => {
    state.settings.sound = setSound.checked; saveState();
  });
  setAnim.addEventListener('change', () => {
    state.settings.anim = setAnim.checked;
    document.body.classList.toggle('no-anim', !setAnim.checked);
    saveState();
  });
  $('#resetProgress')?.addEventListener('click', () => {
    if (confirm('Reset ALL progress? This cannot be undone.')) {
      resetState();
      initTheme();
      updateXPUI(); updateStreakUI(); updateProgressUI(); renderDashboard();
      Modal.close('settingsModal');
      Toast.show('Progress reset','Fresh start. Begin again when ready.');
    }
  });
}

function initSearchModal() {
  const inp = $('#globalSearch');
  if (!inp) return;
  let timer = null;
  inp.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => runSearch(inp.value.trim()), 120);
  });
}

/* ============================================================
   7. PROGRESS
   ============================================================ */

function overallProgressPct() {
  const total = 20 /*academy*/ + 30 /*days*/ + 5 /*deals*/;
  const done = Object.keys(state.completedLessons).length
             + Object.keys(state.completedDays).length
             + Object.keys(state.completedDeals).length;
  return Math.min(100, Math.round((done / total) * 100));
}

function updateProgressUI() {
  const pct = overallProgressPct();
  $('#statProgress') && ($('#statProgress').textContent = pct + '%');
  $('#statProgressBar') && ($('#statProgressBar').style.width = pct + '%');
  $('#sidebarProgress') && ($('#sidebarProgress').textContent = pct + '%');
  $('#sidebarProgressBar') && ($('#sidebarProgressBar').style.width = pct + '%');
  $('#statQuiz') && ($('#statQuiz').textContent = state.quizBest ? state.quizBest + '%' : '—');
}

/* ============================================================
   8. DATA — Insights, Facts, Life Timeline, Character, etc.
   ============================================================ */

const INSIGHTS = [
  'Morgan was known for his piercing stare — the "Morgan stare" — as described by contemporary observers.',
  'By the early 20th century, Morgan’s firm was central to railroad and industrial finance in the United States.',
  'During the Panic of 1907, Morgan helped coordinate private bankers in an attempt to stabilize markets.',
  'Morgan was a serious art collector. Parts of his collection later formed the core of the Morgan Library & Museum.',
  'He was an avid yachtsman; his yacht Corsair was famous in its day.',
  'Morgan’s career spanned the transformation of the U.S. from an agrarian to an industrial economy.',
  'Contemporary press often portrayed Morgan as either a stabilizing force or an alarming concentration of power.',
  'Morgan was born in Hartford, Connecticut, in 1837.',
  'He studied in Europe as a young man, and spoke French and German well.',
  'His father, Junius Spencer Morgan, was also a banker — Pierpont followed in his footsteps.'
];

const FACTS = [
  'J. Pierpont Morgan helped arrange financing for the United States government during the Panic of 1895, working with a syndicate to supply gold.',
  'U.S. Steel, organized in 1901 with Morgan’s involvement, was one of the largest industrial corporations of its era.',
  'General Electric traces part of its heritage to the merger of Edison General Electric and Thomson-Houston — a transaction associated with Morgan’s banking network.',
  'The Morgan Library & Museum in New York preserves a substantial portion of Pierpont Morgan’s personal library.',
  'The Panic of 1907 is widely cited as a catalyst for the creation of the Federal Reserve System in 1913.',
  'Morgan was married twice: to Amelia Sturges (who died young) and later to Frances Louisa Tracy.',
  'A Congressional investigation — the Pujo Committee — examined the concentration of financial power in the 1910s.',
  'Morgan died in Rome in 1913 while traveling abroad.'
];

const LIFE_EVENTS = [
  { year:'1837', title:'Birth in Hartford', body:'John Pierpont Morgan was born in Hartford, Connecticut, on April 17, 1837, into a family already connected to commerce and finance.', why:'His birth placed him inside an established commercial network — an advantage that shaped his later career.', lesson:'Starting context — family, geography, and connections — can meaningfully shape a person’s opportunities. This is sometimes called social capital.' },
  { year:'1840s', title:'Family & Childhood', body:'His father, Junius Spencer Morgan, was a merchant who became a banker. His mother, Juliet Pierpont, came from a prominent New England family.', why:'The Morgan household combined commerce and culture, exposing Pierpont from an early age to both.', lesson:'Cultural capital — exposure to books, languages, and business conversation — is a real economic asset.' },
  { year:'1850s', title:'Education & Europe', body:'He attended schools in the United States and studied in Europe, developing fluency in French and German and familiarity with European banking practices.', why:'European study gave him cross-border fluency unusual in American finance at the time.', lesson:'International experience often unlocks opportunities unavailable in a purely domestic career.' },
  { year:'1857', title:'Early Career', body:'He entered banking, first in New York and later in London — where his father’s firm, Peabody, Morgan & Co., was active.', why:'This apprenticeship across two financial capitals gave him an unusual dual perspective.', lesson:'Apprenticeships across jurisdictions build rare capabilities.' },
  { year:'1861–1865', title:'American Civil War Era', body:'During the Civil War, Morgan was involved in financing and gold transactions. Historical accounts vary on some details; scholarship continues to examine his activities in this period.', why:'Wartime finance reshaped American capital markets.', lesson:'Wars are periods of intense financial innovation — and controversy.' },
  { year:'1864', title:'First Marriage — Amelia Sturges', body:'Morgan married Amelia “Memie” Sturges in 1861; she died of tuberculosis in 1862. He later married Frances Louisa Tracy in 1865.', why:'His first marriage was brief and tragic. He remarried and raised a family.', lesson:'Personal life and career are often intertwined; sources should be handled with care and empathy.' },
  { year:'1871', title:'Drexel, Morgan & Co.', body:'Morgan partnered with Anthony Drexel to form Drexel, Morgan & Co. in New York, strengthening ties between American and European capital.', why:'The firm became a bridge between European investors and American enterprise.', lesson:'Partnerships expand reach; a well-chosen partner can double network access.' },
  { year:'1870s–1880s', title:'Railroad Financing', body:'Morgan helped reorganize a number of American railroads, replacing chaotic competition with coordinated structures — a process sometimes called "Morganization."', why:'Railroads were the largest enterprises of the era, and financing them required enormous capital.', lesson:'When industries are fragmented and unstable, financiers who can impose order capture enormous value.' },
  { year:'1890s', title:'Government Finance', body:'Morgan’s firm helped arrange gold financing for the U.S. Treasury during a period of currency stress in 1895.', why:'Private bankers effectively performed some functions later handled by central banks.', lesson:'When public institutions lack capacity, private actors sometimes step in — raising questions about accountability.' },
  { year:'1892', title:'General Electric', body:'A merger involving Edison General Electric and Thomson-Houston — associated with Morgan’s network — helped create General Electric.', why:'Consolidation created one of the era’s most consequential industrial firms.', lesson:'Mergers can create dominant firms by combining technology, capital, and distribution.' },
  { year:'1901', title:'U.S. Steel', body:'Morgan helped organize U.S. Steel through the combination of Carnegie Steel and other producers — a transaction of historic scale.', why:'It symbolized the era of trusts and consolidation.', lesson:'Capital markets can concentrate whole industries into a small number of firms.' },
  { year:'1907', title:'The Panic of 1907', body:'A financial panic struck in October 1907. Morgan helped coordinate bankers and pool liquidity to arrest the crisis.', why:'The episode exposed structural weaknesses in U.S. banking and prompted later reform.', lesson:'Financial systems depend on confidence — and on someone willing to act when confidence fails.' },
  { year:'1910s', title:'Pujo Committee', body:'A Congressional committee (the Pujo Committee) investigated the concentration of financial power, scrutinizing Morgan and other financiers.', why:'Public concern over the "Money Trust" grew during this era.', lesson:'With concentrated financial power comes political scrutiny.' },
  { year:'1913', title:'Death in Rome', body:'J. Pierpont Morgan died in Rome on March 31, 1913. He was 75.', why:'His death marked the end of a defining era in American finance.', lesson:'Even the most powerful individuals are mortal; institutions often outlive founders.' },
  { year:'1913–today', title:'Legacy', body:'The institutions that carried his name evolved through mergers and restructurings into parts of what became JPMorgan Chase & Co. This project treats that evolution carefully and factually.', why:'Understanding the past helps contextualize modern finance.', lesson:'Institutions are layered over decades; modern firms have deep historical roots.' }
];

const CHARACTER_TRAITS = [
  { name:'CONFIDENCE', level:88, evidence:'Contemporary descriptions consistently portray a man of imposing physical presence and unhesitating command in meetings.', interpretation:'Some historians interpret this as self-assurance grounded in long experience; others as a deliberate negotiating posture.', limits:'Private thoughts and intentions cannot be reliably reconstructed from external observation.' },
  { name:'DISCIPLINE', level:82, evidence:'Morgan reportedly kept demanding working hours, expected punctuality, and tolerated little idleness from associates.', interpretation:'Discipline is often cited as central to his professional reputation.', limits:'Anecdotes should be weighed against broader documentary evidence.' },
  { name:'REPUTATION', level:95, evidence:'By the 1890s, his word carried unusual weight in U.S. and European markets — a theme noted in contemporary press and later historical accounts.', interpretation:'Reputation functioned as a form of credit: Morgan’s personal guarantee was often enough to move capital.', limits:'Reputation is a perception; it does not guarantee accuracy.' },
  { name:'NEGOTIATION', level:85, evidence:'Documented negotiations — with railroad executives, industrialists, and government officials — show willingness to bargain hard and walk away.', interpretation:'He is often described as patient and unyielding when position warranted.', limits:'Outcomes are visible; internal reasoning is not.' },
  { name:'RISK', level:70, evidence:'His career was marked by enormous bets — the U.S. Steel deal, railroad restructurings, and crisis intervention.', interpretation:'Some historians argue he was comfortable with concentrated bets when his network provided information advantages.', limits:'Risk-taking is partly contextual; hindsight exaggerates clarity.' },
  { name:'CONTROL', level:90, evidence:'He frequently placed trusted associates on boards and shaped governance of firms he financed.', interpretation:'Historians debate whether this was stewardship or domination.', limits:'Framing varies widely across authors.' },
  { name:'LEADERSHIP', level:88, evidence:'During crises he convened bankers and gave instructions; participants often described following his coordination.', interpretation:'Leadership emerged from combination of capital, network, and reputation.', limits:'Accounts tend to come from those in his orbit.' },
  { name:'RELATIONSHIPS', level:75, evidence:'He maintained long relationships with financiers, industrialists, and political figures across both sides of the Atlantic.', interpretation:'Relationships were career assets as much as personal friendships.', limits:'Interior emotional life is not reliably documented.' },
  { name:'PRIVACY', level:80, evidence:'He largely avoided interviews and rarely explained his decisions publicly.', interpretation:'Contemporary observers noted his reserve.', limits:'Silence is not necessarily secrecy.' },
  { name:'BUSINESS JUDGMENT', level:90, evidence:'Contemporary sources describe his instinct for identifying when an industry needed consolidation or reform.', interpretation:'Judgment is often described as accumulated pattern recognition rather than raw intuition.', limits:'Success stories are visible; failures may be less documented.' }
];

const POWER_NODES = [
  { id:'banking',     label:'BANKING NETWORK',      angle:0,    title:'Banking Network',      body:'Drexel, Morgan & Co. (later J.P. Morgan & Co.) connected American borrowers with European capital. Partnerships with firms such as Morgan Grenfell in London extended the network across the Atlantic.' },
  { id:'investors',   label:'INVESTORS',            angle:45,   title:'Investors',             body:'European and American investors entrusted funds to Morgan-led syndicates, relying on his reputation to protect their capital.' },
  { id:'railroads',   label:'RAILROADS',            angle:90,   title:'Railroads',             body:'Morgan financed and reorganized railroads, consolidating fragmented lines and stabilizing their capital structures.' },
  { id:'industry',    label:'INDUSTRIAL COMPANIES', angle:135,  title:'Industrial Companies',  body:'Steel, electrical, and other industries relied on Morgan’s capital and coordination for mergers and growth financing.' },
  { id:'europe',      label:'EUROPEAN CAPITAL',     angle:180,  title:'European Capital',      body:'European capital markets, especially London, were major sources of funding for American enterprises in this period.' },
  { id:'gov',         label:'GOVERNMENT',           angle:225,  title:'Government Relationships', body:'Morgan advised and assisted the U.S. Treasury during periods of currency stress. This role is documented but remains debated.' },
  { id:'markets',     label:'FINANCIAL MARKETS',    angle:270,  title:'Financial Markets',     body:'His firm was central in underwriting and distributing securities to the public.' },
  { id:'leaders',     label:'BUSINESS LEADERS',     angle:315,  title:'Business Leaders',      body:'Industrialists such as Andrew Carnegie and Thomas Edison interacted with Morgan and his network.' }
];

const ACADEMY_LESSONS = [
  { id:'a01', title:'What Is Banking?',              beginner:'A bank is a business that takes in money (deposits), lends it out (loans), and charges interest — earning a spread between what it pays depositors and what it collects from borrowers.', deeper:'Banks also facilitate payments, provide liquidity, and (as investment banks) arrange financing in capital markets.', morgan:'Morgan’s firm was primarily an investment bank: it helped companies and governments raise money from investors.', modern:'Today, banks serve both individuals and corporations, often through separate divisions.', terms:['Deposit','Loan','Interest'] },
  { id:'a02', title:'Commercial Banking',            beginner:'Commercial banking serves businesses and individuals with deposits, loans, and payments.', deeper:'Commercial banks earn a net interest margin and often charge fees for services.', morgan:'Morgan’s firm was not a typical commercial bank; it was more focused on wholesale finance.', modern:'JPMorgan Chase operates both commercial banking and investment banking businesses.', terms:['Net interest margin','Wholesale finance'] },
  { id:'a03', title:'Investment Banking',            beginner:'Investment banking helps companies and governments raise money and advises on major transactions like mergers.', deeper:'Core areas: advisory (M&A), underwriting (raising capital), and financing solutions.', morgan:'Morgan essentially helped create the modern investment bank by institutionalizing these activities.', modern:'Today, investment banks advise on M&A and help companies issue stocks and bonds.', terms:['Advisory','Underwriting','M&A'] },
  { id:'a04', title:'Capital',                        beginner:'Capital is money and other resources used to fund a business.', deeper:'Capital can be equity (ownership) or debt (borrowed).', morgan:'Morgan organized capital from investors across two continents.', modern:'Companies raise capital through public markets or private investors.', terms:['Equity','Debt','Capital'] },
  { id:'a05', title:'Stocks',                         beginner:'A stock is a share of ownership in a company.', deeper:'Stockholders own a portion and may receive dividends and voting rights.', morgan:'Morgan underwrote and distributed stocks of railroads and industrial firms.', modern:'Public companies list shares on exchanges like NYSE or Nasdaq.', terms:['Share','Dividend'] },
  { id:'a06', title:'Bonds',                          beginner:'A bond is a loan made to a company or government, which pays interest over time.', deeper:'Bonds have face value, coupon, maturity, and yield.', morgan:'Morgan was a master of bond issuance, especially for railroads.', modern:'Bond markets today are enormous and global.', terms:['Coupon','Face value','Yield'] },
  { id:'a07', title:'Debt',                           beginner:'Debt is money borrowed that must be repaid, usually with interest.', deeper:'Debt sits higher than equity in the capital structure — paid before shareholders.', morgan:'Morgan restructured railroads heavily — part of that work involved renegotiating debt.', modern:'Companies use debt strategically to fund growth.', terms:['Capital structure','Leverage'] },
  { id:'a08', title:'Equity',                         beginner:'Equity means ownership. Equity holders share in profits and risk.', deeper:'Equity is residual — paid after creditors.', morgan:'Morgan placed equity investors in deals alongside debt holders.', modern:'IPOs and follow-on offerings raise equity capital.', terms:['Residual claim','Shareholder'] },
  { id:'a09', title:'Underwriting',                   beginner:'Underwriting means an investment bank helps a company raise money from investors and takes responsibility for arranging the offering.', deeper:'The underwriter may commit to purchase securities and resell them, bearing market risk.', morgan:'Morgan-led syndicates underwrote issuances on a large scale.', modern:'Large IPOs and bond deals still use underwriting syndicates.', terms:['Underwriter','Offering'] },
  { id:'a10', title:'Syndicates',                     beginner:'A syndicate is a group of banks that share a large deal to spread risk.', deeper:'Syndicates pool resources and expertise for large offerings.', morgan:'Morgan organized syndicates to raise capital that no single firm could supply.', modern:'Syndicated loans and bond issuances remain common.', terms:['Syndicate','Risk sharing'] },
  { id:'a11', title:'M&A (Mergers & Acquisitions)',  beginner:'M&A is when one company combines with or buys another.', deeper:'Advisors value both sides, negotiate terms, and help close the deal.', morgan:'Morgan advised or orchestrated many historic mergers.', modern:'Investment banks earn advisory fees for M&A work.', terms:['Merger','Acquisition','Advisory fee'] },
  { id:'a12', title:'IPOs (Initial Public Offerings)', beginner:'An IPO is the first sale of a company’s stock to the public.', deeper:'Underwriters price shares and market the offering to investors.', morgan:'Many of Morgan’s railroad and industrial financings were effectively public offerings of securities.', modern:'IPOs remain a milestone in a company’s life.', terms:['IPO','Prospectus'] },
  { id:'a13', title:'Capital Markets',                beginner:'Capital markets are where long-term money is raised and traded — stocks, bonds, and more.', deeper:'Split into primary (issuance) and secondary (trading) markets.', morgan:'Morgan worked at the center of the primary market.', modern:'Today’s capital markets are global and electronic.', terms:['Primary market','Secondary market'] },
  { id:'a14', title:'Corporate Restructuring',       beginner:'Restructuring means reorganizing a company’s finances or operations to make it healthier.', deeper:'Can involve debt renegotiation, divestitures, or new capital.', morgan:'Morgan’s railroad reorganizations were an early form of restructuring.', modern:'Distressed restructuring is a specialized banking practice.', terms:['Restructuring','Distressed'] },
  { id:'a15', title:'Credit',                         beginner:'Credit is the ability to borrow, and the trust that the borrower will repay.', deeper:'Credit quality is assessed via ratings, history, and financials.', morgan:'His reputation often substituted for formal credit ratings.', modern:'Credit ratings agencies such as Moody’s, S&P, and Fitch emerged partly from this need.', terms:['Creditworthiness','Rating'] },
  { id:'a16', title:'Liquidity',                      beginner:'Liquidity is how quickly an asset can be turned into cash without losing value.', deeper:'Markets rely on liquidity; its sudden absence can trigger crises.', morgan:'The Panic of 1907 was largely a liquidity crisis.', modern:'Central banks manage liquidity today.', terms:['Liquidity','Cash equivalent'] },
  { id:'a17', title:'Leverage',                       beginner:'Leverage means using borrowed money to amplify returns — and risk.', deeper:'High leverage magnifies both gains and losses.', morgan:'Railroad expansion relied heavily on debt.', modern:'Leverage remains central to modern finance.', terms:['Leverage','Debt-to-equity'] },
  { id:'a18', title:'Interest Rates',                 beginner:'Interest rates are the cost of borrowing money.', deeper:'Central banks use rates to steer economies.', morgan:'Rates shaped the financing environment in which he operated.', modern:'The Federal Reserve sets U.S. policy rates.', terms:['Rate','Policy rate'] },
  { id:'a19', title:'Risk',                           beginner:'Risk is the possibility that outcomes differ from expectations.', deeper:'Financial firms manage credit, market, liquidity, and operational risk.', morgan:'Morgan’s deal-making was heavily risk-managed via syndicates and information.', modern:'Risk management is a core banking function.', terms:['Risk management','Exposure'] },
  { id:'a20', title:'Financial Crises',               beginner:'A financial crisis is a sharp disruption to the financial system.', deeper:'Crises often involve loss of confidence, liquidity shortages, and contagion.', morgan:'Morgan lived through several, and intervened in 1907.', modern:'Regulation since the Great Depression and 2008 aims to reduce crisis risk.', terms:['Panic','Contagion','Systemic risk'] }
];

const DAYS_30 = [
  { day:1,  title:'Who Was J.P. Morgan?',            lesson:'An introduction to the man and the era.', story:'By the 1890s, J. Pierpont Morgan was among the most consequential financiers in the world. His career spanned the transformation of the United States from an agrarian republic into an industrial power.', concept:'Investment banking — helping companies and governments raise capital.', terms:['Investment banking','Capital'], quiz:[
    {q:'Who was J. Pierpont Morgan?', a:['A U.S. President','A financier who helped shape American banking','A famous novelist','A European monarch'], c:1, e:'Morgan was a financier central to American banking and industry.'},
    {q:'In which country was Morgan born?', a:['United Kingdom','United States','France','Germany'], c:1, e:'He was born in Hartford, Connecticut, in 1837.'},
    {q:'What is investment banking?', a:['Taking deposits only','Helping entities raise capital and advising on deals','Selling insurance','Issuing passports'], c:1, e:'Investment banks help raise capital and advise on transactions.'}
  ]},
  { day:2,  title:'Family & Childhood',              lesson:'Origins and environment.', story:'Morgan was born into a family connected to commerce. His father, Junius Spencer Morgan, was a banker.', concept:'Social capital — the value of networks and connections.', terms:['Social capital','Network'], quiz:[
    {q:'Who was Morgan’s father?', a:['Andrew Carnegie','Junius Spencer Morgan','John D. Rockefeller','Theodore Roosevelt'], c:1, e:'Junius Spencer Morgan was his father, also a banker.'},
    {q:'What is social capital?', a:['Money in a savings account','The value of networks and relationships','Government bonds','A type of stock'], c:1, e:'Social capital refers to the value of networks and connections.'},
    {q:'Where was Morgan born?', a:['Boston','New York','Hartford','Philadelphia'], c:2, e:'Hartford, Connecticut.'}
  ]},
  { day:3,  title:'Education',                        lesson:'Schooling and European study.', story:'Morgan studied in the U.S. and Europe, developing fluency in French and German — rare assets in American finance at the time.', concept:'Human capital — skills and knowledge you accumulate.', terms:['Human capital','Fluency'], quiz:[
    {q:'Why was European study valuable for Morgan?', a:['It was required by law','It gave him cross-border fluency','It earned him a title','It was free'], c:1, e:'European study gave him cross-border fluency useful in finance.'},
    {q:'What is human capital?', a:['Buildings and land','Skills and knowledge','Government debt','Foreign reserves'], c:1, e:'Human capital is the value of skills and knowledge.'},
    {q:'Which languages did Morgan reportedly speak well?', a:['Spanish and Italian','French and German','Russian and Polish','Latin and Greek'], c:1, e:'French and German.'}
  ]},
  { day:4,  title:'Early Career',                     lesson:'Apprenticeship in finance.', story:'Morgan entered banking, first in New York, then in London — training with firms tied to his father’s network.', concept:'Apprenticeship — learning by doing inside a firm.', terms:['Apprenticeship','Firm'], quiz:[
    {q:'Where did Morgan gain early banking experience?', a:['Only New York','Only London','New York and London','Berlin and Paris'], c:2, e:'He apprenticed in both cities.'},
    {q:'What is an apprenticeship?', a:['A formal degree','Structured learning inside a firm','A tax category','A type of bond'], c:1, e:'Apprenticeship is structured on-the-job learning.'},
    {q:'What family firm was active in London?', a:['Morgan Stanley','Peabody, Morgan & Co.','Goldman Sachs','Barings'], c:1, e:'His father’s firm, Peabody, Morgan & Co., was active in London.'}
  ]},
  { day:5,  title:'Banking Foundations',              lesson:'Core concepts of banking.', story:'Banking at its core is about connecting savers with borrowers, and managing the spread between them.', concept:'Net interest margin — the difference between lending and deposit rates.', terms:['Net interest margin','Spread'], quiz:[
    {q:'What is a deposit?', a:['A loan to the bank','A loan from the bank','A stock purchase','A tax payment'], c:0, e:'Deposits are effectively loans made by customers to the bank.'},
    {q:'What is net interest margin?', a:['A kind of tax','Difference between interest earned and interest paid','Total revenue','Total assets'], c:1, e:'Net interest margin is the spread between lending and deposit rates.'},
    {q:'Investment banks primarily:', a:['Take deposits','Help raise capital','Print currency','Set interest rates'], c:1, e:'Investment banks help raise capital and advise on deals.'}
  ]},
  { day:6,  title:'Building Reputation',              lesson:'Why reputation was capital.', story:'By the 1870s, Morgan’s personal reputation was becoming a form of financial guarantee — investors trusted his firm’s judgment.', concept:'Reputation as credit — trust can substitute for collateral.', terms:['Reputation','Credit'], quiz:[
    {q:'Why did Morgan’s reputation matter?', a:['It made him famous in newspapers','It substituted for formal collateral in many deals','It earned him a government title','It was required by law'], c:1, e:'Reputation functioned as a form of credit.'},
    {q:'What is credit?', a:['The ability to borrow and the trust behind it','A physical coin','A tax credit only','A type of insurance'], c:0, e:'Credit is the ability to borrow, backed by trust.'},
    {q:'Reputation primarily helps by:', a:['Reducing marketing costs','Increasing borrowing capacity','Both of the above','Neither'], c:2, e:'Reputation reduces friction and expands financial capacity.'}
  ]},
  { day:7,  title:'European Banking',                 lesson:'Transatlantic capital flows.', story:'London was the world’s financial center in the 19th century. Morgan’s firm bridged European investors and American enterprise.', concept:'Cross-border capital — money moving between countries to seek return.', terms:['Cross-border capital','Syndicate'], quiz:[
    {q:'Which city was the major financial center in the 19th century?', a:['New York','London','Paris','Berlin'], c:1, e:'London was the dominant global financial center at the time.'},
    {q:'What is cross-border capital?', a:['Money moving between countries','Only government money','Only equity','Only debt'], c:0, e:'Cross-border capital is money moving across national borders to seek return.'},
    {q:'Why was Morgan uniquely positioned?', a:['He owned railroads','He had a European banking family background and network','He was a politician','He was a general'], c:1, e:'His family and firm connections gave him a rare transatlantic advantage.'}
  ]},
  { day:8,  title:'Railroads',                        lesson:'The largest industry of the age.', story:'Railroads were America’s biggest enterprises, requiring enormous capital and frequently collapsing into financial chaos.', concept:'Capital-intensive industry — a business requiring large upfront investment.', terms:['Capital-intensive','Fixed cost'], quiz:[
    {q:'Why were railroads important to finance?', a:['They were small and simple','They required enormous capital','They paid no interest','They were government-owned'], c:1, e:'Railroads required large amounts of capital and were financially complex.'},
    {q:'What is a capital-intensive industry?', a:['A business needing little investment','A business requiring large upfront investment','A service business','A software startup'], c:1, e:'Capital-intensive industries require large upfront investments.'},
    {q:'Railroad financing involved:', a:['Only equity','Bonds and equity','Only gold','Only government money'], c:1, e:'Railroads raised both debt (bonds) and equity.'}
  ]},
  { day:9,  title:'Corporate Finance',                lesson:'Money inside a company.', story:'Corporate finance studies how firms raise, spend, and manage money — the field Morgan worked in.', concept:'Capital structure — the mix of debt and equity used to fund a firm.', terms:['Capital structure','Cost of capital'], quiz:[
    {q:'What does corporate finance study?', a:['Only taxes','How firms raise and manage money','Only marketing','Only HR'], c:1, e:'Corporate finance studies how firms raise, spend, and manage money.'},
    {q:'What is capital structure?', a:['The building layout of a company','The mix of debt and equity funding a firm','A type of bond','A regulatory form'], c:1, e:'Capital structure is the mix of debt and equity used to fund a firm.'},
    {q:'Which is NOT a source of corporate capital?', a:['Debt','Equity','Retained earnings','Currency printing'], c:3, e:'Companies cannot print currency.'}
  ]},
  { day:10, title:'Railroad Reorganizations',        lesson:'Restructuring in practice.', story:'Morgan helped reorganize struggling railroads by renegotiating debts and consolidating competing lines.', concept:'Restructuring — reorganizing a firm’s finances to restore viability.', terms:['Restructuring','Consolidation'], quiz:[
    {q:'What did railroad reorganization typically involve?', a:['Ignoring debts','Renegotiating debts and consolidating lines','Selling only assets','Dissolving the company'], c:1, e:'Reorganizations involved debt renegotiation and consolidation.'},
    {q:'What is consolidation?', a:['Breaking a firm apart','Combining multiple firms or operations into one','Buying only stocks','Paying only dividends'], c:1, e:'Consolidation means combining into one.'},
    {q:'Morgan’s railroad work is sometimes called:', a:['Morganization','Rockefellerization','Carnegization','Federalization'], c:0, e:'The term "Morganization" refers to his railroad reorganizations.'}
  ]},
  { day:11, title:'Industrial America',              lesson:'The rise of big business.', story:'After railroads, Morgan turned to industry: steel, electricity, and other sectors were consolidating rapidly.', concept:'Economies of scale — larger firms can lower per-unit costs.', terms:['Economies of scale','Trust'], quiz:[
    {q:'What are economies of scale?', a:['Smaller firms are cheaper','Larger firms can lower per-unit costs','Only governments benefit','Only banks benefit'], c:1, e:'Larger firms can lower per-unit costs.'},
    {q:'What is a "trust" in historical U.S. business?', a:['A charitable fund','A combination of firms controlling a market','A pension fund','A savings account'], c:1, e:'Historically, a "trust" was a combination of firms controlling a market.'},
    {q:'Morgan’s consolidation efforts were concentrated in:', a:['Agriculture','Railroads and heavy industry','Retail stores','Software'], c:1, e:'Railroads and heavy industry.'}
  ]},
  { day:12, title:'General Electric',                lesson:'Merging to create an industry leader.', story:'A merger involving Edison General Electric and Thomson-Houston — associated with Morgan’s network — helped create General Electric.', concept:'Mergers & acquisitions — combining firms to create strategic value.', terms:['Merger','Acquisition','Synergy'], quiz:[
    {q:'General Electric emerged from a merger of:', a:['Two automobile firms','Edison General Electric and Thomson-Houston','Two banks','Two oil companies'], c:1, e:'Edison General Electric and Thomson-Houston were the predecessor firms.'},
    {q:'What is a merger?', a:['A lawsuit','A combination of two companies into one','A type of loan','A tax'], c:1, e:'A merger combines two companies into one.'},
    {q:'What is synergy in M&A?', a:['A tax break','Combined value greater than the sum of parts','A stock type','A bond rating'], c:1, e:'Synergy means combined value greater than the parts.'}
  ]},
  { day:13, title:'U.S. Steel',                       lesson:'The first billion-dollar corporation.', story:'U.S. Steel, organized in 1901 with Morgan’s involvement, combined Carnegie Steel and other producers — a defining deal of the era.', concept:'Industry consolidation — combining competing firms into a dominant player.', terms:['Consolidation','Trust','Billion-dollar corporation'], quiz:[
    {q:'U.S. Steel was organized in which year?', a:['1873','1898','1901','1913'], c:2, e:'U.S. Steel was organized in 1901.'},
    {q:'Which steelmaker was a key part of the U.S. Steel combination?', a:['Bethlehem Steel','Carnegie Steel','Nucor','U.S. Ironworks'], c:1, e:'Carnegie Steel was a key part.'},
    {q:'Consolidation combines:', a:['Two people','Multiple firms into one dominant player','Only bonds','Only currencies'], c:1, e:'Consolidation combines firms into one dominant player.'}
  ]},
  { day:14, title:'Capital & Investors',             lesson:'Who funds big business?', story:'Morgan raised capital from investors on both sides of the Atlantic to fund railroads and industry.', concept:'Underwriting — arranging offerings and taking on distribution risk.', terms:['Underwriting','Offering'], quiz:[
    {q:'What is underwriting?', a:['Taking a company public only','Helping raise money by arranging an offering and assuming distribution risk','Writing insurance','Signing a contract'], c:1, e:'Underwriting helps raise money and bears distribution risk.'},
    {q:'Who provided capital to Morgan’s deals?', a:['Only governments','Investors on both sides of the Atlantic','Only farmers','Only universities'], c:1, e:'Investors in the U.S. and Europe provided capital.'},
    {q:'What is an offering?', a:['A church service','A public sale of securities','A bond rating','A government grant'], c:1, e:'An offering is a public sale of securities.'}
  ]},
    { day:15, title:'Morgan’s Deal-Making',            lesson:'Strategy and coordination.', story:'Morgan’s deals relied on preparation, information, and willingness to walk away when necessary.', concept:'Negotiation leverage — strength comes from alternatives and information.', terms:['Leverage','BATNA'], quiz:[
    {q:'What gave Morgan negotiating leverage?', a:['Only physical strength','Alternatives, information, and network','Only money','Only luck'], c:1, e:'Leverage comes from alternatives, information, and network.'},
    {q:'What does BATNA mean?', a:['Best Alternative To a Negotiated Agreement','Bankers’ Association','Bond Trading Network','Basic Asset Transfer'], c:0, e:'BATNA stands for Best Alternative To a Negotiated Agreement.'},
    {q:'Walking away in negotiation can:', a:['End a career','Preserve leverage','Never help','Always hurt'], c:1, e:'Walking away can preserve leverage.'}
  ]},
  { day:16, title:'Investment Banking',              lesson:'The modern IB model.', story:'The modern investment bank performs advisory, underwriting, and financing roles — a model partly shaped in Morgan’s era.', concept:'Advisory fees — banks earn fees for expertise and execution.', terms:['Advisory','Fee','Execution'], quiz:[
    {q:'What are the three main areas of investment banking?', a:['Advisory, underwriting, financing','Retail, wholesale, savings','Deposits, loans, cards','Stocks, bonds, cash'], c:0, e:'Advisory, underwriting, and financing are the core areas.'},
    {q:'Investment banks earn money mainly through:', a:['Interest on deposits','Fees for services','Government subsidies','Currency printing'], c:1, e:'Fees for services are the primary revenue source.'},
    {q:'M&A advisory is an example of:', a:['Underwriting','Advisory work','Commercial banking','Retail banking'], c:1, e:'M&A advisory is advisory work.'}
  ]},
  { day:17, title:'Debt & Bonds',                    lesson:'Borrowing to build.', story:'Railroads and industrial firms used bonds extensively to fund construction and expansion.', concept:'Bond issuance — companies sell bonds to investors who lend them money for a fixed period.', terms:['Bond','Coupon','Maturity'], quiz:[
    {q:'What is a bond?', a:['A share of ownership','A loan made to a company or government','A tax credit','A pension'], c:1, e:'A bond is a loan made to a company or government.'},
    {q:'What is a coupon?', a:['A discount voucher','The interest payment on a bond','A bond rating','A stock dividend'], c:1, e:'A coupon is the interest payment on a bond.'},
    {q:'What is maturity?', a:['A kind of risk','The date when a bond is repaid','A stock split','A tax'], c:1, e:'Maturity is when a bond is repaid.'}
  ]},
  { day:18, title:'Stocks & Equity',                 lesson:'Ownership capital.', story:'Stocks represented ownership in the firms Morgan financed — investors shared profits and risk.', concept:'Equity — ownership capital that receives a residual claim.', terms:['Equity','Residual claim'], quiz:[
    {q:'What is equity?', a:['A loan','Ownership in a company','A bond','A tax'], c:1, e:'Equity is ownership.'},
    {q:'Equity holders are paid:', a:['Before creditors','After creditors','Never','Only in cash'], c:1, e:'Equity is a residual claim — paid after creditors.'},
    {q:'A shareholder receives:', a:['Guaranteed interest','A share of profits via dividends and price appreciation','Government bonds','A pension'], c:1, e:'Shareholders receive dividends and price appreciation.'}
  ]},
  { day:19, title:'Corporate Restructuring',         lesson:'Fixing broken balance sheets.', story:'Restructuring can involve debt renegotiation, asset sales, or new equity — all tools Morgan used.', concept:'Distressed restructuring — reorganizing a firm in financial difficulty.', terms:['Restructuring','Distressed'], quiz:[
    {q:'What is distressed restructuring?', a:['Normal operations','Reorganizing a firm in financial difficulty','A stock split','A dividend'], c:1, e:'Distressed restructuring reorganizes a firm in financial difficulty.'},
    {q:'Which is NOT a restructuring tool?', a:['Debt renegotiation','Asset sales','New equity','Printing currency'], c:3, e:'Companies cannot print currency.'},
    {q:'Morgan’s railroad reorganizations are an example of:', a:['Retail banking','Restructuring','Insurance','Agriculture'], c:1, e:'They were restructuring.'}
  ]},
  { day:20, title:'Morgan’s Network',                lesson:'The map of influence.', story:'Morgan’s network spanned banks, industrialists, and governments on two continents.', concept:'Network effects — the value of a network grows as more members join.', terms:['Network effects','Node'], quiz:[
    {q:'What are network effects?', a:['Losses from networking','Value grows as more members join','A type of tax','A kind of bond'], c:1, e:'Network effects mean value grows with more members.'},
    {q:'Morgan’s network spanned:', a:['Only the U.S.','Only Europe','Both the U.S. and Europe','Only Asia'], c:2, e:'It spanned the U.S. and Europe.'},
    {q:'A well-chosen partner can:', a:['Reduce reach','Expand reach','Have no effect','Replace all employees'], c:1, e:'A partner can expand reach.'}
  ]},
  { day:21, title:'Financial Power',                 lesson:'Concentration and its limits.', story:'By the early 1900s, Morgan’s influence was enormous — but not unlimited. Regulation and public opinion constrained it.', concept:'Concentration of power — a small number of actors controlling large shares of an industry.', terms:['Concentration','Money Trust'], quiz:[
    {q:'What does "Money Trust" refer to?', a:['A pension fund','Public concern over concentrated financial power','A savings account','A government agency'], c:1, e:'The "Money Trust" refers to public concern over concentrated financial power.'},
    {q:'Morgan’s power was:', a:['Unlimited','Constrained by law and politics','Only theoretical','Only regional'], c:1, e:'It was constrained by law and politics.'},
    {q:'Concentration of power can lead to:', a:['Less scrutiny','Public scrutiny and regulation','Nothing','Only gains'], c:1, e:'Concentration tends to invite scrutiny and regulation.'}
  ]},
  { day:22, title:'Government Relationships',        lesson:'Private finance and public need.', story:'Morgan’s firm assisted the U.S. Treasury during currency stress in 1895 — a role that raised questions about private influence on public policy.', concept:'Public-private finance — when private actors perform quasi-public functions.', terms:['Treasury','Syndicate'], quiz:[
    {q:'In 1895, Morgan’s firm assisted the U.S. Treasury during:', a:['A war','Currency stress','An election','A recession only'], c:1, e:'During currency stress.'},
    {q:'Public-private finance is when:', a:['Only government acts','Private actors perform quasi-public functions','Only private firms act','There is no finance'], c:1, e:'It is when private actors perform quasi-public functions.'},
    {q:'The 1895 episode raised concerns about:', a:['Sports','Private influence on public policy','Taxes only','Weather'], c:1, e:'It raised concerns about private influence on public policy.'}
  ]},
  { day:23, title:'Financial Crises',                lesson:'When confidence breaks.', story:'Crises often begin when confidence collapses and liquidity evaporates.', concept:'Contagion — problems spreading from one institution to others.', terms:['Contagion','Confidence'], quiz:[
    {q:'Financial crises often begin with:', a:['Rising profits','Loss of confidence','New technology','Stable markets'], c:1, e:'Crises often begin with a loss of confidence.'},
    {q:'What is contagion?', a:['A disease only','Problems spreading from one institution to others','A kind of tax','A stock split'], c:1, e:'Contagion is the spread of problems across institutions.'},
    {q:'Crises are especially dangerous because:', a:['They are rare','They can spread quickly through the financial system','They are always short','They never affect real people'], c:1, e:'They can spread quickly through the system.'}
  ]},
  { day:24, title:'Panic of 1907',                   lesson:'Morgan’s defining crisis.', story:'In October 1907, a panic struck after the failure of the Knickerbocker Trust Company. Morgan helped coordinate bankers to pool liquidity.', concept:'Lender of last resort — an entity that provides liquidity during crises.', terms:['Lender of last resort','Liquidity'], quiz:[
    {q:'When did the Panic of 1907 occur?', a:['1901','1907','1913','1929'], c:1, e:'1907.'},
    {q:'Which institution’s failure helped trigger the panic?', a:['Knickerbocker Trust Company','Bank of England','Federal Reserve','U.S. Steel'], c:0, e:'The Knickerbocker Trust Company’s failure helped trigger the panic.'},
    {q:'What is a lender of last resort?', a:['A bank that never lends','An entity that provides liquidity during crises','A government tax office','A stock exchange'], c:1, e:'A lender of last resort provides liquidity during crises.'}
  ]},
  { day:25, title:'Morgan’s Character',              lesson:'Evidence and interpretation.', story:'Contemporaries described Morgan as confident, disciplined, and reserved — but we must separate observation from speculation.', concept:'Primary vs. secondary sources — first-hand vs. interpretive accounts.', terms:['Primary source','Secondary source'], quiz:[
    {q:'What is a primary source?', a:['A textbook','A first-hand account from the period','A documentary','A later analysis'], c:1, e:'A primary source is a first-hand account from the period.'},
    {q:'What is a secondary source?', a:['A letter written at the time','A later interpretive work','A photograph','A speech'], c:1, e:'A secondary source interprets primary materials.'},
    {q:'When historians describe character, they should:', a:['Speculate freely','Separate evidence from interpretation','Ignore primary sources','Trust only legends'], c:1, e:'They should separate evidence from interpretation.'}
  ]},
  { day:26, title:'Criticism & Controversy',         lesson:'The other side.', story:'Morgan faced criticism for the concentration of financial power and for his role in crises and consolidation.', concept:'Regulatory response — public concern can lead to new laws and institutions.', terms:['Regulation','Pujo Committee'], quiz:[
    {q:'Which Congressional committee investigated financial concentration?', a:['Pujo Committee','Ways and Means','Judiciary','Armed Services'], c:0, e:'The Pujo Committee.'},
    {q:'Public criticism of Morgan focused on:', a:['His art collection','Financial concentration and influence','His yacht','His language'], c:1, e:'Concentration of financial power and influence.'},
    {q:'Concentration concerns can lead to:', a:['No changes','Regulation and reform','Less oversight','More monopolies only'], c:1, e:'They can lead to regulation and reform.'}
  ]},
  { day:27, title:'Death & Legacy',                  lesson:'The end and what remained.', story:'Morgan died in Rome in 1913. His institutions continued and evolved.', concept:'Institutional continuity — firms can outlive founders.', terms:['Legacy','Institution'], quiz:[
    {q:'Where did Morgan die?', a:['New York','Rome','London','Paris'], c:1, e:'Rome, in 1913.'},
    {q:'What does institutional continuity mean?', a:['Firms end when founders die','Firms can outlive founders','Founders never die','Institutions never change'], c:1, e:'Firms can outlive founders.'},
    {q:'Morgan died in which year?', a:['1901','1907','1913','1929'], c:2, e:'1913.'}
  ]},
  { day:28, title:'Morgan Banking Evolution',        lesson:'From Morgan to modern.', story:'The firms associated with Morgan evolved through mergers and restructurings.', concept:'Corporate evolution — firms merge and split over decades.', terms:['Merger','Successor'], quiz:[
    {q:'What is corporate evolution?', a:['Only growth','Mergers, splits, and restructuring over time','Only decline','Only government action'], c:1, e:'Mergers, splits, and restructuring over time.'},
    {q:'Morgan’s firm name at various points included:', a:['J.P. Morgan & Co.','Bank of Morgan','United Morgan','First Morgan'], c:0, e:'J.P. Morgan & Co.'},
    {q:'Modern firms trace heritage through:', a:['Only names','Mergers and predecessor institutions','Only stock prices','Only buildings'], c:1, e:'Through mergers and predecessor institutions.'}
  ]},
  { day:29, title:'Modern JPMorgan Chase',           lesson:'Today’s landscape.', story:'JPMorgan Chase & Co. operates in consumer banking, commercial and investment banking, and asset & wealth management. This project is independent and is not affiliated with the firm.', concept:'Diversified banking — combining multiple banking businesses.', terms:['Consumer banking','Investment banking','Asset management'], quiz:[
    {q:'Which of these is a major area of modern JPMorgan Chase?', a:['Consumer & Community Banking','Only airlines','Only crypto','Only retail'], c:0, e:'Consumer & Community Banking is one major area.'},
    {q:'What is diversified banking?', a:['Only one service','Combining multiple banking businesses','Only loans','Only deposits'], c:1, e:'Diversified banking combines multiple banking businesses.'},
    {q:'This project is:', a:['Official','Independent and not affiliated with JPMorgan Chase','Sponsored by JPMorgan Chase','Endorsed by JPMorgan Chase'], c:1, e:'This project is independent.'}
  ]},
    { day:30, title:'Final Mastery Exam',              lesson:'Put it all together.', story:'The final exam brings together history, finance, and critical thinking.', concept:'Integration — combining knowledge across domains.', terms:['Mastery','Integration'], quiz:[
    {q:'What is the primary goal of this academy?', a:['Glorify Morgan','Understand history and finance together','Replace a degree','Sell products'], c:1, e:'Understanding history and finance together.'},
    {q:'Investment banking primarily:', a:['Takes deposits','Helps raise capital and advises','Prints money','Sets tax policy'], c:1, e:'Helps raise capital and advises.'},
    {q:'Morgan’s significance lies in:', a:['Only one deal','A long career shaping modern American finance','Being a politician','Winning a war'], c:1, e:'A long career shaping modern American finance.'}
  ]}
];

const DEALS = [
  {
    id:'railroads',
    year:'1870s–1890s',
    title:'Railroad Reorganizations',
    problem:'Many American railroads were overbuilt, heavily indebted, and engaged in destructive rate competition. Several defaulted.',
    players:'Railroad executives, European and American bondholders, competing railroad barons, and Morgan’s firm.',
    capital:'Enormous bond and equity issuances required to finance construction and restructure existing debt.',
    strategy:'Morgan consolidated lines, replaced management where needed, and placed trusted associates on boards to oversee governance.',
    transaction:'A series of reorganizations in which Morgan’s firm renegotiated debts and restructured ownership — sometimes taking control of distressed lines.',
    result:'Many of the reorganized lines became financially stable and Morgan’s influence across the sector deepened.',
    why:'These reorganizations established the blueprint of modern investment banking: diagnose, restructure, and coordinate capital.',
    lesson:'When industries are fragmented and unstable, the financier who can impose order captures enormous value.'
  },
  {
    id:'ge',
    year:'1892',
    title:'General Electric',
    problem:'The electrical industry was fragmented and capital-intensive, with intense competition between Edison General Electric and Thomson-Houston.',
    players:'Edison, Thomson-Houston, and the banking network associated with Morgan.',
    capital:'Substantial equity and debt for a merger of this scale.',
    strategy:'Combine the firms to reduce destructive competition and create a stronger combined entity.',
    transaction:'A merger resulting in the formation of General Electric.',
    result:'GE became one of the era’s most consequential industrial corporations.',
    why:'It illustrated how bank-coordinated consolidation could reshape entire industries.',
    lesson:'Mergers can create durable market leaders when they combine technology, capital, and distribution.'
  },
  {
    id:'uss',
    year:'1901',
    title:'U.S. Steel',
    problem:'The American steel industry was highly competitive, and Andrew Carnegie’s operations dominated the market, threatening other producers.',
    players:'Andrew Carnegie, Charles M. Schwab, Elbert Gary, and Morgan’s firm.',
    capital:'A transaction on a historic scale, involving the combination of Carnegie Steel and other producers.',
    strategy:'Purchase Carnegie Steel and combine it with other producers to form a dominant firm.',
    transaction:'The organization of U.S. Steel in 1901.',
    result:'U.S. Steel became the world’s first billion-dollar corporation (as commonly reported in historical accounts).',
    why:'It symbolized the era of trusts and industrial consolidation in the United States.',
    lesson:'Capital markets can concentrate whole industries into a small number of firms — with all the economic and political consequences that follow.'
  },
  {
    id:'gold1895',
    year:'1895',
    title:'U.S. Treasury Gold Financing',
    problem:'The U.S. Treasury’s gold reserves were under pressure, threatening confidence in the dollar’s gold peg.',
    players:'U.S. Treasury, President Cleveland’s administration, and a syndicate organized by Morgan and others.',
    capital:'A syndicate supplied gold to the Treasury in exchange for bonds.',
    strategy:'Private bankers substituted for institutional mechanisms that did not yet exist (there was no Federal Reserve).',
    transaction:'A bond issuance to replenish Treasury gold reserves.',
    result:'The Treasury’s position was temporarily stabilized. The episode remained controversial.',
    why:'It exposed structural gaps in U.S. monetary institutions that later reform addressed.',
    lesson:'When public institutions lack capacity, private actors sometimes step in — raising questions about accountability and influence.'
  },
  {
    id:'panic1907deal',
    year:'1907',
    title:'Crisis Intervention',
    problem:'A financial panic struck in October 1907 following the failure of the Knickerbocker Trust Company.',
    players:'Morgan, other leading bankers, the U.S. Treasury, and the institutions under stress.',
    capital:'Pooled liquidity arranged among private banks.',
    strategy:'Convene bankers, pool funds, and support threatened institutions to restore confidence.',
    transaction:'Coordinated private liquidity support in the absence of a central bank.',
    result:'The panic subsided, though at significant cost. The episode is widely cited as a catalyst for the Federal Reserve Act of 1913.',
    why:'It is the most studied example of private coordination during a systemic crisis.',
    lesson:'Confidence is the true currency of finance — and can require emergency action to restore.'
  }
];

const CONTROVERSIES = [
  {
    title:'Financial Concentration',
    facts:'By the early 1900s, Morgan’s firm was central to a network of banks, insurance companies, and industrial firms. The Pujo Committee investigated this concentration.',
    favor:'Supporters argued that coordination stabilized chaotic industries and reduced destructive competition.',
    criticism:'Critics argued that concentration reduced competition, harmed consumers, and concentrated power in private hands.',
    debate:'Historians debate the balance between stabilization and monopoly.',
    verify:'The Pujo Committee’s findings are a matter of public record.'
  },
  {
    title:'Monopoly Concerns',
    facts:'Consolidations such as U.S. Steel and railroad combinations created dominant firms.',
    favor:'Supporters argued these firms achieved economies of scale and reduced ruinous competition.',
    criticism:'Critics argued they suppressed competition and raised prices.',
    debate:'Economic historians disagree on the net long-term effect.',
    verify:'Antitrust enforcement intensified after this era (e.g., Sherman Act enforcement).'
  },
  {
    title:'Corporate Influence',
    facts:'Morgan often placed associates on boards of firms he financed.',
    favor:'Supporters argued this ensured competent governance and protected investors.',
    criticism:'Critics argued it consolidated control outside of shareholder democracy.',
    debate:'Framing varies widely across authors.',
    verify:'Board composition of the era is documented in corporate records.'
  },
  {
    title:'Political Influence',
    facts:'Morgan advised the U.S. Treasury and interacted with Presidents.',
    favor:'Supporters note his actions helped stabilize markets during crisis.',
    criticism:'Critics note the potential for private interests to shape public policy.',
    debate:'Historians debate the degree of influence and its consequences.',
    verify:'Contemporary press and archives document many of these interactions.'
  },
  {
    title:'Conflicts of Interest',
    facts:'Morgan’s firm often acted as underwriter, advisor, and investor simultaneously.',
    favor:'Supporters argued this alignment of interests ensured commitment.',
    criticism:'Critics argued it created conflicts.',
    debate:'Modern regulation has since formalized many of these boundaries.',
    verify:'Historical accounts document these multiple roles.'
  },
  {
    title:'Wealth Concentration',
    facts:'Morgan was among the wealthiest individuals of his era.',
    favor:'Supporters emphasized philanthropy and institution-building.',
    criticism:'Critics emphasized extreme inequality of the Gilded Age.',
    debate:'Economic historians continue to study the era’s inequality.',
    verify:'Wealth estimates of the era exist but vary by methodology.'
  }
];

const MODERN_CARDS = [
  {
    title:'Consumer & Community Banking',
    tag:'CURRENT INFORMATION',
    body:'Serves individuals and small businesses with deposits, loans, credit cards, and payments. This division handles mass-market banking — the everyday services most people associate with a bank.'
  },
  {
    title:'Commercial & Investment Banking',
    tag:'CURRENT INFORMATION',
    body:'Serves corporations and institutions with lending, capital raising, M&A advisory, and market-making. This is the modern descendant of the investment banking tradition Morgan helped establish.'
  },
  {
    title:'Asset & Wealth Management',
    tag:'CURRENT INFORMATION',
    body:'Manages investments for individuals, families, and institutions, and provides wealth planning and advisory services.'
  },
  {
    title:'How Banks Make Money',
    tag:'GENERAL KNOWLEDGE',
    body:'Banks earn through net interest margin (loans minus deposits), fees (advisory, underwriting, cards), trading revenue, and asset management fees. Modern banks diversify across these sources.'
  },
  {
    title:'Loans & Deposits',
    tag:'GENERAL KNOWLEDGE',
    body:'Deposits are liabilities to the bank; loans are assets. The spread between lending rates and deposit rates is a core source of bank profit.'
  },
  {
    title:'Investment Banking Fees',
    tag:'GENERAL KNOWLEDGE',
    body:'Investment banks typically earn fees for M&A advisory (a percentage of deal value) and for underwriting (a spread on securities sold). Trading adds additional revenue.'
  }
];
const CAREERS = [
  { title:'Investment Banking Analyst', do:'Builds financial models, prepares pitch books, and supports deal execution.', skills:'Excel, financial modeling, accounting, communication, attention to detail.', work:'Long hours supporting senior bankers; steep learning curve.', knowledge:'Accounting, valuation, M&A, capital markets.', path:'Bachelor’s degree → Analyst (2–3 years) → Associate (often via MBA) or lateral move.' },
  { title:'Associate',                   do:'Manages analysts, runs models, and interacts with clients.', skills:'Project management, advanced modeling, client communication.', work:'More client-facing than analysts.', knowledge:'Deep M&A and capital markets.', path:'MBA or direct promotion from analyst.' },
  { title:'Vice President',              do:'Leads deal teams and manages client relationships.', skills:'Deal leadership, negotiation support, industry expertise.', work:'Client coverage and execution.', knowledge:'Broad finance and sector specialization.', path:'Promoted from Associate.' },
  { title:'Director',                    do:'Wins business and manages senior client relationships.', skills:'Business development, client management, industry depth.', work:'Deal origination and coverage.', knowledge:'Strategic and sector expertise.', path:'Promoted from VP.' },
  { title:'Managing Director',           do:'Senior leader responsible for client relationships and revenue.', skills:'Rainmaking, leadership, deep industry knowledge.', work:'Client-facing, P&L responsibility.', knowledge:'Full-spectrum investment banking.', path:'Typically 10+ years in the industry.' },
  { title:'M&A',                         do:'Advises clients on mergers, acquisitions, and divestitures.', skills:'Valuation, negotiation, industry expertise.', work:'Deal execution and client interaction.', knowledge:'M&A process, valuation.', path:'Part of investment banking division.' },
  { title:'ECM (Equity Capital Markets)', do:'Helps clients raise equity via IPOs and follow-on offerings.', skills:'Market timing, investor relations, valuation.', work:'Coordinating between clients and investors.', knowledge:'Equity markets, IPOs.', path:'Part of investment banking division.' },
  { title:'DCM (Debt Capital Markets)', do:'Helps clients raise debt via bonds and loans.', skills:'Credit analysis, market knowledge, structuring.', work:'Coordinating bond and loan issuances.', knowledge:'Credit markets, interest rates.', path:'Part of investment banking division.' },
  { title:'Sales & Trading',             do:'Executes trades and manages market-making for clients.', skills:'Fast decision-making, market intuition, risk management.', work:'Fast-paced, market-driven.', knowledge:'Markets, products, risk.', path:'Often separate from investment banking.' },
  { title:'Asset Management',            do:'Manages portfolios for individuals and institutions.', skills:'Research, portfolio construction, risk management.', work:'Research-driven, long-horizon.', knowledge:'Investing, valuation, asset allocation.', path:'Entry via research or analyst roles.' },
  { title:'Research',                    do:'Publishes analysis on companies and industries.', skills:'Deep analytical and writing skills.', work:'Independent research and client calls.', knowledge:'Industry and company fundamentals.', path:'Often via graduate education or analyst roles.' },
  { title:'Risk',                        do:'Identifies and manages financial and operational risks.', skills:'Quantitative analysis, regulatory knowledge.', work:'Cross-functional, control-focused.', knowledge:'Risk frameworks, regulations.', path:'Entry via quantitative or finance backgrounds.' },
  { title:'Technology',                  do:'Builds and maintains trading, banking, and risk systems.', skills:'Programming, systems design, financial products.', work:'Highly technical.', knowledge:'Finance and computer science.', path:'Entry via computer science degrees.' }
];

const GLOSSARY = [
  { term:'Asset',            cat:'accounting', def:'Anything of value owned by a person or company.' },
  { term:'Liability',        cat:'accounting', def:'Anything owed — a debt or obligation.' },
  { term:'Capital',          cat:'banking',    def:'Money and resources used to fund a business.' },
  { term:'Equity',           cat:'investing',  def:'Ownership in a company.' },
  { term:'Debt',             cat:'banking',    def:'Money borrowed that must be repaid with interest.' },
  { term:'Bond',             cat:'investing',  def:'A loan made to a company or government that pays interest.' },
  { term:'Stock',            cat:'investing',  def:'A share of ownership in a company.' },
  { term:'Underwriting',     cat:'banking',    def:'Helping raise money by arranging an offering and assuming distribution risk.' },
  { term:'M&A',              cat:'corporate',  def:'Mergers and acquisitions — combining firms.' },
  { term:'IPO',              cat:'markets',    def:'Initial Public Offering — first public sale of a company’s stock.' },
  { term:'Liquidity',        cat:'markets',    def:'How quickly an asset can be converted to cash without losing value.' },
  { term:'Leverage',         cat:'banking',    def:'Using borrowed money to amplify returns and risk.' },
  { term:'Credit',           cat:'banking',    def:'The ability to borrow, backed by trust.' },
  { term:'Interest',         cat:'banking',    def:'The cost of borrowing money.' },
  { term:'Yield',            cat:'investing',  def:'The income return on an investment, expressed as a percentage.' },
  { term:'Syndicate',        cat:'banking',    def:'A group of banks that share a large deal to spread risk.' },
  { term:'Valuation',        cat:'corporate',  def:'The process of estimating what an asset or company is worth.' },
  { term:'Market Capitalization', cat:'markets', def:'The total value of a company’s shares (price × shares outstanding).' },
  { term:'Cash Flow',        cat:'accounting', def:'The movement of cash into and out of a business.' },
  { term:'Revenue',          cat:'accounting', def:'Money received from sales before expenses.' },
  { term:'Profit',           cat:'accounting', def:'Revenue minus expenses.' },
  { term:'Balance Sheet',    cat:'accounting', def:'A financial statement showing assets, liabilities, and equity at a point in time.' },
  { term:'Income Statement', cat:'accounting', def:'A financial statement showing revenues and expenses over a period.' },
  { term:'Risk',             cat:'investing',  def:'The possibility that outcomes differ from expectations.' },
  { term:'Restructuring',    cat:'corporate',  def:'Reorganizing a firm’s finances or operations.' },
  { term:'Capital Markets',  cat:'markets',    def:'Where long-term money is raised and traded.' },
  { term:'Investment Bank',  cat:'banking',    def:'A financial institution that helps raise capital and advises on deals.' },
  { term:'Commercial Bank',  cat:'banking',    def:'A bank serving businesses and individuals with deposits and loans.' },
  { term:'Asset Management', cat:'investing',  def:'Managing investments on behalf of clients.' }
];
/* ============================================================
   9. DASHBOARD RENDERER
   ============================================================ */

function renderDashboard() {
  // Insight rotation (deterministic by date)
  const insightEl = $('#insightText');
  if (insightEl) {
    const idx = new Date().getDate() % INSIGHTS.length;
    insightEl.textContent = INSIGHTS[idx];
  }
  const factEl = $('#factText');
  if (factEl) {
    const idx = new Date().getDate() % FACTS.length;
    factEl.textContent = FACTS[idx];
  }

  renderContinuePanel();
  renderDayGrid();
  updateMasteryUI();
}

function renderContinuePanel() {
  const body = $('#continueBody');
  if (!body) return;

  // Find next unfinished day
  let next = null;
  for (const d of DAYS_30) {
    if (!state.completedDays[d.day]) { next = d; break; }
  }

  // Also check academy lessons if all days are done
  let nextLesson = null;
  if (!next) {
    for (const l of ACADEMY_LESSONS) {
      if (!state.completedLessons[l.id]) { nextLesson = l; break; }
    }
  }

  body.innerHTML = '';
  if (next) {
    body.appendChild(el('div', { class: 'empty-state' },
      `Next up: Day ${next.day} — ${next.title}`));
    const btn = el('button', { class: 'btn btn-gold btn-sm' }, `CONTINUE DAY ${next.day}`);
    btn.addEventListener('click', () => {
      navigate('academy30');
      setTimeout(() => openDay(next.day), 200);
    });
    body.appendChild(btn);
  } else if (nextLesson) {
    body.appendChild(el('div', { class: 'empty-state' },
      `Next up: ${nextLesson.title}`));
    const btn = el('button', { class: 'btn btn-gold btn-sm' }, 'CONTINUE LESSON');
    btn.addEventListener('click', () => {
      navigate('academy');
      setTimeout(() => openLesson(nextLesson.id), 200);
    });
    body.appendChild(btn);
  } else {
    body.appendChild(el('p', { class: 'empty-state' },
      'Congratulations — you have completed all available content. Revisit sections anytime, or try a quiz to sharpen your mastery.'));
    const btn = el('button', { class: 'btn btn-ghost btn-sm' }, 'GO TO QUIZ CENTER');
    btn.addEventListener('click', () => navigate('quiz'));
    body.appendChild(btn);
  }
}

function renderDayGrid() {
  const grid = $('#dayGrid');
  if (!grid) return;
  grid.innerHTML = '';

  let currentFound = false;
  DAYS_30.forEach(d => {
    const done = !!state.completedDays[d.day];
    let cls = 'day-card';
    let status = 'LOCKED';
    if (done) { cls += ' done'; status = '✓ DONE'; }
    else if (!currentFound) { cls += ' active'; status = 'ACTIVE'; currentFound = true; }
    else { cls += ' locked'; }

    const card = el('div', {
      class: cls,
      role: 'button',
      tabindex: done || !cls.includes('locked') ? '0' : '-1',
      'aria-label': `Day ${d.day}: ${d.title} — ${status}`
    },
      el('div', { class: 'day-num' }, `DAY ${String(d.day).padStart(2,'0')}`),
      el('div', { class: 'day-title' }, d.title),
      el('div', { class: 'day-status' }, status)
    );

    if (done || !cls.includes('locked')) {
      card.addEventListener('click', () => {
        navigate('academy30');
        setTimeout(() => openDay(d.day), 200);
      });
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate('academy30');
          setTimeout(() => openDay(d.day), 200);
        }
      });
    }
    grid.appendChild(card);
  });
}

/* ============================================================
   10. LIFE TIMELINE RENDERER
   ============================================================ */

function renderLife() {
  const timeline = $('#lifeTimeline');
  if (!timeline) return;
  if (timeline.dataset.rendered === '1') return;
  timeline.dataset.rendered = '1';

  LIFE_EVENTS.forEach(ev => {
    const item = el('div', { class: 'tl-item' },
      el('div', { class: 'tl-dot' }, ev.year.slice(0,4).slice(-2)),
      el('div', { class: 'tl-card' },
        el('div', { class: 'tl-head', role: 'button', tabindex: '0' },
          el('div', {},
            el('div', { class: 'tl-year' }, ev.year),
            el('div', { class: 'tl-title' }, ev.title)
          ),
          el('div', { class: 'tl-toggle' }, '+')
        ),
        el('div', { class: 'tl-body' },
          el('p', {}, ev.body),
          el('div', { class: 'tl-label' }, 'WHY IT MATTERED'),
          el('p', {}, ev.why),
          el('div', { class: 'tl-label' }, 'FINANCE LESSON'),
          el('p', {}, ev.lesson)
        )
      )
    );
    const head = item.querySelector('.tl-head');
    const card = item.querySelector('.tl-card');
    head.addEventListener('click', () => card.classList.toggle('open'));
    head.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.classList.toggle('open');
      }
    });
    timeline.appendChild(item);
  });
}

/* ============================================================
   11. PERSONAL LIFE
   ============================================================ */

const PERSONAL_ITEMS = [
  {
    title:'Family Origins',
    body:'His father, Junius Spencer Morgan, was a merchant who became a banker. His mother, Juliet Pierpont, came from a prominent New England family. The household connected commerce and culture.'
  },
  {
    title:'Marriage',
    body:'Morgan married Amelia “Memie” Sturges in 1861; she died in 1862 of tuberculosis. In 1865, he married Frances Louisa Tracy, with whom he had children.'
  },
  {
    title:'Children',
    body:'Morgan had four children with Frances: Louisa, J.P. “Jack” Morgan Jr., Juliet, and Anne. Jack Morgan later led the firm.'
  },
  {
    title:'Personal Interests',
    body:'Morgan was a serious art collector and bibliophile. Parts of his collection formed the core of the Morgan Library & Museum.'
  },
  {
    title:'Yachting',
    body:'He was an enthusiastic yachtsman; his vessel Corsair was famous in its time.'
  },
  {
    title:'Travel',
    body:'He traveled frequently between the United States and Europe, where he maintained social and business connections.'
  },
  {
    title:'Social Circles',
    body:'Morgan belonged to social and business circles that included industrialists, financiers, and political figures on both sides of the Atlantic.'
  },
  {
    title:'Privacy',
    body:'He was notably private about his personal life and rarely gave interviews or explained his decisions publicly.'
  }
];

function renderPersonal() {
  const grid = $('#personalGrid');
  if (!grid) return;
  if (grid.dataset.rendered === '1') return;
  grid.dataset.rendered = '1';

  PERSONAL_ITEMS.forEach(item => {
    grid.appendChild(
      el('div', { class: 'panel' },
        el('div', { class: 'panel-head' }, el('h3', {}, item.title)),
        el('div', { class: 'panel-body' }, el('p', {}, item.body))
      )
    );
  });
}

/* ============================================================
   12. CHARACTER RENDERER
   ============================================================ */

function renderCharacter() {
  const grid = $('#charGrid');
  if (!grid) return;
  if (grid.dataset.rendered === '1') return;
  grid.dataset.rendered = '1';

  // Intro disclaimer
  const intro = el('div', { class: 'panel panel--warn' },
    el('div', { class: 'panel-body' },
      el('p', {}, 'Character analysis draws on historical evidence. Where interpretation is uncertain, we say so. We never present psychological speculation as fact.')
    )
  );
  grid.parentElement.insertBefore(intro, grid);

  CHARACTER_TRAITS.forEach(t => {
    grid.appendChild(
      el('div', { class: 'char-card' },
        el('div', { class: 'char-name' }, t.name),
        el('div', { class: 'char-bar' }, el('span', { style: `width:${t.level}%` })),
        el('div', { class: 'char-section' },
          el('h5', {}, 'HISTORICAL EVIDENCE'),
          el('p', {}, t.evidence)
        ),
        el('div', { class: 'char-section' },
          el('h5', {}, 'INTERPRETATION'),
          el('p', {}, t.interpretation)
        ),
        el('div', { class: 'char-section' },
          el('h5', {}, 'LIMITATIONS'),
          el('p', {}, t.limits)
        )
      )
    );
  });
}

/* ============================================================
   13. POWER MAP
   ============================================================ */

function renderPowerMap() {
  const map = $('#powerMap');
  if (!map) return;

  // Remove previous nodes/lines if re-rendering
  $$('.power-node, .power-line', map).forEach(n => n.remove());

  POWER_NODES.forEach(node => {
    const rad = (node.angle - 90) * Math.PI / 180;
    const radius = 220; // px offset from center
    const cx = Math.cos(rad) * radius;
    const cy = Math.sin(rad) * radius;

    // Line from center to node
    const lineLen = Math.sqrt(cx*cx + cy*cy);
    const lineAngle = Math.atan2(cy, cx) * 180 / Math.PI;

    const line = el('div', { class: 'power-line', style:
      `width:${lineLen}px;transform:rotate(${lineAngle}deg)`
    });
    map.appendChild(line);

    const nodeEl = el('div', {
      class: 'power-node',
      'data-node': node.id,
      role: 'button',
      tabindex: '0',
      'aria-label': node.title,
      style: `left:calc(50% + ${cx}px);top:calc(50% + ${cy}px)`
    }, node.label);

    const activate = () => {
      $$('.power-node', map).forEach(n => n.classList.remove('active'));
      nodeEl.classList.add('active');
      $('#powerInfoTitle').textContent = node.title;
      $('#powerInfoBody').innerHTML = '';
      $('#powerInfoBody').appendChild(el('p', {}, node.body));
    };

    nodeEl.addEventListener('click', activate);
    nodeEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });

    map.appendChild(nodeEl);
  });

  // Center node also clickable for overview
  const center = $('.power-center', map);
  if (center && !center.dataset.bound) {
    center.dataset.bound = '1';
    center.style.cursor = 'pointer';
    center.setAttribute('role','button');
    center.setAttribute('tabindex','0');
    const showOverview = () => {
      $$('.power-node', map).forEach(n => n.classList.remove('active'));
      $('#powerInfoTitle').textContent = 'J.P. Morgan — Overview';
      $('#powerInfoBody').innerHTML = '';
      $('#powerInfoBody').appendChild(el('p', {},
        'Morgan’s influence rested on capital, reputation, information, and an unmatched transatlantic network. This project emphasizes that his power was real but not unlimited — it was constrained by law, politics, and market conditions.'
      ));
    };
    center.addEventListener('click', showOverview);
    center.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showOverview(); }
    });
  }
}

/* ============================================================
   14. EMPIRE FLOW
   ============================================================ */

const EMPIRE_NODES = [
  'Morgan Banking',
  'Railroads',
  'Industrial Companies',
  'Electricity',
  'Steel',
  'Financial Markets',
  'Government',
  'International Capital'
];

function renderEmpire() {
  const flow = $('#empireFlow');
  if (!flow) return;
  if (flow.dataset.rendered === '1') return;
  flow.dataset.rendered = '1';

  EMPIRE_NODES.forEach((label, i) => {
    flow.appendChild(el('div', { class: 'empire-node' }, label));
    if (i < EMPIRE_NODES.length - 1) {
      flow.appendChild(el('div', { class: 'empire-arrow' }, '↓'));
    }
  });
}

/* ============================================================
   PART 2 COMPLETE
   ============================================================ */
/* ============================================================
   15. BANKING ACADEMY (20 lessons)
   ============================================================ */

function renderAcademy() {
  const grid = $('#academyGrid');
  if (!grid) return;
  grid.innerHTML = '';

  ACADEMY_LESSONS.forEach((lesson, i) => {
    const done = !!state.completedLessons[lesson.id];
    const card = el('div', {
      class: 'lesson-card' + (done ? ' done' : ''),
      role: 'button',
      tabindex: '0',
      'aria-label': `Lesson ${i+1}: ${lesson.title}`
    },
      el('div', { class: 'lesson-num' }, `LESSON ${String(i+1).padStart(2,'0')}`),
      el('div', { class: 'lesson-name' }, lesson.title),
      el('div', { class: 'lesson-meta' },
        el('span', {}, done ? 'Completed' : 'Not started'),
        done ? el('span', { class: 'lesson-check' }, '✓') : el('span', {}, '')
      )
    );
    const open = () => openLesson(lesson.id);
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    grid.appendChild(card);
  });
}

function openLesson(lessonId) {
  const lesson = ACADEMY_LESSONS.find(l => l.id === lessonId);
  if (!lesson) return;
  const viewer = $('#lessonViewer');
  if (!viewer) return;
  viewer.hidden = false;
  viewer.innerHTML = '';

  const idx = ACADEMY_LESSONS.findIndex(l => l.id === lessonId) + 1;
  const done = !!state.completedLessons[lesson.id];

  viewer.appendChild(el('div', { class: 'lesson-eyebrow' }, `LESSON ${String(idx).padStart(2,'0')}`));
  viewer.appendChild(el('h2', {}, lesson.title));

  // Beginner explanation
  viewer.appendChild(el('div', { class: 'lesson-block' },
    el('h4', {}, 'BEGINNER EXPLANATION'),
    el('p', {}, lesson.beginner)
  ));

  // Deeper explanation
  viewer.appendChild(el('div', { class: 'lesson-block' },
    el('h4', {}, 'DEEPER EXPLANATION'),
    el('p', {}, lesson.deeper)
  ));

  // Morgan connection
  viewer.appendChild(el('div', { class: 'lesson-block' },
    el('h4', {}, 'MORGAN CONNECTION'),
    el('p', {}, lesson.morgan)
  ));

  // Modern example
  viewer.appendChild(el('div', { class: 'lesson-block' },
    el('h4', {}, 'MODERN EXAMPLE'),
    el('p', {}, lesson.modern)
  ));

  // Key terms
  const termsBlock = el('div', { class: 'lesson-block' },
    el('h4', {}, 'KEY TERMS')
  );
  const termHost = el('div', {});
  lesson.terms.forEach(t => termHost.appendChild(el('span', { class: 'term-pill' }, t)));
  termsBlock.appendChild(termHost);
  viewer.appendChild(termsBlock);

  // Mini quiz (3 questions)
  const quizBlock = el('div', { class: 'lesson-block' },
    el('h4', {}, 'MINI QUIZ')
  );
  const quizHost = el('div', {});
  quizBlock.appendChild(quizHost);
  viewer.appendChild(quizBlock);
  renderMiniQuiz(quizHost, lesson);

  // Actions
  const actions = el('div', { class: 'lesson-actions' });
  if (!done) {
    const completeBtn = el('button', { class: 'btn btn-gold' }, 'MARK LESSON COMPLETE');
    completeBtn.addEventListener('click', () => {
      completeLesson(lesson.id);
      completeBtn.disabled = true;
      completeBtn.textContent = '✓ COMPLETED';
    });
    actions.appendChild(completeBtn);
  } else {
    actions.appendChild(el('div', { class: 'term-pill' }, '✓ COMPLETED'));
  }
  const backBtn = el('button', { class: 'btn btn-ghost' }, '← BACK TO LESSONS');
  backBtn.addEventListener('click', () => {
    viewer.hidden = true;
    renderAcademy();
  });
  actions.appendChild(backBtn);
  viewer.appendChild(actions);

  // Scroll into view
  setTimeout(() => viewer.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

function completeLesson(lessonId) {
  if (state.completedLessons[lessonId]) return;
  state.completedLessons[lessonId] = true;
  saveState();
  addXP(50, 'Lesson complete');
  updateProgressUI();
}

/* ============================================================
   MINI QUIZ (used by Academy + 30-day)
   ============================================================ */

function renderMiniQuiz(host, lesson) {
  host.innerHTML = '';
  const answers = [];
  let correctCount = 0;

  (lesson.quiz || []).forEach((q, qi) => {
    const wrap = el('div', { style: 'margin-bottom:16px' });
    wrap.appendChild(el('div', { class: 'quiz-question', style: 'font-size:15px;margin-bottom:10px' }, `${qi+1}. ${q.q}`));
    const choices = el('div', { class: 'quiz-choices' });
    q.a.forEach((choice, ai) => {
      const btn = el('button', { class: 'quiz-choice', type: 'button' }, choice);
      btn.addEventListener('click', () => {
        if (answers[qi] != null) return;
        answers[qi] = ai;
        if (ai === q.c) { btn.classList.add('correct'); correctCount++; }
        else {
          btn.classList.add('wrong');
          // highlight correct
          choices.children[q.c]?.classList.add('correct');
        }
        $$('.quiz-choice', choices).forEach(b => b.disabled = true);
        // Show explanation
        wrap.appendChild(el('div', { class: 'quiz-explanation' }, q.e));
        // If all answered, award XP
        if (answers.filter(a => a != null).length === (lesson.quiz||[]).length) {
          if (correctCount === (lesson.quiz||[]).length) {
            addXP(50, 'Perfect mini quiz!');
          } else if (correctCount > 0) {
            addXP(25, 'Mini quiz progress');
          }
        }
      });
      choices.appendChild(btn);
    });
    wrap.appendChild(choices);
    host.appendChild(wrap);
  });
}

/* ============================================================
   16. 30-DAY ACADEMY
   ============================================================ */

function renderAcademy30() {
  const grid = $('#academy30Grid');
  if (!grid) return;
  grid.innerHTML = '';

  let unlockedFound = false;
  DAYS_30.forEach(d => {
    const done = !!state.completedDays[d.day];
    let cls = 'lesson-card';
    let clickable = false;
    if (done) { cls += ' done'; clickable = true; }
    else if (!unlockedFound) { cls += ''; clickable = true; unlockedFound = true; }
    else { cls += ' locked'; }

    const card = el('div', {
      class: cls,
      role: 'button',
      tabindex: clickable ? '0' : '-1',
      'aria-label': `Day ${d.day}: ${d.title}`
    },
      el('div', { class: 'lesson-num' }, `DAY ${String(d.day).padStart(2,'0')}`),
      el('div', { class: 'lesson-name' }, d.title),
      el('div', { class: 'lesson-meta' },
        el('span', {}, done ? 'Completed' : (clickable ? 'Start' : 'Locked')),
        done ? el('span', { class: 'lesson-check' }, '✓') : el('span', {}, '')
      )
    );
    if (clickable) {
      const open = () => openDay(d.day);
      card.addEventListener('click', open);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    }
    grid.appendChild(card);
  });
}

function openDay(dayNum) {
  const day = DAYS_30.find(d => d.day === dayNum);
  if (!day) return;
  const viewer = $('#lessonViewer30');
  if (!viewer) return;
  viewer.hidden = false;
  viewer.innerHTML = '';

  const done = !!state.completedDays[day.day];

  viewer.appendChild(el('div', { class: 'lesson-eyebrow' }, `DAY ${String(day.day).padStart(2,'0')} / 30`));
  viewer.appendChild(el('h2', {}, day.title));

  viewer.appendChild(el('div', { class: 'lesson-block' },
    el('h4', {}, 'LESSON'),
    el('p', {}, day.lesson)
  ));

  viewer.appendChild(el('div', { class: 'lesson-block' },
    el('h4', {}, 'HISTORICAL STORY'),
    el('p', {}, day.story)
  ));

  viewer.appendChild(el('div', { class: 'lesson-block' },
    el('h4', {}, 'FINANCE CONCEPT'),
    el('p', {}, day.concept)
  ));

  const termsBlock = el('div', { class: 'lesson-block' },
    el('h4', {}, 'KEY TERMS')
  );
  const termHost = el('div', {});
  (day.terms || []).forEach(t => termHost.appendChild(el('span', { class: 'term-pill' }, t)));
  termsBlock.appendChild(termHost);
  viewer.appendChild(termsBlock);

  const quizBlock = el('div', { class: 'lesson-block' },
    el('h4', {}, 'DAY QUIZ')
  );
  const quizHost = el('div', {});
  quizBlock.appendChild(quizHost);
  viewer.appendChild(quizBlock);
  renderMiniQuiz(quizHost, day);

  // Takeaway
  const takeaway = el('div', { class: 'lesson-block' },
    el('h4', {}, 'TAKEAWAY'),
    el('p', {}, day.concept)
  );
  viewer.appendChild(takeaway);

  // Actions
  const actions = el('div', { class: 'lesson-actions' });
  if (!done) {
    const completeBtn = el('button', { class: 'btn btn-gold' }, 'COMPLETE DAY');
    completeBtn.addEventListener('click', () => {
      completeDay(day.day);
      completeBtn.disabled = true;
      completeBtn.textContent = '✓ COMPLETED';
      // Auto advance day counter
      if (state.currentDay === day.day) {
        state.currentDay = Math.min(30, day.day + 1);
        saveState();
        $('#statDay') && ($('#statDay').textContent = state.currentDay);
        $('#sidebarDay') && ($('#sidebarDay').textContent = state.currentDay);
      }
    });
    actions.appendChild(completeBtn);
  } else {
    actions.appendChild(el('div', { class: 'term-pill' }, '✓ COMPLETED'));
  }
  const backBtn = el('button', { class: 'btn btn-ghost' }, '← BACK TO ACADEMY');
  backBtn.addEventListener('click', () => {
    viewer.hidden = true;
    renderAcademy30();
    renderDayGrid();
  });
  actions.appendChild(backBtn);
  viewer.appendChild(actions);

  setTimeout(() => viewer.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

function completeDay(dayNum) {
  if (state.completedDays[dayNum]) return;
  state.completedDays[dayNum] = true;
  saveState();
  // +50 XP per day; if day 30, bonus
  if (dayNum === 30) {
    addXP(500, '30-Day Academy complete!');
  } else {
    addXP(50, `Day ${dayNum} complete`);
  }
  updateProgressUI();
  updateMasteryFromDays();
}

function updateMasteryFromDays() {
  const n = Object.keys(state.completedDays).length;
  state.mastery.historical = Math.min(20, Math.round((n / 30) * 20));
  state.mastery.financial  = Math.min(20, Math.round((n / 30) * 20));
  state.mastery.power      = Math.min(15, Math.round((n / 30) * 15));
  state.mastery.deals      = Math.min(10, Math.round((n / 30) * 10));
  state.mastery.modern     = Math.min(10, Math.round((n / 30) * 10));
  saveState();
  updateMasteryUI();
}

/* ============================================================
   17. MAJOR DEALS
   ============================================================ */

function renderDeals() {
  const grid = $('#dealGrid');
  if (!grid) return;
  if (grid.dataset.rendered === '1') return;
  grid.dataset.rendered = '1';

  DEALS.forEach(deal => {
    const card = el('div', { class: 'deal-card' },
      el('div', { class: 'deal-head' },
        el('div', { class: 'deal-year' }, deal.year),
        el('h3', {}, deal.title)
      ),
      el('div', { class: 'deal-body' },
        row('THE PROBLEM', deal.problem),
        row('THE PLAYERS', deal.players),
        row('THE CAPITAL', deal.capital),
        row('THE STRATEGY', deal.strategy),
        row('THE TRANSACTION', deal.transaction),
        row('THE RESULT', deal.result),
        row('WHY IT MATTERED', deal.why),
        row('MODERN FINANCE LESSON', deal.lesson)
      )
    );
    grid.appendChild(card);

    function row(label, text) {
      return el('div', { class: 'deal-row' },
        el('h5', {}, label),
        el('p', {}, text)
      );
    }
  });
}

/* ============================================================
   18. PANIC OF 1907 FLOW
   ============================================================ */

const PANIC_STEPS = [
  'Financial Stress',
  'Loss of Confidence',
  'Banking Panic',
  'Liquidity Problem',
  'Morgan’s Intervention',
  'Coordination',
  'Government Response',
  'Federal Reserve Era'
];

function renderPanic() {
  const flow = $('#panicFlow');
  if (!flow) return;
  if (flow.dataset.rendered === '1') return;
  flow.dataset.rendered = '1';

  PANIC_STEPS.forEach((step, i) => {
    flow.appendChild(
      el('div', { class: 'panic-step' },
        el('div', { class: 'panic-step-num' }, `0${i+1}`),
        el('div', { class: 'panic-step-name' }, step)
      )
    );
  });
}

/* ============================================================
   19. DECISION SIMULATOR (You Are Morgan + Morgan's Mind)
   ============================================================ */

const DECISION_SCENARIOS = [
  {
    id: 'liquidity',
    title: 'A Major Financial Institution Is Under Severe Stress',
    scenario: 'A trusted institution’s depositors are withdrawing funds quickly. If it fails, the panic may spread to other banks overnight. You are asked to act before the market opens tomorrow.',
    choices: [
      { letter:'A', text:'Provide liquidity from your own resources to stabilize it.', correct:false, feedback:'Historically, Morgan often pooled liquidity with other institutions rather than acting alone. Acting alone would concentrate risk on one firm.' },
      { letter:'B', text:'Coordinate other financial institutions to pool support.', correct:true, feedback:'A core historical principle: coordination distributes risk and signals collective confidence. Morgan repeatedly convened bankers during crises. The 1907 intervention is one such documented episode.' },
      { letter:'C', text:'Allow it to fail to teach markets a lesson.', correct:false, feedback:'In a systemic crisis, allowing a large institution to fail can trigger contagion. Modern central banks exist partly to prevent this.' },
      { letter:'D', text:'Seek immediate government assistance.', correct:false, feedback:'In 1907, the U.S. had no Federal Reserve. Government assistance on that scale was not structurally available. This limitation is a key reason the Federal Reserve was later created.' }
    ],
    principle: 'Coordination among financial institutions can substitute for centralized authority during a crisis — but it depends on trust and mutual incentive.',
    context: 'The Panic of 1907 is the most studied episode in which Morgan coordinated bankers to pool liquidity. It is widely cited as a catalyst for the Federal Reserve Act of 1913.',
    consequence: 'Successful coordination can arrest a panic; failure can deepen it. Private coordination is not a durable substitute for public institutions.'
  },
  {
    id: 'railroad',
    title: 'A Railroad Is Failing',
    scenario: 'A major railroad is heavily indebted, operating at a loss, and cannot make its bond payments. Thousands of jobs and numerous investors are affected.',
    choices: [
      { letter:'A', text:'Liquidate the railroad’s assets and pay creditors what you can.', correct:false, feedback:'Liquidation can destroy value and disrupt regional economies. Historically, Morgan preferred reorganization over liquidation.' },
      { letter:'B', text:'Reorganize: renegotiate debts and restructure operations.', correct:true, feedback:'This was the essential method of Morgan’s railroad work. Reorganization preserved the enterprise and allowed creditors and equity holders to recover more value over time.' },
      { letter:'C', text:'Raise new equity without changing management.', correct:false, feedback:'Throwing capital at poor management rarely works. Historically, Morgan often required governance changes as a condition of financing.' },
      { letter:'D', text:'Let another financier handle it.', correct:false, feedback:'In practice, Morgan’s firm actively pursued these reorganizations because they were both profitable and stabilizing.' }
    ],
    principle: 'Restructuring — not liquidation — often maximizes value when a fundamentally viable enterprise is only temporarily insolvent.',
    context: 'Morgan’s railroad reorganizations in the 1870s–1890s established the template for modern corporate restructuring.',
    consequence: 'Reorganization stabilized sectors but also created concentration of control — a source of later criticism.'
  },
  {
    id: 'merger',
    title: 'Two Companies Want to Merge',
    scenario: 'Two industrial firms in the same sector want to merge to reduce destructive price competition and achieve economies of scale. Both are profitable. Combined, they would dominate their market.',
    choices: [
      { letter:'A', text:'Advise against the merger to protect competition.', correct:false, feedback:'A defensible position in some contexts, but not the historical pattern of this era.' },
      { letter:'B', text:'Arrange the merger and help with financing.', correct:true, feedback:'Morgan’s era saw many consolidations of this kind, including those leading to General Electric and U.S. Steel. This helped stabilize chaotic industries but drew criticism about market concentration.' },
      { letter:'C', text:'Suggest a smaller transaction involving only part of one firm.', correct:false, feedback:'Possible but not the pattern Morgan typically executed at scale.' },
      { letter:'D', text:'Decline to advise and refer them elsewhere.', correct:false, feedback:'Morgan rarely declined major industrial consolidations that fit his network.' }
    ],
    principle: 'Mergers can create value through scale and coordination — but they can also reduce competition. Trade-offs are real.',
    context: 'Historical consolidations often increased stability but also market concentration, prompting later antitrust concern.',
    consequence: 'Modern M&A requires careful antitrust review — a legacy of the consolidation era.'
  },
  {
    id: 'panic',
    title: 'A Market Panic Is Spreading',
    scenario: 'Stock prices are collapsing. Depositors are withdrawing funds. Confidence is evaporating. What do you do?',
    choices: [
      { letter:'A', text:'Sell assets to raise cash and wait it out.', correct:false, feedback:'Fire-sale selling can accelerate price declines and deepen panic.' },
      { letter:'B', text:'Publicly commit funds and convene financial leaders.', correct:true, feedback:'Confidence is the true currency of finance. A credible commitment can arrest a panic.' },
      { letter:'C', text:'Advise clients to sit tight and do nothing.', correct:false, feedback:'Inaction during a systemic crisis rarely restores confidence.' },
      { letter:'D', text:'Blame speculators and call for new laws.', correct:false, feedback:'Policy responses matter — but not immediately during a liquidity event.' }
    ],
    principle: 'Restoring confidence during a panic typically requires visible, coordinated action, not passive waiting.',
    context: 'Morgan’s approach in 1907 combined pooling of private funds with rapid convening of bankers.',
    consequence: 'Ad-hoc private intervention can stabilize markets temporarily, but often reveals structural gaps.'
  },
  {
    id: 'borrower',
    title: 'A Borrower Cannot Repay',
    scenario: 'A major corporate borrower is unable to meet its debt obligations. What do you do as its lender and adviser?',
    choices: [
      { letter:'A', text:'Demand full immediate repayment.', correct:false, feedback:'Accelerating debt can force bankruptcy — often destroying value for everyone.' },
      { letter:'B', text:'Negotiate new terms — extend maturity, adjust interest, restructure.', correct:true, feedback:'Workouts preserve going-concern value and give borrowers a chance to recover, while protecting the lender’s long-term position.' },
      { letter:'C', text:'Seize collateral and exit.', correct:false, feedback:'Seizing collateral is a last resort, typically when there is no viable path forward.' },
      { letter:'D', text:'Write off the loan immediately.', correct:false, feedback:'Writing off immediately forgoes recoverable value.' }
    ],
    principle: 'Workouts preserve value more often than abrupt enforcement when an obligor is only temporarily distressed.',
    context: 'Morgan’s railroad workouts institutionalized many of these principles.',
    consequence: 'Modern debt restructuring is a highly structured practice drawing on these early templates.'
  }
];

const MIND_SCENARIOS = DECISION_SCENARIOS; // Reuse scenarios

function renderDecision(kind) {
  const panelTitle = kind === 'mind' ? '#mindTitle' : '#decisionTitle';
  const panelBody  = kind === 'mind' ? '#mindBody'  : '#decisionBody';
  const titleEl = $(panelTitle);
  const bodyEl = $(panelBody);
  if (!titleEl || !bodyEl) return;

  // Cycle through scenarios deterministically per render session
  const key = kind + '_index';
  let idx = parseInt(sessionStorage.getItem(key) || '0', 10);
  if (idx >= MIND_SCENARIOS.length) idx = 0;
  sessionStorage.setItem(key, String((idx + 1) % MIND_SCENARIOS.length));

  const scenario = MIND_SCENARIOS[idx];
  titleEl.textContent = scenario.title;
  bodyEl.innerHTML = '';

  bodyEl.appendChild(el('div', { class: 'decision-scenario' }, scenario.scenario));

  const choicesHost = el('div', { class: 'decision-choices' });
  let answered = false;

  scenario.choices.forEach(ch => {
    const btn = el('button', { class: 'choice-btn', type: 'button' },
      el('span', { class: 'choice-letter' }, ch.letter + '.'),
      ch.text
    );
    btn.addEventListener('click', () => {
      if (answered) return;
      answered = true;
      // Mark all choices
      $$('.choice-btn', choicesHost).forEach((b, i) => {
        b.disabled = true;
        if (scenario.choices[i].correct) b.classList.add('correct');
      });
      if (!ch.correct) btn.classList.add('wrong');

      // Feedback
      const result = el('div', { class: 'decision-result' },
        el('h4', {}, ch.correct ? '✓ EDUCATIONALLY SOUND' : '• ALTERNATIVE PATH'),
        el('p', {}, ch.feedback),
        el('h4', {}, 'FINANCIAL PRINCIPLE'),
        el('p', {}, scenario.principle),
        el('h4', {}, 'HISTORICAL CONTEXT'),
        el('p', {}, scenario.context),
        el('h4', {}, 'POTENTIAL CONSEQUENCE'),
        el('p', {}, scenario.consequence)
      );
      bodyEl.appendChild(result);

      // XP
      addXP(ch.correct ? 30 : 15, ch.correct ? 'Decision challenge (best path)' : 'Decision explored');
    });
    choicesHost.appendChild(btn);
  });
  bodyEl.appendChild(choicesHost);

  // Next scenario button
  const nextBtn = el('button', { class: 'btn btn-ghost mt-20' }, 'TRY ANOTHER SCENARIO →');
  nextBtn.addEventListener('click', () => renderDecision(kind));
  bodyEl.appendChild(nextBtn);

  // Acknowledge simulation nature
  bodyEl.appendChild(el('p', { class: 'muted', style: 'margin-top:16px;font-style:italic' },
    'This is an educational simulation. It teaches financial principles — it does not claim Morgan made exactly these choices.'
  ));
}

/* ============================================================
   20. CONTROVERSIES
   ============================================================ */

function renderControversies() {
  const grid = $('#controversyGrid');
  if (!grid) return;
  if (grid.dataset.rendered === '1') return;
  grid.dataset.rendered = '1';

  CONTROVERSIES.forEach(c => {
    const card = el('div', { class: 'controversy-card' },
      el('h3', {}, c.title),
      section('HISTORICAL FACTS', c.facts),
      section('ARGUMENT IN HIS FAVOR', c.favor),
      section('CRITICISM', c.criticism),
      section('WHAT HISTORIANS DEBATE', c.debate),
      section('WHAT WE CAN VERIFY', c.verify)
    );
    grid.appendChild(card);

    function section(label, text) {
      return el('div', { class: 'controversy-section' },
        el('h5', {}, label),
        el('p', {}, text)
      );
    }
  });
}

/* ============================================================
   21. MODERN JPMORGAN
   ============================================================ */

function renderModern() {
  const grid = $('#modernGrid');
  if (!grid) return;
  if (grid.dataset.rendered === '1') return;
  grid.dataset.rendered = '1';

  MODERN_CARDS.forEach(m => {
    grid.appendChild(
      el('div', { class: 'modern-card' },
        el('div', { class: 'modern-tag' }, m.tag),
        el('h3', {}, m.title),
        el('p', {}, m.body)
      )
    );
  });
}

/* ============================================================
   22. CAREER LAB
   ============================================================ */

function renderCareer() {
  const grid = $('#careerGrid');
  if (grid && grid.dataset.rendered !== '1') {
    grid.dataset.rendered = '1';
    CAREERS.forEach(c => {
      grid.appendChild(
        el('div', { class: 'career-card' },
          el('h3', {}, c.title),
          row('WHAT THEY DO', c.do),
          row('SKILLS', c.skills),
          row('TYPICAL WORK', c.work),
          row('FINANCE KNOWLEDGE', c.knowledge),
          row('CAREER PATH', c.path)
        )
      );
      function row(l, t) {
        return el('div', { class: 'career-row' },
          el('h5', {}, l),
          el('p', {}, t)
        );
      }
    });
  }

  // Career fit quiz
  const host = $('#careerQuiz');
  if (!host || host.dataset.rendered === '1') return;
  host.dataset.rendered = '1';
  renderCareerQuiz(host);
}

const CAREER_QUIZ = [
  { q:'I enjoy analyzing companies and industries deeply.', dim:'analytical' },
  { q:'I am comfortable working long hours to deliver high-quality work.', dim:'stamina' },
  { q:'I can communicate complex ideas clearly and concisely.', dim:'communication' },
  { q:'I am good with numbers, spreadsheets, and financial models.', dim:'quantitative' },
  { q:'I thrive in fast-paced, high-pressure environments.', dim:'pressure' },
  { q:'I can build and maintain professional relationships over time.', dim:'relational' },
  { q:'I am interested in markets, capital, and valuation.', dim:'markets' },
  { q:'I am detail-oriented and rarely let errors slip through.', dim:'detail' }
];

function renderCareerQuiz(host) {
  host.innerHTML = '';
  host.appendChild(el('p', { class: 'muted', style: 'margin-bottom:14px' },
    'Rate each statement from 1 (strongly disagree) to 5 (strongly agree).'));
  const scores = new Array(CAREER_QUIZ.length).fill(3);

  CAREER_QUIZ.forEach((item, i) => {
    const rowEl = el('div', { style: 'padding:12px 0;border-bottom:1px solid var(--border)' });
    rowEl.appendChild(el('div', { style: 'font-size:14px;color:var(--ink-2);margin-bottom:10px' }, item.q));
    const rangeWrap = el('div', { style: 'display:flex;gap:6px' });
    for (let v = 1; v <= 5; v++) {
      const btn = el('button', { class: 'chip', type: 'button' }, String(v));
      if (v === 3) btn.classList.add('active');
      btn.addEventListener('click', () => {
        scores[i] = v;
        $$('.chip', rangeWrap).forEach((b, bi) => b.classList.toggle('active', bi === v - 1));
      });
      rangeWrap.appendChild(btn);
    }
    rowEl.appendChild(rangeWrap);
    host.appendChild(rowEl);
  });

  const submit = el('button', { class: 'btn btn-gold mt-20' }, 'EVALUATE MY FIT');
  submit.addEventListener('click', () => {
    const total = scores.reduce((a,b)=>a+b, 0);
    const max = CAREER_QUIZ.length * 5;
    const pct = Math.round((total / max) * 100);
    let message = '';
    if (pct >= 85) message = 'Strong fit. Investment banking rewards analytical depth, stamina, and communication — you show all three.';
    else if (pct >= 70) message = 'Promising fit. Focus on sharpening your quantitative and communication skills — both are central to banking.';
    else if (pct >= 55) message = 'Potential fit with development. Consider exploring adjacent roles (research, risk, corporate finance) to build foundations.';
    else message = 'Investment banking may not be the ideal first fit — and that is fine. Consider exploring finance-adjacent careers such as risk, operations, or technology before deciding.';

    const resultBox = host.querySelector('.career-result') || el('div', { class: 'career-result decision-result mt-20' });
    resultBox.innerHTML = '';
    resultBox.appendChild(el('h4', {}, `YOUR FIT SCORE: ${pct}%`));
    resultBox.appendChild(el('p', {}, message));
    resultBox.appendChild(el('p', { class: 'muted' }, 'This is a reflective tool, not a career verdict. Real careers depend on many factors beyond a short questionnaire.'));
    if (!resultBox.parentElement) host.appendChild(resultBox);

    addXP(20, 'Career reflection completed');
  });
  host.appendChild(submit);
}
/* ============================================================
   23. GLOSSARY
   ============================================================ */

function renderGlossary() {
  const list = $('#glossaryList');
  if (!list) return;

  // Initial render only binds controls once
  if (!list.dataset.bound) {
    list.dataset.bound = '1';

    // Category chips
    $$('#glossaryChips .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        $$('#glossaryChips .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        filterGlossary();
      });
    });

    // Search input
    const inp = $('#glossarySearch');
    if (inp) {
      inp.addEventListener('input', filterGlossary);
    }
  }

  filterGlossary();

  function filterGlossary() {
    const q = ($('#glossarySearch')?.value || '').trim().toLowerCase();
    const activeCat = $('#glossaryChips .chip.active')?.dataset.cat || 'all';
    list.innerHTML = '';

    const items = GLOSSARY.filter(g => {
      const catMatch = activeCat === 'all' || g.cat === activeCat;
      const qMatch = !q || g.term.toLowerCase().includes(q) || g.def.toLowerCase().includes(q);
      return catMatch && qMatch;
    });

    if (items.length === 0) {
      list.appendChild(el('p', { class: 'empty-state' },
        'No glossary terms match your search. Try a different term or reset the filter.'));
      return;
    }

    items.sort((a,b) => a.term.localeCompare(b.term)).forEach(g => {
      list.appendChild(
        el('div', { class: 'gloss-item' },
          el('div', { class: 'gloss-term' }, g.term),
          el('div', { class: 'gloss-cat' }, g.cat.toUpperCase()),
          el('div', { class: 'gloss-def' }, g.def)
        )
      );
    });
  }
}

/* ============================================================
   24. QUIZ CENTER
   ============================================================ */

// Build a combined question bank from all 30-day day quizzes,
// academy lessons, and a few explicitly authored exam questions.
function buildQuestionBank() {
  const bank = [];

  // Day quizzes
  DAYS_30.forEach(d => {
    (d.quiz || []).forEach(q => {
      bank.push({
        category: 'life',
        q: q.q,
        a: q.a,
        c: q.c,
        e: q.e
      });
    });
  });

  // Academy lessons
  ACADEMY_LESSONS.forEach(l => {
    // We derive questions from the lesson's key terms — safe, self-authored
    if (l.terms && l.terms.length) {
      const t = l.terms[0];
      bank.push({
        category: 'banking',
        q: `Which term best relates to: ${l.title}?`,
        a: [t, 'A random unrelated term', 'A type of currency', 'A regulatory body'],
        c: 0,
        e: `${t} is a key term in "${l.title}".`
      });
    }
  });

  // Hand-authored exam questions
  const extra = [
    { category:'power', q:'Which of these was NOT a source of Morgan’s influence?', a:['Capital','Reputation','Network','Direct control of the U.S. Treasury'], c:3, e:'He did not directly control the Treasury. His power was real but constrained.' },
    { category:'power', q:'The term "Money Trust" refers to:', a:['A pension fund','Concern over concentrated financial power','A savings product','A type of bond'], c:1, e:'It referred to public concern over concentrated financial power.' },
    { category:'deals', q:'Which company was created from a merger involving Edison General Electric?', a:['General Motors','General Electric','U.S. Steel','Standard Oil'], c:1, e:'General Electric.' },
    { category:'deals', q:'In which year was U.S. Steel organized?', a:['1880','1895','1901','1920'], c:2, e:'1901.' },
    { category:'panic', q:'Which institution’s failure helped trigger the Panic of 1907?', a:['Knickerbocker Trust Company','Federal Reserve','Bank of England','Chase Bank'], c:0, e:'The Knickerbocker Trust Company.' },
    { category:'modern', q:'This project is:', a:['Officially endorsed by JPMorgan Chase','Independent and not affiliated with JPMorgan Chase','Sponsored by JPMorgan Chase','A JPMorgan Chase product'], c:1, e:'Independent and not affiliated.' },
    { category:'character', q:'Which is a valid approach to character analysis?', a:['Assume motives from outcome','Separate evidence from interpretation','Ignore sources','Rely on rumors'], c:1, e:'Separating evidence from interpretation is essential.' },
    { category:'career', q:'Investment banking primarily involves:', a:['Deposit-taking only','Raising capital and advisory work','Insurance sales','Printing money'], c:1, e:'Raising capital and advisory work.' },
    { category:'life', q:'Morgan died in which city?', a:['New York','London','Rome','Paris'], c:2, e:'Rome, in 1913.' },
    { category:'life', q:'What was Morgan’s father’s profession?', a:['Lawyer','Banker/merchant','Teacher','General'], c:1, e:'Banker and merchant.' }
  ];
  bank.push(...extra);

  return bank;
}

const QUESTION_BANK = buildQuestionBank();

const QUIZ = {
  active: false,
  questions: [],
  index: 0,
  correct: 0,
  wrong: 0,
  mode: null,
  category: null
};

function renderQuizCenter() {
  // Rebind mode buttons once
  $$('.mode-btn').forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => startQuiz(btn.dataset.mode));
  });
  const catPicker = $('#quizCategoryPicker');
  if (catPicker && !catPicker.dataset.bound) {
    catPicker.dataset.bound = '1';
    $('#quizStartCategory')?.addEventListener('click', () => {
      const cat = $('#quizCategorySelect').value;
      startQuiz('category', cat);
    });
  }
}

function startQuiz(mode, category) {
  QUIZ.mode = mode;
  QUIZ.category = category || null;
  let pool = QUESTION_BANK.slice();

  if (mode === 'category' && category) {
    pool = pool.filter(q => q.category === category);
  }

  if (pool.length === 0) {
    Toast.show('Quiz unavailable', 'No questions match this category yet.');
    return;
  }

  // Shuffle helper
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  let count;
  switch (mode) {
    case '10': count = 10; break;
    case '25': count = 25; break;
    case '50': count = 50; break;
    case 'random': count = Math.min(15, pool.length); break;
    case 'category': count = Math.min(15, pool.length); break;
    case 'final': count = Math.min(30, pool.length); break;
    default: count = 10;
  }

  QUIZ.questions = shuffle(pool).slice(0, count).map(q => {
    // Shuffle choices but preserve correct answer
    const correctText = q.a[q.c];
    const shuffled = shuffle(q.a.slice());
    return {
      q: q.q,
      a: shuffled,
      c: shuffled.indexOf(correctText),
      e: q.e,
      category: q.category
    };
  });
  QUIZ.index = 0;
  QUIZ.correct = 0;
  QUIZ.wrong = 0;
  QUIZ.active = true;

  $('#quizResults').hidden = true;
  $('#quizPanel').hidden = false;
  renderQuizQuestion();
}

function renderQuizQuestion() {
  const body = $('#quizBody');
  const header = $('#quizHeader');
  const counter = $('#quizCounter');
  if (!body || !header || !counter) return;

  if (QUIZ.index >= QUIZ.questions.length) {
    endQuiz();
    return;
  }

  const q = QUIZ.questions[QUIZ.index];
  header.textContent = `Question ${QUIZ.index + 1}`;
  counter.textContent = `${QUIZ.index + 1} / ${QUIZ.questions.length}`;

  body.innerHTML = '';
  const progressWrap = el('div', { class: 'quiz-progress' },
    el('span', { class: 'text-muted', style: 'font-size:11px;letter-spacing:2px' }, 'PROGRESS'),
    el('div', { class: 'quiz-progress-bar' }, el('span', { style: `width:${((QUIZ.index)/QUIZ.questions.length)*100}%` })),
    el('span', { class: 'text-gold', style: 'font-size:11px;letter-spacing:2px' }, `${QUIZ.correct}✓ / ${QUIZ.wrong}✗`)
  );
  body.appendChild(progressWrap);

  body.appendChild(el('div', { class: 'quiz-question' }, q.q));

  const choicesHost = el('div', { class: 'quiz-choices' });
  let answered = false;

  q.a.forEach((choice, i) => {
    const btn = el('button', { class: 'quiz-choice', type: 'button' }, choice);
    btn.addEventListener('click', () => {
      if (answered) return;
      answered = true;
      $$('.quiz-choice', choicesHost).forEach((b, bi) => {
        b.disabled = true;
        if (bi === q.c) b.classList.add('correct');
      });
      if (i === q.c) {
        QUIZ.correct++;
      } else {
        btn.classList.add('wrong');
        QUIZ.wrong++;
      }
      // Explanation
      body.appendChild(el('div', { class: 'quiz-explanation' }, q.e));

      // Next button
      const nextBtn = el('button', { class: 'btn btn-gold' },
        QUIZ.index === QUIZ.questions.length - 1 ? 'SEE RESULTS →' : 'NEXT QUESTION →');
      nextBtn.addEventListener('click', () => {
        QUIZ.index++;
        renderQuizQuestion();
      });
      body.appendChild(nextBtn);

      // Update mini progress
      const barSpan = progressWrap.querySelector('.quiz-progress-bar span');
      if (barSpan) barSpan.style.width = `${((QUIZ.index+1)/QUIZ.questions.length)*100}%`;
      const scoreSpan = progressWrap.querySelector('.text-gold');
      if (scoreSpan) scoreSpan.textContent = `${QUIZ.correct}✓ / ${QUIZ.wrong}✗`;
    });
    choicesHost.appendChild(btn);
  });
  body.appendChild(choicesHost);

  setTimeout(() => body.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 40);
}

function endQuiz() {
  QUIZ.active = false;
  $('#quizPanel').hidden = true;
  const results = $('#quizResults');
  results.hidden = false;
  const body = $('#quizResultsBody');
  body.innerHTML = '';

  const total = QUIZ.questions.length;
  const pct = total > 0 ? Math.round((QUIZ.correct / total) * 100) : 0;

  // Update best score
  if (pct > (state.quizBest || 0)) {
    state.quizBest = pct;
  }

  // Save history
  state.quizHistory = state.quizHistory || [];
  state.quizHistory.push({ mode: QUIZ.mode, pct, correct: QUIZ.correct, total, date: Date.now() });
  if (state.quizHistory.length > 20) state.quizHistory.shift();

  // Mastery boost
  const gained = Math.round(pct / 10); // 0–10 points per quiz
  state.mastery.financial = Math.min(20, (state.mastery.financial || 0) + Math.round(gained / 2));
  state.mastery.critical  = Math.min(10, (state.mastery.critical  || 0) + Math.round(gained / 3));
  state.mastery.historical= Math.min(20, (state.mastery.historical|| 0) + Math.round(gained / 2));
  state.mastery.modern    = Math.min(10, (state.mastery.modern    || 0) + Math.round(gained / 4));
  saveState();

  // XP
  let xp = 25;
  if (pct === 100) xp = 100;
  else if (pct >= 80) xp = 60;
  else if (pct >= 60) xp = 40;
  addXP(xp, 'Quiz completed');

  body.appendChild(el('div', { class: 'result-big' }, `${pct}%`));
  body.appendChild(el('div', { class: 'result-label' }, 'YOUR SCORE'));

  const stats = el('div', { class: 'result-stats' },
    statBox(QUIZ.correct, 'CORRECT'),
    statBox(QUIZ.wrong, 'WRONG'),
    statBox(total, 'TOTAL')
  );
  body.appendChild(stats);

  // Category breakdown
  const catCount = {};
  QUIZ.questions.forEach(q => {
    catCount[q.category] = catCount[q.category] || { correct: 0, total: 0 };
    catCount[q.category].total++;
  });
  // Note: we don't store per-question correctness; recompute conceptually not needed

  // Mastery update display
  body.appendChild(el('p', { class: 'muted', style: 'margin-bottom:16px;text-align:center' },
    'Your Mastery score has been updated based on this result.'));

  const actions = el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;justify-content:center' });
  const retry = el('button', { class: 'btn btn-gold' }, 'TAKE ANOTHER QUIZ');
  retry.addEventListener('click', () => {
    $('#quizResults').hidden = true;
    renderQuizCenter();
  });
  const toMastery = el('button', { class: 'btn btn-ghost' }, 'VIEW MASTERY');
  toMastery.addEventListener('click', () => navigate('mastery'));
  actions.appendChild(retry);
  actions.appendChild(toMastery);
  body.appendChild(actions);

  updateProgressUI();
  updateMasteryUI();

  function statBox(num, lbl) {
    return el('div', { class: 'result-stat' },
      el('div', { class: 'result-stat-num' }, String(num)),
      el('div', { class: 'result-stat-lbl' }, lbl)
    );
  }
}

/* ============================================================
   25. MASTERY
   ============================================================ */

const MASTERY_DIMENSIONS = [
  { key:'historical', label:'Historical Knowledge', max:20 },
  { key:'financial',  label:'Financial Knowledge',  max:20 },
  { key:'character',  label:'Character',            max:15 },
  { key:'power',      label:'Power',                max:15 },
  { key:'deals',      label:'Deals',                max:10 },
  { key:'modern',     label:'Modern Banking',       max:10 },
  { key:'critical',   label:'Critical Thinking',    max:10 }
];

function totalMastery() {
  let sum = 0;
  MASTERY_DIMENSIONS.forEach(d => {
    sum += Math.min(d.max, Math.max(0, state.mastery[d.key] || 0));
  });
  return Math.min(100, sum);
}

function masteryLevel(score) {
  if (score >= 90) return 'MORGAN SCHOLAR';
  if (score >= 75) return 'DEAL MAKER';
  if (score >= 60) return 'BANKING STUDENT';
  if (score >= 40) return 'APPRENTICE';
  return 'BEGINNER';
}

function updateMasteryUI() {
  const score = totalMastery();
  const level = masteryLevel(score);

  // Dashboard
  $('#statMastery') && ($('#statMastery').textContent = score);
  $('#statMasteryBar') && ($('#statMasteryBar').style.width = score + '%');
  $('#statMasteryLevel') && ($('#statMasteryLevel').textContent = level);

  // Mastery section
  $('#masteryScoreBig') && ($('#masteryScoreBig').textContent = score);
  $('#masteryLevelBig') && ($('#masteryLevelBig').textContent = level);
}

function renderMastery() {
  updateMasteryUI();
  const host = $('#masteryBreakdown');
  if (!host) return;
  host.innerHTML = '';
  MASTERY_DIMENSIONS.forEach(d => {
    const val = Math.min(d.max, Math.max(0, state.mastery[d.key] || 0));
    const pct = Math.round((val / d.max) * 100);
    host.appendChild(
      el('div', { class: 'mastery-row' },
        el('div', { class: 'mastery-row-lbl' }, d.label),
        el('div', { class: 'mastery-row-bar' }, el('span', { style: `width:${pct}%` })),
        el('div', { class: 'mastery-row-val' }, `${val}/${d.max}`)
      )
    );
  });
}

/* ============================================================
   26. MORGAN AI (curated responses)
   ============================================================ */

const AI_RESPONSES = [
  {
    match: /underwrit/i,
    answer: `Underwriting (simple): An investment bank helps a company raise money from investors and takes responsibility for arranging the offering.\n\nHistorical: Morgan-led syndicates underwrote large bond and equity issuances for railroads and industrial firms — often distributing them to investors across two continents.\n\nModern: Today, investment banks still underwrite IPOs and bond offerings, typically forming a syndicate when the deal is large.`
  },
  {
    match: /why.*power|powerful|power/i,
    answer: `Morgan's influence rested on several sources:\n\n• Capital — he controlled access to vast pools of investment funds.\n• Reputation — his word functioned as a form of credit.\n• Network — connections across banks, industry, and government on two continents.\n• Information — his firm often knew more about a deal than anyone else in the room.\n• Coordination — during crises, he could convene bankers and organize action.\n\nNote: his power was real but not unlimited. It was constrained by law, politics, and market conditions. Historians debate the exact extent.`
  },
  {
    match: /panic of 1907|1907/i,
    answer: `The Panic of 1907:\n\n1. Financial stress built up in the trust-company sector.\n2. The failure of the Knickerbocker Trust Company triggered a loss of confidence.\n3. Depositors rushed to withdraw funds; a banking panic spread.\n4. Liquidity dried up.\n5. Morgan helped convene bankers and pool funds to support threatened institutions.\n6. The panic eventually subsided.\n\nImportantly, the crisis exposed structural weaknesses. It is widely cited as a catalyst for the Federal Reserve Act of 1913. Private intervention was ad hoc — a temporary substitute for institutions that did not yet exist.`
  },
  {
    match: /\bM&A\b|mergers?|acquisitions?/i,
    answer: `M&A (Mergers & Acquisitions) means combining companies — either through a merger (joining forces) or an acquisition (one buys another).\n\nHistorical: Morgan orchestrated consolidations such as General Electric and U.S. Steel.\n\nModern: Investment banks advise on M&A by valuing the firms, structuring the deal, and negotiating terms. Advisory fees are typically a percentage of deal value.`
  },
  {
    match: /how.*investment bank.*money|bank.*make money/i,
    answer: `Investment banks make money in several ways:\n\n1. Advisory fees — for M&A and other advice.\n2. Underwriting fees — a spread on securities they help issue.\n3. Trading — making markets and taking positions.\n4. Financing — providing loans or structured credit.\n5. Asset management — managing investments for fees.\n\nMorgan's firm earned primarily from underwriting and financing in its era. Modern banks are far more diversified.`
  },
  {
    match: /good person|moral|ethics|ethical/i,
    answer: `Was Morgan a good person? Historians and philosophers would say that is not a question with a simple answer.\n\n• He was enormously consequential — a stabilizing force in crises, and central to the industrialization of the United States.\n• He was also criticized for concentrating financial power and for the ways his influence shaped markets.\n\nWe can describe documented actions with care. We cannot reliably reconstruct intentions or moral character from outcomes. This project presents evidence and debate, not a verdict.`
  },
  {
    match: /capital/i,
    answer: `Capital is money and other resources used to fund a business.\n\nThere are two main types:\n• Equity — ownership capital. Equity holders share in profits and risk.\n• Debt — borrowed money that must be repaid with interest.\n\nMorgan raised capital from investors across two continents for railroads, industry, and governments.`
  },
  {
    match: /bond/i,
    answer: `A bond is a loan made to a company or government. The borrower pays interest (the coupon) over time and repays the principal at maturity.\n\nMorgan was a master of bond issuance for railroads. Bond markets today are enormous and global.`
  },
  {
    match: /stock|equity/i,
    answer: `A stock represents a share of ownership in a company. Stockholders own a portion and may receive dividends and voting rights.\n\nEquity is a residual claim — equity holders are paid after creditors. Equity can rise or fall with the company's performance.`
  },
  {
    match: /jp ?morgan chase|jpmorgan|modern firm/i,
    answer: `Important distinction: J. Pierpont Morgan (1837–1913) and JPMorgan Chase & Co. are not the same entity.\n\nThe modern firm traces part of its heritage to predecessor institutions associated with Morgan's era. Its current structure is the result of a long evolution through mergers and restructurings.\n\nThis project is independent and not affiliated with JPMorgan Chase & Co.`
  },
  {
    match: /hello|hi|hey/i,
    answer: `Hello. I'm Morgan AI — an educational tutor with curated responses. Ask me about Morgan, banking, deals, crises, or financial concepts.`
  },
  {
    match: /help|what can you/i,
    answer: `I can help with: historical topics (Morgan, his era, crises), financial concepts (underwriting, M&A, IPOs, bonds, equity, liquidity, leverage), and modern banking (investment banking, career paths).\n\nTry asking: "Explain underwriting." or "Why was Morgan powerful?"`
  }
];

function renderAI() {
  const chat = $('#chatWindow');
  if (!chat) return;

  if (!chat.dataset.seeded) {
    chat.dataset.seeded = '1';
    appendBot(chat, `Hello. I'm Morgan AI. Ask me about J. Pierpont Morgan, banking, deals, or finance concepts.\n\nThis version uses curated responses — not a live AI. It is an educational tool.`);
  }

  // Suggestions
  $$('#chatSuggestions button').forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      $('#chatInput').value = btn.dataset.q;
      sendChat();
    });
  });

  // Form
  const form = $('#chatForm');
  if (form && !form.dataset.bound) {
    form.dataset.bound = '1';
    form.addEventListener('submit', e => {
      e.preventDefault();
      sendChat();
    });
  }
}

function appendUser(host, text) {
  host.appendChild(el('div', { class: 'chat-msg user' }, text));
  host.scrollTop = host.scrollHeight;
}
function appendBot(host, text) {
  const msg = el('div', { class: 'chat-msg bot' });
  // Preserve line breaks
  text.split('\n').forEach((line, i) => {
    if (i > 0) msg.appendChild(document.createElement('br'));
    msg.appendChild(document.createTextNode(line));
  });
  host.appendChild(msg);
  host.scrollTop = host.scrollHeight;
}

function sendChat() {
  const input = $('#chatInput');
  const chat = $('#chatWindow');
  if (!input || !chat) return;
  const q = input.value.trim();
  if (!q) return;
  appendUser(chat, q);
  input.value = '';

  // Find match
  let response = null;
  for (const r of AI_RESPONSES) {
    if (r.match.test(q)) { response = r.answer; break; }
  }
  if (!response) {
    response = `I don't have a curated response for that question yet. Try one of these:\n\n• "Explain underwriting."\n• "Why was Morgan powerful?"\n• "Explain the Panic of 1907."\n• "What is M&A?"\n• "How does an investment bank make money?"\n• "Was Morgan a good person?"\n\nNote: This is an educational tool with curated responses, not a live AI.`;
  }

  // Simulate typing
  setTimeout(() => appendBot(chat, response), 280);
}

/* ============================================================
   27. GLOBAL SEARCH
   ============================================================ */

function buildSearchIndex() {
  const index = [];
  // Sections
  NAV_ROUTES.forEach(r => {
    index.push({ cat: 'SECTION', title: r.charAt(0).toUpperCase() + r.slice(1), desc: `Navigate to ${r}`, route: r });
  });
  // Life events
  LIFE_EVENTS.forEach(ev => {
    index.push({ cat: 'EVENT', title: `${ev.year} — ${ev.title}`, desc: ev.body.slice(0, 120) + '…', route: 'life' });
  });
  // Academy lessons
  ACADEMY_LESSONS.forEach(l => {
    index.push({ cat: 'LESSON', title: l.title, desc: l.beginner.slice(0, 120) + '…', route: 'academy' });
  });
  // Days
  DAYS_30.forEach(d => {
    index.push({ cat: 'DAY', title: `Day ${d.day}: ${d.title}`, desc: d.lesson, route: 'academy30' });
  });
  // Deals
  DEALS.forEach(d => {
    index.push({ cat: 'DEAL', title: d.title, desc: d.problem.slice(0, 120) + '…', route: 'deals' });
  });
  // Glossary
  GLOSSARY.forEach(g => {
    index.push({ cat: 'GLOSSARY', title: g.term, desc: g.def, route: 'glossary' });
  });
  // Careers
  CAREERS.forEach(c => {
    index.push({ cat: 'CAREER', title: c.title, desc: c.do, route: 'career' });
  });
  return index;
}

const SEARCH_INDEX = buildSearchIndex();

function runSearch(q) {
  const host = $('#searchResults');
  if (!host) return;
  host.innerHTML = '';

  if (!q || q.length < 2) {
    host.appendChild(el('p', { class: 'empty-state' }, 'Start typing to search.'));
    return;
  }

  const lq = q.toLowerCase();
  const results = SEARCH_INDEX.filter(item =>
    item.title.toLowerCase().includes(lq) || item.desc.toLowerCase().includes(lq)
  ).slice(0, 30);

  if (results.length === 0) {
    host.appendChild(el('p', { class: 'empty-state' },
      'No results. Try a different keyword — e.g., "railroad", "underwriting", "Panic".'));
    return;
  }

  results.forEach(r => {
    const item = el('div', { class: 'search-item', role: 'button', tabindex: '0' },
      el('div', { class: 'search-cat' }, r.cat),
      el('div', { class: 'search-title' }, r.title),
      el('div', { class: 'search-desc' }, r.desc)
    );
    const go = () => {
      Modal.close('searchModal');
      navigate(r.route);
    };
    item.addEventListener('click', go);
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter') go();
    });
    host.appendChild(item);
  });
}

/* ============================================================
   28. INITIALIZATION — Hook into the main DOMContentLoaded
   ============================================================ */

// After the main init runs, populate section-specific renders as needed.
// Most sections render lazily via navigate(), but we pre-warm some state.

window.addEventListener('load', () => {
  // Ensure day counter is displayed
  $('#statDay') && ($('#statDay').textContent = state.currentDay || 1);
  $('#sidebarDay') && ($('#sidebarDay').textContent = state.currentDay || 1);

  // Update mastery UI once DOM is ready
  updateMasteryUI();

  // Rebuild icons after dynamic content
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  // If a lesson/quiz is mid-flow in this session, do not auto-navigate anywhere.
  // Dashboard is the default.
});

/* ============================================================
   29. ERROR SAFETY
   ============================================================ */

window.addEventListener('error', e => {
  // Silently swallow minor rendering errors so the app remains usable.
  // Log for debugging without breaking UX.
  if (window.console && console.warn) {
    console.warn('[Morgan Archive] Non-fatal error:', e.message);
  }
});

/* ============================================================
   END OF SCRIPT.JS
   The Morgan Archive — Independent Educational Project
   Not affiliated with JPMorgan Chase & Co.
   ============================================================ */