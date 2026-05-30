import { NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { parsePortalSession } from '@/lib/portal-session';
import { uploadBrokerAsset } from '@/lib/broker-hub';
import { db, PROPERTIES_COLLECTION } from '@/lib/firestore';
import { updateDoc, doc, getDoc, FieldValue } from 'firebase/firestore'; 
import {
  salesforceLogin,
  createOrUpdateAscendixAccount,
  createOrUpdateAscendixContact,
  salesforcePatch,
} from '@/lib/ascendix-sync';

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies(); 
    const headerStore = await headers(); 
    const session = parsePortalSession(cookieStore.get('admin_session')?.value);
    const host = (headerStore.get('x-forwarded-host') || headerStore.get('host') || '').toLowerCase();
    const isBrokerHost = host === 'broker.piercommercial.com' || host === 'www.broker.piercommercial.com';
    const actor = session ?? (isBrokerHost
      ? {
          email: 'broker-hub@pier.internal',
          role: 'junior_broker',
          name: 'Broker Hub',
        }
      : null);

    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const listingAgreementFile = formData.get('listingAgreement') as File | null;
    const slug = formData.get('slug') as string;

    if (!listingAgreementFile || listingAgreementFile.size === 0) {
      return NextResponse.json({ error: 'No listing agreement file provided.' }, { status: 400 });
    }

    if (!listingAgreementFile.type.includes('pdf')) {
      return NextResponse.json({ error: 'Only PDF files are accepted for listing agreements.' }, { status: 400 });
    }

    if (!slug) {
        return NextResponse.json({ error: 'Listing slug is required to attach the agreement.' }, { status: 400 });
    }

    const listingRef = db.collection(PROPERTIES_COLLECTION).doc(slug);
    const listingSnapshot = await listingRef.get();
    if (!listingSnapshot.exists) {
        return NextResponse.json({ error: `Listing with slug ${slug} not found.` }, { status: 404 });
    }

    const uploadedAsset = await uploadBrokerAsset('listing-agreement', slug, listingAgreementFile, 0);

    await listingRef.set(
      {
        media: {
          documents: [
            ...(listingSnapshot.data()?.media?.documents || []), 
            {
              id: uploadedAsset.id,
              title: 'Listing Agreement',
              description: `Uploaded by ${actor.name} (${actor.email})`,
              documentType: 'listing-agreement',
              url: uploadedAsset.url,
              filename: uploadedAsset.filename,
              contentType: uploadedAsset.contentType,
              uploadedAt: new Date().toISOString(),
            },
          ],
        },
        meta: {
          updatedAt: new Date().toISOString(),
          listingAgreement: {
            status: 'uploaded',
            url: uploadedAsset.url,
            filename: uploadedAsset.filename,
            uploadedBy: actor.email,
            uploadedAt: new Date().toISOString(),
            processedStatus: 'pending', 
          },
        },
      },
      { merge: true }
    );

    const pdfBuffer = Buffer.from(await listingAgreementFile.arrayBuffer());
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: pdfBuffer });
    const data = await parser.getText();
    await parser.destroy();
    const extractedText = data.text;

    console.log(`[parse-pdf] Extracted text from PDF for ${slug}:`, extractedText.substring(0, 500) + '...'); 

    await listingRef.set(
        {
            meta: {
                listingAgreement: {
                    processedStatus: 'text_extracted',
                    extractedTextPreview: extractedText.substring(0, Math.min(extractedText.length, 1000)) + (extractedText.length > 1000 ? '...' : ''), 
                },
            },
        },
        { merge: true }
    );

    let llmResponse: {
      ownerEntityName: string;
      ownerContactName: string;
      ownerEmail: string;
      ownerPhone: string;
      leadBrokerName: string;
    } | null = null;

    try {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not set in environment variables.');
      }

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini", 
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Extract property ownership details, contact information, and lead broker name from the provided text. Return a strict JSON object with the fields: ownerEntityName (string), ownerContactName (string), ownerEmail (string), ownerPhone (string), and leadBrokerName (string). If a field is not found, return an empty string for that field. Prioritize direct mentions."
          },
          {
            role: "user",
            content: `Extract information from this listing agreement text:\n\n${extractedText}`
          }
        ],
        temperature: 0.1,
      });

      const parsedContent = completion.choices[0]?.message?.content;
      if (parsedContent) {
        llmResponse = JSON.parse(parsedContent);
        console.log('[parse-pdf] OpenAI extracted data:', llmResponse);
      } else {
        console.warn('[parse-pdf] OpenAI returned no content for extraction.');
        llmResponse = {
            ownerEntityName: '',
            ownerContactName: '',
            ownerEmail: '',
            ownerPhone: '',
            leadBrokerName: '',
        };
      }
    } catch (openaiError) {
      console.error('[parse-pdf] OpenAI extraction failed:', openaiError);
      llmResponse = {
          ownerEntityName: '',
          ownerContactName: '',
          ownerEmail: '',
          ownerPhone: '',
          leadBrokerName: '',
      };
      await listingRef.set(
        {
          meta: {
            listingAgreement: {
              processedStatus: 'openai_failed',
              errorMessage: `OpenAI extraction failed: ${openaiError instanceof Error ? openaiError.message : String(openaiError)}`,
            },
          },
        },
        { merge: true }
      );
    }

    if (llmResponse && listingSnapshot.data()) {
      const auth = await salesforceLogin();
      const currentListingData = listingSnapshot.data() as Record<string, any>;
      const dealId = currentListingData.sourceIds?.ascendixDealId;
      const propertyId = currentListingData.sourceIds?.ascendixPropertyId;

      let resolvedAccountId: string | null = null;
      let resolvedContactId: string | null = null;

      if (llmResponse.ownerEntityName) {
        resolvedAccountId = await createOrUpdateAscendixAccount(auth, llmResponse.ownerEntityName);
      }

      if (llmResponse.ownerContactName) {
        resolvedContactId = await createOrUpdateAscendixContact(
          auth,
          llmResponse.ownerContactName,
          llmResponse.ownerEmail,
          llmResponse.ownerPhone,
          resolvedAccountId 
        );
      }

      if (dealId) {
        const dealUpdatePayload = {
          ascendix__PropertyOwner__c: resolvedAccountId || undefined, 
          ascendix__PrimaryContact__c: resolvedContactId || undefined, 
        };
        await salesforcePatch(auth, 'ascendix__Deal__c', dealId, dealUpdatePayload);
        console.log(`[parse-pdf] Updated Ascendix Deal ${dealId} with owner/contact info.`);
      } else {
        console.warn(`[parse-pdf] No Ascendix Deal ID found for slug ${slug}. Skipping deal update.`);
      }

      await listingRef.set(
        {
          meta: {
            updatedAt: new Date().toISOString(),
            listingAgreement: {
              processedStatus: 'completed',
              extractedData: llmResponse,
              ascendixAccount: resolvedAccountId,
              ascendixContact: resolvedContactId,
            },
          },
        },
        { merge: true }
      );
    } else if (llmResponse) {
        console.warn('[parse-pdf] LLM response available, but no listing data for Ascendix injection.');
        await listingRef.set(
            {
              meta: {
                listingAgreement: {
                  processedStatus: 'completed_no_ascendix_link',
                  extractedData: llmResponse,
                },
              },
            },
            { merge: true }
          );
    }

    return NextResponse.json({
      ok: true,
      message: 'Listing agreement uploaded, text extracted, AI parsed, and Ascendix updated.',
      slug,
      uploadedAsset,
      extractedTextLength: extractedText.length,
      extractedData: llmResponse,
    });
  } catch (error) {
    console.error('[broker/parse-pdf] error', error);
    const message = error instanceof Error ? error.message : 'Failed to process listing agreement.';

    const formDataCatch = await request.formData(); 
    const slugFromForm = formDataCatch.get('slug') as string | null;

    if (slugFromForm) {
      const s = slugFromForm; 
      if (s) {
        const ref = db.collection(PROPERTIES_COLLECTION).doc(s);
        await ref.set(
          {
            meta: {
              updatedAt: new Date().toISOString(),
              listingAgreement: {
                processedStatus: 'failed',
                errorMessage: message,
              },
            },
          },
          { merge: true }
        ).catch(e => console.error('Failed to update Firestore with error status:', e));
      }
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
