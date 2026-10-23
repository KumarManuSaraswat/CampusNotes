/** Team-owned, deterministic PDF fixtures with real object offsets; no downloaded user documents. */
export function testPdf(pages: Array<{ text?: string; image?: boolean }>, locked = false): Buffer {
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  pages.forEach(({ text = '', image = false }, i) => {
    const escaped = text.replace(/([\\()])/g, '\\$1');
    const stream =
      (text ? `BT /F1 8 Tf 50 700 Td (${escaped}) Tj ET\n` : '') +
      (image ? 'q 50 0 0 50 50 500 cm BI /W 1 /H 1 /CS /RGB /BPC 8 ID \x20\x40\x60 EI Q\n' : '');
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
    );
    objects.push(
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    );
  });
  // A standard-security dictionary with nonmatching password entries exercises the
  // parser's password challenge. No private password or document content is used.
  if (locked)
    objects.push(
      `<< /Filter /Standard /V 1 /R 2 /O <${'00'.repeat(32)}> /U <${'00'.repeat(32)}> /P -4 >>`,
    );
  let output = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(output, 'latin1'));
    output += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output, 'latin1');
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${locked ? `/Encrypt ${objects.length} 0 R /ID [<00112233445566778899aabbccddeeff00><00112233445566778899aabbccddeeff00>]` : ''} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, 'latin1');
}
