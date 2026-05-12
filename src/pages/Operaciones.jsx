import { Link } from 'react-router-dom'
import { ChefHat, ClipboardList, ArrowRight, Package, UtensilsCrossed, BookOpen, ReceiptText } from 'lucide-react'

const primarySections = [
  {
    to: '/cocina',
    title: 'Cocina',
    description: 'Ver comandas activas y avanzar pedidos.',
    icon: ChefHat,
    color: '#22c55e',
  },
  {
    to: '/produccion',
    title: 'Produccion',
    description: 'Preparar tareas, recetas y mise en place.',
    icon: ClipboardList,
    color: '#f59e0b',
  },
]

const quickLinks = [
  { to: '/pedidos', label: 'Pedidos', icon: ReceiptText },
  { to: '/menu', label: 'Menu', icon: UtensilsCrossed },
  { to: '/stock', label: 'Inventario', icon: Package },
  { to: '/recetas', label: 'Recetas', icon: BookOpen },
]

function SectionCard({ section }) {
  const Icon = section.icon

  return (
    <Link
      to={section.to}
      className="group block rounded-lg p-5 sm:p-6 transition-all active:scale-[0.99]"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center"
          style={{ background: `${section.color}1A`, color: section.color }}
        >
          <Icon size={25} />
        </div>
        <ArrowRight
          size={20}
          className="transition-transform group-hover:translate-x-1"
          style={{ color: 'var(--text-muted)' }}
        />
      </div>
      <div className="mt-8">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {section.title}
        </h2>
        <p className="mt-2 text-sm sm:text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {section.description}
        </p>
      </div>
    </Link>
  )
}

export default function Operaciones() {
  return (
    <div className="min-h-full px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-5 sm:mb-7">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Kiku Sushi
          </p>
          <h1 className="mt-2 text-2xl sm:text-4xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Operaciones
          </h1>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          {primarySections.map(section => (
            <SectionCard key={section.to} section={section} />
          ))}
        </section>

        <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {quickLinks.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex min-h-24 flex-col justify-between rounded-lg p-4 transition-colors hover:bg-[var(--bg-card-hover)]"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
            >
              <Icon size={20} style={{ color: 'var(--accent)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</span>
            </Link>
          ))}
        </section>
      </div>
    </div>
  )
}
