import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

// The project URL and publishable key are public by design: they ship inside
// every copy of the app, and row-level security is the real boundary. They
// are built in as defaults so the app runs without a .env file; set
// EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY to point at a
// different project. Never put the service-role key here.
const DEFAULT_URL = 'https://vcnhffafeqkvjgokyych.supabase.co';
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_9Kbx6wGFjeWbWCCEcU_MiQ_aWFmYaMZ';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || DEFAULT_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || DEFAULT_PUBLISHABLE_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
