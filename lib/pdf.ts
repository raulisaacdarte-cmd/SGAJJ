import { jsPDF } from 'jspdf';
import { generateQrDataUrl } from './qr';
import { buildAngolanBankPaymentInstructions, formatAoa, type AngolanBankCode } from './domain';

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function downloadMemberCardPdf(card: {
  full_name: string;
  member_code: string;
  card_number: string;
  category_name: string;
  province_name: string;
  issued_at: string;
  expires_at: string;
  issuer_name: string;
  status: string;
  photo_path?: string | null;
  verifyUrl: string;
  logoPath?: string;
}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [85.6, 54] });
  const logoData = await loadImageAsDataUrl(card.logoPath || '/assets/aistudio/IMG-20260804-WA0073_3cc94a37.jpg');
  const photoData = card.photo_path ? await loadImageAsDataUrl(card.photo_path) : null;
  const qrData = await generateQrDataUrl(card.verifyUrl);

  // Background
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, 85.6, 54, 'F');

  // Header Navy Banner
  doc.setFillColor(11, 31, 58);
  doc.rect(0, 0, 85.6, 13, 'F');
  doc.setFillColor(166, 134, 58);
  doc.rect(0, 13, 85.6, 0.9, 'F');

  if (logoData) {
    doc.addImage(logoData, 'JPEG', 3, 1.5, 10, 10);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('ASSOCIAÇÃO DE JOVENS JURISTAS', 15, 5.8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(217, 185, 101);
  doc.text('CARTÃO OFICIAL DE IDENTIFICAÇÃO · ANGOLA', 15, 9.6);

  // Photo box
  doc.setDrawColor(203, 213, 225);
  doc.rect(4, 17, 17, 21);
  if (photoData) {
    doc.addImage(photoData, 'JPEG', 4.3, 17.3, 16.4, 20.4);
  } else {
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text('AJJ', 10.5, 28.5);
  }

  // Details
  doc.setTextColor(11, 31, 58);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(card.full_name.slice(0, 32), 23.5, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(71, 85, 105);
  doc.text(`Código: ${card.member_code}`, 23.5, 24.5);
  doc.text(`Categoria: ${card.category_name}`, 23.5, 28.2);
  doc.text(`Província: ${card.province_name}`, 23.5, 31.9);
  doc.text(`Emissão: ${card.issued_at.slice(0, 10)} · Validade: ${card.expires_at.slice(0, 10)}`, 23.5, 35.6);

  // QR Code
  doc.addImage(qrData, 'PNG', 66, 18.5, 16, 16);
  doc.setFontSize(4.8);
  doc.setTextColor(100, 116, 139);
  doc.text('Validar QR', 70, 36.2);

  // Footer
  doc.setDrawColor(226, 232, 240);
  doc.line(4, 42, 81.6, 42);
  doc.setFontSize(5.5);
  doc.setTextColor(11, 31, 58);
  doc.text(`Emissor: ${card.issuer_name}`, 4, 46);
  doc.setTextColor(166, 134, 58);
  doc.text('Juntos em prol do bem maior.', 4, 50);
  doc.setTextColor(71, 85, 105);
  doc.text(`N.º ${card.card_number}`, 56, 50);

  doc.save(`Cartao-AJJ-${card.member_code}.pdf`);
}

export async function downloadAppointmentDocumentPdf(
  docType: 'DESPACHO' | 'TERMO_POSSE',
  appointment: {
    dispatch_number: string;
    term_of_office_number: string;
    province_name: string;
    candidate_name: string;
    role_name: string;
    start_date: string;
    end_date: string;
    duration_months: number;
    process_notes?: string;
    appointed_by_name?: string;
  }
) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const logoData = await loadImageAsDataUrl('/assets/aistudio/IMG-20260804-WA0073_3cc94a37.jpg');

  if (logoData) {
    doc.addImage(logoData, 'JPEG', 90, 14, 30, 30);
  }

  doc.setTextColor(11, 31, 58);
  doc.setFont('times', 'bold');
  doc.setFontSize(14);
  doc.text('ASSOCIAÇÃO DE JOVENS JURISTAS — ANGOLA', 105, 51, { align: 'center' });
  doc.setFont('times', 'italic');
  doc.setFontSize(10);
  doc.setTextColor(166, 134, 58);
  doc.text('Juntos em prol do bem maior.', 105, 57, { align: 'center' });

  doc.setDrawColor(166, 134, 58);
  doc.line(25, 62, 185, 62);

  doc.setTextColor(11, 31, 58);
  doc.setFont('times', 'bold');
  doc.setFontSize(15);

  if (docType === 'DESPACHO') {
    doc.text(`DESPACHO DE NOMEAÇÃO N.º ${appointment.dispatch_number}`, 105, 75, { align: 'center' });
    doc.setFont('times', 'normal');
    doc.setFontSize(11.5);
    const body = [
      `No uso das competências estatutárias que lhe são conferidas enquanto órgão máximo da Direção Central da Associação de Jovens Juristas (AJJ), o Presidente da Associação determina o seguinte:`,
      `1. É nomeado(a) ${appointment.candidate_name} para exercer o cargo de ${appointment.role_name} junto da Coordenação Provincial de ${appointment.province_name}.`,
      `2. O presente mandato tem a duração de ${appointment.duration_months} meses, com início em ${appointment.start_date} e termo previsto para ${appointment.end_date}, nos termos dos Estatutos vigentes da AJJ.`,
      `3. Fica o Secretariado Nacional encarregue de proceder ao registo institucional, emissão do Termo de Posse n.º ${appointment.term_of_office_number} e ativação do respetivo painel provincial na plataforma SGAJJ.`,
      appointment.process_notes ? `Observações do Processo: ${appointment.process_notes}` : '',
    ].filter(Boolean);

    let y = 92;
    for (const para of body) {
      const lines = doc.splitTextToSize(para, 160);
      doc.text(lines, 25, y);
      y += lines.length * 6.5 + 6;
    }

    doc.text(`Luanda, República de Angola, aos ${appointment.start_date}.`, 25, y + 10);
    doc.line(65, y + 36, 145, y + 36);
    doc.setFont('times', 'bold');
    doc.text(appointment.appointed_by_name || 'O Presidente da Associação', 105, y + 42, { align: 'center' });
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    doc.text('Presidência Nacional da AJJ', 105, y + 48, { align: 'center' });
    doc.save(`Despacho-${appointment.dispatch_number.replace(/\//g, '-')}.pdf`);
  } else {
    doc.text(`TERMO DE POSSE N.º ${appointment.term_of_office_number}`, 105, 75, { align: 'center' });
    doc.setFont('times', 'normal');
    doc.setFontSize(11.5);
    const body = [
      `Ao abrigo do Despacho de Nomeação n.º ${appointment.dispatch_number}, compareceu perante a Presidência Nacional da Associação de Jovens Juristas (AJJ) o(a) jurista ${appointment.candidate_name}, a fim de tomar posse formal no cargo de ${appointment.role_name} da Província de ${appointment.province_name}.`,
      `O(A) empossado(a) declara solenemente cumprir e fazer cumprir os Estatutos, Regulamentos internos e o Código de Ética da Associação de Jovens Juristas, defendendo a cultura jurídica, a cidadania, os direitos humanos e a justiça em Angola.`,
      `O mandato decorrerá pelo período estatutário de ${appointment.duration_months} meses, de ${appointment.start_date} a ${appointment.end_date}.`,
    ];

    let y = 92;
    for (const para of body) {
      const lines = doc.splitTextToSize(para, 160);
      doc.text(lines, 25, y);
      y += lines.length * 6.5 + 6;
    }

    doc.line(25, y + 32, 90, y + 32);
    doc.line(120, y + 32, 185, y + 32);
    doc.setFontSize(10);
    doc.text('O(A) Empossado(a)', 57.5, y + 38, { align: 'center' });
    doc.text('O Presidente da AJJ', 152.5, y + 38, { align: 'center' });
    doc.save(`Termo-Posse-${appointment.term_of_office_number.replace(/\//g, '-')}.pdf`);
  }
}

export async function downloadCertificatePdf(cert: {
  participant_name: string;
  activity_title: string;
  activity_type: string;
  start_datetime: string;
  location: string;
  certificate_code: string;
  verifyUrl: string;
}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const logoData = await loadImageAsDataUrl('/assets/aistudio/IMG-20260804-WA0073_3cc94a37.jpg');
  const qrData = await generateQrDataUrl(cert.verifyUrl);

  // Double institutional border
  doc.setDrawColor(11, 31, 58);
  doc.setLineWidth(1.2);
  doc.rect(10, 10, 277, 190);
  doc.setDrawColor(166, 134, 58);
  doc.setLineWidth(0.5);
  doc.rect(14, 14, 269, 182);

  if (logoData) {
    doc.addImage(logoData, 'JPEG', 133.5, 22, 30, 30);
  }

  doc.setTextColor(11, 31, 58);
  doc.setFont('times', 'bold');
  doc.setFontSize(14);
  doc.text('ASSOCIAÇÃO DE JOVENS JURISTAS (AJJ)', 148.5, 60, { align: 'center' });

  doc.setFontSize(26);
  doc.setTextColor(166, 134, 58);
  doc.text('CERTIFICADO DE PARTICIPAÇÃO', 148.5, 76, { align: 'center' });

  doc.setFont('times', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(51, 65, 85);
  doc.text('Certifica-se para os devidos efeitos institucionais que', 148.5, 94, { align: 'center' });

  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(11, 31, 58);
  doc.text(cert.participant_name, 148.5, 108, { align: 'center' });

  doc.setFont('times', 'normal');
  doc.setFontSize(12.5);
  doc.setTextColor(51, 65, 85);
  const desc = `participou com aproveitamento na atividade "${cert.activity_title}" (${cert.activity_type}), realizada em ${cert.location}, na data de ${cert.start_datetime.slice(0, 10)}.`;
  const lines = doc.splitTextToSize(desc, 210);
  doc.text(lines, 148.5, 122, { align: 'center' });

  doc.addImage(qrData, 'PNG', 240, 152, 30, 30);
  doc.setFontSize(8);
  doc.text(`Código: ${cert.certificate_code}`, 255, 186, { align: 'center' });

  doc.line(40, 170, 120, 170);
  doc.setFontSize(10);
  doc.text('Direção Nacional da AJJ', 80, 176, { align: 'center' });
  doc.setTextColor(166, 134, 58);
  doc.text('Juntos em prol do bem maior.', 148.5, 188, { align: 'center' });

  doc.save(`Certificado-${cert.certificate_code}.pdf`);
}

export async function downloadFinancialReceiptPdf(tx: {
  receipt_number: string;
  type: string;
  category: string;
  description: string;
  amount_aoa: number;
  reference_date: string;
  scope: string;
  province_name?: string | null;
  bank_code?: string | null;
  rupe_code?: string | null;
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const logoData = await loadImageAsDataUrl('/assets/aistudio/IMG-20260804-WA0073_3cc94a37.jpg');

  if (logoData) {
    doc.addImage(logoData, 'JPEG', 20, 16, 22, 22);
  }
  doc.setTextColor(11, 31, 58);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('ASSOCIAÇÃO DE JOVENS JURISTAS — TESOURARIA', 48, 24);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(166, 134, 58);
  doc.text(`Recibo Oficial N.º ${tx.receipt_number}`, 48, 31);

  doc.setDrawColor(203, 213, 225);
  doc.line(20, 44, 190, 44);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.text(`Âmbito da Conta: ${tx.scope === 'NACIONAL' ? 'Tesouraria Nacional' : `Fundo Provincial — ${tx.province_name || ''}`}`, 20, 56);
  doc.text(`Tipo de Movimento: ${tx.type}`, 20, 64);
  doc.text(`Categoria: ${tx.category}`, 20, 72);
  doc.text(`Data de Referência: ${tx.reference_date}`, 20, 80);
  doc.text(`Descrição: ${tx.description}`, 20, 88);
  let nextY = 96;
  if (tx.bank_code) {
    doc.text(`Banco / Canal: ${tx.bank_code}`, 20, nextY);
    nextY += 8;
  }
  if (tx.rupe_code) {
    doc.text(`Referência RUPE: ${tx.rupe_code}`, 20, nextY);
    nextY += 8;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(11, 31, 58);
  doc.text(`Valor: ${formatAoa(tx.amount_aoa)}`, 20, nextY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Documento emitido eletronicamente pelo SGAJJ com registo imutável de auditoria.', 20, nextY + 28);
  doc.save(`Recibo-${tx.receipt_number}.pdf`);
}

export async function downloadRupePaymentGuidePdf(rupe: {
  rupe_code: string;
  rupe_formatted: string;
  bank_code: AngolanBankCode;
  bank_name: string;
  beneficiary_iban: string;
  beneficiary_iban_ao06: string;
  beneficiary_name: string;
  amount_aoa: number;
  reference_month: string;
  expires_at: string;
  member_name?: string | null;
  member_code?: string | null;
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const logoData = await loadImageAsDataUrl('/assets/aistudio/IMG-20260804-WA0073_3cc94a37.jpg');
  const qrPayload = `RUPE:${rupe.rupe_code}|IBAN:${rupe.beneficiary_iban_ao06}|AOA:${rupe.amount_aoa}|REF:${rupe.reference_month}`;
  const qrData = await generateQrDataUrl(qrPayload);

  if (logoData) {
    doc.addImage(logoData, 'JPEG', 20, 14, 22, 22);
  }
  doc.setTextColor(11, 31, 58);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.text('ASSOCIAÇÃO DE JOVENS JURISTAS (AJJ) — ANGOLA', 46, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(166, 134, 58);
  doc.text('GUIA OFICIAL DE PAGAMENTO DE QUOTA · RUPE BANCÁRIO', 46, 29);

  doc.setDrawColor(166, 134, 58);
  doc.line(20, 41, 190, 41);

  // Highlighted RUPE + IBAN Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(20, 47, 170, 42, 3, 3, 'FD');

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8.5);
  doc.text('REFERÊNCIA ÚNICA DE PAGAMENTO (RUPE)', 26, 55);
  doc.setTextColor(11, 31, 58);
  doc.setFont('courier', 'bold');
  doc.setFontSize(15);
  doc.text(rupe.rupe_formatted, 26, 63);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text('IBAN INSTITUCIONAL DESTINO (BANCO BAI · 0040)', 26, 72);
  doc.setFont('courier', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(11, 31, 58);
  doc.text(`${rupe.beneficiary_iban_ao06}  (${rupe.beneficiary_iban})`, 26, 79);

  doc.addImage(qrData, 'PNG', 158, 51, 26, 26);

  // Payment details
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  let y = 101;
  const rows = [
    ['Beneficiário:', rupe.beneficiary_name],
    ['Banco Pagador Selecionado:', rupe.bank_name],
    ['Associado:', `${rupe.member_name || 'Associado AJJ'}${rupe.member_code ? ` (${rupe.member_code})` : ''}`],
    ['Mês de Referência:', rupe.reference_month],
    ['Montante a Liquidar:', formatAoa(rupe.amount_aoa)],
    ['Validade da Guia:', rupe.expires_at.slice(0, 16).replace('T', ' ')],
  ];
  for (const [label, val] of rows) {
    doc.setFont('helvetica', 'bold');
    doc.text(label, 20, y);
    doc.setFont('helvetica', 'normal');
    doc.text(val, 74, y);
    y += 7.5;
  }

  // Bank-specific instructions
  const instr = buildAngolanBankPaymentInstructions({
    bankCode: rupe.bank_code,
    rupeFormatted: rupe.rupe_formatted,
    amountAoa: rupe.amount_aoa,
    ibanDisplay: rupe.beneficiary_iban,
    ibanAo06: rupe.beneficiary_iban_ao06,
    referenceMonth: rupe.reference_month,
    memberCode: rupe.member_code,
  });

  y += 6;
  doc.setDrawColor(226, 232, 240);
  doc.line(20, y, 190, y);
  y += 9;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(11, 31, 58);
  doc.text(`Instruções de Pagamento — ${instr.channelTitle}`, 20, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  instr.steps.forEach((step, idx) => {
    const wrapped = doc.splitTextToSize(`${idx + 1}. ${step}`, 168);
    doc.text(wrapped, 20, y);
    y += wrapped.length * 5.5 + 2.5;
  });

  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Após efetuar o pagamento, submeta o comprovativo no Portal SGAJJ para emissão automática do recibo.', 20, 276);
  doc.save(`Guia-RUPE-${rupe.rupe_code}.pdf`);
}

export async function downloadFinancialReportPdf(
  title: string,
  transactions: Array<{
    receipt_number: string;
    reference_date: string;
    scope: string;
    type: string;
    category: string;
    description: string;
    amount_aoa: number;
    status: string;
  }>
) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(11, 31, 58);
  doc.text(`SGAJJ — ${title}`, 15, 20);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Gerado em: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, 15, 27);

  let y = 38;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Data', 15, y);
  doc.text('Recibo', 36, y);
  doc.text('Tipo', 68, y);
  doc.text('Descrição', 90, y);
  doc.text('Valor (AOA)', 162, y);
  doc.line(15, y + 2, 195, y + 2);
  y += 8;

  doc.setFont('helvetica', 'normal');
  for (const tx of transactions) {
    if (y > 275) {
      doc.addPage();
      y = 20;
    }
    doc.text(tx.reference_date.slice(0, 10), 15, y);
    doc.text((tx.receipt_number || '-').slice(0, 16), 36, y);
    doc.text(tx.type.slice(0, 10), 68, y);
    doc.text(tx.description.slice(0, 36), 90, y);
    doc.text(formatAoa(tx.amount_aoa), 162, y);
    y += 6.5;
  }
  doc.save(`Relatorio-Financeiro-SGAJJ.pdf`);
}
