/**
 * app.js — Router, page controllers, initialization
 */

import { $, $$, debounce } from './utils.js';
import * as api from './api.js';
import {
    createCarousel, createCarouselSkeleton, createHeroBanner,
    createAnimeCard, showSkeletons, createResultsGrid,
    createPaginationInfo, createLoadMoreBtn,
    openDetailModal, closeDetailModal,
    renderGenreChips, createErrorCard, createEmptyState,
    createSkeletonCard,
} from './components.js';

// ─── State ───────────────────────────────────────────────────────────
const state = {
    currentPage: 'home',
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
};

// ─── Init ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    setupNav();
    setupCustomDetailEvent();
    navigateTo('home');
});

// ─── Navigation ──────────────────────────────────────────────────────
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
}

function navigateTo(page) {
    state.currentPage = page;

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

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── Home Page ───────────────────────────────────────────────────────
let homeLoaded = false;

async function loadHomePage() {
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
        // Load all sections with staggered requests to respect rate limits
        const [trending, topRated, completed, upcoming] = await Promise.all([
            api.getTopAnime('airing'),
            api.getTopAnime(),
            api.searchAnime({ status: 'complete', order_by: 'end_date', sort: 'desc', limit: 15 }),
            api.getSeasonUpcoming(),
        ]);

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

// ─── Search Page ─────────────────────────────────────────────────────
let searchInitialized = false;

async function loadSearchPage() {
    if (!searchInitialized) {
        await initSearchFilters();
        searchInitialized = true;
    }
}

async function initSearchFilters() {
    const genreContainer = $('#genreChips');
    if (!genreContainer) return;

    try {
        const genreData = await api.getGenres();
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
        });
    }

    // Mobile filter toggle
    const filterToggle = $('#filterToggle');
    const filterPanel = $('#filterPanel');
    if (filterToggle && filterPanel) {
        filterToggle.addEventListener('click', () => {
            filterPanel.classList.toggle('filter-panel--open');
            filterToggle.classList.toggle('active');
        });
    }
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
    }

    const params = {};
    const s = state.search;
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
            for (const anime of animesToRender) {
                resultsContainer.appendChild(createAnimeCard(anime, (a) => showAnimeDetail(a.mal_id)));
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

// Expose for debugging
window.__animeAppState = state;
