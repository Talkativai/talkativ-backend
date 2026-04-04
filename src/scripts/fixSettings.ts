import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src', 'controllers', 'settings.controller.ts');
let content = fs.readFileSync(file, 'utf-8');

// Insert the helper at the top just after imports
const helperCode = `
// ─── Helper ──────────────────────────────────────────────────────────────────
const getBusinessByUserId = async (userId: string) => {
  const biz = await prisma.business.findUnique({ where: { userId } });
  if (!biz) throw ApiError.notFound('Business not found');
  return biz;
};
`;

content = content.replace(/(import crypto from 'crypto';\n)/, `$1\n${helperCode}`);

// Replace the businessId retrieval
const search = `  const businessId = req.user!.businessId;\n  if (!businessId) throw ApiError.notFound('Business not found');`;
const replacement = `  const biz = await getBusinessByUserId(req.user!.userId);\n  const businessId = biz.id;`;

content = content.split(search).join(replacement);

fs.writeFileSync(file, content);
console.log('Fixed settings.controller.ts');
