'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function CustomersPage() {
  const router = useRouter()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreateCustomer = async () => {
    setLoading(true)

    // 1️⃣ Get current user's tenant_id
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('tenant_id')
      .single()

  if (profileError || !profile) {
  alert("PROFILE ERROR: " + JSON.stringify(profileError))
  console.log("PROFILE ERROR:", profileError)
  setLoading(false)
  return
}

    // 2️⃣ Insert customer with tenant_id
    const { error } = await supabase
      .from('customers')
      .insert({
        name,
        email,
        phone,
        tenant_id: profile.tenant_id,
      })

    if (error) {
      console.error('Insert error:', error)
    } else {
      router.push('/dashboard')
    }

    setLoading(false)
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6">Create Customer</h2>

      <div className="space-y-4 max-w-md">
        <input
          className="w-full p-2 bg-gray-900 border border-gray-700"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="w-full p-2 bg-gray-900 border border-gray-700"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full p-2 bg-gray-900 border border-gray-700"
          placeholder="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />

        <button
          onClick={handleCreateCustomer}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2"
        >
          {loading ? 'Creating...' : 'Create Customer'}
        </button>
      </div>
    </div>
  )
}