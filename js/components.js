/**
 * components.js — Reusable UI components
 * Anime cards, detail modal, filter panel, carousels, skeletons
 */

import { el, formatScore, formatNumber, truncate, formatDate, escapeHtml, $, $$ } from './utils.js';

// ─── Anime Card ──────────────────────────────────────────────────────

/**
 * Build a compact anime card element.
 * @param {Object} anime — Jikan anime object
 * @param {Function} onClick — callback(anime)
 */
export function createAnimeCard(anime, onClick) {
    const img = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '';
    const title = anime.title_english || anime.title || '';
    const score = formatScore(anime.score);
    const episodes = anime.episodes ? `${anime.episodes} eps` : '';
    const type = anime.type || '';
    const status = anime.status || '';

    // Season info for TV series (e.g. "Winter 2024")
    let seasonText = '';
    if (anime.season && anime.year) {
        seasonText = `${anime.season.charAt(0).toUpperCase() + anime.season.slice(1)} ${anime.year}`;
    } else if (anime.year) {
        seasonText = `${anime.year}`;
    }

    const card = el('div', { className: 'anime-card', dataset: { malId: anime.mal_id } },
        el('div', { className: 'anime-card__image-wrap' },
            el('img', {
                className: 'anime-card__image',
                src: img,
                alt: title,
                loading: 'lazy',
            }),
            score !== 'N/A'
                ? el('span', { className: 'anime-card__score' }, `★ ${score}`)
                : null,
            type
                ? el('span', { className: 'anime-card__type' }, type)
                : null,
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

    for (const anime of animeList) {
        track.appendChild(createAnimeCard(anime, onCardClick));
    }

    const section = el('section', { className: 'carousel' },
        el('div', { className: 'carousel__header' },
            el('h2', { className: 'carousel__title' }, title),
            el('div', { className: 'carousel__arrows' },
                el('button', { className: 'carousel__arrow carousel__arrow--left', 'aria-label': 'Scroll left', onClick: () => { track.scrollBy({ left: -600, behavior: 'smooth' }); } }, '‹'),
                el('button', { className: 'carousel__arrow carousel__arrow--right', 'aria-label': 'Scroll right', onClick: () => { track.scrollBy({ left: 600, behavior: 'smooth' }); } }, '›'),
            ),
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
    for (const anime of animeList) {
        grid.appendChild(createAnimeCard(anime, onCardClick));
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

export function openDetailModal(anime, recommendations = []) {
    // Close existing
    closeDetailModal();

    const img = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '';
    const title = anime.title_english || anime.title || '';
    const titleJp = anime.title_japanese || '';
    const synopsis = anime.synopsis || 'No synopsis available.';

    // Genre tags
    const genreTags = el('div', { className: 'detail__genres' });
    for (const g of (anime.genres || [])) {
        genreTags.appendChild(el('span', { className: 'tag' }, g.name));
    }
    for (const g of (anime.themes || [])) {
        genreTags.appendChild(el('span', { className: 'tag tag--theme' }, g.name));
    }
    for (const d of (anime.demographics || [])) {
        genreTags.appendChild(el('span', { className: 'tag tag--demo' }, d.name));
    }

    // Info table
    const infoRows = [
        ['Type', anime.type],
        ['Episodes', anime.episodes ?? '—'],
        ['Status', anime.status],
        ['Aired', anime.aired?.string || '—'],
        ['Rating', anime.rating],
        ['Source', anime.source],
        ['Studios', (anime.studios || []).map(s => s.name).join(', ') || '—'],
        ['Duration', anime.duration],
    ];

    const infoTable = el('table', { className: 'detail__info-table' });
    for (const [label, value] of infoRows) {
        if (value) {
            infoTable.appendChild(el('tr', {},
                el('td', { className: 'detail__info-label' }, label),
                el('td', {}, String(value)),
            ));
        }
    }

    // Stats row
    const statsRow = el('div', { className: 'detail__stats' },
        createStatBadge('Score', formatScore(anime.score)),
        createStatBadge('Rank', anime.rank ? `#${anime.rank}` : '—'),
        createStatBadge('Popularity', anime.popularity ? `#${anime.popularity}` : '—'),
        createStatBadge('Members', formatNumber(anime.members)),
        createStatBadge('Favorites', formatNumber(anime.favorites)),
    );

    // Trailer
    let trailerEl = null;
    if (anime.trailer?.embed_url) {
        trailerEl = el('div', { className: 'detail__trailer' },
            el('h3', {}, 'Trailer'),
            el('div', { className: 'detail__trailer-wrap' },
                el('iframe', {
                    src: anime.trailer.embed_url.replace('autoplay=1', 'autoplay=0'),
                    frameborder: '0',
                    allowfullscreen: '',
                    allow: 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
                    loading: 'lazy',
                }),
            ),
        );
    }

    // Recommendations
    let recsEl = null;
    if (recommendations.length > 0) {
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
                    el('img', { src: img, alt: title, loading: 'lazy' }),
                ),
                el('div', { className: 'modal__header-info' },
                    el('h2', { className: 'modal__title' }, title),
                    titleJp ? el('p', { className: 'modal__title-jp' }, titleJp) : null,
                    statsRow,
                    genreTags,
                ),
            ),
            el('div', { className: 'modal__body' },
                infoTable,
                buildFranchiseSection(anime),
                el('div', { className: 'detail__synopsis' },
                    el('h3', {}, 'Synopsis'),
                    el('p', {}, synopsis),
                ),
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
