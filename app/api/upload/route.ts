import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';

// Custom PDF text extraction that doesn't rely on pdf-parse's buggy import
async function extractPdfText(buffer: Buffer): Promise<string> {
  // Use pdf-parse's underlying function directly to avoid the test file loading bug
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdf = require('pdf-parse/lib/pdf-parse');
  const data = await pdf(buffer);
  return data.text;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const fileName = file.name.toLowerCase();

    let extractedText = '';

    if (fileName.endsWith('.pdf')) {
      // Parse PDF using custom function that avoids the test file bug
      extractedText = await extractPdfText(buffer);
    } else if (fileName.endsWith('.docx')) {
      // Parse Word document
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    } else if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
      // Plain text files
      extractedText = buffer.toString('utf-8');
    } else {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload PDF, DOCX, TXT, or MD files.' },
        { status: 400 }
      );
    }

    // Clean up the extracted text
    extractedText = extractedText
      .replace(/\s+/g, ' ')
      .trim();

    // Truncate if too long (to fit in context window)
    const maxLength = 50000;
    if (extractedText.length > maxLength) {
      extractedText = extractedText.substring(0, maxLength) + '... [Document truncated due to length]';
    }

    return NextResponse.json({
      success: true,
      fileName: file.name,
      text: extractedText,
      characterCount: extractedText.length,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to process file' },
      { status: 500 }
    );
  }
}
