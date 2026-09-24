import { createInertiaApp } from '@inertiajs/react'
import { createRoot } from 'react-dom/client'
import Layout from './components/Layout'
import { AuthProvider } from './context/AuthContext'
import './index.css'

createInertiaApp({
  resolve: name => {
    const pages = import.meta.glob('./pages/**/*.tsx', { eager: true }) as Record<string, any>
    const page = pages[`./pages/${name}.tsx`]

    if (name === 'LoginPage' || name === 'SuperAdmin/AdminLoginPage' || name.startsWith('SuperAdmin/')) {
      // Login page and SuperAdmin pages: just render the page directly (no main sidebar layout)
      page.default.layout = page.default.layout
        ?? ((page: React.ReactNode) => <AuthProvider>{page}</AuthProvider>)
    } else {
      // All other pages: wrap with AuthProvider + Layout
      page.default.layout = page.default.layout
        ?? ((page: React.ReactNode) => (
          <AuthProvider>
            <Layout>{page}</Layout>
          </AuthProvider>
        ))
    }

    return page
  },
  setup({ el, App, props }) {
    createRoot(el).render(<App {...props} />)
  },
})
