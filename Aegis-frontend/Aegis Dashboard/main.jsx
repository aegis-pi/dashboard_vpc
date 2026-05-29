// ─── App router & mount (App.tsx + main.tsx) ────────────────────────────
function App() {
  const { path } = useRouter()
  // re-init lucide icons whenever route changes
  useEffect(() => { if (window.lucide) window.lucide.createIcons() })

  if (path === '/login') return <LoginPage />
  if (path === '/reports') return <ReportsPage />
  if (path.startsWith('/factory/')) {
    const factoryId = decodeURIComponent(path.slice('/factory/'.length).split('/')[0])
    return <FactoryPage factoryId={factoryId} />
  }
  return <FleetPage />
}

const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(<RouterProvider><App /></RouterProvider>)
