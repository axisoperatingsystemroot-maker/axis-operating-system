'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Customer = {
  id: string
  name: string
  email: string
  phone: string
}

export default function DashboardPage() {
  const [customers, setCustomers] = useState<Customer[]>([])

  useEffect(() => {
    const fetchCustomers = async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')

      if (error) {
        console.error('Error fetching customers:', error)
      } else {
        setCustomers(data || [])
      }
    }

    fetchCustomers()
  }, [])

  return (
    <div>
        <button
  onClick={async () => {
    await supabase.auth.signOut()
    window.location.href = "/"
  }}
  className="mb-4 bg-red-600 text-white px-4 py-2"
>
  Sign Out
</button>
      <h2 className="text-2xl font-semibold mb-6">Dashboard</h2>

      <div className="space-y-4">
        {customers.length === 0 ? (
          <p>No customers found.</p>
        ) : (
          customers.map((customer) => (
            <div
              key={customer.id}
              className="bg-gray-900 p-4 rounded border border-gray-800"
            >
              <p className="font-semibold">{customer.name}</p>
              <p className="text-sm text-gray-400">{customer.email}</p>
              <p className="text-sm text-gray-400">{customer.phone}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}