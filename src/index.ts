import app from './app.js';
import { env } from './config/env.js';
import { bootstrapAdmin } from './utils/bootstrapAdmin.js';
import prisma from './config/db.js';
import { syncCallsForAgent, autoSyncAgent } from './controllers/agent.controller.js';
import { startScheduler } from './services/scheduler.service.js';

const PORT = env.PORT;

app.listen(PORT, async () => {
  console.log(`🚀 Talkativ API running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${env.NODE_ENV}`);
  await bootstrapAdmin();
  // Auto-sync call logs from ElevenLabs for all configured agents on startup
  syncAllAgentCalls().catch(err => console.error('[Startup] Call sync failed:', err));
  // Push latest system prompt + tools to all ElevenLabs agents on every deploy
  syncAllAgentPrompts().catch(err => console.error('[Startup] Prompt sync failed:', err));
  // Start background scheduler (reservation reminders etc.)
  startScheduler();
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

// Push latest system prompt + tools to every configured ElevenLabs agent.
// Runs sequentially with a 1.5s gap to avoid spiking the ElevenLabs API.
async function syncAllAgentPrompts() {
  try {
    const agents = await prisma.agent.findMany({
      where: { elevenlabsAgentId: { not: null } },
      select: { businessId: true, elevenlabsAgentId: true },
    });
    console.log(`[Startup] Syncing prompts for ${agents.length} agent(s)...`);
    for (const agent of agents) {
      try {
        await autoSyncAgent(agent.businessId);
        console.log(`[Startup] Prompt synced for business ${agent.businessId}`);
      } catch (err: any) {
        console.error(`[Startup] Prompt sync failed for business ${agent.businessId}:`, err.message);
      }
      // Small delay between each to avoid ElevenLabs rate limits
      await new Promise(r => setTimeout(r, 1500));
    }
    console.log('[Startup] All agent prompts synced.');
  } catch (err) {
    console.error('[Startup] syncAllAgentPrompts error:', err);
  }
}
