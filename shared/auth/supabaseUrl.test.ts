import { describe, expect, it } from 'vitest';
import { supabaseProjectUrl } from './supabaseUrl.ts';

describe('supabaseProjectUrl', () => {
  it('keeps only the project origin', () => {
    expect(supabaseProjectUrl('https://abcd.supabase.co')).toBe('https://abcd.supabase.co');
    expect(supabaseProjectUrl(' https://abcd.supabase.co/ ')).toBe('https://abcd.supabase.co');
    expect(supabaseProjectUrl('https://abcd.supabase.co/rest/v1/')).toBe('https://abcd.supabase.co');
    expect(supabaseProjectUrl('https://abcd.supabase.co/auth/v1')).toBe('https://abcd.supabase.co');
    expect(supabaseProjectUrl('http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321');
  });

  it('rejects missing or invalid values', () => {
    expect(supabaseProjectUrl(undefined)).toBeNull();
    expect(supabaseProjectUrl('  ')).toBeNull();
    expect(supabaseProjectUrl('abcd.supabase.co')).toBeNull();
    expect(supabaseProjectUrl('ftp://abcd.supabase.co')).toBeNull();
  });
});
