import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

// Zastąp te wartości swoimi kluczami z Supabase
const supabaseUrl = 'https://yvkocxmvtqtxzvadyngr.supabase.co';
const supabaseAnonKey = 'sb_publishable_iivsAQYI7rWgPRwrZfT97w_o3OSS-4N';

// Atrapa pamięci, która powstrzymuje Supabase przed użyciem domyślnego, zepsutego na Webie AsyncStorage
const DummyStorage = {
  getItem: () => null,
  setItem: () => null,
  removeItem: () => null,
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: DummyStorage,
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});
