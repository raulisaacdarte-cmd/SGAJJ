import fs from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';
import { resolveSafeUploadPath } from './uploads';

export interface ArticlePdfData {
  slug: string;
  title: string;
  subtitle?: string | null;
  summary: string;
  content: string;
  category: string;
  author_name: string;
  published_at?: string | null;
  organization_name?: string;
  slogan?: string;
  logo_path?: string | null;
  contact_email?: string;
  headquarters_address?: string;
}

export function sanitizePdfText(input: string): string {
  return (input || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '');
}

export function resolveLogoFileForPdf(logoPath?: string | null): { dataUri: string; format: 'JPEG' | 'PNG' } | null {
  const candidates: string[] = [];

  if (logoPath && logoPath.startsWith('/api/files/')) {
    const segments = logoPath.replace('/api/files/', '').split('/').filter(Boolean);
    const resolved = resolveSafeUploadPath(segments);
    if (resolved) candidates.push(resolved);
  } else if (logoPath && logoPath.startsWith('/')) {
    const publicRoot = path.resolve(process.cwd(), 'public');
    const resolved = path.resolve(publicRoot, logoPath.replace(/^\/+/, ''));
    if (resolved.startsWith(publicRoot + path.sep) && fs.existsSync(resolved)) {
      candidates.push(resolved);
    }
  }

  const defaultLogo = path.resolve(process.cwd(), 'public', 'assets', 'aistudio', 'IMG-20260804-WA0073_3cc94a37.jpg');
  if (fs.existsSync(defaultLogo)) {
    candidates.push(defaultLogo);
  }

  for (const filePath of candidates) {
    try {
      const ext = path.extname(filePath).toLowerCase();
      if (ext !== '.jpg' && ext !== '.jpeg' && ext !== '.png') continue;
      const bytes = fs.readFileSync(filePath);
      const format: 'JPEG' | 'PNG' = ext === '.png' ? 'PNG' : 'JPEG';
      const mime = format === 'PNG' ? 'image/png' : 'image/jpeg';
      return {
        dataUri: `data:${mime};base64,${bytes.toString('base64')}`,
        format,
      };
    } catch {
      continue;
    }
  }
  return null;
}

export function generateArticlePdfBuffer(article: ArticlePdfData): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 20;
  const contentWidth = pageWidth - marginX * 2;

  const orgName = sanitizePdfText(article.organization_name || 'Associação de Jovens Juristas (AJJ)');
  const slogan = sanitizePdfText(article.slogan || 'Juntos em prol do bem maior.');
  const logo = resolveLogoFileForPdf(article.logo_path);

  const drawFirstPageHeader = () => {
    doc.setFillColor(11, 31, 58); // Judicial Navy #0B1F3A
    doc.rect(0, 0, pageWidth, 26, 'F');
    doc.setFillColor(166, 134, 58); // Laurel Gold #A6863A
    doc.rect(0, 26, pageWidth, 1.2, 'F');

    if (logo) {
      doc.addImage(logo.dataUri, logo.format, marginX, 4, 18, 18);
    }

    const textStartX = logo ? marginX + 23 : marginX;
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(orgName.toUpperCase(), textStartX, 11.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(217, 185, 101);
    doc.text('A VOZ JURÍDICA · EDIÇÃO PARA LEITURA OFFLINE', textStartX, 18);
  };

  const drawContinuationHeader = () => {
    doc.setFillColor(11, 31, 58);
    doc.rect(0, 0, pageWidth, 13, 'F');
    doc.setFillColor(166, 134, 58);
    doc.rect(0, 13, pageWidth, 0.8, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(sanitizePdfText(article.title).slice(0, 78), marginX, 8.2);
  };

  drawFirstPageHeader();

  let y = 38;

  // Category kicker
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(166, 134, 58);
  doc.text(sanitizePdfText(article.category).toUpperCase(), marginX, y);
  y += 7;

  // Title
  doc.setFont('times', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(11, 31, 58);
  const titleLines = doc.splitTextToSize(sanitizePdfText(article.title), contentWidth);
  doc.text(titleLines, marginX, y);
  y += titleLines.length * 8 + 2;

  // Subtitle
  if (article.subtitle?.trim()) {
    doc.setFont('times', 'italic');
    doc.setFontSize(12);
    doc.setTextColor(71, 85, 105);
    const subLines = doc.splitTextToSize(sanitizePdfText(article.subtitle), contentWidth);
    doc.text(subLines, marginX, y);
    y += subLines.length * 5.8 + 3;
  }

  // Metadata row
  const publishedDate = (article.published_at || new Date().toISOString()).slice(0, 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(sanitizePdfText(`Por ${article.author_name}  |  Publicado em ${publishedDate}`), marginX, y);
  y += 5;

  doc.setDrawColor(226, 232, 240);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 7;

  // Summary block
  if (article.summary?.trim()) {
    doc.setFont('times', 'italic');
    doc.setFontSize(11);
    const summaryLines = doc.splitTextToSize(sanitizePdfText(article.summary), contentWidth - 10);
    const boxHeight = summaryLines.length * 5.6 + 8;

    doc.setFillColor(248, 249, 251);
    doc.setDrawColor(203, 213, 225);
    doc.rect(marginX, y, contentWidth, boxHeight, 'FD');

    doc.setTextColor(30, 41, 59);
    doc.text(summaryLines, marginX + 5, y + 6.5);
    y += boxHeight + 8;
  }

  // Body content paragraphs
  doc.setFont('times', 'normal');
  doc.setFontSize(11.5);
  doc.setTextColor(30, 41, 59);

  const paragraphs = article.content
    .split(/\n+/)
    .map((p) => sanitizePdfText(p.trim()))
    .filter(Boolean);

  const maxY = pageHeight - 24;

  for (const para of paragraphs) {
    const lines = doc.splitTextToSize(para, contentWidth);
    for (const line of lines) {
      if (y > maxY) {
        doc.addPage();
        drawContinuationHeader();
        doc.setFont('times', 'normal');
        doc.setFontSize(11.5);
        doc.setTextColor(30, 41, 59);
        y = 24;
      }
      doc.text(line, marginX, y);
      y += 6;
    }
    y += 4;
  }

  // Running footers on all pages
  const totalPages = doc.getNumberOfPages();
  for (let pageIdx = 1; pageIdx <= totalPages; pageIdx++) {
    doc.setPage(pageIdx);
    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, pageHeight - 16, pageWidth - marginX, pageHeight - 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(166, 134, 58);
    doc.text(slogan, marginX, pageHeight - 10.5);

    doc.setTextColor(100, 116, 139);
    const footerRight = `${orgName}  |  Página ${pageIdx} de ${totalPages}`;
    doc.text(sanitizePdfText(footerRight), pageWidth - marginX, pageHeight - 10.5, { align: 'right' });
  }

  return new Uint8Array(doc.output('arraybuffer'));
}
