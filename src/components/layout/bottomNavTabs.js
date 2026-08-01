import { ClipboardList, LayoutGrid, Package, ConciergeBell, Printer } from 'lucide-react'

// La barra inferior es acceso rápido en el celular, no el menú completo: se
// curan a mano 2-4 tabs por rol. A diferencia del sidebar no se deriva de la
// matriz (no entran 20 secciones en una barra), pero SÍ se filtra por permiso:
// si le sacás una sección a un rol, el tab desaparece.
export const TABS_BY_ROLE = {
  cocina: [
    { to: '/operaciones', recurso: 'operaciones', icon: LayoutGrid,    label: 'Inicio' },
    // KDS oculto temporalmente.
    // { to: '/cocina', recurso: 'cocina_kds', icon: ChefHat, label: 'Cocina' },
    { to: '/produccion',  recurso: 'produccion',  icon: ClipboardList, label: 'Produccion' },
  ],
  mozo: [
    { to: '/mesas',         recurso: 'mesas',         icon: LayoutGrid,    label: 'Mesas'  },
    { to: '/platos',        recurso: 'platos',        icon: ConciergeBell, label: 'Platos' },
    { to: '/stock',         recurso: 'stock',         icon: Package,       label: 'Stock'  },
    { to: '/configuracion', recurso: 'configuracion', icon: Printer,       label: 'Impresora' },
  ],
}

export const TIENEN_BARRA_INFERIOR = new Set(Object.keys(TABS_BY_ROLE))
