import { createClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
export const SUPABASE_URL = rawUrl
  .replace(/\/rest\/v1\/?$/, '')
  .replace(/\/+$/, '');

export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = createClient(
  SUPABASE_URL || 'https://fhfcxmeesizklkjwlpbr.supabase.co',
  SUPABASE_ANON_KEY || 'sb_publishable_8oXUPRpy87cnAQ-BCuGpng_KHIYQrBQ',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
