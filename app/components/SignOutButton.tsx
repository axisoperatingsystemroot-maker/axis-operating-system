'use client'

import { supabase } from '@/lib/supabase'

export default function SignOutButton() {
  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="rounded bg-red-700 px-3 py-1.5 text-xs text-white hover:bg-red-600"
    >
      Sign Out
    </button>
  )
}