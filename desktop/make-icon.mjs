// public/logo.svg → desktop/logo.ico (16~256px PNG 항목을 담은 ICO)
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'

const svg = readFileSync(new URL('../public/logo.svg', import.meta.url))
const sizes = [16, 24, 32, 48, 64, 128, 256]
const pngs = await Promise.all(sizes.map((s) => sharp(svg, { density: 384 }).resize(s, s).png().toBuffer()))

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4)
let offset = 6 + 16 * sizes.length
const entries = sizes.map((s, i) => {
  const e = Buffer.alloc(16)
  e.writeUInt8(s >= 256 ? 0 : s, 0); e.writeUInt8(s >= 256 ? 0 : s, 1)
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6)
  e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(offset, 12)
  offset += pngs[i].length
  return e
})
writeFileSync(new URL('./logo.ico', import.meta.url), Buffer.concat([header, ...entries, ...pngs]))
console.log('logo.ico written')
