// Рендерит PNG-иконки из SVG (docs/design → ADR 0008): один раз локально, не часть сборки.
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const icons = fileURLToPath(new URL('../public/icons/', import.meta.url));
const scripts = fileURLToPath(new URL('.', import.meta.url));

await Promise.all([
  sharp(icons + 'favicon.svg')
    .resize(192, 192)
    .png()
    .toFile(icons + 'icon-192.png'),
  sharp(icons + 'favicon.svg')
    .resize(512, 512)
    .png()
    .toFile(icons + 'icon-512.png'),
  sharp(icons + 'favicon.svg')
    .resize(180, 180)
    .png()
    .toFile(icons + 'apple-touch-icon.png'),
  sharp(scripts + 'icon-maskable-source.svg')
    .resize(512, 512)
    .png()
    .toFile(icons + 'icon-maskable-512.png'),
]);

console.log('Иконки собраны в public/icons/');
