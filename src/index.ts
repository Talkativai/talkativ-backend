import app from './app.js';
import { env } from './config/env.js';
import { bootstrapAdmin } from './utils/bootstrapAdmin.js';
import prisma from './config/db.js';
import { syncCallsForAgent } from './controllers/agent.controller.js';

const PORT = env.PORT;

app.listen(PORT, async () => {
  console.log(`🚀 Talkativ API running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${env.NODE_ENV}`);
  await bootstrapAdmin();
  // Auto-sync call logs from ElevenLabs for all configured agents on startup
  syncAllAgentCalls().catch(err => console.error('[Startup] Call sync failed:', err));
});

async function syncAllAgentCalls() {
  try {
    const agents = await prisma.agent.findMany({
      where: { elevenlabsAgentId: { not: null } },
      select: { elevenlabsAgentId: true, businessId: true },
    });
    for (const agent of agents) {
      if (!agent.elevenlabsAgentId) continue;
      const result = await syncCallsForAgent(agent.elevenlabsAgentId, agent.businessId);
      if (result.imported > 0 || result.updated > 0) {
        console.log(`[Startup] Synced calls for agent ${agent.elevenlabsAgentId}: +${result.imported} new, ${result.updated} updated`);
      }
    }
  } catch (err) {
    console.error('[Startup] syncAllAgentCalls error:', err);
  }
}
