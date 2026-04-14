/**
 * components.js — Reusable UI components
 * Anime cards, detail modal, filter panel, carousels, skeletons
 */

import { el, formatScore, formatNumber, truncate, formatDate, escapeHtml, $, $$ } from './utils.js';
import { favorites, favoritesCache } from './db.js';
import { CONSUMET_API_BASE } from './config.js';

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
        } else {
            await favorites.add(anime);
            favBtn.classList.add('anime-card__fav--active');
            favBtn.title = 'Remove from favorites';
            favBtn.textContent = '♥';
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

    for (let i = 0; i < animeList.length; i++) {
        track.appendChild(createAnimeCard(animeList[i], onCardClick, i));
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
        ['Status', formatStatusLabel(anime.status)],
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
                    el('div', { className: 'modal__actions' },
                        createWatchButton(anime),
                        createModalFavButton(anime),
                    ),
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
        } else {
            await favorites.add(anime);
            btn.className = 'btn btn--outline modal__fav-btn modal__fav-btn--active';
            btn.textContent = '♥ Favorited';
        }
        // Sync visible card fav buttons
        document.querySelectorAll(`.anime-card__fav[data-mal-id="${anime.mal_id}"]`).forEach(b => {
            const nowFav = favoritesCache.has(anime.mal_id);
            b.classList.toggle('anime-card__fav--active', nowFav);
            b.textContent = nowFav ? '♥' : '♡';
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
        autoplay: true,
        playsinline: true,
        id: 'animePlayer',
        crossOrigin: 'anonymous',
        controlsList: 'nofullscreen',
    });

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
 * Only shows for types likely available on AnimeKai.
 */
export function createWatchButton(anime) {
    // Types unlikely to be on AnimeKai
    const type = (anime.type || '').toLowerCase();
    const excludedTypes = ['music'];
    if (excludedTypes.includes(type)) return null;

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

