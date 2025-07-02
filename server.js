// server.js
import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import { Shopify, ApiVersion } from '@shopify/shopify-api';

dotenv.config();
const app = express();
const upload = multer();

// 1) Init Shopify API client
Shopify.Context.initialize({
  API_KEY:         process.env.SHOPIFY_API_KEY,
  API_SECRET_KEY:  process.env.SHOPIFY_API_SECRET,
  SCOPES:          ['write_files'],
  HOST_NAME:       process.env.HOST.replace(/^https?:\/\//, ''),
  API_VERSION:     ApiVersion.July24,
  IS_EMBEDDED_APP: false,
  SESSION_STORAGE: new Shopify.Session.MemorySessionStorage(),
});

// 2) (Optional) verify HMAC if you’re NOT using an App Proxy
//    — skip this if you’ve configured an App Proxy in Shopify to `/apps/card-designer`
function verifyHMAC(req, res, next) {
  // parse req.query.signature & timestamp…
  // use Shopify.Utils.validateHmac(req.query, process.env.SHOPIFY_API_SECRET)
  next();
}

// 3) The upload endpoint
app.post(
  '/upload',
  /* verifyHMAC, */     // uncomment if no App Proxy
  upload.single('pdf'),
  async (req, res) => {
    try {
      const shop = req.query.shop;                // if via App Proxy, Shopify injects `?shop=…`
      const pdfBuffer = req.file.buffer;          // the incoming PDF blob
      const base64Attachment = pdfBuffer.toString('base64');

      // call Shopify Admin Files API
      const client = new Shopify.Clients.Rest(
        shop,
        process.env.SHOPIFY_ADMIN_TOKEN
      );
      const response = await client.post({
        path: 'files',
        data: {
          file: {
            attachment: base64Attachment,
            filename: `user_design_${Date.now()}.pdf`,
            // public_url: true   // if you want a public URL immediately
          }
        },
        type: 'application/json',
      });

      const fileUrl = response.body.file.public_url;
      return res.json({ file_url: fileUrl });
    } catch (error) {
      console.error('Upload failed:', error);
      return res.status(500).json({ error: 'Upload failed' });
    }
  }
);

// 4) Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
