import app from './app.js';
import { env } from './config/env.js';
import { bootstrapAdmin } from './utils/bootstrapAdmin.js';

const PORT = env.PORT;

app.listen(PORT, async () => {
  console.log(`🚀 Talkativ API running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${env.NODE_ENV}`);
  await bootstrapAdmin();
});
