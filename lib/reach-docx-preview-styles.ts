/** EU REACH manufacturer card — matches PDF / EU_REACH_SOURCE.docx (#E8EFDF / #135D3F). */
const MANUFACTURER_CARD_STYLE: Partial<CSSStyleDeclaration> = {
  backgroundColor: '#E8EFDF',
  borderRadius: '10px',
  padding: '12px 16px 16px',
  margin: '12px 0 16px',
  boxSizing: 'border-box',
};

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function cleanManufacturerAddressText(text: string): string {
  const parts = normalizeText(text)
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && part !== '—');
  return parts.length > 0 ? parts.join(', ') : '—';
}

function styleManufacturerCardParagraph(p: HTMLElement, index: number): void {
  p.style.margin = '0';
  p.style.padding = '0';
  p.style.fontFamily = "'Verdana', Geneva, Tahoma, sans-serif";
  p.style.lineHeight = '1.35';

  if (index === 0) {
    p.style.fontSize = '7pt';
    p.style.fontWeight = '700';
    p.style.color = '#135D3F';
    p.style.textTransform = 'uppercase';
    p.style.letterSpacing = '0.04em';
    p.style.marginBottom = '6px';
    return;
  }

  if (index === 1) {
    p.style.fontSize = '13.5pt';
    p.style.fontWeight = '700';
    p.style.color = '#135D3F';
    p.style.marginBottom = '4px';
    return;
  }

  if (index === 2) {
    const cleaned = cleanManufacturerAddressText(p.textContent || '');
    if (cleaned !== normalizeText(p.textContent || '')) {
      p.textContent = cleaned;
    }
    p.style.fontSize = '9pt';
    p.style.fontWeight = '400';
    p.style.color = '#596472';
    p.style.marginBottom = '4px';
    return;
  }

  p.style.fontSize = '9pt';
  p.style.fontWeight = '700';
  p.style.color = '#135D3F';
  p.style.marginTop = '8px';
  p.style.lineHeight = '1.4';
}

function collectManufacturerCardParagraphs(
  paragraphs: HTMLParagraphElement[],
  startIndex: number
): HTMLParagraphElement[] {
  const card: HTMLParagraphElement[] = [];
  for (let j = startIndex; j < paragraphs.length && card.length < 4; j++) {
    const text = normalizeText(paragraphs[j].textContent || '');
    if (!text) continue;
    if (/^Registered Substance/i.test(text)) break;
    card.push(paragraphs[j]);
    if (/Representative/i.test(text)) break;
  }
  return card.length >= 3 ? card : [];
}

function wrapManufacturerCard(cardParagraphs: HTMLParagraphElement[]): void {
  const first = cardParagraphs[0];
  if (first.closest('[data-reach-manufacturer-card]')) return;

  const parent = first.parentElement;
  if (!parent) return;

  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-reach-manufacturer-card', 'true');
  Object.assign(wrapper.style, MANUFACTURER_CARD_STYLE);
  parent.insertBefore(wrapper, first);

  cardParagraphs.forEach((p, index) => {
    styleManufacturerCardParagraph(p, index);
    wrapper.appendChild(p);
  });
}

function hideDuplicateManufacturerBlocks(paragraphs: HTMLParagraphElement[]): void {
  const hits: number[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const text = normalizeText(paragraphs[i].textContent || '');
    if (!/NON-EU\s+MANUFACTURER/i.test(text)) continue;
    hits.push(i);
  }

  for (let h = 1; h < hits.length; h++) {
    const card = collectManufacturerCardParagraphs(paragraphs, hits[h]);
    card.forEach((p) => {
      p.style.display = 'none';
    });
  }
}

function findDocxPageSections(container: HTMLElement): HTMLElement[] {
  const wrapper =
    container.querySelector('.docx-preview-wrapper') ?? container.querySelector('.docx-wrapper');
  if (!wrapper) return [];

  return Array.from(wrapper.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.tagName === 'SECTION'
  );
}

function isReachBrandingNode(node: HTMLElement): boolean {
  if (node.closest('[data-reach-bottom-branding]')) return false;
  if (node.querySelector('img, svg, picture')) return true;

  const text = normalizeText(node.textContent || '');
  return /pharmegic healthcare|jasstin|lithuania/i.test(text);
}

function tightenReachPreviewVerticalSpacing(root: HTMLElement): void {
  root.querySelectorAll('p').forEach((p) => {
    if (!(p instanceof HTMLElement)) return;
    const text = normalizeText(p.textContent || '');
    if (!text) {
      p.style.display = 'none';
      p.style.margin = '0';
      p.style.minHeight = '0';
      p.style.lineHeight = '0';
    }
  });

  root.querySelectorAll('[data-reach-manufacturer-card]').forEach((card) => {
    if (card instanceof HTMLElement) {
      card.style.margin = '8px 0 10px';
      card.style.padding = '10px 14px 12px';
    }
  });
}

function layoutReachBottomBranding(brandingHost: HTMLElement): void {
  brandingHost.querySelectorAll('img, svg, picture').forEach((asset) => {
    if (!(asset instanceof HTMLElement)) return;
    asset.style.maxHeight = '110px';
    asset.style.width = 'auto';
    asset.style.objectFit = 'contain';
    asset.style.display = 'block';
  });

  const children = Array.from(brandingHost.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement
  );
  if (children.length >= 2) {
    children[0].style.flex = '1 1 auto';
    children[children.length - 1].style.flex = '0 0 auto';
    children[children.length - 1].style.marginLeft = 'auto';
  }
}

function ensureReachBottomBrandingHost(page: HTMLElement): HTMLElement {
  const existing = page.querySelector('[data-reach-bottom-branding]');
  if (existing instanceof HTMLElement) return existing;

  const host = document.createElement('div');
  host.setAttribute('data-reach-bottom-branding', 'true');
  Object.assign(host.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    margin: '4px 0 0',
    padding: '0 8px',
    minHeight: '110px',
    boxSizing: 'border-box',
    width: '100%',
  });

  const footer = page.querySelector('footer');
  if (footer) {
    page.insertBefore(host, footer);
  } else {
    const article = page.querySelector('article');
    (article ?? page).appendChild(host);
  }

  return host;
}

function moveNodeIntoBrandingHost(node: HTMLElement, host: HTMLElement): void {
  if (node.closest('[data-reach-bottom-branding]') === host) return;
  if (node === host) return;
  host.appendChild(node);
}

/** Pull logo/seal graphics from overflow pages back onto page 1 (before footer). */
function consolidateReachDocxPreviewPages(container: HTMLElement): void {
  const pages = findDocxPageSections(container);
  if (pages.length === 0) return;

  const firstPage = pages[0];
  const firstArticle = firstPage.querySelector('article');
  if (!firstArticle) return;

  tightenReachPreviewVerticalSpacing(firstArticle);
  const brandingHost = ensureReachBottomBrandingHost(firstPage);

  for (let i = 1; i < pages.length; i++) {
    const page = pages[i];
    const article = page.querySelector('article');
    if (!article) {
      page.style.display = 'none';
      continue;
    }

    Array.from(article.children).forEach((child) => {
      if (child instanceof HTMLElement) {
        moveNodeIntoBrandingHost(child, brandingHost);
      }
    });
    page.style.display = 'none';
  }

  const articleBrandingCandidates = Array.from(firstArticle.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && isReachBrandingNode(child)
  );
  articleBrandingCandidates.forEach((node) => moveNodeIntoBrandingHost(node, brandingHost));

  if (brandingHost.childElementCount === 0) {
    brandingHost.remove();
    return;
  }

  layoutReachBottomBranding(brandingHost);
  firstPage.style.minHeight = 'auto';
  firstPage.style.height = 'auto';
  firstPage.style.overflow = 'visible';
}

/** Rebuild manufacturer info cards when docx-preview omits Word drawing/VML shapes. */
export function applyReachDocxPreviewStyles(container: HTMLElement): void {
  const paragraphs = Array.from(container.querySelectorAll('p')).filter(
    (p): p is HTMLParagraphElement => p instanceof HTMLParagraphElement
  );

  const isReachCertificate = paragraphs.some((p) =>
    /NON-EU\s+MANUFACTURER/i.test(normalizeText(p.textContent || ''))
  );

  hideDuplicateManufacturerBlocks(paragraphs);

  for (let i = 0; i < paragraphs.length; i++) {
    if (paragraphs[i].style.display === 'none') continue;

    const text = normalizeText(paragraphs[i].textContent || '');
    if (!/NON-EU\s+MANUFACTURER/i.test(text)) continue;

    const cardParagraphs = collectManufacturerCardParagraphs(paragraphs, i);
    if (cardParagraphs.length === 0) continue;

    wrapManufacturerCard(cardParagraphs);
    i += cardParagraphs.length - 1;
  }

  container.querySelectorAll('td, th').forEach((cell) => {
    if (!(cell instanceof HTMLElement)) return;
    const text = normalizeText(cell.innerText || cell.textContent || '').toLowerCase();
    if (text !== 'substance name') return;

    const nextCell = cell.nextElementSibling;
    if (!(nextCell instanceof HTMLElement)) return;

    const p = nextCell.querySelector('p');
    if (!p) return;

    const chemName = normalizeText(p.innerText || p.textContent || '');
    if (chemName.length >= 60) {
      p.style.marginTop = '-5px';
      p.style.marginBottom = '-2px';
      p.style.lineHeight = '1.1';
    }
  });

  if (isReachCertificate) {
    consolidateReachDocxPreviewPages(container);
  }
}
