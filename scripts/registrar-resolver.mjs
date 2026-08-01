import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register('./resolver-vite.mjs', pathToFileURL(import.meta.filename))
