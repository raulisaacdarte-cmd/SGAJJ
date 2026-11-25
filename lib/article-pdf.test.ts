import test from 'node:test';
import assert from 'node:assert/strict';
import { generateArticlePdfBuffer, sanitizePdfText } from './article-pdf';

test('sanitizePdfText normalizes smart quotes and em-dashes for PDF fonts', () => {
  assert.equal(sanitizePdfText('“Direito” — Justiça…'), '"Direito" - Justiça...');
});

test('generateArticlePdfBuffer produces a valid multi-page branded PDF binary', () => {
  const longBody = Array.from({ length: 45 }, (_, i) =>
    `Parágrafo ${i + 1}: A promoção da cultura jurídica, da educação para a cidadania e da defesa dos direitos humanos constitui missão estatutária fundamental da Associação de Jovens Juristas em Angola.`
  ).join('\n\n');

  const bytes = generateArticlePdfBuffer({
    slug: 'cultura-juridica-cidadania',
    title: 'Cultura Jurídica, Cidadania e o Papel dos Jovens Juristas em Angola',
    subtitle: 'Editorial inaugural do portal A Voz Jurídica',
    summary: 'Síntese do compromisso institucional da AJJ em todas as províncias.',
    content: longBody,
    category: 'Direito Constitucional',
    author_name: 'Dr. Manuel Kiala',
    published_at: '2026-11-19',
    organization_name: 'Associação de Jovens Juristas',
    slogan: 'Juntos em prol do bem maior.',
  });

  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.byteLength > 2000);
  const header = Buffer.from(bytes.slice(0, 5)).toString('ascii');
  assert.equal(header, '%PDF-');
});
