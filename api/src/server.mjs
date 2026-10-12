import { Pool } from 'pg';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { v2 as cloudinary } from 'cloudinary';
import { createApp } from './app.mjs';

const required = ['DATABASE_URL','FIREBASE_PROJECT_ID','CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET'];
for (const key of required) if (!process.env[key]) throw new Error(`Variável obrigatória ausente: ${key}`);

initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const media = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  upload(buffer, preset) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ upload_preset: preset, resource_type: 'image' },
        (error, result) => error ? reject(error) : resolve(result));
      stream.end(buffer);
    });
  },
  remove(publicId) { return cloudinary.uploader.destroy(publicId, { resource_type: 'image' }); },
};

const app = createApp({
  db: pool,
  verifyToken: (token) => getAuth().verifyIdToken(token, true),
  media,
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
});
const server = app.listen(Number(process.env.PORT ?? 3001), () => console.log('API Entrelia iniciada'));
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => server.close(() => pool.end()));
