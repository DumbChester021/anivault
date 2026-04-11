/**
 * app.js — Router, page controllers, initialization
 */

import { $, $$, debounce, showToast, el } from './utils.js';
import * as api from './api.js';
import * as streaming from './streaming.js';
import * as db from './db.js';
import { CONSUMET_API_BASE } from './config.js';
import {
    createCarousel, createCarouselSkeleton, createHeroBanner,
    createAnimeCard, showSkeletons, createResultsGrid,
    createPaginationInfo, createLoadMoreBtn,
    openDetailModal, closeDetailModal,
    renderGenreChips, createErrorCard, createEmptyState,
    createSkeletonCard,
    createWatchSearchItem, createWatchAnimeHeader, createEpisodeItem,
    createVideoPlayer, createHistoryCard,
    createWatchDetails, createWatchComments,
} from './components.js';

// ─── State ───────────────────────────────────────────────────────────
const state = {
    currentPage: 'home',
    nsfwEnabled: JSON.parse(localStorage.getItem('anivault_nsfw') || 'false'),
    search: {
        query: '',
        type: '',
        status: '',
        rating: '',
        min_score: '',
        max_score: '',
        genres: new Set(),
        order_by: '',
        sort: 'desc',
        page: 1,
        results: [],
        pagination: null,
        loading: false,
    },
    genresList: [],
    watch: {
        searchQuery: '',
        selectedAnime: null, // { id, title, image, subOrDub, ... } from AnimeKai
        episodes: [],
        currentEpId: null,
        language: 'sub',
        loading: false,
        resumeTime: 0,
    },
};

// ─── Init ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await db.initCache();
    api.setSfwMode(!state.nsfwEnabled);
    setupNav();
    setupCustomDetailEvent();
    setupWatchEvents();
    setupFilterPanel();
    setupNsfwToggle();
    setupBackToTop();
    setupKeyboardShortcuts();
    setupFavoritesListener();

    const initialPage = getPageFromPath(location.pathname);
    if (initialPage === 'search') applySearchParamsFromURL();
    if (initialPage === 'watch') applyWatchParamsFromURL();
    navigateTo(initialPage, { pushState: false });
});

// ─── Navigation ──────────────────────────────────────────────────────
function getPageFromPath(path) {
    if (path.startsWith('/search')) return 'search';
    if (path.startsWith('/watch')) return 'watch';
    if (path.startsWith('/vault')) return 'vault';
    return 'home';
}

function encodeId(id) {
    return btoa(id).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function decodeId(encoded) {
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
        base64 += '=';
    }
    return atob(base64);
}

function updateWatchURL() {
    const s = state.watch;
    if (s.selectedAnime) {
        const titleSlug = (s.selectedAnime.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const encodedId = encodeId(s.selectedAnime.id);
        
        let path = `/watch/${titleSlug}-${encodedId}`;
        
        if (s.currentEpId) {
            const encodedEp = encodeId(s.currentEpId);
            path += `/ep/${encodedEp}`;
        }
        
        history.replaceState({ page: 'watch' }, '', path);
    } else {
        history.replaceState({ page: 'watch' }, '', '/watch');
    }
}

function applyWatchParamsFromURL() {
    const parts = location.pathname.split('/');
    if (parts[1] === 'watch' && parts[2]) {
        try {
            const slugPart = parts[2];
            const dashIdx = slugPart.lastIndexOf('-');
            const encodedId = dashIdx !== -1 ? slugPart.slice(dashIdx + 1) : slugPart;
            const animeId = decodeId(encodedId);
            
            let epId = null;
            if (parts[3] === 'ep' && parts[4]) {
                epId = decodeId(parts[4]);
            }
            
            state.watch.pendingLoadId = animeId;
            state.watch.pendingEpId = epId;
        } catch(e) {
            console.error('Invalid watch URL', e);
        }
    }
}

function setupNav() {
    $$('[data-nav]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(btn.dataset.nav);
        });
    });

    // Mobile menu toggle
    const menuBtn = $('#menuToggle');
    const navLinks = $('#navLinks');
    if (menuBtn && navLinks) {
        menuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('nav__links--open');
            menuBtn.classList.toggle('active');
        });
    }

    window.addEventListener('popstate', (e) => {
        const page = e.state?.page || getPageFromPath(location.pathname);
        navigateTo(page, { pushState: false });
    });
}

function navigateTo(page, { pushState = true } = {}) {
    const previousPage = state.currentPage;
    state.currentPage = page;
    if (pushState) {
        history.pushState({ page }, '', page === 'home' ? '/' : `/${page}`);
    }

    // Stop video playback when navigating away from the watch page
    if (previousPage === 'watch' && page !== 'watch') {
        const video = document.getElementById('animePlayer');
        if (video) video.pause();
    }

    // Update nav active state
    $$('[data-nav]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.nav === page);
    });

    // Show/hide pages
    $$('.page').forEach(p => p.classList.toggle('page--active', p.id === `page-${page}`));

    // Close mobile nav
    const navLinks = $('#navLinks');
    if (navLinks) navLinks.classList.remove('nav__links--open');
    const menuBtn = $('#menuToggle');
    if (menuBtn) menuBtn.classList.remove('active');

    // Load page content
    if (page === 'home') loadHomePage();
    if (page === 'search') loadSearchPage();
    if (page === 'watch') loadWatchPage();
    if (page === 'vault') loadVaultPage();

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── Home Page ───────────────────────────────────────────────────────
let homeLoaded = false;

async function loadHomePage() {
    // Always refresh favorites — may have changed since last visit
    const favContainer = $('#homeFavorites');
    if (favContainer) loadFavoritesSection(favContainer);

    if (homeLoaded) return;

    const container = $('#homeContent');
    if (!container) return;

    // Show skeleton carousels
    container.innerHTML = '';
    container.appendChild(createCarouselSkeleton('🔥 Trending Now'));
    container.appendChild(createCarouselSkeleton('⭐ Top Rated'));
    container.appendChild(createCarouselSkeleton('✅ Latest Completed'));
    container.appendChild(createCarouselSkeleton('📅 Upcoming'));

    const onCardClick = (anime) => showAnimeDetail(anime.mal_id);

    try {
        // Sequential requests — each one flows through the 350ms rate-limiter
        // queue so we never burst Jikan's 3 req/sec limit simultaneously.
        const trending  = await api.getTopAnime('airing');
        const topRated  = await api.getTopAnime();
        const completed = await api.searchAnime({ status: 'complete', order_by: 'end_date', sort: 'desc', limit: 15 });
        const upcoming  = await api.getSeasonUpcoming();

        container.innerHTML = '';

        // Hero banner from first trending anime
        if (trending.data?.[0]) {
            container.appendChild(createHeroBanner(trending.data[0], onCardClick));
        }

        // Carousels
        if (trending.data?.length) {
            container.appendChild(createCarousel('🔥 Trending Now', trending.data, onCardClick));
        }
        if (topRated.data?.length) {
            container.appendChild(createCarousel('⭐ Top Rated', topRated.data, onCardClick));
        }
        if (completed.data?.length) {
            container.appendChild(createCarousel('✅ Latest Completed', completed.data, onCardClick));
        }
        if (upcoming.data?.length) {
            container.appendChild(createCarousel('📅 Upcoming', upcoming.data, onCardClick));
        }

        homeLoaded = true;

    } catch (err) {
        console.error('[Home]', err);
        container.innerHTML = '';
        container.appendChild(createErrorCard(
            `Failed to load homepage: ${err.message}`,
            () => { homeLoaded = false; loadHomePage(); }
        ));
    }
}

async function loadFavoritesSection(container) {
    const favs = await db.favorites.getAll();
    container.innerHTML = '';
    if (favs.length > 0) {
        const onCardClick = (anime) => showAnimeDetail(anime.mal_id);
        container.appendChild(createCarousel('❤ My Favorites', favs, onCardClick));
    }
}

function setupFavoritesListener() {
    document.addEventListener('favoritesUpdated', () => {
        const favContainer = $('#homeFavorites');
        if (favContainer) loadFavoritesSection(favContainer);
    });
}

// ─── Search Page ─────────────────────────────────────────────────────
let searchInitialized = false;

function hasActiveFilters() {
    const s = state.search;
    return !!(s.query || s.type || s.status || s.rating || s.min_score || s.max_score || s.order_by || s.genres.size > 0);
}

function applySearchParamsFromURL() {
    const p = new URLSearchParams(location.search);
    if (p.get('q')) state.search.query = p.get('q');
    if (p.get('type')) state.search.type = p.get('type');
    if (p.get('status')) state.search.status = p.get('status');
    if (p.get('rating')) state.search.rating = p.get('rating');
    if (p.get('min_score')) state.search.min_score = p.get('min_score');
    if (p.get('max_score')) state.search.max_score = p.get('max_score');
    if (p.get('order_by')) state.search.order_by = p.get('order_by');
    if (p.get('sort')) state.search.sort = p.get('sort');
    if (p.get('genres')) {
        p.get('genres').split(',').map(Number).filter(Boolean).forEach(id => state.search.genres.add(id));
    }
}

async function loadSearchPage() {
    if (!searchInitialized) {
        await initSearchFilters();
        searchInitialized = true;
        if (hasActiveFilters()) {
            syncFilterUI();
            performSearch();
        }
    }
}

async function initSearchFilters() {
    const genreContainer = $('#genreChips');
    if (!genreContainer) return;

    try {
        const genreData = await api.getFilteredGenres();
        state.genresList = genreData.data || [];
        renderGenreChips(genreContainer, state.genresList, state.search.genres, () => {
            // Reset page on genre change
            state.search.page = 1;
            performSearch();
        });
    } catch (err) {
        console.error('[Genres]', err);
        genreContainer.innerHTML = '<p class="error-text">Failed to load genres</p>';
    }

    // Bind filter inputs
    const searchInput = $('#searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce((e) => {
            state.search.query = e.target.value.trim();
            state.search.page = 1;
            performSearch();
        }, 500));
    }

    // Dropdown filters
    for (const filterId of ['filterType', 'filterStatus', 'filterRating', 'filterOrderBy', 'filterSort']) {
        const elem = $(`#${filterId}`);
        if (elem) {
            elem.addEventListener('change', () => {
                const key = elem.dataset.param;
                state.search[key] = elem.value;
                state.search.page = 1;
                performSearch();
            });
        }
    }

    // Score sliders
    const minScore = $('#filterMinScore');
    const maxScore = $('#filterMaxScore');
    const minScoreVal = $('#minScoreVal');
    const maxScoreVal = $('#maxScoreVal');

    if (minScore) {
        minScore.addEventListener('input', () => {
            state.search.min_score = minScore.value > 0 ? minScore.value : '';
            if (minScoreVal) minScoreVal.textContent = minScore.value > 0 ? minScore.value : 'Any';
            state.search.page = 1;
        });
        minScore.addEventListener('change', () => performSearch());
    }
    if (maxScore) {
        maxScore.addEventListener('input', () => {
            state.search.max_score = maxScore.value < 10 ? maxScore.value : '';
            if (maxScoreVal) maxScoreVal.textContent = maxScore.value < 10 ? maxScore.value : 'Any';
            state.search.page = 1;
        });
        maxScore.addEventListener('change', () => performSearch());
    }

    // Quick-filter: Latest Completed
    const quickCompleted = $('#quickCompleted');
    if (quickCompleted) {
        quickCompleted.addEventListener('click', () => {
            applyQuickFilter({
                status: 'complete',
                order_by: 'end_date',
                sort: 'desc',
                query: '',
                type: '',
                rating: '',
                min_score: '',
                max_score: '',
            });
        });
    }

    // Quick-filter: Top Airing
    const quickAiring = $('#quickAiring');
    if (quickAiring) {
        quickAiring.addEventListener('click', () => {
            applyQuickFilter({
                status: 'airing',
                order_by: 'score',
                sort: 'desc',
                query: '',
                type: '',
                rating: '',
                min_score: '',
                max_score: '',
            });
        });
    }

    // Quick-filter: Top Rated
    const quickTopRated = $('#quickTopRated');
    if (quickTopRated) {
        quickTopRated.addEventListener('click', () => {
            applyQuickFilter({
                status: '',
                order_by: 'score',
                sort: 'desc',
                query: '',
                type: '',
                rating: '',
                min_score: '8',
                max_score: '',
            });
        });
    }

    // Clear filters
    const clearBtn = $('#clearFilters');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            applyQuickFilter({
                status: '',
                order_by: '',
                sort: 'desc',
                query: '',
                type: '',
                rating: '',
                min_score: '',
                max_score: '',
            });
            state.search.genres.clear();
            renderGenreChips(genreContainer, state.genresList, state.search.genres, () => {
                state.search.page = 1;
                performSearch();
            });
            showToast('Filters cleared', 'success');
        });
    }
}

// ─── Filter Panel (mobile hide/show) ─────────────────────────────────
function setupFilterPanel() {
    const filterToggle = $('#filterToggle');
    const filterPanel = $('#filterPanel');

    function openPanel() {
        if (!filterPanel) return;
        filterPanel.classList.add('filter-panel--open');
        filterPanel.style.display = 'block';
        if (filterToggle) filterToggle.classList.add('active');
    }

    function closePanel() {
        if (!filterPanel) return;
        filterPanel.classList.remove('filter-panel--open');
        filterPanel.style.display = '';
        if (filterToggle) filterToggle.classList.remove('active');
    }

    if (filterToggle && filterPanel) {
        filterToggle.addEventListener('click', () => {
            if (filterPanel.classList.contains('filter-panel--open')) {
                closePanel();
            } else {
                openPanel();
            }
        });
    }

    // Hide filters buttons (top + bottom inside panel)
    document.querySelectorAll('.filter-panel__hide').forEach(btn => {
        // Use both click and touchend for maximum mobile compatibility
        const handler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            closePanel();
        };
        btn.addEventListener('click', handler);
        btn.addEventListener('touchend', handler);
    });
}

// ─── NSFW Toggle ─────────────────────────────────────────────────────
function setupNsfwToggle() {
    const toggle = $('#nsfwToggle');
    const rxOption = $('#ratingRx');

    // Sync initial state
    if (toggle) toggle.checked = state.nsfwEnabled;
    if (rxOption) rxOption.style.display = state.nsfwEnabled ? '' : 'none';

    if (!toggle) return;

    toggle.addEventListener('change', async () => {
        state.nsfwEnabled = toggle.checked;
        localStorage.setItem('anivault_nsfw', JSON.stringify(state.nsfwEnabled));
        api.setSfwMode(!state.nsfwEnabled);

        // Show/hide rx rating option
        if (rxOption) rxOption.style.display = state.nsfwEnabled ? '' : 'none';

        // If rx was selected and we're going SFW, reset rating filter
        if (!state.nsfwEnabled && state.search.rating === 'rx') {
            state.search.rating = '';
            const ratingSelect = $('#filterRating');
            if (ratingSelect) ratingSelect.value = '';
        }

        // Clear caches & remove selected NSFW genres
        api.clearCache();
        if (!state.nsfwEnabled) {
            const { NSFW_GENRE_IDS } = await import('./config.js');
            for (const gid of NSFW_GENRE_IDS) {
                state.search.genres.delete(gid);
            }
        }

        // Re-render genre chips
        const genreContainer = $('#genreChips');
        if (genreContainer) {
            try {
                const genreData = await api.getFilteredGenres();
                state.genresList = genreData.data || [];
                renderGenreChips(genreContainer, state.genresList, state.search.genres, () => {
                    state.search.page = 1;
                    performSearch();
                });
            } catch (err) {
                console.error('[NSFW Toggle] Failed to reload genres:', err);
            }
        }

        // Reload home page and re-run search if active
        homeLoaded = false;
        searchInitialized = false;
        if (state.currentPage === 'home') loadHomePage();
        if (state.currentPage === 'search') {
            await initSearchFilters();
            searchInitialized = true;
            performSearch();
        }

        showToast(
            toggle.checked ? '18+ content enabled' : 'SFW mode enabled',
            toggle.checked ? 'warning' : 'success'
        );
    });
}

function applyQuickFilter(values) {
    state.search.query = values.query ?? '';
    state.search.type = values.type ?? '';
    state.search.status = values.status ?? '';
    state.search.rating = values.rating ?? '';
    state.search.order_by = values.order_by ?? '';
    state.search.sort = values.sort ?? 'desc';
    state.search.min_score = values.min_score ?? '';
    state.search.max_score = values.max_score ?? '';
    state.search.page = 1;

    // Sync UI
    syncFilterUI();
    performSearch();
}

function syncFilterUI() {
    const s = state.search;
    const set = (id, val) => { const e = $(`#${id}`); if (e) e.value = val; };
    set('searchInput', s.query);
    set('filterType', s.type);
    set('filterStatus', s.status);
    set('filterRating', s.rating);
    set('filterOrderBy', s.order_by);
    set('filterSort', s.sort);

    const minScore = $('#filterMinScore');
    const maxScore = $('#filterMaxScore');
    const minScoreVal = $('#minScoreVal');
    const maxScoreVal = $('#maxScoreVal');
    if (minScore) minScore.value = s.min_score || 0;
    if (maxScore) maxScore.value = s.max_score || 10;
    if (minScoreVal) minScoreVal.textContent = s.min_score || 'Any';
    if (maxScoreVal) maxScoreVal.textContent = s.max_score || 'Any';
}

async function performSearch(append = false) {
    if (state.search.loading) return;
    state.search.loading = true;

    const resultsContainer = $('#searchResults');
    const paginationContainer = $('#searchPagination');
    if (!resultsContainer) return;

    if (!append) {
        showSkeletons(resultsContainer, 12);
        if (paginationContainer) paginationContainer.innerHTML = '';

        // Auto-close filter panel on mobile when searching
        const filterPanel = $('#filterPanel');
        const filterToggle = $('#filterToggle');
        if (filterPanel && filterPanel.classList.contains('filter-panel--open')) {
            filterPanel.classList.remove('filter-panel--open');
            if (filterToggle) filterToggle.classList.remove('active');
        }
    }

    const s = state.search;

    // Sync URL so searches are bookmarkable / shareable
    const urlParams = new URLSearchParams();
    if (s.query) urlParams.set('q', s.query);
    if (s.type) urlParams.set('type', s.type);
    if (s.status) urlParams.set('status', s.status);
    if (s.rating) urlParams.set('rating', s.rating);
    if (s.min_score) urlParams.set('min_score', s.min_score);
    if (s.max_score) urlParams.set('max_score', s.max_score);
    if (s.order_by) urlParams.set('order_by', s.order_by);
    if (s.sort && s.sort !== 'desc') urlParams.set('sort', s.sort);
    if (s.genres.size > 0) urlParams.set('genres', [...s.genres].join(','));
    const qs = urlParams.toString();
    history.replaceState({ page: 'search' }, '', `/search${qs ? '?' + qs : ''}`);

    const params = {};
    if (s.query) params.q = s.query;
    if (s.type) params.type = s.type;
    if (s.status) params.status = s.status;
    if (s.rating) params.rating = s.rating;
    if (s.min_score) params.min_score = s.min_score;
    if (s.max_score) params.max_score = s.max_score;
    if (s.order_by) params.order_by = s.order_by;
    if (s.sort) params.sort = s.sort;
    if (s.genres.size > 0) params.genres = [...s.genres].join(',');
    params.page = s.page;
    params.limit = 24;

    try {
        const data = await api.searchAnime(params);
        state.search.pagination = data.pagination;

        const newResults = data.data || [];
        if (append) {
            state.search.results = [...state.search.results, ...newResults];
        } else {
            state.search.results = newResults;
        }

        // Render
        if (!append) resultsContainer.innerHTML = '';

        if (state.search.results.length === 0) {
            resultsContainer.appendChild(createEmptyState('No anime found. Try adjusting your filters.'));
        } else {
            // Render cards directly into the results-grid container
            const animesToRender = append ? newResults : state.search.results;
            let baseIndex = append ? state.search.results.length - newResults.length : 0;
            for (let i = 0; i < animesToRender.length; i++) {
                resultsContainer.appendChild(createAnimeCard(animesToRender[i], (a) => showAnimeDetail(a.mal_id), baseIndex + i));
            }
        }

        // Pagination
        if (paginationContainer) {
            paginationContainer.innerHTML = '';
            if (data.pagination) {
                paginationContainer.appendChild(createPaginationInfo(data.pagination));
                if (data.pagination.has_next_page) {
                    paginationContainer.appendChild(createLoadMoreBtn(() => {
                        state.search.page++;
                        performSearch(true);
                    }));
                }
            }
        }

    } catch (err) {
        console.error('[Search]', err);
        if (!append) resultsContainer.innerHTML = '';
        resultsContainer.appendChild(createErrorCard(
            `Search failed: ${err.message}`,
            () => performSearch(append),
        ));
    } finally {
        state.search.loading = false;
        updateFilterBadge();

        // Scroll results into view on fresh search (not append)
        if (!append && resultsContainer && state.search.results.length > 0) {
            setTimeout(() => {
                resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    }
}

// ─── Anime Detail ────────────────────────────────────────────────────
async function showAnimeDetail(malId) {
    // Show loading modal
    openDetailModal({
        title: 'Loading...',
        images: {},
        synopsis: 'Fetching anime details...',
        genres: [],
        themes: [],
        demographics: [],
        studios: [],
    });

    try {
        const [animeData, recsData] = await Promise.all([
            api.getAnimeById(malId),
            api.getAnimeRecommendations(malId).catch(() => ({ data: [] })),
        ]);

        openDetailModal(animeData.data, recsData.data || []);
    } catch (err) {
        console.error('[Detail]', err);
        closeDetailModal();
        const container = $(`#page-${state.currentPage} .page__content`) || $(`#page-${state.currentPage}`);
        if (container) {
            const errCard = createErrorCard(`Failed to load anime details: ${err.message}`);
            container.prepend(errCard);
            setTimeout(() => errCard.remove(), 5000);
        }
    }
}

// Custom event for detail from within components
function setupCustomDetailEvent() {
    document.addEventListener('openAnimeDetail', (e) => {
        if (e.detail?.id) showAnimeDetail(e.detail.id);
    });
}

// ─── Watch Page ──────────────────────────────────────────────────────
let watchInitialized = false;

function setupWatchEvents() {
    // Navigate to watch from detail modal
    document.addEventListener('navigateToWatch', (e) => {
        const title = e.detail?.title;
        
        const isSameAnime = state.watch.selectedAnime && title && (
            state.watch.selectedAnime.title === title || state.watch.searchQuery === title
        );

        if (isSameAnime) {
            closeDetailModal();
            navigateTo('watch');
            return;
        }

        closeDetailModal();
        state.watch.searchQuery = title || '';
        state.watch.selectedAnime = null;
        state.watch.episodes = [];
        state.watch.currentEpId = null;
        watchInitialized = false; // Force re-init with new search
        navigateTo('watch');
    });

    // Navigate to watch resuming at specific episode and time
    document.addEventListener('navigateToWatchExt', (e) => {
        const { title, resumeEpId, resumeTime } = e.detail || {};
        
        const isSameAnime = state.watch.selectedAnime && title && (
            state.watch.selectedAnime.title === title || state.watch.searchQuery === title
        );

        if (isSameAnime) {
            closeDetailModal();
            if (state.watch.currentEpId === resumeEpId) {
                if (resumeTime !== undefined) {
                    const video = document.querySelector('#playerContainer video');
                    if (video) video.currentTime = resumeTime;
                }
                navigateTo('watch');
                return;
            } else {
                state.watch.resumeTime = resumeTime || 0;
                let epInfo = state.watch.episodes.find(ep => ep.id === resumeEpId);
                if (epInfo) {
                    selectEpisode(epInfo);
                } else {
                    state.watch.currentEpId = resumeEpId;
                    renderPlayer();
                }
                navigateTo('watch');
                return;
            }
        }

        closeDetailModal();
        state.watch.searchQuery = title || '';
        state.watch.selectedAnime = null;
        state.watch.episodes = [];
        state.watch.currentEpId = resumeEpId || null;
        state.watch.resumeTime = resumeTime || 0;
        watchInitialized = false; 
        navigateTo('watch');
    });

    // Reset watch (change anime)
    document.addEventListener('watchReset', () => {
        state.watch.selectedAnime = null;
        state.watch.episodes = [];
        state.watch.currentEpId = null;
        renderWatchSidebar();
        renderPlayer();
    });
}

async function loadWatchPage() {
    if (!watchInitialized) {
        initWatchControls();
        watchInitialized = true;
    }

    if (state.watch.pendingLoadId) {
        const aId = state.watch.pendingLoadId;
        const eId = state.watch.pendingEpId;
        state.watch.pendingLoadId = null;
        state.watch.pendingEpId = null;
        
        try {
            const animeInfo = $('#watchAnimeInfo');
            if (animeInfo) animeInfo.style.display = 'block';
            const headerContainer = $('#watchAnimeHeader');
            if (headerContainer) headerContainer.innerHTML = '<p class="loading-text">Loading anime info...</p>';

            const info = await streaming.getAnimekaiInfo(aId);
            if (info) {
               const anime = {
                   id: info.id || aId,
                   title: info.title,
                   image: info.image,
                   subOrDub: 'both'
               };
               
               if (eId) {
                   try {
                       const histData = await db.history.getAll();
                       const entry = histData.find(h => h.episode_id === eId);
                       if (entry && entry.time) {
                           state.watch.resumeTime = entry.time;
                       }
                   } catch(err) {
                       console.warn('[Watch] Failed to restore resume time', err);
                   }
               }

               state.watch.currentEpId = eId;
               await selectWatchAnime(anime, true);
            }
        } catch(e) {
            console.error('[Watch Resume]', e);
        }
        return;
    }

    // If we have a pre-filled search query (from detail modal), search and auto-select
    const searchInput = $('#watchSearchInput');
    if (state.watch.searchQuery && searchInput) {
        searchInput.value = state.watch.searchQuery;
        await performWatchSearch(state.watch.searchQuery, true);
        state.watch.searchQuery = ''; // Clear after use
    }
}

function initWatchControls() {
    // Search input
    const searchInput = $('#watchSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce((e) => {
            const query = e.target.value.trim();
            if (query.length >= 2) {
                performWatchSearch(query);
            } else {
                const results = $('#watchSearchResults');
                if (results) results.innerHTML = '';
            }
        }, 500));
    }

    // Language toggle
    const langToggle = $('#langToggle');
    if (langToggle) {
        langToggle.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-lang]');
            if (!btn) return;
            const lang = btn.dataset.lang;
            if (lang === state.watch.language) return;

            state.watch.language = lang;

            // Update active button
            langToggle.querySelectorAll('.lang-toggle__btn').forEach(b => {
                b.classList.toggle('lang-toggle__btn--active', b.dataset.lang === lang);
            });

            // Reload player with new language
            if (state.watch.currentEpId) {
                renderPlayer();
            }
        });
    }

    // Mobile episode toggle
    const epToggle = $('#watchEpToggle');
    const sidebar = $('#watchSidebar');
    if (epToggle && sidebar) {
        epToggle.addEventListener('click', () => {
            sidebar.classList.toggle('watch-sidebar--open');
        });
    }
}

async function performWatchSearch(query, autoSelect = false) {
    const resultsContainer = $('#watchSearchResults');
    const animeInfo = $('#watchAnimeInfo');
    if (!resultsContainer) return;

    // Show search results, hide episode list
    if (animeInfo) animeInfo.style.display = 'none';
    resultsContainer.innerHTML = '<p class="loading-text">Searching...</p>';

    try {
        const data = await streaming.searchAnimekai(query);
        resultsContainer.innerHTML = '';

        if (!data.results || data.results.length === 0) {
            resultsContainer.appendChild(createEmptyState('No anime found on AnimeKai'));
            return;
        }

        // Auto-select: find best match and skip the search results UI
        if (autoSelect) {
            const bestMatch = findBestMatch(query, data.results);
            if (bestMatch) {
                await selectWatchAnime(bestMatch, true);
                return;
            }
        }

        for (const anime of data.results) {
            resultsContainer.appendChild(createWatchSearchItem(anime, selectWatchAnime));
        }
    } catch (err) {
        console.error('[Watch Search]', err);
        resultsContainer.innerHTML = '';
        resultsContainer.appendChild(createErrorCard(
            `Search failed: ${err.message}`,
            () => performWatchSearch(query, autoSelect),
        ));
    }
}

/**
 * Find the best matching anime from AnimeKai results given a Jikan title.
 * Uses normalized string matching.
 */
function findBestMatch(query, animes) {
    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const q = normalize(query);

    // Try exact normalized match first
    for (const anime of animes) {
        const title = normalize(anime.title || '');
        if (title === q) return anime;
    }

    // Try inclusion match (query contains anime title or vice versa)
    for (const anime of animes) {
        const title = normalize(anime.title || '');
        if (title && (q.includes(title) || title.includes(q))) return anime;
    }

    // Fall back to first result if it's a TV series (most likely correct)
    const tvMatch = animes.find(a => a.type === 'TV');
    if (tvMatch) return tvMatch;

    // Last resort: first result
    return animes[0];
}

async function selectWatchAnime(anime, keepState = false) {
    state.watch.selectedAnime = anime;
    state.watch.episodes = [];
    if (!keepState) {
        state.watch.currentEpId = null;
        state.watch.resumeTime = 0;
    }

    updateWatchURL();

    // Smart language: default to sub, only allow dub if available
    const hasDub = anime.subOrDub === 'dub' || anime.subOrDub === 'both';
    if (!hasDub && state.watch.language === 'dub') {
        state.watch.language = 'sub';
    }

    // Hide search results, show anime info
    const resultsContainer = $('#watchSearchResults');
    if (resultsContainer) resultsContainer.innerHTML = '';

    renderWatchSidebar();
    updateLangToggle();
    await loadEpisodes(anime.id);
}

async function loadEpisodes(animeId) {
    const episodeList = $('#episodeList');
    if (!episodeList) return;

    episodeList.innerHTML = '<p class="loading-text">Loading episodes...</p>';

    try {
        const data = await streaming.getAnimekaiInfo(animeId);
        state.watch.episodes = data.episodes || [];

        renderEpisodeList();

        // Auto-play first episode if none selected yet
        if (!state.watch.currentEpId && state.watch.episodes.length > 0) {
            selectEpisode(state.watch.episodes[0]);
        } else if (state.watch.currentEpId && state.watch.episodes.length > 0) {
            const ep = state.watch.episodes.find(e => e.id === state.watch.currentEpId) || state.watch.episodes[0];
            selectEpisode(ep);
        }
    } catch (err) {
        console.error('[Watch Episodes]', err);
        episodeList.innerHTML = '';
        episodeList.appendChild(createErrorCard(
            `Failed to load episodes: ${err.message}`,
            () => loadEpisodes(animeId),
        ));
    }
}

function renderWatchSidebar() {
    const animeInfo = $('#watchAnimeInfo');
    const headerContainer = $('#watchAnimeHeader');
    const controls = $('#watchControls');

    if (!animeInfo || !headerContainer) return;

    if (state.watch.selectedAnime) {
        animeInfo.style.display = 'block';
        headerContainer.innerHTML = '';
        headerContainer.appendChild(createWatchAnimeHeader(state.watch.selectedAnime));
        if (controls) controls.style.display = 'flex';
    } else {
        animeInfo.style.display = 'none';
        headerContainer.innerHTML = '';
        if (controls) controls.style.display = 'none';
    }
}

function updateLangToggle() {
    const langToggle = $('#langToggle');
    if (!langToggle) return;

    const anime = state.watch.selectedAnime;
    let hasDub = anime?.subOrDub === 'dub' || anime?.subOrDub === 'both';

    if (state.watch.currentEpId && state.watch.episodes?.length) {
        const currentEp = state.watch.episodes.find(e => e.id === state.watch.currentEpId);
        if (currentEp && currentEp.isDubbed === false) {
            hasDub = false;
        }
    }

    langToggle.querySelectorAll('.lang-toggle__btn').forEach(btn => {
        const lang = btn.dataset.lang;
        btn.classList.toggle('lang-toggle__btn--active', lang === state.watch.language);

        if (lang === 'dub') {
            btn.disabled = !hasDub;
            btn.classList.toggle('lang-toggle__btn--disabled', !hasDub);
            btn.title = hasDub ? '' : 'Dub not available for this episode';
        }
    });
}

function renderEpisodeList() {
    const episodeList = $('#episodeList');
    if (!episodeList) return;

    episodeList.innerHTML = '';

    if (state.watch.episodes.length === 0) {
        episodeList.appendChild(createEmptyState('No episodes found'));
        return;
    }

    for (const ep of state.watch.episodes) {
        const isActive = ep.id === state.watch.currentEpId;
        episodeList.appendChild(createEpisodeItem(ep, isActive, selectEpisode));
    }
}

function selectEpisode(ep) {
    state.watch.currentEpId = ep.id;

    if (state.watch.language === 'dub' && ep.isDubbed === false) {
        state.watch.language = 'sub';
    }

    updateWatchURL();
    renderEpisodeList(); // Update active state
    updateLangToggle(); 
    renderPlayer();

    // Close mobile sidebar after selection
    const sidebar = $('#watchSidebar');
    if (sidebar) sidebar.classList.remove('watch-sidebar--open');
}

async function renderPlayer() {
    const container = $('#playerContainer');
    if (!container) return;

    container.innerHTML = '';

    if (!state.watch.currentEpId) {
        container.innerHTML = `
            <div class="player-placeholder" id="playerPlaceholder">
                <div class="player-placeholder__icon">▶</div>
                <p>Search for an anime and select an episode to start watching</p>
            </div>
        `;
        const existingNav = document.querySelector('.episode-nav');
        if (existingNav) existingNav.remove();
        const watchDetailsArea = $('#watchDetailsArea');
        if (watchDetailsArea) watchDetailsArea.style.display = 'none';
        return;
    }

    // Loading state
    container.innerHTML = `
        <div class="player-placeholder">
            <div class="player-placeholder__icon">⏳</div>
            <p>Loading stream...</p>
        </div>
    `;

    try {
        const isDub = state.watch.language === 'dub';
        const data = await streaming.getEpisodeSources(state.watch.currentEpId, isDub);
        const sources = data.sources || [];

        if (!sources.length) {
            container.innerHTML = `
                <div class="player-placeholder">
                    <div class="player-placeholder__icon">⚠</div>
                    <p>No sources available for this episode.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        const subtitles = data.subtitles || [];
        const video = createVideoPlayer(sources, subtitles, !isDub);
        container.appendChild(video);

        // Initialize Plyr player
        const player = new Plyr(video, {
            controls: [
                'play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'
            ],
            settings: ['captions', 'quality', 'speed', 'loop'],
            captions: { active: !isDub, language: 'en', update: true },
            storage: { enabled: true, key: 'anivault_plyr' },
            autoplay: true
        });

        // Setup Skip Intro / Skip Outro Buttons
        const intro = data.intro || undefined;
        const outro = data.outro || undefined;

        const skipIntroBtn = document.createElement('button');
        skipIntroBtn.className = 'skip-btn';
        skipIntroBtn.textContent = 'Skip Intro';

        const skipOutroBtn = document.createElement('button');
        skipOutroBtn.className = 'skip-btn';
        skipOutroBtn.textContent = 'Skip Outro';

        // Append to plyr container so they show up in native fullscreen
        const plyrContainer = container.querySelector('.plyr') || container;
        plyrContainer.appendChild(skipIntroBtn);
        plyrContainer.appendChild(skipOutroBtn);

        skipIntroBtn.addEventListener('click', () => {
            if (intro && intro.end) player.currentTime = intro.end;
        });

        skipOutroBtn.addEventListener('click', () => {
            if (outro && outro.end) player.currentTime = outro.end;
        });

        player.on('timeupdate', () => {
            if (intro && player.currentTime >= intro.start && player.currentTime <= intro.end) {
                skipIntroBtn.style.display = 'block';
            } else {
                skipIntroBtn.style.display = 'none';
            }

            if (outro && player.currentTime >= outro.start && player.currentTime <= outro.end) {
                skipOutroBtn.style.display = 'block';
            } else {
                skipOutroBtn.style.display = 'none';
            }
        });

        player.on('loadeddata', () => {
            if (state.watch.resumeTime > 0) {
                player.currentTime = state.watch.resumeTime;
                state.watch.resumeTime = 0;
            }
            player.play().catch(e => console.warn('Autoplay prevented by browser:', e));
        });

        let saveTimeout;
        video.addEventListener('timeupdate', () => {
            if (video.paused || !video.duration) return;
            if (saveTimeout) return;
            saveTimeout = setTimeout(() => {
                saveTimeout = null;
                const ep = state.watch.episodes.find(e => e.id === state.watch.currentEpId);
                const anime = state.watch.selectedAnime;
                if (anime && ep) {
                    db.history.save({
                        id: anime.id,
                        title: anime.title || anime.title_english,
                        image: anime.image
                    }, {
                        id: ep.id,
                        title: ep.title,
                        number: ep.number
                    }, video.currentTime, video.duration, isDub);
                }
            }, 5000);
        });

        video.addEventListener('ended', async () => {
            const episodes = state.watch.episodes;
            if (!episodes || !state.watch.currentEpId) return;
            const currentIdx = episodes.findIndex(ep => ep.id === state.watch.currentEpId);
            if (currentIdx !== -1 && currentIdx < episodes.length - 1) {
                const nextEpOld = episodes[currentIdx + 1];
                try {
                    // Try to fetch fresh episodes to bypass token expiration 404
                    if (state.watch.selectedAnime && state.watch.selectedAnime.id) {
                        const freshData = await streaming.getAnimekaiInfo(state.watch.selectedAnime.id);
                        if (freshData && freshData.episodes) {
                            state.watch.episodes = freshData.episodes;
                            const freshNext = state.watch.episodes.find(e => e.number === nextEpOld.number) || state.watch.episodes[currentIdx + 1];
                            if (freshNext) {
                                selectEpisode(freshNext);
                                return;
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[Watch] Failed to refresh episode token:', e);
                }
                // Fallback to old token if refresh failed
                selectEpisode(nextEpOld);
            }
        });

        // Initialize HLS.js for m3u8 sources
        if (video.dataset.hlsSrc) {
            // Proxy the m3u8 through the backend to bypass strict Origin 403s on Cloudflare
            const proxyUrl = `${CONSUMET_API_BASE}/utils/cors?url=${encodeURIComponent(video.dataset.hlsSrc)}`;
            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                const hls = new Hls();
                hls.loadSource(proxyUrl);
                hls.attachMedia(video);
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                // Native HLS (Safari)
                video.src = proxyUrl;
            }
        }

        // Render Details and Comments
        const detailsContainer = $('#watchDetails');
        const commentsContainer = $('#watchComments');
        const watchDetailsArea = $('#watchDetailsArea');
        
        if (detailsContainer && commentsContainer && watchDetailsArea) {
            const ep = state.watch.episodes.find(e => e.id === state.watch.currentEpId);
            detailsContainer.innerHTML = '';
            detailsContainer.appendChild(createWatchDetails(state.watch.selectedAnime, ep));
            
            commentsContainer.innerHTML = '<p class="loading-text">Loading comments...</p>';
            watchDetailsArea.style.display = 'flex';

            // Fetch actual MAL reviews as comments and Episode Details
            setTimeout(async () => {
                try {
                    let malId = state.watch.selectedAnime.mal_id;
                    if (!malId && state.watch.selectedAnime.title) {
                        const searchRes = await api.searchAnime({ q: state.watch.selectedAnime.title, limit: 1 });
                        if (searchRes.data && searchRes.data.length > 0) {
                            malId = searchRes.data[0].mal_id;
                            state.watch.selectedAnime.mal_id = malId;
                        }
                    }

                    if (malId) {
                        // Fetch Reviews
                        const reviewsRes = await api.getAnimeReviews(malId).catch(() => ({ data: [] }));
                        commentsContainer.innerHTML = '';
                        commentsContainer.appendChild(createWatchComments(reviewsRes.data || []));

                        // Fetch Episode Synopsis
                        if (ep && ep.number) {
                            try {
                                const epRes = await api.getAnimeEpisode(malId, ep.number);
                                if (epRes && epRes.data) {
                                    detailsContainer.innerHTML = '';
                                    detailsContainer.appendChild(createWatchDetails(state.watch.selectedAnime, ep, epRes.data));
                                }
                            } catch (epErr) {
                                console.error('[Episode Info]', epErr);
                            }
                        }
                    } else {
                        commentsContainer.innerHTML = '';
                        commentsContainer.appendChild(createWatchComments([]));
                    }
                } catch(e) {
                    console.error('[Reviews/Details]', e);
                    commentsContainer.innerHTML = '<p class="error-text">Failed to load comments/details</p>';
                }
            }, 0);
        }

    } catch (err) {
        console.error('[Player]', err);
        container.innerHTML = '';
        container.appendChild(createErrorCard(
            `Failed to load stream: ${err.message}`,
            () => renderPlayer(),
        ));
    }

    renderEpisodeNav();
}

function renderEpisodeNav() {
    // Remove existing nav
    let nav = document.querySelector('.episode-nav');
    if (nav) nav.remove();

    const episodes = state.watch.episodes;
    if (episodes.length <= 1 || !state.watch.currentEpId) return;

    const currentIdx = episodes.findIndex(ep => ep.id === state.watch.currentEpId);
    if (currentIdx === -1) return;

    const hasPrev = currentIdx > 0;
    const hasNext = currentIdx < episodes.length - 1;

    // Only show if there's at least one direction
    if (!hasPrev && !hasNext) return;

    const container = $('#playerContainer');
    if (!container) return;

    nav = document.createElement('div');
    nav.className = 'episode-nav';

    if (hasPrev) {
        const prevEp = episodes[currentIdx - 1];
        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn btn--outline episode-nav__btn';
        prevBtn.innerHTML = `← Ep ${prevEp.number}`;
        prevBtn.title = prevEp.title || `Episode ${prevEp.number}`;
        prevBtn.addEventListener('click', () => selectEpisode(prevEp));
        nav.appendChild(prevBtn);
    } else {
        // Spacer
        nav.appendChild(document.createElement('span'));
    }

    // Current episode label
    const currentEp = episodes[currentIdx];
    const label = document.createElement('span');
    label.className = 'episode-nav__current';
    label.textContent = `Episode ${currentEp.number}`;
    nav.appendChild(label);

    if (hasNext) {
        const nextEp = episodes[currentIdx + 1];
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn--outline episode-nav__btn';
        nextBtn.innerHTML = `Ep ${nextEp.number} →`;
        nextBtn.title = nextEp.title || `Episode ${nextEp.number}`;
        nextBtn.addEventListener('click', () => selectEpisode(nextEp));
        nav.appendChild(nextBtn);
    } else {
        nav.appendChild(document.createElement('span'));
    }

    // Insert after the player container
    container.parentNode.insertBefore(nav, container.nextSibling);
}

// Expose for debugging
window.__animeAppState = state;

// ─── Back to Top ─────────────────────────────────────────────────────
function setupBackToTop() {
    const btn = $('#backToTop');
    if (!btn) return;

    window.addEventListener('scroll', () => {
        btn.classList.toggle('back-to-top--visible', window.scrollY > 400);
    }, { passive: true });

    btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// ─── Keyboard Shortcuts ──────────────────────────────────────────────
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // '/' to focus search — only when not typing in an input
        if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
            e.preventDefault();
            navigateTo('search');
            setTimeout(() => {
                const input = $('#searchInput');
                if (input) input.focus();
            }, 100);
        }
    });
}

// ─── Filter Badge ────────────────────────────────────────────────────
function updateFilterBadge() {
    const badge = $('#filterCount');
    if (!badge) return;

    const s = state.search;
    let count = 0;
    if (s.query) count++;
    if (s.type) count++;
    if (s.status) count++;
    if (s.rating) count++;
    if (s.min_score) count++;
    if (s.max_score) count++;
    if (s.order_by) count++;
    count += s.genres.size;

    if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

// ─── Vault Page ──────────────────────────────────────────────────────
async function loadVaultPage() {
    const histContainer = $('#vaultHistory');
    const favContainer = $('#vaultFavorites');
    if (!histContainer || !favContainer) return;

    histContainer.innerHTML = '';
    favContainer.innerHTML = '';

    histContainer.appendChild(createCarouselSkeleton('⏱ Continue Watching'));
    favContainer.appendChild(createCarouselSkeleton('❤ Favorites'));

    try {
        const [histData, favData] = await Promise.all([
            db.history.getAll(),
            db.favorites.getAll()
        ]);

        histContainer.innerHTML = '';
        favContainer.innerHTML = '';

        if (histData.length > 0) {
            const track = el('div', { className: 'results-grid' });
            
            const favTitleMap = new Map();
            for (const f of favData) {
                if (f.title_english) favTitleMap.set(f.title_english.toLowerCase(), f);
                if (f.title) favTitleMap.set(f.title.toLowerCase(), f);
            }

            for (let i = 0; i < histData.length; i++) {
                const entry = histData[i];
                const t = (entry.anime_title || '').toLowerCase();
                const isFav = favTitleMap.has(t);

                track.appendChild(createHistoryCard(entry, (entry) => {
                    document.dispatchEvent(new CustomEvent('navigateToWatchExt', { detail: { 
                        title: entry.anime_title, 
                        resumeEpId: entry.episode_id,
                        resumeTime: entry.time
                    } }));
                }, i, isFav, async (btn, wasFav, entry) => {
                    btn.textContent = '...';
                    try {
                        if (wasFav) {
                            const favRecord = favTitleMap.get(t);
                            if (favRecord) {
                                await db.favorites.remove(favRecord.mal_id);
                                document.dispatchEvent(new CustomEvent('favoritesUpdated'));
                                loadVaultPage();
                            }
                        } else {
                            const res = await api.searchAnime({ q: entry.anime_title, limit: 1 });
                            if (res.data && res.data[0]) {
                                await db.favorites.add(res.data[0]);
                                document.dispatchEvent(new CustomEvent('favoritesUpdated'));
                                loadVaultPage();
                            } else {
                                btn.textContent = '♡';
                                btn.title = 'Not found on Jikan';
                            }
                        }
                    } catch (err) {
                        btn.textContent = wasFav ? '♥' : '♡';
                    }
                }));
            }
            histContainer.appendChild(el('section', { className: 'vault-section__inner' },
                el('h2', { className: 'carousel__title', style: 'margin-bottom: 24px;' }, '⏱ Continue Watching'),
                track
            ));
        } else {
            histContainer.appendChild(createEmptyState("No watch history yet. Start watching an anime!"));
        }

        if (favData.length > 0) {
            const track = createResultsGrid(favData, (a) => showAnimeDetail(a.mal_id));
            favContainer.appendChild(el('section', { className: 'vault-section__inner', style: 'margin-top: 48px;' },
                el('h2', { className: 'carousel__title', style: 'margin-bottom: 24px;' }, '❤ Favorites'),
                track
            ));
        } else if (histData.length === 0) {
            favContainer.appendChild(createEmptyState("No favorites yet. Add some anime to your favorites!"));
        }
    } catch (err) {
        console.error('[Vault]', err);
        histContainer.innerHTML = '';
        favContainer.innerHTML = '';
        histContainer.appendChild(createErrorCard(`Failed to load vault: ${err.message}`, loadVaultPage));
    }
}
