import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';

// Force Node.js runtime for this route
export const runtime = 'nodejs';

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
      // Dynamic import for pdf-parse to work with serverless
      try {
        const pdfParse = (await import('pdf-parse')).default;
        const pdfData = await pdfParse(buffer);
        extractedText = pdfData.text;
      } catch (pdfError) {
        console.error('PDF parsing error:', pdfError);
        return NextResponse.json(
          { error: 'Failed to parse PDF. Please try a different file.' },
          { status: 400 }
        );
      }
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
