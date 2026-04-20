import { supabase, getCurrentUser } from './auth.js';

export async function syncFavoriteAdd(record) {
    const user = getCurrentUser();
    if (!user || !supabase) return;
    const { error } = await supabase.from('favorites').upsert({
        user_id: user.id,
        mal_id: record.mal_id,
        data: record,
        saved_at: new Date(record.savedAt || Date.now()).toISOString(),
    }, { onConflict: 'user_id,mal_id' });
    if (error) throw error;
}

export async function syncFavoriteRemove(malId) {
    const user = getCurrentUser();
    if (!user || !supabase) return;
    const { error } = await supabase.from('favorites')
        .delete().eq('user_id', user.id).eq('mal_id', malId);
    if (error) throw error;
}

export async function syncHistorySave(record) {
    const user = getCurrentUser();
    if (!user || !supabase) return;
    const { error } = await supabase.from('history').upsert({
        user_id: user.id,
        anime_id: String(record.id),
        data: record,
        updated_at: new Date(record.updatedAt || Date.now()).toISOString(),
    }, { onConflict: 'user_id,anime_id' });
    if (error) throw error;
}

export async function fetchCloudFavorites() {
    if (!supabase) return null;
    const user = getCurrentUser();
    if (!user) return null;
    const { data, error } = await supabase
        .from('favorites').select('data, saved_at')
        .eq('user_id', user.id)
        .order('saved_at', { ascending: false });
    if (error) { console.error('[sync] fetchCloudFavorites:', error); return null; }
    return (data || []).map(r => r.data);
}

export async function fetchCloudHistory() {
    if (!supabase) return null;
    const user = getCurrentUser();
    if (!user) return null;
    const { data, error } = await supabase
        .from('history').select('data, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
    if (error) { console.error('[sync] fetchCloudHistory:', error); return null; }
    return (data || []).map(r => r.data);
}

// ─── Batch operations (used by debounced sync queue) ─────────────────

export async function batchSyncFavorites(records) {
    const user = getCurrentUser();
    if (!user || !supabase || records.length === 0) return;
    const rows = records.map(r => ({
        user_id: user.id,
        mal_id: r.mal_id,
        data: r,
        saved_at: new Date(r.savedAt || Date.now()).toISOString(),
    }));
    const { error } = await supabase.from('favorites')
        .upsert(rows, { onConflict: 'user_id,mal_id' });
    if (error) throw error;
}

export async function batchRemoveFavorites(malIds) {
    const user = getCurrentUser();
    if (!user || !supabase || malIds.length === 0) return;
    const { error } = await supabase.from('favorites')
        .delete().eq('user_id', user.id).in('mal_id', malIds);
    if (error) throw error;
}

export async function batchSyncHistory(records) {
    const user = getCurrentUser();
    if (!user || !supabase || records.length === 0) return;
    const rows = records.map(h => ({
        user_id: user.id,
        anime_id: String(h.id),
        data: h,
        updated_at: new Date(h.updatedAt || Date.now()).toISOString(),
    }));
    const { error } = await supabase.from('history')
        .upsert(rows, { onConflict: 'user_id,anime_id' });
    if (error) throw error;
}

export async function syncSettings(settings) {
    const user = getCurrentUser();
    if (!user || !supabase) return;
    const { error } = await supabase.from('user_settings').upsert({
        user_id: user.id,
        settings,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) throw error;
}

export async function fetchCloudSettings() {
    if (!supabase) return null;
    const user = getCurrentUser();
    if (!user) return null;
    const { data, error } = await supabase
        .from('user_settings').select('settings')
        .eq('user_id', user.id).single();
    if (error) {
        if (error.code !== 'PGRST116') console.error('[sync] fetchCloudSettings:', error);
        return null;
    }
    return data?.settings ?? null;
}

export async function importLocalToCloud(favs, hist) {
    const user = getCurrentUser();
    if (!user || !supabase) return;

    if (favs.length) {
        const rows = favs.map(f => ({
            user_id: user.id,
            mal_id: f.mal_id,
            data: f,
            saved_at: new Date(f.savedAt || Date.now()).toISOString(),
        }));
        const { error } = await supabase.from('favorites')
            .upsert(rows, { onConflict: 'user_id,mal_id' });
        if (error) throw error;
    }

    if (hist.length) {
        const rows = hist.map(h => ({
            user_id: user.id,
            anime_id: String(h.id),
            data: h,
            updated_at: new Date(h.updatedAt || Date.now()).toISOString(),
        }));
        const { error } = await supabase.from('history')
            .upsert(rows, { onConflict: 'user_id,anime_id' });
        if (error) throw error;
    }
}
