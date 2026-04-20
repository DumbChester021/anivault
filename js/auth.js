import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.3';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export let supabase = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

let _currentUser = null;
const _listeners = [];

export const isConfigured = () => !!supabase;
export const getCurrentUser = () => _currentUser;
export const isLoggedIn = () => _currentUser !== null;

export function onAuthChange(cb) {
    _listeners.push(cb);
}

export function initAuth() {
    if (!supabase) return;
    supabase.auth.onAuthStateChange((event, session) => {
        _currentUser = session?.user ?? null;
        for (const cb of _listeners) cb(event, session);
    });
}

export async function signInWithEmail(email, password) {
    if (!supabase) throw new Error('Supabase not configured — add URL/key to config.js');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

export async function signUpWithEmail(email, password) {
    if (!supabase) throw new Error('Supabase not configured — add URL/key to config.js');
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
}

export async function signInWithGoogle() {
    if (!supabase) throw new Error('Supabase not configured — add URL/key to config.js');
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
}

export async function resendConfirmation(email) {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
    });
    if (error) throw error;
}

export async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
}
