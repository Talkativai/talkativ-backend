import { Request, Response, NextFunction } from 'express';
import sanitizeHtml from 'sanitize-html';

const sanitizeData = (data: any): any => {
  if (typeof data === 'string') {
    return sanitizeHtml(data, {
      allowedTags: [], // Strip all HTML tags
      allowedAttributes: {}, // Strip all attributes
    });
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item));
  }
  if (data !== null && typeof data === 'object') {
    const sanitizedObj: any = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        sanitizedObj[key] = sanitizeData(data[key]);
      }
    }
    return sanitizedObj;
  }
  return data;
};

export const xss = (req: Request, res: Response, next: NextFunction) => {
  if (req.body) req.body = sanitizeData(req.body);
  if (req.query) req.query = sanitizeData(req.query);
  if (req.params) req.params = sanitizeData(req.params);
  next();
};
