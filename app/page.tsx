"use client"

import { useState, useEffect } from "react"
import { createClient } from "@supabase/supabase-js"
import { useRouter } from "next/navigation"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function Home() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [message, setMessage] = useState("")
  const router = useRouter()

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        router.push("/dashboard")
      }
    }
    checkUser()
  }, [router])

  const signUp = async () => {
    if (!companyName) {
      setMessage("Company name is required.")
      return
    }

    // 1️⃣ Create auth user
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    if (!data.user) {
      setMessage("User creation failed.")
      return
    }

    const userId = data.user.id

    // 2️⃣ Create new tenant
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .insert({
        name: companyName,
      })
      .select()
      .single()

    if (tenantError) {
      setMessage("Tenant creation failed: " + tenantError.message)
      return
    }

    // 3️⃣ Create profile tied to tenant
    const { error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: userId,
        tenant_id: tenant.id,
        role: "owner",
      })

    if (profileError) {
      setMessage("Profile creation failed: " + profileError.message)
      return
    }

    setMessage("Signup successful. Check your email.")
  }

  const signIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) {
      setMessage(error.message)
    } else {
      router.push("/dashboard")
    }
  }

  return (
    <main className="p-10">
      <h1 className="text-3xl font-bold mb-6">
        AXIS OPERATING SYSTEM
      </h1>

      <div className="flex flex-col gap-4 max-w-md">
        <input
          type="text"
          placeholder="Company Name"
          className="border p-2"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
        />

        <input
          type="email"
          placeholder="Email"
          className="border p-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          className="border p-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={signUp}
          className="bg-black text-white p-2"
        >
          Sign Up
        </button>

        <button
          onClick={signIn}
          className="bg-gray-700 text-white p-2"
        >
          Sign In
        </button>

        <p>{message}</p>
      </div>
    </main>
  )
}