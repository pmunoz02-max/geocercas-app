useEffect(() => {
  let cancelled = false

  async function bootstrap() {
    try {
      setLoading(true)

      const res = await fetch('/api/auth/session', {
        credentials: 'include'
      })
      const data = await res.json()

      if (!data.authenticated) {
        setAuth(null)
        return
      }

      setUser(data.user)

      // 🔑 CLAVE: current_org_id viene del backend
      if (data.current_org_id) {
        setCurrentOrgId(data.current_org_id)
      } else {
        setCurrentOrgId(null) // pero NO bloquea la app
      }

      setReady(true)
    } catch (e) {
      console.error(e)
      setError(e)
    } finally {
      if (!cancelled) setLoading(false)
    }
  }

  bootstrap()
  return () => { cancelled = true }
}, [])
