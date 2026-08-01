// Hook de resolución para Node: los módulos de src/ importan sin extensión
// ('./role'), que es lo que resuelve Vite pero no Node a secas. Con esto los
// scripts de verificación importan el código real de la app, sin copias ni
// mocks que se desactualicen.
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context)
  } catch (err) {
    if (specifier.startsWith('.') && !/\.[mc]?jsx?$/.test(specifier)) {
      return await next(`${specifier}.js`, context)
    }
    throw err
  }
}
