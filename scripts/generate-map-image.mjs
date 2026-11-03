import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {siteConfig} from '../assets/js/site-config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'assets', 'img');
const key = process.env.GOOGLE_MAPS_STATIC_KEY?.trim();

if (!key) {
  if (process.env.NETLIFY === 'true') {
    throw new Error('[map] GOOGLE_MAPS_STATIC_KEY is required for Netlify builds.');
  }
  console.warn('[map] GOOGLE_MAPS_STATIC_KEY is not set; keeping any existing generated map images.');
} else {
  const mapUrl = new URL('https://maps.googleapis.com/maps/api/staticmap');
  mapUrl.searchParams.set('center', siteConfig.mapsCenter);
  mapUrl.searchParams.set('zoom', '16');
  mapUrl.searchParams.set('size', '640x400');
  mapUrl.searchParams.set('scale', '2');
  mapUrl.searchParams.set('format', 'png');
  mapUrl.searchParams.set('maptype', 'roadmap');
  mapUrl.searchParams.set('markers', `color:red|label:C|${siteConfig.mapsCenter}`);
  mapUrl.searchParams.set('key', key);

  const response = await fetch(mapUrl, {signal: AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error(`[map] Google Static Maps returned HTTP ${response.status}.`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('image/')) {
    throw new Error('[map] Google Static Maps did not return an image.');
  }

  const image = sharp(Buffer.from(await response.arrayBuffer()));
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || metadata.width < 640 || metadata.height < 400) {
    throw new Error('[map] The generated map image has unexpected dimensions.');
  }

  await mkdir(outputDirectory, {recursive: true});
  await image.clone().resize(640, 400, {fit: 'cover'}).webp({quality: 80})
    .toFile(path.join(outputDirectory, 'map-chapel.webp'));
  await image.clone().resize(1280, 800, {fit: 'cover'}).webp({quality: 82})
    .toFile(path.join(outputDirectory, 'map-chapel-2x.webp'));
  console.log('[map] Generated public 1x and 2x map images.');
}
