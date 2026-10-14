import { NextRequest, NextResponse } from 'next/server';

export interface PhotoRowResult {
  product: string;
  pack: string;
  printed: number;
  handwritten: number | null;
  ticked: boolean;
  uncertain: boolean;
  accepted: number;
  reason?: string | null;
}

export interface PhotoReadResponse {
  date: string | null;
  printedTotal: number | null;
  rows: PhotoRowResult[];
  rawSummary?: string;
  isDemoFallback?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const { imageBase64, mimeType = 'image/jpeg', type = 'delivery_note' } = await request.json();

    if (!imageBase64) {
      return NextResponse.json({ error: 'imageBase64 is required' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    // 1. If Anthropic API key is configured, call Claude Vision
    if (apiKey && apiKey !== 'your_anthropic_api_key' && !apiKey.startsWith('paste_')) {
      try {
        const promptText = type === 'delivery_note'
          ? `You are an expert OCR system for Indian fruit and vegetable supply delivery notes from Flipkart.
A delivery note table has columns: Sl. No., Articles / Description, Pack Size, Qty. Delivered.
The printed number is the indent (ordered packs).
The receiver marks each row:
- A tick with no new number means accepted as printed.
- A handwritten number beside or instead of the printed one is the accepted quantity (the printed number is often circled or crossed).
- Photos may be rotated, dim, or creased. Ignore the vendor's GSTIN, contact, and address.

Return JSON ONLY (no markdown formatting, no commentary) matching this schema:
{
  "date": "YYYY-MM-DD or null",
  "printedTotal": 123,
  "rows": [
    {
      "product": "French Beans",
      "pack": "250g",
      "printed": 24,
      "handwritten": null,
      "ticked": true,
      "uncertain": false,
      "accepted": 24,
      "reason": null
    }
  ]
}

Rules:
- Include every single row in the table.
- Never guess a digit: set handwritten to null and uncertain to true instead.
- accepted = handwritten if present, else printed if ticked, else null.
- If accepted < printed, look for a rejection reason note (e.g., size, freshness, damage, colour, weight_count, short_supply, late).`
          : `You are an OCR system for daily fruit and vegetable order sheets from Flipkart.
Extract the table of ordered items.
Return JSON ONLY:
{
  "date": "YYYY-MM-DD or null",
  "printedTotal": 123,
  "rows": [
    {
      "product": "French Beans",
      "pack": "250g",
      "printed": 24,
      "handwritten": null,
      "ticked": false,
      "uncertain": false,
      "accepted": 24
    }
  ]
}`;

        const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 2000,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: mimeType,
                      data: imageBase64,
                    },
                  },
                  {
                    type: 'text',
                    text: promptText,
                  },
                ],
              },
            ],
          }),
        });

        if (anthropicRes.ok) {
          const resData = await anthropicRes.json();
          const content = resData.content?.[0]?.text || '';
          const cleanedJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleanedJson) as PhotoReadResponse;
          return NextResponse.json(parsed);
        } else {
          console.warn('Anthropic API responded with error, falling back to sample structure:', await anthropicRes.text());
        }
      } catch (err) {
        console.error('Claude API call failed:', err);
      }
    }

    // 2. Demo / Fallback Mode (Allows testing full UI review flow without blocking on external API key)
    const fallbackResponse: PhotoReadResponse = {
      date: new Date().toISOString().slice(0, 10),
      printedTotal: 268,
      isDemoFallback: true,
      rows: [
        {
          product: 'French Beans',
          pack: '250g',
          printed: 24,
          handwritten: null,
          ticked: true,
          uncertain: false,
          accepted: 24,
          reason: null,
        },
        {
          product: 'Beetroot',
          pack: '500g',
          printed: 70,
          handwritten: null,
          ticked: true,
          uncertain: false,
          accepted: 70,
          reason: null,
        },
        {
          product: 'Brinjal Bharta',
          pack: '500g',
          printed: 49,
          handwritten: null,
          ticked: true,
          uncertain: false,
          accepted: 49,
          reason: null,
        },
        {
          product: 'Long Purple Brinjal',
          pack: '500g',
          printed: 50,
          handwritten: null,
          ticked: true,
          uncertain: false,
          accepted: 50,
          reason: null,
        },
        {
          product: 'Beetroot',
          pack: '300g',
          printed: 13,
          handwritten: 13,
          ticked: false,
          uncertain: true, // Marked uncertain to demonstrate human verification highlight
          accepted: 13,
          reason: null,
        },
        {
          product: 'Round Bottle Gourd',
          pack: '1 unit',
          printed: 62,
          handwritten: 48,
          ticked: false,
          uncertain: false,
          accepted: 48,
          reason: 'size', // 14 packs rejected for size
        },
      ],
    };

    return NextResponse.json(fallbackResponse);
  } catch (error) {
    console.error('Photo reading error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read photo' },
      { status: 500 },
    );
  }
}
