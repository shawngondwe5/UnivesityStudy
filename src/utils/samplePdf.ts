/**
 * Generates a valid multi-page PDF Blob locally in memory for immediate offline testing.
 */
export function createSamplePdfBlob(title: string, course: string, pageCount: number = 8): Blob {
  const objects: string[] = [];
  let objIndex = 1;

  const catalogObj = `${objIndex} 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  objIndex++;

  const pageObjRefs: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    pageObjRefs.push(`${3 + i * 2} 0 R`);
  }

  const pagesObj = `2 0 obj\n<< /Type /Pages /Kids [${pageObjRefs.join(' ')}] /Count ${pageCount} >>\nendobj\n`;
  objIndex++;

  const pageObjects: string[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const contentObjNum = 3 + (i - 1) * 2 + 1;
    const pageObjNum = 3 + (i - 1) * 2;

    const safeCourse = course.replace(/[()\\]/g, '');
    const safeTitle = title.replace(/[()\\]/g, '');

    const streamContent = 
`BT
/F1 20 Tf
50 720 Td
(${safeCourse}) Tj
ET
BT
/F1 16 Tf
50 680 Td
(${safeTitle} - Page ${i}) Tj
ET
BT
/F2 12 Tf
50 620 Td
(University Academic Reading Document - Page ${i} of ${pageCount}) Tj
ET
BT
/F2 11 Tf
50 570 Td
(Key Concept: Structured analytical methods and empirical findings in higher education.) Tj
50 540 Td
(Study Note: Review key definitions and compare with previous lecture takeaways.) Tj
50 510 Td
(Offline Persistence: Stored in browser IndexedDB. Preserved across sessions.) Tj
ET
0.15 0.38 0.92 rg
50 750 495 4 re f
`;
    const streamLength = streamContent.length;

    const pageObj = `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentObjNum} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>\nendobj\n`;
    const contentObj = `${contentObjNum} 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}endstream\nendobj\n`;

    pageObjects.push(pageObj, contentObj);
  }

  const allObjs = [catalogObj, pagesObj, ...pageObjects];
  let body = '%PDF-1.4\n';
  const xrefOffsets: number[] = [0];

  for (const obj of allObjs) {
    xrefOffsets.push(body.length);
    body += obj;
  }

  const xrefOffset = body.length;
  let xref = `xref\n0 ${xrefOffsets.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < xrefOffsets.length; i++) {
    xref += xrefOffsets[i].toString().padStart(10, '0') + ' 00000 n \n';
  }

  const trailer = `trailer\n<< /Size ${xrefOffsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([body + xref + trailer], { type: 'application/pdf' });
}
