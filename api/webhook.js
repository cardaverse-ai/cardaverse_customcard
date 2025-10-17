// api/shopify-webhook.js
import crypto from 'crypto';
import { Resend } from 'resend';
import { jsPDF } from "jspdf";
import fetch from "node-fetch";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const resend = new Resend(process.env.RESEND_API_KEY);

const CUSTOM_CARD_VARIANT_ID = '46650379796721';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const order = req.body;
    
    // respond instantly so Shopify stops retrying
    res.status(200).json({ message: 'Webhook received, processing started' });

    // Check if order contains custom cards
    const customCardItems = order.line_items.filter(item => 
      item.variant_id.toString() === CUSTOM_CARD_VARIANT_ID
    );

    // Is product card if not custom card
    const productCardItems = order.line_items.filter(item =>
        item.variant_id.toString() !== CUSTOM_CARD_VARIANT_ID
    );

    // Handle Custom Cards:

    if (customCardItems.length > 0) {
    // Extract download links from line item properties
        const downloadLinks = customCardItems
        .map(item => {
            const designUrlProperty = item.properties?.find(prop => 
            prop.name === '_Design URL'
            );
            return {
                quantity: item.quantity,
                title: item.title,
                downloadUrl: designUrlProperty?.value
            };
        })
        .filter(item => item.downloadUrl); // Only include items with download URLs

        if (downloadLinks.length > 0) {
            await sendCustomCardEmail(order, downloadLinks);
            console.log(`Sent custom card email for order ${order.order_number}`);
        } else {
            console.log(`order ${order.order_number} has cusotm cards but no design URLS`)
        }
    }

    if (productCardItems.length > 0) {
        for (const item of productCardItems) {
            const props = item.properties || [];

            const message = props.find(p => p.name === 'Custom Message')?.value || '';
            const font = props.find(p => p.name === 'Font')?.value || 'helvetica';
            const color = props.find(p => p.name === 'Color')?.value || '#000000';
            const size = props.find(p => p.name === 'Size')?.value || '20px';
            const productImgURL = props.find(p => p.name === '_Product Image')?.value;
            const templateImgURL = props.find(p => p.name === '_Template Image')?.value;
            const insideTemplateURL = props.find(p => p.name === '_Inside Template')?.value;

            if (productImgURL && templateImgURL && insideTemplateURL) {
            console.log(`Generating PDF for product: ${item.title}`);

            const pdfUrl = await generateCardPDF({
                message,
                font,
                color,
                size,
                productImgURL,
                templateImgURL,
                insideTemplateURL
            });

            console.log('Generated and uploaded PDF:', pdfUrl);

            // Attach this URL to email
            await sendProductCardEmail(order, [
                {
                quantity: item.quantity,
                title: item.title,
                downloadUrl: pdfUrl
                }
            ]);
            } else {
                if (!productImgURL) console.log('Missing product image');
                if (!templateImgURL) console.log('Missing template image');
                if (!insideTemplateURL) console.log('Missing inside template');
                console.log(`Missing image URLs for ${item.title}`);
            }
        }
    }

  } catch (error) {
    console.error('Webhook processing error:', error);
  }
}

async function sendCustomCardEmail(order, downloadLinks) {
  const customerEmail = order.email;
  const customerName = order.billing_address?.first_name || 'Customer';
  const orderNumber = order.order_number;

  // Generate HTML for download links
  const downloadLinksHtml = downloadLinks.map(item => `
    <div style="margin-bottom: 20px; padding: 15px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h3 style="margin: 0 0 10px 0; color: #333;">${item.title}</h3>
      <p style="margin: 0 0 10px 0; color: #666;">Quantity: ${item.quantity}</p>
      <a href="${item.downloadUrl}" 
         style="display: inline-block; padding: 10px 20px; background-color: rgb(101, 116, 74); 
                color: white; text-decoration: none; border-radius: 5px; font-weight: bold;"
         target="_blank">
        Download Your Custom Card
      </a>
    </div>
  `).join('');

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: rgb(101, 116, 74); margin-bottom: 10px;">Your Custom Cards Are Ready!</h1>
        <p style="color: #666; font-size: 16px;">Order #${orderNumber}</p>
      </div>
      
      <div style="margin-bottom: 30px;">
        <p style="font-size: 16px; line-height: 1.6;">Hi ${customerName},</p>
        <p style="font-size: 16px; line-height: 1.6;">
          Thank you for your order! Your custom cards have been processed and are ready for download.
          Please use the links below to download your personalized cards.
        </p>
      </div>

      <div style="margin-bottom: 30px;">
        <h2 style="color: #333; margin-bottom: 20px;">Your Downloads:</h2>
        ${downloadLinksHtml}
      </div>

      <div style="margin-bottom: 30px; padding: 20px; background-color: #f9f9f9; border-radius: 8px;">
        <h3 style="color: #333; margin-bottom: 10px;">Important Notes:</h3>
        <ul style="color: #666; line-height: 1.6;">
          <li>Download links are valid for 30 days from the order date</li>
          <li>Files are high-resolution PDFs ready for printing</li>
          <li>If you have any issues downloading, please contact our support team</li>
        </ul>
      </div>

      <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
        <p style="color: #666; margin-bottom: 10px;">Need help? Contact us:</p>
        <p style="color: rgb(101, 116, 74); font-weight: bold;">tony@cardaverse.ai</p>
      </div>
    </div>
  `;

  const textContent = `
Hi ${customerName},

Thank you for your order #${orderNumber}! Your custom cards have been processed and are ready for download.

Your Download Links:
${downloadLinks.map(item => `
${item.title} (Quantity: ${item.quantity})
Download: ${item.downloadUrl}
`).join('\n')}

Important Notes:
- Download links are valid for 30 days from the order date
- Files are high-resolution PDFs ready for printing
- If you have any issues downloading, please contact our support team

Need help? Contact us at tony@cardaverse.ai

Best regards,
Your Team
  `;

  await resend.emails.send({
    from: 'orders@update.cardaverse.ai',
    to: customerEmail,
    subject: `Your Custom Cards Are Ready - Order #${orderNumber}`,
    html: htmlContent,
    text: textContent,
  });
}

async function sendProductCardEmail(order, downloadLinks) {
  const customerEmail = order.email;
  const customerName = order.billing_address?.first_name || 'Customer';
  const orderNumber = order.order_number;

  const productDownloadLinksHtml = downloadLinks.map(item => `
    <div style="margin-bottom: 20px; padding: 15px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h3 style="margin: 0 0 10px 0; color: #333;">${item.title}</h3>
      <p style="margin: 0 0 10px 0; color: #666;">Quantity: ${item.quantity}</p>
      <a href="${item.downloadUrl}" 
         style="display: inline-block; padding: 10px 20px; background-color: rgb(101, 116, 74); 
                color: white; text-decoration: none; border-radius: 5px; font-weight: bold;"
         target="_blank">
        Download Your Card
      </a>
    </div>
  `).join('');

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: rgb(101, 116, 74); margin-bottom: 10px;">Your Cards Are Ready!</h1>
        <p style="color: #666; font-size: 16px;">Order #${orderNumber}</p>
      </div>
      <div style="margin-bottom: 30px;">
        <p style="font-size: 16px; line-height: 1.6;">Hi ${customerName},</p>
        <p style="font-size: 16px; line-height: 1.6;">
          Thank you for your order! Your cards have been processed and are ready for download.
        </p>
      </div>
      <div style="margin-bottom: 30px;">
        <h2 style="color: #333; margin-bottom: 20px;">Your Downloads:</h2>
        ${productDownloadLinksHtml}
      </div>
    </div>
  `;

  const textContent = `
Hi ${customerName},

Thank you for your order #${orderNumber}! Your cards have been processed and are ready for download.

Your Download Links:
${downloadLinks.map(item => `
${item.title} (Quantity: ${item.quantity})
Download: ${item.downloadUrl}
`).join('\n')}
  `;

  await resend.emails.send({
    from: 'orders@update.cardaverse.ai',
    to: customerEmail,
    subject: `Your Cards Are Ready - Order #${orderNumber}`,
    html: htmlContent,
    text: textContent,
  });
  
}

// function to generate pdf
async function generateCardPDF({ message, font, color, size, productImgURL, templateImgURL, insideTemplateURL }) {
  const pdf = new jsPDF({ unit: 'in', format: 'letter', compress: true });

  // fetch image as Buffer
  async function fetchImage(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch image: ${url}`);
    const buffer = await res.arrayBuffer();
    return Buffer.from(buffer);
  }

  // verify PNG signature
  function isPng(buffer) {
    const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    return buffer.slice(0, 8).equals(pngSignature);
  }

  const [templateImg, productImg, insideImg] = await Promise.all([
    fetchImage(templateImgURL),
    fetchImage(productImgURL),
    fetchImage(insideTemplateURL),
  ]);

  if (!isPng(templateImg)) throw new Error('Template image is not a valid PNG');
  if (!isPng(productImg)) throw new Error('Product image is not a valid PNG');
  if (!isPng(insideImg)) throw new Error('Inside template image is not a valid PNG');

  // page 1
  pdf.addImage(templateImg.toString('base64'), 'PNG', 0, 0, 8.5, 11);
  pdf.addImage(productImg.toString('base64'), 'PNG', 0.24, -3.75, 4, 4, null, null, 270);

  // page 2
  pdf.addPage();
  pdf.addImage(insideImg.toString('base64'), 'PNG', 0, 0, 8.5, 11);
  pdf.setFontSize(parseInt(size.replace('px', '')));
  pdf.setTextColor(color);
  pdf.setFont(font);
  pdf.text(message, 3.64, 0.47, { maxWidth: 3.6, angle: 270 });

  const pdfBlob = pdf.output('arraybuffer');

  // upload to Cloudinary
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: 'raw', folder: 'digital_cards', format: 'pdf' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    uploadStream.end(Buffer.from(pdfBlob));
  });
}
