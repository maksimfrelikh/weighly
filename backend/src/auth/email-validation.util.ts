export type EmailValidationResult = { valid: true } | { valid: false; reason: string };

const MAX_TOTAL_LENGTH = 254;
const MAX_LOCAL_LENGTH = 64;
const MAX_LABEL_LENGTH = 63;
const DOMAIN_LABEL_PATTERN = /^[A-Za-z0-9-]+$/;

export function validateInviteEmail(email: unknown): EmailValidationResult {
  if (typeof email !== 'string') {
    return { valid: false, reason: 'Email must be a string' };
  }

  const trimmed = email.trim();
  if (trimmed.length === 0) {
    return { valid: false, reason: 'Email is required' };
  }
  if (trimmed.length > MAX_TOTAL_LENGTH) {
    return { valid: false, reason: 'Email must be at most 254 characters' };
  }

  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    return { valid: false, reason: 'Email must contain a local part and a domain' };
  }

  const localPart = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);

  if (localPart.length > MAX_LOCAL_LENGTH) {
    return { valid: false, reason: 'Local part must be at most 64 characters' };
  }

  for (let i = 0; i < localPart.length; i += 1) {
    const char = localPart[i];
    const code = localPart.charCodeAt(i);
    if (code < 0x20 || code === 0x7f || char === '<' || char === '>') {
      return { valid: false, reason: 'Local part contains invalid characters' };
    }
  }

  if (!domain.includes('.')) {
    return { valid: false, reason: 'Domain must contain a dot' };
  }
  if (domain.startsWith('.') || domain.endsWith('.')) {
    return { valid: false, reason: 'Domain must not start or end with a dot' };
  }
  if (domain.includes('..')) {
    return { valid: false, reason: 'Domain must not contain consecutive dots' };
  }

  const labels = domain.split('.');
  for (const label of labels) {
    if (label.length === 0 || label.length > MAX_LABEL_LENGTH) {
      return { valid: false, reason: 'Domain label must be 1-63 characters' };
    }
    if (!DOMAIN_LABEL_PATTERN.test(label)) {
      return { valid: false, reason: 'Domain label contains invalid characters' };
    }
    if (label.startsWith('-') || label.endsWith('-')) {
      return { valid: false, reason: 'Domain label must not start or end with a hyphen' };
    }
  }

  return { valid: true };
}
