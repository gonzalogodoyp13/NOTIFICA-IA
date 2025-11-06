// Client-side authentication utilities
// These functions can be called from Client Components
'use client'

import { supabase } from './supabaseClient'

/**
 * Sign in with email and password (client-side)
 * @param email User email
 * @param password User password
 * @returns Success status and optional error message
 */
export async function signIn(email: string, password: string) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido',
    }
  }
}

/**
 * Sign out the current user (client-side)
 */
export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Error signing out:', error)
    }
  } catch (error) {
    console.error('Error signing out:', error)
  }
}

