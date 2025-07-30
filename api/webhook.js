// api/shopify-webhook.js
import crypto from 'crypto';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const CUSTOM_CARD_VARIANT_ID = '46650379796721';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  // Check for Shopify domain in headers
  const isValidShopifyDomain = req.headers['x-shopify-shop-domain'] === process.env.SHOPIFY_SHOP_DOMAIN;
  if (!isValidShopifyDomain) {
    console.error('Invalid Shopify domain');
    return res.status(403).json({ error: 'Forbidden' });
  }

/*
  // Verify webhook authenticity
  const hmac = req.headers['x-shopify-hmac-sha256'];
  const body = JSON.stringify(req.body);
  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(body, 'utf8')
    .digest('base64');

  if (hash !== hmac) {
    console.error('Webhook verification failed');
    return res.status(401).json({ error: 'Unauthorized' });
  }
*/
  try {
    const order = req.body;
    
    // Check if order contains custom cards
    const customCardItems = order.line_items.filter(item => 
      item.variant_id.toString() === CUSTOM_CARD_VARIANT_ID
    );

    if (customCardItems.length === 0) {
      console.log(`Order ${order.order_number} contains no custom cards, skipping email`);
      return res.status(200).json({ message: 'No custom cards in order' });
    }

    // Extract download links from line item properties
    const downloadLinks = customCardItems
      .map(item => {
        const designUrlProperty = item.properties?.find(prop => 
          prop.name === 'Design URL'
        );
        return {
          quantity: item.quantity,
          title: item.title,
          downloadUrl: designUrlProperty?.value
        };
      })
      .filter(item => item.downloadUrl); // Only include items with download URLs

    if (downloadLinks.length === 0) {
      console.log(`Order ${order.order_number} has custom cards but no design URLs`);
      return res.status(200).json({ message: 'No design URLs found' });
    }

    // Send email with download links
    await sendCustomCardEmail(order, downloadLinks);
    
    console.log(`Successfully sent custom card email for order ${order.order_number}`);
    return res.status(200).json({ message: 'Email sent successfully' });

  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(500).json({ error: 'Internal server error' });
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
        <p style="color: rgb(101, 116, 74); font-weight: bold;">support@yourdomain.com</p>
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

Need help? Contact us at support@yourdomain.com

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