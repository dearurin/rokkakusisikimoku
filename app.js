(() => {
  'use strict';

  const data = window.ROKKAKU_DATA;
  if (!data || !Array.isArray(data.articles) || data.articles.length !== 67) {
    document.body.innerHTML = '<main style="max-width:760px;margin:80px auto;padding:24px;font-family:sans-serif"><h1>データを読み込めませんでした</h1><p>site-data.js が index.html と同じ場所にあることを確認してください。</p></main>';
    return;
  }

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const state = {
    currentArticle: 1,
    visibleArticles: data.articles,
  };

  let cardObserver;
  let toastTimer;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderInline(value) {
    let result = escapeHtml(value);
    result = result.replace(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    return result;
  }

  function renderMarkdownBlocks(value) {
    const lines = value.replace(/\r\n/g, '\n').split('\n');
    const output = [];
    let paragraph = [];
    let listType = null;
    let listItems = [];

    function flushParagraph() {
      if (paragraph.length) {
        output.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
        paragraph = [];
      }
    }

    function flushList() {
      if (listType && listItems.length) {
        output.push(`<${listType}>${listItems.map((item) => `<li>${renderInline(item)}</li>`).join('')}</${listType}>`);
      }
      listType = null;
      listItems = [];
    }

    for (const line of lines) {
      const ordered = line.match(/^\d+\.\s+(.*)$/);
      const bullet = line.match(/^-\s+(.*)$/);
      if (ordered || bullet) {
        flushParagraph();
        const nextType = ordered ? 'ol' : 'ul';
        if (listType && listType !== nextType) flushList();
        listType = nextType;
        listItems.push((ordered || bullet)[1]);
      } else if (!line.trim()) {
        flushParagraph();
        flushList();
      } else {
        flushList();
        paragraph.push(line.trim());
      }
    }
    flushParagraph();
    flushList();
    return output.join('');
  }

  function renderStaticSections() {
    $('#epilogueContent').innerHTML = `
      <div class="epilogue-original"><span class="content-label">原文</span>${escapeHtml(data.epilogue.original)}</div>
      <div class="epilogue-translation">
        <h3>現代語意訳</h3>
        <p>${escapeHtml(data.epilogue.paraphrase)}</p>
      </div>
    `;

  }

  function articleCard(article) {
    return `
      <article class="article-card" id="article-${article.number}" data-article="${article.number}">
        <div class="article-main">
          <header class="article-header">
            <a class="article-number" href="#article-${article.number}">第${article.number}条</a>
            <div class="article-title">
              <h3>${escapeHtml(article.theme)}</h3>
            </div>
            <button class="copy-link" type="button" data-copy-article="${article.number}" aria-label="第${article.number}条へのリンクをコピー" title="この条文へのリンクをコピー">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 15 15 9"></path><path d="M7.5 12.5 5 15a3 3 0 0 0 4.2 4.2l2.5-2.5"></path><path d="m12.3 7.3 2.5-2.5A3 3 0 1 1 19 9l-2.5 2.5"></path></svg>
            </button>
          </header>
          <div class="paraphrase">
            <span class="content-label">現代語意訳</span>
            <p>${escapeHtml(article.paraphrase)}</p>
          </div>
        </div>
        <details class="article-details">
          <summary>原文・解説を読む</summary>
          <div class="detail-content">
            <section class="original-block">
              <span class="content-label">原文</span>
              <blockquote>${escapeHtml(article.original)}</blockquote>
            </section>
            <section class="explanation-block">
              <span class="content-label">解説</span>
              <p>${escapeHtml(article.explanation)}</p>
            </section>
          </div>
        </details>
      </article>
    `;
  }

  function renderNumberGrid() {
    const visible = new Set(state.visibleArticles.map((article) => article.number));
    $('#articleNumberGrid').innerHTML = data.articles.map((article) => `
      <a href="#article-${article.number}" data-index-article="${article.number}" class="${visible.has(article.number) ? '' : 'is-filtered'}${state.currentArticle === article.number ? ' is-current' : ''}" aria-label="第${article.number}条${visible.has(article.number) ? '' : '（現在の絞り込みでは非表示）'}">${article.number}</a>
    `).join('');
  }

  function updateResultsStatus() {
    const count = state.visibleArticles.length;
    $('#sidebarResultCount').textContent = String(count);
    $('#resultsStatus').textContent = `全${count}条を表示しています`;
  }

  function observeCards() {
    if (cardObserver) cardObserver.disconnect();
    const cards = $$('.article-card');
    if (!cards.length) return;
    cardObserver = new IntersectionObserver((entries) => {
      const visibleEntries = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (!visibleEntries.length) return;
      const number = Number(visibleEntries[0].target.dataset.article);
      if (number !== state.currentArticle) {
        state.currentArticle = number;
        $$('.article-card').forEach((card) => card.classList.toggle('is-current', Number(card.dataset.article) === number));
        $$('[data-index-article]').forEach((link) => link.classList.toggle('is-current', Number(link.dataset.indexArticle) === number));
      }
    }, { rootMargin: '-32% 0px -58% 0px', threshold: 0 });
    cards.forEach((card) => cardObserver.observe(card));
  }

  function renderArticles({ preserveScroll = true } = {}) {
    const previousTop = preserveScroll ? $('#articles').getBoundingClientRect().top : 0;
    state.visibleArticles = data.articles;
    $('#articleList').innerHTML = state.visibleArticles.map(articleCard).join('');
    renderNumberGrid();
    updateResultsStatus();
    observeCards();
    if (preserveScroll && previousTop < 0) {
      const nextTop = $('#articles').getBoundingClientRect().top;
      window.scrollBy({ top: nextTop - previousTop, behavior: 'auto' });
    }
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 1900);
  }

  async function copyArticleLink(number) {
    const url = new URL(window.location.href);
    url.hash = `article-${number}`;
    try {
      await navigator.clipboard.writeText(url.href);
      showToast(`第${number}条へのリンクをコピーしました`);
    } catch {
      const temporary = document.createElement('textarea');
      temporary.value = url.href;
      temporary.style.position = 'fixed';
      temporary.style.opacity = '0';
      document.body.append(temporary);
      temporary.select();
      document.execCommand('copy');
      temporary.remove();
      showToast(`第${number}条へのリンクをコピーしました`);
    }
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('rokkaku-theme', theme);
    const dark = theme === 'dark';
    $('#themeToggle').setAttribute('aria-label', dark ? 'ライトモードに切り替える' : 'ダークモードに切り替える');
    document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#111815' : '#f2eee4');
  }

  function initializeTheme() {
    const stored = localStorage.getItem('rokkaku-theme');
    const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    setTheme(stored || preferred);
  }

  function bindEvents() {
    $('#articleList').addEventListener('click', (event) => {
      const copyButton = event.target.closest('[data-copy-article]');
      if (copyButton) copyArticleLink(copyButton.dataset.copyArticle);
    });

    $('#themeToggle').addEventListener('click', () => {
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });

    $('#backToTop').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    window.addEventListener('scroll', () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
      $('#readingProgress').style.width = `${Math.min(100, Math.max(0, progress))}%`;
      $('#siteHeader').classList.toggle('is-scrolled', window.scrollY > 20);
      $('#backToTop').classList.toggle('is-visible', window.scrollY > 700);
    }, { passive: true });

  }

  function openHashTarget() {
    const match = window.location.hash.match(/^#article-(\d+)$/);
    if (!match) return;
    const number = Number(match[1]);
    if (number < 1 || number > 67) return;
    window.setTimeout(() => {
      const card = $(`#article-${number}`);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  initializeTheme();
  renderStaticSections();
  renderArticles({ preserveScroll: false });
  bindEvents();
  openHashTarget();
})();
