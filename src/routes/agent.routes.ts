import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { updateAgentSchema, updateVoiceSchema, updateScriptSchema, updateCallRulesSchema } from '../validators/agent.validator.js';
import * as agentController from '../controllers/agent.controller.js';

const router = Router();

// Public — no auth required (stateless TTS proxy, no user data involved)
router.post('/preview-voice', agentController.previewVoice);

router.use(authenticate);

router.get('/', agentController.getAgent);
router.put('/', validate(updateAgentSchema), agentController.updateAgent);
router.post('/rebuild-prompt', agentController.rebuildSystemPrompt);
router.get('/transcripts', agentController.getTranscripts);
router.get('/transcripts/:id', agentController.getTranscriptById);
router.post('/test-call', agentController.testCall);
router.get('/signed-url', agentController.getSignedUrl);
router.post('/sync-calls', agentController.syncCalls);
router.put('/voice', validate(updateVoiceSchema), agentController.updateVoice);
router.put('/script', validate(updateScriptSchema), agentController.updateScript);
router.put('/call-rules', validate(updateCallRulesSchema), agentController.updateCallRules);

export default router;
