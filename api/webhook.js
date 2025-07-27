import crypto from 'crypto';
import { Resend } from 'resend';

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// Webhook endpoint for order fulfillment
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  try {
    // Verify webhook authenticity
    const hmac = req.headers['x-shopify-hmac-sha256'];
    const body = JSON.stringify(req.body);
    const hash = crypto
      .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET)
      .update(body, 'utf8')
      .digest('base64');

    if (hash !== hmac) {
      console.log('Webhook verification failed');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const order = req.body;
    console.log('Processing order:', order.id);

    // Find line items with custom card designs
    const customCardItems = order.line_items.filter(item => 
      item.properties && 
      item.properties.some(prop => prop.name === 'Design URL')
    );

    if (customCardItems.length === 0) {
      console.log('No custom card items found in order');
      return res.status(200).json({ message: 'No custom cards to process' });
    }

    // Extract download URLs and prepare email content
    const downloadLinks = customCardItems.map(item => {
      const designUrlProperty = item.properties.find(prop => prop.name === 'Design URL');
      return {
        title: item.title,
        downloadUrl: designUrlProperty.value,
        quantity: item.quantity
      };
    });

    // Send email with download links
    await sendDownloadEmail(order, downloadLinks);

    res.status(200).json({ message: 'Email sent successfully' });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function sendDownloadEmail(order, downloadLinks) {
  const customerEmail = order.email;
  const customerName = order.billing_address?.first_name || 'Valued Customer';
  
  // Create download links HTML
  const downloadLinksHtml = downloadLinks.map(item => `
    <div style="margin-bottom: 20px; padding: 15px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h3 style="margin: 0 0 10px 0; color: #65744a;">${item.title}</h3>
      <p style="margin: 0 0 10px 0;">Quantity: ${item.quantity}</p>
      <a href="${item.downloadUrl}" 
         style="display: inline-block; padding: 10px 20px; background-color: #65744a; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;"
         download>
        Download Your Card
      </a>
    </div>
  `).join('');

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Your Custom Card Downloads</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #65744a; margin-bottom: 10px;">Thank You for Your Order!</h1>
        <p style="font-size: 18px; margin: 0;">Your custom cards are ready for download</p>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h2 style="color: #65744a;">Hello ${customerName},</h2>
        <p>Thank you for your purchase! Your custom card designs are now ready for download.</p>
        <p><strong>Order Number:</strong> ${order.order_number}</p>
        <p><strong>Order Date:</strong> ${new Date(order.created_at).toLocaleDateString()}</p>
      </div>

      <div style="margin-bottom: 30px;">
        <h2 style="color: #65744a;">Your Downloads:</h2>
        ${downloadLinksHtml}
      </div>

      <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
        <h3 style="color: #65744a; margin-top: 0;">Important Notes:</h3>
        <ul style="margin: 0; padding-left: 20px;">
          <li>Download links are valid for 30 days</li>
          <li>Save your files immediately after download</li>
          <li>For best print quality, use high-resolution settings</li>
          <li>Contact support if you experience any download issues</li>
        </ul>
      </div>

      <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
        <p style="margin: 0 0 10px 0;">Questions? We're here to help!</p>
        <p style="margin: 0;">
          <a href="mailto:support@cardaverse.ai" style="color: #65744a;">support@cardaverse.ai</a>
        </p>
      </div>
    </body>
    </html>
  `;

  // Send email using Resend
  const { data, error } = await resend.emails.send({
    from: 'Cardaverse <orders@mail.cardaverse.ai>', // Replace with your verified domain
    to: [customerEmail],
    subject: `Your Custom Card Downloads - Order #${order.order_number}`,
    html: emailHtml,
  });

  if (error) {
    console.error('Email sending error:', error);
    throw new Error('Failed to send email');
  }

  console.log('Email sent successfully:', data);
}