import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const fileName = file.name.toLowerCase();
    let extractedText = '';

    if (fileName.endsWith('.pdf')) {
      // Use dynamic import for pdf-parse
      const pdfParse = await import('pdf-parse').then(m => m.default || m);
      const pdfData = await pdfParse(buffer);
      extractedText = pdfData.text;
    } else if (fileName.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    } else if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
      extractedText = buffer.toString('utf-8');
    } else {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload PDF, DOCX, TXT, or MD files.' },
        { status: 400 }
      );
    }

    extractedText = extractedText.replace(/\s+/g, ' ').trim();

    const maxLength = 50000;
    if (extractedText.length > maxLength) {
      extractedText = extractedText.substring(0, maxLength) + '... [Document truncated]';
    }

    return NextResponse.json({
      success: true,
      fileName: file.name,
      text: extractedText,
      characterCount: extractedText.length,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Failed to process file' }, { status: 500 });
  }
}
