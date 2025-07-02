import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import { Shopify, ApiVersion } from '@shopify/shopify-api';

// Load environment variables
dotenv.config();

const app = express();
const upload = multer();

// 1) Initialize Shopify API context for HMAC verification and Admin REST calls
Shopify.Context.initialize({
  API_KEY:         process.env.SHOPIFY_API_KEY,
  API_SECRET_KEY:  process.env.SHOPIFY_API_SECRET,
  SCOPES:          ['write_files'],
  HOST_NAME:       process.env.HOST.replace(/^https?:\/\//, ''),
  API_VERSION:     ApiVersion.July24,
  IS_EMBEDDED_APP: false,
  SESSION_STORAGE: new Shopify.Session.MemorySessionStorage(),
});

// 2) Middleware: verify HMAC on incoming requests (when not using App Proxy)
function verifyHMAC(req, res, next) {
  const valid = Shopify.Utils.validateHmac(req.query, process.env.SHOPIFY_API_SECRET);
  if (!valid) {
    console.error('HMAC validation failed:', req.query);
    return res.status(401).send('HMAC validation failed');
  }
  next();
}

// 3) Upload endpoint
app.post(
  '/upload',
  verifyHMAC,
  upload.single('pdf'),
  async (req, res) => {
    try {
      // Ensure shop param
      const shop = req.query.shop;
      if (!shop) return res.status(400).json({ error: 'Missing shop parameter' });

      // Ensure file buffer
      const pdfBuffer = req.file?.buffer;
      if (!pdfBuffer) return res.status(400).json({ error: 'No PDF file uploaded' });

      // Convert PDF to Base64
      const base64Attachment = pdfBuffer.toString('base64');

      // Upload to Shopify Files
      const client = new Shopify.Clients.Rest(shop, process.env.SHOPIFY_ADMIN_TOKEN);
      const response = await client.post({
        path: 'files',
        data: {
          file: {
            attachment: base64Attachment,
            filename: `user_design_${Date.now()}.pdf`,
          }
        },
        type: 'application/json',
      });

      // Return the public URL of the uploaded PDF
      const fileUrl = response.body.file.public_url;
      return res.json({ file_url: fileUrl });
    } catch (error) {
      console.error('Upload failed:', error);
      return res.status(500).json({ error: 'Upload failed' });
    }
  }
);

// 4) Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
