// api/webhook.js
// Simple test version - deploy this first to test connectivity

export default async function handler(req, res) {
  const timestamp = new Date().toISOString();
  
  // Log everything for debugging
  console.log('🚀 WEBHOOK RECEIVED AT:', timestamp);
  console.log('Method:', req.method);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body type:', typeof req.body);
  console.log('Body:', JSON.stringify(req.body, null, 2));
  
  // Check for Shopify headers
  const shopifyHeaders = {
    topic: req.headers['x-shopify-topic'],
    shop: req.headers['x-shopify-shop-domain'],
    hmac: req.headers['x-shopify-hmac-sha256'],
  };
  
  console.log('Shopify Headers:', shopifyHeaders);
  
  // If it's a real Shopify webhook, log order details
  if (req.body && req.body.id) {
    console.log('📦 Order Details:');
    console.log('- Order ID:', req.body.id);
    console.log('- Order Number:', req.body.order_number || 'N/A');
    console.log('- Customer Email:', req.body.email || 'N/A');
    console.log('- Total Line Items:', req.body.line_items?.length || 0);
    
    // Check for custom cards
    if (req.body.line_items) {
      const customCards = req.body.line_items.filter(item => 
        item.variant_id?.toString() === '46650379796721'
      );
      console.log('- Custom Cards Found:', customCards.length);
      
      customCards.forEach((item, index) => {
        console.log(`  Card ${index + 1}:`, item.title);
        console.log(`  Variant ID:`, item.variant_id);
        console.log(`  Properties:`, item.properties);
      });
    }
  }
  
  // Always return success to avoid Shopify retries
  return res.status(200).json({ 
    message: '✅ Webhook received and logged successfully',
    timestamp: timestamp,
    shopifyTopic: shopifyHeaders.topic,
    shop: shopifyHeaders.shop,
    hasOrder: !!(req.body && req.body.id)
  });
}

// Export config to ensure proper parsing
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
}