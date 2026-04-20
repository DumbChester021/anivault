/**
 * components.js — Reusable UI components
 * Anime cards, detail modal, filter panel, carousels, skeletons
 */

import { el, formatScore, formatNumber, truncate, formatDate, escapeHtml, $, $$, showToast } from './utils.js';
import { favorites, favoritesCache } from './db.js';
import { CONSUMET_API_BASE } from './config.js';

// ─── Interaction Helpers (heart burst, haptic) ───────────────────────

/** Trigger a short haptic vibration on mobile */
function triggerHaptic(pattern = [15]) {
    if (navigator.vibrate) navigator.vibrate(pattern);
}

/** Spawn floating heart particles from a button element */
function spawnHeartBurst(btn) {
    const container = btn.closest('.anime-card__image-wrap') || btn.parentElement;
    if (!container) return;

    const burst = el('div', { className: 'heart-burst' });
    const particles = ['♥', '♥', '❤', '♥', '💗', '♥'];
    const count = 6;

    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.6;
        const dist = 18 + Math.random() * 14;
        const px = Math.cos(angle) * dist;
        const py = Math.sin(angle) * dist;
        const dur = 0.5 + Math.random() * 0.3;

        const p = el('span', {
            className: 'heart-burst__particle',
            style: `--px:${px}px;--py:${py}px;--burst-duration:${dur}s;`,
        }, particles[i % particles.length]);
        burst.appendChild(p);
    }

    // Position burst at button center within container
    const cRect = container.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    burst.style.left = (bRect.left - cRect.left + bRect.width / 2) + 'px';
    burst.style.top = (bRect.top - cRect.top + bRect.height / 2) + 'px';
    burst.style.width = '0';
    burst.style.height = '0';

    container.appendChild(burst);
    setTimeout(() => burst.remove(), 900);
}

/** Trigger pop/unpop animation class on an element */
function triggerAnim(el, className, duration = 500) {
    el.classList.remove(className);
    // Force reflow so re-adding the class restarts the animation
    void el.offsetWidth;
    el.classList.add(className);
    setTimeout(() => el.classList.remove(className), duration);
}

/** Extract YouTube video ID from an embed URL */
function extractYouTubeId(url) {
    if (!url) return null;
    const m = url.match(/\/embed\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
}

function formatStatusLabel(st) {
    if (!st) return '';
    const l = st.toLowerCase();
    if (l === 'finished airing') return 'Completed';
    if (l === 'currently airing') return 'Ongoing';
    if (l === 'not yet aired') return 'Upcoming';
    return st;
}

// ─── Anime Card ──────────────────────────────────────────────────────

/**
 * Build a compact anime card element.
 * @param {Object} anime — Jikan anime object
 * @param {Function} onClick — callback(anime)
 */
export function createAnimeCard(anime, onClick, index = 0) {
    const img = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '';
    const title = anime.title_english || anime.title || '';
    const score = formatScore(anime.score);
    const episodes = anime.episodes ? `${anime.episodes} eps` : '';
    const type = anime.type || '';
    const status = formatStatusLabel(anime.status);

    // Season info for TV series (e.g. "Winter 2024")
    let seasonText = '';
    if (anime.season && anime.year) {
        seasonText = `${anime.season.charAt(0).toUpperCase() + anime.season.slice(1)} ${anime.year}`;
    } else if (anime.year) {
        seasonText = `${anime.year}`;
    }

    const imgEl = el('img', {
        className: 'anime-card__image',
        src: img,
        alt: title,
        loading: 'lazy',
    });
    imgEl.onerror = function () {
        this.onerror = null;
        this.style.display = 'none';
        const fallback = el('div', { className: 'anime-card__image anime-card__image--fallback' }, '🎬');
        this.parentNode.appendChild(fallback);
    };

    const isFav = favoritesCache.has(anime.mal_id);
    const favBtn = el('button', {
        className: `anime-card__fav${isFav ? ' anime-card__fav--active' : ''}`,
        title: isFav ? 'Remove from favorites' : 'Add to favorites',
        dataset: { malId: String(anime.mal_id) },
    }, isFav ? '♥' : '♡');

    favBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (favoritesCache.has(anime.mal_id)) {
            await favorites.remove(anime.mal_id);
            favBtn.classList.remove('anime-card__fav--active');
            favBtn.title = 'Add to favorites';
            favBtn.textContent = '♡';
            triggerAnim(favBtn, 'anime-card__fav--unpop', 350);
            triggerHaptic([10]);
            showToast(`Removed from favorites`, 'info', 2000);
        } else {
            await favorites.add(anime);
            favBtn.classList.add('anime-card__fav--active');
            favBtn.title = 'Remove from favorites';
            favBtn.textContent = '♥';
            triggerAnim(favBtn, 'anime-card__fav--pop', 500);
            spawnHeartBurst(favBtn);
            triggerHaptic([10, 30, 15]);
            showToast(`Added to favorites`, 'success', 2000);
        }
        document.dispatchEvent(new CustomEvent('favoritesUpdated'));
    });

    const card = el('div', { className: 'anime-card', style: `--i:${index}`, dataset: { malId: anime.mal_id } },
        el('div', { className: 'anime-card__image-wrap' },
            imgEl,
            score !== 'N/A'
                ? el('span', { className: 'anime-card__score' }, `★ ${score}`)
                : null,
            type
                ? el('span', { className: 'anime-card__type' }, type)
                : null,
            favBtn,
        ),
        el('div', { className: 'anime-card__body' },
            el('h3', { className: 'anime-card__title', title }, title),
            el('div', { className: 'anime-card__meta' },
                episodes ? el('span', {}, episodes) : null,
                seasonText ? el('span', { className: 'anime-card__season' }, seasonText) : null,
                status ? el('span', { className: `anime-card__status anime-card__status--${status.toLowerCase().replace(/\s+/g, '')}` }, status) : null,
            ),
        ),
    );

    card.addEventListener('click', () => onClick?.(anime));
    return card;
}

// ─── Skeleton Card ───────────────────────────────────────────────────

export function createSkeletonCard() {
    return el('div', { className: 'anime-card anime-card--skeleton' },
        el('div', { className: 'anime-card__image-wrap skeleton-pulse' }),
        el('div', { className: 'anime-card__body' },
            el('div', { className: 'skeleton-line skeleton-pulse', style: 'width:80%;height:16px;margin-bottom:8px' }),
            el('div', { className: 'skeleton-line skeleton-pulse', style: 'width:50%;height:12px' }),
        ),
    );
}

/**
 * Insert `count` skeleton cards into a container.
 */
export function showSkeletons(container, count = 12) {
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        container.appendChild(createSkeletonCard());
    }
}

// ─── Horizontal Carousel ─────────────────────────────────────────────

/**
 * Create a scrollable horizontal carousel section.
 * @param {string} title — section heading
 * @param {Array} animeList — array of Jikan anime objects
 * @param {Function} onCardClick
 */
export function createCarousel(title, animeList, onCardClick) {
    const track = el('div', { className: 'carousel__track' });

    // Deduplicate by mal_id to guard against API returning duplicate entries
    const seen = new Set();
    const unique = animeList.filter(a => {
        if (!a.mal_id || seen.has(a.mal_id)) return false;
        seen.add(a.mal_id);
        return true;
    });

    for (let i = 0; i < unique.length; i++) {
        track.appendChild(createAnimeCard(unique[i], onCardClick, i));
    }

    const leftBtn = el('button', {
        className: 'carousel__arrow carousel__arrow--left',
        'aria-label': 'Scroll left',
        onClick: () => { track.scrollBy({ left: -600, behavior: 'smooth' }); },
    }, '‹');

    const rightBtn = el('button', {
        className: 'carousel__arrow carousel__arrow--right',
        'aria-label': 'Scroll right',
        onClick: () => { track.scrollBy({ left: 600, behavior: 'smooth' }); },
    }, '›');

    /** Update disabled state of both arrow buttons based on scroll position */
    function syncArrows() {
        const threshold = 4; // sub-pixel tolerance
        const atStart = track.scrollLeft <= threshold;
        const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - threshold;

        leftBtn.disabled = atStart;
        leftBtn.classList.toggle('carousel__arrow--disabled', atStart);
        rightBtn.disabled = atEnd;
        rightBtn.classList.toggle('carousel__arrow--disabled', atEnd);
    }

    // Listen for scroll & resize to keep arrows synced
    track.addEventListener('scroll', syncArrows, { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(syncArrows).observe(track);
    }
    // Initial sync after cards render
    requestAnimationFrame(syncArrows);

    const section = el('section', { className: 'carousel' },
        el('div', { className: 'carousel__header' },
            el('h2', { className: 'carousel__title' }, title),
            el('div', { className: 'carousel__arrows' }, leftBtn, rightBtn),
        ),
        track,
    );

    return section;
}

export function createCarouselSkeleton(title) {
    const track = el('div', { className: 'carousel__track' });
    for (let i = 0; i < 8; i++) track.appendChild(createSkeletonCard());

    return el('section', { className: 'carousel' },
        el('div', { className: 'carousel__header' },
            el('h2', { className: 'carousel__title' }, title),
        ),
        track,
    );
}

// ─── Hero Banner ─────────────────────────────────────────────────────

export function createHeroBanner(anime, onCardClick) {
    if (!anime) return el('div');
    const img = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '';
    const title = anime.title_english || anime.title || '';
    const synopsis = truncate(anime.synopsis, 220);

    const hero = el('div', { className: 'hero', style: `background-image:url('${img}')` },
        el('div', { className: 'hero__overlay' },
            el('div', { className: 'hero__content' },
                el('span', { className: 'hero__badge' }, 'Trending Now'),
                el('h1', { className: 'hero__title' }, title),
                el('p', { className: 'hero__synopsis' }, synopsis),
                el('div', { className: 'hero__meta' },
                    anime.score ? el('span', { className: 'hero__score' }, `★ ${formatScore(anime.score)}`) : null,
                    anime.type ? el('span', {}, anime.type) : null,
                    anime.episodes ? el('span', {}, `${anime.episodes} eps`) : null,
                ),
                el('button', { className: 'btn btn--primary hero__btn', onClick: () => onCardClick?.(anime) }, 'View Details'),
            ),
        ),
    );
    return hero;
}

// ─── Results Grid ────────────────────────────────────────────────────

export function createResultsGrid(animeList, onCardClick) {
    const grid = el('div', { className: 'results-grid' });
    for (let i = 0; i < animeList.length; i++) {
        grid.appendChild(createAnimeCard(animeList[i], onCardClick, i));
    }
    return grid;
}

// ─── Pagination / Load More ──────────────────────────────────────────

export function createPaginationInfo(pagination) {
    if (!pagination) return el('div');
    const current = pagination.current_page || 1;
    const last = pagination.last_visible_page || 1;
    const total = pagination.items?.total || '?';

    return el('div', { className: 'pagination-info' },
        el('span', {}, `Page ${current} of ${last} — ${formatNumber(total)} results`),
    );
}

export function createLoadMoreBtn(onClick) {
    return el('button', { className: 'btn btn--secondary load-more-btn', onClick }, 'Load More');
}

// ─── Anime Detail Modal ──────────────────────────────────────────────

export function openDetailModal(anime, recommendations = [], loading = false) {
    // Close existing
    closeDetailModal();

    const img = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '';
    const title = anime.title_english || anime.title || '';
    const titleJp = anime.title_japanese || '';
    const synopsis = anime.synopsis || 'No synopsis available.';

    // Poster element — skeleton when loading, image with fallback otherwise
    let posterContent;
    if (loading) {
        posterContent = el('div', { className: 'modal__poster-skeleton skeleton-pulse' });
    } else {
        const posterImg = el('img', { src: img, alt: title, loading: 'lazy' });
        posterImg.onerror = function () {
            this.onerror = null;
            this.style.display = 'none';
            const fallback = el('div', { className: 'modal__poster-fallback' }, '🎬');
            this.parentNode.appendChild(fallback);
        };
        posterContent = posterImg;
    }

    // Genre tags — skeleton placeholders when loading
    let genreTags;
    if (loading) {
        genreTags = el('div', { className: 'detail__genres' },
            el('span', { className: 'skeleton-tag skeleton-pulse' }),
            el('span', { className: 'skeleton-tag skeleton-pulse' }),
            el('span', { className: 'skeleton-tag skeleton-pulse' }),
        );
    } else {
        genreTags = el('div', { className: 'detail__genres' });
        for (const g of (anime.genres || [])) {
            genreTags.appendChild(el('span', { className: 'tag' }, g.name));
        }
        for (const g of (anime.themes || [])) {
            genreTags.appendChild(el('span', { className: 'tag tag--theme' }, g.name));
        }
        for (const d of (anime.demographics || [])) {
            genreTags.appendChild(el('span', { className: 'tag tag--demo' }, d.name));
        }
    }

    // Info table — skeleton rows when loading
    let infoTable;
    if (loading) {
        infoTable = el('table', { className: 'detail__info-table detail__info-table--loading' });
        for (let i = 0; i < 5; i++) {
            infoTable.appendChild(el('tr', {},
                el('td', { className: 'detail__info-label' },
                    el('span', { className: 'skeleton-line skeleton-pulse', style: 'width:60px;height:13px;display:block' }),
                ),
                el('td', {},
                    el('span', { className: 'skeleton-line skeleton-pulse', style: `width:${80 + i * 15}px;height:13px;display:block` }),
                ),
            ));
        }
    } else {
        const infoRows = [
            ['Type', anime.type],
            ['Episodes', anime.episodes ?? '—'],
            ['Status', formatStatusLabel(anime.status)],
            ['Aired', anime.aired?.string || '—'],
            ['Rating', anime.rating],
            ['Source', anime.source],
            ['Studios', (anime.studios || []).map(s => s.name).join(', ') || '—'],
            ['Duration', anime.duration],
        ];
        infoTable = el('table', { className: 'detail__info-table' });
        for (const [label, value] of infoRows) {
            if (value) {
                infoTable.appendChild(el('tr', {},
                    el('td', { className: 'detail__info-label' }, label),
                    el('td', {}, String(value)),
                ));
            }
        }
    }

    // Stats row — skeleton badges when loading
    const statsRow = loading
        ? el('div', { className: 'detail__stats detail__stats--loading' },
            ...Array(5).fill(null).map(() =>
                el('div', { className: 'stat-badge--skeleton skeleton-pulse' }),
            ),
        )
        : el('div', { className: 'detail__stats' },
            createStatBadge('Score', formatScore(anime.score)),
            createStatBadge('Rank', anime.rank ? `#${anime.rank}` : '—'),
            createStatBadge('Popularity', anime.popularity ? `#${anime.popularity}` : '—'),
            createStatBadge('Members', formatNumber(anime.members)),
            createStatBadge('Favorites', formatNumber(anime.favorites)),
        );

    // Action buttons — skeleton placeholders when loading
    const actionsEl = loading
        ? el('div', { className: 'modal__actions modal__actions--loading' },
            el('div', { className: 'skeleton-btn skeleton-pulse' }),
            el('div', { className: 'skeleton-btn skeleton-pulse' }),
        )
        : el('div', { className: 'modal__actions' },
            createWatchButton(anime),
            createModalFavButton(anime),
        );

    // Title — skeleton line when loading
    const titleEl = loading
        ? el('div', { className: 'skeleton-line skeleton-pulse modal__title-skeleton' })
        : el('h2', { className: 'modal__title' }, title);

    // Synopsis — skeleton lines when loading
    const synopsisEl = loading
        ? el('div', { className: 'detail__synopsis' },
            el('h3', {}, 'Synopsis'),
            el('div', { className: 'skeleton-line skeleton-pulse', style: 'width:100%;height:13px;margin-bottom:8px' }),
            el('div', { className: 'skeleton-line skeleton-pulse', style: 'width:92%;height:13px;margin-bottom:8px' }),
            el('div', { className: 'skeleton-line skeleton-pulse', style: 'width:97%;height:13px;margin-bottom:8px' }),
            el('div', { className: 'skeleton-line skeleton-pulse', style: 'width:85%;height:13px' }),
        )
        : el('div', { className: 'detail__synopsis' },
            el('h3', {}, 'Synopsis'),
            el('p', {}, synopsis),
        );

    let trailerEl = null;
    if (!loading) {
        const youtubeId = anime.trailer?.youtube_id || extractYouTubeId(anime.trailer?.embed_url);
        if (youtubeId) {
            const ytUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
            const thumbUrl = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
            const wrap = el('div', { className: 'detail__trailer-wrap detail__trailer-thumb' });
            const thumb = el('img', { src: thumbUrl, alt: 'Trailer thumbnail', loading: 'lazy' });
            const playBtn = el('div', { className: 'detail__trailer-play' },
                el('svg', { viewBox: '0 0 68 48', xmlns: 'http://www.w3.org/2000/svg' },
                    el('path', { d: 'M66.5 7.7c-.8-2.9-3-5.2-5.9-5.9C55.8 0 34 0 34 0S12.2 0 7.4 1.8C4.5 2.6 2.3 4.9 1.5 7.7 0 12.6 0 24 0 24s0 11.4 1.5 16.3c.8 2.9 3 5.2 5.9 5.9C12.2 48 34 48 34 48s21.8 0 26.6-1.8c2.9-.8 5.1-3 5.9-5.9C68 35.4 68 24 68 24s0-11.4-1.5-16.3z', fill: '#ff0000' }),
                    el('path', { d: 'M45 24 27 14v20', fill: '#fff' }),
                ),
            );
            wrap.appendChild(thumb);
            wrap.appendChild(playBtn);
            wrap.addEventListener('click', () => window.open(ytUrl, '_blank', 'noopener'));
            trailerEl = el('div', { className: 'detail__trailer' },
                el('h3', {}, 'Trailer'),
                wrap,
            );
        }
    }

    // Recommendations
    let recsEl = null;
    if (!loading && recommendations.length > 0) {
        const recsTrack = el('div', { className: 'carousel__track' });
        for (const rec of recommendations.slice(0, 12)) {
            const entry = rec.entry;
            if (entry) {
                recsTrack.appendChild(createAnimeCard(entry, (a) => {
                    // Re-open modal with new anime — handled by app.js
                    document.dispatchEvent(new CustomEvent('openAnimeDetail', { detail: { id: a.mal_id } }));
                }));
            }
        }
        recsEl = el('section', { className: 'detail__recs' },
            el('h3', {}, 'Recommendations'),
            recsTrack,
        );
    }

    const modal = el('div', { className: 'modal-overlay', id: 'detailModal' },
        el('div', { className: 'modal' },
            el('button', { className: 'modal__close', onClick: closeDetailModal, 'aria-label': 'Close' }, '✕'),
            el('div', { className: 'modal__header' },
                el('div', { className: 'modal__poster' },
                    posterContent,
                ),
                el('div', { className: 'modal__header-info' },
                    titleEl,
                    !loading && titleJp ? el('p', { className: 'modal__title-jp' }, titleJp) : null,
                    statsRow,
                    genreTags,
                    actionsEl,
                ),
            ),
            el('div', { className: 'modal__body' },
                infoTable,
                !loading ? buildFranchiseSection(anime) : null,
                synopsisEl,
                trailerEl,
                recsEl,
            ),
        ),
    );

    // Click outside to close
    modal.addEventListener('click', e => {
        if (e.target === modal) closeDetailModal();
    });

    document.body.appendChild(modal);
    document.body.classList.add('modal-open');

    // Animate in
    requestAnimationFrame(() => modal.classList.add('modal-overlay--visible'));

    // Close on Escape
    const onEsc = (e) => {
        if (e.key === 'Escape') {
            closeDetailModal();
            document.removeEventListener('keydown', onEsc);
        }
    };
    document.addEventListener('keydown', onEsc);
}

function buildFranchiseSection(anime) {
    const relations = anime.relations || [];
    // Filter for sequel/prequel/side story/alternative — i.e. "franchise" entries
    const franchiseTypes = ['Sequel', 'Prequel', 'Side Story', 'Parent Story', 'Alternative Version', 'Spin-Off'];
    const franchiseEntries = [];

    for (const rel of relations) {
        if (franchiseTypes.includes(rel.relation)) {
            for (const entry of (rel.entry || [])) {
                if (entry.type === 'anime') {
                    franchiseEntries.push({ ...entry, relation: rel.relation });
                }
            }
        }
    }

    if (franchiseEntries.length === 0) return null;

    // Count sequels specifically to show "X Seasons"
    const sequelCount = relations.filter(r => r.relation === 'Sequel' || r.relation === 'Prequel').length;
    const seasonLabel = sequelCount > 0
        ? ` (${sequelCount + 1} Seasons)`
        : '';

    const section = el('div', { className: 'detail__franchise' },
        el('h3', {}, `Seasons & Related${seasonLabel}`),
        el('div', { className: 'franchise-list' }),
    );

    const list = section.querySelector('.franchise-list');
    for (const entry of franchiseEntries) {
        const item = el('a', {
            className: 'franchise-item',
            href: '#',
            onClick: (e) => {
                e.preventDefault();
                document.dispatchEvent(new CustomEvent('openAnimeDetail', { detail: { id: entry.mal_id } }));
            },
        },
            el('span', { className: 'franchise-item__relation' }, entry.relation),
            el('span', { className: 'franchise-item__name' }, entry.name),
        );
        list.appendChild(item);
    }

    return section;
}

function createStatBadge(label, value) {
    return el('div', { className: 'stat-badge' },
        el('span', { className: 'stat-badge__value' }, value),
        el('span', { className: 'stat-badge__label' }, label),
    );
}

function createModalFavButton(anime) {
    const isFav = favoritesCache.has(anime.mal_id);
    const btn = el('button', {
        className: `btn btn--outline modal__fav-btn${isFav ? ' modal__fav-btn--active' : ''}`,
    }, isFav ? '♥ Favorited' : '♡ Favorite');

    btn.addEventListener('click', async () => {
        if (favoritesCache.has(anime.mal_id)) {
            await favorites.remove(anime.mal_id);
            btn.className = 'btn btn--outline modal__fav-btn';
            btn.textContent = '♡ Favorite';
            triggerAnim(btn, 'modal__fav-btn--unpop', 400);
            triggerHaptic([10]);
            showToast(`Removed from favorites`, 'info', 2000);
        } else {
            await favorites.add(anime);
            btn.className = 'btn btn--outline modal__fav-btn modal__fav-btn--active';
            btn.textContent = '♥ Favorited';
            triggerAnim(btn, 'modal__fav-btn--pop', 550);
            triggerHaptic([10, 30, 15]);
            showToast(`Added to favorites`, 'success', 2000);
        }
        // Sync visible card fav buttons
        document.querySelectorAll(`.anime-card__fav[data-mal-id="${anime.mal_id}"]`).forEach(b => {
            const nowFav = favoritesCache.has(anime.mal_id);
            b.classList.toggle('anime-card__fav--active', nowFav);
            b.textContent = nowFav ? '♥' : '♡';
            // Mirror pop/unpop on synced card buttons
            triggerAnim(b, nowFav ? 'anime-card__fav--pop' : 'anime-card__fav--unpop', 500);
        });
        document.dispatchEvent(new CustomEvent('favoritesUpdated'));
    });

    return btn;
}

export function closeDetailModal() {
    const modal = $('#detailModal');
    if (modal) {
        modal.classList.remove('modal-overlay--visible');
        setTimeout(() => {
            modal.remove();
            document.body.classList.remove('modal-open');
        }, 300);
    }
}

// ─── Filter Chips (genre multi-select) ───────────────────────────────

/**
 * Render genre chips inside a container.
 * @param {HTMLElement} container
 * @param {Array} genres — [{mal_id, name}, ...]
 * @param {Set} selected — set of selected mal_id numbers
 * @param {Function} onToggle — (genreId, isSelected) => void
 */
export function renderGenreChips(container, genres, selected, onToggle) {
    container.innerHTML = '';
    for (const genre of genres) {
        const isOn = selected.has(genre.mal_id);
        const chip = el('button', {
            className: `genre-chip ${isOn ? 'genre-chip--active' : ''}`,
            dataset: { genreId: genre.mal_id },
            onClick: () => {
                const nowOn = !selected.has(genre.mal_id);
                if (nowOn) selected.add(genre.mal_id);
                else selected.delete(genre.mal_id);
                chip.classList.toggle('genre-chip--active', nowOn);
                onToggle?.(genre.mal_id, nowOn);
            },
        }, genre.name);
        container.appendChild(chip);
    }
}

// ─── Error Display ───────────────────────────────────────────────────

export function createErrorCard(message, onRetry) {
    return el('div', { className: 'error-card' },
        el('div', { className: 'error-card__icon' }, '⚠'),
        el('p', { className: 'error-card__msg' }, message),
        onRetry
            ? el('button', { className: 'btn btn--primary', onClick: onRetry }, 'Retry')
            : null,
    );
}

// ─── Empty State ─────────────────────────────────────────────────────

export function createEmptyState(message = 'No results found') {
    return el('div', { className: 'empty-state' },
        el('div', { className: 'empty-state__icon' }, '🔍'),
        el('p', {}, message),
    );
}

// ─── Watch Page Components ───────────────────────────────────────────

/**
 * Create a search result item for the watch page (AnimeKai result).
 */
export function createWatchSearchItem(anime, onClick) {
    const hasDub = anime.subOrDub === 'dub' || anime.subOrDub === 'both';
    const item = el('div', { className: 'watch-search-item' },
        el('img', {
            className: 'watch-search-item__poster',
            src: anime.image || '',
            alt: anime.title || '',
            loading: 'lazy',
        }),
        el('div', { className: 'watch-search-item__info' },
            el('h4', { className: 'watch-search-item__name' }, anime.title || ''),
            el('div', { className: 'watch-search-item__meta' },
                anime.type ? el('span', { className: 'tag' }, anime.type) : null,
                hasDub ? el('span', { className: 'text-accent' }, 'DUB') : null,
            ),
        ),
    );
    item.addEventListener('click', () => onClick?.(anime));
    return item;
}

/**
 * Create the anime header for the watch sidebar.
 */
export function createWatchAnimeHeader(anime) {
    return el('div', { className: 'watch-anime-card' },
        anime.image
            ? el('img', {
                className: 'watch-anime-card__poster',
                src: anime.image,
                alt: anime.title || '',
                loading: 'lazy',
            })
            : null,
        el('div', { className: 'watch-anime-card__info' },
            el('h3', { className: 'watch-anime-card__name' }, anime.title || ''),
            el('button', {
                className: 'btn btn--outline btn--sm watch-anime-card__back',
                onClick: () => document.dispatchEvent(new CustomEvent('watchReset')),
            }, '← Change Anime'),
        ),
    );
}

/**
 * Create an episode list item.
 */
export function createEpisodeItem(ep, isActive, onClick, onDownload) {
    const classes = `episode-item${isActive ? ' episode-item--active' : ''}${ep.isFiller ? ' episode-item--filler' : ''}`;
    const dlBtn = el('button', {
        className: 'episode-item__dl-btn',
        title: `Download ep ${ep.number}`,
        'aria-label': `Download episode ${ep.number}`,
    }, '⬇');
    dlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onDownload?.(ep, dlBtn);
    });
    const item = el('div', { className: classes, dataset: { epId: ep.id } },
        el('span', { className: 'episode-item__number' }, `${ep.number}`),
        el('span', { className: 'episode-item__title' }, ep.title || `Episode ${ep.number}`),
        ep.isFiller ? el('span', { className: 'episode-item__filler-tag' }, 'Filler') : null,
        dlBtn,
    );
    item.addEventListener('click', () => onClick?.(ep));
    return item;
}

/**
 * Create a video player element for HLS or MP4 sources.
 * HLS initialization is done by the caller using HLS.js.
 * @param {Array<{url: string, isM3U8: boolean}>} sources
 */
export function createVideoPlayer(sources, subtitles = [], isSub = true) {
    const m3u8 = sources.find(s => s.isM3U8);
    const mp4 = sources.find(s => !s.isM3U8);
    const src = m3u8?.url || mp4?.url || '';

    const video = el('video', {
        className: 'player-video',
        controls: true,
        playsinline: true,
        id: 'animePlayer',
        crossOrigin: 'anonymous',
    });
    // Set muted as a property (not just attribute) — required for autoplay on mobile
    video.muted = true;

    // Player settings (volume, captions, speed) are handled automatically by Plyr storage settings in app.js

    if (m3u8) {
        video.dataset.hlsSrc = m3u8.url;
    } else {
        video.src = src;
    }

    // Add subtitle tracks
    for (const sub of subtitles) {
        if (!sub?.url || sub?.lang?.toLowerCase() === 'thumbnails') continue;
        
        // Route subtitles through proxy to fix potential CORS 403 blocks
        const proxyUrl = `${CONSUMET_API_BASE}/utils/cors?url=${encodeURIComponent(sub.url)}`;
        
        const isEnglish = sub.lang?.toLowerCase() === 'english';
        const shouldBeDefault = isSub && isEnglish;
        
        const trackEl = el('track', {
            kind: 'captions',
            label: sub.lang || 'English',
            srclang: sub.lang?.substring(0, 2).toLowerCase() || 'en',
            src: proxyUrl,
            default: shouldBeDefault ? true : undefined
        });
        
        video.appendChild(trackEl);
        
        if (shouldBeDefault) {
            // Force browser to enable the dynamically added text track
            setTimeout(() => {
                if (trackEl.track) {
                    trackEl.track.mode = 'showing';
                }
            }, 0);
        }
    }

    return video;
}

/**
 * Create a "Watch" button for the detail modal.
 * Shows air date / "Coming Soon" for upcoming anime instead.
 * Only shows for types likely available on AnimeKai.
 */
export function createWatchButton(anime) {
    // Types unlikely to be on AnimeKai
    const type = (anime.type || '').toLowerCase();
    const excludedTypes = ['music'];
    if (excludedTypes.includes(type)) return null;

    // Upcoming anime — show air date or "Coming Soon" instead of Watch
    const statusLower = (anime.status || '').toLowerCase();
    if (statusLower === 'not yet aired') {
        let label = 'Coming Soon';
        if (anime.aired?.from) {
            try {
                const airDate = new Date(anime.aired.from);
                label = `📅 ${airDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`;
            } catch { /* fallback to Coming Soon */ }
        } else if (anime.aired?.string && anime.aired.string !== '?') {
            label = `📅 ${anime.aired.string}`;
        }
        return el('span', {
            className: 'btn btn--outline watch-btn watch-btn--upcoming',
            style: 'cursor:default; pointer-events:none; opacity:0.85;',
        }, label);
    }

    // Skip if it has no episodes
    if (anime.episodes === 0) return null;

    const title = anime.title_english || anime.title || '';
    const titleRomaji = anime.title || '';
    return el('button', {
        className: 'btn btn--primary watch-btn',
        onClick: () => {
            document.dispatchEvent(new CustomEvent('navigateToWatch', { detail: { title, titleRomaji } }));
        },
    }, '▶ Watch');
}

/**
 * Create a history card for the Vault.
 */
export function createHistoryCard(entry, onClick, index = 0, isFav = false, onFavClick = null) {
    const title = entry.anime_title || '';
    const img = entry.anime_image || '';
    
    const progressPerc = entry.duration ? Math.min(100, Math.max(0, (entry.time / entry.duration) * 100)) : 0;
    const progressLeft = Math.floor((entry.duration - entry.time) / 60);

    const score = entry.score ? formatScore(entry.score) : '';
    const type = entry.type || '';
    const status = formatStatusLabel(entry.status);
    
    let seasonText = '';
    if (entry.season && entry.year) {
        seasonText = `${entry.season.charAt(0).toUpperCase() + entry.season.slice(1)} ${entry.year}`;
    } else if (entry.year) {
        seasonText = `${entry.year}`;
    }

    const favBtn = el('button', {
        className: `anime-card__fav${isFav ? ' anime-card__fav--active' : ''}`,
        title: isFav ? 'Remove from favorites' : 'Add to favorites',
    }, isFav ? '♥' : '♡');

    favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onFavClick) onFavClick(favBtn, isFav, entry);
    });

    const typeBadges = [];
    if (type) typeBadges.push(el('span', { className: 'anime-card__type', style: 'position:relative; bottom:0; left:0;' }, type));
    if (entry.is_dub) typeBadges.push(el('span', { className: 'anime-card__type', style: 'position:relative; bottom:0; left:0; background:var(--accent); color:white;' }, 'DUB'));

    const badgesContainer = typeBadges.length > 0 
        ? el('div', { style: 'position:absolute; bottom:12px; left:8px; display:flex; gap:4px; z-index:5;' }, ...typeBadges) 
        : null;

    const card = el('div', { className: 'anime-card', style: `--i:${index}` },
        el('div', { className: 'anime-card__image-wrap' },
            el('img', { className: 'anime-card__image', src: img, alt: title, loading: 'lazy' }),
            el('div', { style: 'position:absolute;bottom:0;left:0;right:0;height:4px;background:rgba(0,0,0,0.5);z-index:10;' },
                el('div', { style: `width:${progressPerc}%;height:100%;background:var(--accent);` })
            ),
            score && score !== 'N/A' ? el('span', { className: 'anime-card__score' }, `★ ${score}`) : null,
            badgesContainer,
            favBtn
        ),
        el('div', { className: 'anime-card__body' },
            el('h3', { className: 'anime-card__title', title }, title),
            el('div', { className: 'anime-card__meta' },
                el('span', { className: 'text-accent' }, `Ep ${entry.episode_number}`),
                progressLeft > 1 ? el('span', {}, `${progressLeft}m left`) : el('span', {}, 'Watched'),
                seasonText ? el('span', { className: 'anime-card__season' }, seasonText) : null,
                status ? el('span', { className: `anime-card__status anime-card__status--${status.toLowerCase().replace(/\s+/g, '')}` }, status) : null
            )
        )
    );
    card.addEventListener('click', () => onClick?.(entry));
    return card;
}

/**
 * Create episode details section for the watch page.
 */
export function createWatchDetails(anime, ep, epDetails = null) {
    const title = ep ? `Episode ${ep.number}${ep.title ? `: ${ep.title}` : ''}` : anime.title;
    
    // Use real data, NO dummy data
    const members = typeof anime.members === 'number' ? formatNumber(anime.members) : 'N/A';
    
    const aired = epDetails?.aired || anime.aired?.from;
    const date = aired ? new Date(aired).toLocaleDateString() : 'Unknown date';

    const desc = epDetails?.synopsis || anime.synopsis || 'No synopsis available for this episode.';

    return el('div', {},
        el('h1', { className: 'watch-details__title' }, `${anime.title} — ${title}`),
        el('div', { className: 'watch-details__meta' },
            el('div', { className: 'watch-details__views', title: 'Members' }, el('span', {}, '👥'), el('span', {}, `${members} Members`)),
            anime.score ? el('div', { className: 'watch-details__views', title: 'Score' }, el('span', {}, '⭐'), el('span', {}, `${anime.score}`)) : null,
            el('div', { className: 'watch-details__date' }, el('span', {}, '📅'), el('span', {}, date))
        ),
        el('div', { className: 'watch-details__desc' }, desc)
    );
}

/**
 * Create a comments (reviews) section for the watch page.
 */
export function createWatchComments(reviews = []) {
    const commentsContainer = el('div', {});

    commentsContainer.appendChild(
        el('div', { className: 'watch-comments__header' }, 
            el('span', {}, 'Comments'),
            el('span', { className: 'watch-comments__count' }, (reviews.length || 0).toString())
        )
    );

    commentsContainer.appendChild(
        el('div', { className: 'comment-input-area' },
            el('div', { className: 'comment-input-area__avatar' }, 'U'),
            el('input', { 
                className: 'comment-input-area__field', 
                type: 'text', 
                placeholder: 'Add a comment...' 
            })
        )
    );

    const list = el('div', { className: 'comment-list' });

    if (!reviews || reviews.length === 0) {
        list.appendChild(el('p', { style: 'color: var(--text-muted); font-size: 0.9rem;' }, 'No comments found.'));
    } else {
        for (const review of reviews) {
            const name = review.user?.username || 'Anonymous';
            const avatar = review.user?.images?.jpg?.image_url;
            const text = review.review || '';
            const dateStr = review.date ? new Date(review.date).toLocaleDateString() : 'Unknown date';
            const score = review.score || 0;
            
            list.appendChild(
                el('div', { className: 'comment-item' },
                    avatar 
                        ? el('img', { className: 'comment-item__avatar', style: 'object-fit: cover;', src: avatar })
                        : el('div', { className: 'comment-item__avatar' }, name.charAt(0)),
                    el('div', { className: 'comment-item__content' },
                        el('div', { className: 'comment-item__header' },
                            el('span', { className: 'comment-item__author' }, `@${name}`),
                            el('span', { className: 'comment-item__time' }, dateStr)
                        ),
                        el('div', { className: 'comment-item__text' }, truncate(text, 300)),
                        el('div', { className: 'comment-item__actions' },
                            el('button', { className: 'comment-item__btn', title: 'Score' }, '★', el('span', {}, score.toString()))
                        )
                    )
                )
            );
        }
    }

    commentsContainer.appendChild(list);
    return commentsContainer;
}

